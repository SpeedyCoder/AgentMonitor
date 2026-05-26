import type { AppSettings, DictationModelStatus } from "@/types";
import { SelectMenu } from "@/features/design-system/components/popover/PopoverPrimitives";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatDownloadSize } from "@utils/formatting";

type DictationModelOption = {
  id: string;
  label: string;
  size: string;
  note: string;
};

type SettingsDictationSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  metaKeyLabel: string;
  dictationModels: DictationModelOption[];
  selectedDictationModel: DictationModelOption;
  dictationModelStatus?: DictationModelStatus | null;
  dictationReady: boolean;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
};

export function SettingsDictationSection({
  appSettings,
  optionKeyLabel,
  metaKeyLabel,
  dictationModels,
  selectedDictationModel,
  dictationModelStatus,
  dictationReady,
  onUpdateAppSettings,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
}: SettingsDictationSectionProps) {
  const dictationProgress = dictationModelStatus?.progress ?? null;

  return (
    <SettingsSection
      title="Dictation"
      subtitle="Enable microphone dictation with on-device transcription."
    >
      <SettingsToggleRow
        title="Enable dictation"
        subtitle="Downloads the selected Whisper model on first use."
      >
        <SettingsToggleSwitch
          pressed={appSettings.dictationEnabled}
          onClick={() => {
            const nextEnabled = !appSettings.dictationEnabled;
            void onUpdateAppSettings({
              ...appSettings,
              dictationEnabled: nextEnabled,
            });
            if (
              !nextEnabled &&
              dictationModelStatus?.state === "downloading" &&
              onCancelDictationDownload
            ) {
              onCancelDictationDownload();
            }
            if (
              nextEnabled &&
              dictationModelStatus?.state === "missing" &&
              onDownloadDictationModel
            ) {
              onDownloadDictationModel();
            }
          }}
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-model">
          Dictation model
        </label>
        <SelectMenu<string>
          id="dictation-model"
          value={appSettings.dictationModelId}
          onChange={(value) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationModelId: value,
            })
          }
          options={dictationModels.map((model) => ({
            value: model.id,
            label: `${model.label} (${model.size})`,
          }))}
          ariaLabel="Dictation model"
          fullWidth
        />
        <div className="settings-help">
          {selectedDictationModel.note} Download size: {selectedDictationModel.size}.
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-language">
          Preferred dictation language
        </label>
        <SelectMenu<string>
          id="dictation-language"
          value={appSettings.dictationPreferredLanguage ?? ""}
          onChange={(value) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationPreferredLanguage: value || null,
            })
          }
          options={[
            { value: "", label: "Auto-detect only" },
            { value: "en", label: "English" },
            { value: "es", label: "Spanish" },
            { value: "fr", label: "French" },
            { value: "de", label: "German" },
            { value: "it", label: "Italian" },
            { value: "pt", label: "Portuguese" },
            { value: "nl", label: "Dutch" },
            { value: "sv", label: "Swedish" },
            { value: "no", label: "Norwegian" },
            { value: "da", label: "Danish" },
            { value: "fi", label: "Finnish" },
            { value: "pl", label: "Polish" },
            { value: "tr", label: "Turkish" },
            { value: "ru", label: "Russian" },
            { value: "uk", label: "Ukrainian" },
            { value: "ja", label: "Japanese" },
            { value: "ko", label: "Korean" },
            { value: "zh", label: "Chinese" },
          ]}
          ariaLabel="Preferred dictation language"
          fullWidth
        />
        <div className="settings-help">
          Auto-detect stays on; this nudges the decoder toward your preference.
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-hold-key">
          Hold-to-dictate key
        </label>
        <SelectMenu<string>
          id="dictation-hold-key"
          value={appSettings.dictationHoldKey ?? ""}
          onChange={(value) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationHoldKey: value,
            })
          }
          options={[
            { value: "", label: "Off" },
            { value: "alt", label: optionKeyLabel },
            { value: "shift", label: "Shift" },
            { value: "control", label: "Control" },
            { value: "meta", label: metaKeyLabel },
          ]}
          ariaLabel="Hold-to-dictate key"
          fullWidth
        />
        <div className="settings-help">
          Hold the key to start dictation, release to stop and process.
        </div>
      </div>
      {dictationModelStatus && (
        <div className="settings-field">
          <div className="settings-field-label">Model status ({selectedDictationModel.label})</div>
          <div className="settings-help">
            {dictationModelStatus.state === "ready" && "Ready for dictation."}
            {dictationModelStatus.state === "missing" && "Model not downloaded yet."}
            {dictationModelStatus.state === "downloading" && "Downloading model..."}
            {dictationModelStatus.state === "error" &&
              (dictationModelStatus.error ?? "Download error.")}
          </div>
          {dictationProgress && (
            <div className="settings-download-progress">
              <div className="settings-download-bar">
                <div
                  className="settings-download-fill"
                  style={{
                    width: dictationProgress.totalBytes
                      ? `${Math.min(
                          100,
                          (dictationProgress.downloadedBytes / dictationProgress.totalBytes) * 100,
                        )}%`
                      : "0%",
                  }}
                />
              </div>
              <div className="settings-download-meta">
                {formatDownloadSize(dictationProgress.downloadedBytes)}
              </div>
            </div>
          )}
          <div className="settings-field-actions">
            {dictationModelStatus.state === "missing" && (
              <button
                type="button"
                className="primary"
                onClick={onDownloadDictationModel}
                disabled={!onDownloadDictationModel}
              >
                Download model
              </button>
            )}
            {dictationModelStatus.state === "downloading" && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onCancelDictationDownload}
                disabled={!onCancelDictationDownload}
              >
                Cancel download
              </button>
            )}
            {dictationReady && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onRemoveDictationModel}
                disabled={!onRemoveDictationModel}
              >
                Remove model
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
