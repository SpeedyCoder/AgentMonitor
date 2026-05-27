use std::fs;
use std::path::PathBuf;

use serde_json::Value;

#[test]
fn macos_private_api_feature_matches_config() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let config_path = manifest_dir.join("tauri.conf.json");
    let config_contents = fs::read_to_string(&config_path)
        .unwrap_or_else(|error| panic!("Failed to read {config_path:?}: {error}"));
    let config: Value = serde_json::from_str(&config_contents)
        .unwrap_or_else(|error| panic!("Failed to parse tauri.conf.json: {error}"));
    let macos_private_api = config
        .get("app")
        .and_then(|app| app.get("macOSPrivateApi"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    if macos_private_api {
        let cargo_path = manifest_dir.join("Cargo.toml");
        let cargo_contents = fs::read_to_string(&cargo_path)
            .unwrap_or_else(|error| panic!("Failed to read {cargo_path:?}: {error}"));
        let mut in_dependencies = false;
        let mut has_feature = false;

        for line in cargo_contents.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('[') {
                in_dependencies = trimmed == "[dependencies]";
                continue;
            }
            if !in_dependencies {
                continue;
            }
            if trimmed.starts_with("tauri") && trimmed.contains("macos-private-api") {
                has_feature = true;
                break;
            }
        }

        assert!(
            has_feature,
            "Cargo.toml [dependencies] must enable macos-private-api when app.macOSPrivateApi is true"
        );
    }
}

#[test]
fn tauri_bundle_includes_acp_resource_directory() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let config_path = manifest_dir.join("tauri.conf.json");
    let config_contents = fs::read_to_string(&config_path)
        .unwrap_or_else(|error| panic!("Failed to read {config_path:?}: {error}"));
    let config: Value = serde_json::from_str(&config_contents)
        .unwrap_or_else(|error| panic!("Failed to parse tauri.conf.json: {error}"));
    let resources = config
        .get("bundle")
        .and_then(|bundle| bundle.get("resources"))
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("tauri.conf.json must declare bundle.resources"));

    assert!(
        resources
            .iter()
            .any(|resource| resource.as_str() == Some("resources/bin")),
        "Packaged builds must include src-tauri/resources/bin for ACP adapters and Node.js"
    );
}

#[test]
fn release_workflow_bundles_acp_agents_for_packaged_builds() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workflow_path = manifest_dir
        .parent()
        .unwrap_or_else(|| panic!("src-tauri must have a repository parent"))
        .join(".github/workflows/release.yml");
    let workflow = fs::read_to_string(&workflow_path)
        .unwrap_or_else(|error| panic!("Failed to read {workflow_path:?}: {error}"));
    let bundle_step_count = workflow.matches("./scripts/bundle_acp_agents.sh").count();

    assert!(
        bundle_step_count >= 2,
        "macOS and Linux release jobs must bundle ACP adapters before building"
    );
}
