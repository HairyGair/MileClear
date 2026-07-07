// Client book list (Get Paid, Jul 2026). Free tier — saved clients
// pre-fill invoices and the PDF Bill-To block.

import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchClients, type Client } from "../lib/api/clients";
import { EmptyState } from "../components/EmptyState";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;
const BG = colors.bg;

export default function ClientsScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchClients();
      setClients(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load clients");
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

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Clients",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/client-form")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add client"
            >
              <Ionicons name="add" size={26} color={AMBER} />
            </TouchableOpacity>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={AMBER} />
        </View>
      ) : clients.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="people-outline"
            title="No clients yet"
            description="Save the people and businesses you invoice. Their details pre-fill new invoices and the Bill-To block on the PDF."
            action={
              <TouchableOpacity
                style={styles.emptyAction}
                onPress={() => router.push("/client-form")}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color="#000" />
                <Text style={styles.emptyActionText}>Add a client</Text>
              </TouchableOpacity>
            }
          />
        </View>
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(c) => c.id}
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
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/client-form?id=${item.id}`)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Client ${item.name}`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="business-outline" size={18} color={AMBER} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowHint} numberOfLines={1}>
                  {[item.email, [item.city, item.postcode].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ") || "No contact details yet"}
                </Text>
              </View>
              <Text style={styles.rowCount}>
                {item._count?.invoices ? `${item._count.invoices} inv` : ""}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: colors.red, fontSize: 13, fontFamily: fonts.regular, marginBottom: 10 },
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { color: TEXT_1, fontSize: 15, fontFamily: fonts.semibold },
  rowHint: { color: TEXT_3, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  rowCount: { color: TEXT_3, fontSize: 12, fontFamily: fonts.regular },
});
