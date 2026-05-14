# Trantor: Codex App Server → ACP Migration Plan

**Status**: Core Implementation Complete - Testing Phase  
**Author**: Mistral Vibe  
**Date**: 2025-01-XX  
**Last Updated**: 2025-01-XX

> **Implementation Status**: ACP backend module (`src-tauri/src/acp/`) is complete with session management, agent resolution, MCP configuration, and Tauri commands defined. SessionManager is integrated into AppState. Frontend types include AgentRuntime and API key fields. ACP commands are registered in lib.rs and daemon RPC. Frontend now calls ACP commands. **COMPLETED**: Core wiring is done. **NEXT**: Testing with bundled adapters, then cleanup of legacy codex code.
**Target**: Direct migration to ACP with bundled **codex-acp** and **claude-agent-acp** adapters

---

## Executive Summary

Migrate Trantor from **Codex app-server protocol** to **Agent Client Protocol (ACP)** using:
- [agentclientprotocol/rust-sdk](https://github.com/agentclientprotocol/rust-sdk) for ACP client implementation
- **Bundled adapters**: `codex-acp` (Rust) and `claude-agent-acp` (TypeScript) distributed with Trantor

**Single agent at runtime** — user selects which adapter to use per-workspace, but only one runs per session. Direct cutover, no dual-protocol support, no legacy fallback.

---

## Architecture

### Bundled Distribution

```
trantor-app/
├── Trantor.app (macOS) / trantor (Linux) / trantor.exe (Windows)
├── resources/
│   └── bin/
│       ├── codex-acp          # Bundled Codex ACP adapter
│       └── claude-agent-acp  # Bundled Claude ACP adapter
└── ...
```

Each release includes **both adapters** for all supported platforms.

### Agent Selection

User selects **one agent per-workspace**:
```json
{
  "agentRuntime": "codex" | "claude"
}
```

At runtime, Trantor spawns **only the selected adapter**.

### Launch Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  TRANTOR (ACP Client via rust-sdk)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐                 │
│  │  Workspace      │──────│  rust-sdk        │                 │
│  │  (runtime:      │      │  Client          │                 │
│  │   codex/claude) │      │                 │                 │
│  └─────────────────┘      └────────┬────────┘                 │
│                                    │                              │
│                       spawns selected │                            │
│                            ┌───────┴───────┐                      │
│                            │  ACP Agent      │                      │
│                            │  (one of):      │                      │
│                            │  - codex-acp    │ ◄── BUNDLED           │
│                            │  - claude-...   │ ◄── BUNDLED           │
│                            └───────┬───────┘                      │
│                                    │ stdio                        │
│                            ┌───────▼───────┐                      │
│                            │  MCP Servers    │                      │
│                            │  (filesystem,   │                      │
│                            │   git, custom)  │                      │
│                            └─────────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Setup

1. **Add rust-sdk dependency**
   **File**: `src-tauri/Cargo.toml`
   ```toml
   [dependencies]
   agent-client-protocol = "0.11"
   which = "6.0"
   ```

2. **Create ACP module structure**
   ```
   src-tauri/src/acp/
   ├── mod.rs           # Module exports
   ├── agent.rs         # Agent resolution & spawning
   ├── session.rs       # Session management
   ├── mcp.rs           # MCP server configuration
   └── notifications.rs  # Event/notification handling
   ```

---

### Agent Module

3. **Define agent runtimes and resolution**
   **File**: `src-tauri/src/acp/agent.rs`
   
   ```rust
   #[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
   pub enum AgentRuntime {
       Codex,
       Claude,
   }
   
   /// Agent configuration with path resolution
   #[derive(Clone, Debug)]
   pub struct AgentConfig {
       pub runtime: AgentRuntime,
       pub path: PathBuf,
       pub env: HashMap<String, String>,
   }
   
   impl AgentConfig {
       /// Resolve agent for runtime, checking bundled path first
       pub fn resolve(runtime: AgentRuntime, api_key: Option<String>) -> Self {
           let path = resolve_agent_path(&runtime);
           let mut env = HashMap::new();
           
           match runtime {
               AgentRuntime::Codex => {
                   if let Some(key) = api_key {
                       env.insert("OPENAI_API_KEY".to_string(), key);
                   }
               }
               AgentRuntime::Claude => {
                   if let Some(key) = api_key {
                       env.insert("ANTHROPIC_API_KEY".to_string(), key);
                   }
               }
           }
           
           Self { runtime, path, env }
       }
       
       /// Check if the agent binary is usable
       pub fn is_available(&self) -> bool {
           std::process::Command::new(&self.path)
               .arg("--version")
               .stdout(Stdio::null())
               .stderr(Stdio::null())
               .status()
               .is_ok()
       }
       
       /// Convert to rust-sdk connectable
       pub fn to_connectable(&self) -> Result<impl ConnectTo<Agent>, String> {
           let mut cmd = self.path.to_string_lossy().to_string();
           AcpAgent::from_str(&cmd)
               .map_err(|e| format!("Failed to create agent command: {}", e))
       }
   }
   
   /// Resolve the path to a bundled agent binary
   fn resolve_agent_path(runtime: &AgentRuntime) -> PathBuf {
       let bin_name = match (runtime, cfg!(windows)) {
           (AgentRuntime::Codex, true) => "codex-acp.exe",
           (AgentRuntime::Codex, false) => "codex-acp",
           (AgentRuntime::Claude, true) => "claude-agent-acp.exe",
           (AgentRuntime::Claude, false) => "claude-agent-acp",
       };
       
       // 1. Check bundled location
       if let Some(bundled) = get_bundled_agent_path(bin_name) {
           if bundled.exists() {
               return bundled;
           }
       }
       
       // 2. Fallback to npx
       PathBuf::from("npx")
   }
   
   fn get_bundled_agent_path(bin_name: &str) -> Option<PathBuf> {
       #[cfg(target_os = "macos")]
       {
           std::env::var("TRANTOR_RESOURCE_DIR")
               .ok()
               .map(|d| PathBuf::from(d).join("bin").join(bin_name))
       }
       
       #[cfg(not(target_os = "macos"))]
       {
           std::env::current_exe()
               .ok()
               .and_then(|exe| exe.parent()?.parent())
               .map(|d| d.join("resources").join("bin").join(bin_name))
       }
   }
   ```

---

### Session Management

4. **Create session manager**
   **File**: `src-tauri/src/acp/session.rs`
   
   ```rust
   #[derive(Default)]
   pub struct SessionManager {
       connections: Mutex<HashMap<String, Arc<Mutex<ConnectionTo<Agent>>>>,
       session_ids: Mutex<HashMap<String, SessionId>>,
       agent_runtimes: Mutex<HashMap<String, AgentRuntime>>,
   }
   
   impl SessionManager {
       pub async fn create_session(
           &self,
           workspace_id: String,
           cwd: PathBuf,
           runtime: AgentRuntime,
           api_key: Option<String>,
           mcp_servers: Vec<McpServer>,
           app: AppHandle,
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
           let app_clone = app.clone();
           let workspace_id_clone = workspace_id.clone();
           
           let connection = Client
               .builder()
               .on_receive_notification(
                   move |n: SessionNotification, _| {
                       let h = notifications::setup_handler(app_clone.clone(), workspace_id_clone.clone());
                       h(n);
                       async { Ok(()) }
                   },
                   on_receive_notification!(),
               )
               .on_receive_request(
                   notifications::permission_handler(),
                   on_receive_request!(),
               )
               .connect_with(connectable, |cx| async move {
                   cx.send_request(InitializeRequest::new(ProtocolVersion::V1))
                       .block_task()
                       .await?;
                   
                   cx.send_request(NewSessionRequest::new(cwd).with_mcp_servers(mcp_servers))
                       .block_task()
                       .await
               })
               .await?;
           
           let session_id = connection.session_id();
           
           let mut conns = self.connections.lock().await;
           let mut ids = self.session_ids.lock().await;
           let mut runtimes = self.agent_runtimes.lock().await;
           
           conns.insert(workspace_id.clone(), Arc::new(Mutex::new(connection)));
           ids.insert(workspace_id.clone(), session_id.clone());
           runtimes.insert(workspace_id, runtime);
           
           Ok(session_id)
       }
       
       pub async fn send_prompt(&self, workspace_id: &str, content: Vec<ContentBlock>) -> Result<(), String> {
           let connection = self.connections.lock().await.get(workspace_id)
               .ok_or("No connection")?;
           let session_id = self.session_ids.lock().await.get(workspace_id)
               .ok_or("No session")?;
           
           let mut cx = connection.lock().await;
           cx.send_request(PromptRequest::new(session_id.clone(), content))
               .block_task()
               .await?;
           
           Ok(())
       }
       
       pub async fn cancel(&self, workspace_id: &str) -> Result<(), String> {
           let connection = self.connections.lock().await.get(workspace_id)
               .ok_or("No connection")?;
           let session_id = self.session_ids.lock().await.get(workspace_id)
               .ok_or("No session")?;
           
           let mut cx = connection.lock().await;
           cx.send_notification(CancelNotification::new(session_id.clone()))
               .await?;
           
           Ok(())
       }
   }
   ```

---

### MCP Configuration

5. **Configure MCP servers per-workspace**
   **File**: `src-tauri/src/acp/mcp.rs`
   
   ```rust
   #[derive(Clone, Debug)]
   pub struct WorkspaceMcpConfig {
       pub filesystem: bool,
       pub git: bool,
       pub custom: Vec<McpServerConfig>,
   }
   
   impl Default for WorkspaceMcpConfig {
       fn default() -> Self {
           Self {
               filesystem: true,
               git: true,
               custom: vec![],
           }
       }
   }
   
   impl WorkspaceMcpConfig {
       pub fn to_acp_servers(&self, workspace_path: &Path) -> Vec<McpServer> {
           let mut servers = Vec::new();
           
           if self.filesystem {
               servers.push(McpServer::Stdio(McpServerStdio {
                   name: "workspace_filesystem".to_string(),
                   command: resolve_mcp_server_path("server-filesystem"),
                   args: vec![workspace_path.to_string_lossy().to_string()],
                   env: vec![],
               }));
           }
           
           if self.git {
               if let Ok(git_root) = find_git_root(workspace_path) {
                   servers.push(McpServer::Stdio(McpServerStdio {
                       name: "workspace_git".to_string(),
                       command: resolve_mcp_server_path("server-git"),
                       args: vec![git_root.to_string_lossy().to_string()],
                       env: vec![],
                   }));
               }
           }
           
           servers
       }
   }
   
   fn resolve_mcp_server_path(name: &str) -> String {
       // Resolve bundled MCP server or fall back to npx
       "npx".to_string()
   }
   ```

---

### Notifications

6. **Handle ACP notifications**
   **File**: `src-tauri/src/acp/notifications.rs`
   
   ```rust
   pub fn setup_handler(app: AppHandle, workspace_id: String) -> impl Fn(SessionNotification) + Send + Sync + 'static {
       move |n: SessionNotification| {
           let app = app.clone();
           let workspace_id = workspace_id.clone();
           
           let payload = match n.update {
               SessionUpdate::AgentMessageChunk(c) => 
                   json!({ "method": "agent_message_chunk", "params": { "content": c.content } }),
               SessionUpdate::AgentThoughtChunk(c) => 
                   json!({ "method": "agent_thought_chunk", "params": { "content": c.content } }),
               SessionUpdate::ToolCall(t) => 
                   json!({ "method": "tool_call", "params": { "toolCall": t } }),
               SessionUpdate::ToolCallUpdate(u) => 
                   json!({ "method": "tool_call_update", "params": { "update": u } }),
               SessionUpdate::Plan(p) => 
                   json!({ "method": "plan", "params": { "plan": p } }),
               SessionUpdate::SessionInfoUpdate(i) => 
                   json!({ "method": "session_info_update", "params": { "title": i.title } }),
               _ => json!({}),
           };
           
           let _ = app.emit("app-server-event", json!({
               "workspace_id": workspace_id,
               "message": payload,
           }));
       }
   }
   
   pub fn permission_handler() -> impl Fn(RequestPermissionRequest, Responder<RequestPermissionResponse>) + Send + Sync + 'static {
       move |req, resp| {
           if let Some(opt) = req.options.first() {
               resp.respond(RequestPermissionResponse::new(
                   RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(opt.option_id.clone()))
               ));
           } else {
               resp.respond(RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled));
           }
       }
   }
   ```

---

### Backend Integration

7. **Update app state**
   **File**: `src-tauri/src/state.rs`
   ```rust
   #[derive(Default)]
   pub struct AppState {
       pub acp_sessions: Arc<Mutex<SessionManager>>,
       pub app_settings: Arc<Mutex<AppSettings>>,
       pub workspaces: Arc<Mutex<WorkspaceStore>>,
   }
   ```

8. **Replace commands in lib.rs**
   **File**: `src-tauri/src/lib.rs`
   
   ```rust
   mod acp;
   
   #[tauri::command]
   async fn start_thread(workspace_id: String, state: State<'_, AppState>, app: AppHandle) -> Result<Value, String> {
       let workspaces = state.workspaces.lock().await;
       let workspace = workspaces.get(&workspace_id).ok_or("Workspace not found")?;
       
       let settings = state.app_settings.lock().await;
       let runtime = workspace.agent_runtime.unwrap_or(AgentRuntime::Codex);
       let api_key = settings.get_api_key_for_runtime(&runtime);
       let mcp = WorkspaceMcpConfig::default_for(&workspace.path.into());
       
       let sessions = state.acp_sessions.lock().await;
       let session_id = sessions.create_session(workspace_id, workspace.path.into(), runtime, api_key, mcp.to_acp_servers(), app).await?;
       
       Ok(json!({ "threadId": session_id, "sessionId": session_id }))
   }
   
   #[tauri::command]
   async fn send_user_message(workspace_id: String, thread_id: String, text: String, images: Option<Vec<String>>, state: State<'_, AppState>) -> Result<Value, String> {
       let mut content: Vec<ContentBlock> = vec![ContentBlock::Text(TextContent::new(text))];
       
       if let Some(imgs) = images {
           for path in imgs {
               let data = std::fs::read(&path)?;
               let b64 = base64::encode(data);
               content.push(ContentBlock::Image(ImageContent::new(format!("data:image/png;base64,{}", b64))));
           }
       }
       
       let sessions = state.acp_sessions.lock().await;
       sessions.send_prompt(&workspace_id, content).await?;
       Ok(json!({}))
   }
   
   #[tauri::command]
   async fn turn_interrupt(workspace_id: String, _thread_id: String, _turn_id: String, state: State<'_, AppState>) -> Result<Value, String> {
       let sessions = state.acp_sessions.lock().await;
       sessions.cancel(&workspace_id).await?;
       Ok(json!({}))
   }
   
   #[tauri::command]
   async fn list_threads(workspace_id: String, state: State<'_, AppState>) -> Result<Value, String> {
       let sessions = state.acp_sessions.lock().await;
       let sid = sessions.session_ids.lock().await.get(&workspace_id).cloned();
       let threads = sid.map(|s| vec![json!({ "id": s, "name": "Session", "updatedAt": 0 })]).unwrap_or_default();
       Ok(json!({ "data": threads }))
   }
   ```

---

### Daemon Integration

9. **Add daemon ACP handler**
   **File**: `src-tauri/src/bin/trantor_daemon/rpc/acp.rs`
   
   ```rust
   pub struct DaemonAcpManager {
       connections: Mutex<HashMap<String, Arc<Mutex<ConnectionTo<Agent>>>>,
       session_ids: Mutex<HashMap<String, SessionId>>,
   }
   
   impl DaemonAcpManager {
       pub async fn handle_session_new(&self, workspace_id: String, cwd: String, mcp: Vec<McpServer>, runtime: AgentRuntime, api_key: Option<String>) -> Result<Value, String> {
           let config = AgentConfig::resolve(runtime, api_key);
           // Same pattern as local mode
           Ok(json!({ "sessionId": "..." }))
       }
       
       pub async fn handle_session_prompt(&self, workspace_id: String, session_id: String, content: Vec<ContentBlock>) -> Result<Value, String> {
           // Forward to connection
           Ok(json!({}))
       }
       
       pub async fn handle_session_cancel(&self, workspace_id: String, session_id: String) -> Result<Value, String> {
           // Forward cancel
           Ok(json!({}))
       }
   }
   ```

10. **Update daemon dispatcher**
    **File**: `src-tauri/src/bin/trantor_daemon/rpc/dispatcher.rs`
    ```rust
    mod acp;
    
    pub async fn dispatch_rpc_request(state: &DaemonState, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "session/new" => acp::handle_session_new(state, parse_string(params, "workspaceId")?, parse_string(params, "cwd")?, ...).await,
            "session/prompt" => acp::handle_session_prompt(state, ...).await,
            "session/cancel" => acp::handle_session_cancel(state, ...).await,
            _ => Err("Unknown method".into()),
        }
    }
    ```

---

### Frontend Integration

11. **Update types**
    **File**: `src/types.ts`
    ```typescript
    export type AgentRuntime = 'codex' | 'claude';
    
    export interface WorkspaceSettings {
        agentRuntime?: AgentRuntime;
        // ...
    }
    
    export interface AppSettings {
        codexApiKey?: string;
        claudeApiKey?: string;
        // ...
    }
    ```

12. **Update Tauri commands**
    **File**: `src/services/tauri.ts`
    ```typescript
    export const tauriCommands = {
        startThread: (workspaceId: string) => invoke('start_thread', { workspaceId }),
        listThreads: (workspaceId: string) => invoke('list_threads', { workspaceId }),
        sendUserMessage: (workspaceId: string, threadId: string, content: string, images?: string[]) => 
            invoke('send_user_message', { workspaceId, threadId, content, images }),
        turnInterrupt: (workspaceId: string, threadId: string, turnId: string) => 
            invoke('turn_interrupt', { workspaceId, threadId, turnId }),
        turnSteer: (workspaceId: string, threadId: string, turnId: string, text: string) => 
            invoke('turn_steer', { workspaceId, threadId, turnId, text }),
    };
    ```

13. **Update event handler**
    **File**: `src/features/app/hooks/useAppServerEvents.ts`
    ```typescript
    useTauriEvent('app-server-event', (event) => {
        const { workspace_id, message } = event;
        
        switch (message.method) {
            case 'agent_message_chunk':
                addMessage(workspace_id, { role: 'assistant', text: message.params.content.text });
                break;
            case 'tool_call':
                addToolCall(workspace_id, mapToolCall(message.params.toolCall));
                break;
            // ... other cases
        }
    });
    ```

---

### Cleanup

14. **Remove legacy codex code**
    Delete:
    - `src-tauri/src/codex/` (entire directory)
    - `src-tauri/src/backend/app_server.rs`
    - `src-tauri/src/shared/codex_*.rs` (all files)

15. **Update settings**
    Replace `codex_bin` / `codex_args` with per-runtime API keys.

---

## Bundling Adapters

### Build Script Integration

Add to release build process:

```bash
#!/bin/bash
# scripts/bundle_agents.sh

VERSION_CODEX="0.14.0"
VERSION_CLAUDE="0.33.1"

mkdir -p src-tauri/resources/bin

# Download codex-acp
curl -L "https://github.com/zed-industries/codex-acp/releases/download/v${VERSION_CODEX}/codex-acp-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)" \
    -o src-tauri/resources/bin/codex-acp
chmod +x src-tauri/resources/bin/codex-acp

# Download claude-agent-acp (Node.js package - extract binary)
npx @agentclientprotocol/claude-agent-acp --version >/dev/null 2>&1 || {
    npm install -g @agentclientprotocol/claude-agent-acp
    # Copy the installed binary to resources
    cp $(npm root -g)/@agentclientprotocol/claude-agent-acp/dist/index.js src-tauri/resources/bin/claude-agent-acp
    chmod +x src-tauri/resources/bin/claude-agent-acp
}
```

### GitHub Actions

```yaml
name: Release

jobs:
  bundle:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      
      - name: Bundle codex-acp
        run: |
          mkdir -p src-tauri/resources/bin
          curl -L "https://github.com/zed-industries/codex-acp/releases/latest/download/codex-acp-${{ matrix.os == 'macos-latest' && 'macos' || matrix.os == 'ubuntu-latest' && 'linux' || 'windows' }}-x64${{ matrix.os == 'windows-latest' && '.exe' || '' }}" \
            -o src-tauri/resources/bin/codex-acp${{ matrix.os == 'windows-latest' && '.exe' || '' }}
          chmod +x src-tauri/resources/bin/codex-acp*
      
      - name: Bundle claude-agent-acp
        run: |
          npm install -g @agentclientprotocol/claude-agent-acp
          cp $(npm root -g)/@agentclientprotocol/claude-agent-acp/dist/index.js src-tauri/resources/bin/claude-agent-acp
          chmod +x src-tauri/resources/bin/claude-agent-acp
      
      - name: Commit
        run: |
          git add src-tauri/resources/bin/
          git commit -m "chore: bundle ACP adapters for ${{ matrix.os }}"
```

### Tauri Config

**File**: `src-tauri/tauri.conf.json`

The ACP adapter binaries should be placed in `src-tauri/resources/bin/` directory. They will be automatically included in the app bundle by Tauri. The binaries are:
- `codex-acp` (macOS/Linux) or `codex-acp.exe` (Windows)
- `claude-agent-acp` (macOS/Linux) or `claude-agent-acp.cmd` (Windows)

Note: These files should be created by the bundling script (`scripts/bundle_acp_agents.sh`) before building the app. They are not referenced directly in tauri.conf.json as they are dynamically generated.

```json
// No changes needed to tauri.conf.json for ACP adapters
// The binaries in src-tauri/resources/bin/ are automatically included
```

---

## Rollout Checklist

- [x] Add rust-sdk dependency (`agent-client-protocol = "0.11"`, `agent-client-protocol-schema = "0.12"`, `agent-client-protocol-tokio = "0.11"`, `which = "6.0"`, `tokio-util = "0.7"`)
- [x] Create `src-tauri/src/acp/` module (mod.rs, agent.rs, session.rs, mcp.rs, notifications.rs)
- [x] Implement agent resolution with bundled path support for both adapters
- [x] Implement session manager with rust-sdk
- [x] Implement MCP server configuration
- [x] Implement notification and permission handlers
- [x] Update `src-tauri/src/lib.rs` with mod acp declaration
- [x] Update `src-tauri/src/lib.rs` with ACP commands (acp_start_thread, acp_send_user_message, acp_turn_interrupt, acp_list_threads, acp_turn_steer, acp_set_thread_name, acp_archive_thread, acp_compact_thread)
- [x] Update `src-tauri/src/state.rs` with SessionManager
- [x] Clean up unused import warnings in ACP module
- [x] Fix compilation errors (connect_with generic args, send_request single generic, struct literal for non-exhaustive types)
- [x] Update daemon RPC (add acp.rs with DaemonAcpManager, update dispatcher)
- [x] Daemon ACP RPC handlers implemented (session/new, session/prompt, session/cancel)
- [x] Update `src/types.ts` (add AgentRuntime, update WorkspaceSettings, AppSettings with codexApiKey and claudeApiKey)
- [x] Update `src/services/tauri.ts` with ACP commands (acp_start_thread, acp_send_user_message, acp_turn_interrupt, acp_turn_steer, acp_list_threads, acp_archive_thread, acp_set_thread_name, acp_compact_thread)
- [x] Update event handler in `src/features/app/hooks/useAppServerEvents.ts` (add ACP notification method handlers)
- [x] Update `src/utils/appServerEvents.ts` with ACP notification methods (all 10 ACP methods added to SUPPORTED_APP_SERVER_METHODS)
- [ ] Delete legacy codex directory and files (`src-tauri/src/codex/`, `src-tauri/src/backend/app_server.rs`, `src-tauri/src/shared/codex_*.rs`) - Deferred until after ACP testing is complete
- [x] Add bundling scripts for both adapters (scripts/bundle_acp_agents.sh)
- [x] Update CI/CD to bundle adapters in releases (.github/workflows/release.yml)
- [x] Update Tauri config to include binaries in resources (src-tauri/tauri.conf.json)
- [ ] Test local mode with both adapters
- [ ] Test daemon mode with both adapters
- [ ] Test session lifecycle (create, prompt, cancel, list)
- [ ] Test MCP server integration
- [ ] Test event forwarding
- [ ] Test image attachments
- [ ] Test tool call handling
- [ ] Code review complete

---

## Next Steps to Complete Migration

**Priority 0: Critical Wiring (COMPLETED ✓)**
The ACP backend module is now connected to the frontend. All critical wiring is complete:

1. **Add ACP module to lib.rs** ✓
   - Added `mod acp;` declaration in `src-tauri/src/lib.rs`
   - ACP commands are exposed to Tauri

2. **Register ACP commands in lib.rs** ✓
   - In the Tauri builder's `.invoke_handler()`, replaced legacy codex commands with ACP equivalents:
     - `codex::start_thread` → `acp::acp_start_thread`
     - `codex::send_user_message` → `acp::acp_send_user_message`
     - `codex::turn_interrupt` → `acp::acp_turn_interrupt`
     - `codex::turn_steer` → `acp::acp_turn_steer`
     - `codex::list_threads` → `acp::acp_list_threads`
     - `codex::archive_thread` → `acp::acp_archive_thread`
     - `codex::set_thread_name` → `acp::acp_set_thread_name`
     - `codex::compact_thread` → `acp::acp_compact_thread`
   - Legacy commands remain for now but are superseded by ACP commands

3. **Update frontend Tauri service layer** ✓
   - In `src/services/tauri.ts`, updated all command calls to use ACP prefixes
   - Simplified parameters where ACP doesn't support all legacy options

4. **Update daemon RPC to use ACP** ✓
   - In `src-tauri/src/bin/trantor_daemon/rpc/acp.rs`, implemented ACP RPC handlers with DaemonAcpManager
   - Dispatcher updated to route session/new, session/prompt, session/cancel methods
   - DaemonState integration ready (using OnceLock singleton for now)

**Priority 1: Testing Phase**
All core wiring is complete. Run end-to-end tests for all critical paths before deleting legacy code:

> **✓ COMPLETED IN THIS SESSION:**
> - Added `mod acp;` to `src-tauri/src/lib.rs`
> - Registered all 8 ACP commands in lib.rs invoke_handler
> - Updated `src/services/tauri.ts` with ACP command wrappers
> - Implemented daemon ACP RPC handlers in `src-tauri/src/bin/trantor_daemon/rpc/acp.rs`
> - Added `acp_compact_thread` command to match all legacy thread commands
> - Updated `useAppServerEvents.ts` with proper ACP notification handlers
> - Cleaned up unused TypeScript helper functions

Run end-to-end tests for all critical paths before deleting legacy code:

5. **Test local mode with both adapters**
   - Bundle both `codex-acp` and `claude-agent-acp` using `scripts/bundle_acp_agents.sh`
   - Verify each adapter can be resolved via `AgentConfig::resolve()`
   - Test `acp_start_thread` command spawns correct adapter per workspace setting
   - Confirm stdio communication works with both adapters

6. **Test daemon mode with both adapters**
   - Run daemon with `--acp` flag or equivalent
   - Verify `session/new` RPC creates sessions with correct runtime
   - Test `session/prompt` and `session/cancel` flow through daemon
   - Confirm event forwarding from daemon to frontend

7. **Test session lifecycle**
   - Create session → send prompt → receive streaming chunks → cancel mid-stream
   - Verify `acp_list_threads` returns correct session IDs
   - Test concurrent sessions across multiple workspaces

8. **Test MCP server integration**
   - Verify filesystem MCP server mounts workspace correctly
   - Test git MCP server resolves repository root
   - Confirm custom MCP servers from workspace config are included

9. **Test event forwarding**
   - Verify all ACP notification types map to frontend events:
     - `agent_message_chunk` → assistant message streaming
     - `agent_thought_chunk` → thought process display
     - `tool_call` / `tool_call_update` → tool execution UI
     - `plan` → agent planning visualization
     - `session_info_update` → thread title updates
     - `user_message_chunk` → echo handling
     - `available_commands_update` → capability detection
     - `current_mode_update` → mode switching
     - `config_option_update` → dynamic config

10. **Test image attachments**
    - Send message with `images` parameter via `acp_send_user_message`
    - Verify images are base64-encoded and included in `ContentBlock::Image`
    - Confirm both adapters handle image inputs correctly

11. **Test tool call handling**
    - Verify tool calls from both adapters are forwarded to frontend
    - Test permission prompts for tool execution
    - Confirm tool results are displayed correctly

**Priority 2: Cleanup (After Testing Passes)**

12. **Delete legacy codex code**
    - Remove `src-tauri/src/codex/` directory
    - Remove `src-tauri/src/backend/app_server.rs`
    - Remove `src-tauri/src/shared/codex_core.rs`
    - Remove `src-tauri/src/shared/codex_aux_core.rs`
    - Remove `src-tauri/src/shared/codex_update_core.rs`
    - Update all imports that referenced these files

**Priority 3: Finalization**

13. **Code review complete**
    - Review all ACP module files for consistency
    - Verify error handling covers all edge cases
    - Ensure daemon and app parity for all ACP features
    - Document any runtime-specific quirks

---

## File Changes Summary

### New Files
- `src-tauri/src/acp/mod.rs` (ACP module with Tauri commands)
- `src-tauri/src/acp/agent.rs` (Agent resolution and path handling)
- `src-tauri/src/acp/session.rs` (Session manager with rust-sdk)
- `src-tauri/src/acp/mcp.rs` (MCP server configuration)
- `src-tauri/src/acp/notifications.rs` (ACP notification handlers)
- `src-tauri/src/bin/trantor_daemon/rpc/acp.rs` (Daemon ACP RPC handlers)
- `scripts/bundle_acp_agents.sh` (Bundling script for ACP adapters)

### Modified Files
- `src-tauri/Cargo.toml` (ACP dependencies already present: agent-client-protocol, agent-client-protocol-schema, agent-client-protocol-tokio, which, tokio-util)
- `src-tauri/src/lib.rs` ✓ (added acp module declaration and ACP Tauri commands: acp_start_thread, acp_send_user_message, acp_turn_interrupt, acp_turn_steer, acp_list_threads, acp_archive_thread, acp_set_thread_name, acp_compact_thread)
- `src-tauri/src/state.rs` ✓ (added acp_sessions: SessionManager)
- `src-tauri/src/types.rs` ✓ (added codex_api_key and claude_api_key to AppSettings, added agent_runtime to WorkspaceSettings)
- `src-tauri/src/bin/trantor_daemon.rs` (daemon uses separate RPC module - no changes needed)
- `src-tauri/src/bin/trantor_daemon/rpc.rs` ✓ (acp RPC module already imported)
- `src-tauri/src/bin/trantor_daemon/rpc/dispatcher.rs` ✓ (acp::try_handle already in dispatch chain)
- `src-tauri/src/bin/trantor_daemon/rpc/acp.rs` ✓ (implemented DaemonAcpManager with session/new, session/prompt, session/cancel handlers)
- `src/types.ts` ✓ (AgentRuntime type, agentRuntime in WorkspaceSettings, codexApiKey and claudeApiKey in AppSettings)
- `src/services/tauri.ts` ✓ (updated all IPC commands to use ACP equivalents: acp_start_thread, acp_send_user_message, acp_turn_interrupt, acp_turn_steer, acp_list_threads, acp_archive_thread, acp_set_thread_name, acp_compact_thread)
- `src/features/app/hooks/useAppServerEvents.ts` ✓ (added ACP notification method handlers for all 10 ACP notification types)
- `src/utils/appServerEvents.ts` ✓ (all ACP methods already in SUPPORTED_APP_SERVER_METHODS)
- `.github/workflows/release.yml` (bundling script step ready)
- `src-tauri/tauri.conf.json` (binaries in resources/ automatically included by Tauri)

### Deleted Files (Deferred until after ACP testing)
- [ ] `src-tauri/src/codex/mod.rs` - Keep for now, legacy commands still registered
- [ ] `src-tauri/src/codex/args.rs` - Deferred
- [ ] `src-tauri/src/codex/config.rs` - Deferred
- [ ] `src-tauri/src/codex/home.rs` - Deferred
- [ ] `src-tauri/src/backend/app_server.rs` - Deferred
- [ ] `src-tauri/src/shared/codex_core.rs` - Deferred
- [ ] `src-tauri/src/shared/codex_aux_core.rs` - Deferred
- [ ] `src-tauri/src/shared/codex_update_core.rs` - Deferred

---

## Command Mapping

| Current Codex Command | ACP Equivalent |
|------------------------|---------------|
| `thread/start` | `session/new` via rust-sdk |
| `send_user_message` | `session/prompt` via rust-sdk |
| `turn_interrupt` | `session/cancel` via rust-sdk |
| `turn_steer` | `session/prompt` with steering prefix |
| `list_threads` | `session/list` or tracked sessions |
| `app-server-event` | Forwarded ACP `session/update` notifications |

---

*Migration plan: Trantor bundles both codex-acp and claude-agent-acp, single agent per workspace, direct ACP cutover*
