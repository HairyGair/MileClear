import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { SupportScreenshotUpload } from "@mileclear/shared";

// Screenshots for private problem reports and their replies (6 Oct 2026).
// The server takes up to 3 per message, jpeg or png, 1.5 MB each.

export const MAX_SCREENSHOTS = 3;
const MAX_BYTES = 1.5 * 1024 * 1024;

export interface PickedScreenshot extends SupportScreenshotUpload {
  /** Local file for the preview thumbnail. */
  uri: string;
}

/** Pick one screenshot from Photos; null if cancelled, refused or too big. */
export async function pickScreenshot(): Promise<PickedScreenshot | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Photos access needed", "Allow access to your photos in Settings to add a screenshot.");
    return null;
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    base64: true,
    allowsEditing: false,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset?.base64) return null;

  // Anything other than PNG comes back re-encoded as JPEG at quality < 1.
  const mime: SupportScreenshotUpload["mime"] = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
  const bytes = Math.floor((asset.base64.length * 3) / 4);
  if (bytes > MAX_BYTES) {
    Alert.alert("Screenshot too large", "That image is over 1.5 MB. Try a normal screenshot rather than a photo.");
    return null;
  }
  return { uri: asset.uri, mime, base64: asset.base64 };
}

/** What goes over the wire (no local uri). */
export function toUploads(shots: PickedScreenshot[]): SupportScreenshotUpload[] | undefined {
  return shots.length ? shots.map(({ mime, base64 }) => ({ mime, base64 })) : undefined;
}
