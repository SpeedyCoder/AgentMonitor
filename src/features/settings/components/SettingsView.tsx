import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import X from "lucide-react/dist/esm/icons/x";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowFullscreenState } from "@/features/layout/hooks/useWindowFullscreenState";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateResult,
  DictationModelStatus,
  RateLimitSnapshot,
  WorkspaceSettings,
  WorkspaceGroup,
  WorkspaceInfo,
} from "@/types";
import { useSettingsViewCloseShortcuts } from "@settings/hooks/useSettingsViewCloseShortcuts";
import { useSettingsViewNavigation } from "@settings/hooks/useSettingsViewNavigation";
import { useSettingsViewOrchestration } from "@settings/hooks/useSettingsViewOrchestration";
import { getRemoteAppSettings, updateRemoteAppSettings } from "@services/tauri";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { isMacPlatform } from "@utils/platformPaths";
import { SettingsNav } from "./SettingsNav";
import type { CodexSection, SettingsRouteSection } from "./settingsTypes";
import { getSettingsSectionLabel } from "./settingsViewConstants";
import { SettingsSectionContainers } from "./sections/SettingsSectionContainers";
import { createDefaultHarness } from "@settings/utils/settingsHarnesses";

export type SettingsViewProps = {
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: Array<{
    id: string | null;
    name: string;
    workspaces: WorkspaceInfo[];
  }>;
  ungroupedLabel: string;
  onClose: () => void;
  onMoveWorkspace: (id: string, direction: "up" | "down") => void;
  onDeleteWorkspace: (id: string) => void;
  onCreateWorkspaceGroup: (name: string) => Promise<WorkspaceGroup | null>;
  onRenameWorkspaceGroup: (id: string, name: string) => Promise<boolean | null>;
  onMoveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
  onDeleteWorkspaceGroup: (id: string) => Promise<boolean | null>;
  onAssignWorkspaceGroup: (
    workspaceId: string,
    groupId: string | null,
  ) => Promise<boolean | null>;
  appSettings: AppSettings;
  openAppIconById: Record<string, string>;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onToggleAutomaticAppUpdateChecks?: () => void;
  onRunDoctor: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexDoctorResult>;
  onRunCodexUpdate?: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexUpdateResult>;
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<void>;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
  onMobileConnectSuccess?: () => Promise<void> | void;
  dictationModelStatus?: DictationModelStatus | null;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
  initialSection?: SettingsRouteSection;
  accountRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
};

