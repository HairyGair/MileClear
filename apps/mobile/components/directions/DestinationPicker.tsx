// Directions destination picker (DESIGN 2.1): search, choose on the map,
// saved places, recent places. One tap on a row goes to the preview.
// While the car is moving (10 mph or more) search and the map are locked:
// saved and recent places stay one tap, and "I'm a passenger" unlocks.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { reverseGeocode } from "../../lib/location/geocoding";
import { shortAddress } from "../../lib/navigation/rules";
import { colors, fonts, fontScaleCap, nav, radii, spacing } from "../../lib/theme";
import { MapPickerModal } from "../MapPickerModal";
import { loadPickerPlaceSource } from "../../lib/location/pickerPlacesStore";
import { distanceMeters, METRES_PER_MILE, type LatLng } from "../../lib/navigation/geo";
import { getRecentDestinations } from "../../lib/navigation/store";
import { initialMovingLock, updateMovingLock, type MovingLock } from "../../lib/navigation/rules";
import { existingSearchProvider, type PlaceResult } from "../../lib/navigation/placeSearch";
import { photonFirstProvider, SearchFailure, SEARCH_MIN_CHARS } from "../../lib/navigation/photonSearch";
import { fetchNavigationSearch } from "../../lib/api/navigation";
import { lookupPostcode } from "../../lib/location/postcodes";
import type { Destination } from "../../lib/navigation/useGuidance";
import { TestBadge } from "./TestBadge";

interface Row {
  key: string;
  kind: "home" | "work" | "depot" | "custom" | "recent";
  title: string;
  subtitle: string | null;
  lat: number;
  lng: number;
  name: string | null;
}

const ICONS: Record<Row["kind"], keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  work: "briefcase-outline",
  depot: "cube-outline",
  custom: "location-outline",
  recent: "time-outline",
};

