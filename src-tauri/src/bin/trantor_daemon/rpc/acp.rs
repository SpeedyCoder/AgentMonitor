//! ACP RPC handlers for the Trantor daemon
//!
//! This module provides ACP-based session management for the daemon mode.

use super::*;
use agent_client_protocol_schema::{ContentBlock, McpServer};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;

use crate::types::AgentRuntime;

/// Daemon ACP session manager (similar to the app's SessionManager but for daemon mode)
pub struct DaemonAcpManager {
    connections: Mutex<HashMap<String, String>>, // Placeholder: workspace_id -> connection_id
    session_ids: Mutex<HashMap<String, String>>,   // Placeholder: workspace_id -> session_id
    agent_runtimes: Mutex<HashMap<String, AgentRuntime>>,
}

impl Default for DaemonAcpManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DaemonAcpManager {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            session_ids: Mutex::new(HashMap::new()),
            agent_runtimes: Mutex::new(HashMap::new()),
        }
    }

    pub async fn create_session(
        &self,
        workspace_id: String,
        cwd: String,
        runtime: AgentRuntime,
        api_key: Option<String>,
        mcp_servers: Vec<McpServer>,
    ) -> Result<Value, String> {
        // This is a placeholder - actual implementation would use the acp module's AgentConfig
        // For now, return a mock session ID
        let session_id = format!("daemon-session-{}", workspace_id);
        Ok(json!({ "sessionId": session_id }))
    }

    pub async fn send_prompt(
        &self,
        _workspace_id: String,
        _session_id: String,
        _content: Vec<ContentBlock>,
    ) -> Result<Value, String> {
        // Placeholder implementation
        Ok(json!({}))
    }

    pub async fn cancel(
        &self,
        _workspace_id: String,
        _session_id: String,
    ) -> Result<Value, String> {
        // Placeholder implementation
        Ok(json!({}))
    }
}

/// Try to handle ACP-related RPC requests
pub(super) async fn try_handle(
    _state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    // Get or create the ACP manager for the daemon
    // For now, we use a simple approach - in production, this should be part of DaemonState
    use std::sync::OnceLock;
    static ACP_MANAGER: OnceLock<Arc<DaemonAcpManager>> = OnceLock::new();
    let acp_manager = ACP_MANAGER.get_or_init(|| Arc::new(DaemonAcpManager::new()));

    match method {
        "session/new" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(w) => w,
                Err(e) => return Some(Err(e)),
            };
            let cwd = match parse_string(params, "cwd") {
                Ok(c) => c,
                Err(e) => return Some(Err(e)),
            };
            let runtime_str = parse_optional_string(params, "runtime").unwrap_or("codex".to_string());
            let runtime = match runtime_str.as_str() {
                "claude" => AgentRuntime::Claude,
                _ => AgentRuntime::Codex,
            };
            let api_key = parse_optional_string(params, "apiKey");
            let mcp_servers: Vec<McpServer> = parse_optional_string(params, "mcpServers")
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            Some(acp_manager.create_session(workspace_id, cwd, runtime, api_key, mcp_servers).await)
        }
        "session/prompt" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(w) => w,
                Err(e) => return Some(Err(e)),
            };
            let session_id = match parse_string(params, "sessionId") {
                Ok(s) => s,
                Err(e) => return Some(Err(e)),
            };
            let content_str = match parse_string(params, "content") {
                Ok(c) => c,
                Err(e) => return Some(Err(e)),
            };
            let content: Vec<ContentBlock> = match serde_json::from_str(&content_str) {
                Ok(c) => c,
                Err(e) => return Some(Err(format!("Failed to parse content: {}", e))),
            };

            Some(acp_manager.send_prompt(workspace_id, session_id, content).await)
        }
        "session/cancel" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(w) => w,
                Err(e) => return Some(Err(e)),
            };
            let session_id = match parse_string(params, "sessionId") {
                Ok(s) => s,
                Err(e) => return Some(Err(e)),
            };

            Some(acp_manager.cancel(workspace_id, session_id).await)
        }
        _ => None,
    }
}
