// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import { generateRunMetadata } from "../../../services/tauri";
import { useWorkspaceHome } from "./useWorkspaceHome";

vi.mock("../../../services/tauri", () => ({
  generateRunMetadata: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Project",
  path: "/tmp/project",
  connected: true,
  kind: "main",
  settings: { sidebarCollapsed: false },
};

const worktreeWorkspace: WorkspaceInfo = {
  id: "wt-1",
  name: "feat/test",
  path: "/tmp/project/worktrees/feat-test",
  connected: true,
  kind: "worktree",
  parentId: "ws-1",
  worktree: { branch: "feat/test" },
  settings: { sidebarCollapsed: false },
};

const models: ModelOption[] = [
  {
    id: "codex:gpt-5.1-max",
    model: "gpt-5.1-max",
    displayName: "GPT-5.1 Max",
    description: "Test model",
    supportedReasoningEfforts: [
      { reasoningEffort: "low", description: "Low effort" },
      { reasoningEffort: "medium", description: "Medium effort" },
      { reasoningEffort: "high", description: "High effort" },
    ],
    defaultReasoningEffort: "medium",
    isDefault: false,
  },
];

describe("useWorkspaceHome", () => {
  it("uses provider model name for worktree runs", async () => {
    const addWorktreeAgent = vi.fn().mockResolvedValue(worktreeWorkspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-1");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const seedThreadCodexParams = vi.fn();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Test run",
      worktreeName: "feat/test",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: workspace,
        models,
        selectedModelId: null,
        seedThreadCodexParams,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setRunMode("worktree");
      result.current.toggleModelSelection("codex:gpt-5.1-max");
      result.current.setDraft("Hello worktree");
    });

    await act(async () => {
      await result.current.startRun();
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("wt-1", {
      activate: false,
      modelId: "gpt-5.1-max",
      runtime: "codex",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      worktreeWorkspace,
      "thread-1",
      "Hello worktree",
      [],
      expect.objectContaining({ model: "gpt-5.1-max" }),
    );
    expect(seedThreadCodexParams).toHaveBeenCalledWith("wt-1", "thread-1", {
      harness: "codex",
      modelId: "gpt-5.1-max",
      effort: null,
      serviceTier: undefined,
    });
  });

  it("allows image-only local runs", async () => {
    const addWorktreeAgent = vi.fn();
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-1");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const seedThreadCodexParams = vi.fn();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Image run",
      worktreeName: "feat/image",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: worktreeWorkspace,
        models,
        selectedModelId: "codex:gpt-5.1-max",
        seedThreadCodexParams,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    await act(async () => {
      const started = await result.current.startRun(["img-1"]);
      expect(started).toBe(true);
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("wt-1", {
      activate: false,
      modelId: "gpt-5.1-max",
      runtime: "codex",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      worktreeWorkspace,
      "thread-1",
      "",
      ["img-1"],
      expect.objectContaining({ model: "gpt-5.1-max" }),
    );
    expect(seedThreadCodexParams).toHaveBeenCalledWith("wt-1", "thread-1", {
      harness: "codex",
      modelId: "gpt-5.1-max",
      effort: null,
      serviceTier: undefined,
    });
  });

  it("uses the normalized Claude model id for local runs", async () => {
    const claudeModels: ModelOption[] = [
      {
        id: "claude:sonnet-4.5",
        model: "sonnet-4.5",
        runtime: "claude",
        displayName: "Sonnet 4.5 · Claude",
        description: "Claude test model",
        supportedReasoningEfforts: [],
        defaultReasoningEffort: null,
        isDefault: true,
      },
    ];
    const addWorktreeAgent = vi.fn();
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-claude");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const seedThreadCodexParams = vi.fn();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Claude run",
      worktreeName: "feat/claude",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: worktreeWorkspace,
        models: claudeModels,
        selectedHarness: "claude",
        selectedModelId: "claude:sonnet-4.5",
        seedThreadCodexParams,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setDraft("Hello Claude");
    });

    await act(async () => {
      await result.current.startRun();
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("wt-1", {
      activate: false,
      modelId: "sonnet-4.5",
      runtime: "claude",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      worktreeWorkspace,
      "thread-claude",
      "Hello Claude",
      [],
      expect.objectContaining({ model: "sonnet-4.5" }),
    );
    expect(seedThreadCodexParams).toHaveBeenCalledWith("wt-1", "thread-claude", {
      harness: "claude",
      modelId: "sonnet-4.5",
      effort: null,
      serviceTier: undefined,
    });
  });

  it("blocks worktree runs without model selections", async () => {
    const addWorktreeAgent = vi.fn();
    const connectWorkspace = vi.fn();
    const startThreadForWorkspace = vi.fn();
    const sendUserMessageToThread = vi.fn();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Blocked",
      worktreeName: "feat/blocked",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: workspace,
        models,
        selectedModelId: null,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setRunMode("worktree");
      result.current.setDraft("Hello");
    });

    let started = true;
    await act(async () => {
      started = await result.current.startRun();
    });

    expect(started).toBe(false);
    expect(result.current.error).toBe(
      "Select at least one model to run in a worktree.",
    );
    expect(result.current.runs).toHaveLength(0);
  });

  it("starts custom harness worktree runs without model selections", async () => {
    const addWorktreeAgent = vi.fn().mockResolvedValue(worktreeWorkspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-custom");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const seedThreadCodexParams = vi.fn();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Custom run",
      worktreeName: "feat/custom",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: workspace,
        models: [],
        selectedHarness: "my-harness",
        selectedModelId: null,
        seedThreadCodexParams,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setRunMode("worktree");
      result.current.setDraft("Hello custom");
    });

    await act(async () => {
      await result.current.startRun();
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("wt-1", {
      activate: false,
      modelId: null,
      runtime: "my-harness",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      worktreeWorkspace,
      "thread-custom",
      "Hello custom",
      [],
      expect.objectContaining({ model: null }),
    );
    expect(seedThreadCodexParams).toHaveBeenCalledWith("wt-1", "thread-custom", {
      harness: "my-harness",
      modelId: null,
      effort: null,
      serviceTier: undefined,
    });
  });

  it("does not reuse a stale custom harness model after switching harnesses", async () => {
    const customModels: ModelOption[] = [
      {
        id: "agent-b:model-b",
        model: "model-b",
        runtime: "agent-b",
        providerModelId: "model-b",
        displayName: "Model B",
        description: "Agent B model",
        supportedReasoningEfforts: [],
        defaultReasoningEffort: null,
        isDefault: true,
      },
    ];
    const addWorktreeAgent = vi.fn();
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-b");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const seedThreadCodexParams = vi.fn();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Agent B run",
      worktreeName: "feat/agent-b",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: worktreeWorkspace,
        models: customModels,
        selectedHarness: "agent-b",
        selectedModelId: "agent-a:model-a",
        seedThreadCodexParams,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setDraft("Hello agent B");
    });

    await act(async () => {
      await result.current.startRun();
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("wt-1", {
      activate: false,
      modelId: null,
      runtime: "agent-b",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      worktreeWorkspace,
      "thread-b",
      "Hello agent B",
      [],
      expect.objectContaining({ model: null }),
    );
    expect(seedThreadCodexParams).toHaveBeenCalledWith("wt-1", "thread-b", {
      harness: "agent-b",
      modelId: null,
      effort: null,
      serviceTier: undefined,
    });
  });

  it("captures partial failures for multi-instance worktree runs", async () => {
    const addWorktreeAgent = vi
      .fn()
      .mockResolvedValueOnce(worktreeWorkspace)
      .mockResolvedValueOnce(null);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-1");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Partial",
      worktreeName: "feat/partial",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: workspace,
        models,
        selectedModelId: null,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setRunMode("worktree");
      result.current.toggleModelSelection("codex:gpt-5.1-max");
      result.current.setModelCount("codex:gpt-5.1-max", 2);
      result.current.setDraft("Hello");
    });

    await act(async () => {
      await result.current.startRun();
    });

    expect(result.current.runs[0].status).toBe("partial");
    expect(result.current.runs[0].instanceErrors.length).toBeGreaterThan(0);
  });

  it("updates title after metadata resolves for local runs", async () => {
    const addWorktreeAgent = vi.fn();
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-1");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    let resolveMetadata: (value: { title: string; worktreeName: string }) => void =
      () => {};
    vi.mocked(generateRunMetadata).mockReturnValue(
      new Promise((resolve) => {
        resolveMetadata = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: worktreeWorkspace,
        models,
        selectedModelId: "codex:gpt-5.1-max",
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setDraft("Local prompt");
    });

    await act(async () => {
      await result.current.startRun();
    });

    expect(result.current.runs[0].title).toBe("Local prompt");

    await act(async () => {
      resolveMetadata({ title: "Meta title", worktreeName: "feat/meta" });
      await Promise.resolve();
    });

    expect(result.current.runs[0].title).toBe("Meta title");
  });

  it("keeps attachments when worktree selection is missing", async () => {
    const addWorktreeAgent = vi.fn();
    const connectWorkspace = vi.fn();
    const startThreadForWorkspace = vi.fn();
    const sendUserMessageToThread = vi.fn();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Blocked",
      worktreeName: "feat/blocked",
    });

    const { result } = renderHook(() =>
      useWorkspaceHome({
        activeWorkspace: workspace,
        models,
        selectedModelId: null,
        addWorktreeAgent,
        connectWorkspace,
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    act(() => {
      result.current.setRunMode("worktree");
    });

    let started = true;
    await act(async () => {
      started = await result.current.startRun(["img-1"]);
    });

    expect(started).toBe(false);
    expect(result.current.runs).toHaveLength(0);
    expect(result.current.error).toBe(
      "Select at least one model to run in a worktree.",
    );
  });
});
