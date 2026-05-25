import { useCallback } from "react";
import type { ThreadListSortKey, WorkspaceInfo } from "../../../types";

type ListThreadsOptions = {
  sortKey?: ThreadListSortKey;
};

type UseThreadListActionsOptions = {
  threadListSortKey: ThreadListSortKey;
  setThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  workspaces: WorkspaceInfo[];
  listThreadsForWorkspaces: (
    workspaces: WorkspaceInfo[],
    options?: ListThreadsOptions,
  ) => void | Promise<void>;
};

export function useThreadListActions({
  threadListSortKey,
  setThreadListSortKey,
  workspaces,
  listThreadsForWorkspaces,
}: UseThreadListActionsOptions) {
  const handleSetThreadListSortKey = useCallback(
    (nextSortKey: ThreadListSortKey) => {
      if (nextSortKey === threadListSortKey) {
        return;
      }
      setThreadListSortKey(nextSortKey);
      const connectedWorkspaces = workspaces.filter((workspace) => workspace.connected);
      if (connectedWorkspaces.length > 0) {
        void listThreadsForWorkspaces(connectedWorkspaces, { sortKey: nextSortKey });
      }
    },
    [threadListSortKey, setThreadListSortKey, workspaces, listThreadsForWorkspaces],
  );

  return {
    handleSetThreadListSortKey,
  };
}
