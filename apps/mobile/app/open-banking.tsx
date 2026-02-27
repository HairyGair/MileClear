import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  createPlaidLinkToken,
  fetchPlaidConnections,
  syncPlaidConnection,
  disconnectPlaidConnection,
} from "../lib/api/earnings";
import type { PlaidConnection } from "@mileclear/shared";
import { Button } from "../components/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.mileclear.com";

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
  active: "#10b981",
  disconnected: "#6b7280",
  error: "#ef4444",
};

export default function OpenBankingScreen() {
  const router = useRouter();
  const [connections, setConnections] = useState<PlaidConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchPlaidConnections();
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
      const res = await createPlaidLinkToken();
      const linkToken = res.data.linkToken;
      const linkUrl = `${API_URL}/earnings/open-banking/link?token=${encodeURIComponent(linkToken)}`;

      await WebBrowser.openBrowserAsync(linkUrl);

      // Refresh connections after returning from browser
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
        Alert.alert("Error", err.message || "Failed to start bank connection");
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (connectionId: string) => {
    setSyncingId(connectionId);
    try {
      const res = await syncPlaidConnection(connectionId);
      const { imported, skipped, unmatched } = res.data;

      let message = `${imported} earning${imported !== 1 ? "s" : ""} imported`;
      if (skipped > 0) message += `\n${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped`;
      if (unmatched > 0)
        message += `\n${unmatched} unmatched transaction${unmatched !== 1 ? "s" : ""}`;

      Alert.alert("Sync Complete", message);
      await loadConnections();
    } catch (err: any) {
      Alert.alert("Sync Failed", err.message || "Failed to sync transactions");
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
              await disconnectPlaidConnection(connection.id);
              await loadConnections();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to disconnect");
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
                { backgroundColor: STATUS_COLORS[item.status] || "#6b7280" },
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5a623" />
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
            <View style={styles.titleRow}>
              <Text style={styles.heading}>Open Banking</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
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
              <Ionicons name="business-outline" size={40} color="#4a5568" />
            </View>
            <Text style={styles.emptyTitle}>No banks connected</Text>
            <Text style={styles.emptyText}>
              Tap the button below to link your bank account
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
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
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#030712",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
  },
  proBadge: {
    backgroundColor: "#f5a623",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  description: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    lineHeight: 20,
  },
  // Bank cards
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  bankName: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  lastSynced: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
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
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    textAlign: "center",
  },
  // Footer
  footer: {
    marginTop: 16,
    paddingBottom: 20,
  },
});
