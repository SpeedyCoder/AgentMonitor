// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getAcpSessionConfig } from "../../../services/tauri";
import { clearAcpHarnessModelCacheForTests, useModels } from "./useModels";

vi.mock("../../../services/tauri", () => ({
  getAcpSessionConfig: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Trantor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const secondWorkspace: WorkspaceInfo = {
  ...workspace,
  id: "workspace-2",
  name: "Trantor Two",
};

function configResponse(
  models: Array<{ value: string; name?: string; description?: string }>,
  currentValue = models[0]?.value ?? "",
  thinking: Array<{ value: string; name?: string; description?: string }> = [],
  currentThinking = thinking[0]?.value ?? "",
) {
  return {
    configOptions: [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue,
        options: models.map((model) => ({
          value: model.value,
          name: model.name ?? model.value,
          description: model.description ?? "",
        })),
      },
      {
        id: "thinking",
        name: "Thinking",
        category: "thought_level",
        type: "select",
        currentValue: currentThinking,
        options: thinking.map((level) => ({
          value: level.value,
          name: level.name ?? level.value,
          description: level.description ?? "",
        })),
      },
    ],
  };
}

function mockAcpConfigByRuntime(configs: Record<string, unknown>) {
  vi.mocked(getAcpSessionConfig).mockImplementation(async (_workspaceId, runtime) => {
    if (runtime in configs) {
      return configs[runtime];
    }
    throw new Error(`No ACP config for ${runtime}`);
  });
}

describe("useModels", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearAcpHarnessModelCacheForTests();
  });

  it("loads Codex models and reasoning efforts from ACP config options", async () => {
    mockAcpConfigByRuntime({
      codex: configResponse(
        [
          { value: "gpt-5.1", name: "GPT-5.1" },
          { value: "gpt-5.2", name: "GPT-5.2" },
        ],
        "gpt-5.2",
        [
          { value: "low", name: "Low" },
          { value: "high", name: "High" },
        ],
        "high",
      ),
    });

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace, allowedHarness: "codex" }),
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("codex:gpt-5.2"));

    expect(result.current.models.map((model) => model.id)).toEqual([
      "codex:gpt-5.1",
      "codex:gpt-5.2",
    ]);
    expect(result.current.reasoningSupported).toBe(true);
    expect(result.current.reasoningOptions).toEqual(["low", "high"]);
    expect(result.current.selectedEffort).toBe("high");
  });

  it("loads Claude models from ACP instead of the fallback catalog", async () => {
    mockAcpConfigByRuntime({
      claude: configResponse([
        { value: "sonnet-4.5", name: "Sonnet 4.5" },
        { value: "opus-4.7", name: "Opus 4.7" },
      ], "sonnet-4.5"),
    });

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace, allowedHarness: "claude" }),
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("claude:sonnet-4.5"));

    expect(result.current.models.map((model) => model.id)).toEqual([
      "claude:sonnet-4.5",
      "claude:opus-4.7",
    ]);
    expect(result.current.models.map((model) => model.displayName)).toEqual([
      "Sonnet 4.5",
      "Opus 4.7",
    ]);
  });

  it("falls back to Claude catalog when ACP config is unavailable", async () => {
    mockAcpConfigByRuntime({});

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace, allowedHarness: "claude" }),
    );

    await waitFor(() =>
      expect(result.current.models.map((model) => model.id)).toEqual([
        "claude:default",
        "claude:sonnet",
        "claude:haiku",
      ]),
    );
    expect(result.current.reasoningSupported).toBe(true);
    expect(result.current.reasoningOptions).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "none",
    ]);
  });

  it("keeps a manually selected reasoning effort when switching models", async () => {
    mockAcpConfigByRuntime({
      codex: configResponse(
        [{ value: "gpt-5.1", name: "GPT-5.1" }],
        "gpt-5.1",
        [
          { value: "low", name: "Low" },
          { value: "medium", name: "Medium" },
        ],
        "medium",
      ),
    });

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace, allowedHarness: "codex" }),
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("codex:gpt-5.1"));

    act(() => {
      result.current.setSelectedEffort("high");
      result.current.setSelectedModelId("codex:gpt-5.1");
    });

    await waitFor(() => {
      expect(result.current.selectedModelId).toBe("codex:gpt-5.1");
      expect(result.current.selectedEffort).toBe("high");
    });
  });

  it("filters to the active harness and reuses cached ACP config when switching", async () => {
    mockAcpConfigByRuntime({
      codex: configResponse([{ value: "gpt-5.1", name: "GPT-5.1" }], "gpt-5.1"),
      claude: configResponse([{ value: "sonnet-4.5", name: "Sonnet 4.5" }], "sonnet-4.5"),
    });

    const { result, rerender } = renderHook(
      ({ allowedHarness }: { allowedHarness: "codex" | "claude" }) =>
        useModels({
          activeWorkspace: workspace,
          allowedHarness,
        }),
      {
        initialProps: { allowedHarness: "codex" as "codex" | "claude" },
      },
    );

    await waitFor(() => expect(result.current.models.map((model) => model.id)).toEqual([
      "codex:gpt-5.1",
    ]));

    rerender({ allowedHarness: "claude" });

    await waitFor(() => expect(result.current.models.map((model) => model.id)).toEqual([
      "claude:sonnet-4.5",
    ]));

    rerender({ allowedHarness: "codex" });

    await waitFor(() => expect(result.current.models.map((model) => model.id)).toEqual([
      "codex:gpt-5.1",
    ]));

    expect(getAcpSessionConfig).toHaveBeenCalledWith("workspace-1", "codex");
    expect(getAcpSessionConfig).toHaveBeenCalledWith("workspace-1", "claude");
    expect(vi.mocked(getAcpSessionConfig).mock.calls.filter((call) => call[1] === "codex"))
      .toHaveLength(1);
  });

  it("reuses cached ACP config across workspaces for the same harness", async () => {
    mockAcpConfigByRuntime({
      codex: configResponse([{ value: "gpt-5.1", name: "GPT-5.1" }], "gpt-5.1"),
    });

    const { result, rerender } = renderHook(
      ({ activeWorkspace }: { activeWorkspace: WorkspaceInfo }) =>
        useModels({
          activeWorkspace,
          allowedHarness: "codex",
        }),
      {
        initialProps: { activeWorkspace: workspace },
      },
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("codex:gpt-5.1"));

    rerender({ activeWorkspace: secondWorkspace });

    await waitFor(() => expect(result.current.models.map((model) => model.id)).toEqual([
      "codex:gpt-5.1",
    ]));

    expect(vi.mocked(getAcpSessionConfig).mock.calls.filter((call) => call[1] === "codex"))
      .toHaveLength(1);
  });

  it("prefetches newly configured custom harnesses and uses their ACP config", async () => {
    mockAcpConfigByRuntime({
      codex: configResponse([{ value: "gpt-5.1", name: "GPT-5.1" }], "gpt-5.1"),
      "mistral-vibe": configResponse(
        [{ value: "mistral-large-latest", name: "Large" }],
        "mistral-large-latest",
        [
          { value: "low", name: "Low" },
          { value: "medium", name: "Medium" },
          { value: "high", name: "High" },
        ],
        "medium",
      ),
    });

    const customHarnesses = [
      {
        id: "mistral-vibe",
        name: "Mistral Vibe",
        icon: "bot",
        startCommand: "vibe-acp",
        env: [],
      },
    ];

    const { result, rerender } = renderHook(
      ({ allowedHarness }: { allowedHarness: string }) =>
        useModels({
          activeWorkspace: workspace,
          allowedHarness,
          customHarnesses,
        }),
      {
        initialProps: { allowedHarness: "codex" },
      },
    );

    await waitFor(() =>
      expect(getAcpSessionConfig).toHaveBeenCalledWith("workspace-1", "mistral-vibe"),
    );

    rerender({ allowedHarness: "mistral-vibe" });

    await waitFor(() =>
      expect(result.current.selectedModelId).toBe("mistral-vibe:mistral-large-latest"),
    );
    expect(result.current.models).toEqual([
      expect.objectContaining({
        id: "mistral-vibe:mistral-large-latest",
        providerModelId: "mistral-large-latest",
        runtime: "mistral-vibe",
        displayName: "Large",
      }),
    ]);
    expect(result.current.reasoningOptions).toEqual(["low", "medium", "high"]);
  });

  it("keeps model selections isolated between multiple custom harnesses", async () => {
    mockAcpConfigByRuntime({
      "agent-a": configResponse([{ value: "model-a", name: "Model A" }], "model-a"),
      "agent-b": configResponse([{ value: "model-b", name: "Model B" }], "model-b"),
    });

    const customHarnesses = [
      {
        id: "agent-a",
        name: "Agent A",
        icon: "bot",
        startCommand: "agent-a acp",
        env: [],
      },
      {
        id: "agent-b",
        name: "Agent B",
        icon: "bot",
        startCommand: "agent-b acp",
        env: [],
      },
    ];

    const { result, rerender } = renderHook(
      ({ allowedHarness }: { allowedHarness: string }) =>
        useModels({
          activeWorkspace: workspace,
          allowedHarness,
          customHarnesses,
        }),
      {
        initialProps: { allowedHarness: "agent-a" },
      },
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("agent-a:model-a"));
    expect(result.current.models.map((model) => model.id)).toEqual(["agent-a:model-a"]);

    rerender({ allowedHarness: "agent-b" });

    await waitFor(() => expect(result.current.selectedModelId).toBe("agent-b:model-b"));
    expect(result.current.models.map((model) => model.id)).toEqual(["agent-b:model-b"]);
    expect(getAcpSessionConfig).toHaveBeenCalledWith("workspace-1", "agent-a");
    expect(getAcpSessionConfig).toHaveBeenCalledWith("workspace-1", "agent-b");
  });
});
