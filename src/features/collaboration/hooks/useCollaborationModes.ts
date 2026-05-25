import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollaborationModeOption,
  DebugEntry,
  WorkspaceInfo,
} from "../../../types";
import type { AgentHarness } from "../../models/utils/modelRuntime";
import { getCollaborationModes } from "../../../services/tauri";

type UseCollaborationModesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabled: boolean;
  runtime?: AgentHarness;
  preferredModeId?: string | null;
  selectionKey?: string | null;
  onDebug?: (entry: DebugEntry) => void;
};

const CLAUDE_FALLBACK_MODES: CollaborationModeOption[] = [
  {
    id: "default",
    label: "Default",
    mode: "default",
    model: "",
    reasoningEffort: null,
    developerInstructions: null,
    value: {
      mode: "default",
      settings: {
        model: null,
        reasoning_effort: null,
        developer_instructions: null,
      },
    },
  },
  {
    id: "plan",
    label: "Plan",
    mode: "plan",
    model: "",
    reasoningEffort: null,
    developerInstructions: null,
    value: {
      mode: "plan",
      settings: {
        model: null,
        reasoning_effort: null,
        developer_instructions: null,
      },
    },
  },
];

function fallbackModesForRuntime(runtime: AgentHarness): CollaborationModeOption[] {
  return runtime === "claude" ? CLAUDE_FALLBACK_MODES : [];
}

function pickWorkspaceDefaultModeId(modes: CollaborationModeOption[]): string | null {
  return (
    modes.find(
      (mode) =>
        mode.id.trim().toLowerCase() === "default" ||
        mode.mode.trim().toLowerCase() === "default",
    )?.id ??
    modes.find(
      (mode) =>
        mode.id.trim().toLowerCase() === "code" ||
        mode.mode.trim().toLowerCase() === "code",
    )?.id ??
    modes[0]?.id ??
    null
  );
}

