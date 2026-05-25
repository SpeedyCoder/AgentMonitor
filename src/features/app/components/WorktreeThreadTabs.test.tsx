// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import { WorktreeThreadTabs } from "./WorktreeThreadTabs";

const workspace: WorkspaceInfo = {
  id: "worktree-1",
  name: "Feature Worktree",
  path: "/tmp/feature",
  connected: true,
  kind: "worktree",
  parentId: "project-1",
  worktree: { branch: "feature/test" },
  settings: { sidebarCollapsed: false },
};

function thread(overrides: Partial<ThreadSummary> & Pick<ThreadSummary, "id" | "name">): ThreadSummary {
  return {
    updatedAt: 0,
    ...overrides,
  };
}

describe("WorktreeThreadTabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders agents from left to right by creation time", () => {
    render(
      <WorktreeThreadTabs
        workspace={workspace}
        threads={[
          thread({ id: "new", name: "Newest", updatedAt: 300, createdAt: 300 }),
          thread({ id: "old", name: "Oldest", updatedAt: 100, createdAt: 100 }),
          thread({ id: "mid", name: "Middle", updatedAt: 200, createdAt: 200 }),
        ]}
        threadStatusById={{}}
        activeThreadId="mid"
        onSelectThread={vi.fn()}
        onStartThread={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Oldest",
      "Middle",
      "Newest",
    ]);
  });

  it("shows status indicators for agent tabs", () => {
    const { container } = render(
      <WorktreeThreadTabs
        workspace={workspace}
        threads={[
          thread({ id: "idle", name: "Idle", updatedAt: 100, createdAt: 100 }),
          thread({ id: "running", name: "Running", updatedAt: 200, createdAt: 200 }),
        ]}
        threadStatusById={{ running: { isProcessing: true } }}
        activeThreadId="running"
        onSelectThread={vi.fn()}
        onStartThread={vi.fn()}
      />,
    );

    const indicators = container.querySelectorAll(".terminal-tab-status");
    expect(indicators).toHaveLength(2);
    expect(indicators[0]?.className).not.toContain("is-active");
    expect(indicators[1]?.className).toContain("is-active");
    expect(indicators[1]?.getAttribute("aria-label")).toBe("Running is running");
  });

  it("starts a new agent from the add button", () => {
    const onStartThread = vi.fn();
    render(
      <WorktreeThreadTabs
        workspace={workspace}
        threads={[]}
        threadStatusById={{}}
        activeThreadId={null}
        onSelectThread={vi.fn()}
        onStartThread={onStartThread}
      />,
    );

    const addButton = screen.getByRole("button", {
      name: "Start a new thread in Feature Worktree",
    });
    expect(addButton.getAttribute("data-tauri-drag-region")).toBe("false");

    fireEvent.click(addButton);

    expect(onStartThread).toHaveBeenCalledWith("worktree-1");
  });

  it("invokes close for tabs that can close", () => {
    const onCloseThread = vi.fn();
    render(
      <WorktreeThreadTabs
        workspace={workspace}
        threads={[
          thread({ id: "empty", name: "New Agent", updatedAt: 100, createdAt: 100 }),
          thread({ id: "other", name: "Other", updatedAt: 200, createdAt: 200 }),
        ]}
        threadStatusById={{}}
        activeThreadId="empty"
        onSelectThread={vi.fn()}
        onStartThread={vi.fn()}
        onCloseThread={onCloseThread}
        canCloseThread={(_workspaceId, threadId) => threadId === "empty"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close New Agent" }));

    expect(onCloseThread).toHaveBeenCalledWith("worktree-1", "empty");
  });

  it("hides close controls for protected tabs", () => {
    render(
      <WorktreeThreadTabs
        workspace={workspace}
        threads={[thread({ id: "empty", name: "New Agent", updatedAt: 100, createdAt: 100 })]}
        threadStatusById={{}}
        activeThreadId="empty"
        onSelectThread={vi.fn()}
        onStartThread={vi.fn()}
        onCloseThread={vi.fn()}
        canCloseThread={() => false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Close New Agent" })).toBeNull();
  });
});
