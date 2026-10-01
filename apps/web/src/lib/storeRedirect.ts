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
