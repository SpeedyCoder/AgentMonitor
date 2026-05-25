// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import { WorktreeThreadHistory } from "./WorktreeThreadHistory";

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  kind: "worktree",
  settings: {
    sidebarCollapsed: false,
    agentRuntime: "codex",
  },
};

describe("WorktreeThreadHistory", () => {
  it("renders custom ACP harness names from persisted thread runtime", () => {
    render(
      <WorktreeThreadHistory
        workspace={workspace}
        threads={[
          {
            id: "thread-1",
            name: "Custom session",
            runtime: "mistral-vibe",
            updatedAt: Date.now(),
          },
        ]}
        customHarnesses={[
          {
            id: "mistral-vibe",
            name: "Mistral Vibe",
            icon: "sparkles",
            startCommand: "vibe-acp",
            env: [],
          },
        ]}
        onSelectThread={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Restore Mistral Vibe session/i })).toBeTruthy();
    expect(screen.getByText("Mistral Vibe")).toBeTruthy();
    expect(screen.queryByText("mistral-vibe")).toBeNull();
  });
});
