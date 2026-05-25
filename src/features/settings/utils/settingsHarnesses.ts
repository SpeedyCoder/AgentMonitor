import type { AcpHarnessConfig, AppSettings } from "@/types";

export function slugifyHarnessName(name: string, existingIds: Set<string>) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "custom-harness";
  let id = base;
  let suffix = 2;
  while (existingIds.has(id) || id === "codex" || id === "claude") {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

export function createDefaultHarness(settings: AppSettings): AcpHarnessConfig {
  const existingIds = new Set((settings.customAcpHarnesses ?? []).map((harness) => harness.id));
  const name = "Custom ACP";
  return {
    id: slugifyHarnessName(name, existingIds),
    name,
    icon: "bot",
    startCommand: "",
    env: [],
  };
}

export function updateHarness(
  settings: AppSettings,
  harnessId: string,
  patch: Partial<AcpHarnessConfig>,
): AppSettings {
  return {
    ...settings,
    customAcpHarnesses: (settings.customAcpHarnesses ?? []).map((harness) =>
      harness.id === harnessId ? { ...harness, ...patch } : harness,
    ),
  };
}
