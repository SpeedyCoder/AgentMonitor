import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { AppSettings } from "@/types";
import { SelectMenu } from "@/features/design-system/components/popover/PopoverPrimitives";
import {
  SettingsSection,
  SettingsSubsection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import type { CodexSection } from "@settings/components/settingsTypes";
import { createDefaultHarness, updateHarness } from "@settings/utils/settingsHarnesses";

type SettingsHarnessesSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  selectedHarnessId?: string | null;
  onSelectSection?: (section: CodexSection) => void;
};

const ICON_OPTIONS = ["bot", "terminal", "sparkles", "cpu", "wrench"] as const;

export function SettingsHarnessesSection({
  appSettings,
  onUpdateAppSettings,
  selectedHarnessId,
  onSelectSection,
}: SettingsHarnessesSectionProps) {
  const harnesses = appSettings.customAcpHarnesses ?? [];
  const selectedHarness =
    harnesses.find((harness) => harness.id === selectedHarnessId) ?? null;

  const commit = (next: AppSettings) => {
    void onUpdateAppSettings(next);
  };

  const addHarness = () => {
    const nextHarness = createDefaultHarness(appSettings);
    commit({
      ...appSettings,
      customAcpHarnesses: [...harnesses, nextHarness],
    });
    onSelectSection?.(`harness:${nextHarness.id}`);
  };

  return (
    <SettingsSection
      title={selectedHarness?.name?.trim() || "Custom ACP Harnesses"}
      subtitle="Configure additional ACP-compatible agent harnesses."
    >
      <SettingsSubsection title={selectedHarness ? "Harness" : "Harnesses"} />
      <div>
        {!selectedHarness ? (
          <div className="settings-empty-state">
            <div className="settings-help">
              {harnesses.length === 0
                ? "No custom ACP harnesses configured."
                : "Select a custom harness from the sidebar."}
            </div>
            <button type="button" className="ghost settings-button-compact" onClick={addHarness}>
              <Plus size={14} aria-hidden />
              Add harness
            </button>
          </div>
        ) : null}

        {selectedHarness ? (
          <div className="settings-card" key={selectedHarness.id}>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={`harness-name-${selectedHarness.id}`}>
                Name
              </label>
              <input
                id={`harness-name-${selectedHarness.id}`}
                className="settings-input"
                value={selectedHarness.name}
                onChange={(event) =>
                  commit(updateHarness(appSettings, selectedHarness.id, { name: event.target.value }))
                }
              />
            </div>

            <div className="settings-field">
              <label className="settings-field-label" htmlFor={`harness-icon-${selectedHarness.id}`}>
                Icon
              </label>
              <SelectMenu<string>
                id={`harness-icon-${selectedHarness.id}`}
                value={selectedHarness.icon || "bot"}
                onChange={(value) =>
                  commit(updateHarness(appSettings, selectedHarness.id, { icon: value }))
                }
                options={ICON_OPTIONS.map((icon) => ({ value: icon, label: icon }))}
                ariaLabel="Icon"
                fullWidth
              />
            </div>

            <div className="settings-field">
              <label className="settings-field-label" htmlFor={`harness-command-${selectedHarness.id}`}>
                Start command
              </label>
              <input
                id={`harness-command-${selectedHarness.id}`}
                className="settings-input"
                placeholder="npx -y my-acp-agent"
                value={selectedHarness.startCommand}
                onChange={(event) =>
                  commit(
                    updateHarness(appSettings, selectedHarness.id, {
                      startCommand: event.target.value,
                    }),
                  )
                }
              />
            </div>

            <div className="settings-field">
              <div className="settings-field-label">Environment</div>
              {(selectedHarness.env ?? []).map((entry, index) => (
                <div className="settings-field-row" key={`${selectedHarness.id}-env-${index}`}>
                  <input
                    className="settings-input"
                    placeholder="NAME"
                    value={entry.name}
                    onChange={(event) => {
                      const env = [...(selectedHarness.env ?? [])];
                      env[index] = { ...entry, name: event.target.value };
                      commit(updateHarness(appSettings, selectedHarness.id, { env }));
                    }}
                  />
                  <input
                    className="settings-input"
                    placeholder="value"
                    value={entry.value}
                    onChange={(event) => {
                      const env = [...(selectedHarness.env ?? [])];
                      env[index] = { ...entry, value: event.target.value };
                      commit(updateHarness(appSettings, selectedHarness.id, { env }));
                    }}
                  />
                  <button
                    type="button"
                    className="ghost icon-button"
                    aria-label="Remove environment variable"
                    onClick={() => {
                      const env = (selectedHarness.env ?? []).filter((_, envIndex) => envIndex !== index);
                      commit(updateHarness(appSettings, selectedHarness.id, { env }));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </button>
                </div>
              ))}
              <div className="settings-field-actions">
                <button
                  type="button"
                  className="ghost settings-button-compact"
                  onClick={() =>
                    commit(
                      updateHarness(appSettings, selectedHarness.id, {
                        env: [...(selectedHarness.env ?? []), { name: "", value: "" }],
                      }),
                    )
                  }
                >
                  Add env var
                </button>
              </div>
            </div>

            <div className="settings-field-actions">
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={() => {
                  commit({
                    ...appSettings,
                    customAcpHarnesses: harnesses.filter((entry) => entry.id !== selectedHarness.id),
                  });
                  onSelectSection?.("codex");
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsSection>
  );
}
