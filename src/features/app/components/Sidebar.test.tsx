// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { Sidebar } from "./Sidebar";

afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  }
  cleanup();
});

const baseProps = {
  workspaces: [],
  groupedWorkspaces: [],
  hasWorkspaceGroups: false,
  deletingWorktreeIds: new Set<string>(),
  threadsByWorkspace: {},
  threadParentById: {},
  threadStatusById: {},
  threadListLoadingByWorkspace: {},
  threadListPagingByWorkspace: {},
  threadListCursorByWorkspace: {},
  pinnedThreadsVersion: 0,
  threadListSortKey: "updated_at" as const,
  onSetThreadListSortKey: vi.fn(),
  threadListOrganizeMode: "by_project" as const,
  onSetThreadListOrganizeMode: vi.fn(),
  onRefreshAllThreads: vi.fn(),
  activeWorkspaceId: null,
  activeThreadId: null,
  onOpenSettings: vi.fn(),
  onOpenDebug: vi.fn(),
  showDebugButton: false,
  onAddWorkspace: vi.fn(),
  onSelectHome: vi.fn(),
  onSelectWorkspace: vi.fn(),
  onConnectWorkspace: vi.fn(),
  onAddAgent: vi.fn(),
  onAddWorktreeAgent: vi.fn(),
  onToggleWorkspaceCollapse: vi.fn(),
  onSelectThread: vi.fn(),
  onDeleteThread: vi.fn(),
  onSyncThread: vi.fn(),
  pinThread: vi.fn(() => false),
  unpinThread: vi.fn(),
  isThreadPinned: vi.fn(() => false),
  getPinTimestamp: vi.fn(() => null),
  onRenameThread: vi.fn(),
  onDeleteWorkspace: vi.fn(),
  onDeleteWorktree: vi.fn(),
  onLoadOlderThreads: vi.fn(),
  onReloadWorkspaceThreads: vi.fn(),
  workspaceDropTargetRef: createRef<HTMLElement>(),
  isWorkspaceDropActive: false,
  workspaceDropText: "Drop Project Here",
  onWorkspaceDragOver: vi.fn(),
  onWorkspaceDragEnter: vi.fn(),
  onWorkspaceDragLeave: vi.fn(),
  onWorkspaceDrop: vi.fn(),
};

