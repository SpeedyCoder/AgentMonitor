import type { CSSProperties } from "react";
import { Bot, BrainCog, Feather, SlidersHorizontal, Zap } from "lucide-react";
import type { AgentHarness } from "@/features/models/utils/modelRuntime";
import type { AcpHarnessConfig, ServiceTier, ThreadTokenUsage } from "../../../types";
import type { CodexArgsOption } from "../../threads/utils/codexArgsProfiles";
import { formatModelDisplayLabel } from "@/features/models/utils/modelPresentation";
import {
  harnessForModelId,
  isBuiltInAgentHarness,
} from "@/features/models/utils/modelRuntime";
import { SelectMenu } from "@/features/design-system/components/popover/PopoverPrimitives";

type ComposerMetaBarProps = {
  disabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  selectedHarness?: AgentHarness;
  onSelectHarness?: (harness: AgentHarness) => void;
  customHarnesses?: AcpHarnessConfig[];
  harnessLocked?: boolean;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  selectedServiceTier: ServiceTier | null;
  reasoningSupported: boolean;
  codexArgsOptions?: CodexArgsOption[];
  selectedCodexArgsOverride?: string | null;
  onSelectCodexArgsOverride?: (value: string | null) => void;
  contextUsage?: ThreadTokenUsage | null;
};

