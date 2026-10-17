// The sentence to show when a download comes back with an error.
//
// Downloads are written straight to a file, so a refusal such as "There are
// no trips in that car in the 2026-27 tax year yet..." lands in the file as
// JSON and the driver used to see only "Download failed". Pure, so it can be
// tested without Expo.

const MAX_LENGTH = 400;

/** The server's own sentence from an error body, or the fallback. */
export function exportErrorMessage(body: string | null | undefined, fallback: string): string {
  if (!body) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return fallback; // HTML from a proxy, a half-written file, and so on
  }
  if (!parsed || typeof parsed !== "object") return fallback;
  const error = (parsed as { error?: unknown }).error;
  // Legacy shape { error: "..." }, or the newer { error: { message: "..." } }.
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : null;
  const trimmed = message?.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return fallback;
  return trimmed;
}
