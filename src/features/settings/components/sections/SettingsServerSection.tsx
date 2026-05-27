import { useEffect, useMemo, useState } from "react";
import X from "lucide-react/dist/esm/icons/x";
import type {
  AppSettings,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TcpDaemonStatus,
} from "@/types";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type AddRemoteBackendDraft = {
  name: string;
  host: string;
  token: string;
};

type SettingsServerSectionProps = {
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

type RemoteBackendEntry = SettingsServerSectionProps["remoteBackends"][number];

type SavedRemoteRowProps = {
  entry: RemoteBackendEntry;
  index: number;
  total: number;
  isActive: boolean;
  onSelect: (id: string) => Promise<void>;
  onMove: (id: string, direction: "up" | "down") => Promise<void>;
  onDelete: (id: string) => void;
  onUpdate: SettingsServerSectionProps["onUpdateRemoteBackend"];
};

function SavedRemoteRow({
  entry,
  index,
  total,
  isActive,
  onSelect,
  onMove,
  onDelete,
  onUpdate,
}: SavedRemoteRowProps) {
  const [nameDraft, setNameDraft] = useState(entry.name);
  const [hostDraft, setHostDraft] = useState(entry.host);
  const [tokenDraft, setTokenDraft] = useState(entry.token ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(entry.name);
  }, [entry.name]);
  useEffect(() => {
    setHostDraft(entry.host);
  }, [entry.host]);
  useEffect(() => {
    setTokenDraft(entry.token ?? "");
  }, [entry.token]);

  const commitName = async () => {
    if (nameDraft.trim() === entry.name) {
      setError(null);
      return;
    }
    const result = await onUpdate(entry.id, { name: nameDraft });
    if (!result.ok) {
      setError(result.error ?? "Unable to update name.");
      setNameDraft(entry.name);
    } else {
      setError(null);
    }
  };
  const commitHost = async () => {
    if (hostDraft.trim() === entry.host) {
      setError(null);
      return;
    }
    const result = await onUpdate(entry.id, { host: hostDraft });
    if (!result.ok) {
      setError(result.error ?? "Unable to update host.");
      setHostDraft(entry.host);
    } else {
      setError(null);
    }
  };
  const commitToken = async () => {
    const trimmed = tokenDraft.trim();
    if (trimmed === (entry.token ?? "")) {
      setError(null);
      return;
    }
    const result = await onUpdate(entry.id, { token: trimmed });
    if (!result.ok) {
      setError(result.error ?? "Unable to update token.");
      setTokenDraft(entry.token ?? "");
    } else {
      setError(null);
    }
  };

  return (
    <div
      className={`settings-mobile-remote${isActive ? " is-active" : ""}`}
      role="listitem"
      key={entry.id}
    >
      <div className="settings-mobile-remote-main">
        <div className="settings-mobile-remote-name-row">
          <input
            className="settings-input settings-input--compact"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => {
              void commitName();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitName();
              }
            }}
            aria-label={`Remote name for ${entry.name}`}
          />
          {isActive && <span className="settings-mobile-remote-badge">Active</span>}
        </div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--compact"
            value={hostDraft}
            placeholder="127.0.0.1:4732"
            onChange={(event) => setHostDraft(event.target.value)}
            onBlur={() => {
              void commitHost();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitHost();
              }
            }}
            aria-label={`Host for ${entry.name}`}
          />
          <input
            type="password"
            className="settings-input settings-input--compact"
            value={tokenDraft}
            placeholder="Token"
            onChange={(event) => setTokenDraft(event.target.value)}
            onBlur={() => {
              void commitToken();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitToken();
              }
            }}
            aria-label={`Token for ${entry.name}`}
          />
        </div>
        <div className="settings-mobile-remote-last">
          Last connected:{" "}
          {typeof entry.lastConnectedAtMs === "number"
            ? new Date(entry.lastConnectedAtMs).toLocaleString()
            : "Never"}
        </div>
        {error && <div className="settings-help settings-help-error">{error}</div>}
      </div>
      <div className="settings-mobile-remote-actions">
        <button
          type="button"
          className="ghost settings-mobile-remote-action"
          onClick={() => {
            void onSelect(entry.id);
          }}
          disabled={isActive}
          aria-label={`Use ${entry.name} remote`}
        >
          {isActive ? "Using" : "Use"}
        </button>
        <button
          type="button"
          className="ghost settings-mobile-remote-action"
          onClick={() => {
            void onMove(entry.id, "up");
          }}
          disabled={index === 0}
          aria-label={`Move ${entry.name} up`}
        >
          ↑
        </button>
        <button
          type="button"
          className="ghost settings-mobile-remote-action"
          onClick={() => {
            void onMove(entry.id, "down");
          }}
          disabled={index === total - 1}
          aria-label={`Move ${entry.name} down`}
        >
          ↓
        </button>
        <button
          type="button"
          className="ghost settings-mobile-remote-action settings-mobile-remote-action-danger"
          onClick={() => {
            onDelete(entry.id);
          }}
          aria-label={`Delete ${entry.name}`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function SettingsServerSection({
  appSettings,
  onUpdateAppSettings,
  isMobilePlatform,
  mobileConnectBusy,
  mobileConnectStatusText,
  mobileConnectStatusError,
  remoteBackends,
  activeRemoteBackendId,
  remoteStatusText,
  remoteStatusError,
  nextRemoteNameSuggestion,
  tailscaleStatus,
  tailscaleStatusBusy,
  tailscaleStatusError,
  tailscaleCommandPreview,
  tailscaleCommandBusy,
  tailscaleCommandError,
  tcpDaemonStatus,
  tcpDaemonBusyAction,
  onSelectRemoteBackend,
  onAddRemoteBackend,
  onMoveRemoteBackend,
  onDeleteRemoteBackend,
  onUpdateRemoteBackend,
  onRefreshTailscaleStatus,
  onRefreshTailscaleCommandPreview,
  onUseSuggestedTailscaleHost,
  onTcpDaemonStart,
  onTcpDaemonStop,
  onTcpDaemonStatus,
  onMobileConnectTest,
}: SettingsServerSectionProps) {
  const [pendingDeleteRemoteId, setPendingDeleteRemoteId] = useState<string | null>(
    null,
  );
  const [addRemoteOpen, setAddRemoteOpen] = useState(false);
  const [addRemoteBusy, setAddRemoteBusy] = useState(false);
  const [addRemoteError, setAddRemoteError] = useState<string | null>(null);
  const [addRemoteNameDraft, setAddRemoteNameDraft] = useState("");
  const [addRemoteHostDraft, setAddRemoteHostDraft] = useState("");
  const [addRemoteTokenDraft, setAddRemoteTokenDraft] = useState("");
  const isMobileSimplified = isMobilePlatform;
  const pendingDeleteRemote = useMemo(
    () =>
      pendingDeleteRemoteId == null
        ? null
        : remoteBackends.find((entry) => entry.id === pendingDeleteRemoteId) ?? null,
    [pendingDeleteRemoteId, remoteBackends],
  );
  const tcpRunnerStatusText = (() => {
    if (!tcpDaemonStatus) {
      return null;
    }
    if (tcpDaemonStatus.state === "running") {
      return tcpDaemonStatus.pid
        ? `Mobile daemon is running (pid ${tcpDaemonStatus.pid}) on ${tcpDaemonStatus.listenAddr ?? "configured listen address"}.`
        : `Mobile daemon is running on ${tcpDaemonStatus.listenAddr ?? "configured listen address"}.`;
    }
    if (tcpDaemonStatus.state === "error") {
      return tcpDaemonStatus.lastError ?? "Mobile daemon is in an error state.";
    }
    return `Mobile daemon is stopped${tcpDaemonStatus.listenAddr ? ` (${tcpDaemonStatus.listenAddr})` : ""}.`;
  })();

  const openAddRemoteModal = () => {
    const suggestedHost =
      remoteBackends.find((entry) => entry.id === activeRemoteBackendId)?.host ??
      remoteBackends[0]?.host ??
      "";
    setAddRemoteError(null);
    setAddRemoteNameDraft(nextRemoteNameSuggestion);
    setAddRemoteHostDraft(suggestedHost);
    setAddRemoteTokenDraft("");
    setAddRemoteOpen(true);
  };

  const closeAddRemoteModal = () => {
    if (addRemoteBusy) {
      return;
    }
    setAddRemoteOpen(false);
    setAddRemoteError(null);
  };

  const handleAddRemoteConfirm = () => {
    void (async () => {
      if (addRemoteBusy) {
        return;
      }
      setAddRemoteBusy(true);
      setAddRemoteError(null);
      try {
        await onAddRemoteBackend({
          name: addRemoteNameDraft,
          host: addRemoteHostDraft,
          token: addRemoteTokenDraft,
        });
        setAddRemoteOpen(false);
      } catch (error) {
        setAddRemoteError(error instanceof Error ? error.message : "Unable to add remote.");
      } finally {
        setAddRemoteBusy(false);
      }
    })();
  };

  return (
    <SettingsSection
      title="Server"
      subtitle={
        isMobileSimplified
          ? "Configure TCP host/token from your desktop setup, then run a connection test."
          : "Manage saved remote backends. Pick the active backend from the sidebar Local/Remote selector."
      }
    >

      <>
        <div className="settings-field">
          <div className="settings-field-label">Saved remotes</div>
          <div className="settings-mobile-remotes" role="list" aria-label="Saved remotes">
            {remoteBackends.map((entry, index) => (
              <SavedRemoteRow
                key={entry.id}
                entry={entry}
                index={index}
                total={remoteBackends.length}
                isActive={entry.id === activeRemoteBackendId}
                onSelect={onSelectRemoteBackend}
                onMove={onMoveRemoteBackend}
                onDelete={setPendingDeleteRemoteId}
                onUpdate={onUpdateRemoteBackend}
              />
            ))}
          </div>
          <div className="settings-field-row">
            <button
              type="button"
              className="button settings-button-compact"
              onClick={openAddRemoteModal}
            >
              Add remote
            </button>
          </div>
          {remoteStatusText && (
            <div className={`settings-help${remoteStatusError ? " settings-help-error" : ""}`}>
              {remoteStatusText}
            </div>
          )}
          <div className="settings-help">
            Switching the active remote reloads the app.
          </div>
        </div>

        {!isMobileSimplified && (
          <SettingsToggleRow
            title="Keep daemon running after app closes"
            subtitle="If disabled, Trantor stops managed TCP daemon processes before exit."
          >
            <SettingsToggleSwitch
              pressed={appSettings.keepDaemonRunningAfterAppClose}
              onClick={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  keepDaemonRunningAfterAppClose: !appSettings.keepDaemonRunningAfterAppClose,
                })
              }
            />
          </SettingsToggleRow>
        )}

        {isMobileSimplified && (
          <div className="settings-field">
            <div className="settings-field-label">Connection test</div>
            <div className="settings-field-row">
              <button
                type="button"
                className="button settings-button-compact"
                onClick={onMobileConnectTest}
                disabled={mobileConnectBusy}
              >
                {mobileConnectBusy ? "Connecting..." : "Connect & test"}
              </button>
            </div>
            {mobileConnectStatusText && (
              <div className={`settings-help${mobileConnectStatusError ? " settings-help-error" : ""}`}>
                {mobileConnectStatusText}
              </div>
            )}
            <div className="settings-help">
              Make sure your desktop app daemon is running and reachable on Tailscale, then retry
              this test.
            </div>
          </div>
        )}

        {!isMobileSimplified && (
          <div className="settings-field">
            <div className="settings-field-label">Mobile access daemon</div>
            <div className="settings-field-row">
              <button
                type="button"
                className="button settings-button-compact"
                onClick={() => {
                  void onTcpDaemonStart();
                }}
                disabled={tcpDaemonBusyAction !== null}
              >
                {tcpDaemonBusyAction === "start" ? "Starting..." : "Start daemon"}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                onClick={() => {
                  void onTcpDaemonStop();
                }}
                disabled={tcpDaemonBusyAction !== null}
              >
                {tcpDaemonBusyAction === "stop" ? "Stopping..." : "Stop daemon"}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                onClick={() => {
                  void onTcpDaemonStatus();
                }}
                disabled={tcpDaemonBusyAction !== null}
              >
                {tcpDaemonBusyAction === "status" ? "Refreshing..." : "Refresh status"}
              </button>
            </div>
            {tcpRunnerStatusText && <div className="settings-help">{tcpRunnerStatusText}</div>}
            {tcpDaemonStatus?.startedAtMs && (
              <div className="settings-help">
                Started at: {new Date(tcpDaemonStatus.startedAtMs).toLocaleString()}
              </div>
            )}
            <div className="settings-help">
              Start this daemon before connecting from iOS. It uses your current token and listens
              on <code>0.0.0.0:&lt;port&gt;</code>, matching your configured host port.
            </div>
          </div>
        )}

        {!isMobileSimplified && (
          <div className="settings-field">
            <div className="settings-field-label">Tailscale helper</div>
            <div className="settings-field-row">
              <button
                type="button"
                className="button settings-button-compact"
                onClick={onRefreshTailscaleStatus}
                disabled={tailscaleStatusBusy}
              >
                {tailscaleStatusBusy ? "Checking..." : "Detect Tailscale"}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                onClick={onRefreshTailscaleCommandPreview}
                disabled={tailscaleCommandBusy}
              >
                {tailscaleCommandBusy ? "Refreshing..." : "Refresh daemon command"}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                disabled={!tailscaleStatus?.suggestedRemoteHost}
                onClick={() => {
                  void onUseSuggestedTailscaleHost();
                }}
              >
                Use suggested host
              </button>
            </div>
            {tailscaleStatusError && (
              <div className="settings-help settings-help-error">{tailscaleStatusError}</div>
            )}
            {tailscaleStatus && (
              <>
                <div className="settings-help">{tailscaleStatus.message}</div>
                <div className="settings-help">
                  {tailscaleStatus.installed
                    ? `Version: ${tailscaleStatus.version ?? "unknown"}`
                    : "Install Tailscale on both desktop and iOS to continue."}
                </div>
                {tailscaleStatus.suggestedRemoteHost && (
                  <div className="settings-help">
                    Suggested remote host: <code>{tailscaleStatus.suggestedRemoteHost}</code>
                  </div>
                )}
                {tailscaleStatus.tailnetName && (
                  <div className="settings-help">
                    Tailnet: <code>{tailscaleStatus.tailnetName}</code>
                  </div>
                )}
              </>
            )}
            {tailscaleCommandError && (
              <div className="settings-help settings-help-error">{tailscaleCommandError}</div>
            )}
            {tailscaleCommandPreview && (
              <>
                <div className="settings-help">
                  Command template (manual fallback) for starting the daemon:
                </div>
                <pre className="settings-command-preview">
                  <code>{tailscaleCommandPreview.command}</code>
                </pre>
                {!tailscaleCommandPreview.tokenConfigured && (
                  <div className="settings-help settings-help-error">
                    Remote backend token is empty. Set one before exposing daemon access.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </>

      <div className="settings-help">
        {isMobileSimplified
          ? "Use your own infrastructure only. On iOS, get the Tailscale hostname and token from your desktop Trantor setup."
          : "Mobile access should stay scoped to your own infrastructure (tailnet). Trantor does not provide hosted backend services."}
      </div>
      {addRemoteOpen && (
        <ModalShell
          className="settings-add-remote-overlay"
          cardClassName="settings-add-remote-card"
          onBackdropClick={closeAddRemoteModal}
          ariaLabel="Add remote"
        >
          <div className="settings-add-remote-header">
            <div className="settings-add-remote-title">Add remote</div>
            <button
              type="button"
              className="ghost icon-button settings-add-remote-close"
              onClick={closeAddRemoteModal}
              aria-label="Close add remote modal"
              disabled={addRemoteBusy}
            >
              <X aria-hidden />
            </button>
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-name">
              New remote name
            </label>
            <input
              id="settings-add-remote-name"
              className="settings-input settings-input--compact"
              value={addRemoteNameDraft}
              onChange={(event) => setAddRemoteNameDraft(event.target.value)}
              disabled={addRemoteBusy}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-host">
              New remote host
            </label>
            <input
              id="settings-add-remote-host"
              className="settings-input settings-input--compact"
              value={addRemoteHostDraft}
              placeholder="macbook.your-tailnet.ts.net:4732"
              onChange={(event) => setAddRemoteHostDraft(event.target.value)}
              disabled={addRemoteBusy}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-token">
              New remote token
            </label>
            <input
              id="settings-add-remote-token"
              type="password"
              className="settings-input settings-input--compact"
              value={addRemoteTokenDraft}
              placeholder="Token"
              onChange={(event) => setAddRemoteTokenDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddRemoteConfirm();
                }
              }}
              disabled={addRemoteBusy}
            />
          </div>
          {addRemoteError && <div className="settings-help settings-help-error">{addRemoteError}</div>}
          <div className="settings-add-remote-actions">
            <button type="button" className="ghost" onClick={closeAddRemoteModal} disabled={addRemoteBusy}>
              Cancel
            </button>
            <button
              type="button"
              className="button"
              onClick={handleAddRemoteConfirm}
              disabled={addRemoteBusy}
            >
              {addRemoteBusy ? "Connecting..." : "Connect & add"}
            </button>
          </div>
        </ModalShell>
      )}
      {pendingDeleteRemote && (
        <ModalShell
          className="settings-delete-remote-overlay"
          cardClassName="settings-delete-remote-card"
          onBackdropClick={() => setPendingDeleteRemoteId(null)}
          ariaLabel="Delete remote confirmation"
        >
          <div className="settings-delete-remote-title">Delete remote?</div>
          <div className="settings-delete-remote-message">
            Remove <strong>{pendingDeleteRemote.name}</strong> from saved remotes? This only
            removes the profile from this device.
          </div>
          <div className="settings-delete-remote-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setPendingDeleteRemoteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                void onDeleteRemoteBackend(pendingDeleteRemote.id);
                setPendingDeleteRemoteId(null);
              }}
            >
              Delete remote
            </button>
          </div>
        </ModalShell>
      )}
    </SettingsSection>
  );
}
