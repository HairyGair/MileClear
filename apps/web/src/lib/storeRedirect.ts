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
 *  digits and dashes only. With no usable ?from, a click from Facebook or
 *  Instagram is told apart from a billboard QR scan (4 Oct 2026: the boosted
 *  post and the billboard share the bare link): Meta's in-app browsers name
 *  themselves in the user agent, and Meta adds ?fbclid= to links it sends
 *  out, so those count as "instagram", "facebook" or "meta". Anything else
 *  with no ?from is the billboard QR. */
export function sourceFrom(raw: string | null, userAgent = "", fbclid: string | null = null): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (/^[a-z0-9-]{1,32}$/.test(v)) return v;
  if (/Instagram/i.test(userAgent)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(userAgent)) return "facebook";
  if (fbclid) return "meta";
  return "billboard";
}

/** Google Play link carrying the channel as an install referrer, so the Play
 *  Console can attribute installs to it (Acquisition > by UTM). */
export function playUrlFor(from: string): string {
  const referrer = encodeURIComponent(`utm_source=${from}&utm_medium=link&utm_campaign=mileclear-app`);
  return `https://play.google.com/store/apps/details?id=com.mileclear.app&referrer=${referrer}`;
}
