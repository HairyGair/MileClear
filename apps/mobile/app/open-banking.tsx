import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  createOpenBankingAuthLink,
  fetchBankConnections,
  syncBankConnection,
  disconnectBankConnection,
  fetchPayoutArrears,
  setPayoutArrears,
  type PayoutArrears,
} from "../lib/api/earnings";
import { GIG_PLATFORMS, type PlaidConnection } from "@mileclear/shared";
import { Button } from "../components/Button";
import { BetaBanner } from "../components/BetaBanner";
import { useUser } from "../lib/user/context";
import { usePaywall } from "../components/paywall";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;
const RED = colors.red;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  active: GREEN,
  disconnected: TEXT_3,
  error: RED,
};

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

/** Apps that pay last week's work into the bank this week (Ben Turner, 22 Oct 2026). */
function PaidWeekBehind() {
  const [rows, setRows] = useState<PayoutArrears[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPayoutArrears()
      .then((r) => setRows(r.data.platforms))
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const toggle = async (row: PayoutArrears, inArrears: boolean) => {
    setSaving(row.platform);
    try {
      const res = await setPayoutArrears(row.platform, inArrears);
      setRows((all) => all.map((r) => (r.platform === row.platform ? { ...r, inArrears } : r)));
      const n = res.data.moved;
      if (n > 0) {
        Alert.alert("Done", `Moved ${n} ${PLATFORM_LABELS[row.platform] ?? row.platform} payout${n === 1 ? "" : "s"}.`);
      }
    } catch (err: any) {
      Alert.alert("Couldn't save", err.message || "Try again in a moment.");
    } finally {
      setSaving(null);
    }
  };

  if (rows.length === 0) return null;
  return (
    <View style={styles.arrears}>
      <Text style={styles.arrearsTitle}>Apps that pay a week behind</Text>
      <View style={styles.card}>
        {rows.map((row, i) => (
          <View key={row.platform} style={[styles.arrearsRow, i > 0 && styles.arrearsRowDivider]}>
            <Text style={styles.arrearsLabel}>{PLATFORM_LABELS[row.platform] ?? row.platform}</Text>
            <Switch
              value={row.inArrears}
              onValueChange={(v) => void toggle(row, v)}
              disabled={saving !== null}
              trackColor={{ false: "#374151", true: "rgba(245, 166, 35, 0.4)" }}
              thumbColor={row.inArrears ? AMBER : TEXT_2}
              accessibilityLabel={`${PLATFORM_LABELS[row.platform] ?? row.platform} pays a week behind`}
            />
          </View>
        ))}
      </View>
      <Text style={styles.arrearsHint}>
        Turn on for an app that pays you for last week's work. Its payouts then
        count in the week before they reached your bank, so this week shows
        what you earned this week. They never move back into an earlier tax
        quarter, as HMRC counts money when you got it.
      </Text>
    </View>
  );
}

export default function OpenBankingScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { showPaywall } = usePaywall();
  const [connections, setConnections] = useState<PlaidConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchBankConnections();
      setConnections(res.data);
    } catch (err: any) {
      if (err.message?.includes("403") || err.message?.includes("Premium")) {
        Alert.alert(
          "Premium Required",
          "Open Banking is a premium feature. Upgrade to connect your bank account.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadConnections();
    }, [loadConnections])
  );

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await createOpenBankingAuthLink();
      const authLink = res.data.authLink;

      // The server finishes the link itself when the bank sends the
      // driver back (the link carries a signed one-time code naming them),
      // so no sign-in token goes in any URL. The page it shows has an
      // "Open MileClear" button to mileclear://open-banking, which closes
      // this browser sheet. If the bank's own app did the approval, the
      // driver comes back in Safari instead; that same button brings them
      // here, and this screen reloads on focus.
      await WebBrowser.openAuthSessionAsync(authLink, "mileclear://open-banking");

      // Refresh connections after returning from the browser, however it closed.
      await loadConnections();
    } catch (err: any) {
      if (err.message?.includes("503")) {
        Alert.alert(
          "Not Available",
          "Open Banking is not configured yet. This feature will be available soon."
        );
      } else if (err.message?.includes("403") || err.message?.includes("Premium")) {
        Alert.alert(
          "Premium Required",
          "Upgrade to MileClear Pro to connect your bank account."
        );
      } else {
        Alert.alert("Couldn't connect to your bank", err.message || "Try again in a moment.");
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (connectionId: string) => {
    setSyncingId(connectionId);
    try {
      const res = await syncBankConnection(connectionId);
      const { imported, skipped, unmatched } = res.data;

      let message = `${imported} earning${imported !== 1 ? "s" : ""} imported`;
      if (skipped > 0) message += `\n${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped`;
      if (unmatched > 0)
        message += `\n${unmatched} unmatched transaction${unmatched !== 1 ? "s" : ""}`;

      Alert.alert("Sync Complete", message);
      await loadConnections();
    } catch (err: any) {
      Alert.alert("Sync didn't go through", err.message || "Try again in a moment.");
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = (connection: PlaidConnection) => {
    Alert.alert(
      "Disconnect Bank",
      `Remove ${connection.institutionName || "this bank"}? Your existing imported earnings will not be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await disconnectBankConnection(connection.id);
              await loadConnections();
            } catch (err: any) {
              Alert.alert("Couldn't disconnect", err.message || "Try again in a moment.");
            }
          },
        },
      ]
    );
  };

  const renderConnection = ({ item }: { item: PlaidConnection }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.bankName}>
            {item.institutionName || "Connected Bank"}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: STATUS_COLORS[item.status] || TEXT_3 },
              ]}
            />
            <Text style={styles.statusText}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
        </View>
      </View>

      {item.lastSynced && (
        <Text style={styles.lastSynced}>
          Last synced: {formatDate(item.lastSynced)}
        </Text>
      )}

      <View style={styles.cardActions}>
        {item.status === "active" && (
          <Button
            title="Sync Now"
            size="sm"
            onPress={() => handleSync(item.id)}
            loading={syncingId === item.id}
            style={{ flex: 1 }}
          />
        )}
        <Button
          variant="secondary"
          title="Disconnect"
          size="sm"
          onPress={() => handleDisconnect(item)}
          fullWidth={false}
        />
      </View>
    </View>
  );

  if (!user?.isPremium) {
    return (
      <View style={styles.container}>
        <View style={styles.gateContainer}>
          <View style={styles.gateIcon}>
            <Ionicons name="business-outline" size={44} color={AMBER} />
          </View>
          <Text style={styles.gateTitle}>Link your bank</Text>
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>Pro</Text>
          </View>
          <Text style={styles.gateDesc}>
            Link your bank and your Uber, Deliveroo, Amazon Flex and other platform payouts come in as earnings, without typing each one.
          </Text>
          {/* The paywall carries the price, plan choice, terms and
              platform-specific cancellation wording. */}
          <Button
            title="Upgrade to Pro"
            onPress={() => showPaywall("open_banking")}
            style={{ marginTop: 20, width: "100%" }}
          />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        renderItem={renderConnection}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <BetaBanner
              label="Beta"
              title="Works with real UK banks"
              body="Bank imports are live and still in beta. Your bank's consent screen may show a testing-mode note while our banking partner, TrueLayer, completes its final approval. Your real transactions still come through."
            />
            <View style={styles.titleRow}>
              <Text style={styles.heading}>Link your bank</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>Pro</Text>
              </View>
            </View>
            <Text style={styles.description}>
              Connect your bank account to automatically import gig platform
              payments (Uber, Deliveroo, Amazon Flex, and more).
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={40} color={TEXT_3} />
            </View>
            <Text style={styles.emptyTitle}>No banks connected</Text>
            <Text style={styles.emptyText}>
              Tap the button below to link your bank account
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {connections.length > 0 && <PaidWeekBehind />}
            <Button
              title="Connect Bank"
              icon="add-circle-outline"
              onPress={handleConnect}
              loading={connecting}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  arrears: {
    marginBottom: 16,
  },
  arrearsTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text1,
    marginBottom: 8,
  },
  arrearsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  arrearsRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceBorder,
  },
  arrearsLabel: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text1,
  },
  arrearsHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: TEXT_3,
    marginTop: 8,
  },
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  heading: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: "#fff",
  },
  proBadge: {
    backgroundColor: AMBER,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: BG,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
  },
  // Bank cards
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  bankName: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: "#fff",
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  lastSynced: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
  },
  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textAlign: "center",
  },
  // Footer
  footer: {
    marginTop: 16,
    paddingBottom: 20,
  },
  // Premium gate
  gateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  gateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  gateTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  gateDesc: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 12,
  },
});