export function useCollaborationModes({
  activeWorkspace,
  enabled,
  runtime = "codex",
  preferredModeId = null,
  selectionKey = null,
  onDebug,
}: UseCollaborationModesOptions) {
  const [modes, setModes] = useState<CollaborationModeOption[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const lastFetchedKey = useRef<string | null>(null);
  const previousFetchKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const selectedModeIdRef = useRef<string | null>(null);
  const lastSelectionKey = useRef<string | null>(null);
  const lastEnabled = useRef(enabled);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  const fetchKey = workspaceId ? `${workspaceId}:${runtime}` : null;

  const extractModeList = useCallback((response: any): any[] => {
    const candidates = [
      response?.result?.data,
      response?.result?.modes,
      response?.result,
      response?.data,
      response?.modes,
      response,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
      if (candidate && typeof candidate === "object") {
        const nested = (candidate as any).data ?? (candidate as any).modes;
        if (Array.isArray(nested)) {
          return nested;
        }
        if (nested && typeof nested === "object") {
          const deep = (nested as any).data ?? (nested as any).modes;
          if (Array.isArray(deep)) {
            return deep;
          }
        }
      }
    }
    return [];
  }, []);

  const selectedMode = useMemo(
    () => modes.find((mode) => mode.id === selectedModeId) ?? null,
    [modes, selectedModeId],
  );

  const refreshModes = useCallback(async () => {
    if (!workspaceId || !isConnected || !enabled) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-collaboration-mode-list`,
      timestamp: Date.now(),
      source: "client",
      label: "collaborationMode/list",
      payload: { workspaceId, runtime },
    });
    try {
      const response = await getCollaborationModes(workspaceId, runtime);
      onDebug?.({
        id: `${Date.now()}-server-collaboration-mode-list`,
        timestamp: Date.now(),
        source: "server",
        label: "collaborationMode/list response",
        payload: response,
      });
      const rawData = extractModeList(response);
      const data: CollaborationModeOption[] = rawData
        .map((item: any) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const modeId = String(item.mode ?? item.name ?? "").trim();
          if (!modeId) {
            return null;
          }

          const settings =
            item.settings && typeof item.settings === "object"
              ? item.settings
              : {
                  model: item.model ?? null,
                  reasoning_effort:
                    item.reasoning_effort ?? item.reasoningEffort ?? null,
                  developer_instructions:
                    item.developer_instructions ??
                    item.developerInstructions ??
                    null,
                };

          const model = String(settings.model ?? "");
          const reasoningEffort = settings.reasoning_effort ?? null;
          const developerInstructions = settings.developer_instructions ?? null;

          const labelSource =
            typeof item.label === "string" && item.label.trim()
              ? item.label
              : typeof item.name === "string" && item.name.trim()
                ? item.name
                : modeId;

          const option: CollaborationModeOption = {
            id: modeId,
            label: labelSource,
            mode: modeId,
            model,
            reasoningEffort: reasoningEffort ? String(reasoningEffort) : null,
            developerInstructions: developerInstructions
              ? String(developerInstructions)
              : null,
            value: item as Record<string, unknown>,
          };
          return option;
        })
        .filter((mode): mode is CollaborationModeOption => mode !== null);
      const resolvedData = data.length > 0 ? data : fallbackModesForRuntime(runtime);
      setModes(resolvedData);
      lastFetchedKey.current = fetchKey;
      const workspaceDefaultModeId = pickWorkspaceDefaultModeId(resolvedData);
      setSelectedModeId((currentSelection) => {
        const selection = currentSelection ?? selectedModeIdRef.current;
        if (!selection) {
          if (preferredModeId && resolvedData.some((mode) => mode.id === preferredModeId)) {
            return preferredModeId;
          }
          return workspaceDefaultModeId;
        }
        if (!resolvedData.some((mode) => mode.id === selection)) {
          return workspaceDefaultModeId;
        }
        return selection;
      });
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-collaboration-mode-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "collaborationMode/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
      const fallbackModes = fallbackModesForRuntime(runtime);
      if (fallbackModes.length > 0) {
        setModes(fallbackModes);
        lastFetchedKey.current = fetchKey;
        setSelectedModeId((currentSelection) => {
          const selection = currentSelection ?? selectedModeIdRef.current;
          if (selection && fallbackModes.some((mode) => mode.id === selection)) {
            return selection;
          }
          if (preferredModeId && fallbackModes.some((mode) => mode.id === preferredModeId)) {
            return preferredModeId;
          }
          return pickWorkspaceDefaultModeId(fallbackModes);
        });
      }
    } finally {
      inFlight.current = false;
    }
  }, [
    enabled,
    extractModeList,
    fetchKey,
    isConnected,
    onDebug,
    preferredModeId,
    runtime,
    workspaceId,
  ]);

  useEffect(() => {
    selectedModeIdRef.current = selectedModeId;
  }, [selectedModeId]);

  useEffect(() => {
    const wasEnabled = lastEnabled.current;
    lastEnabled.current = enabled;
    if (!enabled) {
      return;
    }
    const enabledJustReenabled = !wasEnabled;
    if (!enabledJustReenabled && selectionKey === lastSelectionKey.current) {
      return;
    }
    lastSelectionKey.current = selectionKey;
    // When switching threads, prefer the per-thread override. If there is no stored override,
    // reset to the workspace default instead of carrying over the previous thread's selection.
    // Also validate that a stored override still exists; otherwise fall back to the workspace default
    // so collaboration payload generation remains enabled.
    setSelectedModeId(() => {
      if (!modes.length) {
        // If modes aren't loaded yet, keep the preferred ID (if any) until refresh validates it.
        return preferredModeId;
      }
      if (preferredModeId && modes.some((mode) => mode.id === preferredModeId)) {
        return preferredModeId;
      }
      return pickWorkspaceDefaultModeId(modes);
    });
  }, [enabled, modes, preferredModeId, selectionKey]);

  useEffect(() => {
    if (previousFetchKey.current !== fetchKey) {
      previousFetchKey.current = fetchKey;
      setModes([]);
      lastFetchedKey.current = null;
    }
  }, [fetchKey]);

  useEffect(() => {
    if (!enabled) {
      setModes([]);
      setSelectedModeId(null);
      lastFetchedKey.current = null;
      return;
    }
    if (!workspaceId || !isConnected) {
      setModes([]);
      lastFetchedKey.current = null;
      return;
    }
    if (lastFetchedKey.current === fetchKey) {
      return;
    }
    refreshModes();
  }, [enabled, fetchKey, isConnected, modes.length, refreshModes, workspaceId]);

  return {
    collaborationModes: modes,
    selectedCollaborationMode: selectedMode,
    selectedCollaborationModeId: selectedModeId,
    setSelectedCollaborationModeId: setSelectedModeId,
    refreshCollaborationModes: refreshModes,
  };
}
