import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import {
  fetchSavedLocationSuggestions,
  type SuggestedSavedLocation,
} from "../lib/api/savedLocations";
import { syncCreateSavedLocation } from "../lib/sync/actions";
import { registerGeofences } from "../lib/geofencing/index";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { colors, fonts, radii } from "../lib/theme";
import type { LocationType } from "@mileclear/shared";

/**
 * "Places you visit often" review screen.
 *
 * Lists up to 8 endpoint clusters from the user's recent trips with a
 * tap-to-save UI per cluster. Replaces the empty-state on /saved-locations
 * when the user has no saved locations yet but has enough trip history
 * for the server to make credible suggestions.
 *
 * Each row defaults to the server's `suggestedType` (home / work / other)
 * but the user picks the actual label via a 4-button row before tapping
 * Save. Dismiss (skip) removes the suggestion from the list for the
 * current session — we don't persist dismissals server-side yet (one of
 * Anthony's iteration variables for later: "should we remember 'no
 * thanks' decisions across sessions?").
 */

type SuggestionType = "home" | "work" | "depot" | "other";

const TYPE_OPTIONS: { value: SuggestionType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "home", label: "Home", icon: "home-outline" },
  { value: "work", label: "Work", icon: "briefcase-outline" },
  { value: "depot", label: "Depot", icon: "business-outline" },
  { value: "other", label: "Other", icon: "location-outline" },
];

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

