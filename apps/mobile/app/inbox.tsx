import { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, Stack } from "expo-router";
import {
  fetchInbox,
  acceptInboxTransaction,
  ignoreInboxTransaction,
  type BankTransaction,
} from "../lib/api/inbox";
import { AppModal } from "../components/AppModal";
import { EmptyState } from "../components/EmptyState";
import { EXPENSE_CATEGORIES, GIG_PLATFORMS, formatPence } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

const AMBER = colors.amber;
const BG = colors.bg;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;
const RED = colors.red;
const BORDER = "rgba(255,255,255,0.06)";

const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
);
const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function confidenceLabel(conf: number | null): string | null {
  if (conf === null) return null;
  if (conf >= 80) return "High";
  if (conf >= 50) return "Medium";
  return "Low";
}

function confidenceColor(conf: number | null): string {
  if (conf === null) return TEXT_3;
  if (conf >= 80) return GREEN;
  if (conf >= 50) return AMBER;
  return TEXT_3;
}

function TransactionCard({
  item,
  onPress,
}: {
  item: BankTransaction;
  onPress: () => void;
}) {
  const isCredit = item.amountPence > 0;
  const suggestedLabel =
    item.suggestedKind === "earning"
      ? PLATFORM_LABEL[item.suggestedCategory ?? ""] ?? null
      : item.suggestedKind === "expense"
      ? EXPENSE_LABEL[item.suggestedCategory ?? ""] ?? null
      : null;
  const confLabel = confidenceLabel(item.suggestedConfidence);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardTopRow}>
        <Text style={styles.merchant} numberOfLines={1}>
          {item.merchant}
        </Text>
        <Text
          style={[styles.amount, { color: isCredit ? GREEN : RED }]}
        >
          {isCredit ? "+" : "-"}
          {formatPence(Math.abs(item.amountPence))}
        </Text>
      </View>
      <View style={styles.cardBottomRow}>
        <Text style={styles.date}>{formatDate(item.transactionDate)}</Text>
        {suggestedLabel ? (
          <View style={styles.suggestionRow}>
            <Text style={styles.suggestionLabel}>{suggestedLabel}</Text>
            {confLabel ? (
              <View
                style={[
                  styles.confidenceDot,
                  {
                    backgroundColor: confidenceColor(item.suggestedConfidence),
                  },
                ]}
              />
            ) : null}
          </View>
        ) : (
          <Text style={styles.suggestionPlaceholder}>Needs review</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface CategoryPickerProps {
  visible: boolean;
  title: string;
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function CategoryPicker({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: CategoryPickerProps) {
  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={styles.modalList}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.modalItem,
                  selected === opt.value && styles.modalItemActive,
                ]}
                onPress={() => onSelect(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalItemLabel}>{opt.label}</Text>
                {selected === opt.value ? (
                  <Ionicons name="checkmark" size={20} color={AMBER} />
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </AppModal>
  );
}

export default function InboxScreen() {
  const [items, setItems] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<BankTransaction | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchInbox(1, 100);
      setItems(res.data ?? []);
    } catch (e) {
      console.warn("[inbox] load failed", e);
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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleCardPress = useCallback((item: BankTransaction) => {
    haptic("light");
    setActive(item);
  }, []);

  const handleAcceptAs = useCallback(
    async (category: string) => {
      if (!active) return;
      const isCredit = active.amountPence > 0;
      setBusy(true);
      try {
        if (isCredit) {
          await acceptInboxTransaction(active.id, {
            kind: "earning",
            platform: category,
          });
        } else {
          await acceptInboxTransaction(active.id, {
            kind: "expense",
            category,
          });
        }
        haptic("success");
        setItems((prev) => prev.filter((x) => x.id !== active.id));
        setActive(null);
        setPickerOpen(false);
      } catch (e) {
        Alert.alert("Couldn't accept", e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [active]
  );

  const handleIgnore = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    try {
      await ignoreInboxTransaction(active.id);
      haptic("light");
      setItems((prev) => prev.filter((x) => x.id !== active.id));
      setActive(null);
    } catch (e) {
      Alert.alert("Couldn't ignore", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [active]);

  const pickerOptions = useMemo(() => {
    if (!active) return [];
    const isCredit = active.amountPence > 0;
    return isCredit
      ? GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))
      : EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
  }, [active]);

  const pickerTitle = useMemo(() => {
    if (!active) return "";
    return active.amountPence > 0
      ? "Which platform paid this?"
      : "What kind of expense?";
  }, [active]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Inbox" }} />

      {/* Summary band */}
      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryLabel}>From your bank</Text>
          <Text style={styles.summaryTotal}>
            {items.length} to review
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleRefresh}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Refresh inbox"
        >
          <Ionicons name="refresh-outline" size={22} color={TEXT_2} />
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="All caught up"
          description="No bank transactions waiting for review. New transactions appear here after your next bank sync."
          iconColor={GREEN}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={AMBER}
            />
          }
          renderItem={({ item }) => (
            <TransactionCard item={item} onPress={() => handleCardPress(item)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Action sheet for the active transaction */}
      <AppModal
        visible={!!active && !pickerOpen}
        animationType="slide"
        onRequestClose={() => setActive(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => !busy && setActive(null)}
        >
          {active ? (
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{active.merchant}</Text>
              <Text style={styles.modalSubtitle}>
                {active.amountPence > 0 ? "+" : "-"}
                {formatPence(Math.abs(active.amountPence))} · {formatDate(active.transactionDate)}
              </Text>

              <TouchableOpacity
                style={styles.actionPrimary}
                onPress={() => setPickerOpen(true)}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={active.amountPence > 0 ? "trending-up" : "trending-down"}
                  size={18}
                  color={BG}
                />
                <Text style={styles.actionPrimaryText}>
                  {active.amountPence > 0 ? "Accept as earning" : "Accept as expense"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionSecondary}
                onPress={handleIgnore}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Ionicons name="close-circle-outline" size={18} color={TEXT_2} />
                <Text style={styles.actionSecondaryText}>Ignore this one</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </TouchableOpacity>
      </AppModal>

      {/* Platform / category picker */}
      <CategoryPicker
        visible={pickerOpen}
        title={pickerTitle}
        options={pickerOptions}
        selected={active?.suggestedCategory ?? null}
        onSelect={handleAcceptAs}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryTotal: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginTop: 4,
  },

  loadingState: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2 },

  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 100,
  },
  separator: { height: 8 },

  card: {
    backgroundColor: CARD_BG,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  merchant: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    flex: 1,
  },
  amount: {
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  date: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  suggestionLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  suggestionPlaceholder: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    fontStyle: "italic",
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: "80%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: TEXT_3,
    opacity: 0.4,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 18,
  },
  modalList: { maxHeight: 480 },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  modalItemActive: {
    backgroundColor: `${AMBER}14`,
  },
  modalItemLabel: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },

  actionPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 15,
    marginBottom: 10,
  },
  actionPrimaryText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: BG,
  },
  actionSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  actionSecondaryText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
});
