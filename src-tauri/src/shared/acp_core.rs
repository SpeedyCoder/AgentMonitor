use agent_client_protocol::{
    on_receive_notification, on_receive_request, Agent, Client, ConnectionTo, Responder,
    UntypedMessage,
};
use agent_client_protocol_schema::{
    CancelNotification, ContentBlock, ContentChunk, EnvVariable, ImageContent, Implementation,
    InitializeRequest, LoadSessionRequest, LoadSessionResponse, McpServer, McpServerStdio,
    NewSessionRequest, NewSessionResponse, PermissionOptionId, PromptRequest, ProtocolVersion,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionId, SessionNotification, SessionUpdate,
    SetSessionConfigOptionRequest, TextContent,
};
use agent_client_protocol_tokio::AcpAgent;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::timeout;

use crate::types::{AcpHarnessConfig, AgentRuntime};

const ACP_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const ACP_CLIENT_NAME: &str = "trantor";

fn initialize_request() -> InitializeRequest {
    InitializeRequest::new(ProtocolVersion::V1)
        .client_info(Implementation::new(ACP_CLIENT_NAME, env!("CARGO_PKG_VERSION")))
}

#[derive(Clone, Debug)]
pub(crate) struct AgentConfig {
    pub(crate) runtime: AgentRuntime,
    pub(crate) name: String,
    pub(crate) path: PathBuf,
    pub(crate) args: Vec<String>,
    pub(crate) env: HashMap<String, String>,
}

impl AgentConfig {
    pub(crate) fn resolve(
        runtime: AgentRuntime,
        api_key: Option<String>,
        custom_harnesses: &[AcpHarnessConfig],
    ) -> Result<Self, String> {
        let custom_harness = match &runtime {
            AgentRuntime::Custom(id) => custom_harnesses.iter().find(|harness| harness.id == *id),
            _ => None,
        };
        let (name, path, args) = if let Some(harness) = custom_harness {
            let mut parts = shell_words::split(harness.start_command.trim())
                .map_err(|err| format!("Failed to parse ACP harness command: {err}"))?;
            if parts.is_empty() {
                return Err(format!(
                    "ACP harness `{}` has an empty start command",
                    harness.name
                ));
            }
            let command = parts.remove(0);
            (harness.id.clone(), PathBuf::from(command), parts)
        } else if matches!(runtime, AgentRuntime::Custom(_)) {
            return Err(format!(
                "ACP harness `{}` is not configured",
                runtime.as_id()
            ));
        } else {
            (
                agent_runtime_name(&runtime).to_string(),
                resolve_agent_path(&runtime),
                Vec::new(),
            )
        };
        let mut env = HashMap::new();

        match &runtime {
            AgentRuntime::Codex => {
                if let Some(key) = api_key.filter(|key| !key.trim().is_empty()) {
                    env.insert("OPENAI_API_KEY".to_string(), key);
                }
            }
            AgentRuntime::Claude => {
                if let Some(key) = api_key.filter(|key| !key.trim().is_empty()) {
                    env.insert("ANTHROPIC_API_KEY".to_string(), key);
                }
            }
            AgentRuntime::Custom(_) => {
                if let Some(harness) = custom_harness {
                    for entry in &harness.env {
                        let name = entry.name.trim();
                        if !name.is_empty() {
                            env.insert(name.to_string(), entry.value.clone());
                        }
                    }
                }
            }
        }

        Ok(Self {
            runtime,
            name,
            path,
            args,
            env,
        })
    }

    pub(crate) fn is_available(&self) -> bool {
        let mut command = std::process::Command::new(&self.path);
        command
            .arg("--help")
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        if matches!(self.runtime, AgentRuntime::Claude) {
            if let Some(node_dir) = bundled_node_dir() {
                if node_dir.exists() {
                    let path = std::env::var_os("PATH").unwrap_or_default();
                    let mut paths: Vec<PathBuf> = std::env::split_paths(&path).collect();
                    paths.insert(0, node_dir);
                    if let Ok(next_path) = std::env::join_paths(paths) {
                        command.env("PATH", next_path);
                    }
                }
            }
        }

        command.status().is_ok()
    }

    pub(crate) fn to_connectable(&self) -> AcpAgent {
        let env = self
            .env
            .iter()
            .map(|(name, value)| EnvVariable::new(name.clone(), value.clone()))
            .collect();
        let server = McpServer::Stdio(
            McpServerStdio::new(&self.name, self.path.clone())
                .args(self.args.clone())
                .env(env),
        );
        AcpAgent::new(server)
    }
}

fn agent_runtime_name(runtime: &AgentRuntime) -> &'static str {
    match runtime {
        AgentRuntime::Codex => "codex-acp",
        AgentRuntime::Claude => "claude-agent-acp",
        AgentRuntime::Custom(_) => "custom-acp",
    }
}

