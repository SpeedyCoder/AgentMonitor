import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AcpHarnessConfig, DebugEntry, ModelOption, WorkspaceInfo } from "../../../types";
import { getAcpSessionConfig } from "../../../services/tauri";
import { harnessForModelId } from "../utils/modelRuntime";
import type { AgentHarness } from "../utils/modelRuntime";
import { normalizeEffortValue } from "../utils/modelListResponse";

type UseModelsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
  preferredModelId?: string | null;
  preferredEffort?: string | null;
  selectionKey?: string | null;
  allowedRuntime?: AgentHarness | null;
  allowedHarness?: AgentHarness | null;
  customHarnesses?: AcpHarnessConfig[];
};

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

const FALLBACK_CODEX_MODELS: ModelOption[] = [{
  id: "codex:__default",
  model: "default",
  runtime: "codex",
  providerModelId: null,
  displayName: "Default",
  description: "Fallback Codex model while ACP config is unavailable.",
  supportedReasoningEfforts: [],
  defaultReasoningEffort: null,
  isDefault: true,
}];

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

type HarnessDescriptor = {
  id: AgentHarness;
  name: string;
  cacheSignature: string;
  fallbackModels: ModelOption[];
  canDiscover: boolean;
};

type CachedHarnessModels = {
  models: ModelOption[];
  fromDiscovery: boolean;
};

const acpHarnessModelCache = new Map<string, CachedHarnessModels>();
const acpHarnessModelRequests = new Map<string, Promise<CachedHarnessModels>>();

export function clearAcpHarnessModelCacheForTests() {
  acpHarnessModelCache.clear();
  acpHarnessModelRequests.clear();
}

function harnessModelId(harnessId: string, modelId: string | null) {
  return `${harnessId}:${modelId && modelId.trim() ? modelId.trim() : "__default"}`;
}

function customHarnessSignature(harness: AcpHarnessConfig) {
  const env = (harness.env ?? [])
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("\n");
  return `${harness.id}\n${harness.name}\n${harness.startCommand}\n${env}`;
}

function harnessDescriptors(customHarnesses: AcpHarnessConfig[]): HarnessDescriptor[] {
  return [
    {
      id: "codex",
      name: "Codex",
      cacheSignature: "builtin:codex",
      fallbackModels: FALLBACK_CODEX_MODELS,
      canDiscover: true,
    },
    {
      id: "claude",
      name: "Claude",
      cacheSignature: "builtin:claude",
      fallbackModels: FALLBACK_CLAUDE_MODELS,
      canDiscover: true,
    },
    ...customHarnesses.map((harness) => ({
      id: harness.id,
      name: harness.name || harness.id,
      cacheSignature: `custom:${customHarnessSignature(harness)}`,
      fallbackModels: [],
      canDiscover: Boolean(harness.startCommand.trim()),
    })),
  ];
}

function cacheKey(descriptor: HarnessDescriptor) {
  return descriptor.cacheSignature;
}

type AcpConfigOption = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  type?: unknown;
  currentValue?: unknown;
  options?: unknown;
};

type AcpSelectOption = {
  value: string;
  name: string;
  description: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function acpConfigOptionsFromResponse(response: unknown): AcpConfigOption[] {
  const root = isRecord(response) ? response : {};
  const raw = root.configOptions ?? root.config_options ?? [];
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
}

function optionCategory(option: AcpConfigOption) {
  const category = typeof option.category === "string" ? option.category : null;
  if (category) {
    return category;
  }
  return typeof option.id === "string" ? option.id : null;
}

function flattenSelectOptions(raw: unknown): AcpSelectOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    if (Array.isArray(entry.options)) {
      return flattenSelectOptions(entry.options);
    }
    const value = typeof entry.value === "string" ? entry.value.trim() : "";
    if (!value) {
      return [];
    }
    return [{
      value,
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : value,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description.trim()
          : "",
    }];
  });
}

function buildHarnessModels(harness: HarnessDescriptor, response: unknown): ModelOption[] {
  const configOptions = acpConfigOptionsFromResponse(response);
  const modelOption = configOptions.find((option) => optionCategory(option) === "model");
  const thoughtOption = configOptions.find(
    (option) => optionCategory(option) === "thought_level",
  );
  const thinkingLevels = flattenSelectOptions(thoughtOption?.options);
  const supportedReasoningEfforts = thinkingLevels.map((option) => ({
    reasoningEffort: option.value,
    description: option.description,
  }));
  const defaultReasoningEffort =
    typeof thoughtOption?.currentValue === "string" && thoughtOption.currentValue.trim()
      ? thoughtOption.currentValue.trim()
      : supportedReasoningEfforts[0]?.reasoningEffort ?? null;
  const models = flattenSelectOptions(modelOption?.options);
  if (models.length === 0) {
    if (harness.fallbackModels.length > 0) {
      return harness.fallbackModels;
    }
    return [{
      id: harnessModelId(harness.id, null),
      model: "default",
      runtime: harness.id,
      providerModelId: null,
      displayName: "Default",
      description: `${harness.name} default model`,
      supportedReasoningEfforts,
      defaultReasoningEffort,
      isDefault: true,
    }];
  }
  return models.map((model, index) => {
    const providerModelId = model.value;
    const displayName = model.name;
    return {
      id: harnessModelId(harness.id, providerModelId),
      model: providerModelId,
      runtime: harness.id,
      providerModelId,
      displayName,
      description: model.description || `${displayName} · ${harness.name}`,
      supportedReasoningEfforts,
      defaultReasoningEffort,
      isDefault:
        typeof modelOption?.currentValue === "string"
          ? modelOption.currentValue === providerModelId
          : index === 0,
    };
  });
}

