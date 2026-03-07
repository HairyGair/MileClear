import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TripMapWidget } from "../map/TripMapWidget";
import { TRIP_CATEGORY_META } from "@mileclear/shared";
import type { TripDetail } from "../../lib/api/trips";

interface JourneyTimelineProps {
  trips: TripDetail[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function JourneyTimeline({ trips }: JourneyTimelineProps) {
  const router = useRouter();

  if (trips.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent Journeys</Text>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/trips" as any)}
          accessibilityRole="button"
          accessibilityLabel="See all trips"
        >
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      {trips.map((trip) => (
        <TouchableOpacity
          key={trip.id}
          style={styles.card}
          onPress={() => router.push(`/trip-form?id=${trip.id}`)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Trip on ${formatDate(trip.startedAt)}, ${trip.distanceMiles.toFixed(1)} miles${trip.startAddress ? ` from ${trip.startAddress}` : ""}${trip.endAddress ? ` to ${trip.endAddress}` : ""}. Tap to view`}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.date}>
                {formatDate(trip.startedAt)} {"\u00B7"} {formatTime(trip.startedAt)}
              </Text>
              {(trip as any).category && (() => {
                const meta = TRIP_CATEGORY_META.find((c) => c.value === (trip as any).category);
                return meta ? (
                  <View style={styles.categoryBadge}>
                    <Ionicons name={meta.icon as any} size={10} color="#f5a623" />
                    <Text style={styles.categoryText}>{meta.label}</Text>
                  </View>
                ) : null;
              })()}
            </View>
            <Text style={styles.distance}>
              {trip.distanceMiles.toFixed(1)} mi
            </Text>
          </View>

          {/* Journal note */}
          {trip.notes && (
            <Text style={styles.noteText} numberOfLines={2}>
              {trip.notes}
            </Text>
          )}

          {(trip.startAddress || trip.endAddress) && (
            <View style={styles.addressRow}>
              {trip.startAddress && (
                <Text style={styles.address} numberOfLines={1}>
                  {trip.startAddress}
                </Text>
              )}
              {trip.startAddress && trip.endAddress && (
                <Text style={styles.arrow}> {"\u2192"} </Text>
              )}
              {trip.endAddress && (
                <Text style={styles.address} numberOfLines={1}>
                  {trip.endAddress}
                </Text>
              )}
            </View>
          )}

          {trip.coordinates.length >= 2 && (
            <View style={styles.mapWrap}>
              <TripMapWidget
                coordinates={trip.coordinates}
                height={120}
              />
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
    letterSpacing: -0.2,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#f5a623",
  },
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  categoryText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  noteText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    fontStyle: "italic",
    lineHeight: 17,
    marginBottom: 6,
  },
  date: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
  },
  distance: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  address: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    flexShrink: 1,
  },
  arrow: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
  },
  mapWrap: {
    borderRadius: 10,
    overflow: "hidden",
  },
});