fn find_config_id_by_category(options: &[Value], category: &str) -> Option<String> {
    options.iter().find_map(|option| {
        let object = option.as_object()?;
        let option_category = object
            .get("category")
            .and_then(Value::as_str)
            .or_else(|| object.get("id").and_then(Value::as_str))?;
        if option_category != category {
            return None;
        }
        object
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn config_options_from_value(value: &Value) -> Option<Vec<Value>> {
    value
        .get("configOptions")
        .or_else(|| value.get("config_options"))
        .and_then(Value::as_array)
        .cloned()
}

fn resolve_agent_path(runtime: &AgentRuntime) -> PathBuf {
    let bin_names: &[&str] = match (runtime, cfg!(windows)) {
        (AgentRuntime::Codex, true) => &["codex-acp.exe", "codex-acp.cmd", "codex-acp"],
        (AgentRuntime::Codex, false) => &["codex-acp"],
        (AgentRuntime::Claude, true) => &[
            "claude-agent-acp.exe",
            "claude-agent-acp.cmd",
            "claude-agent-acp",
        ],
        (AgentRuntime::Claude, false) => &["claude-agent-acp"],
        (AgentRuntime::Custom(_), _) => &[],
    };

    for bin_name in bin_names {
        if let Some(bundled) = get_bundled_bin_path(bin_name) {
            if bundled.exists() {
                return bundled;
            }
        }
    }

    PathBuf::from(agent_runtime_name(runtime))
}

fn get_bundled_bin_path(bin_name: &str) -> Option<PathBuf> {
    if let Ok(resource_dir) = std::env::var("TRANTOR_RESOURCE_DIR") {
        return Some(PathBuf::from(resource_dir).join("bin").join(bin_name));
    }

    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;

    let mut candidates: Vec<PathBuf> = Vec::new();

    // Packaged macOS .app: <exe>/../../Resources/bin/<name>
    #[cfg(target_os = "macos")]
    if let Some(contents) = exe_dir.parent() {
        candidates.push(contents.join("Resources").join("bin").join(bin_name));
    }

    // Packaged Linux/Windows release: <exe>/../resources/bin/<name>
    #[cfg(not(target_os = "macos"))]
    if let Some(parent) = exe_dir.parent() {
        candidates.push(parent.join("resources").join("bin").join(bin_name));
    }

    // Dev (cargo/tauri dev): Tauri stages resources at <exe>/resources/bin/<name>
    candidates.push(exe_dir.join("resources").join("bin").join(bin_name));

    candidates
        .iter()
        .find(|path| path.exists())
        .cloned()
        .or_else(|| candidates.into_iter().next())
}

fn bundled_node_dir() -> Option<PathBuf> {
    get_bundled_bin_path("node").and_then(|node| node.parent().map(Path::to_path_buf))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct WorkspaceMcpConfig {
    pub(crate) filesystem: bool,
    pub(crate) git: bool,
    pub(crate) custom: Vec<McpServerConfig>,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct McpServerConfig {
    pub(crate) name: String,
    pub(crate) command: PathBuf,
    pub(crate) args: Vec<String>,
    pub(crate) env: Vec<(String, String)>,
}

impl WorkspaceMcpConfig {
    pub(crate) fn to_acp_servers(&self, workspace_path: &Path) -> Vec<McpServer> {
        let mut servers = Vec::new();

        if self.filesystem {
            servers.push(build_filesystem_server(workspace_path));
        }

        if self.git {
            if let Some(git_server) = build_git_server(workspace_path) {
                servers.push(git_server);
            }
        }

        servers.extend(self.custom.iter().map(build_custom_server));
        servers
    }
}

fn build_filesystem_server(workspace_path: &Path) -> McpServer {
    let command = resolve_mcp_server_command("server-filesystem");
    let args = command.args_with(vec![workspace_path.to_string_lossy().to_string()]);
    McpServer::Stdio(
        McpServerStdio::new("workspace_filesystem", command.command)
            .args(args)
            .env(vec![]),
    )
}

fn build_git_server(workspace_path: &Path) -> Option<McpServer> {
    find_git_root(workspace_path).and_then(|root| {
        let command = resolve_git_mcp_command()?;
        let args = command.args_with(vec![
            "--repository".to_string(),
            root.to_string_lossy().to_string(),
        ]);
        Some(McpServer::Stdio(
            McpServerStdio::new("workspace_git", command.command)
                .args(args)
                .env(vec![]),
        ))
    })
}

fn build_custom_server(config: &McpServerConfig) -> McpServer {
    let env = config
        .env
        .iter()
        .map(|(name, value)| EnvVariable::new(name.clone(), value.clone()))
        .collect();

    McpServer::Stdio(
        McpServerStdio::new(&config.name, config.command.clone())
            .args(config.args.clone())
            .env(env),
    )
}

struct ResolvedCommand {
    command: PathBuf,
    args: Vec<String>,
}

impl ResolvedCommand {
    fn args_with(&self, trailing: Vec<String>) -> Vec<String> {
        let mut args = self.args.clone();
        args.extend(trailing);
        args
    }
}

fn resolve_mcp_server_command(name: &str) -> ResolvedCommand {
    if let Some(bundled) = get_bundled_bin_path(name) {
        if bundled.exists() {
            return ResolvedCommand {
                command: bundled,
                args: vec![],
            };
        }
    }

    ResolvedCommand {
        command: PathBuf::from("npx"),
        args: vec!["-y".to_string(), format!("@modelcontextprotocol/{name}")],
    }
}

fn resolve_git_mcp_command() -> Option<ResolvedCommand> {
    if let Some(bundled) = get_bundled_bin_path("server-git") {
        if bundled.exists() {
            return Some(ResolvedCommand {
                command: bundled,
                args: vec![],
            });
        }
    }

    which::which("uvx").ok().map(|uvx| ResolvedCommand {
        command: uvx,
        args: vec!["mcp-server-git".to_string()],
    })
}

fn find_git_root(path: &Path) -> Option<PathBuf> {
    let mut current = path.to_path_buf();

    loop {
        let git_dir = current.join(".git");
        if git_dir.exists() {
            return Some(current);
        }

        if !current.pop() {
            return None;
        }
    }
}

async fn create_session_on_connection(
    connection: Arc<Mutex<ConnectionTo<Agent>>>,
    cwd: PathBuf,
    mcp_servers: Vec<McpServer>,
) -> Result<(SessionId, Vec<Value>), String> {
    let mut new_session_req = NewSessionRequest::new(cwd);
    new_session_req.mcp_servers = mcp_servers;
    let cx = connection.lock().await;
    let response: NewSessionResponse = cx
        .send_request::<NewSessionRequest>(new_session_req)
        .block_task()
        .await
        .map_err(|e| format!("Failed to create ACP session: {e}"))?;
    let config_options = response
        .config_options
        .as_ref()
        .and_then(|options| serde_json::to_value(options).ok())
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    Ok((response.session_id, config_options))
}

#[derive(Clone)]
pub(crate) struct AcpAppEvent {
    pub(crate) workspace_id: String,
    pub(crate) message: Value,
}

pub(crate) type AcpEventEmitter = Arc<dyn Fn(AcpAppEvent) + Send + Sync + 'static>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpPromptStreamIds {
    pub(crate) sequence: u64,
    pub(crate) user_item_id: String,
    pub(crate) agent_item_id: String,
    pub(crate) thought_item_id: String,
}

#[derive(Default)]
pub(crate) struct SessionManager {
    connections: Arc<Mutex<HashMap<String, Arc<Mutex<ConnectionTo<Agent>>>>>>,
    session_ids: Arc<Mutex<HashMap<String, SessionId>>>,
    agent_runtimes: Arc<Mutex<HashMap<String, AgentRuntime>>>,
    tasks: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
    message_streams: Arc<StdMutex<HashMap<String, AcpMessageStreamState>>>,
    session_config_options: Arc<Mutex<HashMap<String, Vec<Value>>>>,
    summaries: Arc<Mutex<HashMap<String, Vec<AcpThreadSummary>>>>,
    summaries_path: Option<PathBuf>,
}

impl SessionManager {
    #[allow(dead_code)]
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn with_summaries_path(path: PathBuf) -> Self {
        Self {
            summaries: Arc::new(Mutex::new(read_summaries(&path))),
            summaries_path: Some(path),
            ..Self::default()
        }
    }

    pub(crate) async fn create_session(
        &self,
        workspace_id: String,
        cwd: PathBuf,
        runtime: AgentRuntime,
        api_key: Option<String>,
        custom_harnesses: Vec<AcpHarnessConfig>,
        mcp_servers: Vec<McpServer>,
        emit_event: AcpEventEmitter,
    ) -> Result<SessionId, String> {
        if let Some(connection) = self.reusable_connection(&workspace_id, &runtime).await {
            match create_session_on_connection(connection, cwd.clone(), mcp_servers.clone()).await {
                Ok((session_id, config_options)) => {
                    self.session_ids
                        .lock()
                        .await
                        .insert(workspace_id.clone(), session_id.clone());
                    self.session_config_options
                        .lock()
                        .await
                        .insert(workspace_id.clone(), config_options);
                    self.upsert_summary(
                        &workspace_id,
                        AcpThreadSummary::new(
                            session_id.to_string(),
                            "Session".to_string(),
                            Some(runtime.as_id().to_string()),
                        ),
                    )
                    .await?;
                    return Ok(session_id);
                }
                Err(_) => {
                    drop(self.remove_session(&workspace_id).await);
                }
            }
        }

        let agent_config = AgentConfig::resolve(runtime.clone(), api_key, &custom_harnesses)?;

        if !agent_config.is_available() {
            let release_hint = match runtime {
                AgentRuntime::Codex => {
                    "Please ensure the native codex-acp binary is bundled for this platform or codex-acp is on PATH."
                }
                AgentRuntime::Claude => {
                    "claude-agent-acp requires Node.js. Packaged releases must bundle a Node runtime in the resource bin directory or declare Node.js as a release prerequisite."
                }
                AgentRuntime::Custom(_) => {
                    "Please ensure the custom ACP harness command is installed and available on PATH."
                }
            };
            return Err(format!(
                "{} adapter not available. {release_hint}",
                runtime.as_id(),
            ));
        }

        let notification_workspace_id = workspace_id.clone();
        let notification_emitter = emit_event.clone();
        let notification_summaries = self.summaries.clone();
        let notification_summaries_path = self.summaries_path.clone();
        let notification_message_streams = self.message_streams.clone();
        let client = Client
            .builder()
            .name("trantor-client")
            .on_receive_notification(
                async move |notification: SessionNotification, _cx| {
                    if let SessionUpdate::SessionInfoUpdate(info) = &notification.update {
                        if let Some(title) = info
                            .title
                            .as_opt_ref()
                            .flatten()
                            .filter(|title| !title.trim().is_empty())
                        {
                            let _ = persist_summary_title(
                                &notification_summaries,
                                notification_summaries_path.as_ref(),
                                &notification_workspace_id,
                                &notification.session_id.to_string(),
                                title.clone(),
                            )
                            .await;
                        }
                    }
                    if let Some(message) = map_session_notification(
                        &notification_workspace_id,
                        notification,
                        &notification_message_streams,
                        false,
                    ) {
                        notification_emitter(AcpAppEvent {
                            workspace_id: notification_workspace_id.clone(),
                            message,
                        });
                    }
                    Ok(())
                },
                on_receive_notification!(),
            )
            .on_receive_request(
                async move |request: RequestPermissionRequest,
                            responder: Responder<RequestPermissionResponse>,
                            _cx| {
                    let response = select_permission_response(request);
                    responder.respond(response)?;
                    Ok(())
                },
                on_receive_request!(),
            );

        let agent = agent_config.to_connectable();
        let (ready_tx, ready_rx) =
            oneshot::channel::<Result<(SessionId, ConnectionTo<Agent>, Vec<Value>), String>>();
        let ready_tx = Arc::new(StdMutex::new(Some(ready_tx)));
        let ready_tx_for_connection = ready_tx.clone();
        let ready_tx_for_failure = ready_tx.clone();

        let task = tokio::spawn(async move {
            let result = client
                .connect_with(agent, async move |cx: ConnectionTo<Agent>| {
                    cx.send_request(initialize_request())
                        .block_task()
                        .await
                        .map_err(agent_client_protocol::Error::into_internal_error)?;

                    let mut new_session_req = NewSessionRequest::new(cwd);
                    new_session_req.mcp_servers = mcp_servers;
                    let response: NewSessionResponse = cx
                        .send_request::<NewSessionRequest>(new_session_req)
                        .block_task()
                        .await
                        .map_err(agent_client_protocol::Error::into_internal_error)?;

                    let session_id = response.session_id.clone();
                    let config_options = response
                        .config_options
                        .as_ref()
                        .and_then(|options| serde_json::to_value(options).ok())
                        .and_then(|value| value.as_array().cloned())
                        .unwrap_or_default();
                    if let Some(tx) = ready_tx_for_connection
                        .lock()
                        .ok()
                        .and_then(|mut tx| tx.take())
                    {
                        let _ = tx.send(Ok((session_id, cx.clone(), config_options)));
                    }

                    std::future::pending::<Result<(), agent_client_protocol::Error>>().await
                })
                .await;

            if let Err(err) = result {
                if let Some(tx) = ready_tx_for_failure
                    .lock()
                    .ok()
                    .and_then(|mut tx| tx.take())
                {
                    let _ = tx.send(Err(format!("Failed to create ACP connection: {err}")));
                }
            }
        });

        let ready_result = timeout(ACP_STARTUP_TIMEOUT, ready_rx).await.map_err(|_| {
            task.abort();
            format!(
                "Timed out creating ACP connection after {} seconds",
                ACP_STARTUP_TIMEOUT.as_secs()
            )
        })?;
        let (session_id, connection, config_options) = ready_result.map_err(|_| {
            task.abort();
            "Failed to create ACP connection: connection task exited".to_string()
        })??;

        let mut conns = self.connections.lock().await;
        let mut ids = self.session_ids.lock().await;
        let mut runtimes = self.agent_runtimes.lock().await;
        let mut tasks = self.tasks.lock().await;

        conns.insert(workspace_id.clone(), Arc::new(Mutex::new(connection)));
        ids.insert(workspace_id.clone(), session_id.clone());
        self.session_config_options
            .lock()
            .await
            .insert(workspace_id.clone(), config_options);
        let runtime_id = runtime.as_id().to_string();
        runtimes.insert(workspace_id.clone(), runtime);
        let old_task = tasks.insert(workspace_id.clone(), task);
        if let Some(old_task) = old_task {
            old_task.abort();
        }

        self.upsert_summary(
            &workspace_id,
            AcpThreadSummary::new(
                session_id.to_string(),
                "Session".to_string(),
                Some(runtime_id),
            ),
        )
        .await?;

        Ok(session_id)
    }

    pub(crate) async fn load_session(
        &self,
        workspace_id: String,
        thread_id: String,
        cwd: PathBuf,
        runtime: AgentRuntime,
        api_key: Option<String>,
        custom_harnesses: Vec<AcpHarnessConfig>,
        mcp_servers: Vec<McpServer>,
        emit_event: AcpEventEmitter,
    ) -> Result<(), String> {
        if self
            .get_session_id(&workspace_id)
            .await
            .is_some_and(|active_id| active_id.to_string() == thread_id)
        {
            return Ok(());
        }

        let session_id = SessionId::new(thread_id.clone());
        let agent_config = AgentConfig::resolve(runtime.clone(), api_key, &custom_harnesses)?;

        if !agent_config.is_available() {
            let release_hint = match runtime {
                AgentRuntime::Codex => {
                    "Please ensure the native codex-acp binary is bundled for this platform or codex-acp is on PATH."
                }
                AgentRuntime::Claude => {
                    "claude-agent-acp requires Node.js. Packaged releases must bundle a Node runtime in the resource bin directory or declare Node.js as a release prerequisite."
                }
                AgentRuntime::Custom(_) => {
                    "Please ensure the custom ACP harness command is installed and available on PATH."
                }
            };
            return Err(format!(
                "{} adapter not available. {release_hint}",
                runtime.as_id(),
            ));
        }

        let notification_workspace_id = workspace_id.clone();
        let notification_emitter = emit_event.clone();
        let notification_summaries = self.summaries.clone();
        let notification_summaries_path = self.summaries_path.clone();
        let notification_message_streams = self.message_streams.clone();
        let is_history_replay = Arc::new(AtomicBool::new(true));
        let notification_history_replay = is_history_replay.clone();
        let client = Client
            .builder()
            .name("trantor-client")
            .on_receive_notification(
                async move |notification: SessionNotification, _cx| {
                    if let SessionUpdate::SessionInfoUpdate(info) = &notification.update {
                        if let Some(title) = info
                            .title
                            .as_opt_ref()
                            .flatten()
                            .filter(|title| !title.trim().is_empty())
                        {
                            let _ = persist_summary_title(
                                &notification_summaries,
                                notification_summaries_path.as_ref(),
                                &notification_workspace_id,
                                &notification.session_id.to_string(),
                                title.clone(),
                            )
                            .await;
                        }
                    }
                    if let Some(message) = map_session_notification(
                        &notification_workspace_id,
                        notification,
                        &notification_message_streams,
                        notification_history_replay.load(Ordering::SeqCst),
                    ) {
                        notification_emitter(AcpAppEvent {
                            workspace_id: notification_workspace_id.clone(),
                            message,
                        });
                    }
                    Ok(())
                },
                on_receive_notification!(),
            )
            .on_receive_request(
                async move |request: RequestPermissionRequest,
                            responder: Responder<RequestPermissionResponse>,
                            _cx| {
                    let response = select_permission_response(request);
                    responder.respond(response)?;
                    Ok(())
                },
                on_receive_request!(),
            );

        let agent = agent_config.to_connectable();
        let (ready_tx, ready_rx) =
            oneshot::channel::<Result<(ConnectionTo<Agent>, Vec<Value>), String>>();
        let ready_tx = Arc::new(StdMutex::new(Some(ready_tx)));
        let ready_tx_for_connection = ready_tx.clone();
        let ready_tx_for_failure = ready_tx.clone();
        let session_id_for_connection = session_id.clone();

        let task = tokio::spawn(async move {
            let result = client
                .connect_with(agent, async move |cx: ConnectionTo<Agent>| {
                    let init_response = cx
                        .send_request::<InitializeRequest>(initialize_request())
                        .block_task()
                        .await
                        .map_err(agent_client_protocol::Error::into_internal_error)?;

                    if !init_response.agent_capabilities.load_session {
                        return Err(agent_client_protocol::util::internal_error(
                            "ACP agent does not support session/load",
                        ));
                    }

                    let mut load_session_req =
                        LoadSessionRequest::new(session_id_for_connection, cwd);
                    load_session_req.mcp_servers = mcp_servers;
                    let response = cx
                        .send_request::<LoadSessionRequest>(load_session_req)
                        .block_task()
                        .await
                        .map_err(agent_client_protocol::Error::into_internal_error)?;
                    let response: LoadSessionResponse = response;
                    let config_options = response
                        .config_options
                        .as_ref()
                        .and_then(|options| serde_json::to_value(options).ok())
                        .and_then(|value| value.as_array().cloned())
                        .unwrap_or_default();
                    is_history_replay.store(false, Ordering::SeqCst);

                    if let Some(tx) = ready_tx_for_connection
                        .lock()
                        .ok()
                        .and_then(|mut tx| tx.take())
                    {
                        let _ = tx.send(Ok((cx.clone(), config_options)));
                    }

                    std::future::pending::<Result<(), agent_client_protocol::Error>>().await
                })
                .await;

            if let Err(err) = result {
                if let Some(tx) = ready_tx_for_failure
                    .lock()
                    .ok()
                    .and_then(|mut tx| tx.take())
                {
                    let _ = tx.send(Err(format!("Failed to load ACP session: {err}")));
                }
            }
        });

        let ready_result = timeout(ACP_STARTUP_TIMEOUT, ready_rx).await.map_err(|_| {
            task.abort();
            format!(
                "Timed out loading ACP session after {} seconds",
                ACP_STARTUP_TIMEOUT.as_secs()
            )
        })?;
        let (connection, config_options) = ready_result.map_err(|_| {
            task.abort();
            "Failed to load ACP session: connection task exited".to_string()
        })??;

        let mut conns = self.connections.lock().await;
        let mut ids = self.session_ids.lock().await;
        let mut runtimes = self.agent_runtimes.lock().await;
        let mut tasks = self.tasks.lock().await;

        conns.insert(workspace_id.clone(), Arc::new(Mutex::new(connection)));
        ids.insert(workspace_id.clone(), session_id);
        self.session_config_options
            .lock()
            .await
            .insert(workspace_id.clone(), config_options);
        runtimes.insert(workspace_id.clone(), runtime);
        let old_task = tasks.insert(workspace_id, task);
        if let Some(old_task) = old_task {
            old_task.abort();
        }

        Ok(())
    }

    pub(crate) async fn discover_session_config(
        &self,
        cwd: PathBuf,
        runtime: AgentRuntime,
        api_key: Option<String>,
        custom_harnesses: Vec<AcpHarnessConfig>,
        mcp_servers: Vec<McpServer>,
    ) -> Result<Vec<Value>, String> {
        let agent_config = AgentConfig::resolve(runtime.clone(), api_key, &custom_harnesses)?;
        if !agent_config.is_available() {
            return Err(format!(
                "{} adapter not available. Please ensure the ACP harness command is installed and available on PATH.",
                runtime.as_id(),
            ));
        }

        let client = Client.builder().name("trantor-client");
        let agent = agent_config.to_connectable();
        let (ready_tx, ready_rx) = oneshot::channel::<Result<Vec<Value>, String>>();
        let ready_tx = Arc::new(StdMutex::new(Some(ready_tx)));
        let ready_tx_for_connection = ready_tx.clone();
        let ready_tx_for_failure = ready_tx.clone();

        let task = tokio::spawn(async move {
            let result = client
                .connect_with(agent, async move |cx: ConnectionTo<Agent>| {
                    cx.send_request(initialize_request())
                        .block_task()
                        .await
                        .map_err(agent_client_protocol::Error::into_internal_error)?;

                    let mut new_session_req = NewSessionRequest::new(cwd);
                    new_session_req.mcp_servers = mcp_servers;
                    let response: NewSessionResponse = cx
                        .send_request::<NewSessionRequest>(new_session_req)
                        .block_task()
                        .await
                        .map_err(agent_client_protocol::Error::into_internal_error)?;

                    let config_options = response
                        .config_options
                        .as_ref()
                        .and_then(|options| serde_json::to_value(options).ok())
                        .and_then(|value| value.as_array().cloned())
                        .unwrap_or_default();
                    if let Some(tx) = ready_tx_for_connection
                        .lock()
                        .ok()
                        .and_then(|mut tx| tx.take())
                    {
                        let _ = tx.send(Ok(config_options));
                    }

                    std::future::pending::<Result<(), agent_client_protocol::Error>>().await
                })
                .await;

            if let Err(err) = result {
                if let Some(tx) = ready_tx_for_failure
                    .lock()
                    .ok()
                    .and_then(|mut tx| tx.take())
                {
                    let _ = tx.send(Err(format!("Failed to discover ACP config: {err}")));
                }
            }
        });

        let ready_result = timeout(ACP_STARTUP_TIMEOUT, ready_rx).await.map_err(|_| {
            task.abort();
            format!(
                "Timed out discovering ACP config after {} seconds",
                ACP_STARTUP_TIMEOUT.as_secs()
            )
        })?;
        task.abort();
        ready_result.map_err(|_| "Failed to discover ACP config: connection task exited".to_string())?
    }

    pub(crate) async fn set_common_session_config(
        &self,
        workspace_id: &str,
        model: Option<&str>,
        effort: Option<&str>,
    ) -> Result<(), String> {
        if let Some(model) = model.filter(|value| !value.trim().is_empty()) {
            self.set_session_config_by_category(workspace_id, "model", model.trim())
                .await?;
        }
        if let Some(effort) = effort.filter(|value| !value.trim().is_empty()) {
            self.set_session_config_by_category(workspace_id, "thought_level", effort.trim())
                .await?;
        }
        Ok(())
    }

    async fn set_session_config_by_category(
        &self,
        workspace_id: &str,
        category: &str,
        value: &str,
    ) -> Result<(), String> {
        let config_id = {
            let config_options = self.session_config_options.lock().await;
            let Some(options) = config_options.get(workspace_id) else {
                return Ok(());
            };
            find_config_id_by_category(options, category)
        };
        let Some(config_id) = config_id else {
            return Ok(());
        };
        let connection = self
            .connections
            .lock()
            .await
            .get(workspace_id)
            .cloned()
            .ok_or("No ACP connection for workspace")?;
        let session_id = self
            .session_ids
            .lock()
            .await
            .get(workspace_id)
            .cloned()
            .ok_or("No ACP session for workspace")?;
        let cx = connection.lock().await;
        let request = SetSessionConfigOptionRequest::new(session_id, config_id, value.to_string());
        let response: Value = cx
            .send_request::<UntypedMessage>(
                UntypedMessage::new("session/set_config_option", request)
                    .map_err(|e| format!("Failed to encode ACP session config request: {e}"))?,
            )
            .block_task()
            .await
            .map_err(|e| format!("Failed to set ACP session config: {e}"))?;
        if let Some(config_options) = config_options_from_value(&response) {
            self.session_config_options
                .lock()
                .await
                .insert(workspace_id.to_string(), config_options);
        }
        Ok(())
    }

    pub(crate) async fn send_prompt(
        &self,
        workspace_id: &str,
        thread_id: Option<&str>,
        content: Vec<ContentBlock>,
    ) -> Result<AcpPromptStreamIds, String> {
        let connections = self.connections.lock().await;
        let connection = connections
            .get(workspace_id)
            .ok_or("No ACP connection for workspace")?;
        let session_ids = self.session_ids.lock().await;
        let session_id = session_ids
            .get(workspace_id)
            .ok_or("No ACP session for workspace")?
            .clone();
        if let Some(thread_id) = thread_id {
            if session_id.to_string() != thread_id {
                return Err("ACP session is not active for this workspace".to_string());
            }
        }
        let stream_ids =
            start_prompt_stream(&self.message_streams, workspace_id, &session_id.to_string());

        let cx = connection.lock().await;
        cx.send_request::<PromptRequest>(PromptRequest::new(session_id, content))
            .block_task()
            .await
            .map_err(|e| format!("Failed to send ACP prompt: {e}"))?;

        Ok(stream_ids)
    }

    pub(crate) async fn cancel(
        &self,
        workspace_id: &str,
        thread_id: Option<&str>,
    ) -> Result<(), String> {
        let connections = self.connections.lock().await;
        let connection = connections
            .get(workspace_id)
            .ok_or("No ACP connection for workspace")?;
        let session_ids = self.session_ids.lock().await;
        let session_id = session_ids
            .get(workspace_id)
            .ok_or("No ACP session for workspace")?
            .clone();
        if let Some(thread_id) = thread_id {
            if session_id.to_string() != thread_id {
                return Err("ACP session is not active for this workspace".to_string());
            }
        }

        let cx = connection.lock().await;
        cx.send_notification(CancelNotification::new(session_id))
            .map_err(|e| format!("Failed to cancel ACP turn: {e}"))?;

        Ok(())
    }

    pub(crate) async fn get_session_id(&self, workspace_id: &str) -> Option<SessionId> {
        self.session_ids.lock().await.get(workspace_id).cloned()
    }

    async fn reusable_connection(
        &self,
        workspace_id: &str,
        runtime: &AgentRuntime,
    ) -> Option<Arc<Mutex<ConnectionTo<Agent>>>> {
        let current_runtime = self.agent_runtimes.lock().await.get(workspace_id).cloned();
        if current_runtime.as_ref() != Some(runtime) {
            return None;
        }
        self.connections.lock().await.get(workspace_id).cloned()
    }

    pub(crate) async fn ensure_active_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
    ) -> Result<(), String> {
        let active_session_id = self
            .get_session_id(workspace_id)
            .await
            .ok_or("No active ACP session for workspace")?;
        if active_session_id.to_string() != thread_id {
            return Err("ACP session is not active for this workspace".to_string());
        }
        Ok(())
    }

    pub(crate) async fn list_thread_summaries(&self, workspace_id: &str) -> Vec<AcpThreadSummary> {
        self.summaries
            .lock()
            .await
            .get(workspace_id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|summary| !summary.archived)
            .collect()
    }

    pub(crate) async fn list_archived_thread_summaries(
        &self,
        workspace_id: &str,
    ) -> Vec<AcpThreadSummary> {
        self.summaries
            .lock()
            .await
            .get(workspace_id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|summary| summary.archived)
            .collect()
    }

    pub(crate) async fn get_thread_summary_including_archived(
        &self,
        workspace_id: &str,
        thread_id: &str,
    ) -> Option<AcpThreadSummary> {
        self.summaries
            .lock()
            .await
            .get(workspace_id)?
            .iter()
            .find(|summary| summary.id == thread_id)
            .cloned()
    }

    pub(crate) async fn rename_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
        name: String,
    ) -> Result<(), String> {
        let mut summaries = self.summaries.lock().await;
        let workspace_summaries = summaries
            .get_mut(workspace_id)
            .ok_or("ACP thread not found")?;
        let summary = workspace_summaries
            .iter_mut()
            .find(|summary| summary.id == thread_id)
            .ok_or("ACP thread not found")?;
        summary.name = name;
        summary.updated_at = now_ms();
        self.persist_summaries(&summaries)
    }

    pub(crate) async fn archive_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
    ) -> Result<(), String> {
        if self
            .get_session_id(workspace_id)
            .await
            .is_some_and(|active_id| active_id.to_string() == thread_id)
        {
            drop(self.remove_session(workspace_id).await);
        }
        let mut summaries = self.summaries.lock().await;
        if let Some(workspace_summaries) = summaries.get_mut(workspace_id) {
            if let Some(summary) = workspace_summaries
                .iter_mut()
                .find(|summary| summary.id == thread_id)
            {
                summary.archived = true;
                summary.updated_at = now_ms();
            }
        }
        self.persist_summaries(&summaries)
    }

    pub(crate) async fn discard_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
    ) -> Result<(), String> {
        if self
            .get_session_id(workspace_id)
            .await
            .is_some_and(|active_id| active_id.to_string() == thread_id)
        {
            drop(self.remove_session(workspace_id).await);
        }
        let mut summaries = self.summaries.lock().await;
        if let Some(workspace_summaries) = summaries.get_mut(workspace_id) {
            workspace_summaries.retain(|summary| summary.id != thread_id);
        }
        self.persist_summaries(&summaries)
    }

    pub(crate) async fn remove_session(&self, workspace_id: &str) -> Option<SessionId> {
        let mut conns = self.connections.lock().await;
        let mut ids = self.session_ids.lock().await;
        let mut runtimes = self.agent_runtimes.lock().await;
        let mut tasks = self.tasks.lock().await;

        conns.remove(workspace_id);
        runtimes.remove(workspace_id);
        if let Ok(mut streams) = self.message_streams.lock() {
            streams.remove(workspace_id);
        }
        if let Some(task) = tasks.remove(workspace_id) {
            task.abort();
        }
        ids.remove(workspace_id)
    }

    async fn upsert_summary(
        &self,
        workspace_id: &str,
        summary: AcpThreadSummary,
    ) -> Result<(), String> {
        let mut summaries = self.summaries.lock().await;
        let workspace_summaries = summaries.entry(workspace_id.to_string()).or_default();
        if let Some(existing) = workspace_summaries
            .iter_mut()
            .find(|existing| existing.id == summary.id)
        {
            if summary.name != "Session" || existing.name == "Session" {
                existing.name = summary.name;
            }
            if summary.runtime.is_some() {
                existing.runtime = summary.runtime;
            }
            existing.updated_at = summary.updated_at;
            existing.archived = false;
        } else {
            workspace_summaries.push(summary);
        }
        self.persist_summaries(&summaries)
    }

    fn persist_summaries(
        &self,
        summaries: &HashMap<String, Vec<AcpThreadSummary>>,
    ) -> Result<(), String> {
        write_summaries(self.summaries_path.as_ref(), summaries)
    }
}

