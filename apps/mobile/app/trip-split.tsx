// Split Trip — un-merge a multi-drop journey into its real legs.
//
// Delivery drivers doing quick drops get a whole run recorded as ONE trip
// (stops shorter than the stop-detection window never segment). The server
// re-scans the trip's stored GPS trail for stops and proposes cut points;
// this screen lets the user toggle them and apply the split. Each new leg
// inherits the trip's classification and stays individually editable after.
//
// Direct API call + refetch-on-focus, exactly like the merge flow — the
// trips tab reloads itself when we navigate back. Free-tier feature
// (Will Holland, 21 Jul 2026).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchTrip,
  fetchSplitSuggestions,
  splitTrip,
  type TripDetail,
  type SplitSuggestion,
} from "../lib/api/trips";
import { describeError } from "../lib/api/apiError";
import { Button } from "../components/Button";
import { TripMapWidget } from "../components/map/TripMapWidget";
import { colors, fonts } from "../lib/theme";

const BG = colors.bg;
const SURFACE = colors.surface;
const BORDER = colors.surfaceBorder;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const AMBER = colors.amber;

function formatDwell(sec: number): string {
  if (sec < 120) return `${sec}s`;
  return `${Math.round(sec / 60)} min`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function TripSplitScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [suggestions, setSuggestions] = useState<SplitSuggestion[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchTrip(id), fetchSplitSuggestions(id)])
      .then(([tripRes, sugRes]) => {
        setTrip(tripRes.data);
        setSuggestions(sugRes.data.suggestions);
        // All on by default — deselecting is the easier direction for the
        // "that was just a long red light" case.
        setEnabled(new Set(sugRes.data.suggestions.map((s) => s.timestamp)));
      })
      .catch((err: unknown) => {
        const { title, message } = describeError(err, "Couldn't load split suggestions", {
          savedLocally: false,
        });
        Alert.alert(title, message, [{ text: "OK", onPress: () => router.back() }]);
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const toggle = useCallback((timestamp: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) next.delete(timestamp);
      else next.add(timestamp);
      return next;
    });
  }, []);

  const enabledSuggestions = useMemo(
    () => suggestions.filter((s) => enabled.has(s.timestamp)),
    [suggestions, enabled]
  );
  const legCount = enabledSuggestions.length + 1;

  const handleSplit = useCallback(() => {
    if (enabledSuggestions.length === 0) return;
    Alert.alert(
      `Split into ${legCount} trips?`,
      `This replaces the current trip with ${legCount} separate trips. Each keeps this trip's classification and can be edited on its own. The total mileage stays the same.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Split",
          onPress: async () => {
            setSplitting(true);
            try {
              await splitTrip(id!, enabledSuggestions.map((s) => s.timestamp));
              // The parent trip no longer exists, so pop the whole stack
              // (this screen AND its trip-form) back to the tabs — the trips
              // tab refetches on focus, same pattern as merge.
              router.dismissAll();
            } catch (err: unknown) {
              const { title, message } = describeError(err, "Couldn't split the trip", {
                savedLocally: false,
              });
              Alert.alert(title, message);
              setSplitting(false);
            }
          },
        },
      ]
    );
  }, [enabledSuggestions, legCount, id, router]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={AMBER} size="large" />
      </View>
    );
  }

  if (!trip || suggestions.length === 0) {
    return (
      <View style={[styles.screen, styles.center, { padding: 32 }]}>
        <Ionicons name="git-branch-outline" size={40} color={TEXT_3} />
        <Text style={styles.emptyTitle}>No split points found</Text>
        <Text style={styles.emptyBody}>
          We couldn't find any stops long enough to split this trip at. Splitting works on
          automatically tracked trips where the vehicle stopped for a minute or more mid-route.
        </Text>
        <Button title="Go Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={styles.intro}>
          We found {suggestions.length} {suggestions.length === 1 ? "stop" : "stops"} along this
          trip. Choose where to split — each amber pin is a detected stop.
        </Text>

        <TripMapWidget
          coordinates={trip.coordinates ?? []}
          matchedCoordinates={trip.matchedCoordinates}
          cutMarkers={enabledSuggestions.map((s) => ({ lat: s.lat, lng: s.lng }))}
          height={220}
          interactive
        />

        <View style={styles.card}>
          {suggestions.map((s, i) => (
            <View key={s.timestamp} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Ionicons name="pause-circle-outline" size={22} color={enabled.has(s.timestamp) ? AMBER : TEXT_3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Stopped {formatDwell(s.dwellSec)}</Text>
                <Text style={styles.rowSub}>at {formatTime(s.timestamp)}</Text>
              </View>
              <Switch
                value={enabled.has(s.timestamp)}
                onValueChange={() => toggle(s.timestamp)}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: AMBER }}
                thumbColor="#fff"
                accessibilityLabel={`Split at ${formatTime(s.timestamp)}`}
              />
            </View>
          ))}
        </View>

        <Text style={styles.hint}>
          Your {trip.distanceMiles.toFixed(1)} miles stay exactly as recorded — splitting only
          divides them into separate trips. Each new trip starts as{" "}
          {trip.classification === "business" ? "business" : trip.classification === "personal" ? "personal" : "unclassified"}{" "}
          and can be reclassified individually.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={
            enabledSuggestions.length === 0
              ? "Select at least one stop"
              : `Split into ${legCount} trips`
          }
          icon="git-branch-outline"
          onPress={handleSplit}
          loading={splitting}
          disabled={enabledSuggestions.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  center: { alignItems: "center", justifyContent: "center" },
  intro: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
    marginBottom: 14,
  },
  card: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    gap: 10,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  rowIcon: { width: 26, alignItems: "center" },
  rowTitle: { color: TEXT_1, fontSize: 15, fontFamily: fonts.medium },
  rowSub: { color: TEXT_3, fontSize: 12.5, fontFamily: fonts.regular, marginTop: 1 },
  hint: {
    color: TEXT_3,
    fontSize: 12.5,
    fontFamily: fonts.regular,
    lineHeight: 18,
    marginTop: 14,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  emptyTitle: {
    color: TEXT_1,
    fontSize: 17,
    fontFamily: fonts.semibold,
    marginTop: 14,
  },
  emptyBody: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
});