function milesAway(here: LatLng | null, p: LatLng): string | null {
  if (!here) return null;
  const mi = distanceMeters(here, p) / METRES_PER_MILE;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

export function DestinationPicker({
  here: hereProp,
  movingMps,
  onPick,
  onClose,
}: {
  here: LatLng | null;
  movingMps: number | null;
  onPick: (d: Destination) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Our own search first, the app's existing search as the silent fallback.
  const provider = useMemo(
    () =>
      photonFirstProvider({
        fetchPlaces: fetchNavigationSearch,
        fallback: existingSearchProvider(),
        lookupPostcode: async (q) => {
          const pc = await lookupPostcode(q);
          return pc ? { id: `pc:${pc.postcode}`, title: pc.postcode, subtitle: pc.adminDistrict || null, lat: pc.lat, lng: pc.lng } : null;
        },
      }),
    []
  );
  useEffect(() => () => provider.cancel(), [provider]);
  const [saved, setSaved] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<"none" | "offline" | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [lock, setLock] = useState<MovingLock>(initialMovingLock);
  const [passenger, setPassenger] = useState(false);
  const [typingWhenLocked, setTypingWhenLocked] = useState(false);
  const seq = useRef(0);
  // Distances need a position: the screen's latest fix, else the phone's
  // last known one (a one-off read, not a listener).
  const [knownHere, setKnownHere] = useState<LatLng | null>(null);
  const here = hereProp ?? knownHere;
  useEffect(() => {
    if (hereProp) return;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") return;
        const p = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
        if (p && !cancelled) setKnownHere({ lat: p.coords.latitude, lng: p.coords.longitude });
      } catch {
        // no distances, that's all
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hereProp]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Moving lock, from the same fixes guidance uses.
  useEffect(() => {
    setLock((l) => updateMovingLock(l, movingMps, Date.now()));
  }, [movingMps]);
  useEffect(() => {
    const id = setInterval(() => setLock((l) => updateMovingLock(l, movingMps, Date.now())), 1000);
    return () => clearInterval(id);
  }, [movingMps]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadPickerPlaceSource(), getRecentDestinations()])
      .then(([src, dests]) => {
        if (cancelled) return;
        setSaved(
          src.places.saved.map((p) => {
            const t = src.types[p.key.replace(/^saved:/, "")];
            const kind: Row["kind"] = t === "home" || t === "work" || t === "depot" ? t : "custom";
            return { key: p.key, kind, title: p.label, subtitle: null, lat: p.lat, lng: p.lng, name: p.label };
          })
        );
        const rows: Row[] = [];
        const near = (a: LatLng, b: LatLng) => distanceMeters(a, b) < 75;
        for (const d of dests) {
          rows.push({ key: `dir:${d.atMs}`, kind: "recent", title: d.label, subtitle: null, lat: d.lat, lng: d.lng, name: null });
        }
        for (const p of src.places.recent) {
          if (rows.length >= 8) break;
          if (rows.some((r) => near(r, p)) || src.places.saved.some((s) => near(s, p))) continue;
          rows.push({ key: p.key, kind: "recent", title: p.label, subtitle: null, lat: p.lat, lng: p.lng, name: null });
        }
        setRecent(rows.slice(0, 8));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  // Saved places keep no address on the phone: look up a short one for each
  // (the geocoder caches them), one at a time, at most 12.
  const savedKeys = saved.map((r) => r.key).join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const r of saved.slice(0, 12)) {
        if (cancelled || r.subtitle) continue;
        const full = await reverseGeocode(r.lat, r.lng).catch(() => null);
        const short = shortAddress(full, r.title);
        if (cancelled || !short) continue;
        setSaved((rows) => rows.map((x) => (x.key === r.key ? { ...x, subtitle: short } : x)));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKeys]);

  const searchLocked = lock.locked && !passenger && !typingWhenLocked;

  const onChange = (t: string) => {
    setQuery(t);
    setSearchError(null);
    if (lock.locked) setTypingWhenLocked(true); // never yank the field mid-typing
    if (debounce.current) clearTimeout(debounce.current);
    if (t.trim().length < SEARCH_MIN_CHARS) {
      provider.cancel();
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const n = ++seq.current;
      try {
        const r = await provider.search(t, here);
        if (n !== seq.current) return;
        setResults(r);
        setSearchError(r.length === 0 ? "none" : null);
      } catch (err) {
        // A newer keystroke replaced this search: nothing to show for it.
        if (err instanceof SearchFailure && err.kind === "aborted") return;
        if (n === seq.current) setSearchError("offline");
      } finally {
        if (n === seq.current) setSearching(false);
      }
    }, 300);
  };

  const pickResult = async (r: PlaceResult) => {
    setSearching(true);
    try {
      const p = await provider.resolve(r);
      if (p) onPick({ lat: p.lat, lng: p.lng, label: r.subtitle ? `${r.title}, ${r.subtitle}` : r.title, name: null });
      else setSearchError("offline");
    } catch {
      setSearchError("offline");
    } finally {
      setSearching(false);
    }
  };

  const rowView = (r: Row) => {
    const away = milesAway(here, r);
    return (
      <TouchableOpacity
        key={r.key}
        style={s.row}
        onPress={() => onPick({ lat: r.lat, lng: r.lng, label: r.title, name: r.name })}
        accessibilityRole="button"
        accessibilityLabel={`${r.title}${r.subtitle ? `, ${r.subtitle}` : ""}${away ? `, ${away} away` : ""}`}
      >
        <Ionicons name={ICONS[r.kind]} size={22} color={colors.text2} accessible={false} />
        <View style={s.rowText}>
          <Text style={s.rowTitle} numberOfLines={1}>
            {r.title}
          </Text>
          {r.subtitle && (
            <Text style={s.rowSub} numberOfLines={1}>
              {r.subtitle}
            </Text>
          )}
        </View>
        {away && <Text style={s.rowAway}>{away}</Text>}
      </TouchableOpacity>
    );
  };

  const empty = saved.length === 0 && recent.length === 0 && query.trim().length === 0;
  const showingResults = !searchLocked && query.trim().length >= SEARCH_MIN_CHARS;

  return (
    <View style={[s.page, { paddingTop: insets.top + spacing.sm }]}>
      <View style={s.header}>
        <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.heading}>
          Directions
        </Text>
        <TestBadge />
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.text1} />
        </TouchableOpacity>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <View style={s.content}>
            {searchLocked ? (
              <View style={s.lockCard}>
                <View style={s.lockTop}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.amber} />
                  <Text style={s.lockTitle}>Search is off while you're driving</Text>
                </View>
                <Text style={s.body}>Pick a saved or recent place, or pull over to search.</Text>
                <TouchableOpacity
                  onPress={() => setPassenger(true)}
                  style={s.passenger}
                  accessibilityRole="button"
                  accessibilityLabel="I'm a passenger"
                >
                  <Text style={s.passengerText}>I'm a passenger</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={s.searchBox}>
                  <Ionicons name="search" size={18} color={colors.text3} accessible={false} />
                  <TextInput
                    style={s.searchInput}
                    value={query}
                    onChangeText={onChange}
                    placeholder="Search for a place, address or postcode"
                    placeholderTextColor={colors.text3}
                    returnKeyType="search"
                    autoCorrect={false}
                    accessibilityLabel="Search for a place, address or postcode"
                  />
                  {searching && <ActivityIndicator size="small" color={colors.amber} />}
                </View>
                {!showingResults && (
                  <TouchableOpacity style={s.row} onPress={() => setShowMap(true)} accessibilityRole="button">
                    <Ionicons name="map-outline" size={22} color={colors.text2} accessible={false} />
                    <Text style={[s.rowTitle, { flex: 1 }]}>Choose on the map</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />
                  </TouchableOpacity>
                )}
              </>
            )}

            {showingResults ? (
              <>
                {results.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={s.row}
                    onPress={() => void pickResult(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.title}${r.subtitle ? `, ${r.subtitle}` : ""}`}
                  >
                    <Ionicons name="location-outline" size={22} color={colors.text2} accessible={false} />
                    <View style={s.rowText}>
                      <Text style={s.rowTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                      {r.subtitle && (
                        <Text style={s.rowSub} numberOfLines={1}>
                          {r.subtitle}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
                {searchError === "none" && !searching && (
                  <Text style={s.note}>No places found. Try a postcode or the full street name.</Text>
                )}
                {searchError === "offline" && !searching && <Text style={s.note}>Search needs an internet connection.</Text>}
              </>
            ) : empty ? (
              <View style={s.empty}>
                <Ionicons name="navigate-circle-outline" size={40} color={colors.text3} />
                <Text style={s.emptyTitle}>Where are you heading?</Text>
                <Text style={[s.body, { textAlign: "center" }]}>
                  Search for a place, address or postcode. Places you save show here for one tap next time.
                </Text>
                <TouchableOpacity onPress={() => router.push("/saved-locations" as never)} accessibilityRole="link" style={s.link}>
                  <Text style={s.linkText}>Save a place</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {saved.length > 0 && <Text style={s.section}>Saved places</Text>}
                {saved.map(rowView)}
                {recent.length > 0 && <Text style={s.section}>Recent</Text>}
                {recent.map(rowView)}
              </>
            )}
          </View>
      </ScrollView>

      <MapPickerModal
        visible={showMap}
        initialLat={here?.lat ?? null}
        initialLng={here?.lng ?? null}
        onCancel={() => setShowMap(false)}
        onConfirm={(lat, lng, address) => {
          setShowMap(false);
          onPick({ lat, lng, label: address ?? "Dropped pin", name: null });
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text1 },
  close: { width: nav.control, height: nav.control, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  searchBox: {
    minHeight: nav.control,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginTop: spacing.sm,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text1, paddingVertical: spacing.md },
  lockCard: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  lockTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lockTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.text1 },
  passenger: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  passengerText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.amber },
  section: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text3,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text1 },
  rowSub: { fontFamily: fonts.regular, fontSize: 14, color: colors.text2 },
  rowAway: { fontFamily: fonts.medium, fontSize: 14, color: colors.text3 },
  note: { fontFamily: fonts.regular, fontSize: 14, color: colors.text2, paddingVertical: spacing.md },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text2 },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text1 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.amber },
});

