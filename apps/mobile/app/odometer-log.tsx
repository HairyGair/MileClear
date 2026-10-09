import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { OdometerFigure, RecordedMark, StatusChip } from "../components/odometer/OdometerFigure";
import { ReadingsView } from "../components/odometer/ReadingsView";
import { UpdateReadingSheet } from "../components/odometer/UpdateReadingSheet";
import { usePaywall } from "../components/paywall";
import { getDatabase } from "../lib/db";
import { useUser } from "../lib/user/context";
import { fetchVehicles, type VehicleWithCaz } from "../lib/api/vehicles";
import { downloadAndShareExport } from "../lib/api/exports";
import {
  fetchOdometerDays,
  fetchVehicleOdometer,
  odometerLogCsvPath,
  type OdometerCurrent,
  type OdometerDay,
} from "../lib/api/odometer";
import {
  basisText,
  dayCardA11y,
  dayKeyOf,
  differenceAlert,
  differenceLine,
  figureA11y,
  formatDayMiles,
  formatOdo,
  isOdometerPeriod,
  mileageRowParts,
  parseDayKey,
  PERIOD_LABELS,
  periodRange,
  shortDate,
  splitShares,
  validateCustomRange,
  type OdometerPeriod,
} from "../lib/odometer/logic";
import { colors, fonts, fontScaleCap, radii } from "../lib/theme";

const PERIOD_KEY = "odometer_log_period";
const PERIODS: OdometerPeriod[] = ["this_week", "last_week", "this_month", "custom"];

export default function OdometerLogScreen() {
  const { view, vehicleId } = useLocalSearchParams<{ view?: string; vehicleId?: string }>();
  if (view === "readings") return <ReadingsView vehicleId={vehicleId} />;
  return <LogView />;
}

