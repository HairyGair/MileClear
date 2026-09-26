// "Missing a trip?" affordance for the Trips screen. Framed around the user's
// data being complete (a premium-quality signal), not "report a bug" (which
// reads as fragility and nobody uses). The server already has the diagnostic
// dump; the report adds what the driver knows. Reports post to Discord for the
// team to triage.
//
// 26 Sep 2026: the report asks for the journey in fields (from, to, when) and
// then offers to add the trip there and then. Some drivers never add trips
// themselves and wait for support to do it (one filed the same drive three
// times in two days), so the report now ends with the trip in their list. The
// `trip.report_missing` event is still logged first, with the same
// human-readable note support reads, because support still diagnoses why the
// drive was missed. A pause the driver set is named on the sheet itself, with
// a Resume button, since that answers the report before anyone has to look.
//
// iPad-safe modal: presentationStyle="overFullScreen" + statusBarTranslucent,
// plain TouchableOpacity for the CTAs (not an animated button), per the
// build-60 iPad hit-testing fix.
import { useEffect, useMemo, useState } from "react";
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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";
import { reportMissingTrip, fetchServerRouteDistance, type CreateTripData } from "../lib/api/trips";
import { DateTimePickerField } from "./DateTimePickerField";
import { LocationPickerField } from "./LocationPickerField";
import { apiRequest } from "../lib/api/index";
import { getDatabase } from "../lib/db/index";
import { resolveLiveRun, describeElapsed } from "../lib/tracking/liveRecording";
import { describePause, shortDay } from "../lib/tracking/pauseRule";
import { clockTime } from "../lib/trips/manualTimeRule";
import {
  canSendReport,
  describeReportNote,
  endTimeFor,
  findOverlappingTrip,
  parseMilesInput,
  pauseIntervals,
  pauseNotice,
  placeLabel,
  type LocalTripRow,
  type PauseEventRow,
  type PauseInterval,
} from "../lib/trips/missingReportRule";
import { haptic } from "../lib/haptics";

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

/**
 * The user's LOCAL calendar day as "YYYY-MM-DD". Not toISOString(), which
 * gives the UTC day and is yesterday for a late-evening pick in summer.
 */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/** The running pause plus the pause history the phone still holds. Never
 *  throws: a failed read means "say nothing about a pause". */
async function readPauseState(): Promise<{ activeUntil: number | null; intervals: PauseInterval[] }> {
  try {
    const { getDrivePauseUntil } = await import("../lib/tracking/detection");
    const activeUntil = await getDrivePauseUntil().catch(() => null);
    const db = await getDatabase();
    const rows = await db.getAllAsync<PauseEventRow>(
      `SELECT recorded_at, event, data FROM detection_events
       WHERE event IN ('drive_paused', 'drive_resumed')
       ORDER BY id DESC LIMIT 60`
    );
    return { activeUntil, intervals: pauseIntervals(rows, activeUntil) };
  } catch {
    return { activeUntil: null, intervals: [] };
  }
}

/** Saved trips near a time window, for the "already have a trip" check. */
async function localTripsAround(start: Date, end: Date): Promise<LocalTripRow[]> {
  try {
    const db = await getDatabase();
    return await db.getAllAsync<LocalTripRow>(
      `SELECT id, started_at, ended_at, start_address, end_address, distance_miles FROM trips
       WHERE started_at >= ? AND started_at <= ?`,
      [new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString(), end.toISOString()]
    );
  } catch {
    return [];
  }
}

/** The primary vehicle, the same default the trip form uses. Bounded so a
 *  slow network never holds up the save; no vehicle is a fine answer. */
