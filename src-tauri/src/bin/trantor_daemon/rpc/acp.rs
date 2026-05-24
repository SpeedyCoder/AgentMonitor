use super::*;
use agent_client_protocol_schema::{ContentBlock, McpServer, TextContent};
use std::path::PathBuf;
use std::sync::Arc;

use crate::backend::events::AppServerEvent;
use crate::shared::acp_core::{content_from_text_and_images, AcpAppEvent, WorkspaceMcpConfig};
use crate::types::AgentRuntime;

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "session/new" | "acp_start_thread" => Some(handle_session_new(state, params).await),
        "session/prompt" => Some(handle_session_prompt(state, params).await),
        "acp_send_user_message" => Some(handle_send_user_message(state, params).await),
        "session/cancel" | "acp_turn_interrupt" => Some(handle_session_cancel(state, params).await),
        "acp_turn_steer" => Some(handle_turn_steer(state, params).await),
        "acp_list_threads" => Some(handle_list_threads(state, params).await),
        "acp_resume_thread" | "acp_read_thread" => Some(handle_read_thread(state, params).await),
        "acp_thread_live_subscribe" => Some(handle_live_subscribe(state, params).await),
        "acp_thread_live_unsubscribe" => Some(handle_live_unsubscribe(state, params).await),
        "acp_set_thread_name" => Some(handle_set_thread_name(state, params).await),
        "acp_archive_thread" => Some(handle_archive_thread(state, params).await),
        "acp_compact_thread" => Some(handle_compact_thread(state, params).await),
        "acp_fork_thread" => Some(Err("Forking ACP sessions is not supported".to_string())),
        _ => None,
    }
}

async fn handle_session_new(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let workspace = workspace_entry(state, &workspace_id).await?;
    let cwd = parse_optional_string(params, "cwd").unwrap_or_else(|| workspace.path.clone());
    let runtime = runtime_for_session(params, &workspace);
    let api_key = match parse_optional_string(params, "apiKey") {
        Some(api_key) => Some(api_key),
        None => runtime_api_key(state, &runtime).await,
    };
    let mcp_servers = parse_mcp_servers(params).unwrap_or_else(|| {
        WorkspaceMcpConfig::default().to_acp_servers(PathBuf::from(&cwd).as_path())
    });

    let event_sink = state.event_sink.clone();
    let emit_event = Arc::new(move |event: AcpAppEvent| {
        event_sink.emit_app_server_event(AppServerEvent {
            workspace_id: event.workspace_id,
            message: event.message,
        });
    });

    let session_id = state
        .acp_sessions
        .create_session(
            workspace_id,
            PathBuf::from(cwd),
            runtime,
            api_key,
            mcp_servers,
            emit_event,
        )
        .await?;

    Ok(json!({
        "threadId": session_id.to_string(),
        "sessionId": session_id.to_string()
    }))
}

async fn handle_session_prompt(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_optional_string(params, "threadId");
    let content = parse_content(params)?;
    state
        .acp_sessions
        .send_prompt(&workspace_id, thread_id.as_deref(), content)
        .await?;
    Ok(json!({}))
}

async fn handle_send_user_message(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    let text = parse_string(params, "text")?;
    let content = content_from_text_and_images(text, parse_images(params)?)?;
    state
        .acp_sessions
        .send_prompt(&workspace_id, Some(&thread_id), content)
        .await?;
    Ok(json!({}))
}

async fn handle_turn_steer(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    let text = parse_string(params, "text")?;
    let content = vec![ContentBlock::Text(TextContent::new(format!(
        "[STEERING] {text}"
    )))];
    state
        .acp_sessions
        .send_prompt(&workspace_id, Some(&thread_id), content)
        .await?;
    Ok(json!({}))
}

async fn handle_session_cancel(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_optional_string(params, "threadId");
    state
        .acp_sessions
        .cancel(&workspace_id, thread_id.as_deref())
        .await?;
    Ok(json!({}))
}

async fn handle_list_threads(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let threads: Vec<Value> = state
        .acp_sessions
        .list_thread_summaries(&workspace_id)
        .await
        .into_iter()
        .map(|summary| summary.to_list_item(&workspace_id))
        .collect();
    Ok(json!({
        "data": threads,
        "nextCursor": Value::Null,
        "next_cursor": Value::Null,
    }))
}

async fn handle_read_thread(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    let summary = state
        .acp_sessions
        .get_thread_summary(&workspace_id, &thread_id)
        .await
        .ok_or("ACP thread not found")?;
    Ok(json!({ "thread": summary.to_thread_payload() }))
}

