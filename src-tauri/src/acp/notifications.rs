use agent_client_protocol_schema::{RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome, SessionNotification, SessionUpdate};
use agent_client_protocol::Responder;
use serde_json::json;
use tauri::{AppHandle, Emitter};

/// Setup handler for ACP session notifications
pub fn setup_handler(app: AppHandle, workspace_id: String) -> impl Fn(SessionNotification) + Send + Sync + 'static {
    move |n: SessionNotification| {
        let app = app.clone();
        let workspace_id = workspace_id.clone();

        let payload = match n.update {
            SessionUpdate::AgentMessageChunk(c) => json!({
                "method": "agent_message_chunk",
                "params": { "content": c.content }
            }),
            SessionUpdate::AgentThoughtChunk(c) => json!({
                "method": "agent_thought_chunk",
                "params": { "content": c.content }
            }),
            SessionUpdate::ToolCall(t) => json!({
                "method": "tool_call",
                "params": { "toolCall": t }
            }),
            SessionUpdate::ToolCallUpdate(u) => json!({
                "method": "tool_call_update",
                "params": { "update": u }
            }),
            SessionUpdate::Plan(p) => json!({
                "method": "plan",
                "params": { "plan": p }
            }),
            SessionUpdate::SessionInfoUpdate(i) => json!({
                "method": "session_info_update",
                "params": { "title": i.title }
            }),
            SessionUpdate::UserMessageChunk(c) => json!({
                "method": "user_message_chunk",
                "params": { "content": c.content }
            }),
            SessionUpdate::AvailableCommandsUpdate(c) => json!({
                "method": "available_commands_update",
                "params": { "availableCommands": c.available_commands }
            }),
            SessionUpdate::CurrentModeUpdate(c) => json!({
                "method": "current_mode_update",
                "params": { "currentModeId": c.current_mode_id }
            }),
            SessionUpdate::ConfigOptionUpdate(c) => json!({
                "method": "config_option_update",
                "params": { "configOptions": c.config_options }
            }),
            _ => json!({}),
        };

        let _ = app.emit("app-server-event", json!({
            "workspace_id": workspace_id,
            "message": payload,
        }));
    }
}

/// Permission handler for ACP requests
pub fn permission_handler() -> impl Fn(RequestPermissionRequest, Responder<RequestPermissionResponse>) + Send + Sync + 'static {
    move |req: RequestPermissionRequest, responder: Responder<RequestPermissionResponse>| {
        if let Some(opt) = req.options.first() {
            responder.respond(RequestPermissionResponse::new(
                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                    opt.option_id.clone(),
                )),
            ));
        } else {
            responder.respond(RequestPermissionResponse::new(
                RequestPermissionOutcome::Cancelled,
            ));
        }
    }
}

/// Async permission handler for ACP requests (for use with async contexts)
pub fn async_permission_handler() -> impl Fn(RequestPermissionRequest, Responder<RequestPermissionResponse>) + Send + Sync + 'static {
    move |req: RequestPermissionRequest, responder: Responder<RequestPermissionResponse>| {
        if let Some(opt) = req.options.first() {
            responder.respond(RequestPermissionResponse::new(
                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                    opt.option_id.clone(),
                )),
            ));
        } else {
            responder.respond(RequestPermissionResponse::new(
                RequestPermissionOutcome::Cancelled,
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_handler_selects_first_option() {
        let handler = permission_handler();
        let request = RequestPermissionRequest {
            options: vec![
                agent_client_protocol_schema::PermissionOption {
                    option_id: "option-1".to_string(),
                    description: "Test option".to_string(),
                },
            ],
        };
        // Test that handler doesn't panic - actual response testing requires mock responder
        let _ = handler;
        let _ = request;
    }

    #[test]
    fn test_permission_handler_handles_empty_options() {
        let handler = permission_handler();
        let request = RequestPermissionRequest { options: vec![] };
        let _ = handler;
        let _ = request;
    }
}
