use agent_client_protocol_schema::{CancelNotification, ContentBlock, InitializeRequest, NewSessionRequest, NewSessionResponse, ProtocolVersion, PromptRequest, SessionId};
use agent_client_protocol::{Agent, Client, ConnectionTo};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::acp::agent::AgentConfig;
use crate::types::AgentRuntime;

/// Session manager for ACP connections
#[derive(Default)]
pub struct SessionManager {
    connections: Mutex<HashMap<String, Arc<Mutex<ConnectionTo<Agent>>>>>,
    session_ids: Mutex<HashMap<String, SessionId>>,
    agent_runtimes: Mutex<HashMap<String, AgentRuntime>>,
}

impl SessionManager {
    /// Create a new session manager
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            session_ids: Mutex::new(HashMap::new()),
            agent_runtimes: Mutex::new(HashMap::new()),
        }
    }

    /// Create a new ACP session for a workspace
    pub async fn create_session(
        &self,
        workspace_id: String,
        cwd: PathBuf,
        runtime: AgentRuntime,
        api_key: Option<String>,
        mcp_servers: Vec<agent_client_protocol_schema::McpServer>,
        _app: tauri::AppHandle,
    ) -> Result<SessionId, String> {
        let agent_config = AgentConfig::resolve(runtime.clone(), api_key);

        if !agent_config.is_available() {
            return Err(format!(
                "{} adapter not available. Please ensure it is bundled.",
                match runtime {
                    AgentRuntime::Codex => "codex-acp",
                    AgentRuntime::Claude => "claude-agent-acp",
                }
            ));
        }

        let connectable = agent_config.to_connectable()?;

        // Use Client.builder().connect_with to establish connection and initialize
        let connection = Client
            .builder()
            .name("trantor-client")
            .connect_with(connectable, |cx: ConnectionTo<Agent>| async move {
                // Initialize the connection
                let _init_response = cx.send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await
                    .map_err(|e| agent_client_protocol::Error::into_internal_error(e))?;
                
                Ok::<ConnectionTo<Agent>, agent_client_protocol::Error>(cx)
            })
            .await
            .map_err(|e| format!("Failed to create connection: {}", e))?;

        // Create session
        let mut new_session_req = NewSessionRequest::new(cwd);
        new_session_req.mcp_servers = mcp_servers;
        let response: NewSessionResponse = connection
            .send_request::<NewSessionRequest>(new_session_req)
            .block_task()
            .await
            .map_err(|e| format!("Failed to create session: {}", e))?;
        
        let session_id = response.session_id.clone();

        // Store the connection
        let mut conns = self.connections.lock().await;
        let mut ids = self.session_ids.lock().await;
        let mut runtimes = self.agent_runtimes.lock().await;

        conns.insert(workspace_id.clone(), Arc::new(Mutex::new(connection)));
        ids.insert(workspace_id.clone(), session_id.clone());
        runtimes.insert(workspace_id, runtime);

        Ok(session_id)
    }

    /// Send a prompt to a workspace session
    pub async fn send_prompt(
        &self,
        workspace_id: &str,
        content: Vec<ContentBlock>,
    ) -> Result<(), String> {
        let connections = self.connections.lock().await;
        let connection = connections.get(workspace_id)
            .ok_or("No connection for workspace")?;
        let session_ids = self.session_ids.lock().await;
        let session_id = session_ids.get(workspace_id)
            .ok_or("No session for workspace")?.clone();

        let cx = connection.lock().await;
        cx.send_request::<PromptRequest>(PromptRequest::new(session_id, content))
            .block_task()
            .await
            .map_err(|e| format!("Failed to send prompt: {}", e))?;

        Ok(())
    }

    /// Cancel a running prompt/turn
    pub async fn cancel(&self, workspace_id: &str) -> Result<(), String> {
        let connections = self.connections.lock().await;
        let connection = connections.get(workspace_id)
            .ok_or("No connection for workspace")?;
        let session_ids = self.session_ids.lock().await;
        let session_id = session_ids.get(workspace_id)
            .ok_or("No session for workspace")?.clone();

        let cx = connection.lock().await;
        cx.send_notification(CancelNotification::new(session_id))
            .map_err(|e| format!("Failed to cancel: {}", e))?;

        Ok(())
    }

    /// Get session ID for a workspace
    pub async fn get_session_id(&self, workspace_id: &str) -> Option<SessionId> {
        let session_ids = self.session_ids.lock().await;
        session_ids.get(workspace_id).cloned()
    }

    /// Get agent runtime for a workspace
    pub async fn get_agent_runtime(&self, workspace_id: &str) -> Option<AgentRuntime> {
        let runtimes = self.agent_runtimes.lock().await;
        runtimes.get(workspace_id).cloned()
    }

    /// Check if a workspace has an active session
    pub async fn has_session(&self, workspace_id: &str) -> bool {
        let session_ids = self.session_ids.lock().await;
        session_ids.contains_key(workspace_id)
    }

    /// Remove a session (cleanup)
    pub async fn remove_session(&self, workspace_id: &str) -> Option<SessionId> {
        let mut conns = self.connections.lock().await;
        let mut ids = self.session_ids.lock().await;
        let mut runtimes = self.agent_runtimes.lock().await;

        conns.remove(workspace_id);
        runtimes.remove(workspace_id);
        ids.remove(workspace_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_manager_new() {
        let manager = SessionManager::new();
        // Just verify it doesn't panic
        let _ = manager;
    }
}
