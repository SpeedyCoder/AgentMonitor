// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useThreadListActions } from "./useThreadListActions";

function workspace(id: string, connected: boolean): WorkspaceInfo {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    connected,
    settings: { sidebarCollapsed: false },
  };
}

describe("useThreadListActions", () => {
  it("reloads connected workspace threads when the sort key changes", () => {
    const workspaces = [workspace("one", true), workspace("two", false), workspace("three", true)];
    const setThreadListSortKey = vi.fn();
    const listThreadsForWorkspaces = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useThreadListActions({
        threadListSortKey: "updated_at",
        setThreadListSortKey,
        workspaces,
        listThreadsForWorkspaces,
      }),
    );

    act(() => {
      result.current.handleSetThreadListSortKey("created_at");
    });

    expect(setThreadListSortKey).toHaveBeenCalledWith("created_at");
    expect(listThreadsForWorkspaces).toHaveBeenCalledTimes(1);
    expect(listThreadsForWorkspaces).toHaveBeenCalledWith([workspaces[0], workspaces[2]], {
      sortKey: "created_at",
    });
  });

  it("does not reload threads when selecting the current sort key", () => {
    const listThreadsForWorkspaces = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useThreadListActions({
        threadListSortKey: "updated_at",
        setThreadListSortKey: vi.fn(),
        workspaces: [workspace("one", true)],
        listThreadsForWorkspaces,
      }),
    );

    act(() => {
      result.current.handleSetThreadListSortKey("updated_at");
    });

    expect(listThreadsForWorkspaces).not.toHaveBeenCalled();
  });
});
