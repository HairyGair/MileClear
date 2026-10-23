import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { defaultLogbookPeriod, exportVehicleLabel, nzDate, type ExportVehicleLike } from "@mileclear/shared";
import { DateTimePickerField } from "../DateTimePickerField";
import { PickerSheet } from "../trip/PickerSheet";
import { downloadAndShareExport } from "../../lib/api/exports";
import { fetchVehicles } from "../../lib/api/vehicles";
import { dateForNzDay, nzDayOf, nzLogbookEnd, nzLogbookFilename, nzLogbookPath } from "../../lib/country/nzLogbook";
import { colors, fonts } from "../../lib/theme";

type Vehicle = ExportVehicleLike & { isPrimary?: boolean };

interface Props {
  /** null while the profile is loading. */
  isPremium: boolean | null;
  showPaywall: () => void;
  /** Another download is running on the screen: don't start a second. */
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}

/**
 * New Zealand drivers only (23 Oct 2026): IRD's 90-day vehicle logbook, for
 * one vehicle, from a chosen first day. The screen decides who sees it.
 */
export function NzLogbookSection({ isPremium, showPaywall, busy, onBusyChange }: Props) {
  const [from, setFrom] = useState(() => defaultLogbookPeriod().from);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState<"pdf" | "csv" | null>(null);

  useEffect(() => {
    let live = true;
    fetchVehicles()
      .then((r) => {
        if (!live) return;
        const list = r.data as Vehicle[];
        setVehicles(list);
        setVehicleId((cur) => cur ?? (list.find((v) => v.isPrimary) ?? list[0])?.id);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const vehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);
  const to = nzLogbookEnd(from);
  // The 90 days have to be over: the last possible first day is 90 days before yesterday's end.
  const latestFrom = useMemo(() => dateForNzDay(defaultLogbookPeriod().from), []);

  const download = useCallback(
    async (format: "pdf" | "csv") => {
      if (busy || loading) return;
      if (isPremium === false) {
        showPaywall();
        return;
      }
      setLoading(format);
      onBusyChange(true);
      try {
        await downloadAndShareExport(
          nzLogbookPath(format, { from, vehicleId }),
          nzLogbookFilename(format, from),
          format === "pdf" ? "application/pdf" : "text/csv"
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Download failed";
        if (msg === "Premium subscription required") showPaywall();
        else Alert.alert("Download failed", msg);
      } finally {
        setLoading(null);
        onBusyChange(false);
      }
    },
    [busy, loading, isPremium, showPaywall, onBusyChange, from, vehicleId]
  );

  return (
    <View style={s.wrap}>
      <Text style={s.sectionTitle}>90-day logbook (IRD)</Text>
      <Text style={s.desc}>
        IRD asks for a logbook of at least 90 days in a row to set your business use. This one lists every trip
        in the 90 days with its date, distance and reason, and works out your business percentage.
      </Text>

      {vehicles.length > 1 && (
        <TouchableOpacity
          style={s.row}
          onPress={() => setPicking(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Vehicle: ${vehicle ? exportVehicleLabel(vehicle) : "choose"}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Vehicle</Text>
            <Text style={s.value}>{vehicle ? exportVehicleLabel(vehicle) : "Choose a vehicle"}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.text3} />
        </TouchableOpacity>
      )}

      <DateTimePickerField
        label="First day"
        mode="date"
        value={dateForNzDay(from)}
        onChange={(d) => setFrom(nzDayOf(d))}
        maximumDate={latestFrom}
      />
      <Text style={s.note}>
        {nzDate(from)} to {nzDate(to)}. Write the odometer reading on the first and last day in from your car.
      </Text>

      {(["pdf", "csv"] as const).map((format) => (
        <TouchableOpacity
          key={format}
          style={s.row}
          onPress={() => download(format)}
          disabled={busy || loading !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Download the 90-day logbook as ${format.toUpperCase()}`}
          accessibilityState={{ disabled: busy || loading !== null }}
        >
          <View style={s.iconWrap}>
            <Ionicons name={format === "pdf" ? "book-outline" : "grid"} size={20} color={format === "pdf" ? colors.amber : colors.text3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{format === "pdf" ? "Logbook (PDF)" : "Logbook (CSV)"}</Text>
            <Text style={s.rowDesc}>
              {format === "pdf" ? "Ready to keep or print, with the summary at the top." : "The same trips, for a spreadsheet."}
            </Text>
          </View>
          {loading === format ? (
            <ActivityIndicator color={colors.amber} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />
          )}
        </TouchableOpacity>
      ))}

      <PickerSheet
        visible={picking}
        title="Which vehicle?"
        options={vehicles.map((v) => ({ key: v.id, label: exportVehicleLabel(v) }))}
        selectedKey={vehicleId}
        onPick={(key) => setVehicleId(key)}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 18 },
  sectionTitle: { fontSize: 18, fontFamily: fonts.bold, color: "#fff", marginBottom: 6 },
  desc: { fontSize: 13, fontFamily: fonts.regular, color: colors.text3, lineHeight: 18, marginBottom: 12 },
  note: { fontSize: 12, fontFamily: fonts.regular, color: colors.text3, lineHeight: 17, marginTop: 4, marginBottom: 12 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  label: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, marginBottom: 2 },
  value: { fontSize: 15, fontFamily: fonts.semibold, color: "#fff" },
  title: { fontSize: 15, fontFamily: fonts.semibold, color: "#fff", marginBottom: 4 },
  rowDesc: { fontSize: 13, fontFamily: fonts.regular, color: colors.text3, lineHeight: 18 },
});
