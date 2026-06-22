import { useCallback } from "react";
import { Alert } from "react-native";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import { useAppLock } from "../../lib/appLock/context";

const RELOCK_OPTIONS = [
  { label: "Immediately", ms: 0 },
  { label: "After 1 minute", ms: 60_000 },
  { label: "After 5 minutes", ms: 5 * 60_000 },
];

/**
 * Security settings: an optional Face ID / Touch ID / passcode lock on the app.
 * Enabling prompts for auth first (proving the user can get back in), so they
 * can't lock themselves out. The native tracking engine keeps running while the
 * app is locked — the lock only covers the UI.
 */
export default function SecuritySettings() {
  const { isLockRequired, available, lockType, setEnabled, setRequireAfterMs, config } = useAppLock();

  const method = lockType === "face" ? "Face ID" : lockType === "fingerprint" ? "Touch ID" : "passcode";

  const onToggle = useCallback(
    async (next: boolean) => {
      const ok = await setEnabled(next);
      if (next && !ok) {
        Alert.alert(
          available ? "Couldn't turn on app lock" : "Not available yet",
          available
            ? "Authentication was cancelled or didn't succeed. Try again."
            : "Set up Face ID, Touch ID, or a device passcode in your iOS Settings first, then come back."
        );
      }
    },
    [setEnabled, available]
  );

  const pickRelock = useCallback(() => {
    Alert.alert("Re-lock when away", "Lock the app after it's been in the background for…", [
      ...RELOCK_OPTIONS.map((o) => ({
        text: o.label,
        onPress: () => void setRequireAfterMs(o.ms),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }, [setRequireAfterMs]);

  const relockLabel =
    RELOCK_OPTIONS.find((o) => o.ms === config.requireAfterMs)?.label ?? "Immediately";

  return (
    <SettingsScreen>
      <SettingsGroup title="APP LOCK">
        <ToggleRow
          icon="lock-closed-outline"
          label={`Require ${available ? method : "Face ID / passcode"} to open`}
          hint={
            available
              ? "Lock MileClear whenever you leave it. Trip tracking keeps running while locked."
              : "Set up Face ID, Touch ID, or a passcode in iOS Settings to use this."
          }
          value={isLockRequired}
          onToggle={onToggle}
          disabled={!available && !isLockRequired}
        />
        {isLockRequired && (
          <SettingsRow
            icon="time-outline"
            label="Re-lock"
            hint={relockLabel}
            onPress={pickRelock}
          />
        )}
      </SettingsGroup>
    </SettingsScreen>
  );
}
