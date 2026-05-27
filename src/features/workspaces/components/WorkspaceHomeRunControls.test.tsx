// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import { WorkspaceHomeRunControls } from "./WorkspaceHomeRunControls";

const workspaceKind: WorkspaceInfo["kind"] = "worktree";

const models: ModelOption[] = [
  {
    id: "codex:gpt-5.1",
    model: "gpt-5.1",
    runtime: "codex",
    providerModelId: "gpt-5.1",
    displayName: "GPT-5.1",
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: true,
  },
  {
    id: "claude:sonnet-4.5",
    model: "sonnet-4.5",
    runtime: "claude",
    providerModelId: "claude-sonnet-4-5",
    displayName: "Sonnet 4.5 · Claude",
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  },
  {
    id: "claude:sonnet-4.6",
    model: "sonnet-4.6",
    runtime: "claude",
    providerModelId: "claude-sonnet-4-6",
    displayName: "Sonnet 4.6 · Claude",
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  },
];

describe("WorkspaceHomeRunControls", () => {
  it("shows the harness selector and trims Claude suffixes in the model menu", () => {
    render(
      <WorkspaceHomeRunControls
        workspaceKind={workspaceKind}
        runMode="local"
        onRunModeChange={vi.fn()}
        selectedHarness="claude"
        onSelectHarness={vi.fn()}
        models={models}
        selectedModelId="claude:sonnet-4.5"
        onSelectModel={vi.fn()}
        modelSelections={{}}
        onToggleModel={vi.fn()}
        onModelCountChange={vi.fn()}
        collaborationModes={[]}
        selectedCollaborationModeId={null}
        onSelectCollaborationMode={vi.fn()}
        reasoningOptions={[]}
        selectedEffort={null}
        onSelectEffort={vi.fn()}
        reasoningSupported={false}
        isSubmitting={false}
      />,
    );

    const selectedButton = screen.getByRole("button", { name: "Select models" });
    expect(selectedButton.textContent ?? "").toContain("Sonnet 4.5");
    expect(selectedButton.textContent ?? "").not.toContain("Claude");

    fireEvent.click(screen.getByRole("button", { name: "Toggle models menu" }));

    expect(screen.getByRole("button", { name: "Harness" }).textContent).toContain(
      "Claude",
    );

    const menu = screen.getByRole("menu").closest(".ds-popover");
    expect(menu).not.toBeNull();
    if (!menu) {
      throw new Error("Expected model menu popover");
    }

    const menuElement = menu as HTMLElement;
    const options = within(menuElement).getAllByRole("button");
    const optionLabels = options.map((option) => option.textContent?.trim() ?? "");
    expect(optionLabels).toEqual(["GPT-5.1", "Sonnet 4.5", "Sonnet 4.6"]);
    expect(within(menuElement).queryByText("Sonnet 4.5 · Claude")).toBeNull();
    expect(within(menuElement).queryByText("Sonnet 4.6 · Claude")).toBeNull();
  });

  it("uses the Claude icon for a selected Claude model", () => {
    const { container } = render(
      <WorkspaceHomeRunControls
        workspaceKind={workspaceKind}
        runMode="local"
        onRunModeChange={vi.fn()}
        selectedHarness="claude"
        onSelectHarness={vi.fn()}
        models={models}
        selectedModelId="claude:sonnet-4.5"
        onSelectModel={vi.fn()}
        modelSelections={{}}
        onToggleModel={vi.fn()}
        onModelCountChange={vi.fn()}
        collaborationModes={[]}
        selectedCollaborationModeId={null}
        onSelectCollaborationMode={vi.fn()}
        reasoningOptions={[]}
        selectedEffort={null}
        onSelectEffort={vi.fn()}
        reasoningSupported={false}
        isSubmitting={false}
      />,
    );

    expect(container.querySelector(".open-app-action .lucide-feather")).not.toBeNull();
  });
});
