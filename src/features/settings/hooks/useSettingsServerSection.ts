import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TcpDaemonStatus,
} from "@/types";
import {
  listWorkspaces,
  tailscaleDaemonCommandPreview as fetchTailscaleDaemonCommandPreview,
  tailscaleDaemonStart,
  tailscaleDaemonStatus,
  tailscaleDaemonStop,
  tailscaleStatus as fetchTailscaleStatus,
} from "@services/tauri";
import { isMobilePlatform } from "@utils/platformPaths";
import { DEFAULT_REMOTE_HOST } from "@settings/components/settingsViewConstants";

type UseSettingsServerSectionArgs = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onMobileConnectSuccess?: () => Promise<void> | void;
};

export type AddRemoteBackendDraft = {
  name: string;
  host: string;
  token: string;
};

export type SettingsServerSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  isMobilePlatform: boolean;
  mobileConnectBusy: boolean;
  mobileConnectStatusText: string | null;
  mobileConnectStatusError: boolean;
  remoteBackends: AppSettings["remoteBackends"];
  activeRemoteBackendId: string | null;
  remoteStatusText: string | null;
  remoteStatusError: boolean;
  nextRemoteNameSuggestion: string;
  tailscaleStatus: TailscaleStatus | null;
  tailscaleStatusBusy: boolean;
  tailscaleStatusError: string | null;
  tailscaleCommandPreview: TailscaleDaemonCommandPreview | null;
  tailscaleCommandBusy: boolean;
  tailscaleCommandError: string | null;
  tcpDaemonStatus: TcpDaemonStatus | null;
  tcpDaemonBusyAction: "start" | "stop" | "status" | null;
  onSelectRemoteBackend: (id: string) => Promise<void>;
  onAddRemoteBackend: (draft: AddRemoteBackendDraft) => Promise<void>;
  onMoveRemoteBackend: (id: string, direction: "up" | "down") => Promise<void>;
  onDeleteRemoteBackend: (id: string) => Promise<void>;
  onUpdateRemoteBackend: (
    id: string,
    patch: { name?: string; host?: string; token?: string | null },
  ) => Promise<{ ok: boolean; error?: string }>;
  onRefreshTailscaleStatus: () => void;
  onRefreshTailscaleCommandPreview: () => void;
  onUseSuggestedTailscaleHost: () => Promise<void>;
  onTcpDaemonStart: () => Promise<void>;
  onTcpDaemonStop: () => Promise<void>;
  onTcpDaemonStatus: () => Promise<void>;
  onMobileConnectTest: () => void;
};

const formatErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return fallback;
};

type RemoteBackendTarget = AppSettings["remoteBackends"][number];

