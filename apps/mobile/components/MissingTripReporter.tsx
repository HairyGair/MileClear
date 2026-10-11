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
// 11 Oct 2026 (add-trip PROPOSALS 0.10, decision J): the sheet asks for the
// journey with the same From / To / When card as "Add a past trip" (place
// chips, day chips, set-off time), checks for a trip MileClear already has
// with the same rule, and ends on the form's saved card, so the trip can be
// marked Business or Personal there and then, or followed by the next one.
//
// iPad-safe modal: presentationStyle="overFullScreen" + statusBarTranslucent,
// plain TouchableOpacity for the CTAs (not an animated button), per the
// build-60 iPad hit-testing fix.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
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
import { apiRequest } from "../lib/api/index";
import { getDatabase } from "../lib/db/index";
import { resolveLiveRun, describeElapsed } from "../lib/tracking/liveRecording";
import { describePause, shortDay } from "../lib/tracking/pauseRule";
import { clockTime } from "../lib/trips/manualTimeRule";
import {
  canSendReport,
  isTooRecent,
  describeReportNote,
  endTimeFor,
  parseMilesInput,
  pauseIntervals,
  pauseNotice,
  placeLabel,
  type PauseEventRow,
  type PauseInterval,
} from "../lib/trips/missingReportRule";
import { haptic } from "../lib/haptics";
import { collectMissingTripPhoneLog, withTimeout } from "../lib/tracking/trackingLogStore";
import { settleTrips } from "../lib/trips/settle";
import { findTripAround, type KnownTrip } from "../lib/trips/overlapLookup";
import { describeKnownTrip } from "../lib/trips/overlapText";
import {
  canChain,
  chainParams,
  chainSubtitle,
  departureFor,
  type SavedTripFacts,
} from "../lib/trips/pastTripRule";
import { loadSavedPlaces } from "../lib/trips/savedPlaces";
import type { SavedPlace } from "../lib/trips/placeLabel";
import { isOnline, onConnectivityChange } from "../lib/network";
import { haversineDistance, type TripClassification } from "@mileclear/shared";
import { FromToCard } from "./addTrip/FromToCard";
import { WhenCard } from "./addTrip/WhenCard";
import { OverlapLine } from "./addTrip/OverlapNotice";
import { SavedTripCard } from "./addTrip/SavedTripCard";
import { placeWords, usePickerPlaceSource } from "./addTrip/PlaceField";
import type { ClockValue } from "./addTrip/TimeRow";

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
  await settleTrips(8000);
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
  /** Null when it saved on the phone and is waiting to upload. */
  tripId: string | null;
  miles: number;
  typed: boolean;
  facts: SavedTripFacts;
}

