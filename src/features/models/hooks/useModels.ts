import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, ModelOption, WorkspaceInfo } from "../../../types";
import { getConfigModel, getModelList } from "../../../services/tauri";
import {
  MODEL_RUNTIME_PREFIX,
  harnessForModelId,
} from "../utils/modelRuntime";
import {
  normalizeEffortValue,
  parseModelListResponse,
  unavailableModelIdsFromResponse,
} from "../utils/modelListResponse";

type UseModelsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
  preferredModelId?: string | null;
  preferredEffort?: string | null;
  selectionKey?: string | null;
  allowedRuntime?: "codex" | "claude" | null;
  allowedHarness?: "codex" | "claude" | null;
};

const CONFIG_MODEL_DESCRIPTION = "Configured in CODEX_HOME/config.toml";
const CLAUDE_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
const CLAUDE_DEFAULT_REASONING_EFFORT = "none";
const CLAUDE_REASONING_OPTIONS = CLAUDE_REASONING_EFFORTS.map((reasoningEffort) => ({
  reasoningEffort,
  description: "",
}));
const FALLBACK_CLAUDE_MODELS: ModelOption[] = [
  {
    id: "claude:default",
    model: "default",
    runtime: "claude",
    providerModelId: "default",
    displayName: "Opus 4.7 · Claude",
    description: "Fallback Claude model while the Claude model list is unavailable.",
    supportedReasoningEfforts: CLAUDE_REASONING_OPTIONS,
    defaultReasoningEffort: CLAUDE_DEFAULT_REASONING_EFFORT,
    isDefault: true,
  },
  {
    id: "claude:sonnet",
    model: "sonnet",
    runtime: "claude",
    providerModelId: "sonnet",
    displayName: "Sonnet 4.6 · Claude",
    description: "Fallback Claude model while the Claude model list is unavailable.",
    supportedReasoningEfforts: CLAUDE_REASONING_OPTIONS,
    defaultReasoningEffort: CLAUDE_DEFAULT_REASONING_EFFORT,
    isDefault: false,
  },
  {
    id: "claude:haiku",
    model: "haiku",
    runtime: "claude",
    providerModelId: "haiku",
    displayName: "Haiku 4.5 · Claude",
    description: "Fallback Claude model while the Claude model list is unavailable.",
    supportedReasoningEfforts: CLAUDE_REASONING_OPTIONS,
    defaultReasoningEffort: CLAUDE_DEFAULT_REASONING_EFFORT,
    isDefault: false,
  },
];

const GENERIC_CLAUDE_MODEL_IDS = new Set(["default", "sonnet", "haiku"]);

function isGenericClaudeModel(model: ModelOption) {
  if (harnessForModelId(model.id) !== "claude" && model.runtime !== "claude") {
    return false;
  }
  const providerModelId = (model.providerModelId ?? model.model ?? model.id)
    .trim()
    .toLowerCase();
  return GENERIC_CLAUDE_MODEL_IDS.has(providerModelId);
}

function canonicalClaudeAliasDisplayName(model: ModelOption) {
  if (!isGenericClaudeModel(model)) {
    return null;
  }
  const description = model.description.trim();
  const versionMatch = description.match(/^(Opus|Sonnet|Haiku)\s+(\d+(?:\.\d+)?)/i);
  if (versionMatch) {
    const family = versionMatch[1]
      ? versionMatch[1][0]?.toUpperCase() + versionMatch[1].slice(1).toLowerCase()
      : "";
    return `${family} ${versionMatch[2]} · Claude`;
  }
  const displayName = model.displayName.trim();
  if (
    displayName.length > 0 &&
    !["default", "sonnet", "haiku"].includes(displayName.toLowerCase()) &&
    !displayName.toLowerCase().includes("recommended")
  ) {
    return displayName;
  }
  return null;
}

function normalizeClaudeCatalog(models: ModelOption[]) {
  const normalized = models.map((model) => {
    const displayName = canonicalClaudeAliasDisplayName(model);
    const isClaude = harnessForModelId(model.id) === "claude" || model.runtime === "claude";
    const withDisplayName = displayName ? { ...model, displayName } : model;
    if (!isClaude) {
      return withDisplayName;
    }
    return {
      ...withDisplayName,
      supportedReasoningEfforts:
        withDisplayName.supportedReasoningEfforts.length > 0
          ? withDisplayName.supportedReasoningEfforts
          : CLAUDE_REASONING_OPTIONS,
      defaultReasoningEffort:
        withDisplayName.defaultReasoningEffort ?? CLAUDE_DEFAULT_REASONING_EFFORT,
    };
  });
  const genericClaudeModels = normalized.filter(isGenericClaudeModel);
  if (genericClaudeModels.length === 0) {
    return normalized;
  }
  const hasCanonicalGenericModels = genericClaudeModels.every(
    (model) => canonicalClaudeAliasDisplayName(model) !== null,
  );
  if (hasCanonicalGenericModels) {
    return normalized;
  }
  const nonClaudeModels = normalized.filter(
    (model) => harnessForModelId(model.id) !== "claude" && model.runtime !== "claude",
  );
  return [...nonClaudeModels, ...FALLBACK_CLAUDE_MODELS];
}

