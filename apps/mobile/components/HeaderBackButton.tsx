import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { safeBack } from "../lib/nav";

/**
 * The app-wide header back button. Used as the global `headerLeft` so every
 * stack screen gets a back control that actually works - it bypasses the iOS
 * native back button (which can misbehave on iOS 26) and routes through
 * `safeBack`, so it's never a dead end even on screens reached via `replace`.
 *
 * Plain TouchableOpacity (not an animated Button) + generous hitSlop, per the
 * header hit-testing lessons from the iPad modal rejection.
 */
export function HeaderBackButton({
  fallback,
  tint = "#f0f2f5",
}: {
  fallback?: string;
  tint?: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => safeBack(fallback)}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.btn}
    >
      <Ionicons name="chevron-back" size={26} color={tint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 4, paddingRight: 12, paddingLeft: 2 },
});
