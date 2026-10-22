// One row per Directions guidance session, kept on the phone for three days
// (docs/navigation-1.4.0/PLAN-recording.md section 4): where the driver was
// going and every route they were given, with the times each was the one
// being followed. The trip recorder reads these afterwards (driveLog.ts) to
// see whether a GPS gap in a saved drive sat on the route.
//
// Pure: the shapes, the caps and how a session changes. store.ts writes it,
// driveLog.ts reads it. Nothing here is sent anywhere.

/** The server's DIRECTIONS_RECORDING, as GET /user/profile gave it when the
 *  session started. Unknown or missing reads as off. */
export type DirectionsRecordingMode = "off" | "log" | "on";

export function directionsModeOf(v: unknown): DirectionsRecordingMode {
  return v === "log" || v === "on" ? v : "off";
}

export interface DriveRoute {
  routeId: string;
  /** When this route became the one being followed. */
  fromMs: number;
  /** When a reroute replaced it or the session ended; null while current. */
  toMs: number | null;
  /** [lat, lng] in order, as the server sent it. */
  geometry: Array<[number, number]>;
}

export interface DriveDestination {
  lat: number;
  lng: number;
  label: string | null;
  /** The saved place's own name ("Home", "Depot"), when it was one. */
  name: string | null;
  savedLocationId: string | null;
  savedType: string | null;
}

/** arrived: guidance said "You have arrived". ended: the driver tapped End.
 *  left: the screen closed mid-guidance. */
export type DriveEndReason = "arrived" | "ended" | "left";

export interface DriveSession {
  sessionId: string;
  mode: DirectionsRecordingMode;
  /** "I'm a passenger" was tapped in the picker: never opens or fills. */
  passenger: boolean;
  startedAtMs: number;
  updatedAtMs: number;
  endedAtMs: number | null;
  endReason: DriveEndReason | null;
  destination: DriveDestination;
  routes: DriveRoute[];
  /** A cap was reached: no route is known after the last one's toMs. */
  truncated: boolean;
}

export const DRIVE_MAX_ROUTES = 20;
export const DRIVE_MAX_POINTS = 30_000;
/** Sessions older than this are deleted. */
export const DRIVE_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
/** A session that never ended (app killed) counts as followed until this
 *  long after its last update. */
export const DRIVE_OPEN_GRACE_MS = 30 * 60 * 1000;

const pointCount = (routes: DriveRoute[]) => routes.reduce((n, r) => n + r.geometry.length, 0);

export function newDriveSession(args: {
  sessionId: string;
  mode: DirectionsRecordingMode;
  passenger: boolean;
  atMs: number;
  destination: DriveDestination;
  route: { routeId: string; geometry: Array<[number, number]> };
}): DriveSession {
  const s: DriveSession = {
    sessionId: args.sessionId,
    mode: args.mode,
    passenger: args.passenger,
    startedAtMs: args.atMs,
    updatedAtMs: args.atMs,
    endedAtMs: null,
    endReason: null,
    destination: args.destination,
    routes: [],
    truncated: false,
  };
  return withRoute(s, args.route, args.atMs);
}

/** The current route ends at `atMs` and the new one starts. Past either cap
 *  the new route is not kept and the session is marked truncated, so nothing
 *  later can be judged against a route the driver was no longer on. */
export function withRoute(s: DriveSession, route: { routeId: string; geometry: Array<[number, number]> }, atMs: number): DriveSession {
  const closed = s.routes.map((r) => (r.toMs == null ? { ...r, toMs: atMs } : r));
  if (s.truncated) return { ...s, routes: closed, updatedAtMs: atMs };
  const fits = closed.length < DRIVE_MAX_ROUTES && pointCount(closed) + route.geometry.length <= DRIVE_MAX_POINTS;
  if (!fits) return { ...s, routes: closed, truncated: true, updatedAtMs: atMs };
  return {
    ...s,
    routes: [...closed, { routeId: route.routeId, fromMs: atMs, toMs: null, geometry: route.geometry }],
    updatedAtMs: atMs,
  };
}

