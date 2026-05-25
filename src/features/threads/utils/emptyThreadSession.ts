import type { ConversationItem, ThreadSummary } from "@/types";

export function isGenericSessionName(name: string | null | undefined) {
  const normalized = name?.trim() ?? "";
  return normalized === "" || normalized === "Session" || normalized === "New Agent";
}

export function isGenericEmptySession(
  thread: ThreadSummary | null | undefined,
  items: ConversationItem[] | null | undefined,
) {
  return (items?.length ?? 0) === 0 && (!thread || isGenericSessionName(thread.name));
}

export function canDeleteGenericEmptySession(
  workspaceThreads: ThreadSummary[],
  threadId: string,
  items: ConversationItem[] | null | undefined,
) {
  const thread = workspaceThreads.find((entry) => entry.id === threadId);
  return isGenericEmptySession(thread, items) && workspaceThreads.length > 1;
}
