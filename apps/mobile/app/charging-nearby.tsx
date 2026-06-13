// Nearby public EV chargers (Open Charge Map). The electric analogue of the
// fuel "nearby prices" view: a list sorted by distance with connector + power,
// access type and a directions button. Data © Open Charge Map (attribution
// shown, per their CC BY 4.0 licence).

import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getCurrentLocation } from "../lib/location/geocoding";
import { openDirections } from "../lib/location/directions";
import { fetchNearbyChargers } from "../lib/api/charging";
import type { ChargePoint } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

const ACCESS_LABEL: Record<string, string> = {
  public: "Public",
  membership: "Membership",
  pay_at_location: "Pay here",
  restricted: "Restricted",
  unknown: "",
};

export default function ChargingNearbyScreen() {
  const [chargers, setChargers] = useState<ChargePoint[]>([]);
  const [attribution, setAttribution] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        setError("Location access is needed to find nearby chargers.");
        return;
      }
      const res = await fetchNearbyChargers(loc.lat, loc.lng, 5);
      setChargers(res.chargers);
      setAttribution(res.attribution);
      if (res.chargers.length === 0) {
        setError("No chargers found nearby — or charge-point data isn't configured yet.");
      }
    } catch {
      setError("Couldn't load nearby chargers. Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: "Nearby Chargers" }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
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
        >
          {error && chargers.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="flash-off-outline" size={28} color={colors.text3} />
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : (
            <>
              {chargers.map((c) => (
                <View key={c.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {c.operator ? `${c.operator} · ` : ""}{c.distanceMiles} mi
                        {ACCESS_LABEL[c.access] ? ` · ${ACCESS_LABEL[c.access]}` : ""}
                      </Text>
                    </View>
                    {c.maxPowerKw != null && (
                      <View style={styles.powerPill}>
                        <Ionicons name="flash" size={11} color={colors.amber} />
                        <Text style={styles.powerText}>{Math.round(c.maxPowerKw)}kW</Text>
                      </View>
                    )}
                  </View>

                  {c.connectors.length > 0 && (
                    <View style={styles.connectorRow}>
                      {c.connectors.slice(0, 4).map((conn, i) => (
                        <Text key={i} style={styles.connectorChip}>
                          {conn.type}{conn.count > 1 ? ` ×${conn.count}` : ""}
                          {conn.powerKw != null ? ` ${Math.round(conn.powerKw)}kW` : ""}
                        </Text>
                      ))}
                    </View>
                  )}

                  <View style={styles.cardFooter}>
                    {c.costNote ? <Text style={styles.costNote} numberOfLines={1}>{c.costNote}</Text> : <View style={{ flex: 1 }} />}
                    <TouchableOpacity
                      style={styles.dirBtn}
                      onPress={() => openDirections(c.latitude, c.longitude, c.name)}
                      accessibilityRole="button"
                      accessibilityLabel={`Directions to ${c.name}`}
                    >
                      <Ionicons name="navigate" size={13} color={colors.bg} />
                      <Text style={styles.dirBtnText}>Directions</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {attribution ? <Text style={styles.attribution}>{attribution}</Text> : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16 },
  emptyWrap: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { color: colors.text3, fontFamily: fonts.medium, fontSize: 13.5, textAlign: "center", paddingHorizontal: 24, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceBorder, padding: 13, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name: { color: colors.text1, fontFamily: fonts.bold, fontSize: 14 },
  meta: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  powerPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,166,35,0.12)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  powerText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 11.5 },
  connectorRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
  connectorChip: { color: colors.text2, fontFamily: fonts.medium, fontSize: 11, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: "hidden" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  costNote: { flex: 1, color: colors.text3, fontFamily: fonts.regular, fontSize: 11.5 },
  dirBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.amber, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  dirBtnText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 12.5 },
  attribution: { color: colors.text3, fontFamily: fonts.regular, fontSize: 10.5, textAlign: "center", marginTop: 8 },
});
