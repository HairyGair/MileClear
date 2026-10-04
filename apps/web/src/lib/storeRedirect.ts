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

/** Networks whose visits to /app are machines, not people (4 Oct 2026):
 *  Meta checks every ad's link from its own servers the moment a boost goes
 *  live (14 "scans" in 3 minutes, all 173.252.x / 57.141.x), and Google and
 *  Bing crawl ?from= links. Their user agents look like ordinary phones, so
 *  the address is the only reliable tell. */
const CRAWLER_V4: [string, number][] = [
  // Meta (AS32934)
  ["31.13.0.0", 16], ["57.141.0.0", 16], ["66.220.144.0", 20], ["69.63.176.0", 20],
  ["69.171.224.0", 19], ["74.119.76.0", 22], ["102.132.96.0", 20], ["103.4.96.0", 22],
  ["129.134.0.0", 16], ["157.240.0.0", 16], ["163.70.128.0", 17], ["173.252.64.0", 18],
  ["179.60.192.0", 22], ["185.60.216.0", 22], ["185.89.216.0", 22], ["204.15.20.0", 22],
  // Google crawlers
  ["66.249.64.0", 19], ["192.178.0.0", 16],
  // Bing crawlers
  ["157.55.39.0", 24], ["207.46.13.0", 24], ["40.77.167.0", 24], ["13.66.139.0", 24], ["52.167.144.0", 24],
];
const CRAWLER_V6 = ["2a03:2880:", "2001:4860:4801:", "2001:4860:4802:"];

function v4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** The visitor's address: first entry of X-Forwarded-For (set by Apache). */
export function clientIp(forwardedFor: string | null): string {
  return (forwardedFor ?? "").split(",")[0].trim().replace(/^::ffff:/i, "");
}

export function isCrawlerIp(ip: string): boolean {
  if (!ip) return false;
  const lower = ip.toLowerCase();
  if (lower.includes(":")) return CRAWLER_V6.some((p) => lower.startsWith(p));
  const n = v4ToInt(lower);
  if (n === null) return false;
  return CRAWLER_V4.some(([base, bits]) => {
    const b = v4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}
