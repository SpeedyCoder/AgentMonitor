// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const isMacPlatformMock = vi.hoisted(() => vi.fn());
const useWindowFullscreenStateMock = vi.hoisted(() => vi.fn());

vi.mock("@utils/platformPaths", () => ({
  isMacPlatform: isMacPlatformMock,
}));

vi.mock("@/features/layout/hooks/useWindowFullscreenState", () => ({
  useWindowFullscreenState: useWindowFullscreenStateMock,
}));

import { SidebarHeader } from "./SidebarHeader";

const baseProps = {
  onAddWorkspace: vi.fn(),
  threadListSortKey: "updated_at" as const,
  onSetThreadListSortKey: vi.fn(),
  threadListOrganizeMode: "by_project" as const,
  onSetThreadListOrganizeMode: vi.fn(),
  onRefreshAllThreads: vi.fn(),
};

describe("SidebarHeader", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("places add project next to the filter control on macOS when windowed", () => {
    isMacPlatformMock.mockReturnValue(true);
    useWindowFullscreenStateMock.mockReturnValue(false);

    render(<SidebarHeader {...baseProps} />);

    const actions = document.querySelector(".sidebar-header-actions");
    expect(actions).not.toBeNull();
    const actionButtons = within(actions as HTMLElement).getAllByRole("button");
    expect(actionButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Add project",
      "Organize and sort threads",
      "Refresh all project threads",
    ]);
  });

  it("keeps add project in the title area outside macOS windowed mode", () => {
    isMacPlatformMock.mockReturnValue(true);
    useWindowFullscreenStateMock.mockReturnValue(true);

    render(<SidebarHeader {...baseProps} />);

    const title = document.querySelector(".sidebar-header-title");
    const actions = document.querySelector(".sidebar-header-actions");
    expect(title).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(within(title as HTMLElement).getByRole("button", { name: "Add project" })).not.toBeNull();
    expect(within(actions as HTMLElement).queryByRole("button", { name: "Add project" })).toBeNull();
  });
});