const createRemoteBackendId = () =>
  `remote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const buildFallbackRemoteBackend = (settings: AppSettings): RemoteBackendTarget => ({
  id: settings.activeRemoteBackendId ?? "remote-default",
  name: "Primary remote",
  provider: "tcp",
  host: settings.remoteBackendHost,
  token: settings.remoteBackendToken,
  lastConnectedAtMs: null,
});

const getConfiguredRemoteBackends = (settings: AppSettings): RemoteBackendTarget[] => {
  if (settings.remoteBackends.length > 0) {
    return settings.remoteBackends;
  }
  return [buildFallbackRemoteBackend(settings)];
};

const getActiveRemoteBackend = (settings: AppSettings): RemoteBackendTarget => {
  const configured = getConfiguredRemoteBackends(settings);
  return configured.find((entry) => entry.id === settings.activeRemoteBackendId) ?? configured[0];
};

const validateRemoteHost = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Host is required.";
  }
  const match = trimmed.match(/^([^:\s]+|\[[^\]]+\]):([0-9]{1,5})$/);
  if (!match) {
    return "Use host:port (for example `macbook.tailnet.ts.net:4732`).";
  }
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "Port must be between 1 and 65535.";
  }
  return null;
};

const buildNextRemoteName = (remoteBackends: RemoteBackendTarget[]) => {
  const normalized = new Set(remoteBackends.map((entry) => entry.name.trim().toLowerCase()));
  let index = remoteBackends.length + 1;
  let candidate = `Remote ${index}`;
  while (normalized.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `Remote ${index}`;
  }
  return candidate;
};

export const useSettingsServerSection = ({
  appSettings,
  onUpdateAppSettings,
  onMobileConnectSuccess,
}: UseSettingsServerSectionArgs): SettingsServerSectionProps => {
  const [remoteStatusText, setRemoteStatusText] = useState<string | null>(null);
  const [remoteStatusError, setRemoteStatusError] = useState(false);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [tailscaleStatusBusy, setTailscaleStatusBusy] = useState(false);
  const [tailscaleStatusError, setTailscaleStatusError] = useState<string | null>(null);
  const [tailscaleCommandPreview, setTailscaleCommandPreview] =
    useState<TailscaleDaemonCommandPreview | null>(null);
  const [tailscaleCommandBusy, setTailscaleCommandBusy] = useState(false);
  const [tailscaleCommandError, setTailscaleCommandError] = useState<string | null>(null);
  const [tcpDaemonStatus, setTcpDaemonStatus] = useState<TcpDaemonStatus | null>(null);
  const [tcpDaemonBusyAction, setTcpDaemonBusyAction] = useState<
    "start" | "stop" | "status" | null
  >(null);
  const [mobileConnectBusy, setMobileConnectBusy] = useState(false);
  const [mobileConnectStatusText, setMobileConnectStatusText] = useState<string | null>(null);
  const [mobileConnectStatusError, setMobileConnectStatusError] = useState(false);
  const mobilePlatform = useMemo(() => isMobilePlatform(), []);

  const latestSettingsRef = useRef(appSettings);

  const setRemoteStatus = useCallback((message: string | null, isError = false) => {
    setRemoteStatusText(message);
    setRemoteStatusError(isError);
  }, []);

  useEffect(() => {
    latestSettingsRef.current = appSettings;
  }, [appSettings]);

  const normalizeRemoteBackendEntry = (
    entry: RemoteBackendTarget,
    index: number,
  ): RemoteBackendTarget => ({
    id: entry.id?.trim() || `remote-${index + 1}`,
    name: entry.name?.trim() || `Remote ${index + 1}`,
    provider: "tcp",
    host: entry.host?.trim() || DEFAULT_REMOTE_HOST,
    token: entry.token?.trim() ? entry.token.trim() : null,
    lastConnectedAtMs:
      typeof entry.lastConnectedAtMs === "number" && Number.isFinite(entry.lastConnectedAtMs)
        ? entry.lastConnectedAtMs
        : null,
  });

  const buildSettingsFromRemoteBackends = useCallback(
    (
      latestSettings: AppSettings,
      remoteBackends: RemoteBackendTarget[],
      preferredActiveId?: string | null,
    ): AppSettings => {
      const normalizedBackends = remoteBackends.length
        ? remoteBackends.map(normalizeRemoteBackendEntry)
        : [normalizeRemoteBackendEntry(buildFallbackRemoteBackend(latestSettings), 0)];
      const active =
        normalizedBackends.find((entry) => entry.id === preferredActiveId) ??
        normalizedBackends.find((entry) => entry.id === latestSettings.activeRemoteBackendId) ??
        normalizedBackends[0];
      return {
        ...latestSettings,
        remoteBackends: normalizedBackends,
        activeRemoteBackendId: active.id,
        remoteBackendProvider: "tcp",
        remoteBackendHost: active.host,
        remoteBackendToken: active.token,
        ...(mobilePlatform
          ? {
              backendMode: "remote",
            }
          : {}),
      };
    },
    [mobilePlatform],
  );

  const persistRemoteBackends = useCallback(
    async (remoteBackends: RemoteBackendTarget[], preferredActiveId?: string | null) => {
      const latestSettings = latestSettingsRef.current;
      const nextSettings = buildSettingsFromRemoteBackends(
        latestSettings,
        remoteBackends,
        preferredActiveId,
      );
      const unchanged =
        nextSettings.remoteBackendHost === latestSettings.remoteBackendHost &&
        nextSettings.remoteBackendToken === latestSettings.remoteBackendToken &&
        nextSettings.backendMode === latestSettings.backendMode &&
        nextSettings.remoteBackendProvider === latestSettings.remoteBackendProvider &&
        nextSettings.activeRemoteBackendId === latestSettings.activeRemoteBackendId &&
        JSON.stringify(nextSettings.remoteBackends) === JSON.stringify(latestSettings.remoteBackends);
      if (unchanged) {
        return;
      }
      await onUpdateAppSettings(nextSettings);
      latestSettingsRef.current = nextSettings;
    },
    [buildSettingsFromRemoteBackends, onUpdateAppSettings],
  );

  const updateActiveRemoteBackend = useCallback(
    async (patch: Partial<RemoteBackendTarget>) => {
      const latestSettings = latestSettingsRef.current;
      const active = getActiveRemoteBackend(latestSettings);
      const nextBackends = [...getConfiguredRemoteBackends(latestSettings)];
      const activeIndex = nextBackends.findIndex((entry) => entry.id === active.id);
      const safeIndex = activeIndex >= 0 ? activeIndex : 0;
      nextBackends[safeIndex] = {
        ...nextBackends[safeIndex],
        ...patch,
        provider: "tcp",
      };
      await persistRemoteBackends(nextBackends, nextBackends[safeIndex].id);
    },
    [persistRemoteBackends],
  );

  const handleSelectRemoteBackend = async (id: string) => {
    const latestSettings = latestSettingsRef.current;
    const candidates = getConfiguredRemoteBackends(latestSettings);
    const selected = candidates.find((entry) => entry.id === id);
    if (!selected) {
      return;
    }
    await persistRemoteBackends(candidates, id);
    setRemoteStatus(`Active remote set to "${selected.name}".`);
    try {
      window.location.reload();
    } catch {
      // jsdom or restricted environments may not support reload.
    }
  };

  const handleAddRemoteBackend = async (draft: AddRemoteBackendDraft) => {
    const latestSettings = latestSettingsRef.current;
    const existingBackends = getConfiguredRemoteBackends(latestSettings);
    const nextName = draft.name.trim();
    if (!nextName) {
      const message = "Name is required.";
      setRemoteStatus(message, true);
      throw new Error(message);
    }
    const duplicate = existingBackends.some(
      (entry) => entry.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      const message = `A remote named "${nextName}" already exists.`;
      setRemoteStatus(message, true);
      throw new Error(message);
    }
    const nextHost = draft.host.trim();
    const hostError = validateRemoteHost(nextHost);
    if (hostError) {
      setRemoteStatus(hostError, true);
      throw new Error(hostError);
    }
    const nextToken = draft.token.trim() ? draft.token.trim() : null;
    if (!nextToken) {
      const message = "Remote backend token is required.";
      setRemoteStatus(message, true);
      throw new Error(message);
    }

    const nextId = createRemoteBackendId();
    const nextRemote: RemoteBackendTarget = {
      id: nextId,
      name: nextName,
      provider: "tcp",
      host: nextHost,
      token: nextToken,
      lastConnectedAtMs: null,
    };

    const previousSettings = latestSettings;
    const candidateBackends = [...existingBackends, nextRemote];
    const candidateSettings = buildSettingsFromRemoteBackends(
      previousSettings,
      candidateBackends,
      nextId,
    );

    let candidatePersisted = false;
    try {
      await onUpdateAppSettings(candidateSettings);
      latestSettingsRef.current = candidateSettings;
      candidatePersisted = true;

      const workspaces = await listWorkspaces();
      const workspaceCount = workspaces.length;
      const projectWord = workspaceCount === 1 ? "project" : "projects";
      const connectedBackends = candidateBackends.map((entry) =>
        entry.id === nextId ? { ...entry, lastConnectedAtMs: Date.now() } : entry,
      );
      const connectedSettings = buildSettingsFromRemoteBackends(
        candidateSettings,
        connectedBackends,
        nextId,
      );
      await onUpdateAppSettings(connectedSettings);
      latestSettingsRef.current = connectedSettings;
      setRemoteStatus(
        `Added "${nextName}" and connected. ${workspaceCount} ${projectWord} reachable on the remote backend.`,
      );
      await onMobileConnectSuccess?.();
    } catch (error) {
      if (candidatePersisted) {
        try {
          await onUpdateAppSettings(previousSettings);
          latestSettingsRef.current = previousSettings;
        } catch {
          // Keep the original connection error surfaced below.
        }
      }
      const message = formatErrorMessage(error, "Unable to connect to the new remote backend.");
      setRemoteStatus(message, true);
      throw new Error(message);
    }
  };

  const handleMoveRemoteBackend = async (id: string, direction: "up" | "down") => {
    const latestSettings = latestSettingsRef.current;
    const nextBackends = [...getConfiguredRemoteBackends(latestSettings)];
    const index = nextBackends.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextBackends.length) {
      return;
    }
    const entry = nextBackends[index];
    nextBackends[index] = nextBackends[targetIndex];
    nextBackends[targetIndex] = entry;
    await persistRemoteBackends(nextBackends);
    setRemoteStatus(`Moved "${entry.name}" ${direction}.`);
  };

  const handleUpdateRemoteBackend = async (
    id: string,
    patch: { name?: string; host?: string; token?: string | null },
  ): Promise<{ ok: boolean; error?: string }> => {
    const latestSettings = latestSettingsRef.current;
    const existing = getConfiguredRemoteBackends(latestSettings);
    const index = existing.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return { ok: false, error: "Remote not found." };
    }
    const current = existing[index];
    const nextName = patch.name !== undefined ? patch.name.trim() : current.name;
    if (!nextName) {
      return { ok: false, error: "Name is required." };
    }
    const duplicate = existing.some(
      (entry) =>
        entry.id !== id && entry.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      return { ok: false, error: `A remote named "${nextName}" already exists.` };
    }
    const nextHost = patch.host !== undefined ? patch.host.trim() : current.host;
    const hostError = validateRemoteHost(nextHost);
    if (hostError) {
      return { ok: false, error: hostError };
    }
    const nextToken =
      patch.token === undefined
        ? current.token
        : patch.token == null
          ? null
          : patch.token.trim()
            ? patch.token.trim()
            : null;
    if (nextToken == null) {
      return { ok: false, error: "Token is required." };
    }
    const updated: RemoteBackendTarget = {
      ...current,
      name: nextName,
      host: nextHost,
      token: nextToken,
    };
    const nextBackends = [...existing];
    nextBackends[index] = updated;
    await persistRemoteBackends(nextBackends, latestSettings.activeRemoteBackendId ?? id);
    setRemoteStatus(`Updated "${updated.name}".`);
    return { ok: true };
  };

  const handleDeleteRemoteBackend = async (id: string) => {
    const latestSettings = latestSettingsRef.current;
    const existingBackends = getConfiguredRemoteBackends(latestSettings);
    if (existingBackends.length <= 1) {
      setRemoteStatus("You need at least one remote.", true);
      return;
    }
    const index = existingBackends.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return;
    }
    const removed = existingBackends[index];
    const remaining = existingBackends.filter((entry) => entry.id !== id);
    const nextActiveId =
      latestSettings.activeRemoteBackendId === id
        ? remaining[Math.min(index, remaining.length - 1)]?.id ?? remaining[0]?.id ?? null
        : latestSettings.activeRemoteBackendId;
    await persistRemoteBackends(remaining, nextActiveId);
    setRemoteStatus(`Deleted "${removed.name}".`);
  };

  const handleMobileConnectTest = () => {
    void (async () => {
      const active = getActiveRemoteBackend(latestSettingsRef.current);
      const token = active.token?.trim() ? active.token.trim() : null;
      if (!token) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText("Remote backend token is required.");
        return;
      }
      const hostError = validateRemoteHost(active.host);
      if (hostError) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText(hostError);
        return;
      }

      setMobileConnectBusy(true);
      setMobileConnectStatusText(null);
      setMobileConnectStatusError(false);
      try {
        const workspaces = await listWorkspaces();
        const workspaceCount = workspaces.length;
        const projectWord = workspaceCount === 1 ? "project" : "projects";
        try {
          await updateActiveRemoteBackend({ lastConnectedAtMs: Date.now() });
        } catch {
          // Keep successful connectivity outcome even if timestamp persistence fails.
        }
        setMobileConnectStatusText(
          `Connected. ${workspaceCount} ${projectWord} reachable on the remote backend.`,
        );
        await onMobileConnectSuccess?.();
      } catch (error) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText(
          error instanceof Error ? error.message : "Unable to connect to remote backend.",
        );
      } finally {
        setMobileConnectBusy(false);
      }
    })();
  };

  useEffect(() => {
    if (!mobilePlatform) {
      return;
    }
    setMobileConnectStatusText(null);
    setMobileConnectStatusError(false);
  }, [mobilePlatform, appSettings.activeRemoteBackendId]);

  const handleRefreshTailscaleStatus = useCallback(() => {
    void (async () => {
      setTailscaleStatusBusy(true);
      setTailscaleStatusError(null);
      try {
        const status = await fetchTailscaleStatus();
        setTailscaleStatus(status);
      } catch (error) {
        setTailscaleStatusError(
          formatErrorMessage(error, "Unable to load Tailscale status."),
        );
      } finally {
        setTailscaleStatusBusy(false);
      }
    })();
  }, []);

  const handleRefreshTailscaleCommandPreview = useCallback(() => {
    void (async () => {
      setTailscaleCommandBusy(true);
      setTailscaleCommandError(null);
      try {
        const preview = await fetchTailscaleDaemonCommandPreview();
        setTailscaleCommandPreview(preview);
      } catch (error) {
        setTailscaleCommandError(
          formatErrorMessage(error, "Unable to build Tailscale daemon command."),
        );
      } finally {
        setTailscaleCommandBusy(false);
      }
    })();
  }, []);

  const handleUseSuggestedTailscaleHost = async () => {
    const suggestedHost = tailscaleStatus?.suggestedRemoteHost ?? null;
    if (!suggestedHost) {
      return;
    }
    const hostError = validateRemoteHost(suggestedHost);
    if (hostError) {
      setRemoteStatus(hostError, true);
      return;
    }
    await updateActiveRemoteBackend({ host: suggestedHost });
    setRemoteStatus(`Active remote host set to ${suggestedHost}.`);
  };

  const runTcpDaemonAction = useCallback(
    async (
      action: "start" | "stop" | "status",
      run: () => Promise<TcpDaemonStatus>,
    ) => {
      setTcpDaemonBusyAction(action);
      try {
        const status = await run();
        setTcpDaemonStatus(status);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unable to update mobile access daemon status.";
        setTcpDaemonStatus((prev) => ({
          state: "error",
          pid: null,
          startedAtMs: null,
          lastError: errorMessage,
          listenAddr: prev?.listenAddr ?? null,
        }));
      } finally {
        setTcpDaemonBusyAction(null);
      }
    },
    [],
  );

  const handleTcpDaemonStart = useCallback(async () => {
    await runTcpDaemonAction("start", tailscaleDaemonStart);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStop = useCallback(async () => {
    await runTcpDaemonAction("stop", tailscaleDaemonStop);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStatus = useCallback(async () => {
    await runTcpDaemonAction("status", tailscaleDaemonStatus);
  }, [runTcpDaemonAction]);

  useEffect(() => {
    if (!mobilePlatform) {
      handleRefreshTailscaleCommandPreview();
      void handleTcpDaemonStatus();
    }
    if (tailscaleStatus === null && !tailscaleStatusBusy && !tailscaleStatusError) {
      handleRefreshTailscaleStatus();
    }
  }, [
    appSettings.remoteBackendToken,
    handleRefreshTailscaleCommandPreview,
    handleRefreshTailscaleStatus,
    handleTcpDaemonStatus,
    mobilePlatform,
    tailscaleStatus,
    tailscaleStatusBusy,
    tailscaleStatusError,
  ]);

  return {
    appSettings,
    onUpdateAppSettings,
    remoteBackends: getConfiguredRemoteBackends(appSettings),
    activeRemoteBackendId:
      appSettings.activeRemoteBackendId ?? getConfiguredRemoteBackends(appSettings)[0]?.id ?? null,
    remoteStatusText,
    remoteStatusError,
    nextRemoteNameSuggestion: buildNextRemoteName(getConfiguredRemoteBackends(appSettings)),
    tailscaleStatus,
    tailscaleStatusBusy,
    tailscaleStatusError,
    tailscaleCommandPreview,
    tailscaleCommandBusy,
    tailscaleCommandError,
    tcpDaemonStatus,
    tcpDaemonBusyAction,
    onSelectRemoteBackend: handleSelectRemoteBackend,
    onAddRemoteBackend: handleAddRemoteBackend,
    onMoveRemoteBackend: handleMoveRemoteBackend,
    onDeleteRemoteBackend: handleDeleteRemoteBackend,
    onUpdateRemoteBackend: handleUpdateRemoteBackend,
    onRefreshTailscaleStatus: handleRefreshTailscaleStatus,
    onRefreshTailscaleCommandPreview: handleRefreshTailscaleCommandPreview,
    onUseSuggestedTailscaleHost: handleUseSuggestedTailscaleHost,
    onTcpDaemonStart: handleTcpDaemonStart,
    onTcpDaemonStop: handleTcpDaemonStop,
    onTcpDaemonStatus: handleTcpDaemonStatus,
    isMobilePlatform: mobilePlatform,
    mobileConnectBusy,
    mobileConnectStatusText,
    mobileConnectStatusError,
    onMobileConnectTest: handleMobileConnectTest,
  };
};
