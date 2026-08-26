// "Missing a trip?" affordance for the Trips screen. Framed around the user's
// data being complete (a premium-quality signal), not "report a bug" (which
// reads as fragility and nobody uses). One tap, one line; the server already
// has the diagnostic dump, so this is all the user has to do. Reports post to
// Discord for the team to triage.
//
// iPad-safe modal: presentationStyle="overFullScreen" + statusBarTranslucent,
// plain TouchableOpacity for the CTA (not an animated button), per the build-60
// iPad hit-testing fix.
import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";
import { reportMissingTrip } from "../lib/api/trips";
import { apiRequest } from "../lib/api/index";
import { getDatabase } from "../lib/db/index";
import { resolveLiveRun, describeElapsed } from "../lib/tracking/liveRecording";

/** Newest trip on the device, by start time. Null when there are none. */
async function newestLocalTrip(): Promise<{
  id: string;
  start_address: string | null;
  end_address: string | null;
  distance_miles: number;
} | null> {
  try {
    const db = await getDatabase();
    return await db.getFirstAsync<{
      id: string;
      start_address: string | null;
      end_address: string | null;
      distance_miles: number;
    }>(
      "SELECT id, start_address, end_address, distance_miles FROM trips ORDER BY started_at DESC LIMIT 1"
    );
  } catch {
    return null;
  }
}

/** Fire-and-forget event log, so the deflection rate is measurable. */
function trackReportEvent(type: string, metadata?: Record<string, unknown>): void {
  apiRequest("/user/event", { method: "POST", body: JSON.stringify({ type, metadata }) }).catch(
    () => {}
  );
}

/** Alert.alert as a promise: resolves with the index of the button pressed. */
function ask(title: string, message: string, buttons: string[]): Promise<number> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((text, i) => ({ text, onPress: () => resolve(i) })),
      { cancelable: false }
    );
  });
}

/**
 * Is a drive recording right now? Decision logic (session gap, staleness) is
 * in lib/tracking/liveRecording so it can be tested; this is the DB read.
 * Returns null when nothing is recording OR the recording looks stuck, so the
 * only reports intercepted are the ones that answer themselves.
 */
async function liveRecording(): Promise<{ startedAt: number; points: number } | null> {
  try {
    const db = await getDatabase();
    const flag = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    if (flag?.value !== "1") return null;

    // Newest first, bounded: enough to find this drive's start without
    // scanning a buffer that can hold days of fixes.
    const rows = await db.getAllAsync<{ recorded_at: string }>(
      "SELECT recorded_at FROM detection_coordinates ORDER BY recorded_at DESC LIMIT 500"
    );
    return resolveLiveRun(
      rows.map((r) => new Date(r.recorded_at).getTime()),
      Date.now()
    );
  } catch {
    return null; // never block a report on a diagnostic read
  }
}

/**
 * Close anything still recording and drain the sync queue, then say whether a
 * trip appeared as a result.
 *
 * A drive that has not finalised yet is indistinguishable from a lost one at
 * the moment the user looks, and the app-open finalize is often what saves it -
 * so a report filed from a screen the user has just opened can be about a trip
 * that is seconds from existing. Archie Cooper's arrived 17 seconds after his
 * report; Dempsey Chimwara's 4.5 minutes after his. Both spent support time on
 * drives that were never missing.
 *
 * Time-boxed, because this now sits in front of a button the user pressed: if
 * the network is slow we accept the report rather than making them wait. Every
 * step is best-effort - a failure here must never block a genuine report.
 */
async function settleBeforeReporting(): Promise<{ landed: Awaited<ReturnType<typeof newestLocalTrip>> }> {
  const before = await newestLocalTrip();
  const work = (async () => {
    try {
      const { finalizeStaleAutoRecordings } = await import("../lib/tracking/detection");
      await finalizeStaleAutoRecordings();
    } catch {
      // Nothing recording, or the finalize threw - either way, carry on.
    }
    try {
      const { processSyncQueue } = await import("../lib/sync/index");
      await processSyncQueue();
    } catch {
      // Offline. The report still goes; the queue drains later.
    }
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, 8000))]);
  const after = await newestLocalTrip();
  const landed = after && after.id !== before?.id ? after : null;
  return { landed };
}

