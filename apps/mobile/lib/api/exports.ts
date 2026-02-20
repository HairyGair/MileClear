import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3002";
const ACCESS_TOKEN_KEY = "mileclear_access_token";

export async function downloadAndShareExport(
  path: string,
  filename: string,
  mimeType: string
): Promise<void> {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (!token) throw new Error("Not authenticated");

  const fileUri = FileSystem.documentDirectory + filename;

  const result = await FileSystem.downloadAsync(`${API_URL}${path}`, fileUri, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (result.status === 403) {
    // Clean up partial download
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    throw new Error("Premium subscription required");
  }

  if (result.status !== 200) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    throw new Error("Download failed");
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, { mimeType });
  }
}

export async function fetchAccountingPreview(
  provider: "xero" | "freeagent" | "quickbooks",
  taxYear: string
): Promise<{ status: string; message: string; preview: unknown }> {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}/exports/${provider}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ taxYear }),
  });

  if (res.status === 403) {
    throw new Error("Premium subscription required");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
