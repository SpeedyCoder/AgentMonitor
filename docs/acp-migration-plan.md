# Trantor ACP Migration Plan

**Status**: ACP is the live thread transport for app and daemon modes  
**Last Updated**: 2026-05-24

## Target State

Trantor uses Agent Client Protocol (ACP) as the runtime boundary for local app mode and remote daemon mode.

- Trantor is the ACP client.
- Workspace settings select one `agentRuntime`: `codex` or `claude`.
- App settings store runtime credentials as `codexApiKey` and `claudeApiKey`.
- App mode and daemon mode share ACP session, MCP, permission, notification, and thread-summary behavior through `src-tauri/src/shared/acp_core.rs`.
- Frontend thread IPC calls use ACP-prefixed Tauri commands.
- Legacy Codex backend code is retained only for non-thread compatibility paths that still depend on Codex-specific features.

## Live Implementation

- Shared ACP core: `src-tauri/src/shared/acp_core.rs`
- App ACP commands: `src-tauri/src/acp/mod.rs`
- Daemon ACP RPC: `src-tauri/src/bin/trantor_daemon/rpc/acp.rs`
- Frontend IPC wrappers: `src/services/tauri.ts`
- Frontend event normalization: `src/features/app/hooks/useAppServerEvents.ts`
- Persistent ACP thread summaries: app and daemon `acp_threads.json` under the configured data directory
- Adapter bundle script: `scripts/bundle_acp_agents.sh`

## Supported Thread Contract

- `startThread` calls `acp_start_thread`.
- `sendUserMessage` calls `acp_send_user_message` with text and image content.
- `interruptTurn` calls `acp_turn_interrupt`.
- `steerTurn` calls `acp_turn_steer` with text only.
- `listThreads`, `readThread`, `resumeThread`, `setThreadName`, `archiveThread`, and `compactThread` call ACP-prefixed commands.
- `threadLiveSubscribe` and `threadLiveUnsubscribe` call ACP-prefixed commands.
- `forkThread` calls `acp_fork_thread`, which returns an explicit unsupported error until ACP adapters expose a fork contract.
- Persisted ACP entries are summary placeholders after restart or after another ACP session replaces them. They are listable and rename/archive-capable, but `readThread` and `resumeThread` return `historyPlaceholder: true`, `resumable: false`, and no transcript items until adapters expose a real load/resume contract.

## Validation

Required automated validation:

```bash
npm run typecheck
npm run test
cd src-tauri && cargo check
cd src-tauri && cargo test acp_core
```

Focused coverage currently protects:

- ACP MCP fallback command construction.
- ACP notification mapping with stable thread and item IDs.
- ACP persisted summary list, rename, archive, and lookup behavior.
- Frontend ACP event normalization.
- Frontend ACP IPC wrapper command and payload mapping.
- Remote retry allowlist for ACP read/list/resume/live-subscribe methods.

## Remaining Release Work

The code migration is complete when these release checks pass:

- Start a Codex ACP session locally.
- Start a Claude ACP session locally.
- Send a prompt and receive streamed assistant text.
- Receive reasoning, tool call, tool update, plan, and session-title updates.
- Cancel a running turn.
- Send an image attachment.
- Restart the app and verify persisted thread-summary list behavior.
- Repeat session create, prompt, cancel, and event streaming through daemon/remote mode.
- Verify bundled `codex-acp` and `claude-agent-acp` resource lookup in macOS, Linux, and Windows release artifacts.
- Verify the pinned adapter versions in `scripts/bundle_acp_agents.sh` before release automation relies on them.

## Cleanup Policy

- Keep `src-tauri/src/codex/*`, `src-tauri/src/backend/app_server.rs`, and `src-tauri/src/shared/codex_*` only while non-thread features still call them.
- Do not reintroduce frontend calls to legacy thread commands.
- Remove or rename remaining Codex-specific APIs only after the dependent feature has a runtime-neutral or ACP-backed replacement.
- Keep docs canonical: describe current behavior only, not historical migration commentary.