export function MissingTripReporter({
  onTripAdded,
  variant = "card",
}: {
  onTripAdded?: () => void;
  /** "row" is a bare trigger row with no card styling of its own; "link" is
   *  the centred "Missing a trip? Tell us" line under To sort and the list. */
  variant?: "card" | "row" | "link";
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  // When they set off, as a day and a time. Both start empty so the driver
  // has to set them: a default of "now" would be filed silently as the
  // drive's time (a report that said only "To Peterborough" once cost an hour
  // on the wrong day).
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState<ClockValue | null>(null);
  const departAt = day && time ? departureFor(day, time.hours, time.minutes) : null;
  const [classification, setClassification] = useState<TripClassification>("unclassified");
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [online, setOnline] = useState(isOnline());
  useEffect(() => onConnectivityChange(setOnline), []);
  const placeSource = usePickerPlaceSource();
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
    loadSavedPlaces().then((p) => {
      if (!cancelled) setSavedPlaces(p);
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
    setDay(null);
    setTime(null);
    setClassification("unclassified");
    setNote("");
    setMilesText("");
    setAdded(null);
    setResumed(false);
  };

  const close = () => {
    setOpen(false);
  };

  // Cancel (or the back gesture) on a report with anything in it asks first:
  // the next open starts empty, so closing throws it away.
  const closeForm = () => {
    const filled = step === "form" && (from !== null || to !== null || day !== null || time !== null || note.trim() !== "");
    if (!filled || sending) {
      close();
      return;
    }
    Alert.alert("Discard this report?", "It hasn't been sent yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: close },
    ]);
  };

  // The same "MileClear already has a trip around then" line as Add a past
  // trip, as soon as the day and time are set, so a drive that was recorded
  // after all can be opened instead of reported. The end is a guess until
  // the route is known: the straight line, a quarter longer, at 30 mph.
  const [overlap, setOverlap] = useState<KnownTrip | null>(null);
  const lastLineRef = useRef<string | null>(null);
  const departMs = departAt ? departAt.getTime() : null;
  useEffect(() => {
    if (!open || step !== "form" || departMs == null) {
      setOverlap(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const start = new Date(departMs);
      const guessMiles = from && to ? haversineDistance(from.lat, from.lng, to.lat, to.lng) * 1.25 : null;
      const end = guessMiles != null && guessMiles > 0
        ? endTimeFor({ departAt: start, routedSecs: null, typedMiles: guessMiles, now: Date.now() })
        : null;
      findTripAround(start, end)
        .then((hit) => {
          if (cancelled) return;
          setOverlap(hit);
          if (hit && lastLineRef.current !== hit.id) {
            lastLineRef.current = hit.id;
            trackReportEvent("trip.report_missing_overlap_line", { existingTripId: hit.id, existingSource: hit.source });
          }
        })
        .catch(() => {});
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, step, departMs, from, to]);

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
    // The phone's own log around the departure rides along, so the report
    // explains itself (10 Oct 2026). Bounded to a few seconds and optional:
    // the report goes without it rather than waiting on it.
    const phoneLog = await withTimeout(collectMissingTripPhoneLog(departAt), 4000);
    try {
      await reportMissingTrip(text, localIsoDate(departAt), {
        ...(phoneLog ? { phoneLog } : {}),
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

    // The same check as "Add a past trip": any trip that overlaps in time,
    // on the phone and, for older days, on the server.
    const clash = await findTripAround(departAt, end).catch(() => null);
    if (clash) {
      const w = describeKnownTrip(clash);
      const choice = await ask(
        "MileClear already has a trip around then",
        `${w.route}, ${w.day}, ${w.times}, ${w.miles}. ${w.how}.\n\nIs it the drive you're adding?`,
        ["It's the same drive", "Open that trip to fix it", "Add mine as well"]
      );
      trackReportEvent("trip.report_missing_overlap_prompt", {
        outcome: choice === 2 ? "added_anyway" : choice === 1 ? "opened" : "declined",
        existingTripId: clash.id,
        existingSource: clash.source,
      });
      if (choice !== 2) {
        setOpen(false);
        reset();
        if (choice === 1) router.push({ pathname: "/trip-form", params: { id: clash.id } } as never);
        return;
      }
    }

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
      recordedBy: "missing_report",
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
      setAdded({
        tripId: result?.data?.id ?? null,
        miles,
        typed,
        facts: {
          startLat: from.lat,
          startLng: from.lng,
          startAddress: from.address,
          startName: placeWords(from, savedPlaces).name,
          endLat: to.lat,
          endLng: to.lng,
          endAddress: to.address,
          endName: placeWords(to, savedPlaces).name,
          startedAt: departAt,
          endedAt: end,
          classification: "unclassified",
          vehicleId: vehicleId ?? null,
        },
      });
      setClassification("unclassified");
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

  /** Business or Personal on the saved card, through the same SQLite-first
   *  update path as the trip screen. Only once the trip has a server id. */
  const classifyAdded = async (c: TripClassification) => {
    if (!added?.tripId) return;
    const before = classification;
    setClassification(c);
    try {
      const { syncUpdateTrip } = await import("../lib/sync/actions");
      await syncUpdateTrip(added.tripId, { classification: c });
      trackReportEvent("trip.report_missing_classified", { tripId: added.tripId, classification: c });
    } catch {
      setClassification(before);
      Alert.alert("Couldn't save that", "You can mark it on Trips instead.");
    }
  };

  const openChain = (kind: "next" | "way_back") => {
    if (!added) return;
    const facts = { ...added.facts, classification };
    trackReportEvent("trip.report_missing_chain_tapped", { kind });
    setOpen(false);
    reset();
    router.push({ pathname: "/trip-form", params: chainParams(kind, facts) } as never);
  };

  const tooRecent = isTooRecent(departAt, Date.now());
  const canSend = canSendReport({ hasFrom: from !== null, hasTo: to !== null, departAt, extra: note, now: Date.now() });
  const typedMiles = parseMilesInput(milesText);

  return (
    <>
      <TouchableOpacity
        style={variant === "row" ? styles.linkRow : variant === "link" ? styles.linkCentred : styles.link}
        onPress={() => {
          // Fresh sheet each time: a time left over from an earlier open
          // would be filed silently as this report's drive.
          reset();
          setOpen(true);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={variant === "link" ? "Missing a trip? Tell us." : "Missing a trip you made? Tap to tell us."}
      >
        <Ionicons name="help-circle-outline" size={16} color={colors.text2} />
        {variant === "link" ? (
          <Text style={styles.linkText}>Missing a trip? Tell us</Text>
        ) : (
          <>
            <Text style={styles.linkText}>Missing a trip you made?</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.text3} style={styles.linkChevron} />
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={step === "form" ? closeForm : close}
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
                  <FromToCard
                    from={from}
                    to={to}
                    onFrom={(v) => setFrom(v)}
                    onTo={(v) => setTo(v)}
                    onSwap={() => {
                      setFrom(to);
                      setTo(from);
                    }}
                    source={placeSource}
                    savedPlaces={savedPlaces}
                    online={online}
                    disabled={sending}
                    style={styles.onSheet}
                  />
                  <View style={[styles.whenCard, styles.onSheet]}>
                    <WhenCard
                      day={day}
                      onDay={setDay}
                      time={time}
                      onTime={setTime}
                      now={new Date()}
                      timeHint="Roughly is fine"
                      disabled={sending}
                    >
                      {overlap && (
                        <OverlapLine
                          trip={overlap}
                          onOpen={() => {
                            trackReportEvent("trip.report_missing_overlap_opened", { existingTripId: overlap.id });
                            setOpen(false);
                            reset();
                            router.push({ pathname: "/trip-form", params: { id: overlap.id } } as never);
                          }}
                        />
                      )}
                    </WhenCard>
                  </View>
                  {tooRecent && (
                    <Text style={styles.timeHint}>
                      That&apos;s the time now. Pick roughly when you set off on this drive.
                    </Text>
                  )}
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
                  <TouchableOpacity style={styles.cancel} onPress={closeForm} activeOpacity={0.7}>
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
                <SavedTripCard
                  miles={added.miles}
                  summary={`${added.facts.startName} to ${added.facts.endName ?? placeLabel(to?.address)} · ${shortDay(
                    added.facts.startedAt
                  )}, ${clockTime(added.facts.startedAt)} to ${clockTime(added.facts.endedAt)}`}
                  classification={classification}
                  milesFrom={added.typed ? "Miles typed in. Times are roughly when you said" : "Worked out from the road route. Times are roughly when you said"}
                  savedWhere={
                    added.tripId ? "It's in your trips." : "Saved on your phone. It uploads when you're back online."
                  }
                  onClassify={added.tripId ? classifyAdded : null}
                  next={{ subtitle: chainSubtitle("next", added.facts, new Date()), onPress: () => openChain("next") }}
                  wayBack={
                    canChain("way_back", added.facts)
                      ? { subtitle: chainSubtitle("way_back", added.facts, new Date()), onPress: () => openChain("way_back") }
                      : null
                  }
                  onDone={close}
                />
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  onSheet: {
    backgroundColor: colors.bg,
  },
  whenCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginTop: 12,
    marginBottom: 12,
  },
  timeHint: {
    color: colors.amber,
    fontFamily: fonts.medium,
    fontSize: 13,
    marginTop: -6,
    marginBottom: 10,
  },
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
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkCentred: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
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
