use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

use crate::backend::app_server::{
    build_codex_path_env, spawn_workspace_session_process, WorkspaceSession,
};
use crate::event_sink::TauriEventSink;
use crate::shared::process_core::{std_command, tokio_command};
use crate::state::AppState;
use crate::types::{AgentRuntime, ClaudeAuthLoginResult, ClaudeAuthStatus, WorkspaceEntry};

fn resolve_cli_path(configured: Option<&str>) -> String {
    configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("claude")
        .to_string()
}

fn claude_cli_candidate_paths(configured: Option<&str>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let resolved = resolve_cli_path(configured);
    let configured_path = PathBuf::from(resolved.as_str());

    if configured_path.components().count() > 1 || configured_path.is_absolute() {
        candidates.push(configured_path);
    } else if let Some(path_env) = build_codex_path_env(Some(resolved.as_str())) {
        for dir in std::env::split_paths(&path_env) {
            let candidate = dir.join(resolved.as_str());
            if candidate.is_file() {
                candidates.push(candidate);
            }
            if cfg!(windows) && Path::new(resolved.as_str()).extension().is_none() {
                let exe_candidate = dir.join(format!("{resolved}.exe"));
                if exe_candidate.is_file() {
                    candidates.push(exe_candidate);
                }
            }
        }
    }

    if !cfg!(windows) {
        for candidate in [
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
            "/usr/bin/claude",
            "/opt/local/bin/claude",
            "/run/current-system/sw/bin/claude",
        ] {
            candidates.push(PathBuf::from(candidate));
        }
    }

    candidates
}

fn resolve_cli_binary_path(configured: Option<&str>) -> Option<PathBuf> {
    claude_cli_candidate_paths(configured)
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn parse_status_output(
    cli_path: Option<String>,
    installed: bool,
    stdout: &str,
    stderr: &str,
) -> ClaudeAuthStatus {
    let combined = if stdout.trim().is_empty() {
        stderr.trim()
    } else {
        stdout.trim()
    };

    let mut status = ClaudeAuthStatus {
        cli_path,
        installed,
        logged_in: false,
        auth_method: None,
        account_email: None,
        details: if combined.is_empty() {
            None
        } else {
            Some(combined.to_string())
        },
    };

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout) {
        status.logged_in = value
            .get("loggedIn")
            .or_else(|| value.get("logged_in"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        status.auth_method = value
            .get("authMethod")
            .or_else(|| value.get("auth_method"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string);
        status.account_email = value
            .get("accountEmail")
            .or_else(|| value.get("account_email"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                value
                    .get("email")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
            });
        status.details = value
            .get("details")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .or(status.details);
        return status;
    }

    let lower = combined.to_ascii_lowercase();
    status.logged_in = lower.contains("logged in")
        || lower.contains("authenticated")
        || lower.contains("subscription")
        || lower.contains("console");
    if lower.contains("subscription") || lower.contains("claude.ai") {
        status.auth_method = Some("subscription".to_string());
    } else if lower.contains("api key") || lower.contains("console") {
        status.auth_method = Some("api_key".to_string());
    }

    for token in combined.split_whitespace() {
        if token.contains('@') && token.contains('.') {
            status.account_email =
                Some(token.trim_matches(|ch| ch == ',' || ch == '.').to_string());
            break;
        }
    }

    status
}

async fn run_auth_status(cli_path: Option<&str>) -> ClaudeAuthStatus {
    let resolved = resolve_cli_path(cli_path);
    let resolved_binary = resolve_cli_binary_path(cli_path);
    let command_path = resolved_binary
        .as_deref()
        .unwrap_or_else(|| Path::new(resolved.as_str()));
    let path_env = build_codex_path_env(Some(resolved.as_str()));
    let mut command = tokio_command(command_path);
    command.args(["auth", "status", "--json"]);
    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }

    match command.output().await {
        Ok(output) => parse_status_output(
            Some(
                resolved_binary
                    .as_ref()
                    .and_then(|path| path.to_str())
                    .unwrap_or(resolved.as_str())
                    .to_string(),
            ),
            true,
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        ),
        Err(error) => ClaudeAuthStatus {
            cli_path: Some(resolved),
            installed: false,
            logged_in: false,
            auth_method: None,
            account_email: None,
            details: Some(error.to_string()),
        },
    }
}

fn node_candidate_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(node_binary) = std::env::var("NODE_BINARY") {
        let trimmed = node_binary.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let nvm_root = Path::new(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_root) {
            let mut version_bins = entries
                .flatten()
                .map(|entry| entry.path().join("bin").join("node"))
                .filter(|path| path.is_file())
                .collect::<Vec<_>>();
            version_bins.sort();
            version_bins.reverse();
            candidates.extend(version_bins);
        }
    }
    candidates.extend(
        [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]
        .into_iter()
        .map(PathBuf::from),
    );
    candidates
}

fn resolve_node_path() -> Option<PathBuf> {
    for candidate in node_candidate_paths() {
        let output = std_command(&candidate)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output();
        if output.as_ref().is_ok_and(|result| result.status.success()) {
            return Some(candidate);
        }
    }
    None
}

fn command_for_adapter(
    adapter_path: &Path,
    cli_path: Option<&str>,
) -> Result<tokio::process::Command, String> {
    let adapter_str = adapter_path
        .to_str()
        .ok_or_else(|| "Claude adapter path is not valid UTF-8.".to_string())?;
    let mut command = if matches!(
        adapter_path.extension().and_then(|ext| ext.to_str()),
        Some("js") | Some("mjs") | Some("cjs")
    ) {
        let node_path = resolve_node_path().ok_or_else(|| {
            "Could not find a working Node.js runtime for the Claude adapter.".to_string()
        })?;
        let mut cmd = tokio_command(node_path);
        cmd.arg(adapter_str);
        cmd
    } else {
        tokio_command(adapter_str)
    };
    if let Some(path_env) = build_codex_path_env(cli_path) {
        command.env("PATH", path_env);
    }
    Ok(command)
}

pub(crate) async fn spawn_workspace_session(
    entry: WorkspaceEntry,
    app_settings: &crate::types::AppSettings,
    app_handle: AppHandle,
) -> Result<Arc<WorkspaceSession>, String> {
    let adapter_path = app_settings
        .claude_adapter_path
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| {
            "Claude adapter not found. Configure a Claude adapter path in Settings.".to_string()
        })?;
    let cli_path = resolve_cli_path(app_settings.claude_cli_path.as_deref());
    let resolved_cli_path = resolve_cli_binary_path(app_settings.claude_cli_path.as_deref())
        .unwrap_or_else(|| PathBuf::from(cli_path.as_str()));
    let auth_status = run_auth_status(Some(cli_path.as_str())).await;
    if !auth_status.logged_in {
        return Err(
            "Claude runtime requires Claude authentication. Use Settings > Claude to sign in."
                .to_string(),
        );
    }

    let mut command = command_for_adapter(&adapter_path, Some(cli_path.as_str()))?;
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?;
    command.args([
        "app-server",
        "--workspace-id",
        entry.id.as_str(),
        "--data-dir",
    ]);
    command.arg(app_data_dir.join("claude-adapter"));
    command.env("CLAUDE_CLI_PATH", resolved_cli_path);
    command.env("CODEXMONITOR_WORKSPACE_PATH", &entry.path);

    let client_version = app_handle.package_info().version.to_string();
    let event_sink = TauriEventSink::new(app_handle);
    spawn_workspace_session_process(
        entry,
        AgentRuntime::Claude,
        None,
        client_version,
        event_sink,
        command,
    )
    .await
}