async fn persist_summary_title(
    summaries: &Arc<Mutex<HashMap<String, Vec<AcpThreadSummary>>>>,
    summaries_path: Option<&PathBuf>,
    workspace_id: &str,
    thread_id: &str,
    title: String,
) -> Result<(), String> {
    let mut summaries = summaries.lock().await;
    let workspace_summaries = summaries.entry(workspace_id.to_string()).or_default();
    let Some(summary) = workspace_summaries
        .iter_mut()
        .find(|summary| summary.id == thread_id)
    else {
        workspace_summaries.insert(0, AcpThreadSummary::new(thread_id.to_string(), title, None));
        return write_summaries(summaries_path, &summaries);
    };
    summary.name = title;
    summary.updated_at = now_ms();
    write_summaries(summaries_path, &summaries)
}

fn write_summaries(
    summaries_path: Option<&PathBuf>,
    summaries: &HashMap<String, Vec<AcpThreadSummary>>,
) -> Result<(), String> {
    let Some(path) = summaries_path else {
        return Ok(());
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(summaries).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpThreadSummary {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created_at: i64,
    pub(crate) updated_at: i64,
    #[serde(default)]
    pub(crate) runtime: Option<String>,
    #[serde(default)]
    pub(crate) archived: bool,
}

impl AcpThreadSummary {
    fn new(id: String, name: String, runtime: Option<String>) -> Self {
        let now = now_ms();
        Self {
            id,
            name,
            created_at: now,
            updated_at: now,
            runtime,
            archived: false,
        }
    }

    pub(crate) fn to_list_item(&self, workspace_id: &str) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "preview": self.name,
            "workspaceId": workspace_id,
            "workspace_id": workspace_id,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "runtime": self.runtime,
        })
    }

    pub(crate) fn to_loaded_thread_payload(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "preview": self.name,
            "items": [],
            "resumable": true,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "runtime": self.runtime,
        })
    }
}

