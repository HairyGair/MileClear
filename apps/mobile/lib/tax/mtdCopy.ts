/** True when the stored HMRC token has run out. Missing or placeholder dates count as unknown, not expired. */
export function isConnectionExpired(expiresAt: string | undefined | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return false;
  return d.getTime() <= now.getTime();
}

/** One line on the quarterly updates header explaining the token. */
export function connectionLine(
  expiresAt: string | undefined | null,
  _formatted: string,
  now: Date = new Date(),
): string {
  if (isConnectionExpired(expiresAt, now)) {
    return "Your test connection has expired. Connect again to carry on.";
  }
  return "Your test connection renews by itself while you use it.";
}
