// From or To on the "Add a past trip" form (PROPOSALS 0.2, A.1 rows 2 and 3).
//
// Empty, it shows the driver's saved places and two recent places as one-tap
// chips, then a search chip that opens the usual search, map and "Where I am".
// Picked, it shows "Home · 12 Kenton Lane" with Change. Everything here works
// with no signal except the address search, which says so.

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { haversineDistance } from "@mileclear/shared";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import { placeChips, type PlaceChip, type PlaceChipKind } from "../../lib/location/recentPlaces";
import { loadPickerPlaceSource, type PickerPlaceSource } from "../../lib/location/pickerPlacesStore";
import { savedPlaceAt, shortPlaceLabel, type SavedPlace } from "../../lib/trips/placeLabel";
import { LocationPickerField } from "../LocationPickerField";

export interface PlaceValue {
  lat: number;
  lng: number;
  address: string | null;
}

/** How the driver picked a place, for the form's events. */
export type PlaceKind = "saved" | "recent" | "search" | "where_i_am" | "prefill";

const CHIP_ICON: Record<PlaceChipKind, keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  work: "briefcase-outline",
  depot: "business-outline",
  custom: "bookmark-outline",
  recent: "time-outline",
};

/** Saved and recent places, read once per form and refreshed on demand. */
export function usePickerPlaceSource(): PickerPlaceSource | null {
  const [source, setSource] = useState<PickerPlaceSource | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPickerPlaceSource()
      .then((s) => {
        if (!cancelled) setSource(s);
      })
      .catch(() => {
        if (!cancelled) setSource({ places: { saved: [], recent: [] }, types: {} });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return source;
}

/** "Home" and "12 Kenton Lane", or the address's own short name and the rest. */
export function placeWords(
  value: PlaceValue,
  savedPlaces: SavedPlace[]
): { name: string; detail: string | null } {
  const saved = savedPlaceAt(savedPlaces, value.lat, value.lng);
  const address = value.address?.trim() || null;
  if (saved) {
    const short = address && address !== saved ? shortPlaceLabel(address, 26) : "";
    return { name: saved, detail: short && short !== saved ? short : "saved place" };
  }
  if (!address) return { name: "Pinned on the map", detail: null };
  const short = shortPlaceLabel(address, 26);
  if (!short) return { name: address, detail: null };
  const rest = address
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !p.includes(short))
    .slice(0, 2)
    .join(", ");
  return { name: short, detail: rest || null };
}

interface Props {
  label: "From" | "To";
  value: PlaceValue | null;
  onChange: (value: PlaceValue, kind: PlaceKind) => void;
  source: PickerPlaceSource | null;
  savedPlaces: SavedPlace[];
  /** The place at the other end, so its chip goes last. */
  otherEnd?: PlaceValue | null;
  online: boolean;
  disabled?: boolean;
  /** Told when the driver opens or closes Change on a picked place. */
  onChanging?: (changing: boolean) => void;
}

export function PlaceField({ label, value, onChange, source, savedPlaces, otherEnd, online, disabled, onChanging }: Props) {
  const [changing, setChanging] = useState(false);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    onChanging?.(changing);
  }, [changing, onChanging]);
  const verb = label === "From" ? "set off from" : "go to";

  // A new value (a chip, a swap, "Add the next trip") closes the chooser.
  useEffect(() => {
    setChanging(false);
    setSearching(false);
  }, [value?.lat, value?.lng]);

  const chips: PlaceChip[] = source
    ? placeChips({
        places: source.places,
        types: source.types,
        otherEnd: otherEnd ? { lat: otherEnd.lat, lng: otherEnd.lng } : null,
        haversine: haversineDistance,
      })
    : [];

  const choosing = !value || changing;

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      {value && !changing ? (
        <View style={styles.pickedRow}>
          <View style={styles.pickedText}>
            <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
            <PickedPlace value={value} savedPlaces={savedPlaces} />
          </View>
          {!disabled && (
            <TouchableOpacity
              onPress={() => setChanging(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Change where you ${verb}`}
            >
              <Text style={styles.change} maxFontSizeMultiplier={fontScaleCap.body}>Change</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.labelRow}>
          <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
          {changing && (
            <TouchableOpacity
              onPress={() => {
                setChanging(false);
                setSearching(false);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Keep the place you picked for ${label}`}
            >
              <Text style={styles.change} maxFontSizeMultiplier={fontScaleCap.body}>Keep</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {choosing && !disabled && (
        <>
          {/* The search chip stays put at the end of the row, outside the
              scroll, so it is never hidden behind four or five place chips. */}
          <View style={styles.chipLine}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              {chips.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={styles.chip}
                  onPress={() => onChange({ lat: c.lat, lng: c.lng, address: c.label }, c.kind === "recent" ? "recent" : "saved")}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}: ${c.label}, ${c.kind === "recent" ? "recent place" : "saved place"}`}
                >
                  <Ionicons name={CHIP_ICON[c.kind]} size={16} color={colors.text2} accessible={false} />
                  <Text style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                    {c.kind === "recent" ? shortPlaceLabel(c.label, 20) || c.label : c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.chip, styles.searchChip, searching && styles.searchChipOn]}
              onPress={() => setSearching((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={searching ? `Hide search for ${label}` : `Search for where you ${verb}, or use the map or where you are`}
              accessibilityState={{ expanded: searching }}
            >
              <Ionicons name="search-outline" size={16} color={colors.text2} accessible={false} />
              {chips.length === 0 && (
                <Text style={styles.chipText} maxFontSizeMultiplier={fontScaleCap.body}>Search</Text>
              )}
            </TouchableOpacity>
          </View>
          {searching && (
            <>
              {!online && (
                <Text style={styles.offline} maxFontSizeMultiplier={fontScaleCap.body}>
                  No signal. Pick a saved or recent place, or try again.
                </Text>
              )}
              <LocationPickerField
                bare
                initialSearchOpen
                label={label}
                lat={value?.lat ?? null}
                lng={value?.lng ?? null}
                address={value?.address ?? null}
                onLocationChange={(lat, lng, address) => onChange({ lat, lng, address }, "search")}
              />
            </>
          )}
        </>
      )}
    </View>
  );
}

function PickedPlace({ value, savedPlaces }: { value: PlaceValue; savedPlaces: SavedPlace[] }) {
  const { name, detail } = placeWords(value, savedPlaces);
  return (
    <Text style={styles.picked} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
      <Text style={styles.pickedName}>{name}</Text>
      {detail ? <Text style={styles.pickedDetail}>{`  ·  ${detail}`}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 12 },
  disabled: { opacity: 0.6 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  change: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text2 },
  pickedRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pickedText: { flex: 1, gap: 2 },
  picked: { fontSize: 17, color: colors.text1 },
  pickedName: { fontFamily: fonts.bold, color: colors.text1 },
  pickedDetail: { fontFamily: fonts.regular, fontSize: 14, color: colors.text2 },
  chipLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  chipScroll: { flexGrow: 0, flexShrink: 1 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  chipText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1, maxWidth: 180 },
  searchChip: { paddingHorizontal: 12 },
  searchChipOn: { borderColor: colors.text3 },
  offline: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 10 },
});