async fn handle_live_subscribe(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    state
        .acp_sessions
        .ensure_active_thread(&workspace_id, &thread_id)
        .await?;
    let subscription_id = format!("{workspace_id}:{thread_id}");
    state.event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.clone(),
        message: json!({
            "method": "thread/live_attached",
            "params": {
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "subscriptionId": subscription_id,
            }
        }),
    });
    Ok(json!({ "subscriptionId": subscription_id, "state": "live" }))
}

async fn handle_live_unsubscribe(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    state.event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.clone(),
        message: json!({
            "method": "thread/live_detached",
            "params": {
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "reason": "manual",
            }
        }),
    });
    Ok(json!({ "ok": true }))
}

async fn handle_set_thread_name(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    let name = parse_string(params, "name")?;
    state
        .acp_sessions
        .rename_thread(&workspace_id, &thread_id, name)
        .await?;
    Ok(json!({}))
}

async fn handle_archive_thread(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    state
        .acp_sessions
        .archive_thread(&workspace_id, &thread_id)
        .await?;
    Ok(json!({}))
}

async fn handle_compact_thread(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let workspace_id = parse_string(params, "workspaceId")?;
    let thread_id = parse_string(params, "threadId")?;
    state
        .acp_sessions
        .ensure_active_thread(&workspace_id, &thread_id)
        .await?;
    drop(state.acp_sessions.remove_session(&workspace_id).await);
    Ok(json!({}))
}

fn parse_runtime(params: &Value) -> Option<AgentRuntime> {
    match parse_optional_string(params, "runtime").as_deref() {
        Some("claude") => Some(AgentRuntime::Claude),
        Some("codex") => Some(AgentRuntime::Codex),
        _ => None,
    }
}

fn runtime_for_session(
    params: &Value,
    workspace: &crate::types::WorkspaceEntry,
) -> AgentRuntime {
    parse_runtime(params)
        .or_else(|| workspace.settings.agent_runtime.clone())
        .unwrap_or(AgentRuntime::Codex)
}

fn parse_content(params: &Value) -> Result<Vec<ContentBlock>, String> {
    let value = params
        .get("content")
        .or_else(|| params.get("contentBlocks"))
        .ok_or("missing `content`")?;
    serde_json::from_value(value.clone()).map_err(|e| format!("Failed to parse content: {e}"))
}

fn parse_images(params: &Value) -> Result<Vec<String>, String> {
    match params.get("images") {
        Some(Value::Array(images)) => images
            .iter()
            .map(|image| {
                image
                    .as_str()
                    .map(str::to_string)
                    .ok_or_else(|| "invalid image entry".to_string())
            })
            .collect(),
        _ => Ok(vec![]),
    }
}

fn parse_mcp_servers(params: &Value) -> Option<Vec<McpServer>> {
    params
        .get("mcpServers")
        .and_then(|value| serde_json::from_value(value.clone()).ok())
}

async fn workspace_entry(
    state: &DaemonState,
    workspace_id: &str,
) -> Result<crate::types::WorkspaceEntry, String> {
    let workspaces = state.workspaces.lock().await;
    workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "Workspace not found".to_string())
}

async fn runtime_api_key(state: &DaemonState, runtime: &AgentRuntime) -> Option<String> {
    let settings = state.app_settings.lock().await;
    match runtime {
        AgentRuntime::Codex => settings.codex_api_key.clone(),
        AgentRuntime::Claude => settings.claude_api_key.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{WorkspaceEntry, WorkspaceKind, WorkspaceSettings};

    fn workspace_with_runtime(runtime: Option<AgentRuntime>) -> WorkspaceEntry {
        WorkspaceEntry {
            id: "workspace-1".to_string(),
            name: "Workspace".to_string(),
            path: "/tmp/workspace".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings {
                agent_runtime: runtime,
                ..WorkspaceSettings::default()
            },
        }
    }

    #[test]
    fn session_runtime_uses_workspace_setting_unless_param_overrides() {
        let claude_workspace = workspace_with_runtime(Some(AgentRuntime::Claude));
        assert_eq!(
            runtime_for_session(&json!({ "workspaceId": "workspace-1" }), &claude_workspace),
            AgentRuntime::Claude
        );
        assert_eq!(
            runtime_for_session(
                &json!({ "workspaceId": "workspace-1", "runtime": "codex" }),
                &claude_workspace,
            ),
            AgentRuntime::Codex
        );

        let default_workspace = workspace_with_runtime(None);
        assert_eq!(
            runtime_for_session(&json!({ "workspaceId": "workspace-1" }), &default_workspace),
            AgentRuntime::Codex
        );
    }
}