function LogView() {
  const router = useRouter();
  const { user } = useUser();
  const { showPaywall } = usePaywall();
  const params = useLocalSearchParams<{ date?: string; vehicleId?: string }>();
  const listRef = useRef<FlatList<OdometerDay>>(null);

  const [vehicles, setVehicles] = useState<VehicleWithCaz[]>([]);
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.vehicleId ?? null);
  const [period, setPeriod] = useState<OdometerPeriod>("this_week");
  const [periodReady, setPeriodReady] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date>(() => new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const [customTo, setCustomTo] = useState<Date>(() => new Date());
  const [current, setCurrent] = useState<OdometerCurrent | null>(null);
  const [days, setDays] = useState<OdometerDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const handledDateRef = useRef<string | null>(null);

  // ── Period: remembered per device, overridden by ?date= ───────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: OdometerPeriod = "this_week";
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = ?",
          [PERIOD_KEY]
        );
        if (row && isOdometerPeriod(row.value)) saved = row.value;
      } catch {
        // Nothing remembered: default to this week.
      }
      if (cancelled) return;
      // Opened on a given day (Trips tab line): show a window around it
      // unless this week already contains it.
      const target = params.date ? parseDayKey(params.date) : null;
      if (target) {
        const week = periodRange("this_week");
        const key = dayKeyOf(target);
        if (key >= week.from && key <= week.to) {
          setPeriod("this_week");
        } else {
          setPeriod("custom");
          const from = new Date(target.getFullYear(), target.getMonth(), target.getDate() - 3, 12);
          const to = new Date(Math.min(Date.now(), new Date(target.getFullYear(), target.getMonth(), target.getDate() + 3, 12).getTime()));
          setCustomFrom(from);
          setCustomTo(to);
        }
      } else {
        setPeriod(saved);
      }
      setPeriodReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choosePeriod = (p: OdometerPeriod) => {
    setPeriod(p);
    (async () => {
      try {
        const db = await getDatabase();
        await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [PERIOD_KEY, p]);
      } catch {
        // best effort
      }
    })();
  };

  const range = useMemo(() => {
    if (period === "custom") return { from: dayKeyOf(customFrom), to: dayKeyOf(customTo) };
    return periodRange(period);
  }, [period, customFrom, customTo]);
  const rangeError = period === "custom" ? validateCustomRange(customFrom, customTo) : null;

  const selected = useMemo(() => {
    if (vehicles.length === 0) return null;
    return (
      vehicles.find((v) => v.id === selectedId) ??
      vehicles.find((v) => v.isPrimary) ??
      vehicles[0]
    );
  }, [vehicles, selectedId]);

  // ── Data ──────────────────────────────────────────────────────────
  const loadVehicles = useCallback(async () => {
    try {
      const res = await fetchVehicles();
      setVehicles(res.data);
      setVehiclesLoaded(true);
      return res.data;
    } catch {
      setFailed(true);
      setVehiclesLoaded(true);
      setLoading(false);
      return null;
    }
  }, []);

  const loadLog = useCallback(async () => {
    if (!selected || rangeError) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [odo, daysRes] = await Promise.all([
        fetchVehicleOdometer(selected.id),
        fetchOdometerDays({ vehicleId: selected.id, from: range.from, to: range.to }),
      ]);
      setCurrent(odo.data.current);
      setDays([...daysRes.data].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
      setFailed(false);
    } catch {
      // Never leave the previous vehicle's figure on screen under this one.
      setCurrent(null);
      setDays([]);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selected, range.from, range.to, rangeError]);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  useEffect(() => {
    if (!periodReady || !vehiclesLoaded) return;
    setLoading(true);
    loadLog();
  }, [periodReady, vehiclesLoaded, loadLog]);

  // ── Scroll to ?date= and outline that day for two seconds ─────────
  useEffect(() => {
    const target = params.date;
    if (!target || handledDateRef.current === target || loading) return;
    const index = days.findIndex((d) => d.date === target);
    if (index < 0) return;
    handledDateRef.current = target;
    setHighlight(target);
    const t1 = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.1, animated: true });
      } catch {
        // list not laid out yet: the outline still shows
      }
    }, 250);
    const t2 = setTimeout(() => setHighlight(null), 2250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [params.date, days, loading]);

  // ── Actions ───────────────────────────────────────────────────────
  const openTripsForDay = (date: string, unsortedOnly = false) => {
    const q = unsortedOnly ? `day=${date}&filter=unclassified` : `day=${date}`;
    router.navigate(`/(tabs)/trips?${q}` as never);
  };

  const handleDownload = async () => {
    if (!selected) return;
    if (!user?.isPremium) {
      showPaywall("odometer_log_csv");
      return;
    }
    setDownloading(true);
    try {
      await downloadAndShareExport(
        odometerLogCsvPath({ vehicleId: selected.id, from: range.from, to: range.to }),
        `mileclear-odometer-log-${range.from}-to-${range.to}.csv`,
        "text/csv"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      if (msg === "Premium subscription required") {
        showPaywall("odometer_log_csv");
      } else {
        Alert.alert("Export failed", msg);
      }
    } finally {
      setDownloading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadVehicles().then(() => loadLog());
  };

  const vehicleName = selected ? `${selected.make} ${selected.model}`.trim() : "";

  // ── Header pieces ─────────────────────────────────────────────────
  const header = (
    <View>
      {vehicles.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          accessibilityRole="radiogroup"
        >
          {vehicles.map((v) => {
            const on = selected?.id === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => {
                  setSelectedId(v.id);
                  setCurrent(null);
                  setDays([]);
                  setFailed(false);
                  setLoading(true);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                hitSlop={{ top: 4, bottom: 4 }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={fontScaleCap.body}>
                  {`${v.make} ${v.model}`.trim()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {current ? (
        <View style={styles.topCard}>
          <View accessible accessibilityRole="text" accessibilityLabel={figureA11y(current)}>
            <View style={styles.topHeader}>
              <Text style={styles.topFigure} maxFontSizeMultiplier={fontScaleCap.heading}>
                {current.isEstimated ? "Now about" : "Now"}
              </Text>
              <StatusChip recorded={!current.isEstimated} source={current.basis.source} />
            </View>
            <View style={{ marginTop: 10 }}>
              <OdometerFigure miles={current.miles} accessibilityLabel={figureA11y(current)} />
            </View>
            <Text style={styles.topBody} maxFontSizeMultiplier={fontScaleCap.body}>
              {current.isEstimated && current.basis.source === "user"
                ? `Estimated from your reading on ${shortDate(new Date(current.basis.readAt))} plus your trips.`
                : basisText(current)}
            </Text>
          </View>
          <Button
            title="Update reading"
            size="sm"
            fullWidth={false}
            onPress={() => setSheetOpen(true)}
            style={{ marginTop: 12, alignSelf: "flex-start" }}
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipRow, { marginTop: 16 }]}
        accessibilityRole="radiogroup"
      >
        {PERIODS.map((p) => {
          const on = period === p;
          return (
            <TouchableOpacity
              key={p}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => choosePeriod(p)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              hitSlop={{ top: 4, bottom: 4 }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={fontScaleCap.body}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {period === "custom" ? (
        <View style={styles.customWrap}>
          <DateTimePickerField
            label="From"
            mode="date"
            value={customFrom}
            maximumDate={new Date()}
            hideNow
            onChange={setCustomFrom}
          />
          <DateTimePickerField
            label="To"
            mode="date"
            value={customTo}
            maximumDate={new Date()}
            hideNow
            onChange={setCustomTo}
          />
          {rangeError ? (
            <Text style={styles.rangeError} accessibilityRole="alert" maxFontSizeMultiplier={fontScaleCap.body}>
              {rangeError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {current && days.length > 0 ? (
        <View style={styles.legendRow}>
          <RecordedMark />
          <Text style={styles.legendText} maxFontSizeMultiplier={fontScaleCap.body}>
            Recorded = a reading you or a trip gave us. est. = worked out from your trips.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const footer = current && days.length > 0 ? (
    <View>
      <Text style={styles.footerNote} maxFontSizeMultiplier={fontScaleCap.body}>
        Figures marked est. can change if you edit, add or delete trips.
      </Text>
      <TouchableOpacity
        style={styles.downloadRow}
        onPress={handleDownload}
        disabled={downloading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={user?.isPremium ? "Download as CSV" : "Download as CSV, Pro"}
        accessibilityHint="For your employer's mileage form"
      >
        <Ionicons
          name={user?.isPremium ? "download-outline" : "lock-closed-outline"}
          size={20}
          color={colors.text2}
          accessible={false}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.downloadTitle} maxFontSizeMultiplier={fontScaleCap.body}>Download as CSV</Text>
          <Text style={styles.downloadHint} maxFontSizeMultiplier={fontScaleCap.body}>For your employer's mileage form</Text>
        </View>
        {downloading ? (
          <ActivityIndicator color={colors.amber} accessibilityLabel="Loading" />
        ) : !user?.isPremium ? (
          <View style={styles.proChip}>
            <Text style={styles.proChipText}>PRO</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  ) : null;

  // ── States that replace the list ──────────────────────────────────
  if (!vehiclesLoaded && !failed) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.amber} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (failed && !current && days.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Couldn't load your odometer log"
          description="Pull down to try again."
          onRetry={() => {
            setFailed(false);
            setLoading(true);
            loadVehicles().then(() => loadLog());
          }}
        />
      </View>
    );
  }

  if (vehiclesLoaded && vehicles.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="car-outline"
          title="Add a vehicle first"
          description="The odometer belongs to a vehicle. Add yours and type in its reading."
          action={<Button title="Add vehicle" onPress={() => router.push("/vehicle-form" as never)} />}
        />
      </View>
    );
  }

  const noReading = !loading && !current;

  return (
    <View style={styles.container}>
      {noReading ? (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
        >
          {vehicles.length > 1 ? header : null}
          <EmptyState
            icon="speedometer-outline"
            title="Add your odometer reading"
            description="Type in the number on your dashboard. MileClear adds your trips to it and shows the reading at the start and end of each day."
            action={<Button title="Add reading" onPress={() => setSheetOpen(true)} />}
          />
        </ScrollView>
      ) : (
        <FlatList
          ref={listRef}
          data={days}
          keyExtractor={(d) => `${d.vehicleId}:${d.date}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }) => (
            <DayCard
              day={item}
              highlighted={highlight === item.date}
              onOpenDay={() => openTripsForDay(item.date)}
              onOpenUnsorted={() => openTripsForDay(item.date, true)}
            />
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={{ marginTop: 32 }} color={colors.amber} accessibilityLabel="Loading" />
            ) : rangeError ? null : (
              <EmptyState
                size="card"
                icon="calendar-outline"
                title="No driving in these dates"
                description="Pick other dates, or check back after your next trip."
              />
            )
          }
        />
      )}

      <UpdateReadingSheet
        visible={sheetOpen}
        vehicle={
          selected
            ? {
                id: selected.id,
                name: vehicleName,
                registrationPlate: selected.registrationPlate,
                createdAt: selected.createdAt ?? null,
              }
            : null
        }
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setLoading(true);
          loadLog();
        }}
        onSeeReadings={() =>
          selected && router.push(`/odometer-log?view=readings&vehicleId=${selected.id}` as never)
        }
      />
    </View>
  );
}

function Figure({
  label,
  value,
  recorded,
}: {
  label: string;
  value: number | null;
  recorded: boolean;
}) {
  return (
    <View style={styles.figureRow}>
      <Text style={styles.figureLabel} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
      {value == null ? (
        <Text style={styles.noReading} maxFontSizeMultiplier={fontScaleCap.body}>No reading yet</Text>
      ) : (
        <View style={styles.figureValueWrap}>
          <OdometerFigure size="compact" miles={value} accessibilityLabel={`${formatOdo(value)} miles`} />
          {recorded ? (
            <View style={styles.recordedMark}>
              <RecordedMark />
              <Text style={styles.recordedText} maxFontSizeMultiplier={fontScaleCap.body}>Recorded</Text>
            </View>
          ) : (
            <Text style={styles.estText} maxFontSizeMultiplier={fontScaleCap.body}>est.</Text>
          )}
        </View>
      )}
    </View>
  );
}

function DayCard({
  day,
  highlighted,
  onOpenDay,
  onOpenUnsorted,
}: {
  day: OdometerDay;
  highlighted: boolean;
  onOpenDay: () => void;
  onOpenUnsorted: () => void;
}) {
  const date = parseDayKey(day.date) ?? new Date();
  const diffText = differenceLine(day.difference);
  const parts = mileageRowParts(day);
  const hasUnsorted = Math.round(day.notSortedMiles * 10) > 0;
  const shares = splitShares(day);
  return (
    <View style={[styles.dayCard, highlighted && styles.dayCardHighlight]}>
      <TouchableOpacity
        onPress={onOpenDay}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={dayCardA11y(day, date)}
        accessibilityHint="Opens that day's trips"
      >
        <Text style={styles.dayTitle} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
          {shortDate(date)}
        </Text>
        <Figure label="Start" value={day.opening} recorded={day.openingRecorded} />
        <Figure label="End" value={day.closing} recorded={day.closingRecorded} />
        <View style={styles.splitLine} accessible={false}>
          <View style={styles.splitItem}>
            <Ionicons name="briefcase-outline" size={12} color={colors.amber} accessible={false} />
            <Text style={[styles.splitText, { color: colors.amber }]} maxFontSizeMultiplier={fontScaleCap.body}>
              {parts[0]}
            </Text>
          </View>
          <View style={styles.splitItem}>
            <Ionicons name="person-outline" size={12} color={colors.text2} accessible={false} />
            <Text style={[styles.splitText, { color: colors.text2 }]} maxFontSizeMultiplier={fontScaleCap.body}>
              {parts[1]}
            </Text>
          </View>
        </View>
        <View style={styles.splitBar} accessible={false}>
          {shares.business > 0 ? <View style={{ flex: shares.business, backgroundColor: colors.amber }} /> : null}
          {shares.personal > 0 ? <View style={{ flex: shares.personal, backgroundColor: colors.personalEdge }} /> : null}
          {shares.notSorted > 0 ? <View style={{ flex: shares.notSorted, backgroundColor: colors.hairline }} /> : null}
        </View>
      </TouchableOpacity>
      {hasUnsorted ? (
        <TouchableOpacity
          style={styles.unsortedRow}
          onPress={onOpenUnsorted}
          accessibilityRole="button"
          accessibilityLabel={`Not sorted ${formatDayMiles(day.notSortedMiles)} miles. Opens the trips to sort.`}
        >
          <Text style={styles.unsortedText} maxFontSizeMultiplier={fontScaleCap.body}>
            {parts[2]}
          </Text>
        </TouchableOpacity>
      ) : null}
      {diffText ? (
        <TouchableOpacity
          style={styles.correctionRow}
          onPress={() => {
            const a = differenceAlert(day.difference);
            Alert.alert(a.title, a.body, [{ text: "OK" }]);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${diffText}. Tap to find out why.`}
        >
          <Ionicons name="swap-vertical-outline" size={16} color={colors.text2} accessible={false} />
          <Text style={styles.diffText} maxFontSizeMultiplier={fontScaleCap.body}>{diffText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    flexShrink: 0,
  },
  chipOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  chipText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text2 },
  chipTextOn: { color: colors.bg },
  topCard: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
  },
  topHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topFigure: { fontSize: 20, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  topBody: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, color: colors.text2, marginTop: 4 },
  customWrap: { marginTop: 8 },
  rangeError: { fontSize: 13, fontFamily: fonts.medium, color: colors.red, marginTop: 8 },
  legendRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14, marginBottom: 8 },
  legendText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular, color: colors.text2 },
  legend: { fontSize: 12, lineHeight: 17, fontFamily: fonts.regular, color: colors.text3, marginTop: 14, marginBottom: 8 },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginTop: 10,
  },
  dayCardHighlight: { borderColor: colors.amber, borderWidth: 2 },
  dayTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1, marginBottom: 6 },
  figureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 30,
    gap: 8,
  },
  figureLabel: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  figureValueWrap: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, flexWrap: "wrap" },
  figureValue: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  noReading: { fontSize: 14, fontFamily: fonts.regular, color: colors.text3 },
  recordedMark: { flexDirection: "row", alignItems: "center", gap: 4 },
  recordedText: { fontSize: 13, fontFamily: fonts.medium, color: colors.text1 },
  estText: { fontSize: 13, fontFamily: fonts.medium, color: colors.text2 },
  dayMiles: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  unsortedRow: { minHeight: 36, justifyContent: "center", alignSelf: "flex-start" },
  unsortedText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.amber, fontVariant: ["tabular-nums"] },
  correctionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.bg,
  },
  diffText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.text1, fontVariant: ["tabular-nums"] },
  splitLine: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2, marginTop: 8 },
  splitItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  splitText: { fontSize: 12, fontFamily: fonts.semibold, fontVariant: ["tabular-nums"] },
  splitBar: { flexDirection: "row", height: 3, borderRadius: 1.5, overflow: "hidden", marginTop: 6, backgroundColor: colors.hairline },
  footerNote: { fontSize: 12, lineHeight: 17, fontFamily: fonts.regular, color: colors.text3, marginTop: 16 },
  downloadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    marginTop: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  downloadTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1 },
  downloadHint: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  proChip: { backgroundColor: colors.amberDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm },
  proChipText: { fontSize: 11, fontFamily: fonts.semibold, color: colors.amber },
});
