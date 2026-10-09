import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Button } from "../Button";
import { OdometerFigure, StatusChip } from "./OdometerFigure";
import { UpdateReadingSheet, type UpdateReadingVehicle } from "./UpdateReadingSheet";
import { useSync } from "../../lib/sync/context";
import { fetchVehicleOdometer, type VehicleOdometer } from "../../lib/api/odometer";
import {
  basisText,
  figureA11y,
  oldReadingText,
  PENDING_SYNC_TEXT,
} from "../../lib/odometer/logic";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

/**
 * The Odometer section on the vehicle screen (SPEC-UX 1.1), edit mode only.
 * Shows the running figure, how it was worked out, and the buttons to update
 * the reading or open the daily log.
 */
export function OdometerSection({ vehicle }: { vehicle: UpdateReadingVehicle }) {
  const router = useRouter();
  const { pendingCount } = useSync();
  const [data, setData] = useState<VehicleOdometer | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const outcomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchVehicleOdometer(vehicle.id);
      setData(res.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [vehicle.id]);

  // Reload when the screen regains focus (back from the readings list).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(
    () => () => {
      if (outcomeTimer.current) clearTimeout(outcomeTimer.current);
    },
    []
  );

  const handleSaved = useCallback(
    (message: string) => {
      setOutcome(message);
      if (outcomeTimer.current) clearTimeout(outcomeTimer.current);
      outcomeTimer.current = setTimeout(() => setOutcome(null), 4000);
      load();
    },
    [load]
  );

  const openLog = () => router.push(`/odometer-log?vehicleId=${vehicle.id}` as never);
  const openReadings = () =>
    router.push(`/odometer-log?view=readings&vehicleId=${vehicle.id}` as never);

  const current = data?.current ?? null;
  const hasAnyReading = (data?.readings.length ?? 0) > 0;
  const oldText = current ? oldReadingText(current) : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.body}>
        ODOMETER
      </Text>
      <View style={styles.card}>
        {!loaded ? (
          <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>Loading...</Text>
        ) : failed && !data ? (
          <View>
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
              Couldn't load your odometer
            </Text>
            <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
              Check your connection and try again.
            </Text>
            <Button variant="secondary" title="Try again" size="sm" onPress={load} style={{ marginTop: 12 }} />
          </View>
        ) : current ? (
          <View>
            <View accessible accessibilityRole="text" accessibilityLabel={figureA11y(current)}>
              <View style={styles.figureHeader}>
                <Text style={styles.cardTitle} maxFontSizeMultiplier={fontScaleCap.heading}>Current reading</Text>
                <StatusChip recorded={!current.isEstimated} source={current.basis.source} />
              </View>
              <View style={{ marginTop: 12 }}>
                <OdometerFigure miles={current.miles} accessibilityLabel={figureA11y(current)} />
              </View>
              <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
                {basisText(current)}
              </Text>
            </View>
            {pendingCount > 0 ? (
              <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>{PENDING_SYNC_TEXT}</Text>
            ) : null}
            {oldText ? <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>{oldText}</Text> : null}
            {outcome ? (
              <Text style={styles.outcome} accessibilityLiveRegion="polite" maxFontSizeMultiplier={fontScaleCap.body}>
                {outcome}
              </Text>
            ) : null}
            <Button variant="secondary" title="Update reading" onPress={() => setSheetOpen(true)} style={{ marginTop: 16 }} />
            <Button variant="secondary" title="Daily log" onPress={openLog} style={{ marginTop: 10 }} />
          </View>
        ) : (
          <View>
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
              Keep a running odometer
            </Text>
            <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
              Type in the reading on your dashboard and MileClear adds your trips to it. You'll see the reading at the start and end of each day.
            </Text>
            {outcome ? (
              <Text style={styles.outcome} accessibilityLiveRegion="polite" maxFontSizeMultiplier={fontScaleCap.body}>
                {outcome}
              </Text>
            ) : null}
            <Button title="Add reading" onPress={() => setSheetOpen(true)} style={{ marginTop: 16 }} />
          </View>
        )}
      </View>
      {hasAnyReading ? (
        <TouchableOpacity
          style={styles.link}
          onPress={openReadings}
          accessibilityRole="link"
          accessibilityLabel="All readings"
          activeOpacity={0.7}
        >
          <Text style={styles.linkText} maxFontSizeMultiplier={fontScaleCap.body}>All readings</Text>
        </TouchableOpacity>
      ) : null}

      <UpdateReadingSheet
        visible={sheetOpen}
        vehicle={vehicle}
        onClose={() => setSheetOpen(false)}
        onSaved={handleSaved}
        onSeeReadings={openReadings}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.text3,
    letterSpacing: 1,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
  },
  figureHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text1 },
  figure: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.text1,
    fontVariant: ["tabular-nums"],
  },
  status: { fontSize: 13, fontFamily: fonts.medium, color: colors.text2, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, color: colors.text2, marginTop: 6 },
  note: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: colors.text3, marginTop: 10 },
  outcome: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, color: colors.green, marginTop: 10 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  linkText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.amber },
});
