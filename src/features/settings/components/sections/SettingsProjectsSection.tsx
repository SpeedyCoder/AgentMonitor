import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import {
  SettingsSection,
  SettingsSubsection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import type { WorkspaceGroup, WorkspaceInfo } from "@/types";
import { pushErrorToast } from "@services/toasts";

type GroupedWorkspaces = Array<{
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
}>;

type SettingsProjectsSectionProps = {
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: GroupedWorkspaces;
  ungroupedLabel: string;
  groupDrafts: Record<string, string>;
  newGroupName: string;
  groupError: string | null;
  projects: WorkspaceInfo[];
  canCreateGroup: boolean;
  onSetNewGroupName: Dispatch<SetStateAction<string>>;
  onSetGroupDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onCreateGroup: () => Promise<void>;
  onRenameGroup: (group: WorkspaceGroup) => Promise<void>;
  onMoveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
  onDeleteGroup: (group: WorkspaceGroup) => Promise<void>;
  onChooseGroupCopiesFolder: (group: WorkspaceGroup) => Promise<void>;
  onClearGroupCopiesFolder: (group: WorkspaceGroup) => Promise<void>;
  onAssignWorkspaceGroup: (workspaceId: string, groupId: string | null) => Promise<boolean | null>;
  onMoveWorkspace: (id: string, direction: "up" | "down") => void;
  onDeleteWorkspace: (id: string) => void;
  mainWorkspaces: WorkspaceInfo[];
  environmentWorkspace: WorkspaceInfo | null;
  environmentSaving: boolean;
  environmentError: string | null;
  environmentDraftScript: string;
  environmentSavedScript: string | null;
  environmentDirty: boolean;
  globalWorktreesFolderDraft: string;
  globalWorktreesFolderSaved: string | null;
  globalWorktreesFolderDirty: boolean;
  worktreesFolderDraft: string;
  worktreesFolderSaved: string | null;
  worktreesFolderDirty: boolean;
  onSetEnvironmentWorkspaceId: Dispatch<SetStateAction<string | null>>;
  onSetEnvironmentDraftScript: Dispatch<SetStateAction<string>>;
  onSetGlobalWorktreesFolderDraft: Dispatch<SetStateAction<string>>;
  onSetWorktreesFolderDraft: Dispatch<SetStateAction<string>>;
  onSaveEnvironmentSetup: () => Promise<void>;
};

export function SettingsProjectsSection({
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  groupDrafts,
  newGroupName,
  groupError,
  projects,
  canCreateGroup,
  onSetNewGroupName,
  onSetGroupDrafts,
  onCreateGroup,
  onRenameGroup,
  onMoveWorkspaceGroup,
  onDeleteGroup,
  onChooseGroupCopiesFolder,
  onClearGroupCopiesFolder,
  onAssignWorkspaceGroup,
  onMoveWorkspace,
  onDeleteWorkspace,
  mainWorkspaces,
  environmentWorkspace,
  environmentSaving,
  environmentError,
  environmentDraftScript,
  environmentSavedScript,
  environmentDirty,
  globalWorktreesFolderDraft,
  globalWorktreesFolderSaved,
  globalWorktreesFolderDirty,
  worktreesFolderDraft,
  worktreesFolderSaved,
  worktreesFolderDirty,
  onSetEnvironmentWorkspaceId,
  onSetEnvironmentDraftScript,
  onSetGlobalWorktreesFolderDraft,
  onSetWorktreesFolderDraft,
  onSaveEnvironmentSetup,
}: SettingsProjectsSectionProps) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const hasProjects = mainWorkspaces.length > 0;
  const currentProjectSetupId = expandedProjectId;
  const hasAnyEnvironmentChanges =
    environmentDirty ||
    globalWorktreesFolderDirty ||
    worktreesFolderDirty;

  return (
    <SettingsSection
      title="Projects"
      subtitle="Manage project grouping, worktree defaults, and per-project setup."
    >
      <SettingsSubsection
        title="Worktrees"
        subtitle="Configure the default root for new project worktrees."
      />
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="settings-global-worktrees-folder">
          Global worktrees root
        </label>
        <div className="settings-help">
          Default location for new worktrees when a project does not override it. Each project
          gets its own subfolder under this root.
        </div>
        <div className="settings-field-row">
          <input
            id="settings-global-worktrees-folder"
            type="text"
            className="settings-input"
            value={globalWorktreesFolderDraft}
            onChange={(event) => onSetGlobalWorktreesFolderDraft(event.target.value)}
            placeholder="/path/to/worktrees-root"
            disabled={environmentSaving}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={async () => {
              try {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({
                  directory: true,
                  multiple: false,
                  title: "Select global worktrees root",
                });
                if (selected && typeof selected === "string") {
                  onSetGlobalWorktreesFolderDraft(selected);
                }
              } catch (error) {
                pushErrorToast({
                  title: "Failed to open folder picker",
                  message: error instanceof Error ? error.message : String(error),
                });
              }
            }}
            disabled={environmentSaving}
          >
            Browse
          </button>
        </div>
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => onSetGlobalWorktreesFolderDraft(globalWorktreesFolderSaved ?? "")}
            disabled={environmentSaving || !globalWorktreesFolderDirty}
          >
            Reset
          </button>
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void onSaveEnvironmentSetup();
            }}
            disabled={environmentSaving || !globalWorktreesFolderDirty}
          >
            {environmentSaving ? "Saving..." : "Save"}
          </button>
        </div>
        {!hasProjects && environmentError ? (
          <div className="settings-agents-error">{environmentError}</div>
        ) : null}
      </div>

      <SettingsSubsection
        title="Groups"
        subtitle="Create group labels for related repositories."
      />
      <div className="settings-groups">
        <div className="settings-group-create">
          <input
            className="settings-input settings-input--compact"
            value={newGroupName}
            placeholder="New group name"
            onChange={(event) => onSetNewGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreateGroup) {
                event.preventDefault();
                void onCreateGroup();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onCreateGroup();
            }}
            disabled={!canCreateGroup}
          >
            Add group
          </button>
        </div>
        {groupError && <div className="settings-group-error">{groupError}</div>}
        {workspaceGroups.length > 0 ? (
          <div className="settings-group-list">
            {workspaceGroups.map((group, index) => (
              <div key={group.id} className="settings-group-row">
                <div className="settings-group-fields">
                  <input
                    className="settings-input settings-input--compact"
                    value={groupDrafts[group.id] ?? group.name}
                    onChange={(event) =>
                      onSetGroupDrafts((prev) => ({
                        ...prev,
                        [group.id]: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      void onRenameGroup(group);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void onRenameGroup(group);
                      }
                    }}
                  />
                  <div className="settings-group-copies">
                    <div className="settings-group-copies-label">Copies folder</div>
                    <div className="settings-group-copies-row">
                      <div
                        className={`settings-group-copies-path${group.copiesFolder ? "" : " empty"}`}
                        title={group.copiesFolder ?? ""}
                      >
                        {group.copiesFolder ?? "Not set"}
                      </div>
                      <button
                        type="button"
                        className="ghost settings-button-compact"
                        onClick={() => {
                          void onChooseGroupCopiesFolder(group);
                        }}
                      >
                        Choose...
                      </button>
                      <button
                        type="button"
                        className="ghost settings-button-compact"
                        onClick={() => {
                          void onClearGroupCopiesFolder(group);
                        }}
                        disabled={!group.copiesFolder}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
                <div className="settings-group-actions">
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => {
                      void onMoveWorkspaceGroup(group.id, "up");
                    }}
                    disabled={index === 0}
                    aria-label="Move group up"
                  >
                    <ChevronUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => {
                      void onMoveWorkspaceGroup(group.id, "down");
                    }}
                    disabled={index === workspaceGroups.length - 1}
                    aria-label="Move group down"
                  >
                    <ChevronDown aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => {
                      void onDeleteGroup(group);
                    }}
                    aria-label="Delete group"
                  >
                    <Trash2 aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="settings-empty">No groups yet.</div>
        )}
      </div>

      <SettingsSubsection
        title="Projects"
        subtitle="Assign projects to groups, adjust order, and expand a project for setup controls."
      />
      <div className="settings-projects">
        {groupedWorkspaces.map((group) => (
          <div key={group.id ?? "ungrouped"} className="settings-project-group">
            <div className="settings-project-group-label">{group.name}</div>
            {group.workspaces.map((workspace, index) => {
              const groupValue = workspaceGroups.some(
                (entry) => entry.id === workspace.settings.groupId,
              )
                ? workspace.settings.groupId ?? ""
                : "";
              const setupOpen = currentProjectSetupId === workspace.id;
              const isEnvironmentProject = environmentWorkspace?.id === workspace.id;
              return (
                <div key={workspace.id} className="settings-project-card">
                  <div className="settings-project-row">
                    <div className="settings-project-info">
                      <div className="settings-project-name">{workspace.name}</div>
                      <div className="settings-project-path">{workspace.path}</div>
                    </div>
                    <div className="settings-project-actions">
                      <button
                        type="button"
                        className="ghost settings-button-compact"
                        onClick={() => {
                          if (setupOpen) {
                            setExpandedProjectId(null);
                            return;
                          }
                          setExpandedProjectId(workspace.id);
                          onSetEnvironmentWorkspaceId(workspace.id);
                        }}
                        aria-expanded={setupOpen}
                      >
                        {setupOpen ? "Hide setup" : "Project setup"}
                      </button>
                      <select
                        className="settings-select settings-select--compact"
                        value={groupValue}
                        onChange={(event) => {
                          const nextGroupId = event.target.value || null;
                          void onAssignWorkspaceGroup(workspace.id, nextGroupId);
                        }}
                      >
                        <option value="">{ungroupedLabel}</option>
                        {workspaceGroups.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ghost icon-button"
                        onClick={() => onMoveWorkspace(workspace.id, "up")}
                        disabled={index === 0}
                        aria-label="Move project up"
                      >
                        <ChevronUp aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="ghost icon-button"
                        onClick={() => onMoveWorkspace(workspace.id, "down")}
                        disabled={index === group.workspaces.length - 1}
                        aria-label="Move project down"
                      >
                        <ChevronDown aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="ghost icon-button"
                        onClick={() => onDeleteWorkspace(workspace.id)}
                        aria-label="Delete project"
                      >
                        <Trash2 aria-hidden />
                      </button>
                    </div>
                  </div>
                  {setupOpen && (
                    <div className="settings-project-setup">
                      <div className="settings-field">
                        <div className="settings-field-label">Setup script</div>
                        <div className="settings-help">
                          Runs once in a dedicated terminal after each new worktree is created.
                        </div>
                        {isEnvironmentProject && environmentError ? (
                          <div className="settings-agents-error">{environmentError}</div>
                        ) : null}
                        <textarea
                          className="settings-agents-textarea"
                          value={isEnvironmentProject ? environmentDraftScript : ""}
                          onChange={(event) => onSetEnvironmentDraftScript(event.target.value)}
                          placeholder="pnpm install"
                          spellCheck={false}
                          disabled={environmentSaving || !isEnvironmentProject}
                        />
                        <div className="settings-field-actions">
                          <button
                            type="button"
                            className="ghost settings-button-compact"
                            onClick={() => {
                              const clipboard =
                                typeof navigator === "undefined" ? null : navigator.clipboard;
                              if (!clipboard?.writeText) {
                                pushErrorToast({
                                  title: "Copy failed",
                                  message:
                                    "Clipboard access is unavailable in this environment. Copy the script manually instead.",
                                });
                                return;
                              }

                              void clipboard
                                .writeText(environmentDraftScript)
                                .catch(() => {
                                  pushErrorToast({
                                    title: "Copy failed",
                                    message:
                                      "Could not write to the clipboard. Copy the script manually instead.",
                                  });
                                });
                            }}
                            disabled={
                              environmentSaving ||
                              !isEnvironmentProject ||
                              environmentDraftScript.length === 0
                            }
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            className="ghost settings-button-compact"
                            onClick={() => onSetEnvironmentDraftScript(environmentSavedScript ?? "")}
                            disabled={environmentSaving || !isEnvironmentProject || !environmentDirty}
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            className="primary settings-button-compact"
                            onClick={() => {
                              void onSaveEnvironmentSetup();
                            }}
                            disabled={environmentSaving || !isEnvironmentProject || !hasAnyEnvironmentChanges}
                          >
                            {environmentSaving ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>

                      <div className="settings-field">
                        <label className="settings-field-label" htmlFor={`settings-worktrees-folder-${workspace.id}`}>
                          Worktrees folder
                        </label>
                        <div className="settings-help">
                          Custom location for this project's worktrees. Leave empty to use the
                          global root or the built-in default.
                        </div>
                        <div className="settings-field-row">
                          <input
                            id={`settings-worktrees-folder-${workspace.id}`}
                            type="text"
                            className="settings-input"
                            value={isEnvironmentProject ? worktreesFolderDraft : ""}
                            onChange={(event) => onSetWorktreesFolderDraft(event.target.value)}
                            placeholder="/path/to/worktrees"
                            disabled={environmentSaving || !isEnvironmentProject}
                          />
                          <button
                            type="button"
                            className="ghost settings-button-compact"
                            onClick={async () => {
                              try {
                                const { open } = await import("@tauri-apps/plugin-dialog");
                                const selected = await open({
                                  directory: true,
                                  multiple: false,
                                  title: "Select worktrees folder",
                                });
                                if (selected && typeof selected === "string") {
                                  onSetWorktreesFolderDraft(selected);
                                }
                              } catch (error) {
                                pushErrorToast({
                                  title: "Failed to open folder picker",
                                  message: error instanceof Error ? error.message : String(error),
                                });
                              }
                            }}
                            disabled={environmentSaving || !isEnvironmentProject}
                          >
                            Browse
                          </button>
                        </div>
                        <div className="settings-field-actions">
                          <button
                            type="button"
                            className="ghost settings-button-compact"
                            onClick={() => onSetWorktreesFolderDraft(worktreesFolderSaved ?? "")}
                            disabled={environmentSaving || !isEnvironmentProject || !worktreesFolderDirty}
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {projects.length === 0 && <div className="settings-empty">No projects yet.</div>}
      </div>
    </SettingsSection>
  );
}