#[tauri::command]
pub(crate) async fn claude_auth_status(
    state: State<'_, AppState>,
) -> Result<ClaudeAuthStatus, String> {
    let cli_path = {
        let settings = state.app_settings.lock().await;
        settings.claude_cli_path.clone()
    };
    Ok(run_auth_status(cli_path.as_deref()).await)
}

#[tauri::command]
pub(crate) async fn claude_auth_login(
    state: State<'_, AppState>,
) -> Result<ClaudeAuthLoginResult, String> {
    let cli_path = {
        let settings = state.app_settings.lock().await;
        settings.claude_cli_path.clone()
    };
    let resolved = resolve_cli_path(cli_path.as_deref());
    let resolved_binary = resolve_cli_binary_path(cli_path.as_deref())
        .unwrap_or_else(|| PathBuf::from(resolved.as_str()));
    let path_env = build_codex_path_env(Some(resolved.as_str()));
    let mut command = tokio_command(&resolved_binary);
    command.args(["auth", "login"]);
    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    command.stdout(std::process::Stdio::null());
    command.stderr(std::process::Stdio::null());
    command.stdin(std::process::Stdio::null());
    command.spawn().map_err(|err| err.to_string())?;
    Ok(ClaudeAuthLoginResult {
        started: true,
        details: Some(
            "Started `claude auth login`. Refresh status after the browser flow completes."
                .to_string(),
        ),
    })
}

#[tauri::command]
pub(crate) async fn claude_auth_logout(
    state: State<'_, AppState>,
) -> Result<ClaudeAuthStatus, String> {
    let cli_path = {
        let settings = state.app_settings.lock().await;
        settings.claude_cli_path.clone()
    };
    let resolved = resolve_cli_path(cli_path.as_deref());
    let resolved_binary = resolve_cli_binary_path(cli_path.as_deref())
        .unwrap_or_else(|| PathBuf::from(resolved.as_str()));
    let path_env = build_codex_path_env(Some(resolved.as_str()));
    let mut command = tokio_command(&resolved_binary);
    command.args(["auth", "logout"]);
    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    let _ = command.output().await;
    Ok(run_auth_status(Some(resolved.as_str())).await)
}
