import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchCalendar } from "../../lib/api/user";
import type { CalendarDay } from "@mileclear/shared";

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function WorkCalendarCard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [days, setDays] = useState<CalendarDay[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetchCalendar(year, month);
      setDays(res.data);
    } catch { setDays([]); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = (firstOfMonth.getDay() + 6) % 7; // 0=Mon
  const dayMap = new Map<string, CalendarDay>();
  for (const d of days) dayMap.set(d.date, d);
  const maxEarnings = days.reduce((mx, d) => Math.max(mx, d.earningsPence), 0);

  const todayStr = new Date().toISOString().slice(0, 10);

  const monthLabel = firstOfMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const totalEarnings = days.reduce((s, d) => s + d.earningsPence, 0);
  const totalTrips = days.reduce((s, d) => s + d.tripCount, 0);
  const activeDays = days.filter((d) => d.tripCount > 0 || d.earningsPence > 0).length;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="calendar" size={16} color={AMBER} accessible={false} />
          <Text style={s.title}>Working Calendar</Text>
        </View>
        <View style={s.navRow}>
          <TouchableOpacity onPress={prevMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={18} color={TEXT_2} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={18} color={TEXT_2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Weekday headers */}
      <View style={s.grid}>
        {WEEKDAYS.map((wd, i) => (
          <View key={`hdr-${i}`} style={s.cell}>
            <Text style={s.weekdayLabel}>{wd}</Text>
          </View>
        ))}

        {/* Empty cells before month starts */}
        {Array.from({ length: startDow }).map((_, i) => (
          <View key={`e-${i}`} style={s.cell} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const data = dayMap.get(dateStr);
          const hasActivity = data && (data.tripCount > 0 || data.earningsPence > 0);
          const intensity = data && maxEarnings > 0 ? Math.max(0.2, data.earningsPence / maxEarnings) : 0;
          const isToday = dateStr === todayStr;

          return (
            <View
              key={dateStr}
              style={[
                s.cell,
                s.dayCell,
                hasActivity && { backgroundColor: `rgba(245, 166, 35, ${intensity})` },
                isToday && s.today,
              ]}
              accessible
              accessibilityLabel={
                data
                  ? `${day}: ${formatPence(data.earningsPence)}, ${data.tripCount} trips, ${data.miles} miles`
                  : `${day}: no activity`
              }
            >
              <Text style={[s.dayNum, hasActivity && s.dayNumActive]}>{day}</Text>
              {data && data.earningsPence > 0 && (
                <Text style={s.dayEarnings}>{formatPence(data.earningsPence)}</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Month summary */}
      <View style={s.summary}>
        <Text style={s.summaryItem}>{formatPence(totalEarnings)}</Text>
        <Text style={s.summaryDot}>{"\u00B7"}</Text>
        <Text style={s.summaryItem}>{activeDays} days</Text>
        <Text style={s.summaryDot}>{"\u00B7"}</Text>
        <Text style={s.summaryItem}>{totalTrips} trips</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: TEXT_1 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_500Medium", color: TEXT_1, minWidth: 110, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 3 },
  weekdayLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: TEXT_3 },
  dayCell: { borderRadius: 6, paddingVertical: 4, marginVertical: 1 },
  today: { borderWidth: 1, borderColor: AMBER },
  dayNum: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: TEXT_3 },
  dayNumActive: { color: TEXT_1, fontFamily: "PlusJakartaSans_600SemiBold" },
  dayEarnings: { fontSize: 8, fontFamily: "PlusJakartaSans_500Medium", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  summary: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 10, gap: 6 },
  summaryItem: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", color: TEXT_2 },
  summaryDot: { fontSize: 11, color: TEXT_3 },
});
