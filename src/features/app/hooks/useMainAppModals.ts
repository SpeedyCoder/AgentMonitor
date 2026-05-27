import { useMemo } from "react";
import type { ComponentType, Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  BranchInfo,
  CodexDoctorResult,
  CodexUpdateResult,
  RateLimitSnapshot,
  ThreadSummary,
  WorkspaceGroup,
  WorkspaceInfo,
  WorkspaceSettings,
} from "@/types";
import { useSettingsModalState } from "@app/hooks/useSettingsModalState";
import type { SettingsSection } from "@app/hooks/useSettingsModalState";
import type { AppModalsProps } from "@app/components/AppModals";
import type { SettingsViewProps } from "@settings/components/SettingsView";
import { useRenameThreadPrompt } from "@threads/hooks/useRenameThreadPrompt";
import { useBranchSwitcher } from "@/features/git/hooks/useBranchSwitcher";
import { useInitGitRepoPrompt } from "@/features/git/hooks/useInitGitRepoPrompt";
import type { InitGitRepoOutcome } from "@/features/git/hooks/useGitActions";
import { useWorktreePrompt } from "@/features/workspaces/hooks/useWorktreePrompt";

type GroupedWorkspaceInfo = SettingsViewProps["groupedWorkspaces"];

type UseMainAppModalsArgs = {
  settingsViewComponent: ComponentType<SettingsViewProps>;
  workspaces: WorkspaceInfo[];
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: GroupedWorkspaceInfo;
  ungroupedLabel: string;
  activeWorkspace: WorkspaceInfo | null;
  setActiveWorkspaceId: (id: string) => void;
  branches: BranchInfo[];
  currentBranch: string | null;
  threadRename: {
    threadsByWorkspace: Record<string, ThreadSummary[]>;
    renameThread: (workspaceId: string, threadId: string, name: string) => void;
  };
  git: {
    checkoutBranch: (name: string) => Promise<void>;
    initGitRepo: (branch: string) => Promise<InitGitRepoOutcome>;
    createGitHubRepo: (
      repo: string,
      visibility: "private" | "public",
      branch: string,
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    refreshGitRemote: () => void;
    initGitRepoLoading: boolean;
    createGitHubRepoLoading: boolean;
  };
  workspacePrompts: {
    addWorktreeAgent: (
      workspace: WorkspaceInfo,
      branch: string,
      options?: { displayName?: string | null; copyAgentsMd?: boolean },
    ) => Promise<WorkspaceInfo | null>;
    connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
    selectWorkspace: (workspaceId: string) => void;
    linearEnabled: boolean;
    defaultWorktreeBranchFormat: string | null;
    handleWorktreeCreated: Parameters<typeof useWorktreePrompt>[0]["onWorktreeCreated"];
    onCompactActivate?: () => void;
    onWorkspacePromptError: (message: string, kind: "worktree") => void;
    mobileRemoteWorkspacePathPrompt: AppModalsProps["mobileRemoteWorkspacePathPrompt"];
    updateMobileRemoteWorkspacePathInput: (value: string) => void;
    appendMobileRemoteWorkspacePathFromRecent: (path: string) => void;
    cancelMobileRemoteWorkspacePathPrompt: () => void;
    submitMobileRemoteWorkspacePathPrompt: () => void;
    openWorkspaceFromUrlPrompt: () => void;
    workspaceFromUrl: Pick<
      AppModalsProps,
      | "workspaceFromUrlPrompt"
      | "workspaceFromUrlCanSubmit"
      | "workspaceFromUrlShowFolderPicker"
      | "onWorkspaceFromUrlPromptUrlChange"
      | "onWorkspaceFromUrlPromptTargetFolderNameChange"
      | "onWorkspaceFromUrlPromptDestinationPathChange"
      | "onWorkspaceFromUrlPromptChooseDestinationPath"
      | "onWorkspaceFromUrlPromptClearDestinationPath"
      | "onWorkspaceFromUrlPromptCancel"
      | "onWorkspaceFromUrlPromptConfirm"
    >;
  };
  settings: {
    handleMoveWorkspace: (id: string, direction: "up" | "down") => void;
    removeWorkspace: (workspaceId: string) => Promise<void>;
    createWorkspaceGroup: (name: string) => Promise<WorkspaceGroup | null>;
    renameWorkspaceGroup: (id: string, name: string) => Promise<boolean | null>;
    moveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
    deleteWorkspaceGroup: (id: string) => Promise<boolean | null>;
    assignWorkspaceGroup: (
      workspaceId: string,
      groupId: string | null,
    ) => Promise<boolean | null>;
    appSettings: AppSettings;
    setAppSettings: Dispatch<SetStateAction<AppSettings>>;
    openAppIconById: Record<string, string>;
    queueSaveSettings: (next: AppSettings) => Promise<unknown>;
    handleToggleAutomaticAppUpdateChecks: () => void;
    doctor: (
      codexBin: string | null,
      codexArgs: string | null,
    ) => Promise<CodexDoctorResult>;
    codexUpdate?: (
      codexBin: string | null,
      codexArgs: string | null,
    ) => Promise<CodexUpdateResult>;
    updateWorkspaceSettings: (
      id: string,
      settings: Partial<WorkspaceSettings>,
    ) => Promise<WorkspaceInfo>;
    scaleShortcutTitle: string;
    scaleShortcutText: string;
    handleTestNotificationSound: () => void;
    handleTestSystemNotification: () => void;
    handleMobileConnectSuccess?: () => Promise<void> | void;
    dictationModel: {
      status?: SettingsViewProps["dictationModelStatus"];
      download?: () => void;
      cancel?: () => void;
      remove?: () => void;
    };
    accountRateLimits: RateLimitSnapshot | null;
    usageShowRemaining: boolean;
  };
};

type UseMainAppModalsResult = {
  appModalsProps: AppModalsProps;
  modalActions: {
    openSettings: (section?: SettingsSection) => void;
    closeSettings: () => void;
    openRenamePrompt: (workspaceId: string, threadId: string) => void;
    openInitGitRepoPrompt: () => void;
    openWorktreePrompt: (workspace: WorkspaceInfo) => void;
    openWorkspaceFromUrlPrompt: () => void;
    openBranchSwitcher: () => void;
    closeBranchSwitcher: () => void;
  };
};

type BuildSettingsViewPropsArgs = {
  groupedWorkspaces: GroupedWorkspaceInfo;
  workspaceGroups: WorkspaceGroup[];
  ungroupedLabel: string;
  settings: UseMainAppModalsArgs["settings"];
};

function buildSettingsViewProps({
  groupedWorkspaces,
  workspaceGroups,
  ungroupedLabel,
  settings,
}: BuildSettingsViewPropsArgs): Omit<SettingsViewProps, "initialSection" | "onClose"> {
  return {
    workspaceGroups,
    groupedWorkspaces,
    ungroupedLabel,
    onMoveWorkspace: settings.handleMoveWorkspace,
    onDeleteWorkspace: (workspaceId) => {
      void settings.removeWorkspace(workspaceId);
    },
    onCreateWorkspaceGroup: settings.createWorkspaceGroup,
    onRenameWorkspaceGroup: settings.renameWorkspaceGroup,
    onMoveWorkspaceGroup: settings.moveWorkspaceGroup,
    onDeleteWorkspaceGroup: settings.deleteWorkspaceGroup,
    onAssignWorkspaceGroup: settings.assignWorkspaceGroup,
    appSettings: settings.appSettings,
    openAppIconById: settings.openAppIconById,
    onUpdateAppSettings: async (next) => {
      settings.setAppSettings(next);
      await Promise.resolve(settings.queueSaveSettings(next));
    },
    onToggleAutomaticAppUpdateChecks:
      settings.handleToggleAutomaticAppUpdateChecks,
    onRunDoctor: settings.doctor,
    onRunCodexUpdate: settings.codexUpdate,
    onUpdateWorkspaceSettings: async (id, nextSettings) => {
      await settings.updateWorkspaceSettings(id, nextSettings);
    },
    scaleShortcutTitle: settings.scaleShortcutTitle,
    scaleShortcutText: settings.scaleShortcutText,
    onTestNotificationSound: settings.handleTestNotificationSound,
    onTestSystemNotification: settings.handleTestSystemNotification,
    onMobileConnectSuccess: settings.handleMobileConnectSuccess,
    dictationModelStatus: settings.dictationModel.status,
    onDownloadDictationModel: settings.dictationModel.download,
    onCancelDictationDownload: settings.dictationModel.cancel,
    onRemoveDictationModel: settings.dictationModel.remove,
    accountRateLimits: settings.accountRateLimits,
    usageShowRemaining: settings.usageShowRemaining,
  };
}

type BuildAppModalsPropsArgs = {
  renamePrompt: AppModalsProps["renamePrompt"];
  onRenamePromptChange: (value: string) => void;
  onRenamePromptCancel: () => void;
  onRenamePromptConfirm: () => void;
  initGitRepoPrompt: AppModalsProps["initGitRepoPrompt"];
  initGitRepoPromptBusy: boolean;
  onInitGitRepoPromptBranchChange: (value: string) => void;
  onInitGitRepoPromptCreateRemoteChange: (value: boolean) => void;
  onInitGitRepoPromptRepoNameChange: (value: string) => void;
  onInitGitRepoPromptPrivateChange: (value: boolean) => void;
  onInitGitRepoPromptCancel: () => void;
  onInitGitRepoPromptConfirm: () => void;
  worktreePrompt: AppModalsProps["worktreePrompt"];
  onWorktreePromptChange: (value: string) => void;
  onWorktreePromptLinearQueryChange: AppModalsProps["onWorktreePromptLinearQueryChange"];
  onWorktreePromptTabChange: AppModalsProps["onWorktreePromptTabChange"];
  onWorktreePromptLinearIssueSelect: AppModalsProps["onWorktreePromptLinearIssueSelect"];
  onWorktreePromptCancel: () => void;
  onWorktreePromptConfirm: () => void;
  workspaceFromUrl: AppModalsProps["workspaceFromUrlPrompt"] extends null
    ? never
    : Pick<
        AppModalsProps,
        | "workspaceFromUrlPrompt"
        | "workspaceFromUrlCanSubmit"
        | "workspaceFromUrlShowFolderPicker"
        | "onWorkspaceFromUrlPromptUrlChange"
        | "onWorkspaceFromUrlPromptTargetFolderNameChange"
        | "onWorkspaceFromUrlPromptDestinationPathChange"
        | "onWorkspaceFromUrlPromptChooseDestinationPath"
        | "onWorkspaceFromUrlPromptClearDestinationPath"
        | "onWorkspaceFromUrlPromptCancel"
        | "onWorkspaceFromUrlPromptConfirm"
      >;
  mobileRemoteWorkspacePathPrompt: AppModalsProps["mobileRemoteWorkspacePathPrompt"];
  onMobileRemoteWorkspacePathPromptChange: (value: string) => void;
  onMobileRemoteWorkspacePathPromptRecentPathSelect: (path: string) => void;
  onMobileRemoteWorkspacePathPromptCancel: () => void;
  onMobileRemoteWorkspacePathPromptConfirm: () => void;
  branchSwitcher: AppModalsProps["branchSwitcher"];
  branches: BranchInfo[];
  workspaces: WorkspaceInfo[];
  activeWorkspace: WorkspaceInfo | null;
  currentBranch: string | null;
  onBranchSwitcherSelect: (branch: string, worktree: WorkspaceInfo | null) => void;
  onBranchSwitcherCancel: () => void;
  settingsOpen: boolean;
  settingsSection: SettingsViewProps["initialSection"] | null;
  onCloseSettings: () => void;
  settingsViewComponent: ComponentType<SettingsViewProps>;
  settingsViewProps: Omit<SettingsViewProps, "initialSection" | "onClose">;
};

function buildAppModalsProps({
  renamePrompt,
  onRenamePromptChange,
  onRenamePromptCancel,
  onRenamePromptConfirm,
  initGitRepoPrompt,
  initGitRepoPromptBusy,
  onInitGitRepoPromptBranchChange,
  onInitGitRepoPromptCreateRemoteChange,
  onInitGitRepoPromptRepoNameChange,
  onInitGitRepoPromptPrivateChange,
  onInitGitRepoPromptCancel,
  onInitGitRepoPromptConfirm,
  worktreePrompt,
  onWorktreePromptChange,
  onWorktreePromptLinearQueryChange,
  onWorktreePromptTabChange,
  onWorktreePromptLinearIssueSelect,
  onWorktreePromptCancel,
  onWorktreePromptConfirm,
  workspaceFromUrl,
  mobileRemoteWorkspacePathPrompt,
  onMobileRemoteWorkspacePathPromptChange,
  onMobileRemoteWorkspacePathPromptRecentPathSelect,
  onMobileRemoteWorkspacePathPromptCancel,
  onMobileRemoteWorkspacePathPromptConfirm,
  branchSwitcher,
  branches,
  workspaces,
  activeWorkspace,
  currentBranch,
  onBranchSwitcherSelect,
  onBranchSwitcherCancel,
  settingsOpen,
  settingsSection,
  onCloseSettings,
  settingsViewComponent,
  settingsViewProps,
}: BuildAppModalsPropsArgs): AppModalsProps {
  return {
    renamePrompt,
    onRenamePromptChange,
    onRenamePromptCancel,
    onRenamePromptConfirm,
    initGitRepoPrompt,
    initGitRepoPromptBusy,
    onInitGitRepoPromptBranchChange,
    onInitGitRepoPromptCreateRemoteChange,
    onInitGitRepoPromptRepoNameChange,
    onInitGitRepoPromptPrivateChange,
    onInitGitRepoPromptCancel,
    onInitGitRepoPromptConfirm,
    worktreePrompt,
    onWorktreePromptChange,
    onWorktreePromptLinearQueryChange,
    onWorktreePromptTabChange,
    onWorktreePromptLinearIssueSelect,
    onWorktreePromptCancel,
    onWorktreePromptConfirm,
    ...workspaceFromUrl,
    mobileRemoteWorkspacePathPrompt,
    onMobileRemoteWorkspacePathPromptChange,
    onMobileRemoteWorkspacePathPromptRecentPathSelect,
    onMobileRemoteWorkspacePathPromptCancel,
    onMobileRemoteWorkspacePathPromptConfirm,
    branchSwitcher,
    branches,
    workspaces,
    activeWorkspace,
    currentBranch,
    onBranchSwitcherSelect,
    onBranchSwitcherCancel,
    settingsOpen,
    settingsSection: settingsSection ?? undefined,
    onCloseSettings,
    SettingsViewComponent: settingsViewComponent,
    settingsProps: settingsViewProps,
  };
}

export function useMainAppModals({
  settingsViewComponent,
  workspaces,
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  activeWorkspace,
  setActiveWorkspaceId,
  branches,
  currentBranch,
  threadRename,
  git,
  workspacePrompts,
  settings,
}: UseMainAppModalsArgs): UseMainAppModalsResult {
  const {
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
  } = useSettingsModalState();

  const {
    renamePrompt,
    openRenamePrompt,
    handleRenamePromptChange,
    handleRenamePromptCancel,
    handleRenamePromptConfirm,
  } = useRenameThreadPrompt({
    threadsByWorkspace: threadRename.threadsByWorkspace,
    renameThread: threadRename.renameThread,
  });

  const {
    branchSwitcher,
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
  } = useBranchSwitcher({
    activeWorkspace,
    checkoutBranch: git.checkoutBranch,
    setActiveWorkspaceId,
  });

  const {
    initGitRepoPrompt,
    openInitGitRepoPrompt,
    handleInitGitRepoPromptBranchChange,
    handleInitGitRepoPromptCreateRemoteChange,
    handleInitGitRepoPromptRepoNameChange,
    handleInitGitRepoPromptPrivateChange,
    handleInitGitRepoPromptCancel,
    handleInitGitRepoPromptConfirm,
  } = useInitGitRepoPrompt({
    activeWorkspace,
    initGitRepo: git.initGitRepo,
    createGitHubRepo: git.createGitHubRepo,
    refreshGitRemote: git.refreshGitRemote,
    isBusy: git.initGitRepoLoading || git.createGitHubRepoLoading,
  });

  const {
    worktreePrompt,
    openPrompt: openWorktreePrompt,
    confirmPrompt: confirmWorktreePrompt,
    selectLinearIssue: selectWorktreeLinearIssue,
    cancelPrompt: cancelWorktreePrompt,
    updateBranch: updateWorktreeBranch,
    updateLinearQuery: updateWorktreeLinearQuery,
    switchTab: switchWorktreePromptTab,
  } = useWorktreePrompt({
    addWorktreeAgent: workspacePrompts.addWorktreeAgent,
    connectWorkspace: workspacePrompts.connectWorkspace,
    onSelectWorkspace: workspacePrompts.selectWorkspace,
    linearEnabled: workspacePrompts.linearEnabled,
    defaultBranchFormat: workspacePrompts.defaultWorktreeBranchFormat,
    onWorktreeCreated: workspacePrompts.handleWorktreeCreated,
    onCompactActivate: workspacePrompts.onCompactActivate,
    onError: (message) => workspacePrompts.onWorkspacePromptError(message, "worktree"),
  });

  const settingsViewProps = useMemo<Omit<SettingsViewProps, "initialSection" | "onClose">>(
    () =>
      buildSettingsViewProps({
        groupedWorkspaces,
        workspaceGroups,
        ungroupedLabel,
        settings,
      }),
    [groupedWorkspaces, settings, ungroupedLabel, workspaceGroups],
  );

  const appModalsProps = useMemo<AppModalsProps>(
    () =>
      buildAppModalsProps({
        renamePrompt,
        onRenamePromptChange: handleRenamePromptChange,
        onRenamePromptCancel: handleRenamePromptCancel,
        onRenamePromptConfirm: handleRenamePromptConfirm,
        initGitRepoPrompt,
        initGitRepoPromptBusy: git.initGitRepoLoading || git.createGitHubRepoLoading,
        onInitGitRepoPromptBranchChange: handleInitGitRepoPromptBranchChange,
        onInitGitRepoPromptCreateRemoteChange:
          handleInitGitRepoPromptCreateRemoteChange,
        onInitGitRepoPromptRepoNameChange: handleInitGitRepoPromptRepoNameChange,
        onInitGitRepoPromptPrivateChange: handleInitGitRepoPromptPrivateChange,
        onInitGitRepoPromptCancel: handleInitGitRepoPromptCancel,
        onInitGitRepoPromptConfirm: handleInitGitRepoPromptConfirm,
        worktreePrompt,
        onWorktreePromptChange: updateWorktreeBranch,
        onWorktreePromptLinearQueryChange: updateWorktreeLinearQuery,
        onWorktreePromptTabChange: switchWorktreePromptTab,
        onWorktreePromptLinearIssueSelect: selectWorktreeLinearIssue,
        onWorktreePromptCancel: cancelWorktreePrompt,
        onWorktreePromptConfirm: confirmWorktreePrompt,
        workspaceFromUrl: workspacePrompts.workspaceFromUrl,
        mobileRemoteWorkspacePathPrompt:
          workspacePrompts.mobileRemoteWorkspacePathPrompt,
        onMobileRemoteWorkspacePathPromptChange:
          workspacePrompts.updateMobileRemoteWorkspacePathInput,
        onMobileRemoteWorkspacePathPromptRecentPathSelect:
          workspacePrompts.appendMobileRemoteWorkspacePathFromRecent,
        onMobileRemoteWorkspacePathPromptCancel:
          workspacePrompts.cancelMobileRemoteWorkspacePathPrompt,
        onMobileRemoteWorkspacePathPromptConfirm:
          workspacePrompts.submitMobileRemoteWorkspacePathPrompt,
        branchSwitcher,
        branches,
        workspaces,
        activeWorkspace,
        currentBranch,
        onBranchSwitcherSelect: handleBranchSelect,
        onBranchSwitcherCancel: closeBranchSwitcher,
        settingsOpen,
        settingsSection,
        onCloseSettings: closeSettings,
        settingsViewComponent,
        settingsViewProps,
      }),
    [
      activeWorkspace,
      branchSwitcher,
      branches,
      cancelWorktreePrompt,
      closeBranchSwitcher,
      closeSettings,
      confirmWorktreePrompt,
      selectWorktreeLinearIssue,
      currentBranch,
      git.createGitHubRepoLoading,
      git.initGitRepoLoading,
      handleBranchSelect,
      handleInitGitRepoPromptBranchChange,
      handleInitGitRepoPromptCancel,
      handleInitGitRepoPromptConfirm,
      handleInitGitRepoPromptCreateRemoteChange,
      handleInitGitRepoPromptPrivateChange,
      handleInitGitRepoPromptRepoNameChange,
      handleRenamePromptCancel,
      handleRenamePromptChange,
      handleRenamePromptConfirm,
      initGitRepoPrompt,
      renamePrompt,
      settingsOpen,
      settingsSection,
      settingsViewComponent,
      settingsViewProps,
      workspacePrompts,
      updateWorktreeBranch,
      updateWorktreeLinearQuery,
      switchWorktreePromptTab,
      workspaces,
      worktreePrompt,
    ],
  );

  return {
    appModalsProps,
    modalActions: {
      openSettings,
      closeSettings,
      openRenamePrompt,
      openInitGitRepoPrompt,
      openWorktreePrompt,
      openWorkspaceFromUrlPrompt: workspacePrompts.openWorkspaceFromUrlPrompt,
      openBranchSwitcher,
      closeBranchSwitcher,
    },
  };
}