async function loadAcpHarnessModels(
  workspaceId: string,
  descriptor: HarnessDescriptor,
): Promise<CachedHarnessModels> {
  const key = cacheKey(descriptor);
  const cached = acpHarnessModelCache.get(key);
  if (cached) {
    return cached;
  }
  const pending = acpHarnessModelRequests.get(key);
  if (pending) {
    return pending;
  }
  const request = (async (): Promise<CachedHarnessModels> => {
    if (!descriptor.canDiscover) {
      return { models: descriptor.fallbackModels, fromDiscovery: false };
    }
    try {
      const response = await getAcpSessionConfig(workspaceId, descriptor.id);
      const models = buildHarnessModels(descriptor, response);
      if (models.length > 0) {
        return { models, fromDiscovery: true };
      }
      console.warn(
        `[useModels] ACP discover for ${descriptor.id} returned no models`,
        response,
      );
      return { models: descriptor.fallbackModels, fromDiscovery: false };
    } catch (error) {
      console.error(
        `[useModels] ACP discover for ${descriptor.id} failed`,
        error,
      );
      return { models: descriptor.fallbackModels, fromDiscovery: false };
    }
  })();
  acpHarnessModelRequests.set(key, request);
  try {
    const result = await request;
    if (result.fromDiscovery) {
      acpHarnessModelCache.set(key, result);
    }
    return result;
  } finally {
    acpHarnessModelRequests.delete(key);
  }
}

export function useModels({
  activeWorkspace,
  onDebug,
  preferredModelId = null,
  preferredEffort = null,
  selectionKey = null,
  allowedRuntime = null,
  allowedHarness = null,
  customHarnesses = [],
}: UseModelsOptions) {
  const effectiveAllowedHarness = allowedHarness ?? allowedRuntime;
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [configModel, setConfigModel] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffortState] = useState<string | null>(null);
  const lastFetchedKey = useRef<string | null>(null);
  const activeRequestId = useRef(0);
  const hasUserSelectedModel = useRef(false);
  const hasUserSelectedEffort = useRef(false);
  const lastWorkspaceId = useRef<string | null>(null);
  const lastSelectionKey = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  const descriptors = useMemo(
    () => harnessDescriptors(customHarnesses),
    [customHarnesses],
  );
  const activeHarness =
    effectiveAllowedHarness ?? activeWorkspace?.settings?.agentRuntime ?? "codex";
  const activeDescriptor = useMemo(
    () => descriptors.find((descriptor) => descriptor.id === activeHarness) ?? null,
    [activeHarness, descriptors],
  );
  const modelFetchKey = workspaceId
    ? activeDescriptor
      ? cacheKey(activeDescriptor)
      : `${workspaceId}:missing:${activeHarness}`
    : null;

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
      if (activeHarness === "claude" && filtered.length === 0) {
        return FALLBACK_CLAUDE_MODELS;
      }
      if (activeHarness === "codex" && filtered.length === 0) {
        return FALLBACK_CODEX_MODELS;
      }
      return filtered;
    },
    [activeHarness, allModels, effectiveAllowedHarness],
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
    if (!workspaceId || !isConnected || !modelFetchKey) {
      return;
    }
    activeRequestId.current += 1;
    const requestId = activeRequestId.current;
    if (!activeDescriptor) {
      setAllModels([]);
      setConfigModel(null);
      lastFetchedKey.current = modelFetchKey;
      return;
    }
    onDebug?.({
      id: `${Date.now()}-client-acp-session-config`,
      timestamp: Date.now(),
      source: "client",
      label: "acp/session_config",
      payload: { workspaceId, runtime: activeDescriptor.id, cached: acpHarnessModelCache.has(modelFetchKey) },
    });
    const result = await loadAcpHarnessModels(workspaceId, activeDescriptor);
    if (requestId !== activeRequestId.current) {
      return;
    }
    setConfigModel(null);
    setAllModels(result.models);
    lastFetchedKey.current = modelFetchKey;
    onDebug?.({
      id: `${Date.now()}-server-acp-session-config`,
      timestamp: Date.now(),
      source: "server",
      label: "acp/session_config response",
      payload: { runtime: activeDescriptor.id, models: result.models },
    });
  }, [
    activeDescriptor,
    isConnected,
    modelFetchKey,
    onDebug,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    descriptors.forEach((descriptor) => {
      if (!descriptor.canDiscover && descriptor.fallbackModels.length === 0) {
        return;
      }
      void loadAcpHarnessModels(workspaceId, descriptor);
    });
  }, [descriptors, isConnected, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedKey.current === modelFetchKey) {
      return;
    }
    refreshModels();
  }, [isConnected, modelFetchKey, refreshModels, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !modelFetchKey) {
      return;
    }
    const cached = acpHarnessModelCache.get(modelFetchKey);
    if (!cached) {
      return;
    }
    setConfigModel(null);
    setAllModels(cached.models);
    lastFetchedKey.current = modelFetchKey;
  }, [isConnected, modelFetchKey, workspaceId]);

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
