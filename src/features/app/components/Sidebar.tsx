import type {
  RequestUserInputRequest,
  ThreadListOrganizeMode,
  ThreadListSortKey,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import { memo, useMemo } from "react";
import type { RefObject } from "react";
import { FolderOpen } from "lucide-react";
import { SidebarBottomRail } from "./SidebarBottomRail";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarWorkspaceGroups } from "./SidebarWorkspaceGroups";
import type { WorkspaceGroupSection } from "./sidebarTypes";
import { useSidebarMenus } from "../hooks/useSidebarMenus";
import { useSidebarScrollFade } from "../hooks/useSidebarScrollFade";
import type { ThreadStatusById } from "../../../utils/threadStatus";

type SidebarProps = {
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: WorkspaceGroupSection[];
  deletingWorktreeIds: Set<string>;
  defaultWorktreeBranchFormat: string;
  newAgentDraftWorkspaceId?: string | null;
  startingDraftThreadWorkspaceId?: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  historicalThreadsByWorkspace?: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
  threadStatusById: ThreadStatusById;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  pinnedThreadsVersion: number;
  threadListSortKey?: ThreadListSortKey;
  onSetThreadListSortKey?: (sortKey: ThreadListSortKey) => void;
  threadListOrganizeMode: ThreadListOrganizeMode;
  onSetThreadListOrganizeMode?: (organizeMode: ThreadListOrganizeMode) => void;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  userInputRequests?: RequestUserInputRequest[];
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  onAddWorkspace: () => void;
  onSelectHome: () => void;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  pinThread: (workspaceId: string, threadId: string) => boolean;
  unpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  workspaceDropTargetRef: RefObject<HTMLElement | null>;
  isWorkspaceDropActive: boolean;
  workspaceDropText: string;
  onWorkspaceDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDrop: (event: React.DragEvent<HTMLElement>) => void;
};

