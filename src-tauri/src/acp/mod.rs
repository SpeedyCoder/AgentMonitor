use agent_client_protocol_schema::{ContentBlock, TextContent};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tauri::{AppHandle, State};

use crate::remote_backend;
pub(crate) use crate::shared::acp_core::SessionManager;
use crate::shared::acp_core::{content_from_text_and_images, AcpAppEvent, WorkspaceMcpConfig};
use crate::state::AppState;
use crate::types::AgentRuntime;

/// Start a new ACP session/thread for a workspace
#[tauri::command]
pub async fn acp_start_thread(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_start_thread",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    let workspaces = state.workspaces.lock().await;
    let workspace = workspaces.get(&workspace_id).ok_or("Workspace not found")?;

    let settings = state.app_settings.lock().await;
    let runtime = workspace
        .settings
        .agent_runtime
        .clone()
        .unwrap_or(AgentRuntime::Codex);
    let api_key = match runtime {
        AgentRuntime::Codex => settings.codex_api_key.clone(),
        AgentRuntime::Claude => settings.claude_api_key.clone(),
    };

    let cwd = PathBuf::from(&workspace.path);
    let mcp_config = WorkspaceMcpConfig::default();
    let mcp_servers = mcp_config.to_acp_servers(&cwd);
    let emit_app = app.clone();
    let emit_event = Arc::new(move |event: AcpAppEvent| {
        let _ = emit_app.emit(
            "app-server-event",
            json!({
                "workspace_id": event.workspace_id,
                "message": event.message,
            }),
        );
    });

    let session_id = state
        .acp_sessions
        .create_session(
            workspace_id.clone(),
            cwd,
            runtime,
            api_key,
            mcp_servers,
            emit_event,
        )
        .await?;

    // Store the session_id in workspace settings or return it
    Ok(json!({
        "threadId": session_id.to_string(),
        "sessionId": session_id.to_string()
    }))
}

/// Send a user message to an ACP session
#[tauri::command]
pub async fn acp_send_user_message(
    workspace_id: String,
    thread_id: String,
    text: String,
    images: Option<Vec<String>>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_send_user_message",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "text": text,
                "images": images,
            }),
        )
        .await;
    }

    let content = content_from_text_and_images(text, images.unwrap_or_default())?;

    let stream_ids = state
        .acp_sessions
        .send_prompt(&workspace_id, Some(&thread_id), content)
        .await?;

    Ok(json!({ "promptStream": stream_ids }))
}

/// Interrupt/cancel a running turn in an ACP session
#[tauri::command]
pub async fn acp_turn_interrupt(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_turn_interrupt",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "turnId": turn_id }),
        )
        .await;
    }

    state
        .acp_sessions
        .cancel(&workspace_id, Some(&thread_id))
        .await?;
    Ok(json!({}))
}

/// List threads/sessions for a workspace
#[tauri::command]
pub async fn acp_list_threads(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_list_threads",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

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

/// Resume an active ACP session.
#[tauri::command]
pub async fn acp_resume_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_resume_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    let summary = load_thread_for_workspace(&workspace_id, &thread_id, &state, app).await?;
    Ok(json!({ "thread": summary.to_loaded_thread_payload() }))
}

/// Read an active ACP session.
#[tauri::command]
pub async fn acp_read_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_read_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }
    let summary = load_thread_for_workspace(&workspace_id, &thread_id, &state, app).await?;
    Ok(json!({ "thread": summary.to_loaded_thread_payload() }))
}