pub(crate) fn content_from_text_and_images(
    text: String,
    images: Vec<String>,
) -> Result<Vec<ContentBlock>, String> {
    let mut content = vec![ContentBlock::Text(TextContent::new(text))];
    for image in images {
        let mime_type = infer_image_mime_type(&image);
        if image.starts_with("http://") || image.starts_with("https://") {
            let mut image_content = ImageContent::new("", mime_type);
            image_content.uri = Some(image);
            content.push(ContentBlock::Image(image_content));
        } else if image.starts_with("data:") {
            content.push(ContentBlock::Image(ImageContent::new(image, mime_type)));
        } else {
            let data =
                std::fs::read(&image).map_err(|e| format!("Failed to read image {image}: {e}"))?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(data);
            content.push(ContentBlock::Image(ImageContent::new(
                format!("data:{mime_type};base64,{b64}"),
                mime_type,
            )));
        }
    }
    Ok(content)
}

fn infer_image_mime_type(image: &str) -> String {
    if let Some(mime_type) = parse_data_url_mime_type(image) {
        return mime_type;
    }

    let path = image
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(image)
        .split(['?', '#'])
        .next()
        .unwrap_or(image);
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg" | "jfif" | "pjpeg" | "pjp") => "image/jpeg".to_string(),
        Some("png") => "image/png".to_string(),
        Some("gif") => "image/gif".to_string(),
        Some("webp") => "image/webp".to_string(),
        Some("bmp") => "image/bmp".to_string(),
        Some("svg") | Some("svgz") => "image/svg+xml".to_string(),
        Some("heic") => "image/heic".to_string(),
        Some("heif") => "image/heif".to_string(),
        Some("avif") => "image/avif".to_string(),
        _ => "image/png".to_string(),
    }
}

