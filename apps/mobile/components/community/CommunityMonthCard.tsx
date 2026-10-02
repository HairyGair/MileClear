import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CommunityMonthly } from "@mileclear/shared";
import { fetchCommunityMonthly } from "../../lib/api/community";
import { colors, fonts } from "../../lib/theme";

// "This month in MileClear": last month's community numbers (every driver
// together, aggregates only), shown on the dashboard in the first days of
// each month. Renders nothing outside that window, on any error, or when
// the month had too few drivers to publish.

/** Days of the month the card shows on (1st to 10th). */
export const COMMUNITY_CARD_LAST_DAY = 10;
const PAGE_URL = "https://mileclear.com/community";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function count(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/** "about £123,000": the claim value is an estimate, so it is rounded. */
function claim(pence: number): string {
  const pounds = pence / 100;
  const step = pounds >= 100_000 ? 1000 : pounds >= 10_000 ? 100 : 10;
  return `£${(Math.round(pounds / step) * step).toLocaleString("en-GB")}`;
}

export function inCommunityCardWindow(now: Date): boolean {
  return now.getDate() <= COMMUNITY_CARD_LAST_DAY;
}

export function communityShareText(c: CommunityMonthly): string {
  const name = MONTHS[Number(c.month.slice(5, 7)) - 1];
  const lines = [
    `In ${name}, ${count(c.activeDrivers ?? 0)} MileClear drivers logged ${count(c.totalMiles ?? 0)} miles across ${count(c.trips ?? 0)} trips.`,
  ];
  if (c.claimValuePence != null && c.claimValuePence > 0) {
    lines.push(`That's about ${claim(c.claimValuePence)} in mileage claims at the HMRC mileage rates.`);
  }
  lines.push("", `I'm one of them. ${PAGE_URL}`);
  return lines.join("\n");
}

export function CommunityMonthCard() {
  const [data, setData] = useState<CommunityMonthly | null>(null);
  const show = inCommunityCardWindow(new Date());

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    fetchCommunityMonthly()
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        // Nice-to-have card: no error state, it simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!show || !data || !data.published || data.activeDrivers == null || data.totalMiles == null || data.trips == null) {
    return null;
  }

  const name = MONTHS[Number(data.month.slice(5, 7)) - 1];

  const onShare = async () => {
    try {
      await Share.share({ message: communityShareText(data) }, { subject: `MileClear in ${name}` });
    } catch {
      // Share dismissed
    }
  };

  return (
    <View style={styles.card} accessible={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-outline" size={18} color={colors.amber} accessible={false} />
          <Text style={styles.title} accessibilityRole="header">
            {name} in MileClear
          </Text>
        </View>
        <TouchableOpacity
          onPress={onShare}
          style={styles.shareBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Share the MileClear community numbers for ${name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="share-outline" size={16} color={colors.amber} accessible={false} />
          <Text style={styles.shareText}>Share</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.headline}>
        Together, <Text style={styles.em}>{count(data.activeDrivers)}</Text> drivers logged{" "}
        <Text style={styles.em}>{count(data.totalMiles)}</Text> miles across{" "}
        <Text style={styles.em}>{count(data.trips)}</Text> trips.
      </Text>

      <View style={styles.row}>
        {data.claimValuePence != null && data.claimValuePence > 0 ? (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{claim(data.claimValuePence)}</Text>
            <Text style={styles.statLabel}>mileage claims, est.</Text>
          </View>
        ) : null}
        {data.newDrivers != null ? (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{count(data.newDrivers)}</Text>
            <Text style={styles.statLabel}>new drivers</Text>
          </View>
        ) : null}
        {data.topRegions[0] ? (
          <View style={styles.stat}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {data.topRegions[0].region}
            </Text>
            <Text style={styles.statLabel}>busiest region</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.note}>Totals across every MileClear driver. Nobody&apos;s own trips are shown.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.18)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { fontSize: 15, fontFamily: fonts.bold, color: colors.text1 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.amberDim,
  },
  shareText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.amber },
  headline: { fontSize: 17, lineHeight: 24, fontFamily: fonts.semibold, color: colors.text1 },
  em: { color: colors.amber, fontFamily: fonts.bold },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  stat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  statValue: { fontSize: 15, fontFamily: fonts.bold, color: colors.text1 },
  statLabel: { fontSize: 11, fontFamily: fonts.medium, color: colors.text3, marginTop: 2 },
  note: { fontSize: 11, fontFamily: fonts.regular, color: colors.text3, marginTop: 12 },
});
