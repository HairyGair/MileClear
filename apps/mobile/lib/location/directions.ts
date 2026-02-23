import { Alert, Linking, Platform } from "react-native";

/**
 * Open native maps app with driving directions to the given coordinates.
 * iOS: Apple Maps, Android: Google Maps (fallback to generic geo: intent).
 */
export async function openDirections(
  lat: number,
  lng: number,
  label?: string
): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      const url = `maps://?daddr=${lat},${lng}&dirflg=d`;
      await Linking.openURL(url);
      return;
    }

    // Android — try Google Maps navigation first
    const googleNav = `google.navigation:q=${lat},${lng}`;
    const canOpenGoogle = await Linking.canOpenURL(googleNav);
    if (canOpenGoogle) {
      await Linking.openURL(googleNav);
      return;
    }

    // Fallback to generic geo: intent (any maps app)
    const encodedLabel = encodeURIComponent(label ?? "Fuel Station");
    const geoUrl = `geo:${lat},${lng}?q=${lat},${lng}(${encodedLabel})`;
    await Linking.openURL(geoUrl);
  } catch {
    Alert.alert("Cannot open maps", "No maps application found on this device.");
  }
}
