import crypto from "node:crypto";

// Tokens look like: <base64url(userId)>.<base64url(hmacSha256(userId, secret))>
// They never expire - users may click old unsubscribe links from any past email.
// Rotating UNSUBSCRIBE_SECRET (or JWT_SECRET, the fallback) invalidates all
// outstanding tokens, which is fine.

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET or JWT_SECRET must be set");
  }
  return secret;
}

export function signUnsubscribeToken(userId: string): string {
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(userId)
    .digest();
  const userPart = Buffer.from(userId, "utf8").toString("base64url");
  const sigPart = sig.toString("base64url");
  return `${userPart}.${sigPart}`;
}

export function verifyUnsubscribeToken(token: string): { userId: string } | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  let userId: string;
  try {
    userId = Buffer.from(parts[0], "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!userId) return null;

  const expected = signUnsubscribeToken(userId);
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return { userId };
}
