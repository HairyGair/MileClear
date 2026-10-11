// From and To in one card, with a swap button between them (mockup a-filled).
// Shared by "Add a past trip" and the "Missing a trip?" sheet, so both doors
// ask for a journey the same way (PROPOSALS 0.10, P14).

import { useState } from "react";
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../lib/theme";
import type { PickerPlaceSource } from "../../lib/location/pickerPlacesStore";
import type { SavedPlace } from "../../lib/trips/placeLabel";
import { PlaceField, type PlaceKind, type PlaceValue } from "./PlaceField";

interface Props {
  from: PlaceValue | null;
  to: PlaceValue | null;
  onFrom: (v: PlaceValue, kind: PlaceKind) => void;
  onTo: (v: PlaceValue, kind: PlaceKind) => void;
  /** Swap the two ends. Shown once both are set. */
  onSwap?: () => void;
  source: PickerPlaceSource | null;
  savedPlaces: SavedPlace[];
  online: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FromToCard({ from, to, onFrom, onTo, onSwap, source, savedPlaces, online, disabled, style }: Props) {
  // No swap while one end is being changed: the chips are open under it.
  const [fromChanging, setFromChanging] = useState(false);
  const [toChanging, setToChanging] = useState(false);
  return (
    <View style={[styles.card, style]}>
      <PlaceField
        label="From"
        value={from}
        onChange={onFrom}
        otherEnd={to}
        source={source}
        savedPlaces={savedPlaces}
        online={online}
        disabled={disabled}
        onChanging={setFromChanging}
      />
      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        {onSwap && from && to && !disabled && !fromChanging && !toChanging && (
          <TouchableOpacity
            style={styles.swap}
            onPress={onSwap}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Swap From and To"
          >
            <Ionicons name="swap-vertical" size={18} color={colors.text2} accessible={false} />
          </TouchableOpacity>
        )}
      </View>
      <PlaceField
        label="To"
        value={to}
        onChange={onTo}
        otherEnd={from}
        source={source}
        savedPlaces={savedPlaces}
        online={online}
        disabled={disabled}
        onChanging={setToChanging}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginTop: 12,
  },
  dividerRow: { height: 1, justifyContent: "center", zIndex: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  swap: {
    position: "absolute",
    right: 44,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
    top: -18,
  },
});
