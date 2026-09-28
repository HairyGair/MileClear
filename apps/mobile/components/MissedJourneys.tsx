// "Journeys you might have missed" — the proactive counterpart to
// MissingTripReporter. The server scanner finds spatial gaps between consecutive
// captured trips (one ended at A, the next started at B, no trip between) and
// proposes the A->B drive. One tap opens the trip form prefilled with the gap's
// endpoints + times; saving creates the trip and marks the proposal accepted.
// Dismiss hides it for good. Renders nothing when there are no proposals, so it
// stays invisible for the common case.
//
// 28 Sep 2026: a gap offer only knows the drive happened somewhere between two
// trips. The card now says that window in words, and "Add trip" asks when the
// driver set off (MissedJourneyTimeSheet) instead of stamping the trip at the
// window's start, which is the previous trip's end (Elisa Barone: saved at
// 07:07, driven at 17:30, then typed in again and counted twice). Before the
// form opens, a trip already saved at that time is pointed out. The server
// stops offering journeys more than 14 days old.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, fonts } from "../lib/theme";
import {
  fetchMissedJourneys,
  fetchServerRouteDistance,
  resolveMissedJourney,
  type MissedJourneyProposal,
} from "../lib/api/trips";
import { apiRequest } from "../lib/api/index";
import { getDatabase } from "../lib/db/index";
import { clockTime } from "../lib/trips/manualTimeRule";
import { shortDay } from "../lib/tracking/pauseRule";
import { findOverlappingTrip, type LocalTripRow } from "../lib/trips/missingReportRule";
import {
  describeRecordedTimes,
  describeWindow,
  needsTimeChoice,
  travelMsFor,
  tripTimesFor,
  type OfferWindow,
} from "../lib/trips/missedJourneyWindow";
import { MissedJourneyTimeSheet } from "./MissedJourneyTimeSheet";

// How many rows a driver sees before they have to ask for more. 87 drivers had
// 10+ proposals waiting (one had 70) and a wall that long gets ignored wholesale.
const PAGE_SIZE = 3;

// Rows the engine recorded and then dropped: too short ("recorded"), judged
// a walk ("dropped_walk"), or judged phone drift ("dropped_phantom"). The
// too-short ones are turned down three times in four and the other two are
// drops the engine was confident about, so all three go after gap and
// trip_start rows. Stable within each group: the API already returns newest
// first.
//
// "dropped_start_trip" is deliberately NOT in this set. That one is a drive
// the driver started by hand and never saved, so it is a whole journey rather
// than a fragment the engine threw out, and it belongs at the top with the
// rest.
const DROPPED_SOURCES = new Set<MissedJourneyProposal["source"]>([
  "recorded",
  "dropped_walk",
  "dropped_phantom",
]);
function isDroppedRecording(p: MissedJourneyProposal): boolean {
  return DROPPED_SOURCES.has(p.source);
}

function orderProposals(list: MissedJourneyProposal[]): MissedJourneyProposal[] {
  const rest = list.filter((p) => !isDroppedRecording(p));
  const dropped = list.filter(isDroppedRecording);
  return [...rest, ...dropped];
}

// One line under the route saying why we are asking, for a drive we
// actually recorded. A gap row gets nothing: it is a guess from a hole.
function droppedNote(source: MissedJourneyProposal["source"]): string | null {
  switch (source) {
    case "recorded":
      return "We recorded this one but it was too short to save on its own";
    case "dropped_walk":
      return "The app thought this was a walk. If you were driving, add it.";
    case "dropped_drive":
      return "This looked like a walk, but it moved at driving speed. Add it if you drove.";
    case "dropped_phantom":
      return "This looked like the phone drifting rather than a drive. Add it if it was real.";
    case "dropped_start_trip":
      return "You recorded this one with Start Trip but it was never saved. Add it back if you want it.";
    default:
      return null;
  }
}

