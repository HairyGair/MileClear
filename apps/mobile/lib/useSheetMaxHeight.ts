import { useWindowDimensions } from "react-native";

/**
 * Max height for a bottom sheet or card as a fraction of the CURRENT window
 * height. Reading Dimensions inside StyleSheet.create freezes the value at
 * load, so after the phone rotates a sheet would be taller than the screen.
 * Spread the result into the sheet's style: style={[styles.sheet, sheetMax]}.
 */
export function useSheetMaxHeight(fraction: number): { maxHeight: number } {
  const { height } = useWindowDimensions();
  return { maxHeight: Math.round(height * fraction) };
}
