import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { getCurrentLocation } from "../../lib/location/geocoding";
import { fetchNearbyPrices } from "../../lib/api/fuel";
import type { CommunityFuelStation, NationalAveragePrices } from "@mileclear/shared";

type ViewMode = "list" | "map";

function formatDistance(miles: number): string {
  return miles < 0.1 ? "<0.1 mi" : `${miles.toFixed(1)} mi`;
}

function formatPpl(pence: number): string {
  return `${pence.toFixed(1)}p/L`;
}

function getPriceColor(pricePence: number, nationalAvg: number | null): string {
  if (nationalAvg === null) return "#f59e0b"; // amber if no benchmark
  const diff = pricePence - nationalAvg;
  if (diff < -3) return "#10b981"; // green — cheaper
  if (diff > 3) return "#ef4444"; // red — more expensive
  return "#f59e0b"; // amber — within 3p
}

function StationCard({
  station,
  nationalAvgPetrol,
}: {
  station: CommunityFuelStation;
  nationalAvgPetrol: number | null;
}) {
  const priceColor = getPriceColor(station.avgPricePerLitrePence, nationalAvgPetrol);

  return (
    <View style={styles.stationCard}>
      <View style={styles.stationHeader}>
        <Text style={styles.stationName} numberOfLines={1}>
          {station.stationName}
        </Text>
        <Text style={styles.stationDistance}>{formatDistance(station.distanceMiles)}</Text>
      </View>
      <View style={styles.stationBody}>
        <Text style={[styles.stationPrice, { color: priceColor }]}>
          {formatPpl(station.avgPricePerLitrePence)}
        </Text>
        <Text style={styles.reportCount}>
          {station.reportCount} report{station.reportCount !== 1 ? "s" : ""}
        </Text>
      </View>
    </View>
  );
}

function NationalAverageBanner({ data }: { data: NationalAveragePrices }) {
  return (
    <View style={styles.avgBanner}>
      <Text style={styles.avgTitle}>UK Average</Text>
      <View style={styles.avgRow}>
        <Text style={styles.avgLabel}>
          Petrol{" "}
          <Text style={styles.avgValue}>{data.petrolPencePerLitre.toFixed(1)}p/L</Text>
        </Text>
        <Text style={styles.avgDivider}>|</Text>
        <Text style={styles.avgLabel}>
          Diesel{" "}
          <Text style={styles.avgValue}>{data.dieselPencePerLitre.toFixed(1)}p/L</Text>
        </Text>
      </View>
    </View>
  );
}

export default function NearbyPrices() {
  const [stations, setStations] = useState<CommunityFuelStation[]>([]);
  const [nationalAvg, setNationalAvg] = useState<NationalAveragePrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);

    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const res = await fetchNearbyPrices({ lat: loc.lat, lng: loc.lng });
      setStations(res.stations);
      setNationalAvg(res.nationalAverage);
    } catch {
      setError("Could not load nearby prices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Nearby Fuel Prices</Text>
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Nearby Fuel Prices</Text>
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>
            Enable location to see nearby prices
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Nearby Fuel Prices</Text>
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Nearby Fuel Prices</Text>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === "list" && styles.toggleBtnActive]}
            onPress={() => setViewMode("list")}
          >
            <Text
              style={[styles.toggleText, viewMode === "list" && styles.toggleTextActive]}
            >
              List
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === "map" && styles.toggleBtnActive]}
            onPress={() => setViewMode("map")}
          >
            <Text
              style={[styles.toggleText, viewMode === "map" && styles.toggleTextActive]}
            >
              Map
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {nationalAvg && <NationalAverageBanner data={nationalAvg} />}

      {viewMode === "list" ? (
        stations.length === 0 ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>
              No community prices nearby. Log your fill-ups to contribute!
            </Text>
          </View>
        ) : (
          stations.map((s, i) => (
            <StationCard
              key={`${s.stationName}-${i}`}
              station={s}
              nationalAvgPetrol={nationalAvg?.petrolPencePerLitre ?? null}
            />
          ))
        )
      ) : (
        <MapView
          stations={stations}
          nationalAvgPetrol={nationalAvg?.petrolPencePerLitre ?? null}
        />
      )}
    </View>
  );
}

function MapView({
  stations,
  nationalAvgPetrol,
}: {
  stations: CommunityFuelStation[];
  nationalAvgPetrol: number | null;
}) {
  try {
    const RNMaps = require("react-native-maps");
    const MapViewComponent = RNMaps.default;
    const Marker = RNMaps.Marker;
    const Callout = RNMaps.Callout;

    if (stations.length === 0) {
      return (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>
            No community prices nearby. Log your fill-ups to contribute!
          </Text>
        </View>
      );
    }

    const initialRegion = {
      latitude: stations[0].latitude,
      longitude: stations[0].longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    return (
      <MapViewComponent
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        userInterfaceStyle="dark"
      >
        {stations.map((s, i) => {
          const color = getPriceColor(s.avgPricePerLitrePence, nationalAvgPetrol);
          return (
            <Marker
              key={`${s.stationName}-${i}`}
              coordinate={{ latitude: s.latitude, longitude: s.longitude }}
              pinColor={color}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{s.stationName}</Text>
                  <Text style={styles.calloutPrice}>
                    {formatPpl(s.avgPricePerLitrePence)}
                  </Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapViewComponent>
    );
  } catch {
    return (
      <View style={styles.messageBox}>
        <Text style={styles.messageText}>
          Map view requires a development build
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginBottom: 10,
  },
  // Toggle
  toggle: {
    flexDirection: "row",
    backgroundColor: "#111827",
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: "#f59e0b",
  },
  toggleText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#6b7280",
  },
  toggleTextActive: {
    color: "#030712",
  },
  // National average banner
  avgBanner: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  avgTitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
    marginBottom: 4,
  },
  avgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avgLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#d1d5db",
  },
  avgValue: {
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f59e0b",
  },
  avgDivider: {
    fontSize: 14,
    color: "#374151",
  },
  // Station cards
  stationCard: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  stationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  stationName: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
    flex: 1,
    marginRight: 8,
  },
  stationDistance: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  stationBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stationPrice: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  reportCount: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  // Loading skeleton
  skeletonRow: {
    flexDirection: "row",
    gap: 8,
  },
  skeletonCard: {
    flex: 1,
    height: 70,
    backgroundColor: "#111827",
    borderRadius: 10,
  },
  // Message / empty state
  messageBox: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  messageText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#1f2937",
    borderRadius: 8,
  },
  retryText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f59e0b",
  },
  // Map
  map: {
    height: 250,
    borderRadius: 10,
    overflow: "hidden",
  },
  callout: {
    padding: 6,
    minWidth: 100,
  },
  calloutTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  calloutPrice: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
});