export const Sidebar = memo(function Sidebar({
  workspaces,
  groupedWorkspaces,
  deletingWorktreeIds,
  defaultWorktreeBranchFormat,
  threadsByWorkspace,
  historicalThreadsByWorkspace: _historicalThreadsByWorkspace,
  threadStatusById,
  threadListLoadingByWorkspace,
  threadListOrganizeMode,
  activeWorkspaceId,
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  onAddWorkspace,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddWorktreeAgent,
  onToggleWorkspaceCollapse,
  onDeleteThread,
  onSyncThread,
  pinThread,
  unpinThread,
  isThreadPinned,
  onRenameThread,
  onDeleteWorkspace,
  onDeleteWorktree,
  onReloadWorkspaceThreads,
  workspaceDropTargetRef,
  isWorkspaceDropActive,
  workspaceDropText,
  onWorkspaceDragOver,
  onWorkspaceDragEnter,
  onWorkspaceDragLeave,
  onWorkspaceDrop,
}: SidebarProps) {
  const { showWorkspaceMenu, showWorktreeMenu } = useSidebarMenus({
    onDeleteThread,
    onSyncThread,
    onPinThread: pinThread,
    onUnpinThread: unpinThread,
    isThreadPinned,
    onRenameThread,
    onReloadWorkspaceThreads,
    onDeleteWorkspace,
    onDeleteWorktree,
  });

  const worktreesByParent = useMemo(() => {
    const worktrees = new Map<string, WorkspaceInfo[]>();
    workspaces
      .filter((entry) => (entry.kind ?? "main") === "worktree" && entry.parentId)
      .forEach((entry) => {
        const parentId = entry.parentId as string;
        const list = worktrees.get(parentId) ?? [];
        list.push(entry);
        worktrees.set(parentId, list);
      });
    worktrees.forEach((entries) => {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    });
    return worktrees;
  }, [workspaces]);

  const activeAgentWorkspaceIds = useMemo(() => {
    const workspaceIds = new Set<string>();
    Object.entries(threadsByWorkspace).forEach(([workspaceId, threads]) => {
      if (threads.some((thread) => threadStatusById[thread.id]?.isProcessing)) {
        workspaceIds.add(workspaceId);
      }
    });
    return workspaceIds;
  }, [threadsByWorkspace, threadStatusById]);

  const groupedWorkspacesForRender = useMemo(() => {
    if (threadListOrganizeMode !== "by_project_activity") {
      return groupedWorkspaces;
    }
    const projectActivity = new Map<string, number>();
    groupedWorkspaces.forEach((group) => {
      group.workspaces.forEach((workspace) => {
        const worktreeTimestamps = (worktreesByParent.get(workspace.id) ?? [])
          .map((worktree) => (threadListLoadingByWorkspace[worktree.id] ? Date.now() : 0))
          .filter((value) => value > 0);
        projectActivity.set(
          workspace.id,
          worktreeTimestamps.length > 0 ? Math.max(...worktreeTimestamps) : 0,
        );
      });
    });
    return groupedWorkspaces.map((group) => ({
      ...group,
      workspaces: group.workspaces.slice().sort((a, b) => {
        const tsDiff = (projectActivity.get(b.id) ?? 0) - (projectActivity.get(a.id) ?? 0);
        return tsDiff !== 0 ? tsDiff : a.name.localeCompare(b.name);
      }),
    }));
  }, [groupedWorkspaces, threadListLoadingByWorkspace, threadListOrganizeMode, worktreesByParent]);

  const scrollFadeDeps = useMemo(
    () => [groupedWorkspacesForRender, worktreesByParent],
    [groupedWorkspacesForRender, worktreesByParent],
  );
  const { sidebarBodyRef, scrollFade, updateScrollFade } =
    useSidebarScrollFade(scrollFadeDeps);

  const showEmptyState = groupedWorkspacesForRender.every(
    (group) => group.workspaces.filter((workspace) => (workspace.kind ?? "main") === "main").length === 0,
  );
  const sidebarWorkspacesForRender = useMemo(
    () =>
      groupedWorkspacesForRender.flatMap((group) =>
        group.workspaces.filter((workspace) => (workspace.kind ?? "main") === "main"),
      ),
    [groupedWorkspacesForRender],
  );

  return (
    <aside
      className="sidebar"
      ref={workspaceDropTargetRef}
      onDragOver={onWorkspaceDragOver}
      onDragEnter={onWorkspaceDragEnter}
      onDragLeave={onWorkspaceDragLeave}
      onDrop={onWorkspaceDrop}
    >
      <div className="sidebar-drag-strip" />
      <SidebarHeader
        onAddWorkspace={onAddWorkspace}
      />
      <div
        className={`workspace-drop-overlay${isWorkspaceDropActive ? " is-active" : ""}`}
        aria-hidden
      >
        <div
          className={`workspace-drop-overlay-text${
            workspaceDropText === "Adding Project..." ? " is-busy" : ""
          }`}
        >
          {workspaceDropText === "Drop Project Here" ? (
            <FolderOpen className="workspace-drop-overlay-icon" aria-hidden />
          ) : null}
          {workspaceDropText}
        </div>
      </div>
      <div
        className={`sidebar-body${scrollFade.top ? " fade-top" : ""}${
          scrollFade.bottom ? " fade-bottom" : ""
        }`}
        onScroll={updateScrollFade}
        ref={sidebarBodyRef}
      >
        <div className="workspace-list">
          <SidebarWorkspaceGroups
            workspaces={sidebarWorkspacesForRender}
            worktreesByParent={worktreesByParent}
            deletingWorktreeIds={deletingWorktreeIds}
            defaultWorktreeBranchFormat={defaultWorktreeBranchFormat}
            activeAgentWorkspaceIds={activeAgentWorkspaceIds}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={onSelectWorkspace}
            onConnectWorkspace={onConnectWorkspace}
            onAddWorktreeAgent={onAddWorktreeAgent}
            onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
            onShowWorkspaceMenu={showWorkspaceMenu}
            onShowWorktreeMenu={showWorktreeMenu}
          />
          {showEmptyState ? <div className="empty">Add a project to start.</div> : null}
        </div>
      </div>
      <SidebarBottomRail
        onOpenSettings={onOpenSettings}
        onOpenDebug={onOpenDebug}
        showDebugButton={showDebugButton}
      />
    </aside>
  );
});

Sidebar.displayName = "Sidebar";
