import type { AgentRuntime, BuiltInAgentRuntime } from "@/types";

export type AgentHarness = AgentRuntime;
export type BuiltInAgentHarness = BuiltInAgentRuntime;

export const MODEL_RUNTIME_PREFIX = {
  codex: "codex:",
  claude: "claude:",
} as const;

export function isBuiltInAgentHarness(value: string | null | undefined): value is BuiltInAgentHarness {
  return value === "codex" || value === "claude";
}

export function harnessForModelId(modelId: string | null | undefined): AgentHarness | null {
  if (!modelId) {
    return null;
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.claude)) {
    return "claude";
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.codex)) {
    return "codex";
  }
  const separatorIndex = modelId.indexOf(":");
  if (separatorIndex > 0) {
    return modelId.slice(0, separatorIndex);
  }
  return modelId.toLowerCase().startsWith("claude-") ? "claude" : "codex";
}

export const runtimeForModelId = harnessForModelId;

export function providerModelIdForModelId(modelId: string | null | undefined): string | null {
  if (!modelId) {
    return null;
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.codex)) {
    return modelId.slice(MODEL_RUNTIME_PREFIX.codex.length);
  }
  if (modelId.startsWith(MODEL_RUNTIME_PREFIX.claude)) {
    return modelId.slice(MODEL_RUNTIME_PREFIX.claude.length);
  }
  const separatorIndex = modelId.indexOf(":");
  if (separatorIndex > 0) {
    const providerModelId = modelId.slice(separatorIndex + 1);
    return providerModelId === "__default" ? null : providerModelId;
  }
  return modelId;
}
