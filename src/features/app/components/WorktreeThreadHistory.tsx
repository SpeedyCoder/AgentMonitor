import type {
  AcpHarnessConfig,
  AgentRuntime,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import { harnessForModelId } from "@/features/models/utils/modelRuntime";
import { displayThreadLabel } from "../../threads/utils/emptyThreadSession";
import { formatRelativeTime } from "../../../utils/time";
import Bot from "lucide-react/dist/esm/icons/bot";
import Cpu from "lucide-react/dist/esm/icons/cpu";
import Feather from "lucide-react/dist/esm/icons/feather";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import type { LucideIcon } from "lucide-react";

type WorktreeThreadHistoryProps = {
  workspace: WorkspaceInfo;
  threads: ThreadSummary[];
  customHarnesses?: AcpHarnessConfig[];
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

function getThreadLabel(thread: ThreadSummary) {
  return displayThreadLabel(thread.name);
}

function getAgentRuntime(thread: ThreadSummary, workspace: WorkspaceInfo): AgentRuntime {
  return (
    thread.runtime ??
    harnessForModelId(thread.modelId) ??
    workspace.settings.agentRuntime ??
    "codex"
  );
}

function getCustomHarness(runtime: AgentRuntime, customHarnesses: AcpHarnessConfig[]) {
  return customHarnesses.find((harness) => harness.id === runtime) ?? null;
}

function getCustomHarnessIcon(icon?: string | null): LucideIcon {
  switch (icon) {
    case "terminal":
      return Terminal;
    case "sparkles":
      return Sparkles;
    case "cpu":
      return Cpu;
    case "wrench":
      return Wrench;
    case "bot":
    default:
      return Bot;
  }
}

function getAgentPresentation(
  runtime: AgentRuntime,
  customHarnesses: AcpHarnessConfig[],
): { label: string; Icon: LucideIcon } {
  if (runtime === "claude") {
    return { label: "Claude", Icon: Feather };
  }
  if (runtime === "codex") {
    return { label: "Codex", Icon: Cpu };
  }
  const customHarness = getCustomHarness(runtime, customHarnesses);
  return {
    label: customHarness?.name?.trim() || runtime,
    Icon: getCustomHarnessIcon(customHarness?.icon),
  };
}

export function WorktreeThreadHistory({
  workspace,
  threads,
  customHarnesses = [],
  onSelectThread,
}: WorktreeThreadHistoryProps) {
  return (
    <div className="worktree-thread-history">
      {threads.length > 0 ? (
        <div className="worktree-thread-history-list">
          {threads.map((thread) => {
            const runtime = getAgentRuntime(thread, workspace);
            const { label: agentLabel, Icon: AgentIcon } = getAgentPresentation(
              runtime,
              customHarnesses,
            );
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
