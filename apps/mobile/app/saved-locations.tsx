import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { fetchSavedLocations, deleteSavedLocation } from "../lib/api/savedLocations";
import { useUser } from "../lib/user/context";
import { registerGeofences } from "../lib/geofencing/index";
import { Button } from "../components/Button";
import type { SavedLocation, LocationType } from "@mileclear/shared";
import { MAX_FREE_SAVED_LOCATIONS } from "@mileclear/shared";

const LOCATION_TYPE_ICONS: Record<LocationType, keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  work: "briefcase-outline",
  depot: "storefront-outline",
  custom: "location-outline",
};

const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  home: "Home",
  work: "Work",
  depot: "Depot",
  custom: "Custom",
};

const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  home: "#3b82f6",
  work: "#f5a623",
  depot: "#10b981",
  custom: "#8b5cf6",
};

function LocationCard({
  item,
  onPress,
  onDelete,
}: {
  item: SavedLocation;
  onPress: () => void;
  onDelete: () => void;
}) {
  const iconName = LOCATION_TYPE_ICONS[item.locationType];
  const typeLabel = LOCATION_TYPE_LABELS[item.locationType];
  const typeColor = LOCATION_TYPE_COLORS[item.locationType];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${typeLabel}, ${item.radiusMeters}m radius. Tap to edit`}
    >
      <View style={[styles.cardIconWrap, { backgroundColor: `${typeColor}1a` }]}>
        <Ionicons name={iconName} size={22} color={typeColor} />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.cardMeta}>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}26` }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          <Text style={styles.radiusText}>{item.radiusMeters}m radius</Text>
        </View>
      </View>

      <View style={styles.cardRight}>
        <View
          style={[
            styles.geofenceDot,
            { backgroundColor: item.geofenceEnabled ? "#10b981" : "#374151" },
          ]}
        />
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
        >
          <Ionicons name="trash-outline" size={18} color="#6b7280" />
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={16} color="#4b5563" />
      </View>
    </TouchableOpacity>
  );
}

export default function SavedLocationsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocations = useCallback(async () => {
    try {
      const res = await fetchSavedLocations();
      setLocations(res.data);
    } catch {
      // Silently fail — will show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLocations();
    }, [loadLocations])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLocations();
  }, [loadLocations]);

  const handleDelete = useCallback(
    (item: SavedLocation) => {
      Alert.alert(
        "Delete Location",
        `Remove "${item.name}"? This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteSavedLocation(item.id);
                setLocations((prev) => prev.filter((l) => l.id !== item.id));
                registerGeofences().catch(() => {});
              } catch {
                Alert.alert("Error", "Failed to delete location. Please try again.");
              }
            },
          },
        ]
      );
    },
    []
  );

  const handleAdd = useCallback(() => {
    router.push("/saved-location-form");
  }, [router]);

  const isPremium = user?.isPremium ?? false;
  const atFreeLimit = !isPremium && locations.length >= MAX_FREE_SAVED_LOCATIONS;

  const renderItem = ({ item }: { item: SavedLocation }) => (
    <LocationCard
      item={item}
      onPress={() => router.push(`/saved-location-form?id=${item.id}`)}
      onDelete={() => handleDelete(item)}
    />
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Saved Locations" }} />
      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#f5a623"
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="location-outline" size={40} color="#64748b" />
              </View>
              <Text style={styles.emptyTitle}>No saved locations</Text>
              <Text style={styles.emptyText}>
                Save your home, work, or depot to auto-classify trips with geofencing
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {atFreeLimit ? (
              <TouchableOpacity
                style={styles.lockedAddBtn}
                onPress={() => router.push("/saved-location-form")}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add location — upgrade to Pro for unlimited saved locations"
              >
                <View style={styles.lockedAddBtnRow}>
                  <Ionicons name="lock-closed" size={18} color="#9ca3af" />
                  <Text style={styles.lockedAddBtnText}>Add Location</Text>
                </View>
                <Text style={styles.lockedAddBtnSubtitle}>
                  Upgrade to Pro for unlimited saved locations
                </Text>
              </TouchableOpacity>
            ) : (
              <Button title="Add Location" icon="add" onPress={handleAdd} />
            )}
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
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  // Card
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 12,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  cardName: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  radiusText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  geofenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deleteBtn: {
    padding: 10,
    margin: -8,
  },
  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0a1120",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  // Footer
  footer: {
    marginTop: 8,
    paddingBottom: 20,
  },
  // Locked add button
  lockedAddBtn: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 6,
  },
  lockedAddBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lockedAddBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  lockedAddBtnSubtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    textAlign: "center",
  },
});