/** The session is over: the current route ends with it. A second end keeps
 *  the first one's time and reason. */
export function withEnd(s: DriveSession, atMs: number, reason: DriveEndReason): DriveSession {
  if (s.endedAtMs != null) return s;
  return {
    ...s,
    endedAtMs: atMs,
    endReason: reason,
    updatedAtMs: atMs,
    routes: s.routes.map((r) => (r.toMs == null ? { ...r, toMs: atMs } : r)),
  };
}

/** Until when the session can be said to cover a moment. */
export function sessionCoverEndMs(s: Pick<DriveSession, "endedAtMs" | "updatedAtMs">): number {
  return s.endedAtMs ?? s.updatedAtMs + DRIVE_OPEN_GRACE_MS;
}

/** The route being followed at `atMs`, or null. An open route (never
 *  replaced, session never ended) runs to the session's cover end. */
export function routeActiveAt(s: DriveSession, atMs: number): DriveRoute | null {
  const end = sessionCoverEndMs(s);
  if (atMs < s.startedAtMs || atMs > end) return null;
  for (const r of s.routes) {
    if (r.fromMs <= atMs && atMs < (r.toMs ?? end + 1)) return r;
  }
  return null;
}

function isPair(p: unknown): p is [number, number] {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/** One stored route (navigation_drive_routes). */
export interface DriveRouteRow {
  seq: unknown;
  route_id: unknown;
  from_ms: unknown;
  to_ms: unknown;
  geometry: unknown;
}

/** A stored session, checked field by field. Anything malformed is null, so
 *  a bad row can never reach the recorder's rules. */
export function parseDriveSession(row: {
  session_id: unknown;
  started_at: unknown;
  updated_at: unknown;
  ended_at: unknown;
  end_reason: unknown;
  mode: unknown;
  passenger: unknown;
  destination: unknown;
  truncated?: unknown;
}, routeRows: ReadonlyArray<DriveRouteRow>): DriveSession | null {
  try {
    const startedAtMs = Number(row.started_at);
    const updatedAtMs = Number(row.updated_at);
    if (typeof row.session_id !== "string" || !Number.isFinite(startedAtMs) || !Number.isFinite(updatedAtMs)) return null;
    const endedAtMs = row.ended_at == null ? null : Number(row.ended_at);
    if (endedAtMs != null && !Number.isFinite(endedAtMs)) return null;
    const reason = row.end_reason;
    const endReason: DriveEndReason | null = reason === "arrived" || reason === "ended" || reason === "left" ? reason : null;
    const d = JSON.parse(String(row.destination)) as Record<string, unknown>;
    if (!d || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return null;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const routes: DriveRoute[] = [];
    for (const r of [...routeRows].sort((a, b) => Number(a.seq) - Number(b.seq)).slice(0, DRIVE_MAX_ROUTES)) {
      const fromMs = Number(r.from_ms);
      const toMs = r.to_ms == null ? null : Number(r.to_ms);
      if (!Number.isFinite(fromMs) || (toMs != null && !Number.isFinite(toMs))) return null;
      const geometry = JSON.parse(String(r.geometry)) as unknown;
      if (!Array.isArray(geometry) || !geometry.every(isPair)) return null;
      routes.push({ routeId: String(r.route_id ?? ""), fromMs, toMs, geometry: geometry as Array<[number, number]> });
    }
    return {
      sessionId: row.session_id,
      mode: directionsModeOf(row.mode),
      passenger: row.passenger === 1 || row.passenger === true || row.passenger === "1",
      startedAtMs,
      updatedAtMs,
      endedAtMs,
      endReason,
      destination: {
        lat: d.lat as number,
        lng: d.lng as number,
        label: str(d.label),
        name: str(d.name),
        savedLocationId: str(d.savedLocationId),
        savedType: str(d.savedType),
      },
      routes,
      truncated: row.truncated === 1 || row.truncated === true || row.truncated === "1",
    };
  } catch {
    return null;
  }
}
