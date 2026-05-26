import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import { useState } from "react";
import type { AppSettings, ModelOption } from "@/types";
import { SelectMenu } from "@/features/design-system/components/popover/PopoverPrimitives";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type SettingsGitSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  models: ModelOption[];
  commitMessagePromptDraft: string;
  commitMessagePromptDirty: boolean;
  commitMessagePromptSaving: boolean;
  defaultWorktreeBranchFormatDraft: string;
  defaultWorktreeBranchFormatDirty: boolean;
  defaultWorktreeBranchFormatSaving: boolean;
  onSetCommitMessagePromptDraft: (value: string) => void;
  onSaveCommitMessagePrompt: () => Promise<void>;
  onResetCommitMessagePrompt: () => Promise<void>;
  onSetDefaultWorktreeBranchFormatDraft: (value: string) => void;
  onSaveDefaultWorktreeBranchFormat: () => Promise<void>;
  onResetDefaultWorktreeBranchFormat: () => void;
};

export function SettingsGitSection({
  appSettings,
  onUpdateAppSettings,
  models,
  commitMessagePromptDraft,
  commitMessagePromptDirty,
  commitMessagePromptSaving,
  defaultWorktreeBranchFormatDraft,
  defaultWorktreeBranchFormatDirty,
  defaultWorktreeBranchFormatSaving,
  onSetCommitMessagePromptDraft,
  onSaveCommitMessagePrompt,
  onResetCommitMessagePrompt,
  onSetDefaultWorktreeBranchFormatDraft,
  onSaveDefaultWorktreeBranchFormat,
  onResetDefaultWorktreeBranchFormat,
}: SettingsGitSectionProps) {
  const [showLinearApiToken, setShowLinearApiToken] = useState(false);
  const linearApiTokenVisibilityLabel = showLinearApiToken
    ? "Hide Linear API token"
    : "Show Linear API token";

  return (
    <SettingsSection
      title="Git"
      subtitle="Manage how diffs are loaded in the Git sidebar."
    >
      <SettingsToggleRow
        title="Preload git diffs"
        subtitle="Make viewing git diff faster."
      >
        <SettingsToggleSwitch
          pressed={appSettings.preloadGitDiffs}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              preloadGitDiffs: !appSettings.preloadGitDiffs,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="Ignore whitespace changes"
        subtitle="Hides whitespace-only changes in local and commit diffs."
      >
        <SettingsToggleSwitch
          pressed={appSettings.gitDiffIgnoreWhitespaceChanges}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              gitDiffIgnoreWhitespaceChanges: !appSettings.gitDiffIgnoreWhitespaceChanges,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="settings-default-worktree-branch-format">
          Default worktree branch format
        </label>
        <div className="settings-help">
          Used to prefill the new worktree agent modal. Available tokens: {"{date}"}, {"{random}"}, {"{project}"}.
        </div>
        <input
          id="settings-default-worktree-branch-format"
          type="text"
          className="settings-input"
          value={defaultWorktreeBranchFormatDraft}
          onChange={(event) => onSetDefaultWorktreeBranchFormatDraft(event.target.value)}
          placeholder="trantor/{date}-{random}"
          disabled={defaultWorktreeBranchFormatSaving}
        />
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={onResetDefaultWorktreeBranchFormat}
            disabled={
              defaultWorktreeBranchFormatSaving || !defaultWorktreeBranchFormatDirty
            }
          >
            Reset format
          </button>
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void onSaveDefaultWorktreeBranchFormat();
            }}
            disabled={
              defaultWorktreeBranchFormatSaving || !defaultWorktreeBranchFormatDirty
            }
          >
            {defaultWorktreeBranchFormatSaving ? "Saving format..." : "Save format"}
          </button>
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="linear-api-token">
          Linear API token
        </label>
        <div className="settings-help">
          Enables Linear issue search when creating worktree agents.
        </div>
        <div className="settings-input-with-action">
          <input
            id="linear-api-token"
            className="settings-input settings-input--with-action"
            type={showLinearApiToken ? "text" : "password"}
            value={appSettings.linearApiToken ?? ""}
            placeholder="lin_api_..."
            autoComplete="off"
            onChange={(event) => {
              const value = event.target.value.trim();
              void onUpdateAppSettings({
                ...appSettings,
                linearApiToken: value.length > 0 ? value : null,
              });
            }}
          />
          <button
            type="button"
            className="ghost settings-icon-button settings-input-action"
            onClick={() => setShowLinearApiToken((show) => !show)}
            aria-label={linearApiTokenVisibilityLabel}
            title={linearApiTokenVisibilityLabel}
          >
            {showLinearApiToken ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">Commit message prompt</div>
        <div className="settings-help">
          Used when generating commit messages. Include <code>{"{diff}"}</code> to insert the
          git diff.
        </div>
        <textarea
          className="settings-agents-textarea"
          value={commitMessagePromptDraft}
          onChange={(event) => onSetCommitMessagePromptDraft(event.target.value)}
          spellCheck={false}
          disabled={commitMessagePromptSaving}
        />
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onResetCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            Reset
          </button>
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void onSaveCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            {commitMessagePromptSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {models.length > 0 && (
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="commit-message-model-select">
            Commit message model
          </label>
          <div className="settings-help">
            The model used when generating commit messages. Leave on default to use the
            project model.
          </div>
          <SelectMenu<string>
            id="commit-message-model-select"
            value={appSettings.commitMessageModelId ?? ""}
            onChange={(value) => {
              void onUpdateAppSettings({
                ...appSettings,
                commitMessageModelId: value || null,
              });
            }}
            options={[
              { value: "", label: "Default" },
              ...models.map((model) => ({
                value: model.model,
                label: model.displayName?.trim() || model.model,
              })),
            ]}
            ariaLabel="Commit message model"
            fullWidth
          />
        </div>
      )}
    </SettingsSection>
  );
}