const findModelByIdOrModel = (
  models: ModelOption[],
  idOrModel: string | null,
): ModelOption | null => {
  if (!idOrModel) {
    return null;
  }
  return (
    models.find((model) => model.id === idOrModel) ??
    models.find((model) => model.model === idOrModel) ??
    null
  );
};

const pickDefaultModel = (models: ModelOption[], configModel: string | null) =>
  findModelByIdOrModel(models, configModel) ??
  models.find((model) => model.isDefault) ??
  models[0] ??
  null;

export function useModels({
  activeWorkspace,
  onDebug,
  preferredModelId = null,
  preferredEffort = null,
  selectionKey = null,
  allowedRuntime = null,
  allowedHarness = null,
}: UseModelsOptions) {
  const effectiveAllowedHarness = allowedHarness ?? allowedRuntime;
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [configModel, setConfigModel] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffortState] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const hasUserSelectedModel = useRef(false);
  const hasUserSelectedEffort = useRef(false);
  const lastWorkspaceId = useRef<string | null>(null);
  const lastSelectionKey = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  useEffect(() => {
    if (selectionKey === lastSelectionKey.current) {
      return;
    }
    lastSelectionKey.current = selectionKey;
    hasUserSelectedModel.current = false;
    hasUserSelectedEffort.current = false;
  }, [selectionKey]);

  useEffect(() => {
    if (workspaceId === lastWorkspaceId.current) {
      return;
    }
    hasUserSelectedModel.current = false;
    hasUserSelectedEffort.current = false;
    lastWorkspaceId.current = workspaceId;
    setConfigModel(null);
  }, [workspaceId]);

  useEffect(() => {
    if (selectedEffort === null) {
      return;
    }
    if (selectedEffort.trim().length > 0) {
      return;
    }
    hasUserSelectedEffort.current = false;
    setSelectedEffortState(null);
  }, [selectedEffort]);

  const setSelectedModelId = useCallback((next: string | null) => {
    hasUserSelectedModel.current = true;
    setSelectedModelIdState(next);
  }, []);

  const setSelectedEffort = useCallback((next: string | null) => {
    hasUserSelectedEffort.current = true;
    setSelectedEffortState(next);
  }, []);

  const models = useMemo(
    () => {
      const filtered =
        effectiveAllowedHarness === null
          ? allModels
          : allModels.filter((model) => harnessForModelId(model.id) === effectiveAllowedHarness);
      if (effectiveAllowedHarness === "claude" && filtered.length === 0) {
        return FALLBACK_CLAUDE_MODELS;
      }
      return filtered;
    },
    [allModels, effectiveAllowedHarness],
  );

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const reasoningSupported = useMemo(() => {
    if (!selectedModel) {
      return false;
    }
    return (
      selectedModel.supportedReasoningEfforts.length > 0 ||
      selectedModel.defaultReasoningEffort !== null
    );
  }, [selectedModel]);

  const reasoningOptions = useMemo(() => {
    const supported = selectedModel?.supportedReasoningEfforts
      .map((effort) => normalizeEffortValue(effort.reasoningEffort))
      .filter((effort): effort is string => Boolean(effort));
    const defaultEffort = normalizeEffortValue(selectedModel?.defaultReasoningEffort);
    if (supported && supported.length > 0) {
      return defaultEffort && !supported.includes(defaultEffort)
        ? [...supported, defaultEffort]
        : supported;
    }
    return defaultEffort ? [defaultEffort] : [];
  }, [selectedModel]);

  const resolveEffort = useCallback(
    (model: ModelOption, preferCurrent: boolean) => {
      const supportedEfforts = model.supportedReasoningEfforts.map(
        (effort) => effort.reasoningEffort,
      );
      const currentEffort = normalizeEffortValue(selectedEffort);
      if (preferCurrent && currentEffort) {
        return currentEffort;
      }
      if (supportedEfforts.length === 0) {
        return normalizeEffortValue(preferredEffort);
      }
      const preferred = normalizeEffortValue(preferredEffort);
      if (preferred && supportedEfforts.includes(preferred)) {
        return preferred;
      }
      return normalizeEffortValue(model.defaultReasoningEffort);
    },
    [preferredEffort, selectedEffort],
  );

  const refreshModels = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-model-list`,
      timestamp: Date.now(),
      source: "client",
      label: "model/list",
      payload: { workspaceId },
    });
    try {
      const [modelListResult, configModelResult] = await Promise.allSettled([
        getModelList(workspaceId),
        getConfigModel(workspaceId),
      ]);
      const configModelFromConfig =
        configModelResult.status === "fulfilled"
          ? configModelResult.value
          : null;
      if (configModelResult.status === "rejected") {
        onDebug?.({
          id: `${Date.now()}-client-config-model-error`,
          timestamp: Date.now(),
          source: "error",
          label: "config/model error",
          payload:
            configModelResult.reason instanceof Error
              ? configModelResult.reason.message
              : String(configModelResult.reason),
        });
      }
      const response =
        modelListResult.status === "fulfilled" ? modelListResult.value : null;
      const unavailableModelIds = unavailableModelIdsFromResponse(response);
      if (modelListResult.status === "rejected") {
        onDebug?.({
          id: `${Date.now()}-client-model-list-error`,
          timestamp: Date.now(),
          source: "error",
          label: "model/list error",
          payload:
            modelListResult.reason instanceof Error
              ? modelListResult.reason.message
              : String(modelListResult.reason),
        });
      }
      onDebug?.({
        id: `${Date.now()}-server-model-list`,
        timestamp: Date.now(),
        source: "server",
        label: "model/list response",
        payload: response,
      });
      setConfigModel(configModelFromConfig);
      const dataFromServer: ModelOption[] = normalizeClaudeCatalog(
        parseModelListResponse(response),
      );
      const data = (() => {
        if (!configModelFromConfig) {
          return dataFromServer;
        }
        if (unavailableModelIds.has(configModelFromConfig)) {
          return dataFromServer;
        }
        const hasConfigModel = dataFromServer.some(
          (model) =>
            model.model === configModelFromConfig ||
            model.providerModelId === configModelFromConfig,
        );
        if (hasConfigModel) {
          return dataFromServer;
        }
        if (dataFromServer.length > 0) {
          return dataFromServer;
        }
        const configOption: ModelOption = {
          id: `${MODEL_RUNTIME_PREFIX.codex}${configModelFromConfig}`,
          model: configModelFromConfig,
          runtime: "codex",
          providerModelId: configModelFromConfig,
          displayName: `${configModelFromConfig} (config)`,
          description: CONFIG_MODEL_DESCRIPTION,
          supportedReasoningEfforts: [],
          defaultReasoningEffort: null,
          isDefault: false,
        };
        return [configOption, ...dataFromServer];
      })();
      setAllModels(data);
      lastFetchedWorkspaceId.current = workspaceId;
    } finally {
      inFlight.current = false;
    }
  }, [
    isConnected,
    onDebug,
    effectiveAllowedHarness,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && allModels.length > 0) {
      return;
    }
    refreshModels();
  }, [allModels.length, isConnected, refreshModels, workspaceId]);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    const currentEffort = normalizeEffortValue(selectedEffort);
    if (currentEffort) {
      return;
    }
    const nextEffort = normalizeEffortValue(selectedModel.defaultReasoningEffort);
    if (nextEffort === null) {
      return;
    }
    hasUserSelectedEffort.current = false;
    setSelectedEffortState(nextEffort);
  }, [selectedEffort, selectedModel]);

  useEffect(() => {
    if (models.length === 0) {
      if (selectedModelId !== null) {
        hasUserSelectedModel.current = false;
        setSelectedModelIdState(null);
      }
      return;
    }
    const preferredSelection = findModelByIdOrModel(models, preferredModelId);
    const defaultModel = pickDefaultModel(models, configModel);
    const existingSelection = findModelByIdOrModel(models, selectedModelId);
    if (selectedModelId && !existingSelection) {
      hasUserSelectedModel.current = false;
    }
    const shouldKeepUserSelection =
      hasUserSelectedModel.current && existingSelection !== null;
    if (shouldKeepUserSelection) {
      return;
    }
    const nextSelection =
      preferredSelection ?? defaultModel ?? existingSelection ?? null;
    if (!nextSelection) {
      return;
    }
    if (nextSelection.id !== selectedModelId) {
      setSelectedModelIdState(nextSelection.id);
    }
    const nextEffort = resolveEffort(nextSelection, hasUserSelectedEffort.current);
    if (nextEffort !== selectedEffort) {
      setSelectedEffortState(nextEffort);
    }
  }, [
    configModel,
    models,
    preferredModelId,
    selectedEffort,
    selectedModelId,
    resolveEffort,
  ]);

  return {
    models,
    selectedModel,
    reasoningSupported,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
    refreshModels,
  };
}
