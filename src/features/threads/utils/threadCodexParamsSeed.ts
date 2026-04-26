import type { AgentHarness } from "@/features/models/utils/modelRuntime";
import {
  harnessForModelId,
  providerModelIdForModelId,
} from "@/features/models/utils/modelRuntime";
import type { AccessMode, ServiceTier } from "@/types";
import {
  buildEffectiveCodexArgsBadgeLabel,
  sanitizeRuntimeCodexArgs,
} from "./codexArgsProfiles";
import type { ThreadCodexParams } from "./threadStorage";
import { makeThreadCodexParamsKey } from "./threadStorage";

export const NO_THREAD_SCOPE_SUFFIX = "__no_thread__";

export type PendingNewThreadSeed = {
  workspaceId: string;
  harness?: AgentHarness | null;
  serviceTier: ServiceTier | null | undefined;
  collaborationModeId: string | null;
  accessMode: AccessMode;
  codexArgsOverride: string | null;
};

type ResolveThreadCodexStateInput = {
  workspaceId: string;
  threadId: string | null;
  defaultAccessMode: AccessMode;
  lastComposerModelId: string | null;
  lastComposerReasoningEffort: string | null;
  stored: ThreadCodexParams | null;
  noThreadStored: ThreadCodexParams | null;
  pendingSeed: PendingNewThreadSeed | null;
};

type ResolvedThreadCodexState = {
  scopeKey: string;
  preferredHarness: AgentHarness;
  accessMode: AccessMode;
  preferredModelId: string | null;
  preferredEffort: string | null;
  preferredServiceTier: ServiceTier | null | undefined;
  preferredCollabModeId: string | null;
  preferredCodexArgsOverride: string | null;
};

type ThreadCodexSeedPatch = {
  harness: AgentHarness;
  modelId: string | null;
  effort: string | null;
  serviceTier: ServiceTier | null | undefined;
  accessMode: AccessMode;
  collaborationModeId: string | null;
  codexArgsOverride: string | null | undefined;
};

function resolveStoredHarness(...entries: Array<ThreadCodexParams | null>): AgentHarness | null {
  for (const entry of entries) {
    if (entry?.harness === "codex" || entry?.harness === "claude") {
      return entry.harness;
    }
    const inferred = harnessForModelId(entry?.modelId);
    if (inferred) {
      return inferred;
    }
  }
  return null;
}

export function resolveWorkspaceRuntimeCodexArgsOverride(options: {
  workspaceId: string;
  threadId: string | null;
  getThreadCodexParams: (workspaceId: string, threadId: string) => ThreadCodexParams | null;
}): string | null {
  const { workspaceId, threadId, getThreadCodexParams } = options;
  const getNoThreadArgs = () =>
    getThreadCodexParams(workspaceId, NO_THREAD_SCOPE_SUFFIX)?.codexArgsOverride ?? null;

  if (!threadId) {
    return sanitizeRuntimeCodexArgs(getNoThreadArgs());
  }

  const threadScoped = getThreadCodexParams(workspaceId, threadId);
  if (threadScoped) {
    if (threadScoped.codexArgsOverride !== undefined) {
      return sanitizeRuntimeCodexArgs(threadScoped.codexArgsOverride);
    }
    return sanitizeRuntimeCodexArgs(getNoThreadArgs());
  }

  return sanitizeRuntimeCodexArgs(getNoThreadArgs());
}

export function resolveWorkspaceRuntimeCodexArgsBadgeLabel(options: {
  workspaceId: string;
  threadId: string;
  getThreadCodexParams: (workspaceId: string, threadId: string) => ThreadCodexParams | null;
}): string | null {
  const effectiveArgs = resolveWorkspaceRuntimeCodexArgsOverride({
    workspaceId: options.workspaceId,
    threadId: options.threadId,
    getThreadCodexParams: options.getThreadCodexParams,
  });
  return buildEffectiveCodexArgsBadgeLabel(effectiveArgs);
}

