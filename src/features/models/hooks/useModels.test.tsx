// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getConfigModel, getModelList } from "../../../services/tauri";
import { useModels } from "./useModels";

vi.mock("../../../services/tauri", () => ({
  getModelList: vi.fn(),
  getConfigModel: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Trantor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useModels", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses model/list when the config model is missing from a non-empty response", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    expect(getConfigModel).toHaveBeenCalledWith("workspace-1");
    expect(result.current.models.map((model) => model.model)).toEqual(["gpt-5.1"]);
    expect(result.current.selectedModel?.model).toBe("gpt-5.1");
    expect(result.current.reasoningSupported).toBe(false);
  });

  it("adds the config model when model/list has no usable models", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    expect(result.current.models[0]).toMatchObject({
      id: "codex:custom-model",
      model: "custom-model",
      runtime: "codex",
    });
    expect(result.current.selectedModel?.model).toBe("custom-model");
  });

  it("prefers the provider entry when the config model matches by slug", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "provider-id",
            model: "custom-model",
            displayName: "Provider Custom",
            supportedReasoningEfforts: [
              { reasoningEffort: "medium", description: "Medium" },
              { reasoningEffort: "high", description: "High" },
            ],
            defaultReasoningEffort: "medium",
            isDefault: false,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("provider-id"));

    expect(result.current.models).toHaveLength(1);
    expect(result.current.selectedModel?.id).toBe("provider-id");
    expect(result.current.reasoningSupported).toBe(true);
  });

  it("does not select an upgrade-gated config model", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "codex:gpt-5.5",
            model: "gpt-5.5",
            displayName: "GPT-5.5",
            upgrade: "latest-codex",
          },
          {
            id: "codex:gpt-5.4",
            model: "gpt-5.4",
            displayName: "GPT-5.4",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("gpt-5.5");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.selectedModel?.model).toBe("gpt-5.4"));

    expect(result.current.models.map((model) => model.model)).toEqual(["gpt-5.4"]);
  });

  it("keeps the selected reasoning effort when switching models", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Low" },
              { reasoningEffort: "medium", description: "Medium" },
            ],
            defaultReasoningEffort: "medium",
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBe(1));

    act(() => {
      result.current.setSelectedEffort("high");
      result.current.setSelectedModelId("remote-1");
    });

    await waitFor(() => {
      expect(result.current.selectedModelId).toBe("remote-1");
      expect(result.current.selectedEffort).toBe("high");
    });
  });

  it("keeps Claude options visible when preferred model is Codex", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "codex:gpt-5.1",
            model: "gpt-5.1",
            runtime: "codex",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
          {
            id: "claude:sonnet-4",
            model: "sonnet-4",
            runtime: "claude",
            displayName: "Claude Sonnet 4",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: false,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        preferredModelId: "codex:gpt-5.1",
      }),
    );

    await waitFor(() => expect(result.current.models.length).toBe(2));

    expect(result.current.models.map((model) => model.id)).toEqual([
      "codex:gpt-5.1",
      "claude:sonnet-4",
    ]);
  });

  it("filters to the active thread provider when allowedRuntime is set", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "codex:gpt-5.1",
            model: "gpt-5.1",
            runtime: "codex",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
          {
            id: "claude:sonnet-4.5",
            model: "sonnet-4.5",
            runtime: "claude",
            displayName: "Sonnet 4.5 · Claude",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: false,
          },
          {
            id: "claude:sonnet-4.6",
            model: "sonnet-4.6",
            runtime: "claude",
            displayName: "Sonnet 4.6 · Claude",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: false,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        preferredModelId: "claude:sonnet-4.5",
        allowedRuntime: "claude",
      }),
    );

    await waitFor(() => expect(result.current.models.length).toBe(2));

    expect(result.current.models.map((model) => model.id)).toEqual([
      "claude:sonnet-4.5",
      "claude:sonnet-4.6",
    ]);
  });

  it("re-filters cached models immediately when the allowed harness changes", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "codex:gpt-5.1",
            model: "gpt-5.1",
            runtime: "codex",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
          {
            id: "claude:sonnet-4.5",
            model: "sonnet-4.5",
            runtime: "claude",
            displayName: "Sonnet 4.5 · Claude",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: false,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce(null);

    const { result, rerender } = renderHook(
      ({ allowedHarness }: { allowedHarness: "codex" | "claude" | null }) =>
        useModels({
          activeWorkspace: workspace,
          allowedHarness,
        }),
      {
        initialProps: { allowedHarness: "codex" as "codex" | "claude" | null },
      },
    );

    await waitFor(() => expect(result.current.models.map((model) => model.id)).toEqual([
      "codex:gpt-5.1",
    ]));

    rerender({ allowedHarness: "claude" });

    await waitFor(() => expect(result.current.models.map((model) => model.id)).toEqual([
      "claude:sonnet-4.5",
    ]));

    expect(getModelList).toHaveBeenCalledTimes(1);
  });

  it("falls back to Claude catalog when the backend returns no Claude models", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "codex:gpt-5.1",
            model: "gpt-5.1",
            runtime: "codex",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        allowedHarness: "claude",
      }),
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
    expect(result.current.selectedEffort).toBe("none");
  });

  it("shows versioned names while keeping Claude alias provider ids", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "claude:default",
            model: "default",
            runtime: "claude",
            providerModelId: "default",
            displayName: "Default (recommended) · Claude",
            description: "Opus 4.7 with 1M context · Most capable for complex work",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
          {
            id: "claude:sonnet",
            model: "sonnet",
            runtime: "claude",
            providerModelId: "sonnet",
            displayName: "Sonnet · Claude",
            description: "Sonnet 4.6 · Best for everyday tasks",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: false,
          },
          {
            id: "claude:haiku",
            model: "haiku",
            runtime: "claude",
            providerModelId: "haiku",
            displayName: "Haiku · Claude",
            description: "Haiku 4.5 · Fastest for quick answers",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: false,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        allowedHarness: "claude",
      }),
    );

    await waitFor(() =>
      expect(result.current.models.map((model) => model.id)).toEqual([
        "claude:default",
        "claude:sonnet",
        "claude:haiku",
      ]),
    );
    expect(result.current.models.map((model) => model.displayName)).toEqual([
      "Opus 4.7 · Claude",
      "Sonnet 4.6 · Claude",
      "Haiku 4.5 · Claude",
    ]);
    expect(result.current.models.map((model) => model.providerModelId)).toEqual([
      "default",
      "sonnet",
      "haiku",
    ]);
    expect(result.current.selectedModelId).toBe("claude:default");
    expect(result.current.reasoningOptions).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "none",
    ]);
  });
});
