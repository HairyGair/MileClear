// Audit trail for admins READING a driver's data.
//
// GDPR audit H7 (14 Aug 2026): admin writes were logged (admin.* events with
// metadata.targetUserId) but reads were not, so nothing recorded who had
// looked at a driver's GPS routes, diagnostics, event history, support
// messages or the all-users export. An onResponse hook on the admin routes
// runs every successful GET through describeAdminRead and logs the ones that
// touch a specific person's data as `admin.read_user_data`, with the admin
// as the event's userId (the existing admin.* convention) and the driver in
// metadata.targetUserId.
//
// Opening one driver in the admin fires five or six reads at once, so the
// same admin + driver + screen is logged at most once per THROTTLE_MS.

export const ADMIN_READ_EVENT = "admin.read_user_data";
export const ADMIN_READ_THROTTLE_MS = 10 * 60 * 1000;

/** Route templates that expose personal data without a userId in the URL. */
const SENSITIVE_ROUTES = new Set([
  "/admin/users/export", // every user's email and account details, as CSV
  "/admin/support-inbox/thread", // a driver's messages + phone details (?key=)
  "/admin/support-inbox/attachments/:id", // a driver's screenshot
  "/admin/milesheet/teams/:orgId", // a team's members and their mileage
]);

export interface AdminReadDescription {
  targetUserId: string | null;
  what: string;
  ref: string | null;
}

/**
 * Pure: does this admin request read a person's data, and whose? Returns
 * null for writes, failures and aggregate screens (analytics, health).
 */
export function describeAdminRead(req: {
  method: string;
  routeUrl: string | undefined;
  statusCode: number;
  params: unknown;
  query: unknown;
}): AdminReadDescription | null {
  if (req.method !== "GET" || req.statusCode >= 400 || !req.routeUrl) return null;
  const params = (req.params ?? {}) as Record<string, unknown>;
  const query = (req.query ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 100) : null);

  const targetUserId = str(params.userId) ?? str(query.userId);
  if (!targetUserId && !SENSITIVE_ROUTES.has(req.routeUrl)) return null;

  const ref = str(params.id) ?? str(params.orgId) ?? str(query.key) ?? null;
  return { targetUserId, what: req.routeUrl, ref };
}

/** Throttle per admin + driver + screen. Returns true when it should be logged. */
export function createAdminReadThrottle(windowMs = ADMIN_READ_THROTTLE_MS) {
  const last = new Map<string, number>();
  return (adminId: string, d: AdminReadDescription, now = Date.now()): boolean => {
    const key = `${adminId}|${d.targetUserId ?? ""}|${d.what}|${d.ref ?? ""}`;
    const prev = last.get(key);
    if (prev != null && now - prev < windowMs) return false;
    last.set(key, now);
    if (last.size > 5000) {
      for (const [k, t] of last) if (now - t >= windowMs) last.delete(k);
    }
    return true;
  };
}
