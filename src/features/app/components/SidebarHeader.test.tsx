// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const isMacPlatformMock = vi.hoisted(() => vi.fn());
const useWindowFullscreenStateMock = vi.hoisted(() => vi.fn());

vi.mock("@utils/platformPaths", () => ({
  isMacPlatform: isMacPlatformMock,
  isMobilePlatform: () => false,
}));

vi.mock("@/features/layout/hooks/useWindowFullscreenState", () => ({
  useWindowFullscreenState: useWindowFullscreenStateMock,
}));

import { SidebarHeader } from "./SidebarHeader";
import type { AppSettings } from "@/types";

const minimalAppSettings = {
  backendMode: "local",
  remoteBackends: [],
  activeRemoteBackendId: null,
  remoteBackendProvider: "tcp",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
} as unknown as AppSettings;

const baseProps = {
  onAddWorkspace: vi.fn(),
  appSettings: minimalAppSettings,
  onUpdateAppSettings: vi.fn(),
};

describe("SidebarHeader", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("places add project in the actions on macOS when windowed", () => {
    isMacPlatformMock.mockReturnValue(true);
    useWindowFullscreenStateMock.mockReturnValue(false);

    render(<SidebarHeader {...baseProps} />);

    const actions = document.querySelector(".sidebar-header-actions");
    expect(actions).not.toBeNull();
    const actionButtons = within(actions as HTMLElement).getAllByRole("button");
    expect(actionButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Add project",
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