async function primaryVehicleId(): Promise<string | undefined> {
  try {
    const { fetchVehicles } = await import("../lib/api/vehicles");
    const res = await Promise.race([
      fetchVehicles(),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    return res?.data.find((v) => v.isPrimary)?.id;
  } catch {
    return undefined;
  }
}

interface Place {
  lat: number;
  lng: number;
  address: string | null;
}

type Step = "form" | "offer" | "miles" | "done";

interface Added {
  miles: number;
  from: string;
  to: string;
  departAt: Date;
  typed: boolean;
}

export function MissingTripReporter({ onTripAdded }: { onTripAdded?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  // When they set off. Starts empty so the driver has to set it: a default of
  // "now" would be filed silently as the drive's time (a report that said
  // only "To Peterborough" once cost an hour on the wrong day).
  const [departAt, setDepartAt] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [milesText, setMilesText] = useState("");
  const [added, setAdded] = useState<Added | null>(null);
  const [pause, setPause] = useState<{ activeUntil: number | null; intervals: PauseInterval[] }>({
    activeUntil: null,
    intervals: [],
  });
  const [resuming, setResuming] = useState(false);
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    readPauseState().then((p) => {
      if (!cancelled) setPause(p);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const notice = useMemo(
    () =>
      pauseNotice({
        intervals: pause.intervals,
        activeUntil: pause.activeUntil,
        departAt,
        now: Date.now(),
        describeActive: describePause,
      }),
    [pause, departAt]
  );

  const reset = () => {
    setStep("form");
    setFrom(null);
    setTo(null);
    setDepartAt(null);
    setNote("");
    setMilesText("");
    setAdded(null);
    setResumed(false);
  };

  const close = () => {
    setOpen(false);
  };

  const resume = async () => {
    setResuming(true);
    try {
      const { resumeDriveDetection } = await import("../lib/tracking/detection");
      await resumeDriveDetection("manual");
      trackReportEvent("trip.report_missing_pause_resumed", { pausedUntil: pause.activeUntil });
      setResumed(true);
      setPause(await readPauseState());
    } catch {
      Alert.alert("Couldn't turn recording back on", "Please try again from the dashboard.");
    } finally {
      setResuming(false);
    }
  };

  const bothPlaces = from !== null && to !== null;

  const send = async () => {
    if (!departAt) return;
    const fromLabel = from ? placeLabel(from.address) : null;
    const toLabel = to ? placeLabel(to.address) : null;
    const text = describeReportNote({ from: fromLabel, to: toLabel, departAt, extra: note });
    try {
      await reportMissingTrip(text, localIsoDate(departAt), {
        ...(fromLabel ? { from: fromLabel } : {}),
        ...(toLabel ? { to: toLabel } : {}),
        departAt: departAt.toISOString(),
        ...(note.trim() ? { extraNote: note.trim().slice(0, 1000) } : {}),
        ...(notice ? { pausedUntil: notice.until } : {}),
        ...(notice && notice.start !== null ? { pauseStartedAt: notice.start } : {}),
      });
    } catch {
      Alert.alert("Couldn't send", "Please try again in a moment. Your details are still here.");
      return;
    }
    if (bothPlaces) {
      setStep("offer");
      return;
    }
    setOpen(false);
    reset();
    Alert.alert("Thanks, got it", "We'll check what happened and make sure your trips are captured.");
  };

  const submit = async () => {
    Keyboard.dismiss();
    setSending(true);
    setChecking(true);
    try {
      // A drive in progress explains the report on its own, and finalising it
      // would truncate a journey the user is still making, so we ask rather
      // than act. Checked first: it is a local read, and it answers instantly
      // where the settle below can take up to eight seconds.
      const live = await liveRecording();
      if (live) {
        const elapsedMs = Date.now() - live.startedAt;
        const forHowLong = describeElapsed(elapsedMs);
        setChecking(false);
        const choice = await ask(
          "That drive is recording now",
          `MileClear has been recording for ${forHowLong} and saves this trip when you arrive. It can't appear in your list until it ends.\n\nIs that the trip you're missing?`,
          ["That's the one, thanks", "No, a different trip"]
        );
        trackReportEvent("trip.report_live_recording_prompt", {
          minutes: Math.round(elapsedMs / 60000),
          points: live.points,
          outcome: choice === 0 ? "deflected" : "reported_anyway",
        });
        if (choice === 0) {
          setOpen(false);
          reset();
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
        const choice = await ask("A trip just finished saving", `${where}${miles}.\n\nIs that the one you were missing?`, [
          "No, still missing",
          "Yes, that's it",
        ]);
        if (choice === 1) {
          setOpen(false);
          reset();
          return;
        }
      }

      await send();
    } finally {
      setChecking(false);
      setSending(false);
    }
  };

  /** Save the trip through the same SQLite-first path as the trip form. */
  const saveTrip = async (miles: number, routedSecs: number | null, typed: boolean) => {
    if (!from || !to || !departAt) return;
    const end = endTimeFor({ departAt, routedSecs, typedMiles: typed ? miles : null, now: Date.now() });

    const clash = findOverlappingTrip(await localTripsAround(departAt, end), departAt, end);
    if (clash) {
      const clashStart = new Date(clash.started_at);
      const where =
        clash.start_address && clash.end_address
          ? `${clash.start_address} to ${clash.end_address}`
          : clash.start_address || clash.end_address || "A trip";
      const choice = await ask(
        "You already have a trip at that time",
        `${where}, from ${clockTime(clashStart)} on ${shortDay(clashStart)}. Add this one as well?`,
        ["Don't add it", "Add anyway"]
      );
      trackReportEvent("trip.report_missing_overlap_prompt", {
        outcome: choice === 1 ? "added_anyway" : "declined",
        existingTripId: clash.id,
      });
      if (choice === 0) {
        setOpen(false);
        reset();
        return;
      }
    }

    const fromLabel = placeLabel(from.address);
    const toLabel = placeLabel(to.address);
    const vehicleId = await primaryVehicleId();
    const data: CreateTripData = {
      startLat: from.lat,
      startLng: from.lng,
      endLat: to.lat,
      endLng: to.lng,
      ...(from.address ? { startAddress: from.address } : {}),
      ...(to.address ? { endAddress: to.address } : {}),
      distanceMiles: miles,
      startedAt: departAt.toISOString(),
      endedAt: end.toISOString(),
      classification: "unclassified",
      notes: typed
        ? "Added from a missing-trip report. Miles typed in by the driver; times are approximate."
        : "Added from a missing-trip report. Times are approximate.",
      ...(vehicleId ? { vehicleId } : {}),
    };

    try {
      const { syncCreateTrip } = await import("../lib/sync/actions");
      const result = await syncCreateTrip(data);
      haptic("success");
      trackReportEvent("trip.report_missing_self_added", {
        tripId: result?.data?.id ?? null,
        // Null result = saved on the phone and queued to sync (offline).
        queued: result === null,
        distanceMiles: miles,
        distanceSource: typed ? "typed" : "routed",
        reportedDate: localIsoDate(departAt),
        departAt: departAt.toISOString(),
        overlapWarned: clash !== null,
      });
      setAdded({ miles, from: fromLabel, to: toLabel, departAt, typed });
      setStep("done");
      onTripAdded?.();
    } catch {
      Alert.alert(
        "Couldn't add the trip",
        "Your report has been sent. Please try again, or add it yourself with the + button on Trips."
      );
    }
  };

  const addThisTrip = async () => {
    if (!from || !to) return;
    setAdding(true);
    try {
      // Road distance only. A straight line between the two ends is always
      // short, and a short claim costs the driver money.
      const route = await fetchServerRouteDistance({
        startLat: from.lat,
        startLng: from.lng,
        endLat: to.lat,
        endLng: to.lng,
      });
      if (!route || !(route.distanceMiles > 0)) {
        trackReportEvent("trip.report_missing_route_failed", {});
        setStep("miles");
        return;
      }
      await saveTrip(Math.round(route.distanceMiles * 10) / 10, route.durationSecs, false);
    } finally {
      setAdding(false);
    }
  };

  const addWithTypedMiles = async () => {
    const miles = parseMilesInput(milesText);
    if (miles === null) return;
    Keyboard.dismiss();
    setAdding(true);
    try {
      await saveTrip(miles, null, true);
    } finally {
      setAdding(false);
    }
  };

  const pauseBanner =
    notice && !resumed ? (
      <View style={styles.pauseBanner}>
        <Ionicons name="pause-circle-outline" size={18} color={colors.amber} />
        <View style={styles.pauseBody}>
          <Text style={styles.pauseText}>{notice.text}</Text>
          {notice.kind === "active" && (
            <TouchableOpacity
              style={styles.pauseResume}
              onPress={resume}
              disabled={resuming}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Resume recording"
            >
              {resuming ? (
                <ActivityIndicator color={colors.bg} size="small" />
              ) : (
                <Text style={styles.pauseResumeText}>Resume recording</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    ) : resumed ? (
      <View style={styles.pauseBanner}>
        <Ionicons name="checkmark-circle-outline" size={18} color={colors.green} />
        <Text style={[styles.pauseText, styles.pauseBody]}>Recording is back on.</Text>
      </View>
    ) : null;

  const tripSummary =
    from && to && departAt ? (
      <View style={styles.summary}>
        <Text style={styles.summaryRoute}>
          {placeLabel(from.address)} to {placeLabel(to.address)}
        </Text>
        <Text style={styles.summaryWhen}>
          Set off around {clockTime(departAt)}, {shortDay(departAt)}
        </Text>
      </View>
    ) : null;

  const canSend = canSendReport({ hasFrom: from !== null, hasTo: to !== null, departAt, extra: note });
  const typedMiles = parseMilesInput(milesText);

  return (
    <>
      <TouchableOpacity
        style={styles.link}
        onPress={() => {
          // Fresh sheet each time: a time left over from an earlier open
          // would be filed silently as this report's drive.
          reset();
          setOpen(true);
        }}
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
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {step === "form" && (
                <>
                  <Text style={styles.title}>Missing a trip?</Text>
                  <Text style={styles.sub}>
                    Tell us where you went and when. We&apos;ll check what happened, and you can add
                    the trip straight away.
                  </Text>
                  {pauseBanner}
                  <LocationPickerField
                    label="From"
                    lat={from?.lat ?? null}
                    lng={from?.lng ?? null}
                    address={from?.address ?? null}
                    onLocationChange={(lat, lng, address) => setFrom({ lat, lng, address })}
                    onClear={() => setFrom(null)}
                    disabled={sending}
                  />
                  <LocationPickerField
                    label="To"
                    lat={to?.lat ?? null}
                    lng={to?.lng ?? null}
                    address={to?.address ?? null}
                    onLocationChange={(lat, lng, address) => setTo({ lat, lng, address })}
                    onClear={() => setTo(null)}
                    disabled={sending}
                  />
                  <DateTimePickerField
                    label="When did you set off? (roughly)"
                    value={departAt}
                    onChange={setDepartAt}
                    maximumDate={new Date()}
                    disabled={sending}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Anything else? (optional)"
                    placeholderTextColor={colors.text3}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={1000}
                    editable={!sending}
                  />
                  <TouchableOpacity
                    style={[styles.send, (sending || !canSend) && styles.sendDisabled]}
                    onPress={submit}
                    disabled={sending || !canSend}
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
                </>
              )}

              {step === "offer" && (
                <>
                  <Text style={styles.title}>Thanks, we&apos;ve got it</Text>
                  <Text style={styles.sub}>
                    We&apos;ll look into why it was missed. Want to add the trip now, so it&apos;s in
                    your records?
                  </Text>
                  {tripSummary}
                  {pauseBanner}
                  <TouchableOpacity
                    style={[styles.send, adding && styles.sendDisabled]}
                    onPress={addThisTrip}
                    disabled={adding}
                    activeOpacity={0.85}
                  >
                    {adding ? (
                      <View style={styles.sendBusy}>
                        <ActivityIndicator color={colors.bg} />
                        <Text style={styles.sendBusyText}>Working out the miles</Text>
                      </View>
                    ) : (
                      <Text style={styles.sendText}>Add this trip</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancel}
                    onPress={() => {
                      trackReportEvent("trip.report_missing_self_add_skipped", {});
                      close();
                    }}
                    activeOpacity={0.7}
                    disabled={adding}
                  >
                    <Text style={styles.cancelText}>Not now</Text>
                  </TouchableOpacity>
                </>
              )}

              {step === "miles" && (
                <>
                  <Text style={styles.title}>How many miles?</Text>
                  <Text style={styles.sub}>
                    We couldn&apos;t work out the road distance just now. If you know roughly how far
                    it was, type it in and we&apos;ll add the trip.
                  </Text>
                  {tripSummary}
                  <TextInput
                    style={[styles.input, styles.milesInput]}
                    placeholder="e.g. 12.5"
                    placeholderTextColor={colors.text3}
                    value={milesText}
                    onChangeText={setMilesText}
                    keyboardType="decimal-pad"
                    autoFocus
                    maxLength={7}
                    accessibilityLabel="Miles driven"
                  />
                  <TouchableOpacity
                    style={[styles.send, (adding || typedMiles === null) && styles.sendDisabled]}
                    onPress={addWithTypedMiles}
                    disabled={adding || typedMiles === null}
                    activeOpacity={0.85}
                  >
                    {adding ? (
                      <ActivityIndicator color={colors.bg} />
                    ) : (
                      <Text style={styles.sendText}>Add trip</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancel}
                    onPress={addThisTrip}
                    activeOpacity={0.7}
                    disabled={adding}
                  >
                    <Text style={styles.cancelText}>Try the road distance again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancel} onPress={close} activeOpacity={0.7} disabled={adding}>
                    <Text style={styles.cancelText}>Not now</Text>
                  </TouchableOpacity>
                </>
              )}

              {step === "done" && added && (
                <>
                  <View style={styles.doneIcon}>
                    <Ionicons name="checkmark-circle" size={40} color={colors.green} />
                  </View>
                  <Text style={[styles.title, styles.centre]}>Trip added</Text>
                  <Text style={styles.doneMiles}>{added.miles.toFixed(1)} miles</Text>
                  <Text style={[styles.sub, styles.centre]}>
                    {added.from} to {added.to}, {shortDay(added.departAt)} at {clockTime(added.departAt)}.
                    It&apos;s in your trips, ready for you to mark as business or personal.
                  </Text>
                  <TouchableOpacity style={styles.send} onPress={close} activeOpacity={0.85}>
                    <Text style={styles.sendText}>Done</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    maxHeight: "90%",
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
  centre: {
    textAlign: "center",
  },
  sub: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  pauseBanner: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: colors.amberDim,
  },
  pauseBody: {
    flex: 1,
  },
  pauseText: {
    color: colors.text1,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  pauseResume: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 14,
    height: 36,
    minWidth: 150,
    borderRadius: 10,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseResumeText: {
    color: colors.bg,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  summary: {
    padding: 14,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.bg,
  },
  summaryRoute: {
    color: colors.text1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 21,
  },
  summaryWhen: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    marginTop: 4,
  },
  input: {
    marginTop: 4,
    minHeight: 72,
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
  milesInput: {
    minHeight: 0,
    height: 52,
    fontSize: 18,
    textAlignVertical: "center",
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
  doneIcon: {
    alignItems: "center",
    marginBottom: 8,
  },
  doneMiles: {
    color: colors.amber,
    fontFamily: fonts.bold,
    fontSize: 28,
    textAlign: "center",
    marginTop: 6,
  },
});
