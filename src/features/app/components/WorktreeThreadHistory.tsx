import type { AgentRuntime, ThreadSummary, WorkspaceInfo } from "../../../types";
import { harnessForModelId } from "@/features/models/utils/modelRuntime";
import { formatRelativeTime } from "../../../utils/time";
import Cpu from "lucide-react/dist/esm/icons/cpu";
import Feather from "lucide-react/dist/esm/icons/feather";

type WorktreeThreadHistoryProps = {
  workspace: WorkspaceInfo;
  threads: ThreadSummary[];
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

function getThreadLabel(thread: ThreadSummary) {
  const trimmed = thread.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled thread";
}

function getAgentRuntime(thread: ThreadSummary, workspace: WorkspaceInfo): AgentRuntime {
  return harnessForModelId(thread.modelId) ?? workspace.settings.agentRuntime ?? "codex";
}

function getAgentLabel(runtime: AgentRuntime) {
  return runtime === "claude" ? "Claude" : "Codex";
}

export function WorktreeThreadHistory({
  workspace,
  threads,
  onSelectThread,
}: WorktreeThreadHistoryProps) {
  return (
    <div className="worktree-thread-history">
      {threads.length > 0 ? (
        <div className="worktree-thread-history-list">
          {threads.map((thread) => {
            const runtime = getAgentRuntime(thread, workspace);
            const AgentIcon = runtime === "claude" ? Feather : Cpu;
            const agentLabel = getAgentLabel(runtime);
            return (
              <div key={thread.id} className="worktree-thread-history-row">
                <button
                  className="worktree-thread-history-agent"
                  type="button"
                  onClick={() => onSelectThread(workspace.id, thread.id)}
                  aria-label={`Restore ${agentLabel} session ${getThreadLabel(thread)}`}
                  title={`Restore ${agentLabel} session`}
                >
                  <AgentIcon aria-hidden />
                  <span>{agentLabel}</span>
                </button>
                <button
                  className="worktree-thread-history-title"
                  type="button"
                  onClick={() => onSelectThread(workspace.id, thread.id)}
                >
                  {getThreadLabel(thread)}
                </button>
                <span className="worktree-thread-history-time">
                  {formatRelativeTime(thread.updatedAt)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="worktree-thread-empty">No historical threads.</div>
      )}
    </div>
  );
}
