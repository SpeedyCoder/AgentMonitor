import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import type { AppSettings } from "@/types";
import { useWindowFullscreenState } from "@/features/layout/hooks/useWindowFullscreenState";
import { isMacPlatform, isMobilePlatform } from "@utils/platformPaths";
import { SelectMenu } from "@/features/design-system/components/popover/PopoverPrimitives";

type BackendSelectorValue = `local` | `remote:${string}`;

type SidebarHeaderProps = {
  onAddWorkspace: () => void;
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<AppSettings | void> | void;
};

export function SidebarHeader({
  onAddWorkspace,
  appSettings,
  onUpdateAppSettings,
}: SidebarHeaderProps) {
  const isFullscreen = useWindowFullscreenState();
  const showAddWorkspaceWithActions = isMacPlatform() && !isFullscreen;

  const configuredRemotes = appSettings.remoteBackends.filter(
    (entry) => entry.token != null && entry.token.length > 0,
  );
  const showBackendSelector = !isMobilePlatform() && configuredRemotes.length > 0;

  const activeId =
    appSettings.activeRemoteBackendId &&
    configuredRemotes.some((entry) => entry.id === appSettings.activeRemoteBackendId)
      ? appSettings.activeRemoteBackendId
      : configuredRemotes[0]?.id ?? null;

  const selectedValue: BackendSelectorValue =
    appSettings.backendMode === "remote" && activeId
      ? `remote:${activeId}`
      : "local";

  const options: { value: BackendSelectorValue; label: string }[] = [
    { value: "local", label: "Local" },
    ...configuredRemotes.map((entry) => ({
      value: `remote:${entry.id}` as BackendSelectorValue,
      label: entry.name,
    })),
  ];

  const handleChange = (value: BackendSelectorValue) => {
    const reload = () => {
      try {
        window.location.reload();
      } catch {
        // jsdom or restricted environments may not support reload.
      }
    };
    if (value === "local") {
      if (appSettings.backendMode === "local") return;
      void Promise.resolve(
        onUpdateAppSettings({ ...appSettings, backendMode: "local" }),
      ).then(reload);
      return;
    }
    const remoteId = value.slice("remote:".length);
    const next = configuredRemotes.find((entry) => entry.id === remoteId);
    if (!next) return;
    if (
      appSettings.backendMode === "remote" &&
      appSettings.activeRemoteBackendId === remoteId
    ) {
      return;
    }
    void Promise.resolve(
      onUpdateAppSettings({
        ...appSettings,
        backendMode: "remote",
        activeRemoteBackendId: remoteId,
        remoteBackendProvider: next.provider,
        remoteBackendHost: next.host,
        remoteBackendToken: next.token,
      }),
    ).then(reload);
  };

  const backendSelectorNode = showBackendSelector ? (
    <SelectMenu<BackendSelectorValue>
      value={selectedValue}
      onChange={handleChange}
      options={options}
      ariaLabel="Backend"
      buttonClassName="sidebar-backend-selector"
      size="sm"
    />
  ) : null;

  return (
    <div className="sidebar-header">
      <div className="sidebar-header-title">
        {!showAddWorkspaceWithActions && (
          <div className="sidebar-title-group">
            {backendSelectorNode}
            <button
              className="sidebar-title-add ds-tooltip-trigger"
              onClick={onAddWorkspace}
              data-tauri-drag-region="false"
              aria-label="Add project"
              data-tooltip="Add project"
              data-tooltip-align="start"
              data-tooltip-placement="bottom"
              type="button"
            >
              <FolderPlus aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div className="sidebar-header-actions">
        {showAddWorkspaceWithActions && (
          <>
            {backendSelectorNode}
            <button
              className="sidebar-title-add sidebar-title-add--inline-actions ds-tooltip-trigger"
              onClick={onAddWorkspace}
              data-tauri-drag-region="false"
              aria-label="Add project"
              data-tooltip="Add project"
              data-tooltip-align="end"
              data-tooltip-placement="bottom"
              type="button"
            >
              <FolderPlus aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