async fn load_thread_for_workspace(
    workspace_id: &str,
    thread_id: &str,
    state: &State<'_, AppState>,
    app: AppHandle,
) -> Result<crate::shared::acp_core::AcpThreadSummary, String> {
    let summary = state
        .acp_sessions
        .get_thread_summary(workspace_id, thread_id)
        .await
        .ok_or("ACP thread not found")?;

    let workspaces = state.workspaces.lock().await;
    let workspace = workspaces.get(workspace_id).ok_or("Workspace not found")?;
    let settings = state.app_settings.lock().await;
    let runtime = workspace
        .settings
        .agent_runtime
        .clone()
        .unwrap_or(AgentRuntime::Codex);
    let api_key = match runtime {
        AgentRuntime::Codex => settings.codex_api_key.clone(),
        AgentRuntime::Claude => settings.claude_api_key.clone(),
    };
    let cwd = PathBuf::from(&workspace.path);
    drop(settings);
    drop(workspaces);

    let mcp_config = WorkspaceMcpConfig::default();
    let mcp_servers = mcp_config.to_acp_servers(&cwd);
    let emit_app = app.clone();
    let emit_event = Arc::new(move |event: AcpAppEvent| {
        let _ = emit_app.emit(
            "app-server-event",
            json!({
                "workspace_id": event.workspace_id,
                "message": event.message,
            }),
        );
    });

    state
        .acp_sessions
        .load_session(
            workspace_id.to_string(),
            thread_id.to_string(),
            cwd,
            runtime,
            api_key,
            mcp_servers,
            emit_event,
        )
        .await?;

    Ok(summary)
}

/// Mark an ACP session as live-attached for frontend compatibility.
#[tauri::command]
pub async fn acp_thread_live_subscribe(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_thread_live_subscribe",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    state
        .acp_sessions
        .ensure_active_thread(&workspace_id, &thread_id)
        .await?;
    let subscription_id = format!("{workspace_id}:{thread_id}");
    let _ = app.emit(
        "app-server-event",
        json!({
            "workspace_id": workspace_id,
            "message": {
                "method": "thread/live_attached",
                "params": {
                    "threadId": thread_id,
                    "subscriptionId": subscription_id,
                }
            }
        }),
    );
    Ok(json!({
        "subscriptionId": subscription_id,
        "state": "live",
    }))
}

/// Mark an ACP session as live-detached for frontend compatibility.
#[tauri::command]
pub async fn acp_thread_live_unsubscribe(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_thread_live_unsubscribe",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    let _ = app.emit(
        "app-server-event",
        json!({
            "workspace_id": workspace_id,
            "message": {
                "method": "thread/live_detached",
                "params": {
                    "threadId": thread_id,
                    "reason": "manual",
                }
            }
        }),
    );
    Ok(json!({ "ok": true }))
}

/// Steer a turn (prefix with steering text)
#[tauri::command]
pub async fn acp_turn_steer(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    text: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_turn_steer",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "turnId": turn_id,
                "text": text,
            }),
        )
        .await;
    }

    // For ACP, steering is done by sending a special message
    // This is a simplified implementation - actual steering depends on ACP adapter support
    let content = vec![ContentBlock::Text(TextContent::new(format!(
        "[STEERING] {}",
        text
    )))];

    let _stream_ids = state
        .acp_sessions
        .send_prompt(&workspace_id, Some(&thread_id), content)
        .await?;

    Ok(json!({}))
}

/// Set thread name (session title)
#[tauri::command]
pub async fn acp_set_thread_name(
    workspace_id: String,
    thread_id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_set_thread_name",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "name": name }),
        )
        .await;
    }

    state
        .acp_sessions
        .rename_thread(&workspace_id, &thread_id, name)
        .await?;
    Ok(json!({}))
}

/// Archive a thread/session
#[tauri::command]
pub async fn acp_archive_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_archive_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    state
        .acp_sessions
        .archive_thread(&workspace_id, &thread_id)
        .await?;
    Ok(json!({}))
}

/// Compact a thread/session (cleanup resources)
#[tauri::command]
pub async fn acp_compact_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_compact_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    state
        .acp_sessions
        .ensure_active_thread(&workspace_id, &thread_id)
        .await?;
    drop(state.acp_sessions.remove_session(&workspace_id).await);
    Ok(json!({}))
}

/// ACP does not define fork semantics. Keep this explicit instead of falling
/// back to legacy Codex app-server behavior.
#[tauri::command]
pub async fn acp_fork_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "acp_fork_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }
    Err("Forking ACP sessions is not supported".to_string())
}