export function ComposerMetaBar({
  disabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  selectedHarness = "codex",
  onSelectHarness,
  customHarnesses = [],
  harnessLocked = false,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  selectedServiceTier,
  reasoningSupported,
  codexArgsOptions = [],
  selectedCodexArgsOverride = null,
  onSelectCodexArgsOverride,
  contextUsage = null,
}: ComposerMetaBarProps) {
  const getModelLabel = (model: { id: string; displayName: string; model: string }) => {
    return formatModelDisplayLabel(model);
  };
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? null;
  const selectedModelLabel = selectedModel ? getModelLabel(selectedModel) : "No models";
  const selectedModelHarness = harnessForModelId(selectedModel?.id ?? selectedModelId);
  const selectedCustomHarness = customHarnesses.find((harness) => harness.id === selectedHarness);
  const isCustomHarness = !isBuiltInAgentHarness(selectedHarness);
  const modelSelectStyle = {
    "--composer-model-select-width": `${Math.max(selectedModelLabel.length + 2, 8)}ch`,
  } as CSSProperties;
  const contextWindow = contextUsage?.modelContextWindow ?? null;
  const lastTokens = contextUsage?.last.totalTokens ?? 0;
  const totalTokens = contextUsage?.total.totalTokens ?? 0;
  const usedTokens = lastTokens > 0 ? lastTokens : totalTokens;
  const contextFreePercent =
    contextWindow && contextWindow > 0 && usedTokens > 0
      ? Math.max(
          0,
          100 -
            Math.min(Math.max((usedTokens / contextWindow) * 100, 0), 100),
        )
      : null;
  const planMode =
    collaborationModes.find((mode) => mode.id === "plan") ?? null;
  const defaultMode =
    collaborationModes.find((mode) => mode.id === "default") ?? null;
  const canUsePlanToggle =
    Boolean(planMode) &&
    collaborationModes.every(
      (mode) => mode.id === "default" || mode.id === "plan",
    );
  const planSelected = selectedCollaborationModeId === (planMode?.id ?? "");

  return (
    <div className="composer-bar">
      <div className="composer-meta">
        {!isCustomHarness && collaborationModes.length > 0 && (
          canUsePlanToggle ? (
            <div className="composer-select-wrap composer-plan-toggle-wrap">
              <label className="composer-plan-toggle" aria-label="Plan mode">
                <input
                  className="composer-plan-toggle-input"
                  type="checkbox"
                  checked={planSelected}
                  disabled={disabled}
                  onChange={(event) =>
                    onSelectCollaborationMode(
                      event.target.checked
                        ? planMode?.id ?? "plan"
                        : (defaultMode?.id ?? null),
                    )
                  }
                />
                <span className="composer-plan-toggle-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="composer-plan-toggle-label">
                  {planMode?.label || "Plan"}
                </span>
              </label>
            </div>
          ) : (
            <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
                disabled={disabled}
                unstyledTrigger
                hideCaret
                placement="top"
                anchorClassName="composer-select-wrap"
                buttonClassName="composer-select composer-select--model composer-select--collab"
              />
            </div>
          )
        )}
        <div className="composer-select-wrap">
          <span className="composer-icon composer-icon--model" aria-hidden>
            {selectedHarness === "claude" ? (
              <Feather size={16} strokeWidth={1.8} />
            ) : selectedCustomHarness ? (
              <Bot size={16} strokeWidth={1.8} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M8 7.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 15v-5A2.5 2.5 0 0 1 8 7.5Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="12.5" r="1" fill="currentColor" />
                <circle cx="14.5" cy="12.5" r="1" fill="currentColor" />
                <path
                  d="M9.5 15.5h5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M5.5 11H4M20 11h-1.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            )}
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
            disabled={disabled || harnessLocked}
            unstyledTrigger
            hideCaret
            placement="top"
            anchorClassName="composer-select-wrap"
            buttonClassName="composer-select composer-select--model composer-select--harness"
          />
        </div>
        <div className="composer-select-wrap composer-select-wrap--model">
          <span className="composer-icon composer-icon--model" aria-hidden>
            {isCustomHarness ? (
              <Bot size={16} strokeWidth={1.8} />
            ) : selectedModelHarness === "claude" ? (
              <Feather size={16} strokeWidth={1.8} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M8 7.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 15v-5A2.5 2.5 0 0 1 8 7.5Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="12.5" r="1" fill="currentColor" />
                <circle cx="14.5" cy="12.5" r="1" fill="currentColor" />
                <path
                  d="M9.5 15.5h5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M5.5 11H4M20 11h-1.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
          <SelectMenu<string>
            value={selectedModelId ?? ""}
            onChange={(value) => onSelectModel(value)}
            options={
              models.length === 0
                ? [{ value: "", label: "No models", disabled: true }]
                : models.map((model) => ({
                    value: model.id,
                    label: getModelLabel(model),
                  }))
            }
            ariaLabel="Model"
            disabled={disabled}
            unstyledTrigger
            hideCaret
            placement="top"
            anchorClassName="composer-select-wrap"
            align="start"
            buttonClassName="composer-select composer-select--model"
            buttonStyle={modelSelectStyle}
          />
          {selectedServiceTier === "fast" && (
            <span
              className="composer-fast-indicator"
              role="status"
              aria-label="Fast mode enabled"
              title="Fast mode enabled"
            >
              <Zap size={12} strokeWidth={1.8} />
            </span>
          )}
        </div>
        <div className="composer-select-wrap composer-select-wrap--effort">
          <span className="composer-icon composer-icon--effort" aria-hidden>
            <BrainCog size={14} strokeWidth={1.8} />
          </span>
          <SelectMenu<string>
            value={selectedEffort ?? ""}
            onChange={(value) => onSelectEffort(value)}
            options={
              reasoningOptions.length === 0
                ? [{ value: "", label: "Default" }]
                : reasoningOptions.map((effort) => ({ value: effort, label: effort }))
            }
            ariaLabel="Thinking mode"
            disabled={disabled || !reasoningSupported}
            unstyledTrigger
            hideCaret
            placement="top"
            anchorClassName="composer-select-wrap"
            buttonClassName="composer-select composer-select--effort"
          />
        </div>
        {!isCustomHarness && codexArgsOptions.length > 1 && onSelectCodexArgsOverride && (
          <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </span>
            <SelectMenu<string>
              value={selectedCodexArgsOverride ?? ""}
              onChange={(value) => onSelectCodexArgsOverride(value || null)}
              options={codexArgsOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              ariaLabel="Codex args profile"
              disabled={disabled}
              unstyledTrigger
              hideCaret
              placement="top"
              anchorClassName="composer-select-wrap"
              buttonClassName="composer-select composer-select--approval"
            />
          </div>
        )}
      </div>
      <div className="composer-context">
        <div
          className="composer-context-ring"
          data-tooltip={
            contextFreePercent === null
              ? "Context free --"
              : `Context free ${Math.round(contextFreePercent)}%`
          }
          aria-label={
            contextFreePercent === null
              ? "Context free --"
              : `Context free ${Math.round(contextFreePercent)}%`
          }
          style={
            {
              "--context-free": contextFreePercent ?? 0,
            } as CSSProperties
          }
        >
          <span className="composer-context-value">●</span>
        </div>
      </div>
    </div>
  );
}
