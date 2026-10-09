import { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { UpdateReadingSheet, type UpdateReadingVehicle } from "./UpdateReadingSheet";
import {
  deleteOdometerReading,
  fetchVehicleOdometer,
  type OdometerReadingRow,
} from "../../lib/api/odometer";
import { fetchVehicles } from "../../lib/api/vehicles";
import { formatOdo, isNetworkError, shortDateTime, sourceLabel } from "../../lib/odometer/logic";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

/** "Odometer readings": every reading for one vehicle, newest first (SPEC-UX 1.5). */
export function ReadingsView({ vehicleId }: { vehicleId: string | undefined }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<UpdateReadingVehicle | null>(null);
  const [readings, setReadings] = useState<OdometerReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const vehicles = (await fetchVehicles()).data;
      const v = vehicles.find((x) => x.id === vehicleId) ?? vehicles.find((x) => x.isPrimary) ?? vehicles[0];
      if (!v) {
        setVehicle(null);
        setReadings([]);
        setFailed(false);
        return;
      }
      setVehicle({
        id: v.id,
        name: `${v.make} ${v.model}`.trim(),
        registrationPlate: v.registrationPlate,
        createdAt: v.createdAt ?? null,
      });
      const res = await fetchVehicleOdometer(v.id);
      setReadings(
        [...res.data.readings].sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime())
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vehicleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const confirmDelete = (r: OdometerReadingRow) => {
    if (!vehicle) return;
    Alert.alert(
      "Delete this reading?",
      "Your daily log will be worked out again from your other readings and trips.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteOdometerReading(vehicle.id, r.id);
              setReadings((prev) => prev.filter((x) => x.id !== r.id));
              load();
            } catch (err) {
              if (isNetworkError(err)) {
                Alert.alert(
                  "You're offline",
                  "Connect to the internet and try again. Your trips are still being recorded."
                );
              } else {
                Alert.alert("Couldn't delete that", "Please try again in a moment.");
              }
            }
          },
        },
      ]
    );
  };

  const openSource = (r: OdometerReadingRow) => {
    if (!r.sourceId) return;
    // Trip and fuel rows have synthetic ids; sourceId is the real trip or fuel log.
    if (r.source === "trip") router.push(`/trip-form?id=${r.sourceId}` as never);
    else if (r.source === "fuel") router.push(`/fuel-form?id=${r.sourceId}` as never);
  };

  const renderItem = ({ item }: { item: OdometerReadingRow }) => {
    const at = new Date(item.readAt);
    const label = sourceLabel(item.source);
    const typed = item.source === "user";
    const fromOther = !typed;
    const status = item.used ? "Recorded" : "Not used: looks wrong";
    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <Text style={styles.rowFigure} maxFontSizeMultiplier={fontScaleCap.heading}>
            {formatOdo(item.readingMiles)} miles
          </Text>
          <Text style={[styles.rowStatus, !item.used && styles.rowStatusWarn]} maxFontSizeMultiplier={fontScaleCap.body}>
            {status}
          </Text>
        </View>
        <Text style={styles.rowMeta} maxFontSizeMultiplier={fontScaleCap.body}>
          {shortDateTime(at)} · {label}
        </Text>
        {!item.used && item.rejectReason ? (
          <Text style={styles.rowWarn} maxFontSizeMultiplier={fontScaleCap.body}>{item.rejectReason}</Text>
        ) : null}
        {typed ? (
          <TouchableOpacity
            style={styles.rowAction}
            onPress={() => confirmDelete(item)}
            accessibilityRole="button"
            accessibilityLabel={`Delete reading ${formatOdo(item.readingMiles)} miles`}
          >
            <Text style={styles.rowActionDelete} maxFontSizeMultiplier={fontScaleCap.body}>Delete reading</Text>
          </TouchableOpacity>
        ) : fromOther ? (
          <TouchableOpacity
            style={styles.rowAction}
            onPress={() => openSource(item)}
            accessibilityRole="button"
            accessibilityLabel={item.source === "trip" ? "Change it on the trip" : "Change it on the fuel log"}
          >
            <Text style={styles.rowActionText} maxFontSizeMultiplier={fontScaleCap.body}>
              {item.source === "trip" ? "Change it on the trip" : "Change it on the fuel log"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Odometer readings" }} />
      {failed && readings.length === 0 ? (
        <ErrorState
          title="Couldn't load your odometer log"
          description="Pull down to try again."
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      ) : (
        <FlatList
          data={readings}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.amber}
            />
          }
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="speedometer-outline"
                title="No readings yet."
                description="Type in the number on your dashboard and MileClear adds your trips to it."
                action={vehicle ? <Button title="Add reading" onPress={() => setSheetOpen(true)} /> : undefined}
              />
            ) : null
          }
          ListFooterComponent={
            readings.length > 0 && vehicle ? (
              <Button title="Add reading" onPress={() => setSheetOpen(true)} style={{ marginTop: 16 }} />
            ) : null
          }
        />
      )}
      <UpdateReadingSheet
        visible={sheetOpen}
        vehicle={vehicle}
        onClose={() => setSheetOpen(false)}
        onSaved={() => load()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, flexGrow: 1 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  rowFigure: { flexShrink: 1, fontSize: 16, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  rowStatus: { fontSize: 13, fontFamily: fonts.medium, color: colors.text2 },
  rowStatusWarn: { color: colors.amber },
  rowMeta: { fontSize: 13, fontFamily: fonts.regular, color: colors.text3, marginTop: 4 },
  rowWarn: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: colors.amber, marginTop: 4 },
  rowAction: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  rowActionText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  rowActionDelete: { fontSize: 14, fontFamily: fonts.semibold, color: colors.red },
});
