import { useCallback } from "react";
import type { AgentHarness } from "@/features/models/utils/modelRuntime";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import type { WorkspaceRunMode } from "../hooks/useWorkspaceHome";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Cpu from "lucide-react/dist/esm/icons/cpu";
import Feather from "lucide-react/dist/esm/icons/feather";
import Bot from "lucide-react/dist/esm/icons/bot";
import {
  PopoverMenuItem,
  SelectMenu,
  SplitActionMenu,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../../app/hooks/useMenuController";
import {
  buildModelSummary,
  INSTANCE_OPTIONS,
  resolveModelLabel,
} from "./workspaceHomeHelpers";
import { harnessForModelId } from "../../models/utils/modelRuntime";
import { isBuiltInAgentHarness } from "../../models/utils/modelRuntime";
import type { AcpHarnessConfig } from "@/types";

type WorkspaceHomeRunControlsProps = {
  workspaceKind: WorkspaceInfo["kind"];
  runMode: WorkspaceRunMode;
  onRunModeChange: (mode: WorkspaceRunMode) => void;
  selectedHarness?: AgentHarness;
  onSelectHarness?: (harness: AgentHarness) => void;
  customHarnesses?: AcpHarnessConfig[];
  models: ModelOption[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  modelSelections: Record<string, number>;
  onToggleModel: (modelId: string) => void;
  onModelCountChange: (modelId: string, count: number) => void;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
  isSubmitting: boolean;
};

export function WorkspaceHomeRunControls({
  workspaceKind,
  selectedHarness = "codex",
  onSelectHarness,
  customHarnesses = [],
  models,
  selectedModelId,
  onSelectModel,
  modelSelections,
  onToggleModel,
  onModelCountChange,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
  isSubmitting,
}: WorkspaceHomeRunControlsProps) {
  const modelsMenu = useMenuController();
  const {
    isOpen: modelsOpen,
    containerRef: modelsRef,
    toggle: toggleModelsOpen,
    close: closeModels,
  } = modelsMenu;

  const selectedModel = selectedModelId
    ? models.find((model) => model.id === selectedModelId) ?? null
    : null;
  const selectedModelLabel = resolveModelLabel(selectedModel);
  const modelSummary = buildModelSummary(models, modelSelections);
  const selectedCustomHarness = customHarnesses.find((harness) => harness.id === selectedHarness);
  const HarnessIcon = selectedHarness === "claude" ? Feather : selectedCustomHarness ? Bot : Cpu;
  const isCustomHarness = !isBuiltInAgentHarness(selectedHarness);
  const SelectedModelIcon = isCustomHarness
    ? Bot
    : selectedModel && harnessForModelId(selectedModel.id) === "claude"
      ? Feather
      : Cpu;
  const toggleModelsMenu = useCallback(() => {
    toggleModelsOpen();
  }, [toggleModelsOpen]);

  return (
    <div className="workspace-home-controls">
      <div className="composer-select-wrap workspace-home-control workspace-home-harness-control">
        <div className="open-app-button">
          <span className="composer-icon" aria-hidden>
            <HarnessIcon size={14} strokeWidth={1.8} />
          </span>
          <SelectMenu<string>
            value={selectedHarness}
            onChange={(value) => onSelectHarness?.(value as AgentHarness)}
            options={[
              { value: "codex", label: "Codex" },
              { value: "claude", label: "Claude" },
              ...customHarnesses.map((harness) => ({
                value: harness.id,
                label: harness.name || harness.id,
              })),
            ]}
            ariaLabel="Harness"
            disabled={isSubmitting}
            unstyledTrigger
            hideCaret
            anchorClassName="open-app-button"
            buttonClassName="composer-select composer-select--model composer-select--harness"
          />
        </div>
      </div>

      <SplitActionMenu
        containerRef={modelsRef}
        className="open-app-menu workspace-home-control"
        buttonGroupClassName="open-app-button"
        actionButton={
          <button
            type="button"
            className="ghost open-app-action"
            onClick={toggleModelsMenu}
            aria-label="Select models"
            data-tauri-drag-region="false"
          >
            <span className="open-app-label">
              <SelectedModelIcon className="workspace-home-mode-icon" aria-hidden />
              {(workspaceKind ?? "main") === "worktree" ? selectedModelLabel : modelSummary}
            </span>
          </button>
        }
        isOpen={modelsOpen}
        onToggle={toggleModelsMenu}
        toggleClassName="ghost open-app-toggle"
        toggleAriaLabel="Toggle models menu"
        toggleIcon={<ChevronDown size={14} aria-hidden />}
        popoverClassName="open-app-dropdown workspace-home-dropdown workspace-home-model-dropdown"
        popoverRole="menu"
      >
        {models.length === 0 && (
          <div className="workspace-home-empty">
            Connect this project to load available models.
          </div>
        )}
        {models.map((model) => {
          const isSelected =
            (workspaceKind ?? "main") === "worktree"
              ? model.id === selectedModelId
              : Boolean(modelSelections[model.id]);
          const count = modelSelections[model.id] ?? 1;
          return (
            <div
              key={model.id}
              className={`workspace-home-model-option${isSelected ? " is-active" : ""}`}
            >
              <PopoverMenuItem
                className="open-app-option workspace-home-model-toggle"
                onClick={() => {
                  if ((workspaceKind ?? "main") === "worktree") {
                    onSelectModel(model.id);
                    closeModels();
                    return;
                  }
                  onToggleModel(model.id);
                }}
                icon={
                  harnessForModelId(model.id) === "claude" ? (
                    <Feather className="workspace-home-mode-icon" aria-hidden />
                  ) : (
                    <Cpu className="workspace-home-mode-icon" aria-hidden />
                  )
                }
                active={isSelected}
              >
                {resolveModelLabel(model)}
              </PopoverMenuItem>
              {(workspaceKind ?? "main") !== "worktree" && (
                <>
                  <div className="workspace-home-model-meta" aria-hidden>
                    <span>{count}x</span>
                    <ChevronRight size={14} />
                  </div>
                  <div className="workspace-home-model-submenu ds-popover">
                    {INSTANCE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`workspace-home-model-submenu-item${
                          option === count ? " is-active" : ""
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onModelCountChange(model.id, option);
                        }}
                      >
                        {option}x
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </SplitActionMenu>
      {!isCustomHarness && collaborationModes.length > 0 && (
        <div className="composer-select-wrap workspace-home-control">
          <div className="open-app-button">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 7h10M7 12h6M7 17h8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <SelectMenu<string>
              value={selectedCollaborationModeId ?? ""}
              onChange={(value) => onSelectCollaborationMode(value || null)}
              options={collaborationModes.map((mode) => ({
                value: mode.id,
                label: mode.label || mode.id,
              }))}
              ariaLabel="Collaboration mode"
              disabled={isSubmitting}
              unstyledTrigger
              hideCaret
              anchorClassName="open-app-button"
              buttonClassName="composer-select composer-select--model"
            />
          </div>
        </div>
      )}
      <div className="composer-select-wrap workspace-home-control">
        <div className="open-app-button">
          <span className="composer-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M8.5 4.5a3.5 3.5 0 0 0-3.46 4.03A4 4 0 0 0 6 16.5h2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M15.5 4.5a3.5 3.5 0 0 1 3.46 4.03A4 4 0 0 1 18 16.5h-2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M9 12h6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M12 12v6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <SelectMenu<string>
            value={selectedEffort ?? ""}
            onChange={(value) => onSelectEffort(value)}
            options={
              reasoningOptions.length === 0
                ? [{ value: "", label: "Default" }]
                : reasoningOptions.map((effortOption) => ({
                    value: effortOption,
                    label: effortOption,
                  }))
            }
            ariaLabel="Thinking mode"
            disabled={isSubmitting || !reasoningSupported}
            unstyledTrigger
            hideCaret
            anchorClassName="open-app-button"
            buttonClassName="composer-select composer-select--effort"
          />
        </div>
      </div>
    </div>
  );
}
