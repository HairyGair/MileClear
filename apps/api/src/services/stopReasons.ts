import crypto from "node:crypto";

// "Why did you stop?" (18 Oct 2026). The win-back email lists these as
// one-tap links. A tap opens a confirm page (GET, records nothing, so link
// scanners in mail clients can't cast a vote); the button posts the answer,
// stored as an app event "winback.reason". scripts/retention-email-effect.mjs
// counts them.

export type StopReasonGroup = "stopped" | "never";

export const STOP_REASONS: Record<StopReasonGroup, Array<{ code: string; label: string }>> = {
  stopped: [
    { code: "missed_drives", label: "It missed some of my drives" },
    { code: "battery_privacy", label: "Battery or privacy worries" },
    { code: "not_driving", label: "I'm not driving for work now" },
    { code: "too_much", label: "It was too much to keep sorting" },
    { code: "other_app", label: "I use something else now" },
    { code: "other", label: "Something else" },
  ],
  never: [
    { code: "never_recorded", label: "It never recorded a drive" },
    { code: "location_always", label: "I didn't want location on all the time" },
    { code: "not_driving", label: "I'm not driving much" },
    { code: "just_looking", label: "I was just having a look" },
    { code: "other_app", label: "I use something else" },
    { code: "other", label: "Something else" },
  ],
};

export function stopReasonLabel(group: StopReasonGroup, code: string): string | null {
  return STOP_REASONS[group].find((r) => r.code === code)?.label ?? null;
}

// Token: <base64url(group:userId)>.<base64url(hmac)>. Signed with its own
// label so it can't be swapped for an unsubscribe token or the other way round.
function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error("UNSUBSCRIBE_SECRET or JWT_SECRET must be set");
  return s;
}

function sig(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(`stop-reason:${payload}`).digest("base64url");
}

export function signStopReasonToken(group: StopReasonGroup, userId: string): string {
  const payload = `${group}:${userId}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig(payload)}`;
}

export function verifyStopReasonToken(token: unknown): { group: StopReasonGroup; userId: string } | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  let payload: string;
  try {
    payload = Buffer.from(p, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = Buffer.from(sig(payload), "utf8");
  const given = Buffer.from(s, "utf8");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const i = payload.indexOf(":");
  const group = payload.slice(0, i);
  const userId = payload.slice(i + 1);
  if ((group !== "stopped" && group !== "never") || !userId) return null;
  return { group, userId };
}
