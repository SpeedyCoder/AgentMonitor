//! ACP (Agent Client Protocol) module for Trantor
//!
//! This module provides ACP-based agent integration, replacing the legacy Codex app-server protocol.
//! It supports both Codex and Claude agents through bundled ACP adapters.

pub mod agent;
pub mod mcp;
pub mod notifications;
pub mod session;

// Re-export key types
pub use session::SessionManager;

use agent_client_protocol_schema::{ContentBlock, ImageContent, TextContent};
use base64::Engine;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::acp::mcp::WorkspaceMcpConfig;
use crate::state::AppState;
use crate::types::AgentRuntime;

/// Start a new ACP session/thread for a workspace
#[tauri::command]
pub async fn acp_start_thread(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    let workspaces = state.workspaces.lock().await;
    let workspace = workspaces
        .get(&workspace_id)
        .ok_or("Workspace not found")?;

    let settings = state.app_settings.lock().await;
    // Default to Codex for now, will be configurable via workspace settings
    let runtime = workspace.settings.agent_runtime.clone().unwrap_or(AgentRuntime::Codex);
    let api_key = match runtime {
        AgentRuntime::Codex => settings.codex_api_key.clone(),
        AgentRuntime::Claude => settings.claude_api_key.clone(),
    };

    let cwd = PathBuf::from(&workspace.path);
    let mcp_config = WorkspaceMcpConfig::default();
    let mcp_servers = mcp_config.to_acp_servers(&cwd);

    let session_id = state
        .acp_sessions
        .create_session(workspace_id.clone(), cwd, runtime, api_key, mcp_servers, app)
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
    _thread_id: String,
    text: String,
    images: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let mut content: Vec<ContentBlock> = vec![ContentBlock::Text(TextContent::new(text))];

    if let Some(imgs) = images {
        for path in imgs {
            let data = std::fs::read(&path)
                .map_err(|e| format!("Failed to read image {}: {}", path, e))?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(data);
            let data_uri = format!("data:image/png;base64,{}", b64);
            content.push(ContentBlock::Image(ImageContent::new(data_uri, "image/png")));
        }
    }

    state.acp_sessions.send_prompt(&workspace_id, content).await?;

    Ok(json!({}))
}

/// Interrupt/cancel a running turn in an ACP session
#[tauri::command]
pub async fn acp_turn_interrupt(
    workspace_id: String,
    _thread_id: String,
    _turn_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    state.acp_sessions.cancel(&workspace_id).await?;
    Ok(json!({}))
}

/// List threads/sessions for a workspace
#[tauri::command]
pub async fn acp_list_threads(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let session_id = state.acp_sessions.get_session_id(&workspace_id).await;

    let threads = session_id
        .map(|s| vec![json!({
            "id": s.to_string(),
            "name": "Session",
            "updatedAt": 0
        })])
        .unwrap_or_default();

    Ok(json!({ "data": threads }))
}

/// Steer a turn (prefix with steering text)
#[tauri::command]
pub async fn acp_turn_steer(
    workspace_id: String,
    _thread_id: String,
    _turn_id: String,
    text: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    // For ACP, steering is done by sending a special message
    // This is a simplified implementation - actual steering depends on ACP adapter support
    let content = vec![ContentBlock::Text(TextContent::new(format!("[STEERING] {}", text)))];

    state.acp_sessions.send_prompt(&workspace_id, content).await?;

    Ok(json!({}))
}

/// Set thread name (session title)
#[tauri::command]
pub async fn acp_set_thread_name(
    workspace_id: String,
    _thread_id: String,
    _name: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    // ACP sessions can have titles updated via session info
    // This is a placeholder - actual implementation depends on ACP adapter support
    let _session_id = state.acp_sessions.get_session_id(&workspace_id).await;
    // TODO: Send session info update when ACP supports it
    Ok(json!({}))
}

/// Archive a thread/session
#[tauri::command]
pub async fn acp_archive_thread(
    workspace_id: String,
    _thread_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    // For now, just remove the session
    state.acp_sessions.remove_session(&workspace_id).await;
    Ok(json!({}))
}

/// Compact a thread/session (cleanup resources)
#[tauri::command]
pub async fn acp_compact_thread(
    workspace_id: String,
    _thread_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    // For now, just remove the session to free resources
    state.acp_sessions.remove_session(&workspace_id).await;
    Ok(json!({}))
}