fn parse_data_url_mime_type(image: &str) -> Option<String> {
    let rest = image.strip_prefix("data:")?;
    let metadata = rest.split_once(',')?.0;
    let mime_type = metadata.split(';').next().unwrap_or("").trim();
    if mime_type.is_empty() {
        None
    } else {
        Some(mime_type.to_string())
    }
}

fn read_summaries(path: &Path) -> HashMap<String, Vec<AcpThreadSummary>> {
    let Ok(data) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str(&data).unwrap_or_default()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn select_permission_response(request: RequestPermissionRequest) -> RequestPermissionResponse {
    let selected = request
        .options
        .iter()
        .find(|option| option.option_id.0.as_ref() == "allow")
        .or_else(|| request.options.first());

    match selected {
        Some(option) => RequestPermissionResponse::new(RequestPermissionOutcome::Selected(
            SelectedPermissionOutcome::new(PermissionOptionId::new(option.option_id.0.clone())),
        )),
        None => RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled),
    }
}

#[derive(Default)]
struct AcpMessageStreamState {
    sequence: u64,
    user_item_id: String,
    agent_item_id: String,
    thought_item_id: String,
    user_content: Vec<Value>,
}

fn start_prompt_stream(
    streams: &Arc<StdMutex<HashMap<String, AcpMessageStreamState>>>,
    workspace_id: &str,
    session_id: &str,
) -> AcpPromptStreamIds {
    let Ok(mut streams) = streams.lock() else {
        return AcpPromptStreamIds {
            sequence: 1,
            user_item_id: format!("user-message-{session_id}-1"),
            agent_item_id: format!("agent-message-{session_id}-1"),
            thought_item_id: format!("agent-thought-{session_id}-1"),
        };
    };
    let state = streams.entry(workspace_id.to_string()).or_default();
    state.sequence = state.sequence.saturating_add(1).max(1);
    let sequence = state.sequence;
    state.user_item_id = format!("user-message-{session_id}-{sequence}");
    state.agent_item_id = format!("agent-message-{session_id}-{sequence}");
    state.thought_item_id = format!("agent-thought-{session_id}-{sequence}");
    state.user_content.clear();
    AcpPromptStreamIds {
        sequence,
        user_item_id: state.user_item_id.clone(),
        agent_item_id: state.agent_item_id.clone(),
        thought_item_id: state.thought_item_id.clone(),
    }
}

