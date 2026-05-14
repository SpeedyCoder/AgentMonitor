use agent_client_protocol_schema::{EnvVariable, McpServer, McpServerStdio};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Workspace MCP configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
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

/// Custom MCP server configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

impl WorkspaceMcpConfig {
    /// Convert to ACP MCP servers (schema types)
    pub fn to_acp_servers(&self, workspace_path: &Path) -> Vec<McpServer> {
        let mut servers = Vec::new();

        if self.filesystem {
            if let Some(fs_server) = build_filesystem_server(workspace_path) {
                servers.push(fs_server);
            }
        }

        if self.git {
            if let Some(git_server) = build_git_server(workspace_path) {
                servers.push(git_server);
            }
        }

        // Add custom servers
        for custom in &self.custom {
            servers.push(build_custom_server(custom));
        }

        servers
    }
}

/// Build filesystem MCP server
fn build_filesystem_server(workspace_path: &Path) -> Option<McpServer> {
    let command = resolve_mcp_server_path("server-filesystem");
    Some(McpServer::Stdio(
        McpServerStdio::new("workspace_filesystem", command)
            .args(vec![workspace_path.to_string_lossy().to_string()])
            .env(vec![])
    ))
}

/// Build git MCP server
fn build_git_server(workspace_path: &Path) -> Option<McpServer> {
    let git_root = find_git_root(workspace_path);
    git_root.map(|root| {
        let command = resolve_mcp_server_path("server-git");
        McpServer::Stdio(
            McpServerStdio::new("workspace_git", command)
                .args(vec![root.to_string_lossy().to_string()])
                .env(vec![])
        )
    })
}

/// Build custom MCP server from config
fn build_custom_server(config: &McpServerConfig) -> McpServer {
    let env: Vec<EnvVariable> = config
        .env
        .iter()
        .map(|(k, v)| EnvVariable::new(k.clone(), v.clone()))
        .collect();
    
    McpServer::Stdio(
        McpServerStdio::new(&config.name, &config.command)
            .args(config.args.clone())
            .env(env)
    )
}

/// Find git root for a workspace path
fn find_git_root(path: &Path) -> Option<std::path::PathBuf> {
    let mut current = path.to_path_buf();

    loop {
        let git_dir = current.join(".git");
        if git_dir.exists() && git_dir.is_dir() {
            return Some(current);
        }

        if !current.pop() {
            break;
        }
    }

    None
}

/// Resolve MCP server path (bundled or npx fallback)
pub fn resolve_mcp_server_path(name: &str) -> String {
    // Try bundled path first, then fallback to npx
    if let Some(bundled) = get_bundled_mcp_server_path(name) {
        if bundled.exists() {
            return bundled.to_string_lossy().to_string();
        }
    }
    format!("npx -y @modelcontextprotocol/{}", name)
}

/// Get bundled MCP server path
fn get_bundled_mcp_server_path(name: &str) -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    
    #[cfg(target_os = "macos")]
    {
        std::env::var("TRANTOR_RESOURCE_DIR")
            .ok()
            .map(|d| PathBuf::from(d).join("bin").join(name))
    }

    #[cfg(not(target_os = "macos"))]
    {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent()?.parent())
            .map(|d| d.join("resources").join("bin").join(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_workspace_mcp_config_default() {
        let config = WorkspaceMcpConfig::default();
        assert!(config.filesystem);
        assert!(config.git);
        assert!(config.custom.is_empty());
    }

    #[test]
    fn test_find_git_root_finds_git_dir() {
        let temp_dir = tempfile::tempdir().unwrap();
        let git_dir = temp_dir.path().join(".git");
        std::fs::create_dir(&git_dir).unwrap();

        let result = find_git_root(temp_dir.path());
        assert!(result.is_some());
        assert_eq!(result.unwrap(), temp_dir.path());
    }

    #[test]
    fn test_find_git_root_returns_none_when_not_found() {
        let temp_dir = tempfile::tempdir().unwrap();
        let result = find_git_root(temp_dir.path());
        assert!(result.is_none());
    }
}
