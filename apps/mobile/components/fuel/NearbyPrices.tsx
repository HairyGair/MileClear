import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { getCurrentLocation } from "../../lib/location/geocoding";
import { fetchNearbyPrices } from "../../lib/api/fuel";
import { fetchVehicles } from "../../lib/api/vehicles";
import { ALL_FUELS, mapFuelFor, UNLEADED, type MapFuel } from "../../lib/fuel/mapFuel";
import { priceBenchmark, stationsFor, type StationSort } from "../../lib/fuel/stationList";
import { loadFuelListPrefs, saveFuelListPrefs } from "../../lib/fuel/listPrefs";
import { openDirections } from "../../lib/location/directions";
import FuelMapModal from "./FuelMapModal";
import type { FuelStation, NationalAveragePrices } from "@mileclear/shared";
import { colors, fonts } from "../../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;
const RED = colors.red;

type ViewMode = "list" | "map";

function formatDistance(miles: number): string {
  return miles < 0.1 ? "<0.1 mi" : `${miles.toFixed(1)} mi`;
}

function formatPpl(pence: number): string {
  return `${pence.toFixed(1)}p`;
}

function getPriceColor(pricePence: number, nationalAvg: number | null): string {
  if (nationalAvg === null) return AMBER; // amber if no benchmark
  const diff = pricePence - nationalAvg;
  if (diff < -3) return GREEN; // green — cheaper
  if (diff > 3) return RED; // red — more expensive
  return AMBER; // amber — within 3p
}

