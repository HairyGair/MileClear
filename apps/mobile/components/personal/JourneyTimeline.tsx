import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { TripMapWidget } from "../map/TripMapWidget";
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
        <TouchableOpacity onPress={() => router.push("/(tabs)/trips" as any)}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      {trips.map((trip) => (
        <TouchableOpacity
          key={trip.id}
          style={styles.card}
          onPress={() => router.push(`/trip-form?id=${trip.id}`)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.date}>
              {formatDate(trip.startedAt)} {"\u00B7"} {formatTime(trip.startedAt)}
            </Text>
            <Text style={styles.distance}>
              {trip.distanceMiles.toFixed(1)} mi
            </Text>
          </View>

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
    alignItems: "center",
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
    color: "#4a5568",
    flexShrink: 1,
  },
  arrow: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
  },
  mapWrap: {
    borderRadius: 10,
    overflow: "hidden",
  },
});
