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

  const load = useCallback(() => {
    fetchMissedJourneys()
      .then((r) => setItems(r.proposals ?? []))
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

  if (items.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="git-compare-outline" size={16} color={colors.amber} />
        <Text style={styles.headerText}>
          {items.length === 1
            ? "A journey you might have missed"
            : `${items.length} journeys you might have missed`}
        </Text>
      </View>
      {items.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.route} numberOfLines={1}>
            {shortPlace(p.fromAddress, p.fromLat, p.fromLng)}
            {"  →  "}
            {shortPlace(p.toAddress, p.toLat, p.toLng)}
          </Text>
          <Text style={styles.meta}>
            {formatWhen(p.arrivedAt)} · ~{p.estimatedMiles} mi
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.addBtn} onPress={() => add(p)} activeOpacity={0.85}>
              <Text style={styles.addText}>Add trip</Text>
            </TouchableOpacity>
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
});
