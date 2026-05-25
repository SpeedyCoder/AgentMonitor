import type { ThreadSummary } from "@/types";
import type { ThreadAction, ThreadState } from "../useThreadsReducer";
import { prefersUpdatedSort } from "./common";

type ThreadStatus = ThreadState["threadStatusById"][string];

function statusEquals(previous: ThreadStatus, nextStatus: ThreadStatus) {
  return (
    previous.isProcessing === nextStatus.isProcessing &&
    previous.hasUnread === nextStatus.hasUnread &&
    previous.isReviewing === nextStatus.isReviewing &&
    previous.processingStartedAt === nextStatus.processingStartedAt &&
    previous.lastDurationMs === nextStatus.lastDurationMs
  );
}

export function reduceThreadLifecycle(
  state: ThreadState,
  action: ThreadAction,
): ThreadState {
  switch (action.type) {
    case "setActiveThreadId":
      return {
        ...state,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: action.threadId,
        },
        threadStatusById: action.threadId
          ? {
              ...state.threadStatusById,
              [action.threadId]: {
                isProcessing:
                  state.threadStatusById[action.threadId]?.isProcessing ?? false,
                hasUnread: false,
                isReviewing:
                  state.threadStatusById[action.threadId]?.isReviewing ?? false,
                processingStartedAt:
                  state.threadStatusById[action.threadId]?.processingStartedAt ??
                  null,
                lastDurationMs:
                  state.threadStatusById[action.threadId]?.lastDurationMs ?? null,
              },
            }
          : state.threadStatusById,
      };
    case "ensureThread": {
      const hidden =
        state.hiddenThreadIdsByWorkspace[action.workspaceId]?.[action.threadId] ??
        false;
      if (hidden) {
        return state;
      }
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (list.some((thread) => thread.id === action.threadId)) {
        return state;
      }
      const now = Date.now();
      const thread: ThreadSummary = {
        id: action.threadId,
        name: "New Agent",
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: [...list, thread],
        },
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing: false,
            hasUnread: false,
            isReviewing: false,
            processingStartedAt: null,
            lastDurationMs: null,
          },
        },
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]:
            state.activeThreadIdByWorkspace[action.workspaceId] ?? action.threadId,
        },
      };
    }
    case "replaceThreadId": {
      const { workspaceId, fromThreadId, toThreadId } = action;
      if (!fromThreadId || !toThreadId || fromThreadId === toThreadId) {
        return state;
      }
      const list = state.threadsByWorkspace[workspaceId] ?? [];
      const fromThread = list.find((thread) => thread.id === fromThreadId);
      if (!fromThread) {
        return state;
      }
      const hasTarget = list.some((thread) => thread.id === toThreadId);
      const nextThreads = hasTarget
        ? list.filter((thread) => thread.id !== fromThreadId)
        : list.map((thread) =>
            thread.id === fromThreadId ? { ...thread, id: toThreadId } : thread,
          );
      const moveKey = <T,>(record: Record<string, T>) => {
        if (!(fromThreadId in record)) {
          return record;
        }
        const { [fromThreadId]: value, ...rest } = record;
        return toThreadId in rest ? rest : { ...rest, [toThreadId]: value };
      };
      const nextParents = { ...state.threadParentById };
      if (fromThreadId in nextParents) {
        if (!(toThreadId in nextParents)) {
          nextParents[toThreadId] = nextParents[fromThreadId];
        }
        delete nextParents[fromThreadId];
      }
      for (const [childId, parentId] of Object.entries(nextParents)) {
        if (parentId === fromThreadId) {
          nextParents[childId] = toThreadId;
        }
      }
      const nextHidden = { ...(state.hiddenThreadIdsByWorkspace[workspaceId] ?? {}) };
      if (nextHidden[fromThreadId]) {
        delete nextHidden[fromThreadId];
        nextHidden[toThreadId] = true;
      }
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [workspaceId]: nextThreads,
        },
        hiddenThreadIdsByWorkspace: {
          ...state.hiddenThreadIdsByWorkspace,
          [workspaceId]: nextHidden,
        },
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [workspaceId]:
            state.activeThreadIdByWorkspace[workspaceId] === fromThreadId
              ? toThreadId
              : state.activeThreadIdByWorkspace[workspaceId] ?? null,
        },
        itemsByThread: moveKey(state.itemsByThread),
        threadStatusById: moveKey(state.threadStatusById),
        threadResumeLoadingById: moveKey(state.threadResumeLoadingById),
        activeTurnIdByThread: moveKey(state.activeTurnIdByThread),
        turnDiffByThread: moveKey(state.turnDiffByThread),
        tokenUsageByThread: moveKey(state.tokenUsageByThread),
        planByThread: moveKey(state.planByThread),
        lastAgentMessageByThread: moveKey(state.lastAgentMessageByThread),
        threadParentById: nextParents,
      };
    }
    case "hideThread": {
      const hiddenForWorkspace =
        state.hiddenThreadIdsByWorkspace[action.workspaceId] ?? {};
      if (hiddenForWorkspace[action.threadId]) {
        return state;
      }

      const nextHiddenForWorkspace = {
        ...hiddenForWorkspace,
        [action.threadId]: true as const,
      };

      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const filtered = list.filter((thread) => thread.id !== action.threadId);
      const nextActive =
        state.activeThreadIdByWorkspace[action.workspaceId] === action.threadId
          ? filtered[0]?.id ?? null
          : state.activeThreadIdByWorkspace[action.workspaceId] ?? null;

      return {
        ...state,
        hiddenThreadIdsByWorkspace: {
          ...state.hiddenThreadIdsByWorkspace,
          [action.workspaceId]: nextHiddenForWorkspace,
        },
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: nextActive,
        },
      };
    }
    case "removeThread": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const filtered = list.filter((thread) => thread.id !== action.threadId);
      const nextActive =
        state.activeThreadIdByWorkspace[action.workspaceId] === action.threadId
          ? filtered[0]?.id ?? null
          : state.activeThreadIdByWorkspace[action.workspaceId] ?? null;
      const { [action.threadId]: _, ...restItems } = state.itemsByThread;
      const { [action.threadId]: __, ...restStatus } = state.threadStatusById;
      const { [action.threadId]: ___, ...restTurns } = state.activeTurnIdByThread;
      const { [action.threadId]: ____, ...restDiffs } = state.turnDiffByThread;
      const { [action.threadId]: _____, ...restPlans } = state.planByThread;
      const { [action.threadId]: ______, ...restParents } = state.threadParentById;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        itemsByThread: restItems,
        threadStatusById: restStatus,
        activeTurnIdByThread: restTurns,
        turnDiffByThread: restDiffs,
        planByThread: restPlans,
        threadParentById: restParents,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: nextActive,
        },
      };
    }
    case "setThreadParent": {
      if (!action.parentId || action.parentId === action.threadId) {
        return state;
      }
      if (state.threadParentById[action.threadId] === action.parentId) {
        return state;
      }
      return {
        ...state,
        threadParentById: {
          ...state.threadParentById,
          [action.threadId]: action.parentId,
        },
      };
    }
    case "markProcessing": {
      const previous = state.threadStatusById[action.threadId];
      const wasProcessing = previous?.isProcessing ?? false;
      const startedAt = previous?.processingStartedAt ?? null;
      const lastDurationMs = previous?.lastDurationMs ?? null;
      const hasUnread = previous?.hasUnread ?? false;
      const isReviewing = previous?.isReviewing ?? false;
      if (action.isProcessing) {
        const nextStartedAt =
          wasProcessing && startedAt ? startedAt : action.timestamp;
        const nextStatus: ThreadStatus = {
          isProcessing: true,
          hasUnread,
          isReviewing,
          processingStartedAt: nextStartedAt,
          lastDurationMs,
        };
        if (previous && statusEquals(previous, nextStatus)) {
          return state;
        }
        return {
          ...state,
          threadStatusById: {
            ...state.threadStatusById,
            [action.threadId]: nextStatus,
          },
        };
      }
      const nextDuration =
        wasProcessing && startedAt
          ? Math.max(0, action.timestamp - startedAt)
          : lastDurationMs ?? null;
      const nextStatus: ThreadStatus = {
        isProcessing: false,
        hasUnread,
        isReviewing,
        processingStartedAt: null,
        lastDurationMs: nextDuration,
      };
      if (previous && statusEquals(previous, nextStatus)) {
        return state;
      }
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: nextStatus,
        },
      };
    }
    case "setActiveTurnId":
      return {
        ...state,
        activeTurnIdByThread: {
          ...state.activeTurnIdByThread,
          [action.threadId]: action.turnId,
        },
      };
    case "markReviewing": {
      const previous = state.threadStatusById[action.threadId];
      const nextStatus: ThreadStatus = {
        isProcessing: previous?.isProcessing ?? false,
        hasUnread: previous?.hasUnread ?? false,
        isReviewing: action.isReviewing,
        processingStartedAt: previous?.processingStartedAt ?? null,
        lastDurationMs: previous?.lastDurationMs ?? null,
      };
      if (previous && statusEquals(previous, nextStatus)) {
        return state;
      }
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: nextStatus,
        },
      };
    }
    case "markUnread": {
      const previous = state.threadStatusById[action.threadId];
      const nextStatus: ThreadStatus = {
        isProcessing: previous?.isProcessing ?? false,
        hasUnread: action.hasUnread,
        isReviewing: previous?.isReviewing ?? false,
        processingStartedAt: previous?.processingStartedAt ?? null,
        lastDurationMs: previous?.lastDurationMs ?? null,
      };
      if (previous && statusEquals(previous, nextStatus)) {
        return state;
      }
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: nextStatus,
        },
      };
    }
    case "setThreadName": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (!list.length) {
        return state;
      }
      let didChange = false;
      const next = list.map((thread) => {
        if (thread.id !== action.threadId || thread.name === action.name) {
          return thread;
        }
        didChange = true;
        return { ...thread, name: action.name };
      });
      if (!didChange) {
        return state;
      }
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: next,
        },
      };
    }
    case "mergeThreadSummary": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (!list.length) {
        return state;
      }
      let didChange = false;
      const next = list.map((thread) => {
        if (thread.id !== action.threadId) {
          return thread;
        }
        const patchEntries = Object.entries(action.patch).filter(
          ([, value]) => value !== undefined,
        ) as Array<[keyof typeof action.patch, NonNullable<(typeof action.patch)[keyof typeof action.patch]>]>;
        if (!patchEntries.length) {
          return thread;
        }
        let nextThread = thread;
        patchEntries.forEach(([key, value]) => {
          if (nextThread[key as keyof ThreadSummary] === value) {
            return;
          }
          nextThread = {
            ...nextThread,
            [key]: value,
          };
          didChange = true;
        });
        return nextThread;
      });
      if (!didChange) {
        return state;
      }
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: next,
        },
      };
    }
    case "setThreadTimestamp": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (!list.length) {
        return state;
      }
      let didChange = false;
      const next = list.map((thread) => {
        if (thread.id !== action.threadId) {
          return thread;
        }
        const current = thread.updatedAt ?? 0;
        if (current >= action.timestamp) {
          return thread;
        }
        didChange = true;
        return { ...thread, updatedAt: action.timestamp };
      });
      if (!didChange) {
        return state;
      }
      const sorted = prefersUpdatedSort(state, action.workspaceId)
        ? [
            ...next.filter((thread) => thread.id === action.threadId),
            ...next.filter((thread) => thread.id !== action.threadId),
          ]
        : next;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: sorted,
        },
      };
    }
    case "setThreads": {
      const hidden = state.hiddenThreadIdsByWorkspace[action.workspaceId] ?? {};
      const visibleThreads = action.threads.filter((thread) => !hidden[thread.id]);
      const preserveAnchors = action.preserveAnchors === true;
      if (!preserveAnchors) {
        const currentActiveThreadId =
          state.activeThreadIdByWorkspace[action.workspaceId] ?? null;
        const activeThreadStillVisible = currentActiveThreadId
          ? visibleThreads.some((thread) => thread.id === currentActiveThreadId)
          : false;
        return {
          ...state,
          threadsByWorkspace: {
            ...state.threadsByWorkspace,
            [action.workspaceId]: visibleThreads,
          },
          activeThreadIdByWorkspace: {
            ...state.activeThreadIdByWorkspace,
            [action.workspaceId]: activeThreadStillVisible
              ? currentActiveThreadId
              : (visibleThreads[0]?.id ?? null),
          },
          threadSortKeyByWorkspace: {
            ...state.threadSortKeyByWorkspace,
            [action.workspaceId]: action.sortKey,
          },
        };
      }
      const existingThreads = state.threadsByWorkspace[action.workspaceId] ?? [];
      const existingById = new Map(
        existingThreads.map((thread) => [thread.id, thread] as const),
      );
      const reconciled = [...visibleThreads];
      const includedIds = new Set(reconciled.map((thread) => thread.id));
      const freshenAnchorSummary = (summary: ThreadSummary) => {
        const lastMessageTimestamp =
          state.lastAgentMessageByThread[summary.id]?.timestamp ?? 0;
        const processingStartedAt =
          state.threadStatusById[summary.id]?.processingStartedAt ?? 0;
        const nextUpdatedAt = Math.max(
          summary.updatedAt ?? 0,
          lastMessageTimestamp,
          processingStartedAt,
        );
        if (nextUpdatedAt <= (summary.updatedAt ?? 0)) {
          return summary;
        }
        return {
          ...summary,
          updatedAt: nextUpdatedAt,
        };
      };
      const appendExistingAnchor = (threadId: string | null | undefined) => {
        if (!threadId || hidden[threadId] || includedIds.has(threadId)) {
          return;
        }
        const summary = existingById.get(threadId);
        if (!summary) {
          return;
        }
        reconciled.push(freshenAnchorSummary(summary));
        includedIds.add(threadId);
      };

      const activeThreadId = state.activeThreadIdByWorkspace[action.workspaceId];
      appendExistingAnchor(activeThreadId);
      existingThreads.forEach((thread) => {
        if (state.threadStatusById[thread.id]?.isProcessing) {
          appendExistingAnchor(thread.id);
        }
      });

      const seedThreadIds = [...includedIds];
      seedThreadIds.forEach((threadId) => {
        const visited = new Set<string>([threadId]);
        let parentId = state.threadParentById[threadId];
        while (parentId && !visited.has(parentId)) {
          visited.add(parentId);
          appendExistingAnchor(parentId);
          parentId = state.threadParentById[parentId];
        }
      });

      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: reconciled,
        },
        threadSortKeyByWorkspace: {
          ...state.threadSortKeyByWorkspace,
          [action.workspaceId]: action.sortKey,
        },
      };
    }
    case "setThreadListLoading":
      return {
        ...state,
        threadListLoadingByWorkspace: {
          ...state.threadListLoadingByWorkspace,
          [action.workspaceId]: action.isLoading,
        },
      };
    case "setThreadResumeLoading":
      return {
        ...state,
        threadResumeLoadingById: {
          ...state.threadResumeLoadingById,
          [action.threadId]: action.isLoading,
        },
      };
    case "setThreadListPaging":
      return {
        ...state,
        threadListPagingByWorkspace: {
          ...state.threadListPagingByWorkspace,
          [action.workspaceId]: action.isLoading,
        },
      };
    case "setThreadListCursor":
      return {
        ...state,
        threadListCursorByWorkspace: {
          ...state.threadListCursorByWorkspace,
          [action.workspaceId]: action.cursor,
        },
      };
    default:
      return state;
  }
}