fn ensure_prompt_stream<'a>(
    streams: &'a mut HashMap<String, AcpMessageStreamState>,
    workspace_id: &str,
    session_id: &str,
) -> &'a mut AcpMessageStreamState {
    let state = streams.entry(workspace_id.to_string()).or_default();
    if state.sequence == 0 {
        state.sequence = 1;
        state.user_item_id = format!("user-message-{session_id}-1");
        state.agent_item_id = format!("agent-message-{session_id}-1");
        state.thought_item_id = format!("agent-thought-{session_id}-1");
    }
    state
}

fn stream_item_id(
    streams: &Arc<StdMutex<HashMap<String, AcpMessageStreamState>>>,
    workspace_id: &str,
    session_id: &str,
    role: &str,
) -> String {
    let Ok(mut streams) = streams.lock() else {
        return format!("{role}-{session_id}-1");
    };
    let state = ensure_prompt_stream(&mut streams, workspace_id, session_id);
    match role {
        "agent-message" => state.agent_item_id.clone(),
        "agent-thought" => state.thought_item_id.clone(),
        "user-message" => state.user_item_id.clone(),
        _ => format!("{role}-{session_id}-{}", state.sequence),
    }
}

fn chunk_item_id(chunk: &ContentChunk, role: &str) -> Option<String> {
    let message_id = chunk.message_id.as_deref()?.trim();
    if message_id.is_empty() {
        return None;
    }
    Some(format!("{role}-{message_id}"))
}

fn user_message_content_for_chunk(
    streams: &Arc<StdMutex<HashMap<String, AcpMessageStreamState>>>,
    workspace_id: &str,
    session_id: &str,
    content: &ContentBlock,
) -> (String, Vec<Value>) {
    let Ok(mut streams) = streams.lock() else {
        return (
            format!("user-message-{session_id}-1"),
            vec![serde_json::to_value(content).unwrap_or(Value::Null)],
        );
    };
    let state = ensure_prompt_stream(&mut streams, workspace_id, session_id);
    if let ContentBlock::Text(text) = content {
        let existing = state
            .user_content
            .iter()
            .position(|entry| entry.get("type").and_then(Value::as_str) == Some("text"));
        match existing {
            Some(index) => {
                let current = state.user_content[index]
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                state.user_content[index] = json!({
                    "type": "text",
                    "text": format!("{current}{}", text.text),
                });
            }
            None => state.user_content.push(json!({
                "type": "text",
                "text": text.text.clone(),
            })),
        }
    } else if let Ok(value) = serde_json::to_value(content) {
        state.user_content.push(value);
    }
    (state.user_item_id.clone(), state.user_content.clone())
}