function StationCard({
  station,
  fuel,
  benchmark,
}: {
  station: FuelStation;
  fuel: MapFuel;
  benchmark: number | null;
}) {
  const price = station.prices[fuel.key];

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
          {price != null && (
            <View style={styles.priceChip}>
              <Text style={styles.fuelLabel}>{fuel.label}</Text>
              <Text style={[styles.fuelPrice, { color: getPriceColor(price, benchmark) }]}>
                {formatPpl(price)}
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
          accessibilityRole="button"
          accessibilityLabel={`Get directions to ${station.brand}, ${station.address || station.postcode}, ${formatDistance(station.distanceMiles)} away`}
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
  // The grade the list and map show: the one the driver last picked, else
  // their vehicle's fuel (a diesel driver sees diesel prices).
  const [fuel, setFuel] = useState<MapFuel>(UNLEADED);
  const [sort, setSort] = useState<StationSort>("nearest");
  const [fuelPicked, setFuelPicked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFuelListPrefs().then((prefs) => {
      if (cancelled) return;
      setSort(prefs.sort);
      if (prefs.fuel) {
        setFuel(prefs.fuel);
        setFuelPicked(true);
        return;
      }
      fetchVehicles()
        .then((res) => {
          if (!cancelled) setFuel(mapFuelFor(res.data));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseFuel = (f: MapFuel) => {
    setFuel(f);
    setFuelPicked(true);
    saveFuelListPrefs({ fuel: f, sort });
  };
  const chooseSort = (next: StationSort) => {
    setSort(next);
    saveFuelListPrefs({ fuel: fuelPicked ? fuel : null, sort: next });
  };

  const shown = useMemo(() => stationsFor(stations, fuel, sort), [stations, fuel, sort]);
  const benchmark = useMemo(
    () => priceBenchmark(fuel, nationalAvg, stations),
    [fuel, nationalAvg, stations]
  );

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
          <TouchableOpacity
            onPress={load}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading nearby fuel prices"
          >
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
            accessibilityRole="tab"
            accessibilityLabel="List view"
            accessibilityState={{ selected: viewMode === "list" }}
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
            accessibilityRole="tab"
            accessibilityLabel="Map view"
            accessibilityState={{ selected: viewMode === "map" }}
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.fuelChips}
        style={styles.fuelChipsScroll}
      >
        {ALL_FUELS.map((f) => {
          const active = f.key === fuel.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.fuelChipBtn, active && styles.fuelChipBtnActive]}
              onPress={() => chooseFuel(f)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${f.label} prices`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.fuelChipText, active && styles.fuelChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {viewMode === "list" && shown.length > 1 && (
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <View style={styles.toggle}>
            {(["nearest", "cheapest"] as const).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.toggleBtn, sort === k && styles.toggleBtnActive]}
                onPress={() => chooseSort(k)}
                accessibilityRole="tab"
                accessibilityLabel={k === "nearest" ? "Sort by nearest" : "Sort by cheapest"}
                accessibilityState={{ selected: sort === k }}
              >
                <Text style={[styles.toggleText, sort === k && styles.toggleTextActive]}>
                  {k === "nearest" ? "Nearest" : "Cheapest"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {viewMode === "list" ? (
        shown.length === 0 ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>
              {stations.length === 0
                ? "No fuel stations found nearby"
                : `No nearby stations list a ${fuel.label.toLowerCase()} price`}
            </Text>
          </View>
        ) : (
          shown.map((s, i) => (
            <StationCard
              key={`${s.siteId}-${i}`}
              station={s}
              fuel={fuel}
              benchmark={benchmark}
            />
          ))
        )
      ) : (
        <View style={styles.mapContainer}>
          <InlineMapView
            stations={shown}
            fuel={fuel}
            nationalAvg={benchmark}
            userLat={userLat}
            userLng={userLng}
          />
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setMapModalVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Expand map to full screen"
          >
            <Text style={styles.expandBtnText} accessible={false}>⛶</Text>
          </TouchableOpacity>
        </View>
      )}

      <FuelMapModal
        visible={mapModalVisible}
        onClose={() => setMapModalVisible(false)}
        stations={shown}
        benchmark={benchmark}
        fuel={fuel}
        userLat={userLat}
        userLng={userLng}
      />
    </View>
  );
}

function InlineMapView({
  stations,
  fuel,
  nationalAvg,
  userLat,
  userLng,
}: {
  stations: FuelStation[];
  fuel: MapFuel;
  nationalAvg: number | null;
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
          const price = s.prices[fuel.key];
          const color = price != null ? getPriceColor(price, nationalAvg) : AMBER;
          return (
            <Marker
              key={`${s.siteId}-${i}`}
              coordinate={{ latitude: s.latitude, longitude: s.longitude }}
              pinColor={color}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle} numberOfLines={1}>{s.brand}</Text>
                  {price != null && (
                    <Text style={styles.calloutPrice}>
                      {fuel.label} {formatPpl(price)}
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
    fontFamily: fonts.bold,
    color: "#fff",
    marginBottom: 10,
  },
  // Toggle
  toggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: AMBER,
  },
  toggleText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_3,
  },
  toggleTextActive: {
    color: BG,
  },
  // Fuel grade chips + sort
  fuelChipsScroll: {
    marginBottom: 10,
    flexGrow: 0,
  },
  fuelChips: {
    gap: 6,
  },
  fuelChipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  fuelChipBtnActive: {
    backgroundColor: AMBER,
  },
  fuelChipText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  fuelChipTextActive: {
    color: BG,
  },
  sortRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sortLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: TEXT_3,
  },
  // National average banner
  avgBanner: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  avgTitle: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 4,
  },
  avgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avgLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  avgValue: {
    fontFamily: fonts.bold,
    color: AMBER,
  },
  avgDivider: {
    fontSize: 14,
    color: "#374151",
  },
  // Station cards
  stationCard: {
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.bold,
    color: "#fff",
  },
  stationAddress: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 2,
  },
  stationDistance: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
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
    alignItems: "flex-start",
  },
  fuelLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: TEXT_3,
    marginBottom: 2,
  },
  fuelPrice: {
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  directionsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AMBER,
  },
  directionsPillText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  // Loading skeleton
  skeletonRow: {
    flexDirection: "row",
    gap: 8,
  },
  skeletonCard: {
    flex: 1,
    height: 70,
    backgroundColor: CARD_BG,
    borderRadius: 10,
  },
  // Message / empty state
  messageBox: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  messageText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
  },
  retryText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: AMBER,
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
    maxWidth: 220,
  },
  calloutTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: BG,
  },
  calloutPrice: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: BG,
  },
});
