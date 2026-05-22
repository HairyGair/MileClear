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
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { fetchExpenses, deleteExpense } from "../lib/api/expenses";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/Button";
import type { Expense } from "@mileclear/shared";
import { EXPENSE_CATEGORIES, formatPence } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const BG = colors.bg;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;
const BORDER = "rgba(255,255,255,0.06)";

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
);

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  parking: "car-outline",
  tolls: "trail-sign-outline",
  congestion: "warning-outline",
  maintenance: "construct-outline",
  insurance: "shield-checkmark-outline",
  road_tax: "document-text-outline",
  mot: "checkmark-circle-outline",
  phone: "call-outline",
  equipment: "hardware-chip-outline",
  clothing: "shirt-outline",
  subscription: "card-outline",
  subsistence: "fast-food-outline",
  accommodation: "bed-outline",
  professional_fees: "briefcase-outline",
  other: "ellipsis-horizontal-outline",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ExpenseCard({
  item,
  onPress,
  onDelete,
}: {
  item: Expense;
  onPress: () => void;
  onDelete: () => void;
}) {
  const label = CATEGORY_LABEL[item.category] ?? item.category;
  const iconName = CATEGORY_ICON[item.category] ?? "receipt-outline";

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatPence(item.amountPence)}, ${formatDate(
        item.date
      )}. Tap to edit`}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name={iconName} size={20} color={AMBER} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardCategory} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.cardAmount}>{formatPence(item.amountPence)}</Text>
        </View>
        <View style={styles.cardMetaRow}>
          {item.vendor ? (
            <Text style={styles.cardVendor} numberOfLines={1}>
              {item.vendor}
            </Text>
          ) : null}
          <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${label} expense`}
      >
        <Ionicons name="trash-outline" size={18} color={TEXT_3} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function ExpensesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchExpenses({
        pageSize: 100,
        ...(filterCategory ? { category: filterCategory } : {}),
      });
      setItems((res.data ?? []) as Expense[]);
    } catch (e) {
      console.warn("[expenses] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterCategory]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleAdd = useCallback(() => {
    router.push("/expense-form");
  }, [router]);

  const handleScanReceipt = useCallback(() => {
    router.push("/receipt-scan?target=expense");
  }, [router]);

  const handleEdit = useCallback(
    (id: string) => {
      router.push({ pathname: "/expense-form", params: { id } });
    },
    [router]
  );

  const handleDelete = useCallback(
    (item: Expense) => {
      const label = CATEGORY_LABEL[item.category] ?? item.category;
      Alert.alert(
        "Delete expense?",
        `${label} • ${formatPence(item.amountPence)} • ${formatDate(item.date)}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteExpense(item.id);
                setItems((prev) => prev.filter((x) => x.id !== item.id));
              } catch (e) {
                Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
              }
            },
          },
        ]
      );
    },
    []
  );

  const totalThisMonthPence = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return items
      .filter((e) => new Date(e.date) >= startOfMonth)
      .reduce((sum, e) => sum + e.amountPence, 0);
  }, [items]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Expenses" }} />

      {/* Summary band */}
      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryLabel}>This month</Text>
          <Text style={styles.summaryTotal}>{formatPence(totalThisMonthPence)}</Text>
        </View>
        <View style={styles.summaryCount}>
          <Text style={styles.summaryLabel}>{items.length} item{items.length === 1 ? "" : "s"}</Text>
        </View>
      </View>

      {/* Action row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleScanReceipt}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt"
        >
          <Ionicons name="scan-outline" size={18} color={BG} />
          <Text style={styles.scanButtonText}>Scan Receipt</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.manualButton}
          onPress={handleAdd}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add expense manually"
        >
          <Ionicons name="add" size={20} color={TEXT_1} />
          <Text style={styles.manualButtonText}>Add manually</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter chips. Wrapped in a View so the ScrollView
          doesn't claim all remaining vertical space — without the
          wrapper, the horizontal ScrollView flex-fills and stretches
          every chip vertically to the bottom of the screen. */}
      <View style={styles.filterRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              filterCategory === null && styles.filterChipActive,
            ]}
            onPress={() => setFilterCategory(null)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                filterCategory === null && styles.filterChipTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          {EXPENSE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[
                styles.filterChip,
                filterCategory === c.value && styles.filterChipActive,
              ]}
              onPress={() => setFilterCategory(c.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterCategory === c.value && styles.filterChipTextActive,
                ]}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Loading expenses...</Text>
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={filterCategory ? "No expenses in this category" : "No expenses yet"}
          description={
            filterCategory
              ? "Try another filter, or add your first expense in this category."
              : "Log every business cost - parking, equipment, phone bills, accommodation. They reduce your tax bill."
          }
          action={
            !filterCategory ? (
              <Button onPress={handleScanReceipt} title="Scan first receipt" />
            ) : undefined
          }
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
            <ExpenseCard
              item={item}
              onPress={() => handleEdit(item.id)}
              onDelete={() => handleDelete(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
    fontSize: 28,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginTop: 4,
  },
  summaryCount: { alignItems: "flex-end" },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  scanButton: {
    flex: 1,
    backgroundColor: AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  scanButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: BG,
  },
  manualButton: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  manualButtonText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },

  filterRowWrap: {
    // Bounds the horizontal ScrollView so its children don't stretch
    // to the full remaining viewport height.
    paddingVertical: 14,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: "center",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterChipActive: {
    backgroundColor: `${AMBER}26`,
    borderColor: AMBER,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  filterChipTextActive: { color: AMBER },

  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  separator: { height: 8 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${AMBER}1a`,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 4 },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardCategory: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    flex: 1,
    marginRight: 8,
  },
  cardAmount: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: GREEN,
  },
  cardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardVendor: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    flex: 1,
    marginRight: 8,
  },
  cardDate: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  deleteBtn: { padding: 6 },
});
