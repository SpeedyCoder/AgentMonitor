import type { ReactElement } from "react";
import type { AcpHarnessConfig, AppSettings } from "@/types";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Mic from "lucide-react/dist/esm/icons/mic";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import ServerCog from "lucide-react/dist/esm/icons/server-cog";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Info from "lucide-react/dist/esm/icons/info";
import Bot from "lucide-react/dist/esm/icons/bot";
import Cpu from "lucide-react/dist/esm/icons/cpu";
import Plus from "lucide-react/dist/esm/icons/plus";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import { PanelNavItem, PanelNavList } from "@/features/design-system/components/panel/PanelPrimitives";
import { SelectMenu } from "@/features/design-system/components/popover/PopoverPrimitives";
import type { CodexSection } from "./settingsTypes";

type SettingsNavProps = {
  activeSection: CodexSection;
  onSelectSection: (section: CodexSection) => void;
  customHarnesses?: AcpHarnessConfig[];
  onAddHarness?: () => void;
  showDisclosure?: boolean;
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

type BackendSelectorValue = "local" | `remote:${string}`;

const SETTINGS_NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    section: CodexSection;
    label: string;
    icon: ReactElement;
  }>;
}> = [
  {
    label: "Workspace",
    items: [
      { section: "projects", label: "Projects", icon: <LayoutGrid aria-hidden /> },
    ],
  },
  {
    label: "Editor",
    items: [
      { section: "composer", label: "Composer", icon: <TerminalSquare aria-hidden /> },
      { section: "dictation", label: "Dictation", icon: <Mic aria-hidden /> },
      { section: "shortcuts", label: "Shortcuts", icon: <Keyboard aria-hidden /> },
    ],
  },
  {
    label: "Application",
    items: [
      { section: "display", label: "Display & Sound", icon: <SlidersHorizontal aria-hidden /> },
      { section: "open-apps", label: "Open in", icon: <ExternalLink aria-hidden /> },
      { section: "git", label: "Git", icon: <GitBranch aria-hidden /> },
      { section: "server", label: "Server", icon: <ServerCog aria-hidden /> },
    ],
  },
  {
    label: "Harnesses",
    items: [
      { section: "codex", label: "Codex", icon: <TerminalSquare aria-hidden /> },
      { section: "claude", label: "Claude", icon: <Sparkles aria-hidden /> },
    ],
  },
];

const FOOTER_NAV_ITEM = {
  section: "about" as const,
  label: "About",
  icon: <Info aria-hidden />,
};

function getCustomHarnessIcon(icon?: string | null) {
  switch (icon) {
    case "terminal":
      return <TerminalSquare aria-hidden />;
    case "sparkles":
      return <Sparkles aria-hidden />;
    case "cpu":
      return <Cpu aria-hidden />;
    case "wrench":
      return <Wrench aria-hidden />;
    case "bot":
    default:
      return <Bot aria-hidden />;
  }
}

export function SettingsNav({
  activeSection,
  onSelectSection,
  customHarnesses = [],
  onAddHarness,
  showDisclosure = false,
  appSettings,
  onUpdateAppSettings,
}: SettingsNavProps) {
  const configuredRemotes = appSettings.remoteBackends.filter(
    (entry) => entry.token != null && entry.token.length > 0,
  );
  const activeRemoteId =
    appSettings.activeRemoteBackendId &&
    configuredRemotes.some((entry) => entry.id === appSettings.activeRemoteBackendId)
      ? appSettings.activeRemoteBackendId
      : configuredRemotes[0]?.id ?? null;
  const selectorValue: BackendSelectorValue =
    appSettings.backendMode === "remote" && activeRemoteId
      ? `remote:${activeRemoteId}`
      : "local";

  const handleBackendChange = (value: BackendSelectorValue) => {
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

  const selectorOptions: { value: BackendSelectorValue; label: string }[] = [
    { value: "local", label: "Local" },
    ...configuredRemotes.map((entry) => ({
      value: `remote:${entry.id}` as BackendSelectorValue,
      label: entry.name,
    })),
  ];
  const showBackendSelector = configuredRemotes.length > 0;

  const visibleGroups = SETTINGS_NAV_GROUPS;

  return (
    <aside className="settings-sidebar">
      {showBackendSelector && (
        <div className="settings-nav-backend">
          <div className="settings-nav-backend-label">Backend</div>
          <SelectMenu<BackendSelectorValue>
            value={selectorValue}
            onChange={handleBackendChange}
            options={selectorOptions}
            ariaLabel="Settings backend"
            fullWidth
          />
        </div>
      )}
      <div className="settings-sidebar-groups">
        {visibleGroups.map((group) => (
          <div className="settings-nav-group" key={group.label}>
            <div className="settings-nav-group-heading">
              <div className="settings-nav-group-label">{group.label}</div>
              {group.label === "Harnesses" && onAddHarness ? (
                <button
                  type="button"
                  className="ghost icon-button settings-nav-add"
                  onClick={onAddHarness}
                  aria-label="Add custom harness"
                  title="Add custom harness"
                >
                  <Plus aria-hidden />
                </button>
              ) : null}
            </div>
            <PanelNavList className="settings-nav-list">
              {group.items.map((item) => (
                <PanelNavItem
                  key={item.section}
                  className="settings-nav"
                  icon={item.icon}
                  active={activeSection === item.section}
                  showDisclosure={showDisclosure}
                  onClick={() => onSelectSection(item.section)}
                >
                  {item.label}
                </PanelNavItem>
              ))}
              {group.label === "Harnesses"
                ? customHarnesses.map((harness) => {
                    const section = `harness:${harness.id}` as const;
                    return (
                      <PanelNavItem
                        key={section}
                        className="settings-nav"
                        icon={getCustomHarnessIcon(harness.icon)}
                        active={activeSection === section}
                        showDisclosure={showDisclosure}
                        onClick={() => onSelectSection(section)}
                      >
                        {harness.name?.trim() || harness.id}
                      </PanelNavItem>
                    );
                  })
                : null}
            </PanelNavList>
          </div>
        ))}
      </div>
      <div className="settings-sidebar-footer">
        <PanelNavList className="settings-nav-list">
          <PanelNavItem
            className="settings-nav"
            icon={FOOTER_NAV_ITEM.icon}
            active={activeSection === FOOTER_NAV_ITEM.section}
            showDisclosure={showDisclosure}
            onClick={() => onSelectSection(FOOTER_NAV_ITEM.section)}
          >
            {FOOTER_NAV_ITEM.label}
          </PanelNavItem>
        </PanelNavList>
      </div>
    </aside>
  );
}
