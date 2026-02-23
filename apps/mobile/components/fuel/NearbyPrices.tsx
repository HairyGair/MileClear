import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { getCurrentLocation } from "../../lib/location/geocoding";
import { fetchNearbyPrices } from "../../lib/api/fuel";
import { openDirections } from "../../lib/location/directions";
import FuelMapModal from "./FuelMapModal";
import type { FuelStation, NationalAveragePrices } from "@mileclear/shared";

type ViewMode = "list" | "map";

function formatDistance(miles: number): string {
  return miles < 0.1 ? "<0.1 mi" : `${miles.toFixed(1)} mi`;
}

function formatPpl(pence: number): string {
  return `${pence.toFixed(1)}p`;
}

function getPriceColor(pricePence: number, nationalAvg: number | null): string {
  if (nationalAvg === null) return "#f5a623"; // amber if no benchmark
  const diff = pricePence - nationalAvg;
  if (diff < -3) return "#10b981"; // green — cheaper
  if (diff > 3) return "#ef4444"; // red — more expensive
  return "#f5a623"; // amber — within 3p
}

function StationCard({
  station,
  nationalAvgPetrol,
  nationalAvgDiesel,
}: {
  station: FuelStation;
  nationalAvgPetrol: number | null;
  nationalAvgDiesel: number | null;
}) {
  const unleadedPrice = station.prices.E10;
  const dieselPrice = station.prices.B7;

  return (
    <View style={styles.stationCard}>
      <View style={styles.stationHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.brandName}>{station.brand}</Text>
          <Text style={styles.stationAddress} numberOfLines={1}>
            {station.address || station.postcode}
          </Text>
        </View>
        <Text style={styles.stationDistance}>{formatDistance(station.distanceMiles)}</Text>
      </View>
      <View style={styles.stationBody}>
        <View style={styles.pricesRow}>
          {unleadedPrice != null && (
            <View style={styles.priceChip}>
              <Text style={styles.fuelLabel}>Unleaded</Text>
              <Text
                style={[
                  styles.fuelPrice,
                  { color: getPriceColor(unleadedPrice, nationalAvgPetrol) },
                ]}
              >
                {formatPpl(unleadedPrice)}
              </Text>
            </View>
          )}
          {dieselPrice != null && (
            <View style={styles.priceChip}>
              <Text style={styles.fuelLabel}>Diesel</Text>
              <Text
                style={[
                  styles.fuelPrice,
                  { color: getPriceColor(dieselPrice, nationalAvgDiesel) },
                ]}
              >
                {formatPpl(dieselPrice)}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.directionsPill}
          onPress={() =>
            openDirections(station.latitude, station.longitude, station.brand)
          }
          activeOpacity={0.7}
        >
          <Text style={styles.directionsPillText}>Directions</Text>
        </TouchableOpacity>
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
          <Text style={styles.avgValue}>{data.petrolPencePerLitre.toFixed(1)}p</Text>
        </Text>
        <Text style={styles.avgDivider}>|</Text>
        <Text style={styles.avgLabel}>
          Diesel{" "}
          <Text style={styles.avgValue}>{data.dieselPencePerLitre.toFixed(1)}p</Text>
        </Text>
      </View>
    </View>
  );
}

export default function NearbyPrices() {
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [nationalAvg, setNationalAvg] = useState<NationalAveragePrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [mapModalVisible, setMapModalVisible] = useState(false);

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

      setUserLat(loc.lat);
      setUserLng(loc.lng);

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
              No fuel stations found nearby
            </Text>
          </View>
        ) : (
          stations.map((s, i) => (
            <StationCard
              key={`${s.siteId}-${i}`}
              station={s}
              nationalAvgPetrol={nationalAvg?.petrolPencePerLitre ?? null}
              nationalAvgDiesel={nationalAvg?.dieselPencePerLitre ?? null}
            />
          ))
        )
      ) : (
        <View style={styles.mapContainer}>
          <InlineMapView
            stations={stations}
            nationalAvgPetrol={nationalAvg?.petrolPencePerLitre ?? null}
            userLat={userLat}
            userLng={userLng}
          />
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setMapModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.expandBtnText}>⛶</Text>
          </TouchableOpacity>
        </View>
      )}

      <FuelMapModal
        visible={mapModalVisible}
        onClose={() => setMapModalVisible(false)}
        stations={stations}
        nationalAvgPetrol={nationalAvg?.petrolPencePerLitre ?? null}
        nationalAvgDiesel={nationalAvg?.dieselPencePerLitre ?? null}
        userLat={userLat}
        userLng={userLng}
      />
    </View>
  );
}

function InlineMapView({
  stations,
  nationalAvgPetrol,
  userLat,
  userLng,
}: {
  stations: FuelStation[];
  nationalAvgPetrol: number | null;
  userLat: number | null;
  userLng: number | null;
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
            No fuel stations found nearby
          </Text>
        </View>
      );
    }

    const centerLat = userLat ?? stations[0].latitude;
    const centerLng = userLng ?? stations[0].longitude;

    const initialRegion = {
      latitude: centerLat,
      longitude: centerLng,
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
          const e10 = s.prices.E10;
          const color = e10 != null ? getPriceColor(e10, nationalAvgPetrol) : "#f5a623";
          return (
            <Marker
              key={`${s.siteId}-${i}`}
              coordinate={{ latitude: s.latitude, longitude: s.longitude }}
              pinColor={color}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{s.brand}</Text>
                  {e10 != null && (
                    <Text style={styles.calloutPrice}>
                      Unleaded {formatPpl(e10)}
                    </Text>
                  )}
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
    backgroundColor: "#f5a623",
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
    color: "#f5a623",
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
    alignItems: "flex-start",
    marginBottom: 8,
  },
  brandName: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
  },
  stationAddress: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginTop: 2,
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
  pricesRow: {
    flexDirection: "row",
    gap: 12,
  },
  priceChip: {
    alignItems: "center",
  },
  fuelLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
    marginBottom: 2,
  },
  fuelPrice: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  directionsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f5a623",
  },
  directionsPillText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
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
    color: "#f5a623",
  },
  // Map
  mapContainer: {
    position: "relative",
  },
  map: {
    height: 250,
    borderRadius: 10,
    overflow: "hidden",
  },
  expandBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(3,7,18,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  expandBtnText: {
    fontSize: 16,
    color: "#fff",
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
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
});
