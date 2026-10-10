// Home's status line plus the sheets it opens, as one hook so the idle Home
// and the active-shift screen can both show it from the same place.
//
// const { status, element } = useHomeStatus({ ... });
// Render `element` where the status line goes; `status.red` tells the ask slot
// to stand down.

import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Linking, Platform, Text, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { StatusLine } from "./StatusLine";
import { RecordingSheet } from "./RecordingSheet";
import { HomeSheet } from "./HomeSheet";
import { SetupChecklistCard, type SetupChecklistRow } from "../SetupChecklistCard";
import { useFailedSyncCount, useRecordingNow } from "./useHomeSignals";
import { selectStatusLine, type StatusLine as StatusLineModel } from "../../lib/home/statusLine";
import { trackHomeTap } from "../../lib/home/trackHomeTap";
import type { BlockerId } from "../../lib/dashboardMessages";
import type { PauseChoice } from "../../lib/tracking/pauseRule";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

interface Args {
  mode: "work" | "personal";
  blocker: BlockerId | null;
  setup: { done: number; total: number; rows: SetupChecklistRow[] } | null;
  lowPowerMode: boolean;
  pausedUntil: number | null;
  /** The permanent Automatic trips switch is off. */
  automaticOff: boolean;
  recovered: { trips: number; miles: number } | null;
  onFixLocation: () => void;
  onPause: (choice: PauseChoice) => void;
  onResume: () => void;
  /** Told after the Automatic trips switch changes. */
  onAutomaticChange: (on: boolean) => void;
  onShowExplainer: () => void;
  onSnoozeSetup: () => void;
  /** The "we recovered" note was tapped: mark it seen. */
  onRecoveredTap: () => void;
}

type Sheet = "recording" | "setup" | "low_power" | null;

export function useHomeStatus(a: Args): { status: StatusLineModel; element: ReactElement } {
  const router = useRouter();
  const recording = useRecordingNow();
  const failedSyncCount = useFailedSyncCount();
  const [sheet, setSheet] = useState<Sheet>(null);

  const now = Date.now();
  const status = useMemo(
    () =>
      selectStatusLine({
        recording,
        blocker: a.blocker,
        failedSyncCount,
        pausedUntil: a.pausedUntil,
        now,
        automaticOff: a.automaticOff,
        lowPowerMode: a.lowPowerMode,
        platform: Platform.OS === "ios" ? "ios" : "android",
        setup: a.setup ? { done: a.setup.done, total: a.setup.total } : null,
        recovered: a.recovered,
      }),
    // `now` is read once per render on purpose: a pause ending is picked up on the next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recording, a.blocker, failedSyncCount, a.pausedUntil, a.automaticOff, a.lowPowerMode, a.setup, a.recovered, Math.floor(now / 60000)]
  );

  const onPress = useCallback(() => {
    trackHomeTap("status_line", a.mode, status.kind);
    switch (status.tap) {
      case "live_trip":
        router.push((recording?.mode === "quick" ? "/trip-form" : "/active-recording") as never);
        break;
      case "fix":
        if (a.blocker === "bg_refresh_off") Linking.openSettings().catch(() => {});
        else a.onFixLocation();
        break;
      case "sync_status":
        router.push("/sync-status" as never);
        break;
      case "recording_sheet":
        setSheet("recording");
        break;
      case "low_power_sheet":
        setSheet("low_power");
        break;
      case "setup_sheet":
        setSheet("setup");
        break;
      case "trips":
        a.onRecoveredTap();
        router.push("/(tabs)/trips" as never);
        break;
    }
  }, [status.kind, status.tap, a, router, recording?.mode]);

  const onAction = useCallback(() => {
    trackHomeTap("status_action", a.mode, status.kind);
    if (status.kind === "paused") a.onResume();
  }, [a, status.kind]);

  const closeSheet = useCallback(() => setSheet(null), []);

  const element = (
    <>
      <StatusLine model={status} onPress={onPress} onAction={onAction} />
      <RecordingSheet
        visible={sheet === "recording"}
        onClose={closeSheet}
        pausedUntil={a.pausedUntil}
        onPause={a.onPause}
        onResume={a.onResume}
        onAutomaticChange={a.onAutomaticChange}
        onExplainer={() => {
          setSheet(null);
          // One modal at a time: let the sheet finish closing first.
          setTimeout(a.onShowExplainer, 450);
        }}
      />
      <HomeSheet visible={sheet === "setup" && !!a.setup} title="Finish setting up" onClose={closeSheet}>
        {a.setup ? (
          <SetupChecklistCard
            rows={a.setup.rows}
            done={a.setup.done}
            total={a.setup.total}
            onSnooze={() => {
              a.onSnoozeSetup();
              setSheet(null);
            }}
          />
        ) : null}
      </HomeSheet>
      <HomeSheet
        visible={sheet === "low_power"}
        title={Platform.OS === "ios" ? "Low Power Mode is on" : "Battery Saver is on"}
        onClose={closeSheet}
      >
        <View style={s.body}>
          <Text style={s.text} maxFontSizeMultiplier={fontScaleCap.body}>
            {Platform.OS === "ios"
              ? "Your iPhone limits background location in Low Power Mode, so drives may not record. Turn it off while you're driving."
              : "Battery Saver can stop MileClear recording drives in the background. Turn it off while you're driving."}
          </Text>
        </View>
      </HomeSheet>
    </>
  );

  return { status, element };
}

const s = StyleSheet.create({
  body: { paddingBottom: 8 },
  text: { fontSize: 15, fontFamily: fonts.regular, color: colors.text1, lineHeight: 22 },
});
