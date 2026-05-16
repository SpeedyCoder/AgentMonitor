import { useCallback, useMemo } from "react";
import { setWorkspaceRuntimeOpenCodeArgs } from "@services/tauri";
import { buildOpenCodeArgsOptions } from "@threads/utils/opencodeArgsProfiles";
import {
  resolveWorkspaceRuntimeCodexArgsBadgeLabel,
  resolveWorkspaceRuntimeOpenCodeArgsOverride,
} from "@threads/utils/threadOpenCodeParamsSeed";
import type { ThreadOpenCodeParams } from "@threads/utils/threadStorage";

type ThreadOpenCodeParamsPatch = Partial<
  Pick<
    ThreadOpenCodeParams,
    | "modelId"
    | "effort"
    | "serviceTier"
    | "accessMode"
    | "collaborationModeId"
    | "opencodeArgsOverride"
  >
>;

type ThreadOpenCodeMetadata = {
  modelId: string | null;
  effort: string | null;
};

type UseMainAppThreadCodexStateArgs = {
  appCodexArgs: string | null | undefined;
  selectedOpenCodeArgsOverride: string | null;
  getThreadOpenCodeParams: (
    workspaceId: string,
    threadId: string,
  ) => ThreadOpenCodeParams | null;
  patchThreadOpenCodeParams: (
    workspaceId: string,
    threadId: string,
    patch: ThreadOpenCodeParamsPatch,
  ) => void;
};

export function useMainAppThreadOpenCodeState({
  appCodexArgs,
  selectedOpenCodeArgsOverride,
  getThreadOpenCodeParams,
  patchThreadOpenCodeParams,
}: UseMainAppThreadCodexStateArgs) {
  const handleThreadOpenCodeMetadataDetected = useCallback(
    (workspaceId: string, threadId: string, metadata: ThreadOpenCodeMetadata) => {
      if (!workspaceId || !threadId) {
        return;
      }

      const modelId =
        typeof metadata.modelId === "string" && metadata.modelId.trim().length > 0
          ? metadata.modelId.trim()
          : null;
      const effort =
        typeof metadata.effort === "string" && metadata.effort.trim().length > 0
          ? metadata.effort.trim().toLowerCase()
          : null;
      if (!modelId && !effort) {
        return;
      }

      const current = getThreadOpenCodeParams(workspaceId, threadId);
      const patch: ThreadOpenCodeParamsPatch = {};
      if (modelId && !current?.modelId) {
        patch.modelId = modelId;
      }
      if (effort && !current?.effort) {
        patch.effort = effort;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }
      patchThreadOpenCodeParams(workspaceId, threadId, patch);
    },
    [getThreadOpenCodeParams, patchThreadOpenCodeParams],
  );

  const opencodeArgsOptions = useMemo(
    () =>
      buildOpenCodeArgsOptions({
        appCodexArgs: appCodexArgs ?? null,
        additionalCodexArgs: [selectedOpenCodeArgsOverride],
      }),
    [appCodexArgs, selectedOpenCodeArgsOverride],
  );

  const ensureWorkspaceRuntimeOpenCodeArgs = useCallback(
    async (workspaceId: string, threadId: string | null) => {
      const sanitizedCodexArgsOverride = resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId,
        threadId,
        getThreadOpenCodeParams,
      });
      await setWorkspaceRuntimeOpenCodeArgs(workspaceId, sanitizedCodexArgsOverride);
    },
    [getThreadOpenCodeParams],
  );

  const getThreadArgsBadge = useCallback(
    (workspaceId: string, threadId: string) =>
      resolveWorkspaceRuntimeCodexArgsBadgeLabel({
        workspaceId,
        threadId,
        getThreadOpenCodeParams,
      }),
    [getThreadOpenCodeParams],
  );

  return {
    handleThreadOpenCodeMetadataDetected,
    opencodeArgsOptions,
    ensureWorkspaceRuntimeOpenCodeArgs,
    getThreadArgsBadge,
  };
}
