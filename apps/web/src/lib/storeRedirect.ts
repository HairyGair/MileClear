/** Which store a phone belongs to, from its user agent (route /app). Kept out
 *  of the route file because Next only allows route exports there. */
export function storeFor(userAgent: string): "ios" | "android" | "other" {
  const ua = userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ reports itself as a Mac; the "Mobile/" token is the tell.
  if (/Macintosh/i.test(ua) && /Mobile\//i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** The channel a /app link was shared in (?from=), lower-case letters,
 *  digits and dashes only. No ?from (the billboard QR) or junk = "billboard". */
export function sourceFrom(raw: string | null): string {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(v) ? v : "billboard";
}

/** Google Play link carrying the channel as an install referrer, so the Play
 *  Console can attribute installs to it (Acquisition > by UTM). */
export function playUrlFor(from: string): string {
  const referrer = encodeURIComponent(`utm_source=${from}&utm_medium=link&utm_campaign=mileclear-app`);
  return `https://play.google.com/store/apps/details?id=com.mileclear.app&referrer=${referrer}`;
}
