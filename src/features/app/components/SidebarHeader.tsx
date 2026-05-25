import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import { useWindowFullscreenState } from "@/features/layout/hooks/useWindowFullscreenState";
import { isMacPlatform } from "@utils/platformPaths";

type SidebarHeaderProps = {
  onAddWorkspace: () => void;
};

export function SidebarHeader({
  onAddWorkspace,
}: SidebarHeaderProps) {
  const isFullscreen = useWindowFullscreenState();
  const showAddWorkspaceWithActions = isMacPlatform() && !isFullscreen;

  return (
    <div className="sidebar-header">
      <div className="sidebar-header-title">
        {!showAddWorkspaceWithActions && (
          <div className="sidebar-title-group">
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
        )}
      </div>
    </div>
  );
}
