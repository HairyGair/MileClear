// New-user signals (30 Aug 2026): which platform an account uses, where it
// signed up from, and the #founder "New user" alert.
//
// Platform comes from the X-MileClear-Platform header the app has always
// sent (ios/android), falling back to the User-Agent for the web app and for
// anything older. Location is an offline GeoIP lookup (geoip-lite, MaxMind
// GeoLite2 city data bundled in node_modules) on the request IP: nothing
// about the user leaves the server, and the result is city/region/country,
// never stored more precisely than that.
import type { FastifyRequest } from "fastify";
import geoip from "geoip-lite";
import { prisma } from "../lib/prisma.js";
import { postFounderAlert } from "./discord.js";

export type Platform = "ios" | "android" | "web" | "unknown";

export function detectPlatform(request: FastifyRequest): Platform {
  const header = String(request.headers["x-mileclear-platform"] ?? "").toLowerCase();
  if (header === "ios" || header === "android") return header;
  const ua = String(request.headers["user-agent"] ?? "");
  if (/mozilla/i.test(ua)) return "web";
  if (/android|okhttp/i.test(ua)) return "android";
  if (/cfnetwork|darwin|iphone|ipad/i.test(ua)) return "ios";
  return "unknown";
}

/** "Wakefield, England, GB" or null. Private / unroutable IPs return null. */
export function lookupLocation(ip: string | undefined): string | null {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, "");
  const hit = geoip.lookup(clean);
  if (!hit) return null;
  const parts = [hit.city, hit.region, hit.country].filter((x) => x && x.trim());
  return parts.length ? parts.join(", ").slice(0, 120) : null;
}

export function mergePlatforms(existing: string | null | undefined, platform: Platform): string {
  const set = new Set((existing ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  if (platform !== "unknown") set.add(platform);
  return [...set].sort().join(",");
}

/** Merge one more sighting into users.platformsSeen. Cheap; safe to call on
 *  every login and heartbeat. */
export async function recordPlatformSeen(userId: string, platform: Platform): Promise<void> {
  if (platform === "unknown") return;
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { platformsSeen: true } });
    const merged = mergePlatforms(u?.platformsSeen, platform);
    if (merged !== (u?.platformsSeen ?? "")) {
      await prisma.user.update({ where: { id: userId }, data: { platformsSeen: merged } });
    }
  } catch (err) {
    console.error("[signup] recordPlatformSeen failed:", err);
  }
}

/** "ios 18.5" / "android 14" (heartbeat osVersion) → platform. */
export function platformFromOsVersion(osVersion: string | null | undefined): Platform {
  const head = String(osVersion ?? "").split(" ")[0].toLowerCase();
  return head === "ios" || head === "android" ? head : "unknown";
}

const METHOD_LABEL: Record<string, string> = {
  email: "email + password",
  apple: "Sign in with Apple",
  google: "Google sign-in",
  apple_web: "Sign in with Apple (web)",
};
const PLATFORM_LABEL: Record<Platform, string> = {
  ios: "iPhone", android: "Android", web: "Web", unknown: "Unknown platform",
};

/** Called once per brand-new account from every registration path. Stores
 *  platform + coarse location and posts the #founder alert. Never throws. */
export async function onUserRegistered(
  user: { id: string; email: string | null; displayName: string | null; referredByCode?: string | null },
  request: FastifyRequest,
  method: string
): Promise<void> {
  try {
    const platform = detectPlatform(request);
    const location = lookupLocation(request.ip);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        signupPlatform: platform,
        signupLocation: location,
        platformsSeen: mergePlatforms(null, platform),
      },
    });
    const who = user.displayName ? `${user.displayName} (${user.email ?? "no email"})` : (user.email ?? "no email");
    const lines = [
      who,
      `${PLATFORM_LABEL[platform]} · ${METHOD_LABEL[method] ?? method}`,
      location ? `From ${location}` : "Location unknown",
      user.referredByCode ? `Referred with code ${user.referredByCode}` : null,
    ].filter(Boolean);
    await postFounderAlert({
      severity: "info",
      title: "New user",
      detail: lines.join("\n"),
      userId: user.id,
      link: `https://mileclear.com/dashboard/admin?user=${user.id}`,
    });
  } catch (err) {
    console.error("[signup] onUserRegistered failed:", err);
  }
}
