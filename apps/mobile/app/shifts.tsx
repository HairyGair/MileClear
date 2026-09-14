// Shifts — standalone history of started/ended work sessions.
//
// Shifts could previously only be started and ended from the dashboard, and
// once ended they vanished from view entirely. 28% of users have recorded at
// least one shift with nowhere to go back and look at them. This screen is
// read-only: the API has no route to edit or delete a shift (PATCH /:id only
// marks one completed, and refuses an already-completed shift), so there are
// no edit or delete controls here — only a plain history plus whatever shift
// is currently running.
//
// Organised rather than flat (13 Sep): a real fleet's shift list is mostly
// accidental starts and stops. On the first account this screen was tested
// against, 7 of 8 shifts were under two minutes and every one of them was
// drawn at the same size as the single real 3h 45m shift, with no month
// separators and the same vehicle name repeated on every row. So: a totals
// line, month headings, and sub-minute empty shifts folded into one
// expandable row per month. Nothing is deleted or hidden permanently — the
// folded row opens.

import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, Stack } from "expo-router";
import { fetchShifts, fetchActiveShift, ShiftWithVehicle } from "../lib/api/shifts";
import { formatMiles } from "@mileclear/shared";
import { EmptyState } from "../components/EmptyState";
import { colors, fonts, spacing, radii } from "../lib/theme";

// GET /shifts enriches each row with tripCount and tripMiles (a Prisma
// _count on trips plus a groupBy sum of distanceMiles), on top of the base
// Shift + vehicle fields the shared ShiftWithVehicle type declares. That
// enrichment isn't in the shared type, so it's added here rather than
// invented — if either field is missing from a response for any reason,
// the row simply omits trip stats rather than showing a fabricated number.
interface ShiftRow extends ShiftWithVehicle {
  tripCount?: number;
  tripMiles?: number;
}

// A shift this short that recorded nothing is a mis-tap, not work. It is
// folded away rather than dropped, because "my shift is missing" is a far
// worse bug than a slightly longer list.
const TRIVIAL_SHIFT_MS = 60_000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function vehicleLabel(vehicle: ShiftRow["vehicle"]): string | null {
  if (!vehicle) return null;
  return `${vehicle.make} ${vehicle.model}`;
}

function shiftDurationMs(shift: ShiftRow): number | null {
  if (!shift.endedAt) return null;
  return new Date(shift.endedAt).getTime() - new Date(shift.startedAt).getTime();
}

function isTrivial(shift: ShiftRow): boolean {
  const ms = shiftDurationMs(shift);
  if (ms == null) return false;
  return ms < TRIVIAL_SHIFT_MS && (shift.tripCount ?? 0) === 0;
}

function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function monthLabelOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase();
}

// One flat array of typed rows rather than a SectionList: the folded group
// has to sit *inside* a month, below that month's real shifts, and swapping
// it for its contents on tap is far simpler to reason about as plain data.
type ListRow =
  | { kind: "month"; key: string; label: string }
  | { kind: "shift"; key: string; shift: ShiftRow }
  | { kind: "folded"; key: string; monthKey: string; count: number };

function ActiveShiftCard({ shift }: { shift: ShiftRow }) {
  const elapsed = formatDuration(Date.now() - new Date(shift.startedAt).getTime());
  const vehicle = vehicleLabel(shift.vehicle);
  return (
    <View
      style={styles.activeCard}
      accessibilityRole="summary"
      accessibilityLabel={`Shift in progress, started ${formatTime(shift.startedAt)}, running for ${elapsed}${
        vehicle ? `, ${vehicle}` : ""
      }`}
    >
      <View style={styles.activeHeaderRow}>
        <View style={styles.liveDot} />
        <Text style={styles.activeLabel}>SHIFT IN PROGRESS</Text>
      </View>
      <Text style={styles.activeElapsed}>{elapsed}</Text>
      <Text style={styles.activeSub}>
        Started {formatTime(shift.startedAt)}
        {vehicle ? ` · ${vehicle}` : ""}
      </Text>
    </View>
  );
}

