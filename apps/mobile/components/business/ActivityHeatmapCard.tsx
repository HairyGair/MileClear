import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchActivityHeatmap } from "../../lib/api/businessInsights";
import { formatPence } from "@mileclear/shared";
import type { ActivityHeatmap, HeatmapCell } from "@mileclear/shared";

const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

// Compact 3-letter day labels, Monday-first to match UK convention
// (Date.getDay() returns Sunday=0, so we map manually).
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0]; // Date.getDay() value for each row
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Show a tick label every 3 hours so the row stays readable on small screens.
function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

type Mode = "trips" | "earnings";

function intensity(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  // Quadratic ease so a few outlier hours don't blow out the rest of the
  // grid - the reader can still see medium-intensity cells.
  return Math.sqrt(value / max);
}

function cellColor(t: number): string {
  if (t === 0) return "rgba(255,255,255,0.03)";
  // Amber gradient from faint to full intensity.
  const alpha = 0.10 + t * 0.85;
  return `rgba(245,166,35,${alpha.toFixed(2)})`;
}

export function ActivityHeatmapCard() {
  const [data, setData] = useState<ActivityHeatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("trips");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActivityHeatmap({ weeksBack: 12, platform })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  // Index cells by "dow_hour" for O(1) lookup.
  const cellIndex = useMemo(() => {
    const m = new Map<string, HeatmapCell>();
    if (!data) return m;
    for (const c of data.cells) m.set(`${c.dayOfWeek}_${c.hour}`, c);
    return m;
  }, [data]);

  // Compute the max value used for intensity scaling (mode-dependent).
  const maxValue = useMemo(() => {
    if (!data) return 0;
    let max = 0;
    for (const c of data.cells) {
      const v = mode === "trips" ? c.tripCount : c.totalEarningsPence;
      if (v > max) max = v;
    }
    return max;
  }, [data, mode]);

  if (loading && !data) {
    return (
      <View style={[s.card, s.loadingCard]}>
        <ActivityIndicator size="small" color={AMBER} />
      </View>
    );
  }

  if (!data) return null;

  const noActivity = data.totalTrips === 0 && data.totalEarningsPence === 0;

  return (
    <View style={s.card}>
      {/* Header row */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>WHEN YOU DRIVE</Text>
          <Text style={s.title}>Activity heatmap</Text>
        </View>
        <View style={s.modeToggle}>
          <ModePill active={mode === "trips"} onPress={() => setMode("trips")} label="Trips" />
          <ModePill
            active={mode === "earnings"}
            onPress={() => setMode("earnings")}
            label="Earnings"
          />
        </View>
      </View>

      <Text style={s.subtle}>
        Last {data.weeksAnalyzed} weeks {"·"} {data.totalTrips}{" "}
        {data.totalTrips === 1 ? "trip" : "trips"}
        {data.totalEarningsPence > 0 ? ` · ${formatPence(data.totalEarningsPence)}` : ""}
      </Text>

      {/* Platform filter chips */}
      {data.availablePlatforms.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
        >
          <FilterChip
            label="All"
            active={platform === null}
            onPress={() => setPlatform(null)}
          />
          {data.availablePlatforms.map((p) => (
            <FilterChip
              key={p.platform}
              label={`${p.label} (${p.tripCount})`}
              active={platform === p.platform}
              onPress={() => setPlatform(p.platform)}
            />
          ))}
        </ScrollView>
      )}

      {noActivity ? (
        <View style={s.empty}>
          <Ionicons name="map-outline" size={28} color={TEXT_3} />
          <Text style={s.emptyText}>
            No business trips in the last {data.weeksAnalyzed} weeks. Once you record a few,
            you&apos;ll see when you earn most.
          </Text>
        </View>
      ) : (
        <>
          {/* Grid */}
          <View style={s.gridWrap}>
            {/* Hour-tick row across the top */}
            <View style={s.gridRow}>
              <View style={s.dayLabelCell} />
              {HOURS.map((h) => (
                <View key={h} style={s.tickCell}>
                  {h % 3 === 0 && <Text style={s.tickText}>{hourLabel(h)}</Text>}
                </View>
              ))}
            </View>

            {/* 7 day rows */}
            {DAYS.map((dayName, idx) => {
              const dow = DAY_INDEX[idx];
              return (
                <View key={dayName} style={s.gridRow}>
                  <View style={s.dayLabelCell}>
                    <Text style={s.dayText}>{dayName}</Text>
                  </View>
                  {HOURS.map((h) => {
                    const key = `${dow}_${h}`;
                    const cell = cellIndex.get(key);
                    const v = cell
                      ? mode === "trips"
                        ? cell.tripCount
                        : cell.totalEarningsPence
                      : 0;
                    const t = intensity(v, maxValue);
                    const isSelected = selectedKey === key;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={[
                          s.heatCell,
                          { backgroundColor: cellColor(t) },
                          isSelected && s.heatCellSelected,
                        ]}
                        onPress={() => {
                          LayoutAnimation.configureNext(
                            LayoutAnimation.Presets.easeInEaseOut
                          );
                          setSelectedKey(isSelected ? null : key);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          cell
                            ? `${dayName} ${hourLabel(h)}: ${cell.tripCount} trips, ${cell.totalMiles.toFixed(1)} miles, ${formatPence(cell.totalEarningsPence)}`
                            : `${dayName} ${hourLabel(h)}: no activity`
                        }
                      />
                    );
                  })}
                </View>
              );
            })}
          </View>

          {/* Selected cell detail */}
          {selectedKey &&
            (() => {
              const cell = cellIndex.get(selectedKey);
              if (!cell) return null;
              const dayName = DAYS[DAY_INDEX.indexOf(cell.dayOfWeek)] ?? "";
              const hourLab = hourLabel(cell.hour);
              const nextHourLab = hourLabel((cell.hour + 1) % 24);
              return (
                <View style={s.cellDetail}>
                  <Text style={s.cellDetailHeader}>
                    {dayName} {hourLab}–{nextHourLab}
                  </Text>
                  <View style={s.cellStatsRow}>
                    <View style={s.cellStat}>
                      <Text style={s.cellStatValue}>{cell.tripCount}</Text>
                      <Text style={s.cellStatLabel}>
                        {cell.tripCount === 1 ? "trip" : "trips"}
                      </Text>
                    </View>
                    <View style={s.cellStat}>
                      <Text style={s.cellStatValue}>{cell.totalMiles.toFixed(1)}</Text>
                      <Text style={s.cellStatLabel}>miles</Text>
                    </View>
                    {cell.totalEarningsPence > 0 && (
                      <View style={s.cellStat}>
                        <Text style={s.cellStatValue}>
                          {formatPence(cell.totalEarningsPence)}
                        </Text>
                        <Text style={s.cellStatLabel}>earned</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

          <Text style={s.legend}>
            Tap a cell for the breakdown. Brighter = more {mode === "trips" ? "activity" : "earnings"}.
          </Text>
        </>
      )}
    </View>
  );
}

function ModePill({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.modePill, active && s.modePillActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.modePillText, active && s.modePillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.chip, active && s.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 12,
  },
  loadingCard: {
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  label: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    color: TEXT_1,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 2,
  },
  subtle: {
    color: TEXT_3,
    fontSize: 12,
    marginBottom: 10,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: 2,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  modePillActive: {
    backgroundColor: AMBER,
  },
  modePillText: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "600",
  },
  modePillTextActive: {
    color: "#0a0f1a",
    fontWeight: "700",
  },
  chipsRow: {
    paddingVertical: 6,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "rgba(255,255,255,0.02)",
    marginRight: 6,
  },
  chipActive: {
    borderColor: AMBER,
    backgroundColor: "rgba(245,166,35,0.10)",
  },
  chipText: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "600",
  },
  chipTextActive: {
    color: AMBER,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 22,
    gap: 10,
  },
  emptyText: {
    color: TEXT_2,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  gridWrap: {
    marginTop: 8,
  },
  gridRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  dayLabelCell: {
    width: 30,
    justifyContent: "center",
  },
  dayText: {
    color: TEXT_2,
    fontSize: 10,
    fontWeight: "600",
  },
  tickCell: {
    flex: 1,
    height: 12,
    alignItems: "flex-start",
  },
  tickText: {
    color: TEXT_3,
    fontSize: 8,
  },
  heatCell: {
    flex: 1,
    height: 16,
    marginRight: 1,
    borderRadius: 2,
  },
  heatCellSelected: {
    borderWidth: 1,
    borderColor: AMBER,
  },
  cellDetail: {
    marginTop: 12,
    backgroundColor: "rgba(245,166,35,0.06)",
    borderRadius: 10,
    padding: 12,
  },
  cellDetailHeader: {
    color: AMBER,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  cellStatsRow: {
    flexDirection: "row",
    gap: 16,
  },
  cellStat: {
    alignItems: "flex-start",
  },
  cellStatValue: {
    color: TEXT_1,
    fontSize: 16,
    fontWeight: "700",
  },
  cellStatLabel: {
    color: TEXT_2,
    fontSize: 10,
    marginTop: 1,
  },
  legend: {
    color: TEXT_3,
    fontSize: 10,
    marginTop: 10,
    textAlign: "center",
  },
});
