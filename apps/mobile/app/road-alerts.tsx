// Road alerts on your usual roads (trial, Oct 2026).
//
// Serious events on the roads this driver uses often (closures, lanes shut or
// incidents with long delays), and planned closures and roadworks on those
// roads in the next 7 days. "Usual roads" are worked out on our server from
// the driver's own recent drives and never shared. Not a sat-nav: no live
// traffic, nothing while driving. Opened from the dashboard card, Settings and
// the pre-departure push (data.action "open_road_alerts").

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { RoadAlertItem, RoadAlertsResponse } from "@mileclear/shared";
import { fetchRoadAlerts } from "../lib/api/roadAlerts";
import { formatAlertTime, turnOnRoadAlerts } from "../lib/roadAlerts";
import { colors, fonts, radii } from "../lib/theme";

type Data = RoadAlertsResponse["data"];

function AlertRow({ item }: { item: RoadAlertItem }) {
  const closure = item.severity === "closure";
  const starts = item.when === "upcoming" ? formatAlertTime(item.startAt) : null;
  return (
    <View style={styles.item} accessible accessibilityLabel={`${item.headline}. ${item.sentence}`}>
      <View style={[styles.badge, closure ? styles.badgeClosure : styles.badgeMajor]}>
        <Ionicons
          name={closure ? "close-circle" : item.category === "roadworks" ? "construct" : "warning"}
          size={16}
          color={closure ? colors.red : colors.amber}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.headline}>{item.headline}</Text>
        {starts ? <Text style={styles.when}>Starts {starts}</Text> : null}
        <Text style={styles.sentence}>{item.sentence}</Text>
        {item.daysOnRoute > 0 ? (
          <Text style={styles.meta}>
            You&apos;ve driven this way on {item.daysOnRoute} {item.daysOnRoute === 1 ? "day" : "days"} in the last 6 weeks.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function RoadAlertsScreen() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchRoadAlerts();
      setData(res.data);
    } catch {
      setError("Couldn't load road alerts. Pull down to try again.");
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

  const turnOn = useCallback(async () => {
    setEnabling(true);
    try {
      await turnOnRoadAlerts();
      await load();
    } finally {
      setEnabling(false);
    }
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
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
      <View style={styles.trialPill}>
        <Text style={styles.trialText}>Trial</Text>
      </View>
      <Text style={styles.intro}>
        Closures and long delays on the roads you use most, plus planned closures for the week ahead. If something
        serious is on your usual roads, we send one heads-up before you usually set off. Never while you&apos;re
        driving.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data && !data.available ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Not switched on yet</Text>
          <Text style={styles.body}>Road alerts are still being set up. Check back soon.</Text>
        </View>
      ) : null}

      {data && data.available && !data.enabled ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Turn on road alerts</Text>
          <Text style={styles.body}>
            Free during the trial. We work out your usual roads from your own recent drives; they stay private to you.
            At most one notification a day.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={turnOn}
            disabled={enabling}
            accessibilityRole="button"
            accessibilityLabel="Turn on road alerts"
          >
            {enabling ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={styles.primaryText}>Turn on</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {data && data.available && data.enabled ? (
        <>
          {!data.hasUsualRoads ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Learning your usual roads</Text>
              <Text style={styles.body}>
                We need the same roads on at least 3 different days in the last 6 weeks. Keep recording your drives and
                this fills in by itself.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.section}>On your roads now</Text>
              {data.current.length === 0 ? (
                <Text style={styles.empty}>Nothing serious on your usual roads right now.</Text>
              ) : (
                data.current.map((item) => <AlertRow key={item.id} item={item} />)
              )}

              <Text style={styles.section}>Planned in the next 7 days</Text>
              {data.upcoming.length === 0 ? (
                <Text style={styles.empty}>No planned closures or roadworks on your usual roads.</Text>
              ) : (
                data.upcoming.map((item) => <AlertRow key={item.id} item={item} />)
              )}
            </>
          )}
        </>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Always check conditions before you set off. Times are estimates from the road operators and can change.
          {data?.plannedWorksCoverage === "england" ? " Planned roadworks cover England only." : ""}
        </Text>
        {(data?.attribution ?? []).map((line) => (
          <Text key={line} style={styles.attribution}>
            {line}
          </Text>
        ))}
        {data?.enabled ? (
          <TouchableOpacity onPress={() => router.push("/settings/notifications" as never)} accessibilityRole="link">
            <Text style={styles.link}>Turn off in Settings, Notifications</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centre: { alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 48 },
  trialPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.amberDim,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 10,
  },
  trialText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 12 },
  intro: { color: colors.text2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 13, marginBottom: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15, marginBottom: 6 },
  body: { color: colors.text2, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19 },
  primaryBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.amber,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 12,
    minWidth: 96,
    alignItems: "center",
  },
  primaryText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 14 },
  section: {
    color: colors.text3,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 8,
  },
  empty: { color: colors.text2, fontFamily: fonts.regular, fontSize: 14, marginBottom: 16 },
  item: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 12,
    marginBottom: 10,
  },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  badgeClosure: { backgroundColor: colors.redDim },
  badgeMajor: { backgroundColor: colors.amberDim },
  headline: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  when: { color: colors.amber, fontFamily: fonts.medium, fontSize: 12.5, marginTop: 2 },
  sentence: { color: colors.text2, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  meta: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 },
  footer: { marginTop: 20, gap: 6 },
  footerText: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  attribution: { color: colors.text3, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16 },
  link: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 13, marginTop: 6 },
});