function ShiftCard({ item, showVehicle }: { item: ShiftRow; showVehicle: boolean }) {
  const vehicle = vehicleLabel(item.vehicle);
  const durationMs = shiftDurationMs(item);
  const hasTripStats = typeof item.tripCount === "number" && typeof item.tripMiles === "number";

  // The spoken label always names the vehicle, even when the visual row
  // hides it as repetition — a screen reader user gets no such context from
  // the rows around it.
  const label = [
    formatDate(item.startedAt),
    `${formatTime(item.startedAt)} to ${item.endedAt ? formatTime(item.endedAt) : "unknown"}`,
    durationMs != null ? formatDuration(durationMs) : null,
    vehicle,
    hasTripStats
      ? `${item.tripCount} ${item.tripCount === 1 ? "trip" : "trips"}, ${formatMiles(item.tripMiles!)}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={label}>
      <View style={styles.cardIconWrap}>
        <Ionicons name="time-outline" size={20} color={colors.text2} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardDate}>{formatDate(item.startedAt)}</Text>
          {durationMs != null && <Text style={styles.cardDuration}>{formatDuration(durationMs)}</Text>}
        </View>
        <Text style={styles.cardTimes}>
          {formatTime(item.startedAt)} – {item.endedAt ? formatTime(item.endedAt) : "unknown"}
        </Text>
        <View style={styles.cardMetaRow}>
          {showVehicle && vehicle && (
            <View style={styles.metaItem}>
              <Ionicons name="car-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText}>{vehicle}</Text>
            </View>
          )}
          {hasTripStats && (
            <View style={styles.metaItem}>
              <Ionicons name="navigate-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText}>
                {item.tripCount} {item.tripCount === 1 ? "trip" : "trips"} · {formatMiles(item.tripMiles!)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ShiftsScreen() {
  const [activeShift, setActiveShift] = useState<ShiftRow | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [activeRes, completedRes] = await Promise.all([
        fetchActiveShift(),
        fetchShifts("completed"),
      ]);
      setActiveShift((activeRes.data[0] as ShiftRow | undefined) ?? null);
      setShifts(completedRes.data as ShiftRow[]);
      setLoadFailed(false);
    } catch {
      // Leave any previously loaded data on screen rather than blanking it;
      // the empty state below only shows when there's truly nothing to show.
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const toggleMonth = useCallback((key: string) => {
    setExpandedMonths((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Totals across everything loaded, so the summary doesn't change meaning
  // as folded groups are opened and closed.
  const totals = useMemo(() => {
    let ms = 0;
    let trips = 0;
    let miles = 0;
    let sawStats = false;
    for (const s of shifts) {
      const d = shiftDurationMs(s);
      if (d != null) ms += d;
      if (typeof s.tripCount === "number") {
        trips += s.tripCount;
        sawStats = true;
      }
      if (typeof s.tripMiles === "number") miles += s.tripMiles;
    }
    return { count: shifts.length, ms, trips, miles, sawStats };
  }, [shifts]);

  // Repeating one vehicle name down every row is noise; with more than one
  // in play it becomes the thing that tells the rows apart.
  const showVehicle = useMemo(() => {
    const names = new Set<string>();
    for (const s of shifts) {
      const v = vehicleLabel(s.vehicle);
      if (v) names.add(v);
    }
    return names.size > 1;
  }, [shifts]);

  const rows = useMemo(() => {
    const out: ListRow[] = [];
    let current = "";
    let bucket: ShiftRow[] = [];

    const flush = () => {
      if (bucket.length === 0) return;
      const real = bucket.filter((s) => !isTrivial(s));
      const trivial = bucket.filter(isTrivial);
      for (const s of real) out.push({ kind: "shift", key: s.id, shift: s });
      if (trivial.length > 0) {
        if (expandedMonths[current]) {
          for (const s of trivial) out.push({ kind: "shift", key: s.id, shift: s });
          out.push({ kind: "folded", key: `fold-${current}`, monthKey: current, count: trivial.length });
        } else {
          out.push({ kind: "folded", key: `fold-${current}`, monthKey: current, count: trivial.length });
        }
      }
      bucket = [];
    };

    for (const s of shifts) {
      const k = monthKeyOf(s.startedAt);
      if (k !== current) {
        flush();
        current = k;
        out.push({ kind: "month", key: `month-${k}`, label: monthLabelOf(s.startedAt) });
      }
      bucket.push(s);
    }
    flush();
    return out;
  }, [shifts, expandedMonths]);

  const showEmpty = !loading && !activeShift && shifts.length === 0;

  const summaryText = [
    `${totals.count} ${totals.count === 1 ? "shift" : "shifts"}`,
    formatDuration(totals.ms),
    totals.sawStats ? `${totals.trips} ${totals.trips === 1 ? "trip" : "trips"}` : null,
    totals.sawStats ? formatMiles(totals.miles) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === "month") {
        return <Text style={styles.monthHeader}>{item.label}</Text>;
      }
      if (item.kind === "shift") {
        return <ShiftCard item={item.shift} showVehicle={showVehicle} />;
      }
      const open = !!expandedMonths[item.monthKey];
      return (
        <TouchableOpacity
          style={styles.foldedRow}
          onPress={() => toggleMonth(item.monthKey)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${item.count} ${
            item.count === 1 ? "shift" : "shifts"
          } under a minute. ${open ? "Tap to hide" : "Tap to show"}.`}
        >
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.text3}
            accessible={false}
          />
          <Text style={styles.foldedText}>
            {open ? "Hide" : "Show"} {item.count} {item.count === 1 ? "shift" : "shifts"} under a minute
          </Text>
        </TouchableOpacity>
      );
    },
    [expandedMonths, showVehicle, toggleMonth]
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Shifts" }} />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />
        }
        ListHeaderComponent={
          <>
            {activeShift && <ActiveShiftCard shift={activeShift} />}
            {loadFailed && (shifts.length > 0 || activeShift) && (
              <Text style={styles.errorBanner}>
                Couldn't refresh shifts. Showing the last loaded data.
              </Text>
            )}
            {!showEmpty && shifts.length > 0 && (
              <View style={styles.summaryCard} accessibilityRole="summary">
                <Text style={styles.summaryText}>{summaryText}</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            loadFailed ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load shifts"
                description="Check your connection and pull down to try again."
              />
            ) : (
              <EmptyState
                icon="time-outline"
                title="No shifts yet"
                description="Start and end a shift from the dashboard. Once a shift ends, it will show up here with its trips and miles."
              />
            )
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  monthHeader: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.text3,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  foldedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.surfaceBorder,
  },
  foldedText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text3,
  },
  errorBanner: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text2,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  // Active shift card
  activeCard: {
    backgroundColor: colors.greenDim,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  activeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  activeLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.green,
    letterSpacing: 0.6,
  },
  activeElapsed: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.text1,
    marginBottom: spacing.xs,
  },
  activeSub: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
  },
  // Completed shift card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardDate: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  cardDuration: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
  cardTimes: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
  },
  cardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text3,
  },
});
