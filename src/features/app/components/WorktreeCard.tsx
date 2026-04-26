import type { MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";

type WorktreeCardProps = {
  worktree: WorkspaceInfo;
  isActive: boolean;
  isDeleting?: boolean;
  onSelectWorkspace: (id: string) => void;
  onShowWorktreeMenu: (event: MouseEvent, worktree: WorkspaceInfo) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
};

export function WorktreeCard({
  worktree,
  isActive,
  isDeleting = false,
  onSelectWorkspace,
  onShowWorktreeMenu,
  onConnectWorkspace,
}: WorktreeCardProps) {
  const worktreeBranch = worktree.worktree?.branch ?? "";
  const worktreeLabel = worktree.name?.trim() || worktreeBranch;
  const worktreeMeta =
    worktreeBranch && worktreeBranch !== worktreeLabel ? worktreeBranch : null;

  return (
    <div className={`worktree-card${isDeleting ? " deleting" : ""}`}>
      <div
        className={`worktree-row ${isActive ? "active" : ""}${isDeleting ? " deleting" : ""}`}
        role="button"
        tabIndex={isDeleting ? -1 : 0}
        aria-disabled={isDeleting}
        onClick={() => {
          if (!isDeleting) {
            onSelectWorkspace(worktree.id);
          }
        }}
        onContextMenu={(event) => {
          if (!isDeleting) {
            onShowWorktreeMenu(event, worktree);
          }
        }}
        onKeyDown={(event) => {
          if (isDeleting) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectWorkspace(worktree.id);
          }
        }}
      >
        <div className="worktree-copy">
          <div className="worktree-label">{worktreeLabel}</div>
          {worktreeMeta ? <div className="worktree-meta">{worktreeMeta}</div> : null}
        </div>
        <div className="worktree-actions">
          {isDeleting ? (
            <div className="worktree-deleting" role="status" aria-live="polite">
              <span className="worktree-deleting-spinner" aria-hidden />
              <span className="worktree-deleting-label">Deleting</span>
            </div>
          ) : !worktree.connected ? (
            <span
              className="connect"
              title="Connect project context to the shared Codex server"
              onClick={(event) => {
                event.stopPropagation();
                onConnectWorkspace(worktree);
              }}
            >
              connect
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
