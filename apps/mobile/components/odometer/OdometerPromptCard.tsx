import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "../Button";
import { UpdateReadingSheet, type UpdateReadingVehicle } from "./UpdateReadingSheet";
import { getDatabase } from "../../lib/db";
import { fetchVehicles } from "../../lib/api/vehicles";
import { shouldShowOdometerPrompt } from "../../lib/odometer/logic";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

// "Need odometer readings for work?" (SPEC-UX 1.4). Shown once, on Home under
// the hero, to a Work driver with a vehicle, no reading and 3+ completed
// trips. "Not now" or a saved reading hides it for good on this phone.

const DISMISSED_KEY = "odometer_prompt_dismissed";

export function OdometerPromptCard({ isWork, totalTrips }: { isWork: boolean; totalTrips: number }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<UpdateReadingVehicle | null>(null);
  const [show, setShow] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const remember = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, '1')", [DISMISSED_KEY]);
    } catch {
      // best effort: a failed write only means it may be offered once more
    }
  }, []);

  useEffect(() => {
    // Cheap gates first so most Home loads never touch the network.
    if (!isWork || totalTrips < 3) {
      setShow(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = ?",
          [DISMISSED_KEY]
        );
        if (row) return;
        const res = await fetchVehicles();
        const list = res.data;
        const def = list.find((v) => v.isPrimary) ?? (list.length === 1 ? list[0] : null);
        if (!def) return;
        const ok = shouldShowOdometerPrompt({
          isWork,
          vehicleCount: list.length,
          defaultVehicleHasReading: !!def.odometer,
          completedTrips: totalTrips,
          dismissedOnDevice: false,
        });
        if (cancelled) return;
        if (!ok) {
          // A reading exists (typed elsewhere): never ask on this phone either.
          if (def.odometer) remember();
          return;
        }
        setVehicle({
          id: def.id,
          name: `${def.make} ${def.model}`.trim(),
          registrationPlate: def.registrationPlate ?? null,
          createdAt: def.createdAt ?? null,
        });
        setShow(true);
      } catch {
        // Offline or unreadable: stay quiet rather than risk asking twice.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWork, totalTrips, remember]);

  if (!show || !vehicle) return null;

  return (
    <View style={styles.card}>
      <Ionicons name="speedometer-outline" size={22} color={colors.amber} accessible={false} />
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
        Need odometer readings for work?
      </Text>
      <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
        Type in your odometer once. MileClear adds your trips so you can see the reading at the start and end of each day.
      </Text>
      <View style={styles.actions}>
        <Button title="Add reading" size="sm" fullWidth={false} onPress={() => setSheetOpen(true)} />
        <Button
          variant="ghost"
          title="Not now"
          size="sm"
          fullWidth={false}
          onPress={() => {
            setShow(false);
            remember();
          }}
        />
      </View>
      <UpdateReadingSheet
        visible={sheetOpen}
        vehicle={vehicle}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setShow(false);
          remember();
        }}
        onSeeReadings={() => router.push(`/odometer-log?view=readings&vehicleId=${vehicle.id}` as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginTop: 12,
    marginBottom: 14,
  },
  title: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 16, marginTop: 10 },
  body: { color: colors.text2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
});