fn map_session_notification(
    workspace_id: &str,
    notification: SessionNotification,
    message_streams: &Arc<StdMutex<HashMap<String, AcpMessageStreamState>>>,
    history_replay: bool,
) -> Option<Value> {
    let thread_id = notification.session_id.to_string();
    let session_id = thread_id.clone();
    let base = json!({
        "workspaceId": workspace_id,
        "threadId": thread_id,
        "sessionId": session_id,
        "historyReplay": history_replay,
    });

    let message = match notification.update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            let item_id = chunk_item_id(&chunk, "agent-message").unwrap_or_else(|| {
                stream_item_id(message_streams, workspace_id, &session_id, "agent-message")
            });
            json!({
                "method": "agent_message_chunk",
                "params": merge_params(base, json!({
                    "itemId": item_id,
                    "content": chunk.content,
                })),
            })
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            let item_id = chunk_item_id(&chunk, "agent-thought").unwrap_or_else(|| {
                stream_item_id(message_streams, workspace_id, &session_id, "agent-thought")
            });
            json!({
                "method": "agent_thought_chunk",
                "params": merge_params(base, json!({
                    "itemId": item_id,
                    "content": chunk.content,
                })),
            })
        }
        SessionUpdate::UserMessageChunk(chunk) => {
            let (item_id, content) = user_message_content_for_chunk(
                message_streams,
                workspace_id,
                &session_id,
                &chunk.content,
            );
            json!({
                "method": "user_message_chunk",
                "params": merge_params(base, json!({
                    "itemId": item_id,
                    "content": content,
                })),
            })
        }
        SessionUpdate::ToolCall(tool_call) => {
            let item_id = tool_call.tool_call_id.to_string();
            json!({
                "method": "tool_call",
                "params": merge_params(base, json!({
                    "itemId": item_id,
                    "toolCall": tool_call,
                })),
            })
        }
        SessionUpdate::ToolCallUpdate(update) => {
            let item_id = update.tool_call_id.to_string();
            json!({
                "method": "tool_call_update",
                "params": merge_params(base, json!({
                    "itemId": item_id,
                    "update": update,
                })),
            })
        }
        SessionUpdate::Plan(plan) => json!({
            "method": "plan",
            "params": merge_params(base, json!({
                "itemId": format!("plan-{}", notification.session_id),
                "plan": plan,
            })),
        }),
        SessionUpdate::SessionInfoUpdate(info) => json!({
            "method": "session_info_update",
            "params": merge_params(base, json!({
                "title": info.title,
                "session": info,
            })),
        }),
        SessionUpdate::AvailableCommandsUpdate(update) => json!({
            "method": "available_commands_update",
            "params": merge_params(base, json!({
                "availableCommands": update.available_commands,
            })),
        }),
        SessionUpdate::CurrentModeUpdate(update) => json!({
            "method": "current_mode_update",
            "params": merge_params(base, json!({
                "currentModeId": update.current_mode_id,
            })),
        }),
        SessionUpdate::ConfigOptionUpdate(update) => json!({
            "method": "config_option_update",
            "params": merge_params(base, json!({
                "configOptions": update.config_options,
            })),
        }),
        _ => return None,
    };

    Some(message)
}

