// Dashboard "Road alerts" section (trial, Oct 2026). Renders one of:
//   - for drivers who turned road alerts on: the most serious current or
//     upcoming event on their usual roads, only when there is one;
//   - for drivers who have not, once: an offer to turn it on, shown only when
//     they have enough recent driving for "usual roads" to exist. "Not now"
//     is remembered and the offer never comes back (the switch lives in
//     Settings > Notifications);
//   - otherwise nothing.

import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { RoadAlertsResponse } from "@mileclear/shared";
import { fetchRoadAlerts } from "../../lib/api/roadAlerts";
import { formatAlertTime, markRoadAlertsOfferSeen, roadAlertsOfferSeen, turnOnRoadAlerts } from "../../lib/roadAlerts";
import { colors, fonts, radii } from "../../lib/theme";

type Data = RoadAlertsResponse["data"];

export default function RoadAlertsCard() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [showOffer, setShowOffer] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchRoadAlerts();
      setData(res.data);
      setShowOffer(!res.data.enabled && res.data.offerEligible && !(await roadAlertsOfferSeen()));
    } catch {
      setData(null); // offline or an older API: the card simply does not show
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const turnOn = useCallback(async () => {
    setEnabling(true);
    try {
      await turnOnRoadAlerts();
    } finally {
      setShowOffer(false);
      setEnabling(false);
      load();
    }
  }, [load]);

  const notNow = useCallback(async () => {
    setShowOffer(false);
    await markRoadAlertsOfferSeen();
  }, []);

  if (!data || !data.available) return null;

  if (!data.enabled) {
    if (!showOffer) return null;
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning" size={15} color={colors.amber} />
          </View>
          <Text style={styles.title}>New: road alerts (trial)</Text>
        </View>
        <Text style={styles.line}>A heads-up before you set off if a road you use often is closed or badly delayed.</Text>
        <Text style={styles.meta}>
          Free. Worked out from your own drives, private to you. At most one notification a day, never while you&apos;re
          driving.
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={turnOn} disabled={enabling} accessibilityRole="button" accessibilityLabel="Turn on road alerts">
            {enabling ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={styles.primaryText}>Turn on</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={notNow} accessibilityRole="button">
            <Text style={styles.ghostText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const items = [...data.current, ...data.upcoming];
  if (items.length === 0) return null;
  const top = items[0];
  const starts = top.when === "upcoming" ? formatAlertTime(top.startAt) : null;
  const more = items.length - 1;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push("/road-alerts" as never)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Road alerts. ${top.headline}. ${more > 0 ? `${more} more.` : ""} Tap for details.`}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, top.severity === "closure" && { backgroundColor: colors.redDim }]}>
          <Ionicons
            name={top.severity === "closure" ? "close-circle" : "warning"}
            size={15}
            color={top.severity === "closure" ? colors.red : colors.amber}
          />
        </View>
        <Text style={styles.title}>{top.when === "now" ? "On your usual roads" : "Planned on your usual roads"}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.text3} style={{ marginLeft: "auto" }} />
      </View>
      <Text style={styles.line}>{top.headline}</Text>
      {starts ? <Text style={styles.meta}>Starts {starts}</Text> : null}
      <Text style={styles.meta}>{top.sentence}</Text>
      {more > 0 ? <Text style={styles.more}>{more} more on the Road alerts screen</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginBottom: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text2, fontFamily: fonts.semibold, fontSize: 13 },
  line: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  more: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 12.5, marginTop: 8 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  primaryBtn: {
    backgroundColor: colors.amber,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: "center",
  },
  primaryText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 13 },
  ghostBtn: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostText: { color: colors.text2, fontFamily: fonts.semibold, fontSize: 13 },
});
