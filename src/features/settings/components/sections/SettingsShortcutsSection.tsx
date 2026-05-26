import { useMemo, useState, type KeyboardEvent } from "react";
import {
  SettingsSection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
import type {
  ShortcutDraftKey,
  ShortcutDrafts,
  ShortcutSettingKey,
} from "@settings/components/settingsTypes";

type ShortcutItem = {
  label: string;
  draftKey: ShortcutDraftKey;
  settingKey: ShortcutSettingKey;
  defaultShortcut: string;
};

type ShortcutGroup = {
  title: string;
  items: ShortcutItem[];
};

type SettingsShortcutsSectionProps = {
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
};

function ShortcutRow({
  item,
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: {
  item: ShortcutItem;
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
}) {
  const value = formatShortcut(shortcutDrafts[item.draftKey]);
  return (
    <div className="settings-shortcut-row">
      <span className="settings-shortcut-label">{item.label}</span>
      <input
        className="settings-input settings-input--shortcut settings-shortcut-input"
        value={value}
        onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
        placeholder={formatShortcut(item.defaultShortcut)}
        readOnly
      />
      <button
        type="button"
        className="ghost settings-shortcut-clear"
        onClick={() => onClearShortcut(item.settingKey)}
        title="Reset to default"
        aria-label={`Reset ${item.label} shortcut`}
      >
        Reset
      </button>
    </div>
  );
}

export function SettingsShortcutsSection({
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: SettingsShortcutsSectionProps) {
  const isMac = isMacPlatform();
  const [searchQuery, setSearchQuery] = useState("");

  const groups = useMemo<ShortcutGroup[]>(
    () => [
      {
        title: "File",
        items: [
          {
            label: "New Agent",
            draftKey: "newAgent",
            settingKey: "newAgentShortcut",
            defaultShortcut: "cmd+n",
          },
          {
            label: "New Worktree Agent",
            draftKey: "newWorktreeAgent",
            settingKey: "newWorktreeAgentShortcut",
            defaultShortcut: "cmd+shift+n",
          },
          {
            label: "Archive active thread",
            draftKey: "archiveThread",
            settingKey: "archiveThreadShortcut",
            defaultShortcut: isMac ? "cmd+ctrl+a" : "ctrl+alt+a",
          },
        ],
      },
      {
        title: "Composer",
        items: [
          {
            label: "Cycle model",
            draftKey: "model",
            settingKey: "composerModelShortcut",
            defaultShortcut: "cmd+shift+m",
          },
          {
            label: "Cycle reasoning mode",
            draftKey: "reasoning",
            settingKey: "composerReasoningShortcut",
            defaultShortcut: "cmd+shift+r",
          },
          {
            label: "Cycle collaboration mode",
            draftKey: "collaboration",
            settingKey: "composerCollaborationShortcut",
            defaultShortcut: "shift+tab",
          },
          {
            label: "Stop active run",
            draftKey: "interrupt",
            settingKey: "interruptShortcut",
            defaultShortcut: getDefaultInterruptShortcut(),
          },
        ],
      },
      {
        title: "Panels",
        items: [
          {
            label: "Toggle projects sidebar",
            draftKey: "projectsSidebar",
            settingKey: "toggleProjectsSidebarShortcut",
            defaultShortcut: "cmd+shift+p",
          },
          {
            label: "Toggle git sidebar",
            draftKey: "gitSidebar",
            settingKey: "toggleGitSidebarShortcut",
            defaultShortcut: "cmd+shift+g",
          },
          {
            label: "Branch switcher",
            draftKey: "branchSwitcher",
            settingKey: "branchSwitcherShortcut",
            defaultShortcut: "cmd+b",
          },
          {
            label: "Toggle debug panel",
            draftKey: "debugPanel",
            settingKey: "toggleDebugPanelShortcut",
            defaultShortcut: "cmd+shift+d",
          },
          {
            label: "Toggle terminal panel",
            draftKey: "terminal",
            settingKey: "toggleTerminalShortcut",
            defaultShortcut: "cmd+shift+t",
          },
        ],
      },
      {
        title: "Navigation",
        items: [
          {
            label: "Next agent",
            draftKey: "cycleAgentNext",
            settingKey: "cycleAgentNextShortcut",
            defaultShortcut: isMac ? "cmd+ctrl+down" : "ctrl+alt+down",
          },
          {
            label: "Previous agent",
            draftKey: "cycleAgentPrev",
            settingKey: "cycleAgentPrevShortcut",
            defaultShortcut: isMac ? "cmd+ctrl+up" : "ctrl+alt+up",
          },
          {
            label: "Next project",
            draftKey: "cycleWorkspaceNext",
            settingKey: "cycleWorkspaceNextShortcut",
            defaultShortcut: isMac ? "cmd+shift+down" : "ctrl+alt+shift+down",
          },
          {
            label: "Previous project",
            draftKey: "cycleWorkspacePrev",
            settingKey: "cycleWorkspacePrevShortcut",
            defaultShortcut: isMac ? "cmd+shift+up" : "ctrl+alt+shift+up",
          },
        ],
      },
    ],
    [isMac],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const searchValue =
            `${group.title} ${item.label} ${item.defaultShortcut}`.toLowerCase();
          return searchValue.includes(normalizedSearchQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedSearchQuery]);

  return (
    <SettingsSection
      title="Shortcuts"
      subtitle="Focus a shortcut and press a new key combination to remap it."
    >
      <div className="settings-shortcuts-search">
        <input
          id="settings-shortcuts-search"
          className="settings-input"
          placeholder="Search shortcuts"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => setSearchQuery("")}
          >
            Clear
          </button>
        )}
      </div>
      <div className="settings-shortcuts-groups">
        {filteredGroups.map((group) => (
          <div key={group.title} className="settings-shortcuts-group">
            <div className="settings-shortcuts-group-title">{group.title}</div>
            <div className="settings-shortcuts-list">
              {group.items.map((item) => (
                <ShortcutRow
                  key={item.settingKey}
                  item={item}
                  shortcutDrafts={shortcutDrafts}
                  onShortcutKeyDown={onShortcutKeyDown}
                  onClearShortcut={onClearShortcut}
                />
              ))}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <div className="settings-empty">
            No shortcuts match {normalizedSearchQuery ? `"${searchQuery.trim()}"` : "your search"}.
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