function shortPlace(addr: string | null, lat: number, lng: number): string {
  if (addr && addr.trim()) return addr.split(",")[0].trim();
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

// When the journey happened, in words. A gap row gives its window ("Sometime
// between 07:07 and 17:30 on Mon 28 Sep"); a drive we recorded gives its own
// times; a trip-start offer keeps the time its trip began.
function whenLine(p: MissedJourneyProposal): string {
  const w = windowOf(p);
  if (!w) return formatWhen(p.arrivedAt);
  if (p.source === "trip_start") return formatWhen(p.arrivedAt);
  if (!p.source || p.source === "gap") {
    const text = describeWindow(w);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return describeRecordedTimes(w);
}

function windowOf(p: MissedJourneyProposal): OfferWindow | null {
  const departedAt = new Date(p.departedAt);
  const arrivedAt = new Date(p.arrivedAt);
  if (Number.isNaN(departedAt.getTime()) || Number.isNaN(arrivedAt.getTime())) return null;
  return { departedAt, arrivedAt };
}

/** Fire-and-forget event, so how drivers answer is measurable. */
function trackEvent(type: string, metadata?: Record<string, unknown>): void {
  apiRequest("/user/event", { method: "POST", body: JSON.stringify({ type, metadata }) }).catch(() => {});
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

/** Trips on the phone that could overlap [start, end]. Read-only, and the
 *  same read the "Missing a trip?" sheet does before it adds a trip. */
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

/** The routed length of the drive, bounded so a slow network never holds the
 *  sheet up; the offer's own miles are the fallback. */
async function routeFor(p: MissedJourneyProposal): Promise<{ travelMs: number; routed: boolean }> {
  const route = await Promise.race([
    fetchServerRouteDistance({ startLat: p.fromLat, startLng: p.fromLng, endLat: p.toLat, endLng: p.toLng }),
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]).catch(() => null);
  const routed = route != null && route.durationSecs > 0;
  return {
    travelMs: travelMsFor({
      routedSecs: routed ? route.durationSecs : null,
      estimatedMiles: route && route.distanceMiles > 0 ? route.distanceMiles : p.estimatedMiles,
    }),
    routed,
  };
}

interface Choosing {
  p: MissedJourneyProposal;
  window: OfferWindow;
  travelMs: number;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function MissedJourneys() {
  const router = useRouter();
  const [items, setItems] = useState<MissedJourneyProposal[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Rows revealed so far. Not reset on refetch: after an accept/dismiss the
  // list shrinks by one and the next hidden row moves up to fill the slot.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // The card sits in the Trips list header, so it starts as one line and opens
  // in place. It used to be the list footer, where scrolling down to it fired
  // the next page load and pushed it away again (Chris Saunders, 22 Sep 2026).
  const [expanded, setExpanded] = useState(false);
  // The gap offer whose set-off time is being asked for, if any.
  const [choosing, setChoosing] = useState<Choosing | null>(null);
  const [opening, setOpening] = useState(false);
  // The offer whose Add is working out the route or checking for a clash.
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMissedJourneys()
      .then((r) => setItems(orderProposals(r.proposals ?? [])))
      .catch(() => {});
  }, []);

  // Re-scan whenever the screen regains focus, so a journey added (or dismissed)
  // disappears when the user returns from the trip form.
  useFocusEffect(load);

  // Open the trip form for an offer at the given times, after pointing out
  // any trip already saved in that time. Returns false when the driver chose
  // not to add it, so the time sheet can stay open for another pick.
  const openForm = async (
    p: MissedJourneyProposal,
    times: { startedAt: Date; endedAt: Date }
  ): Promise<boolean> => {
    const clash = findOverlappingTrip(
      await localTripsAround(times.startedAt, times.endedAt),
      times.startedAt,
      times.endedAt
    );
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
      trackEvent("trip.missed_offer_overlap_prompt", {
        proposalId: p.id,
        source: p.source ?? null,
        outcome: choice === 1 ? "added_anyway" : "declined",
        existingTripId: clash.id,
      });
      if (choice === 0) return false;
    }
    router.push({
      pathname: "/trip-form",
      params: {
        missedId: p.id,
        prefillFromLat: String(p.fromLat),
        prefillFromLng: String(p.fromLng),
        prefillFromAddress: p.fromAddress ?? "",
        prefillToLat: String(p.toLat),
        prefillToLng: String(p.toLng),
        prefillToAddress: p.toAddress ?? "",
        prefillDepartedAt: times.startedAt.toISOString(),
        prefillArrivedAt: times.endedAt.toISOString(),
      },
    });
    return true;
  };

  const add = async (p: MissedJourneyProposal) => {
    const w = windowOf(p);
    if (!w) {
      legacyAdd(p);
      return;
    }
    // A drive we recorded keeps the times we recorded.
    if (p.source && p.source !== "gap") {
      setAddingId(p.id);
      try {
        await openForm(p, { startedAt: w.departedAt, endedAt: w.arrivedAt });
      } finally {
        setAddingId(null);
      }
      return;
    }
    setAddingId(p.id);
    try {
      const { travelMs, routed } = await routeFor(p);
      if (needsTimeChoice(p.source ?? "gap", w, travelMs)) {
        trackEvent("trip.missed_offer_time_asked", {
          proposalId: p.id,
          windowMinutes: Math.round((w.arrivedAt.getTime() - w.departedAt.getTime()) / 60000),
          travelMinutes: Math.round(travelMs / 60000),
          routed,
        });
        setChoosing({ p, window: w, travelMs });
        return;
      }
      // The window is barely longer than the drive, so its start is close
      // enough; the trip still lasts only as long as the drive.
      await openForm(p, tripTimesFor(w.departedAt, travelMs, w));
    } finally {
      setAddingId(null);
    }
  };

  const confirmChosen = async (start: Date) => {
    if (!choosing) return;
    const { p, window: w, travelMs } = choosing;
    const times = tripTimesFor(start, travelMs, w);
    setOpening(true);
    try {
      trackEvent("trip.missed_offer_time_chosen", {
        proposalId: p.id,
        windowMinutes: Math.round((w.arrivedAt.getTime() - w.departedAt.getTime()) / 60000),
        startOffsetMinutes: Math.round((times.startedAt.getTime() - w.departedAt.getTime()) / 60000),
        travelMinutes: Math.round(travelMs / 60000),
      });
      const opened = await openForm(p, times);
      if (opened) setChoosing(null);
    } finally {
      setOpening(false);
    }
  };

  // Only for an offer whose dates cannot be read: the form as it always was.
  const legacyAdd = (p: MissedJourneyProposal) => {
    router.push({
      pathname: "/trip-form",
      params: {
        missedId: p.id,
        prefillFromLat: String(p.fromLat),
        prefillFromLng: String(p.fromLng),
        prefillFromAddress: p.fromAddress ?? "",
        prefillToLat: String(p.toLat),
        prefillToLng: String(p.toLng),
        prefillToAddress: p.toAddress ?? "",
        prefillDepartedAt: p.departedAt,
        prefillArrivedAt: p.arrivedAt,
      },
    });
  };

  const dismiss = async (id: string) => {
    setBusyId(id);
    setItems((prev) => prev.filter((p) => p.id !== id)); // optimistic
    try {
      await resolveMissedJourney(id, "dismiss");
    } catch {
      load(); // restore truth on failure
    } finally {
      setBusyId(null);
    }
  };

  // A "trip_start" offer: the next trip was already moving when it began
  // recording, so this stretch is its beginning, not a drive of its own.
  // Accepting moves that trip's start back and credits the routed miles;
  // nothing new appears in the list (Anthony, 3 Sep 2026: the old "Add trip"
  // path put a 1-mile trip at the previous stop's time into classification).
  const extend = async (id: string) => {
    setBusyId(id);
    setItems((prev) => prev.filter((p) => p.id !== id)); // optimistic
    try {
      await resolveMissedJourney(id, "extend");
    } catch {
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  const starts = items.filter((p) => p.source === "trip_start").length;
  const header =
    starts === items.length
      ? items.length === 1
        ? "A trip that may have started earlier"
        : `${items.length} trips that may have started earlier`
      : items.length === 1
        ? "A journey you might have missed"
        : `${items.length} journeys to check`;

  const shown = items.slice(0, visibleCount);
  const hidden = items.length - shown.length;

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsed}
        onPress={() => setExpanded(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${header}. Tap to review.`}
      >
        <View style={styles.collapsedLeft}>
          <View style={styles.collapsedIcon}>
            <Ionicons name="git-compare-outline" size={18} color={colors.amber} accessible={false} />
          </View>
          <View style={styles.collapsedTextWrap}>
            <Text style={styles.collapsedTitle} numberOfLines={1}>{header}</Text>
            <Text style={styles.collapsedSubtitle}>Tap to review</Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.text3} accessible={false} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(false)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${header}. Tap to hide.`}
      >
        <Ionicons name="git-compare-outline" size={16} color={colors.amber} />
        <Text style={[styles.headerText, styles.headerTextFill]}>{header}</Text>
        <Ionicons name="chevron-up" size={18} color={colors.text3} accessible={false} />
      </TouchableOpacity>
      {shown.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.route} numberOfLines={1}>
            {shortPlace(p.fromAddress, p.fromLat, p.fromLng)}
            {"  →  "}
            {shortPlace(p.toAddress, p.toLat, p.toLng)}
          </Text>
          <Text style={styles.meta}>
            {whenLine(p)} · ~{p.estimatedMiles} mi
          </Text>
          {droppedNote(p.source) != null && (
            // Worth distinguishing. A gap row is us guessing from a hole in the
            // list; these are movement we actually recorded and then dropped,
            // so the driver knows something happened and why we were unsure.
            <Text style={styles.recordedNote}>{droppedNote(p.source)}</Text>
          )}
          {p.source === "trip_start" && (
            <Text style={styles.recordedNote}>
              Recording began part-way through this drive. Extend it to start from{" "}
              {shortPlace(p.fromAddress, p.fromLat, p.fromLng)}.
            </Text>
          )}
          <View style={styles.actions}>
            {p.source === "trip_start" ? (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => extend(p.id)}
                disabled={busyId === p.id}
                activeOpacity={0.85}
              >
                <Text style={styles.addText}>Extend trip</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => add(p)}
                disabled={addingId != null || busyId === p.id}
                activeOpacity={0.85}
              >
                {addingId === p.id ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <Text style={styles.addText}>Add trip</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => dismiss(p.id)}
              disabled={busyId === p.id}
              activeOpacity={0.7}
            >
              {busyId === p.id ? (
                <ActivityIndicator size="small" color={colors.text3} />
              ) : (
                <Text style={styles.dismissText}>Dismiss</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {hidden > 0 && (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => setVisibleCount((n) => n + PAGE_SIZE)}
          activeOpacity={0.7}
        >
          <Text style={styles.moreText}>
            Show {Math.min(hidden, PAGE_SIZE)} more{hidden > PAGE_SIZE ? ` (${hidden} left)` : ""}
          </Text>
        </TouchableOpacity>
      )}
      {choosing && (
        <MissedJourneyTimeSheet
          visible
          fromLabel={shortPlace(choosing.p.fromAddress, choosing.p.fromLat, choosing.p.fromLng)}
          toLabel={shortPlace(choosing.p.toAddress, choosing.p.toLat, choosing.p.toLng)}
          window={choosing.window}
          travelMs={choosing.travelMs}
          busy={opening}
          onCancel={() => setChoosing(null)}
          onConfirm={confirmChosen}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerText: {
    color: colors.text1,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  headerTextFill: {
    flex: 1,
  },
  collapsed: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  collapsedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  collapsedIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  collapsedTextWrap: {
    flex: 1,
  },
  collapsedTitle: {
    color: colors.text1,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  collapsedSubtitle: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 1,
  },
  recordedNote: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  route: {
    color: colors.text1,
    fontFamily: fonts.medium,
    fontSize: 14.5,
  },
  meta: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    marginTop: 3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  addBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.amber,
  },
  addText: {
    color: colors.bg,
    fontFamily: fonts.bold,
    fontSize: 13.5,
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  dismissText: {
    color: colors.text2,
    fontFamily: fonts.medium,
    fontSize: 13.5,
  },
  moreBtn: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    alignItems: "center",
  },
  moreText: {
    color: colors.amber,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
});