export function SettingsView({
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  onClose,
  onMoveWorkspace,
  onDeleteWorkspace,
  onCreateWorkspaceGroup,
  onRenameWorkspaceGroup,
  onMoveWorkspaceGroup,
  onDeleteWorkspaceGroup,
  onAssignWorkspaceGroup,
  appSettings,
  openAppIconById,
  onUpdateAppSettings,
  onToggleAutomaticAppUpdateChecks,
  onRunDoctor,
  onRunCodexUpdate,
  onUpdateWorkspaceSettings,
  scaleShortcutTitle,
  scaleShortcutText,
  onTestNotificationSound,
  onTestSystemNotification,
  onMobileConnectSuccess,
  dictationModelStatus,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
  initialSection,
  accountRateLimits,
  usageShowRemaining,
}: SettingsViewProps) {
  const isFullscreen = useWindowFullscreenState();
  const isWindowedMac = isMacPlatform() && !isFullscreen;
  const isRemoteBackend = appSettings.backendMode === "remote";
  const [remoteScopedSettings, setRemoteScopedSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (!isRemoteBackend) {
      setRemoteScopedSettings(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getRemoteAppSettings();
        if (!cancelled) {
          setRemoteScopedSettings(remote);
        }
      } catch (error) {
        if (!cancelled) {
          setRemoteScopedSettings(null);
          console.warn("Failed to load remote app settings", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isRemoteBackend]);

  const remoteCustomHarnesses = remoteScopedSettings?.customAcpHarnesses ?? null;
  const [localCustomHarnesses, setLocalCustomHarnesses] = useState(
    () => appSettings.customAcpHarnesses ?? [],
  );
  const customHarnessSaveCountRef = useRef(0);
  const {
    activeSection,
    showMobileDetail,
    setShowMobileDetail,
    useMobileMasterDetail,
    handleSelectSection,
  } = useSettingsViewNavigation({ initialSection });

  useEffect(() => {
    if (customHarnessSaveCountRef.current > 0) {
      return;
    }
    if (isRemoteBackend && remoteCustomHarnesses !== null) {
      setLocalCustomHarnesses(remoteCustomHarnesses);
      return;
    }
    setLocalCustomHarnesses(appSettings.customAcpHarnesses ?? []);
  }, [appSettings.customAcpHarnesses, isRemoteBackend, remoteCustomHarnesses]);

  const visibleAppSettings = useMemo(() => {
    const merged: AppSettings = {
      ...appSettings,
      customAcpHarnesses: localCustomHarnesses,
    };
    if (isRemoteBackend && remoteScopedSettings) {
      merged.codexBin = remoteScopedSettings.codexBin;
      merged.codexArgs = remoteScopedSettings.codexArgs;
      merged.claudeCliPath = remoteScopedSettings.claudeCliPath;
      merged.claudeAdapterPath = remoteScopedSettings.claudeAdapterPath;
      merged.linearApiToken = remoteScopedSettings.linearApiToken;
    }
    return merged;
  }, [appSettings, isRemoteBackend, localCustomHarnesses, remoteScopedSettings]);

  const handleUpdateAppSettings = useCallback(
    async (next: AppSettings) => {
      if (next.customAcpHarnesses !== visibleAppSettings.customAcpHarnesses) {
        customHarnessSaveCountRef.current += 1;
        setLocalCustomHarnesses(next.customAcpHarnesses ?? []);
      }
      const backendScopedChanged =
        isRemoteBackend &&
        remoteScopedSettings != null &&
        (next.customAcpHarnesses !== visibleAppSettings.customAcpHarnesses ||
          next.codexBin !== visibleAppSettings.codexBin ||
          next.codexArgs !== visibleAppSettings.codexArgs ||
          next.claudeCliPath !== visibleAppSettings.claudeCliPath ||
          next.claudeAdapterPath !== visibleAppSettings.claudeAdapterPath ||
          next.linearApiToken !== visibleAppSettings.linearApiToken);
      try {
        if (backendScopedChanged && remoteScopedSettings) {
          const remoteNext: AppSettings = {
            ...remoteScopedSettings,
            customAcpHarnesses: next.customAcpHarnesses,
            codexBin: next.codexBin,
            codexArgs: next.codexArgs,
            claudeCliPath: next.claudeCliPath,
            claudeAdapterPath: next.claudeAdapterPath,
            linearApiToken: next.linearApiToken,
          };
          const saved = await updateRemoteAppSettings(remoteNext);
          setRemoteScopedSettings(saved);
        }
        const localOnlyNext: AppSettings = isRemoteBackend
          ? {
              ...next,
              customAcpHarnesses: appSettings.customAcpHarnesses,
              codexBin: appSettings.codexBin,
              codexArgs: appSettings.codexArgs,
              claudeCliPath: appSettings.claudeCliPath,
              claudeAdapterPath: appSettings.claudeAdapterPath,
              linearApiToken: appSettings.linearApiToken,
            }
          : next;
        await onUpdateAppSettings(localOnlyNext);
      } finally {
        customHarnessSaveCountRef.current = Math.max(
          0,
          customHarnessSaveCountRef.current - 1,
        );
      }
    },
    [
      appSettings.customAcpHarnesses,
      appSettings.codexBin,
      appSettings.codexArgs,
      appSettings.claudeCliPath,
      appSettings.claudeAdapterPath,
      appSettings.linearApiToken,
      isRemoteBackend,
      onUpdateAppSettings,
      remoteScopedSettings,
      visibleAppSettings.customAcpHarnesses,
      visibleAppSettings.codexBin,
      visibleAppSettings.codexArgs,
      visibleAppSettings.claudeCliPath,
      visibleAppSettings.claudeAdapterPath,
      visibleAppSettings.linearApiToken,
    ],
  );

  const orchestration = useSettingsViewOrchestration({
    workspaceGroups,
    groupedWorkspaces,
    ungroupedLabel,
    appSettings: visibleAppSettings,
    openAppIconById,
    onUpdateAppSettings: handleUpdateAppSettings,
    onToggleAutomaticAppUpdateChecks,
    onRunDoctor,
    onRunCodexUpdate,
    onUpdateWorkspaceSettings,
    scaleShortcutTitle,
    scaleShortcutText,
    onTestNotificationSound,
    onTestSystemNotification,
    onMoveWorkspace,
    onDeleteWorkspace,
    onCreateWorkspaceGroup,
    onRenameWorkspaceGroup,
    onMoveWorkspaceGroup,
    onDeleteWorkspaceGroup,
    onAssignWorkspaceGroup,
    onMobileConnectSuccess,
    dictationModelStatus,
    onDownloadDictationModel,
    onCancelDictationDownload,
    onRemoveDictationModel,
    accountRateLimits,
    usageShowRemaining,
  });

  useSettingsViewCloseShortcuts(onClose);

  const customHarnessSectionIds = useMemo(
    () =>
      new Set(
        localCustomHarnesses.map(
          (harness) => `harness:${harness.id}`,
        ),
      ),
    [localCustomHarnesses],
  );

  useEffect(() => {
    if (activeSection.startsWith("harness:") && !customHarnessSectionIds.has(activeSection)) {
      handleSelectSection("codex");
    }
  }, [activeSection, customHarnessSectionIds, handleSelectSection]);

  const handleAddHarness = useCallback(() => {
    const nextHarness = createDefaultHarness(visibleAppSettings);
    void handleUpdateAppSettings({
      ...visibleAppSettings,
      customAcpHarnesses: [...localCustomHarnesses, nextHarness],
    });
    handleSelectSection(`harness:${nextHarness.id}` as CodexSection);
  }, [
    handleSelectSection,
    handleUpdateAppSettings,
    localCustomHarnesses,
    visibleAppSettings,
  ]);

  const customActiveHarness = activeSection.startsWith("harness:")
    ? localCustomHarnesses.find(
        (harness) => `harness:${harness.id}` === activeSection,
      )
    : null;
  const activeSectionLabel =
    customActiveHarness?.name?.trim() || getSettingsSectionLabel(activeSection);
  const settingsBodyClassName = `settings-body${
    useMobileMasterDetail ? " settings-body-mobile-master-detail" : ""
  }${useMobileMasterDetail && showMobileDetail ? " is-detail-visible" : ""}`;
  const settingsWindowClassName = `settings-window${
    isWindowedMac ? " settings-window-windowed-mac" : ""
  }`;

  return (
    <ModalShell
      className="settings-overlay"
      cardClassName={settingsWindowClassName}
      onBackdropClick={onClose}
      ariaLabelledBy="settings-modal-title"
    >
      <div className="settings-titlebar">
        <div className="settings-title" id="settings-modal-title">
          Settings
        </div>
        <button
          type="button"
          className="ghost icon-button settings-close"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X aria-hidden />
        </button>
      </div>
      <div className={settingsBodyClassName}>
        {(!useMobileMasterDetail || !showMobileDetail) && (
          <div className="settings-master">
            <SettingsNav
              activeSection={activeSection}
              onSelectSection={handleSelectSection}
              customHarnesses={localCustomHarnesses}
              onAddHarness={handleAddHarness}
              showDisclosure={useMobileMasterDetail}
              appSettings={visibleAppSettings}
              onUpdateAppSettings={handleUpdateAppSettings}
            />
          </div>
        )}
        {(!useMobileMasterDetail || showMobileDetail) && (
          <div className="settings-detail">
            {useMobileMasterDetail && (
              <div className="settings-mobile-detail-header">
                <button
                  type="button"
                  className="settings-mobile-back"
                  onClick={() => setShowMobileDetail(false)}
                  aria-label="Back to settings sections"
                >
                  <ChevronLeft aria-hidden />
                  Sections
                </button>
                <div className="settings-mobile-detail-title">{activeSectionLabel}</div>
              </div>
            )}
            <div className="settings-content">
              <SettingsSectionContainers
                activeSection={activeSection}
                orchestration={orchestration}
                onSelectSection={handleSelectSection}
              />
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