describe("Sidebar", () => {
  it("opens thread sort menu from the header filter button", () => {
    const onSetThreadListSortKey = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        threadListSortKey="updated_at"
        onSetThreadListSortKey={onSetThreadListSortKey}
      />,
    );

    const button = screen.getByRole("button", { name: "Organize and sort threads" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(button);
    const option = screen.getByRole("menuitemradio", { name: "Created" });
    fireEvent.click(option);

    expect(onSetThreadListSortKey).toHaveBeenCalledWith("created_at");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("changes organize mode from the header filter menu", () => {
    const onSetThreadListOrganizeMode = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        threadListOrganizeMode="by_project"
        onSetThreadListOrganizeMode={onSetThreadListOrganizeMode}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Organize and sort threads" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Thread list" }));

    expect(onSetThreadListOrganizeMode).toHaveBeenCalledWith("threads_only");
  });

  it("toggles project expansion from the project row without selecting project home", () => {
    const onToggleWorkspaceCollapse = vi.fn();
    const onSelectWorkspace = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
        onSelectWorkspace={onSelectWorkspace}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse Workspace" }));

    expect(onToggleWorkspaceCollapse).toHaveBeenCalledWith("ws-1", true);
    expect(onSelectWorkspace).not.toHaveBeenCalled();
  });

  it("omits the account button from the bottom rail", () => {
    render(
      <Sidebar
        {...baseProps}
        activeWorkspaceId="ws-1"
      />,
    );

    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
  });

  it("opens settings from the bottom rail icon button", () => {
    const onOpenSettings = vi.fn();
    render(<Sidebar {...baseProps} onOpenSettings={onOpenSettings} />);

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("refreshes all workspace threads from the header button", () => {
    const onRefreshAllThreads = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        onRefreshAllThreads={onRefreshAllThreads}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh all project threads" }));
    expect(onRefreshAllThreads).toHaveBeenCalledTimes(1);
  });

  it("spins the refresh icon while workspace threads are refreshing", () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadListLoadingByWorkspace={{ "ws-1": true }}
      />,
    );

    const refreshButton = screen.getByRole("button", { name: "Refresh all project threads" });
    expect(refreshButton.getAttribute("aria-busy")).toBe("true");
    const icon = refreshButton.querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("spinning");
  });

  it("renders worktrees nested under their project", () => {
    const { container } = render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Main Project",
            path: "/tmp/main",
            connected: true,
            kind: "main",
            settings: { sidebarCollapsed: false },
          },
          {
            id: "wt-1",
            name: "Feature Branch",
            path: "/tmp/main-feature",
            connected: true,
            kind: "worktree",
            parentId: "ws-1",
            worktree: { branch: "feature/branch" },
            settings: {
              sidebarCollapsed: false,
            },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Main Project",
                path: "/tmp/main",
                connected: true,
                kind: "main",
                settings: { sidebarCollapsed: false },
              },
              {
                id: "wt-1",
                name: "Feature Branch",
                path: "/tmp/main-feature",
                connected: true,
                kind: "worktree",
                parentId: "ws-1",
                worktree: { branch: "feature/branch" },
                settings: {
                  sidebarCollapsed: false,
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Worktrees")).toBeTruthy();
    expect(screen.getByText("Feature Branch")).toBeTruthy();
    expect(container.querySelectorAll(".workspace-row")).toHaveLength(1);
    expect(container.querySelectorAll(".worktree-row")).toHaveLength(1);
  });

  it("opens a project add menu with a worktree action", () => {
    const onAddWorktreeAgent = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        onAddWorktreeAgent={onAddWorktreeAgent}
        workspaces={[
          {
            id: "ws-1",
            name: "Main Project",
            path: "/tmp/main",
            connected: true,
            kind: "main",
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Main Project",
                path: "/tmp/main",
                connected: true,
                kind: "main",
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add agent options" }));
    fireEvent.click(screen.getByRole("button", { name: "New worktree" }));

    expect(onAddWorktreeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-1" }),
    );
  });

  it("sorts projects by worktree activity when project activity mode is active", () => {
    const { container } = render(
      <Sidebar
        {...baseProps}
        threadListOrganizeMode="by_project_activity"
        workspaces={[
          {
            id: "ws-a",
            name: "Alpha Project",
            path: "/tmp/alpha",
            connected: true,
            kind: "main",
            settings: { sidebarCollapsed: false },
          },
          {
            id: "wt-a",
            name: "Alpha Worktree",
            path: "/tmp/alpha-worktree",
            connected: true,
            kind: "worktree",
            parentId: "ws-a",
            worktree: { branch: "feature/a" },
            settings: {
              sidebarCollapsed: false,
            },
          },
          {
            id: "ws-b",
            name: "Beta Project",
            path: "/tmp/beta",
            connected: true,
            kind: "main",
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-a",
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                kind: "main",
                settings: { sidebarCollapsed: false },
              },
              {
                id: "wt-a",
                name: "Alpha Worktree",
                path: "/tmp/alpha-worktree",
                connected: true,
                kind: "worktree",
                parentId: "ws-a",
                worktree: { branch: "feature/a" },
                settings: {
                  sidebarCollapsed: false,
                },
              },
              {
                id: "ws-b",
                name: "Beta Project",
                path: "/tmp/beta",
                connected: true,
                kind: "main",
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadListLoadingByWorkspace={{ "wt-a": true }}
      />,
    );

    const workspaceNames = Array.from(
      container.querySelectorAll(".workspace-row .workspace-name"),
    ).map((node) => node.textContent?.trim());
    expect(workspaceNames[0]).toBe("Alpha Project");
    expect(workspaceNames[1]).toBe("Beta Project");
  });
});
