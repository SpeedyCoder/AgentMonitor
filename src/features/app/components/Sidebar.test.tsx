// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { Sidebar } from "./Sidebar";
import type { AppSettings } from "@/types";

const minimalAppSettings = {
  backendMode: "local",
  remoteBackends: [],
  activeRemoteBackendId: null,
  remoteBackendProvider: "tcp",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
} as unknown as AppSettings;

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
  deletingWorktreeIds: new Set<string>(),
  defaultWorktreeBranchFormat: "trantor/{date}-{random}",
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
  appSettings: minimalAppSettings,
  onUpdateAppSettings: vi.fn(),
};

describe("Sidebar", () => {
  it("does not render the removed organize and sort threads button", () => {
    render(<Sidebar {...baseProps} />);

    expect(
      screen.queryByRole("button", { name: "Organize and sort threads" }),
    ).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
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

  it("lists workspaces directly without rendering a Workspaces group item", () => {
    const { container } = render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Alpha Project",
            path: "/tmp/alpha",
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
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Alpha Project")).toBeTruthy();
    expect(screen.queryByText("Workspaces")).toBeNull();
    expect(container.querySelectorAll(".workspace-row")).toHaveLength(1);
    expect(container.querySelectorAll(".workspace-group-header")).toHaveLength(0);
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

    expect(screen.queryByText("Worktrees")).toBeNull();
    expect(screen.getByText("Feature Branch")).toBeTruthy();
    expect(container.querySelectorAll(".workspace-row")).toHaveLength(1);
    expect(container.querySelectorAll(".worktree-row")).toHaveLength(1);
  });

  it("does not show an activity indicator on projects with a processing thread", () => {
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
        threadsByWorkspace={{
          "ws-1": [{ id: "thread-1", name: "Running thread", updatedAt: 1 }],
        }}
        threadStatusById={{ "thread-1": { isProcessing: true } }}
      />,
    );

    const indicator = container.querySelector(".workspace-row .workspace-activity-indicator");
    expect(indicator).toBeNull();
  });

  it("renders only the folder icon on idle projects", () => {
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

    const indicator = container.querySelector(".workspace-row .workspace-activity-indicator");
    expect(indicator).toBeNull();
    expect(container.querySelector(".workspace-row .workspace-folder-icon")).toBeTruthy();
  });

  it("shows an activity indicator on worktrees with a processing thread", () => {
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
              {
                id: "wt-1",
                name: "Feature Branch",
                path: "/tmp/main-feature",
                connected: true,
                kind: "worktree",
                parentId: "ws-1",
                worktree: { branch: "feature/branch" },
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "wt-1": [{ id: "thread-1", name: "Running thread", updatedAt: 1 }],
        }}
        threadStatusById={{ "thread-1": { isProcessing: true } }}
      />,
    );

    const indicator = container.querySelector(".worktree-row .workspace-activity-indicator");
    expect(indicator).toBeTruthy();
    expect(indicator?.getAttribute("aria-label")).toBe("Agent running in worktree");
  });

  it("opens the worktree agent prompt from the project add button", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "New worktree agent" }));

    expect(onAddWorktreeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-1" }),
    );
    expect(screen.queryByRole("button", { name: "New worktree" })).toBeNull();
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
