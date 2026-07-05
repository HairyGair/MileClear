import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
} from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchInvoices,
  markInvoicePaid,
  type Invoice,
  type InvoiceStatus,
  type PotentialEarningMatch,
} from "../lib/api/invoices";
import { useUser } from "../lib/user/context";
import { usePaywall } from "../components/paywall";
import { EmptyState } from "../components/EmptyState";
import { LinkEarningSheet } from "../components/invoices/LinkEarningSheet";
import { openChaseDraft } from "../lib/invoices/chase";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;
const RED = colors.red;

type FilterTab = "all" | InvoiceStatus;

const TAB_LABELS: Record<FilterTab, string> = {
  all: "All",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  written_off: "Written off",
};

export default function InvoicesScreen() {
  const [data, setData] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Record<InvoiceStatus, { count: number; totalPence: number }> | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Link-or-keep sheet state. When mark-paid returns potentialEarningMatches
  // we stash the invoice + matches and pop the sheet.
  const [linkSheet, setLinkSheet] = useState<{ invoice: Invoice; matches: PotentialEarningMatch[] } | null>(null);
  const { user } = useUser();
  const { showPaywall } = usePaywall();
  const isPremium = user?.isPremium === true;

  // Free-tier monthly cap: count invoices in the current calendar
  // month from the loaded list. Lets us show "2 of 3 used this month"
  // hint inline without an extra round-trip.
  const monthInvoiceCount = data.filter((inv) => {
    const sent = new Date(inv.sentAt);
    const now = new Date();
    return (
      sent.getUTCFullYear() === now.getUTCFullYear() &&
      sent.getUTCMonth() === now.getUTCMonth()
    );
  }).length;
  const showFreeCapHint = !isPremium && monthInvoiceCount > 0;

  const load = useCallback(async () => {
    try {
      const res = await fetchInvoices({
        status: filter === "all" ? undefined : filter,
        pageSize: 100,
      });
      setData(res.data);
      setSummary(res.summary);
    } catch (err) {
      Alert.alert("Couldn't load invoices", err instanceof Error ? err.message : "Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onMarkPaid = useCallback((invoice: Invoice) => {
    Alert.alert(
      "Mark as paid?",
      `Mark £${(invoice.amountPence / 100).toFixed(2)} from ${invoice.company} as received today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark paid",
          style: "default",
          onPress: async () => {
            try {
              const today = new Date().toISOString().slice(0, 10);
              const res = await markInvoicePaid(invoice.id, today);
              // If the server found a manual earning that looks like the
              // same money, pop the link-or-keep sheet before the list
              // reloads — the user resolves the ambiguity in one step.
              const matches = res.potentialEarningMatches ?? [];
              if (matches.length > 0) {
                setLinkSheet({ invoice: res.data, matches });
              } else {
                load();
              }
            } catch (err) {
              Alert.alert("Couldn't update", err instanceof Error ? err.message : "Try again.");
            }
          },
        },
      ]
    );
  }, [load]);

  // Chase payment: opens a pre-filled late-payment email in the user's
  // own mail app. Draft only — nothing sends without them hitting send.
  // Pro feature (5 Jul 2026): the tracked list stays free at 3/month,
  // the one-tap chase is the upgrade moment.
  const onChase = useCallback(
    (invoice: Invoice) => {
      if (!isPremium) {
        showPaywall("invoice_chase");
        return;
      }
      const senderName = user?.fullName || user?.displayName || null;
      openChaseDraft(invoice, senderName).catch(() => {
        Alert.alert(
          "Couldn't open a draft",
          "No mail app is set up on this phone. You can copy the invoice details from the edit screen instead."
        );
      });
    },
    [user, isPremium, showPaywall]
  );

  const unpaidTotal =
    (summary?.sent.totalPence ?? 0) + (summary?.overdue.totalPence ?? 0);
  const overdueCount = summary?.overdue.count ?? 0;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Invoices",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/invoice-form")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add invoice"
            >
              <Ionicons name="add" size={26} color={AMBER} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Summary header */}
      {summary && (
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{formatSummaryPence(unpaidTotal)}</Text>
            <Text style={styles.summaryLabel}>OUTSTANDING</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, overdueCount > 0 && { color: RED }]}>
              {overdueCount}
            </Text>
            <Text style={styles.summaryLabel}>OVERDUE</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: GREEN }]}>
              {formatSummaryPence(summary.paid.totalPence ?? 0)}
            </Text>
            <Text style={styles.summaryLabel}>PAID</Text>
          </View>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {(Object.keys(TAB_LABELS) as FilterTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, filter === t && styles.tabActive]}
            onPress={() => setFilter(t)}
          >
            <Text style={[styles.tabLabel, filter === t && styles.tabLabelActive]}>
              {TAB_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Free-tier monthly counter hint */}
      {showFreeCapHint && (
        <TouchableOpacity
          style={styles.capHint}
          onPress={() => monthInvoiceCount >= 3 && showPaywall("invoice_tracker")}
          activeOpacity={monthInvoiceCount >= 3 ? 0.7 : 1}
        >
          <Ionicons name="information-circle-outline" size={14} color={TEXT_3} />
          <Text style={styles.capHintText}>
            {monthInvoiceCount} of 3 used this month — free plan.{" "}
            {monthInvoiceCount >= 3 && <Text style={styles.capHintLink}>Tap to upgrade.</Text>}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={AMBER} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="document-text-outline"
            title="No invoices yet"
            description="Track who owes you for freelance work. We'll keep the list tidy for your accountant."
            action={
              <TouchableOpacity
                style={styles.emptyAction}
                onPress={() => router.push("/invoice-form")}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color="#000" />
                <Text style={styles.emptyActionText}>Add an invoice</Text>
              </TouchableOpacity>
            }
          />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
          refreshControl={
            <RefreshControl
              tintColor={AMBER}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          renderItem={({ item }) => (
            <InvoiceRow invoice={item} onMarkPaid={onMarkPaid} onChase={onChase} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      <LinkEarningSheet
        visible={linkSheet !== null}
        invoice={linkSheet?.invoice ?? null}
        matches={linkSheet?.matches ?? []}
        onResolved={() => {
          setLinkSheet(null);
          load();
        }}
        onClose={() => {
          setLinkSheet(null);
          load();
        }}
      />
    </View>
  );
}

function InvoiceRow({
  invoice,
  onMarkPaid,
  onChase,
}: {
  invoice: Invoice;
  onMarkPaid: (i: Invoice) => void;
  onChase: (i: Invoice) => void;
}) {
  const statusConfig = {
    sent: { color: AMBER, label: "Awaiting", icon: "time-outline" as const },
    overdue: { color: RED, label: "Overdue", icon: "alert-circle" as const },
    paid: { color: GREEN, label: "Paid", icon: "checkmark-circle" as const },
    written_off: { color: TEXT_3, label: "Written off", icon: "close-circle-outline" as const },
  }[invoice.status];

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/invoice-form?id=${invoice.id}`)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${invoice.company}, £${(invoice.amountPence / 100).toFixed(2)}, ${statusConfig.label}`}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.rowCompany} numberOfLines={1}>
          {invoice.company}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: `${statusConfig.color}22` }]}>
          <Ionicons name={statusConfig.icon} size={12} color={statusConfig.color} />
          <Text style={[styles.statusPillText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>
      <View style={styles.rowDetails}>
        <Text style={styles.rowAmount}>£{(invoice.amountPence / 100).toFixed(2)}</Text>
        <Text style={styles.rowDate}>
          {invoice.status === "paid" && invoice.paidAt
            ? `Paid ${formatDate(invoice.paidAt)}`
            : `Sent ${formatDate(invoice.sentAt)} · Due ${formatDate(invoice.dueAt)}`}
        </Text>
      </View>
      {invoice.status !== "paid" && invoice.status !== "written_off" && (
        <View style={styles.rowActions}>
          <TouchableOpacity
            style={styles.markPaidButton}
            onPress={() => onMarkPaid(invoice)}
            accessibilityRole="button"
            accessibilityLabel="Mark as paid"
          >
            <Ionicons name="checkmark" size={14} color={GREEN} />
            <Text style={styles.markPaidText}>Mark paid</Text>
          </TouchableOpacity>
          {invoice.status === "overdue" && (
            <TouchableOpacity
              style={styles.chaseButton}
              onPress={() => onChase(invoice)}
              accessibilityRole="button"
              accessibilityLabel="Chase payment by email"
            >
              <Ionicons name="mail-outline" size={14} color={AMBER} />
              <Text style={styles.chaseText}>Chase payment</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Adaptive currency formatter for summary chips:
 *   £0       (exactly zero — keep tight)
 *   £0.01    (sub-£1 — show pence so penny-tests don't look like nothing)
 *   £915     (whole pounds for readable headers)
 *   £1.2k    (thousands compressed for narrow chips)
 * Anthony 16 May audit — a £0.01 test invoice was rendering as "£0"
 * which made the chip look broken.
 */
function formatSummaryPence(pence: number): string {
  if (pence === 0) return "£0";
  if (pence < 100) return `£${(pence / 100).toFixed(2)}`;
  if (pence >= 100_000) return `£${(pence / 100_000).toFixed(1)}k`;
  return `£${Math.round(pence / 100).toLocaleString("en-GB")}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },

  summary: {
    flexDirection: "row",
    backgroundColor: CARD_BG,
    paddingVertical: 14,
    paddingHorizontal: 16,
    margin: 16,
    marginBottom: 8,
    borderRadius: 14,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryValue: { color: TEXT_1, fontSize: 20, fontFamily: fonts.bold, fontVariant: ["tabular-nums"] },
  summaryLabel: { color: TEXT_3, fontSize: 10, fontFamily: fonts.semibold, letterSpacing: 0.6 },
  summaryDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 4 },

  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 6,
    flexWrap: "wrap",
  },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: CARD_BG },
  tabActive: { backgroundColor: AMBER },
  tabLabel: { color: TEXT_3, fontSize: 12, fontFamily: fonts.semibold },
  tabLabelActive: { color: "#000" },

  capHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 4,
  },
  capHintText: { color: TEXT_3, fontSize: 11, fontFamily: fonts.regular, flex: 1 },
  capHintLink: { color: AMBER, fontFamily: fonts.semibold },

  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: AMBER,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  emptyActionText: { color: "#000", fontFamily: fonts.semibold, fontSize: 14 },

  row: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowCompany: { flex: 1, color: TEXT_1, fontSize: 15, fontFamily: fonts.semibold },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 11, fontFamily: fonts.semibold },
  rowDetails: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  rowAmount: { color: TEXT_1, fontSize: 18, fontFamily: fonts.bold, fontVariant: ["tabular-nums"] },
  rowDate: { color: TEXT_3, fontSize: 12, fontFamily: fonts.regular },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  markPaidButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  markPaidText: { color: GREEN, fontSize: 12, fontFamily: fonts.semibold },
  chaseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  chaseText: { color: AMBER, fontSize: 12, fontFamily: fonts.semibold },
});
