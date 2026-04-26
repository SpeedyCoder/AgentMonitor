import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import type { ClaudeAuthStatus } from "@/types";

type SettingsClaudeSectionProps = {
  claudeCliPathDraft: string;
  claudeAdapterPathDraft: string;
  claudeDirty: boolean;
  isSavingSettings: boolean;
  authStatus: ClaudeAuthStatus | null;
  authLoading: boolean;
  authActionLoading: boolean;
  authError: string | null;
  onSetClaudeCliPathDraft: (value: string) => void;
  onSetClaudeAdapterPathDraft: (value: string) => void;
  onBrowseClaudeCliPath: () => Promise<void>;
  onBrowseClaudeAdapterPath: () => Promise<void>;
  onSaveClaudeSettings: () => Promise<void>;
  onRefreshAuthStatus: () => Promise<void>;
  onStartLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
};

export function SettingsClaudeSection({
  claudeCliPathDraft,
  claudeAdapterPathDraft,
  claudeDirty,
  isSavingSettings,
  authStatus,
  authLoading,
  authActionLoading,
  authError,
  onSetClaudeCliPathDraft,
  onSetClaudeAdapterPathDraft,
  onBrowseClaudeCliPath,
  onBrowseClaudeAdapterPath,
  onSaveClaudeSettings,
  onRefreshAuthStatus,
  onStartLogin,
  onLogout,
}: SettingsClaudeSectionProps) {
  return (
    <SettingsSection
      title="Claude"
      subtitle="Configure the Claude CLI and local adapter used for Claude projects."
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="claude-cli-path">
          Claude CLI path
        </label>
        <div className="settings-field-row">
          <input
            id="claude-cli-path"
            className="settings-input"
            value={claudeCliPathDraft}
            placeholder="claude"
            onChange={(event) => onSetClaudeCliPathDraft(event.target.value)}
          />
          <button type="button" className="ghost" onClick={() => void onBrowseClaudeCliPath()}>
            Browse
          </button>
        </div>
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="claude-adapter-path">
          Claude adapter path
        </label>
        <div className="settings-help">
          Leave empty to use the bundled adapter or the in-repo development adapter when present.
        </div>
        <div className="settings-field-row">
          <input
            id="claude-adapter-path"
            className="settings-input"
            value={claudeAdapterPathDraft}
            placeholder="/path/to/claude-app-server-adapter"
            onChange={(event) => onSetClaudeAdapterPathDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => void onBrowseClaudeAdapterPath()}
          >
            Browse
          </button>
        </div>
      </div>

      <div className="settings-field-actions">
        <button
          type="button"
          className="primary settings-button-compact"
          disabled={isSavingSettings || !claudeDirty}
          onClick={() => void onSaveClaudeSettings()}
        >
          {isSavingSettings ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="settings-field">
        <div className="settings-field-label">Authentication</div>
        <div className="settings-help">
          Uses Claude Code authentication when the CLI is installed. Start login, complete the
          browser flow, then refresh status.
        </div>
        {authError ? <div className="settings-agents-error">{authError}</div> : null}
        <div className="settings-help">
          {authLoading
            ? "Checking authentication status..."
            : authStatus
              ? authStatus.installed
                ? authStatus.loggedIn
                  ? `Signed in${authStatus.accountEmail ? ` as ${authStatus.accountEmail}` : ""}${
                      authStatus.authMethod ? ` via ${authStatus.authMethod}` : ""
                    }.`
                  : "Claude CLI is installed but not signed in."
                : "Claude CLI not found."
              : "Authentication status unavailable."}
        </div>
        {authStatus?.details ? <div className="settings-help">{authStatus.details}</div> : null}
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            disabled={authLoading || authActionLoading}
            onClick={() => void onRefreshAuthStatus()}
          >
            Refresh status
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            disabled={authActionLoading}
            onClick={() => void onStartLogin()}
          >
            {authActionLoading ? "Starting..." : "Login"}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            disabled={authActionLoading || !authStatus?.loggedIn}
            onClick={() => void onLogout()}
          >
            Logout
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}