export function createPendingThreadSeed(options: {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  selectedHarness?: AgentHarness;
  selectedServiceTier: ServiceTier | null | undefined;
  selectedCollaborationModeId: string | null;
  accessMode: AccessMode;
  codexArgsOverride?: string | null;
}): PendingNewThreadSeed | null {
  const {
    activeThreadId,
    activeWorkspaceId,
    selectedHarness = "codex",
    selectedServiceTier,
    selectedCollaborationModeId,
    accessMode,
    codexArgsOverride = null,
  } = options;
  if (activeThreadId || !activeWorkspaceId) {
    return null;
  }
  return {
    workspaceId: activeWorkspaceId,
    harness: selectedHarness,
    serviceTier: selectedServiceTier,
    collaborationModeId: selectedCollaborationModeId,
    accessMode,
    codexArgsOverride,
  };
}

export function resolveThreadCodexState(
  input: ResolveThreadCodexStateInput,
): ResolvedThreadCodexState {
  const {
    workspaceId,
    threadId,
    defaultAccessMode,
    lastComposerModelId,
    lastComposerReasoningEffort,
    stored,
    noThreadStored,
    pendingSeed,
  } = input;

  if (!threadId) {
    const preferredHarness =
      resolveStoredHarness(stored) ??
      harnessForModelId(lastComposerModelId) ??
      "codex";
    return {
      scopeKey: `${workspaceId}:${NO_THREAD_SCOPE_SUFFIX}`,
      preferredHarness,
      accessMode: stored?.accessMode ?? defaultAccessMode,
      preferredModelId: providerModelIdForModelId(stored?.modelId ?? lastComposerModelId),
      preferredEffort: stored?.effort ?? lastComposerReasoningEffort ?? null,
      preferredServiceTier: stored?.serviceTier,
      preferredCollabModeId: stored?.collaborationModeId ?? null,
      preferredCodexArgsOverride: stored?.codexArgsOverride ?? null,
    };
  }

  const pendingForWorkspace =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed : null;
  const preferredHarness =
    resolveStoredHarness(stored, noThreadStored) ??
    pendingForWorkspace?.harness ??
    harnessForModelId(lastComposerModelId) ??
    "codex";

  return {
    scopeKey: makeThreadCodexParamsKey(workspaceId, threadId),
    preferredHarness,
    accessMode: stored?.accessMode ?? pendingForWorkspace?.accessMode ?? defaultAccessMode,
    preferredModelId:
      providerModelIdForModelId(
        stored?.modelId ?? noThreadStored?.modelId ?? lastComposerModelId,
      ),
    preferredEffort:
      stored?.effort ?? noThreadStored?.effort ?? lastComposerReasoningEffort ?? null,
    preferredServiceTier:
      stored?.serviceTier !== undefined
        ? stored.serviceTier
        : noThreadStored?.serviceTier,
    preferredCollabModeId:
      stored?.collaborationModeId ??
      (pendingForWorkspace
        ? pendingForWorkspace.collaborationModeId
        : null),
    preferredCodexArgsOverride:
      stored && stored.codexArgsOverride !== undefined
        ? stored.codexArgsOverride
        : pendingForWorkspace
          ? pendingForWorkspace.codexArgsOverride
          : noThreadStored?.codexArgsOverride ?? null,
  };
}

export function buildThreadCodexSeedPatch(options: {
  workspaceId: string;
  selectedHarness?: AgentHarness;
  selectedModelId: string | null;
  resolvedEffort: string | null;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
  codexArgsOverride?: string | null | undefined;
  pendingSeed: PendingNewThreadSeed | null;
}): ThreadCodexSeedPatch {
  const {
    workspaceId,
    selectedHarness = "codex",
    selectedModelId,
    resolvedEffort,
    accessMode,
    selectedCollaborationModeId,
    codexArgsOverride,
    pendingSeed,
  } = options;

  const pendingForWorkspace =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed : null;

  return {
    harness: pendingForWorkspace?.harness ?? selectedHarness,
    modelId: providerModelIdForModelId(selectedModelId),
    effort: resolvedEffort,
    serviceTier: pendingForWorkspace ? pendingForWorkspace.serviceTier : undefined,
    accessMode: pendingForWorkspace?.accessMode ?? accessMode,
    collaborationModeId: pendingForWorkspace
      ? pendingForWorkspace.collaborationModeId
      : selectedCollaborationModeId,
    codexArgsOverride: pendingForWorkspace
      ? pendingForWorkspace.codexArgsOverride
      : codexArgsOverride,
  };
}
