import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { apiRequest, ACCESS_TOKEN_KEY } from "./index";
import type {
  SupportScreenshotUpload,
  SupportThreadDetail,
  SupportThreadSummary,
} from "@mileclear/shared";

// Private problem reports and their conversations (6 Oct 2026). These land
// in the admin Inbox beside support@ email; see
// docs/feedback-redesign-oct2026.md.

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.mileclear.com";

export function submitProblemReport(data: {
  subject?: string;
  body: string;
  screenshots?: SupportScreenshotUpload[];
}) {
  return apiRequest<{ data: { threadKey: string } }>("/support/report", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function fetchSupportThreads() {
  return apiRequest<{ data: SupportThreadSummary[] }>("/support/threads");
}

export function fetchSupportThread(threadKey: string) {
  return apiRequest<{ data: SupportThreadDetail }>(
    `/support/threads/${encodeURIComponent(threadKey)}`
  );
}

export function replyToSupportThread(
  threadKey: string,
  data: { body: string; screenshots?: SupportScreenshotUpload[] }
) {
  return apiRequest<{ data: unknown }>(
    `/support/threads/${encodeURIComponent(threadKey)}/reply`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

/**
 * Download a screenshot to the cache (once) and return its file URI, so
 * <Image> never holds base64 in memory. Attachments are immutable, so the
 * cached copy is reused. On a 401 (expired access token) one cheap API call
 * refreshes the token and the download is retried once.
 */
export async function getSupportAttachmentUri(id: string, mime: string): Promise<string> {
  const ext = mime === "image/png" ? "png" : "jpg";
  const uri = `${FileSystem.cacheDirectory}support-${id}.${ext}`;
  const existing = await FileSystem.getInfoAsync(uri);
  if (existing.exists && (existing.size ?? 0) > 0) return uri;

  const download = async () => {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    return FileSystem.downloadAsync(`${API_URL}/support/attachments/${encodeURIComponent(id)}`, uri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };

  let res = await download();
  if (res.status === 401) {
    await fetchSupportThreads().catch(() => {});
    res = await download();
  }
  if (res.status !== 200) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    throw new Error("Couldn't load the screenshot");
  }
  return uri;
}
