use agent_client_protocol_tokio::AcpAgent;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;

use crate::types::AgentRuntime;

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
    pub fn to_connectable(&self) -> Result<AcpAgent, String> {
        // Build command with environment variables
        let mut args: Vec<String> = Vec::new();
        for (k, v) in &self.env {
            args.push(format!("{}={}", k, v));
        }
        args.push(self.path.to_string_lossy().to_string());
        
        // Use AcpAgent from the tokio crate which handles process spawning
        AcpAgent::from_args(args)
            .map_err(|e| format!("Failed to create ACP agent: {}", e))
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

    // 2. Fallback to the binary name itself (will be found in PATH or fail)
    PathBuf::from(bin_name)
}

/// Get the path to a bundled agent binary
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_config_env_codex() {
        let config = AgentConfig::resolve(AgentRuntime::Codex, Some("test-key".to_string()));
        assert_eq!(config.env.get("OPENAI_API_KEY"), Some(&"test-key".to_string()));
    }

    #[test]
    fn test_agent_config_env_claude() {
        let config = AgentConfig::resolve(AgentRuntime::Claude, Some("test-key".to_string()));
        assert_eq!(config.env.get("ANTHROPIC_API_KEY"), Some(&"test-key".to_string()));
    }

    #[test]
    fn test_agent_config_no_key() {
        let config = AgentConfig::resolve(AgentRuntime::Codex, None);
        assert!(config.env.is_empty());
    }
}