fn merge_params(mut base: Value, extra: Value) -> Value {
    let Some(base_map) = base.as_object_mut() else {
        return extra;
    };
    if let Some(extra_map) = extra.as_object() {
        for (key, value) in extra_map {
            base_map.insert(key.clone(), value.clone());
        }
    }
    base
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol_schema::{ContentBlock, ContentChunk, TextContent};

    #[test]
    fn mcp_fallback_splits_npx_command_and_args() {
        let config = WorkspaceMcpConfig {
            filesystem: true,
            git: false,
            custom: vec![],
        };
        let servers = config.to_acp_servers(Path::new("/tmp"));
        let McpServer::Stdio(stdio) = &servers[0] else {
            panic!("expected stdio server");
        };
        if stdio.command == PathBuf::from("npx") {
            assert_eq!(stdio.args[0], "-y");
            assert_eq!(stdio.args[1], "@modelcontextprotocol/server-filesystem");
            assert_eq!(stdio.args[2], "/tmp");
        }
    }

    #[test]
    fn notification_mapping_includes_thread_and_item_ids() {
        let streams = Arc::new(StdMutex::new(HashMap::new()));
        start_prompt_stream(&streams, "workspace-1", "session-1");
        let notification = SessionNotification::new(
            "session-1",
            SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(
                TextContent::new("hello"),
            ))),
        );
        let message =
            map_session_notification("workspace-1", notification, &streams, false).unwrap();
        assert_eq!(message["method"], "agent_message_chunk");
        assert_eq!(message["params"]["threadId"], "session-1");
        assert_eq!(message["params"]["itemId"], "agent-message-session-1-1");
    }

    #[test]
    fn notification_mapping_uses_distinct_item_ids_for_prompt_streams() {
        let streams = Arc::new(StdMutex::new(HashMap::new()));
        start_prompt_stream(&streams, "workspace-1", "session-1");
        let first = map_session_notification(
            "workspace-1",
            SessionNotification::new(
                "session-1",
                SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(
                    TextContent::new("first"),
                ))),
            ),
            &streams,
            false,
        )
        .unwrap();

        start_prompt_stream(&streams, "workspace-1", "session-1");
        let second = map_session_notification(
            "workspace-1",
            SessionNotification::new(
                "session-1",
                SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(
                    TextContent::new("second"),
                ))),
            ),
            &streams,
            false,
        )
        .unwrap();

        assert_eq!(first["params"]["itemId"], "agent-message-session-1-1");
        assert_eq!(second["params"]["itemId"], "agent-message-session-1-2");
    }

    #[test]
    fn notification_mapping_uses_acp_message_ids_for_agent_message_boundaries() {
        let streams = Arc::new(StdMutex::new(HashMap::new()));
        start_prompt_stream(&streams, "workspace-1", "session-1");
        let first = map_session_notification(
            "workspace-1",
            SessionNotification::new(
                "session-1",
                SessionUpdate::AgentMessageChunk(
                    ContentChunk::new(ContentBlock::Text(TextContent::new("first")))
                        .message_id("11111111-1111-1111-1111-111111111111"),
                ),
            ),
            &streams,
            false,
        )
        .unwrap();
        let second = map_session_notification(
            "workspace-1",
            SessionNotification::new(
                "session-1",
                SessionUpdate::AgentMessageChunk(
                    ContentChunk::new(ContentBlock::Text(TextContent::new("second")))
                        .message_id("22222222-2222-2222-2222-222222222222"),
                ),
            ),
            &streams,
            false,
        )
        .unwrap();

        assert_eq!(
            first["params"]["itemId"],
            "agent-message-11111111-1111-1111-1111-111111111111",
        );
        assert_eq!(
            second["params"]["itemId"],
            "agent-message-22222222-2222-2222-2222-222222222222",
        );
    }

    #[test]
    fn notification_mapping_accumulates_user_message_chunks() {
        let streams = Arc::new(StdMutex::new(HashMap::new()));
        start_prompt_stream(&streams, "workspace-1", "session-1");
        let first = map_session_notification(
            "workspace-1",
            SessionNotification::new(
                "session-1",
                SessionUpdate::UserMessageChunk(ContentChunk::new(ContentBlock::Text(
                    TextContent::new("hello "),
                ))),
            ),
            &streams,
            false,
        )
        .unwrap();
        let second = map_session_notification(
            "workspace-1",
            SessionNotification::new(
                "session-1",
                SessionUpdate::UserMessageChunk(ContentChunk::new(ContentBlock::Text(
                    TextContent::new("world"),
                ))),
            ),
            &streams,
            false,
        )
        .unwrap();

        assert_eq!(first["params"]["itemId"], "user-message-session-1-1");
        assert_eq!(first["params"]["content"][0]["text"], "hello ");
        assert_eq!(second["params"]["itemId"], "user-message-session-1-1");
        assert_eq!(second["params"]["content"][0]["text"], "hello world");
    }

    #[test]
    fn image_content_preserves_data_url_mime_and_infers_file_mime() {
        let temp_dir =
            std::env::temp_dir().join(format!("trantor-acp-img-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let jpg_path = temp_dir.join("sample.jpg");
        std::fs::write(&jpg_path, [1_u8, 2, 3]).unwrap();

        let content = content_from_text_and_images(
            "hello".to_string(),
            vec![
                "data:image/webp;base64,abc".to_string(),
                "https://example.test/image.avif?cache=1".to_string(),
                jpg_path.to_string_lossy().to_string(),
            ],
        )
        .unwrap();

        assert_eq!(content.len(), 4);
        assert_eq!(
            serde_json::to_value(&content[1]).unwrap()["mimeType"],
            "image/webp"
        );
        let remote_image = serde_json::to_value(&content[2]).unwrap();
        assert_eq!(remote_image["mimeType"], "image/avif");
        assert_eq!(
            remote_image["uri"],
            "https://example.test/image.avif?cache=1"
        );
        let file_image = serde_json::to_value(&content[3]).unwrap();
        assert_eq!(file_image["mimeType"], "image/jpeg");
        assert!(file_image["data"]
            .as_str()
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));

        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn custom_agent_config_parses_start_command_and_env() {
        let config = AgentConfig::resolve(
            AgentRuntime::Custom("my-harness".to_string()),
            None,
            &[AcpHarnessConfig {
                id: "my-harness".to_string(),
                name: "My Harness".to_string(),
                icon: "bot".to_string(),
                start_command: "npx -y \"my acp\" --stdio".to_string(),
                env: vec![crate::types::AcpHarnessEnvVar {
                    name: "TOKEN".to_string(),
                    value: "secret".to_string(),
                }],
                models: Vec::new(),
                thinking_levels: Vec::new(),
            }],
        )
        .unwrap();

        assert_eq!(config.name, "my-harness");
        assert_eq!(config.path, PathBuf::from("npx"));
        assert_eq!(config.args, vec!["-y", "my acp", "--stdio"]);
        assert_eq!(config.env.get("TOKEN").map(String::as_str), Some("secret"));
    }

    #[test]
    fn custom_agent_config_rejects_missing_harness() {
        let error = AgentConfig::resolve(AgentRuntime::Custom("missing".to_string()), None, &[])
            .unwrap_err();

        assert!(error.contains("not configured"));
    }

    #[test]
    fn config_lookup_prefers_semantic_category() {
        let options = vec![
            json!({
                "id": "thinking",
                "name": "Thinking",
                "category": "thought_level",
                "type": "select",
                "currentValue": "medium",
                "options": [{ "value": "medium", "name": "Medium" }]
            }),
            json!({
                "id": "model",
                "name": "Model",
                "type": "select",
                "currentValue": "large",
                "options": [{ "value": "large", "name": "Large" }]
            }),
        ];

        assert_eq!(
            find_config_id_by_category(&options, "thought_level").as_deref(),
            Some("thinking"),
        );
        assert_eq!(
            find_config_id_by_category(&options, "model").as_deref(),
            Some("model"),
        );
    }

    #[test]
    fn config_options_from_value_accepts_empty_response() {
        assert!(config_options_from_value(&json!({})).is_none());
        assert_eq!(
            config_options_from_value(&json!({ "configOptions": [{ "id": "model" }] }))
                .unwrap(),
            vec![json!({ "id": "model" })],
        );
    }

    #[test]
    fn initialize_request_includes_client_info() {
        let request = initialize_request();
        let client_info = request.client_info.expect("client info");

        assert_eq!(client_info.name, ACP_CLIENT_NAME);
        assert!(!client_info.version.trim().is_empty());
    }

    #[tokio::test]
    async fn session_title_updates_are_persisted_to_summaries() {
        let temp_dir =
            std::env::temp_dir().join(format!("trantor-acp-title-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let path = temp_dir.join("acp_threads.json");

        let manager = SessionManager::with_summaries_path(path.clone());
        manager
            .upsert_summary(
                "workspace-1",
                AcpThreadSummary::new("thread-1".to_string(), "Session".to_string(), None),
            )
            .await
            .unwrap();
        persist_summary_title(
            &manager.summaries,
            manager.summaries_path.as_ref(),
            "workspace-1",
            "thread-1",
            "Investigate build".to_string(),
        )
        .await
        .unwrap();

        let reloaded = SessionManager::with_summaries_path(path);
        assert_eq!(
            reloaded
                .get_thread_summary_including_archived("workspace-1", "thread-1")
                .await
                .unwrap()
                .name,
            "Investigate build"
        );

        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[tokio::test]
    async fn acp_summary_persists_runtime() {
        let temp_dir =
            std::env::temp_dir().join(format!("trantor-acp-runtime-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let path = temp_dir.join("acp_threads.json");

        let manager = SessionManager::with_summaries_path(path.clone());
        manager
            .upsert_summary(
                "workspace-1",
                AcpThreadSummary::new(
                    "thread-1".to_string(),
                    "Session".to_string(),
                    Some("my-harness".to_string()),
                ),
            )
            .await
            .unwrap();

        let reloaded = SessionManager::with_summaries_path(path);
        assert_eq!(
            reloaded
                .get_thread_summary_including_archived("workspace-1", "thread-1")
                .await
                .unwrap()
                .runtime
                .as_deref(),
            Some("my-harness")
        );

        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[tokio::test]
    async fn persisted_summaries_support_list_rename_and_archive() {
        let temp_dir = std::env::temp_dir().join(format!("trantor-acp-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let path = temp_dir.join("acp_threads.json");
        std::fs::write(
            &path,
            serde_json::to_string(&json!({
                "workspace-1": [{
                    "id": "thread-1",
                    "name": "Session",
                    "createdAt": 1,
                    "updatedAt": 1,
                    "archived": false
                }]
            }))
            .unwrap(),
        )
        .unwrap();

        let manager = SessionManager::with_summaries_path(path.clone());
        assert_eq!(
            manager.list_thread_summaries("workspace-1").await[0].name,
            "Session"
        );

        manager
            .rename_thread("workspace-1", "thread-1", "Renamed".to_string())
            .await
            .unwrap();
        assert_eq!(
            manager
                .get_thread_summary_including_archived("workspace-1", "thread-1")
                .await
                .unwrap()
                .name,
            "Renamed"
        );

        manager
            .archive_thread("workspace-1", "thread-1")
            .await
            .unwrap();
        assert!(manager
            .list_thread_summaries("workspace-1")
            .await
            .is_empty());

        let reloaded = SessionManager::with_summaries_path(path);
        assert!(reloaded
            .list_thread_summaries("workspace-1")
            .await
            .is_empty());
        std::fs::remove_dir_all(temp_dir).unwrap();
    }
}
