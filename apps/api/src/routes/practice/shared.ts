// Bits the practice, driver, public and admin routes share.

import crypto from "crypto";
import type { FastifyRequest } from "fastify";
import { practiceInitials } from "@mileclear/shared";

export const WEB_BASE_URL = process.env.WEB_BASE_URL || "https://mileclear.com";

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rate limits keyed on the caller's token, not the IP: an accountancy
 * office shares one connection, and the rate-limit hook runs before
 * authMiddleware so request.userId is not set yet. Unauthenticated calls
 * fall back to the IP.
 */
export function rateLimitByCaller(prefix: string, max: number, timeWindow: string) {
  return {
    rateLimit: {
      max,
      timeWindow,
      keyGenerator: (request: FastifyRequest) => {
        const auth = request.headers.authorization;
        return auth
          ? `${prefix}:${crypto.createHash("sha256").update(auth).digest("hex")}`
          : `${prefix}-ip:${request.ip}`;
      },
    },
  };
}

/** Practice reads: sized for an accountant tabbing through clients. */
export const PRACTICE_READ_LIMIT = rateLimitByCaller("practice-read", 300, "1 minute");

export interface PracticeIdentity {
  id: string;
  name: string;
  contactName: string;
  professionalBody: string | null;
  status: string;
  suspendedAt: Date | null;
  logo?: { updatedAt: Date; checkedAt: Date | null } | null;
}

/** A logo drivers may see: practice checked, logo checked since its last change. */
export function logoIsChecked(p: PracticeIdentity): boolean {
  const logo = p.logo;
  return (
    p.status === "checked" &&
    !p.suspendedAt &&
    !!logo &&
    !!logo.checkedAt &&
    logo.checkedAt.getTime() >= logo.updatedAt.getTime()
  );
}

/** How a practice is shown to a driver (consent sheet, Your accountant). */
export function practiceForDriver(p: PracticeIdentity) {
  return {
    id: p.id,
    name: p.name,
    contactName: p.contactName,
    professionalBody: p.professionalBody && p.professionalBody !== "none" ? p.professionalBody : null,
    // No badge for a checked practice; drivers only see "Not checked yet".
    checked: p.status === "checked",
    paused: !!p.suspendedAt,
    initials: practiceInitials(p.name),
    // Relative to the API base. Only for a checked practice with a checked
    // logo, so a fake logo of a well-known firm never reaches a driver.
    logoPath: logoIsChecked(p)
      ? `/practice-public/logo/${p.id}?v=${p.logo!.updatedAt.getTime()}`
      : null,
  };
}

export const practiceIdentitySelect = {
  id: true,
  name: true,
  contactName: true,
  professionalBody: true,
  status: true,
  suspendedAt: true,
  logo: { select: { updatedAt: true, checkedAt: true } },
} as const;

/** PNG, JPEG or WebP from the first bytes, or null. */
export function sniffLogoMime(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length > 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const LOGO_MAX_BYTES = 512 * 1024;

/** Invite landing page for an emailed practice invite. */
export function clientInviteUrl(token: string): string {
  return `${WEB_BASE_URL}/practice-invite/${token}`;
}

export function staffInviteUrl(token: string): string {
  return `${WEB_BASE_URL}/practice/staff-invite/${token}`;
}

export function joinUrl(code: string): string {
  return `${WEB_BASE_URL}/join/${code}`;
}