export default function SavedLocationsSuggestScreen() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<SuggestedSavedLocation[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Per-row state: the type the user is currently choosing (defaults from
  // server's suggestedType), the editable name, and the row's saving state.
  const [rowState, setRowState] = useState<
    Record<string, { type: SuggestionType; name: string; saving: boolean; saved: boolean }>
  >({});

  useEffect(() => {
    fetchSavedLocationSuggestions()
      .then((res) => {
        const list = res.data ?? [];
        setSuggestions(list);
        // Initialise per-row state from server suggestions
        const initial: typeof rowState = {};
        for (const s of list) {
          // Server might say "other" — map to suggested-type pill cleanly.
          // For "other" we default to the user picking a label themselves;
          // we'll keep "other" as the active type until they change it.
          const initialType: SuggestionType =
            s.suggestedType === "home"
              ? "home"
              : s.suggestedType === "work"
                ? "work"
                : "other";
          // Default name: use inferredName when available, else "Saved place".
          // If the server inferred "home"/"work" we prefer that label as the
          // name too — most users name their home location "Home", not
          // "Durham Road".
          const defaultName =
            s.suggestedType === "home"
              ? "Home"
              : s.suggestedType === "work"
                ? "Work"
                : (s.inferredName ?? "");
          initial[s.id] = {
            type: initialType,
            name: defaultName,
            saving: false,
            saved: false,
          };
        }
        setRowState(initial);
      })
      .catch((err: unknown) => {
        console.warn("[saved-locations-suggest] fetch failed:", err);
        setSuggestions([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSetType = useCallback((id: string, type: SuggestionType) => {
    setRowState((s) => {
      const current = s[id];
      if (!current || current.saving || current.saved) return s;
      // When the user picks Home or Work, auto-update the name to match
      // unless they've already typed something custom. Heuristic: if the
      // current name matches one of the canonical labels (or is empty),
      // overwrite it; otherwise leave it alone.
      const canonicalNames = new Set(["", "Home", "Work", "Depot", "Other"]);
      let nextName = current.name;
      if (canonicalNames.has(current.name)) {
        nextName =
          type === "home"
            ? "Home"
            : type === "work"
              ? "Work"
              : type === "depot"
                ? "Depot"
                : current.name;
      }
      return { ...s, [id]: { ...current, type, name: nextName } };
    });
  }, []);

  const handleSave = useCallback(
    async (suggestion: SuggestedSavedLocation) => {
      const row = rowState[suggestion.id];
      if (!row || row.saving || row.saved) return;
      const name = row.name.trim();
      if (!name) {
        Alert.alert("Name needed", "Give this place a name before saving.");
        return;
      }
      setRowState((s) => ({
        ...s,
        [suggestion.id]: { ...row, saving: true },
      }));
      try {
        // Map "other" → custom on the way out; the server's enum is
        // home / work / depot / custom.
        const locationType: LocationType =
          row.type === "other" ? "custom" : row.type;
        await syncCreateSavedLocation({
          name,
          locationType,
          latitude: suggestion.centroidLat,
          longitude: suggestion.centroidLng,
          radiusMeters: 100,
          geofenceEnabled: false, // anchor-only architecture (17 May refactor)
        });
        setRowState((s) => ({
          ...s,
          [suggestion.id]: { ...row, saving: false, saved: true },
        }));
        // Re-register the anchor so detection still works correctly.
        registerGeofences().catch(() => {});
      } catch (err: unknown) {
        setRowState((s) => ({
          ...s,
          [suggestion.id]: { ...row, saving: false },
        }));
        Alert.alert(
          "Couldn't save",
          err instanceof Error ? err.message : "Try again in a moment."
        );
      }
    },
    [rowState]
  );

  const handleDismiss = useCallback((id: string) => {
    setSuggestions((s) => s?.filter((row) => row.id !== id) ?? null);
    setRowState((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: "Suggested places" }} />
        <ActivityIndicator color={AMBER} />
      </View>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: "Suggested places" }} />
        <EmptyState
          icon="location-outline"
          title="Nothing to suggest yet"
          description="MileClear needs at least 3 trips to spot patterns. Drive a few more journeys and check back — your home, work, and regular stops will surface here."
        />
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Button
            title="Add manually instead"
            icon="add"
            onPress={() => router.replace("/saved-location-form" as never)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Suggested places" }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Places you visit often</Text>
          <Text style={styles.introBody}>
            MileClear spotted {suggestions.length} {suggestions.length === 1 ? "place" : "places"} you've
            been to multiple times. Save them so trips get auto-classified and
            labelled with names you recognise.
          </Text>
        </View>

        {suggestions.map((s) => {
          const row = rowState[s.id];
          if (!row) return null;
          return (
            <View key={s.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.visitCount}>
                    {s.visitCount} {s.visitCount === 1 ? "visit" : "visits"}
                  </Text>
                  <Text style={styles.visitMeta}>
                    Last visited {formatRelative(s.lastVisitedAt)}
                  </Text>
                </View>
                {!row.saved && (
                  <TouchableOpacity
                    onPress={() => handleDismiss(s.id)}
                    hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss suggestion"
                  >
                    <Ionicons name="close" size={20} color={TEXT_3} />
                  </TouchableOpacity>
                )}
              </View>

              {s.inferredName ? (
                <Text style={styles.inferredName} numberOfLines={1}>
                  {s.inferredName}
                </Text>
              ) : null}

              {row.saved ? (
                <View style={styles.savedRow}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                  <Text style={styles.savedText}>Saved as {row.name}</Text>
                </View>
              ) : (
                <>
                  <View style={styles.typeRow}>
                    {TYPE_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.typeChip,
                          row.type === opt.value && styles.typeChipActive,
                        ]}
                        onPress={() => handleSetType(s.id, opt.value)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={opt.label}
                        accessibilityState={{ selected: row.type === opt.value }}
                      >
                        <Ionicons
                          name={opt.icon}
                          size={14}
                          color={row.type === opt.value ? colors.bg : TEXT_2}
                        />
                        <Text
                          style={[
                            styles.typeChipText,
                            row.type === opt.value && styles.typeChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Button
                    title={`Save as ${row.name || "…"}`}
                    icon="checkmark"
                    onPress={() => handleSave(s)}
                    loading={row.saving}
                    disabled={row.saving || !row.name.trim()}
                    style={{ marginTop: 12 }}
                  />
                </>
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} ${Math.floor(days / 7) === 1 ? "week" : "weeks"} ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 80 },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  intro: { marginBottom: 16 },
  introTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 6,
  },
  introBody: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  visitCount: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  visitMeta: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 2,
  },
  inferredName: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_2,
    marginTop: 8,
  },
  typeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
    flexWrap: "wrap",
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  typeChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  typeChipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  typeChipTextActive: {
    color: colors.bg,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  savedText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.green,
  },
  doneButton: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  doneButtonText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
});