export function MissingTripReporter() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  const close = () => {
    setOpen(false);
  };

  const send = async () => {
    try {
      await reportMissingTrip(note.trim());
      setOpen(false);
      setNote("");
      Alert.alert(
        "Thanks - got it",
        "We'll check what happened and make sure your trips are captured."
      );
    } catch {
      Alert.alert("Couldn't send", "Please try again in a moment - your note is still here.");
    }
  };

  const submit = async () => {
    Keyboard.dismiss();
    setSending(true);
    setChecking(true);
    try {
      // A drive in progress explains the report on its own, and finalising it
      // would truncate a journey the user is still making — so we ask rather
      // than act. Checked first: it is a local read, and it answers instantly
      // where the settle below can take up to eight seconds.
      const live = await liveRecording();
      if (live) {
        const elapsedMs = Date.now() - live.startedAt;
        const forHowLong = describeElapsed(elapsedMs);
        setChecking(false);
        const choice = await ask(
          "That drive is recording now",
          `MileClear has been recording for ${forHowLong} and saves this trip when you arrive - it can't appear in your list until it ends.\n\nIs that the trip you're missing?`,
          ["That's the one, thanks", "No, a different trip"]
        );
        trackReportEvent("trip.report_live_recording_prompt", {
          minutes: Math.round(elapsedMs / 60000),
          points: live.points,
          outcome: choice === 0 ? "deflected" : "reported_anyway",
        });
        if (choice === 0) {
          setOpen(false);
          setNote("");
          return;
        }
        setChecking(true);
      }

      const { landed } = await settleBeforeReporting();
      setChecking(false);

      if (landed) {
        const where =
          landed.start_address && landed.end_address
            ? `${landed.start_address} to ${landed.end_address}`
            : landed.start_address || landed.end_address || "a new trip";
        const miles = landed.distance_miles ? ` (${landed.distance_miles.toFixed(1)} mi)` : "";
        Alert.alert(
          "A trip just finished saving",
          `${where}${miles}.\n\nIs that the one you were missing?`,
          [
            {
              text: "No, still missing",
              style: "destructive",
              onPress: () => {
                void send();
              },
            },
            {
              text: "Yes, that's it",
              onPress: () => {
                setOpen(false);
                setNote("");
              },
            },
          ]
        );
        return;
      }

      await send();
    } finally {
      setChecking(false);
      setSending(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.link}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Missing a trip you made? Tap to tell us."
      >
        <Ionicons name="help-circle-outline" size={16} color={colors.text2} />
        <Text style={styles.linkText}>Missing a trip you made?</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.text3} style={styles.linkChevron} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Missing a trip?</Text>
            <Text style={styles.sub}>
              Tell us roughly when you drove and where from and to. We&apos;ll check what happened
              and make sure it&apos;s captured.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. around 9am, home to Tesco on the high street"
              placeholderTextColor={colors.text3}
              value={note}
              onChangeText={setNote}
              multiline
              autoFocus
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.send, (sending || !note.trim()) && styles.sendDisabled]}
              onPress={submit}
              disabled={sending || !note.trim()}
              activeOpacity={0.85}
            >
              {sending ? (
                <View style={styles.sendBusy}>
                  <ActivityIndicator color={colors.bg} />
                  {checking && <Text style={styles.sendBusyText}>Checking your trips</Text>}
                </View>
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={close} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  linkText: {
    color: colors.text2,
    fontFamily: fonts.medium,
    fontSize: 13.5,
  },
  linkChevron: {
    marginLeft: "auto",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  title: {
    color: colors.text1,
    fontFamily: fonts.bold,
    fontSize: 20,
  },
  sub: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  input: {
    marginTop: 16,
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.bg,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 15,
    padding: 14,
    textAlignVertical: "top",
  },
  send: {
    marginTop: 16,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendBusy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sendBusyText: {
    color: colors.bg,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  sendText: {
    color: colors.bg,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  cancel: {
    marginTop: 4,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: colors.text2,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
});
