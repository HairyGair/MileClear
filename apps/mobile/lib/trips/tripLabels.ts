/**
 * The words the Trips list and the trip screen use to explain a trip
 * (docs/more-trips-oct2026 PROPOSALS 6.3, 6.5 and 6.6). Pure: no React,
 * no database, no Date.now() unless `now` is left out.
 *
 * Only what the app can already tell from the trip is said. The proposal's
 * other labels ("Started with Start Trip", "Part 1 of 2", "Joined from 2
 * trips") need facts the server does not keep yet (decision T-F), so a trip
 * never shows them here. A trip with nothing worth saying gets no tag.
 */

export interface LabelTrip {
  isManualEntry: boolean;
  classification: string;
  startedAt: string;
  endedAt: string | null;
  /** When the server saved it. Absent for a trip only on this phone. */
  createdAt?: string | null;
  autoClassifiedAt?: string | null;
}

export type TripTagKind = "upload_failed" | "waiting" | "auto_sorted" | "manual" | "saved_later";

export interface TripTag {
  kind: TripTagKind;
  text: string;
  /** Ionicons name. */
  icon: string;
}

/** A quiet server classification stays undoable for a week. */
export const AUTO_UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** How long after the drive ended a save has to land to count as "later". */
export const SAVED_LATER_MS = 30 * 60 * 1000;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Sorted by the server's own rules, and still undoable. */
export function isRecentAutoSort(t: LabelTrip, now: number = Date.now()): boolean {
  const at = ms(t.autoClassifiedAt);
  return t.classification !== "unclassified" && at != null && now - at < AUTO_UNDO_WINDOW_MS;
}

/**
 * The phone saved this recorded trip well after the drive ended (it was
 * asleep, or it finished the trip on the next wake). Read from the server's
 * save time, so a trip only on this phone never says it. `createdInBatch`
 * marks a trip saved in the same few seconds as another one on screen: a
 * split makes its legs together, so the late save time is the split's, not
 * the drive's, and nothing is said.
 */
export function isSavedLater(t: LabelTrip, createdInBatch = false): boolean {
  if (t.isManualEntry || createdInBatch) return false;
  const created = ms(t.createdAt);
  const ended = ms(t.endedAt) ?? ms(t.startedAt);
  if (created == null || ended == null) return false;
  return created - ended > SAVED_LATER_MS;
}

/**
 * The one tag under a trip row, most useful first:
 *   upload failed > waiting to upload > sorted for you > added by you > saved later.
 */
export function tripTag(
  t: LabelTrip,
  opts: { local?: boolean; uploadFailed?: boolean; createdInBatch?: boolean; now?: number } = {}
): TripTag | null {
  if (opts.uploadFailed) return { kind: "upload_failed", text: "Couldn't upload", icon: "alert-circle" };
  if (opts.local) return { kind: "waiting", text: "Waiting to upload", icon: "cloud-upload-outline" };
  if (isRecentAutoSort(t, opts.now)) return { kind: "auto_sorted", text: "Sorted for you", icon: "sparkles-outline" };
  if (t.isManualEntry) return { kind: "manual", text: "Added by you", icon: "create-outline" };
  // "Saved later" (isSavedLater) waits for the server to record how a trip was saved (T-F): joined trips would read wrongly.
  return null;
}

/**
 * Ids of trips the server saved within a few seconds of another trip in the
 * list. A split writes all its legs in one go; a drive the phone saved by
 * itself is saved alone.
 */
export function createdInBatchIds(trips: readonly { id: string; createdAt?: string | null }[], windowMs = 5000): Set<string> {
  const stamped = trips
    .map((t) => ({ id: t.id, at: ms(t.createdAt) }))
    .filter((t): t is { id: string; at: number } => t.at != null)
    .sort((a, b) => a.at - b.at);
  const out = new Set<string>();
  for (let i = 1; i < stamped.length; i++) {
    if (stamped[i].at - stamped[i - 1].at <= windowMs) {
      out.add(stamped[i].id);
      out.add(stamped[i - 1].id);
    }
  }
  return out;
}

/** True when the trip screen's copy of a trip says it is one leg of a split. */
export function isSplitLeg(gpsQuality: unknown): boolean {
  if (!gpsQuality || typeof gpsQuality !== "object" || Array.isArray(gpsQuality)) return false;
  const v = (gpsQuality as Record<string, unknown>).splitFromTripId;
  return typeof v === "string" && v.length > 0;
}

/** How the trip was made, for the line under the miles on the trip screen. */
export function tripMadeLine(
  t: LabelTrip,
  opts: { waitingToUpload: boolean; splitLeg?: boolean }
): { text: string; done: boolean } {
  if (opts.waitingToUpload) return { text: "Waiting to upload", done: false };
  if (t.isManualEntry) return { text: "Added by you · saved to your account", done: false };
  // The server notes the trip a leg was split from; it doesn't note which
  // part it is, so the line doesn't say "Part 1 of 2".
  if (opts.splitLeg) return { text: "Part of a longer drive you split", done: false };
  // "Saved later" (isSavedLater) waits for the server to record how a trip was saved (T-F).
  return { text: "Recorded by MileClear · saved to your account", done: true };
}

/**
 * The amber "The distance may be off" strip on the trip screen. Only for a
 * trip we're unsure of (low); medium says nothing. The reason comes from the
 * server's own reasons, in plain words.
 */
export function distanceWarning(
  level: "high" | "medium" | "low" | null | undefined,
  reasons: readonly string[] = []
): { title: string; body: string } | null {
  if (level !== "low") return null;
  const all = reasons.join(" ").toLowerCase();
  let body = "We couldn't check it against the roads.";
  if (all.includes("no end location")) body = "We don't know where this drive ended.";
  else if (all.includes("no gps samples")) body = "Your phone sent no route for this drive.";
  else if (all.includes("sparse trail") || /only \d+ gps samples/.test(all)) body = "Your phone sent only a few points for this drive.";
  else if (all.includes("average speed")) body = "The speed looks wrong for a drive.";
  return { title: "The distance may be off", body };
}

/** "Looks like Business: 3 earlier trips here were". */
export function suggestionLine(s: { classification: string; matchCount: number } | null | undefined): string | null {
  if (!s || (s.classification !== "business" && s.classification !== "personal")) return null;
  const label = s.classification === "business" ? "Business" : "Personal";
  const n = Math.max(0, Math.round(s.matchCount));
  if (n === 0) return `Looks like ${label}`;
  return `Looks like ${label}: ${n} earlier trip${n === 1 ? "" : "s"} here ${n === 1 ? "was" : "were"}`;
}

/** The day's miles beside a day header: "15.3 mi". */
export function dayMilesText(trips: readonly { distanceMiles: number }[]): string {
  const total = trips.reduce((s, t) => s + (Number.isFinite(t.distanceMiles) ? Math.max(0, t.distanceMiles) : 0), 0);
  return `${(Math.round(total * 10) / 10).toFixed(1)}\u00a0mi`;
}
