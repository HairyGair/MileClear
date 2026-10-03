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
import { dismissRoadAlert, fetchRoadAlerts } from "../lib/api/roadAlerts";
import { TripMapWidget } from "../components/map/TripMapWidget";
import { formatAlertDay, formatAlertTime, turnOnRoadAlerts } from "../lib/roadAlerts";
import { colors, fonts, radii } from "../lib/theme";

type Data = RoadAlertsResponse["data"];

function AlertRow({ item, onDismiss }: { item: RoadAlertItem; onDismiss: (item: RoadAlertItem) => void }) {
  const closure = item.severity === "closure";
  const starts = item.when === "upcoming" ? formatAlertTime(item.startAt) : null;
  const since = item.ongoing ? formatAlertDay(item.startAt) : null;
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
        {since ? <Text style={styles.whenQuiet}>In place since {since}</Text> : null}
        <Text style={styles.sentence}>{item.sentence}</Text>
        {item.daysOnRoute > 0 ? (
          <Text style={styles.meta}>
            You&apos;ve driven this way on {item.daysOnRoute} {item.daysOnRoute === 1 ? "day" : "days"} in the last 6 weeks.
          </Text>
        ) : null}
        {item.line && item.line.length > 0 ? (
          // A still snapshot of the closed stretch, so the spot is recognisable
          // at a glance. Draws nothing in Expo Go (no native maps there).
          <View style={styles.map} accessible={false} importantForAccessibility="no-hide-descendants">
            <TripMapWidget coordinates={item.line} height={120} showLine={item.line.length >= 2} />
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => onDismiss(item)}
          style={styles.dismissBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Not relevant to me: hide ${item.headline}`}
        >
          <Text style={styles.dismissText}>Not relevant to me</Text>
        </TouchableOpacity>
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
  const [showOngoing, setShowOngoing] = useState(false);
  // Hidden straight away on tap; the server leaves them out from then on.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [lastHidden, setLastHidden] = useState<RoadAlertItem | null>(null);

  const dismiss = useCallback((item: RoadAlertItem) => {
    setHidden((h) => new Set(h).add(item.id));
    setLastHidden(item);
    dismissRoadAlert({
      eventIds: item.memberIds ?? [item.id],
      road: item.road,
      severity: item.severity,
      daysOnRoute: item.daysOnRoute,
    }).catch(() => {
      // Not saved: show it again rather than pretend.
      setHidden((h) => {
        const next = new Set(h);
        next.delete(item.id);
        return next;
      });
      setLastHidden(null);
    });
  }, []);

  const undo = useCallback(() => {
    const item = lastHidden;
    if (!item) return;
    setLastHidden(null);
    setHidden((h) => {
      const next = new Set(h);
      next.delete(item.id);
      return next;
    });
    dismissRoadAlert({ eventIds: item.memberIds ?? [item.id], undo: true }).catch(() => {});
  }, [lastHidden]);

  const visible = (list: RoadAlertItem[] | undefined) => (list ?? []).filter((i) => !hidden.has(i.id));

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
    <View style={styles.screen}>
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
              Free. We work out your usual roads from your own recent drives; they stay private to you.
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
                {visible(data.current).length === 0 ? (
                  <Text style={styles.empty}>Nothing serious on your usual roads right now.</Text>
                ) : (
                  visible(data.current).map((item) => <AlertRow key={item.id} item={item} onDismiss={dismiss} />)
                )}

                <Text style={styles.section}>Planned in the next 7 days</Text>
                {visible(data.upcoming).length === 0 ? (
                  <Text style={styles.empty}>No planned closures or roadworks on your usual roads.</Text>
                ) : (
                  visible(data.upcoming).map((item) => <AlertRow key={item.id} item={item} onDismiss={dismiss} />)
                )}

                {visible(data.ongoing).length > 0 ? (
                  <>
                    <TouchableOpacity
                      style={styles.foldRow}
                      onPress={() => setShowOngoing((v) => !v)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showOngoing }}
                      accessibilityLabel={`Closures in place for a while, ${visible(data.ongoing).length}. ${showOngoing ? "Hide" : "Show"}`}
                    >
                      <Text style={styles.section}>In place for a while ({visible(data.ongoing).length})</Text>
                      <Ionicons name={showOngoing ? "chevron-up" : "chevron-down"} size={16} color={colors.text3} />
                    </TouchableOpacity>
                    {showOngoing ? (
                      <>
                        <Text style={styles.foldNote}>
                          Closures that started more than 3 days ago. You&apos;ve probably been driving round them, so we
                          never send a notification about these.
                        </Text>
                        {visible(data.ongoing).map((item) => (
                          <AlertRow key={item.id} item={item} onDismiss={dismiss} />
                        ))}
                      </>
                    ) : null}
                  </>
                ) : null}
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
      {lastHidden ? (
        // Floats over the bottom of the list so it is seen wherever the card was.
        <View style={[styles.undoBar, styles.undoFloat]} accessibilityLiveRegion="polite">
          <Text style={styles.undoText} numberOfLines={2}>
            Hidden. We won&apos;t show or send this closure again.
          </Text>
          <TouchableOpacity onPress={undo} accessibilityRole="button" accessibilityLabel="Undo, show it again">
            <Text style={styles.undoLink}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
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
  whenQuiet: { color: colors.text3, fontFamily: fonts.medium, fontSize: 12.5, marginTop: 2 },
  map: { marginTop: 10, borderRadius: radii.sm, overflow: "hidden" },
  dismissBtn: { alignSelf: "flex-start", marginTop: 10 },
  dismissText: { color: colors.text3, fontFamily: fonts.semibold, fontSize: 12.5, textDecorationLine: "underline" },
  undoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 12,
  },
  undoFloat: { position: "absolute", left: 16, right: 16, bottom: 24 },
  undoText: { flex: 1, color: colors.text2, fontFamily: fonts.regular, fontSize: 13 },
  undoLink: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 14 },
  foldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  foldNote: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, marginBottom: 10 },
  sentence: { color: colors.text2, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  meta: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 },
  footer: { marginTop: 20, gap: 6 },
  footerText: { color: colors.text3, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  attribution: { color: colors.text3, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16 },
  link: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 13, marginTop: 6 },
});
