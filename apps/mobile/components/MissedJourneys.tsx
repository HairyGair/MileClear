// "Journeys you might have missed" — the proactive counterpart to
// MissingTripReporter. The server scanner finds spatial gaps between consecutive
// captured trips (one ended at A, the next started at B, no trip between) and
// proposes the A->B drive. One tap opens the trip form prefilled with the gap's
// endpoints + times; saving creates the trip and marks the proposal accepted.
// Dismiss hides it for good. Renders nothing when there are no proposals, so it
// stays invisible for the common case.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, fonts } from "../lib/theme";
import {
  fetchMissedJourneys,
  resolveMissedJourney,
  type MissedJourneyProposal,
} from "../lib/api/trips";

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

  const load = useCallback(() => {
    fetchMissedJourneys()
      .then((r) => setItems(orderProposals(r.proposals ?? [])))
      .catch(() => {});
  }, []);

  // Re-scan whenever the screen regains focus, so a journey added (or dismissed)
  // disappears when the user returns from the trip form.
  useFocusEffect(load);

  const add = (p: MissedJourneyProposal) => {
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

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="git-compare-outline" size={16} color={colors.amber} />
        <Text style={styles.headerText}>{header}</Text>
      </View>
      {shown.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.route} numberOfLines={1}>
            {shortPlace(p.fromAddress, p.fromLat, p.fromLng)}
            {"  →  "}
            {shortPlace(p.toAddress, p.toLat, p.toLng)}
          </Text>
          <Text style={styles.meta}>
            {formatWhen(p.arrivedAt)} · ~{p.estimatedMiles} mi
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
              <TouchableOpacity style={styles.addBtn} onPress={() => add(p)} activeOpacity={0.85}>
                <Text style={styles.addText}>Add trip</Text>
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
