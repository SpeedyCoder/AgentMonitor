import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import { TerminalTabs } from "../../terminal/components/TerminalTabs";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";

type WorktreeThreadTabsProps = {
  workspace: WorkspaceInfo;
  threads: ThreadSummary[];
  threadStatusById: ThreadStatusById;
  activeThreadId: string | null;
  historyOpen?: boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onStartThread: (workspaceId: string) => void;
  onCloseThread?: (workspaceId: string, threadId: string) => void;
  canCloseThread?: (workspaceId: string, threadId: string) => boolean;
  onToggleHistory?: (workspaceId: string) => void;
};

function getThreadLabel(thread: ThreadSummary) {
  const trimmed = thread.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled thread";
}

export function WorktreeThreadTabs({
  workspace,
  threads,
  threadStatusById,
  activeThreadId,
  historyOpen = false,
  onSelectThread,
  onStartThread,
  onCloseThread,
  canCloseThread,
  onToggleHistory,
}: WorktreeThreadTabsProps) {
  const tabs = threads
    .map((thread, index) => ({ thread, index }))
    .sort((a, b) => {
      const aTime = a.thread.createdAt ?? a.thread.updatedAt ?? 0;
      const bTime = b.thread.createdAt ?? b.thread.updatedAt ?? 0;
      return aTime === bTime ? a.index - b.index : aTime - bTime;
    })
    .map(({ thread }) => ({
      id: thread.id,
      title: getThreadLabel(thread),
      isProcessing: threadStatusById[thread.id]?.isProcessing ?? false,
      canClose: canCloseThread?.(workspace.id, thread.id) ?? true,
    }));

  return (
    <div className="worktree-thread-tabs">
      {onToggleHistory ? (
        <button
          className={`worktree-thread-history-tab${historyOpen ? " active" : ""}`}
          type="button"
          onClick={() => onToggleHistory(workspace.id)}
          aria-label={`Show history for ${workspace.name}`}
          title="History"
          data-tauri-drag-region="false"
        >
          <ScrollText aria-hidden />
        </button>
      ) : null}
      <TerminalTabs
        tabs={tabs}
        activeTabId={historyOpen ? null : activeThreadId}
        ariaLabel="Worktree agent threads"
        addLabel={`Start a new thread in ${workspace.name}`}
        addTitle="New thread"
        onSelectTab={(threadId) => onSelectThread(workspace.id, threadId)}
        onAddTab={() => onStartThread(workspace.id)}
        onCloseTab={
          onCloseThread
            ? (threadId) => onCloseThread(workspace.id, threadId)
            : undefined
        }
      />
    </div>
  );
}
