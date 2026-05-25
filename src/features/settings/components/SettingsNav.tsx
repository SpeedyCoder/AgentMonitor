import type { ReactElement } from "react";
import type { AcpHarnessConfig } from "@/types";
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
import type { CodexSection } from "./settingsTypes";

type SettingsNavProps = {
  activeSection: CodexSection;
  onSelectSection: (section: CodexSection) => void;
  customHarnesses?: AcpHarnessConfig[];
  onAddHarness?: () => void;
  showDisclosure?: boolean;
};

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
}: SettingsNavProps) {
  return (
    <aside className="settings-sidebar">
      <div className="settings-sidebar-groups">
        {SETTINGS_NAV_GROUPS.map((group) => (
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
