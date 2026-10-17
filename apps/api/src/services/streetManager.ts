// DfT Street Manager open data receiver for the road alerts trial
// (2 Oct 2026). Free (Open Government Licence v3.0); England only.
//
// Street Manager does not offer a pull API for third parties: it pushes every
// permit and activity event in England to a registered HTTPS endpoint over
// AWS SNS. We keep only works that hold traffic up (services/roadEvents.ts
// STREET_WORKS_KEEP) in street_works_events.
//
// Safety:
//   - Off unless STREET_MANAGER_SNS_ENABLED=1 (the route answers 404).
//   - Every message's SNS signature is checked against the AWS signing
//     certificate before anything is read, and the TopicArn must be one of
//     Street Manager's published production topics.
//   - A SubscriptionConfirmation is confirmed automatically (DfT recommends
//     it) only after both checks, and only if the SubscribeURL is an AWS SNS
//     host.

import {
  constants as cryptoConstants,
  createHash,
  createPublicKey,
  createVerify,
  publicDecrypt,
  timingSafeEqual,
} from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import {
  parseStreetManagerMessage,
  streetWorksToRoadEvent,
  type RoadEvent,
  type StreetWorksRecord,
} from "./roadEvents.js";
import type { LatLng } from "./roadCorridor.js";
import {
  REOPENED_PENDING_KEEP_DAYS,
  ROAD_REOPENED_PENDING_EVENT,
  detectReopened,
  findingFromMetadata,
  findingToMetadata,
  sameClosure,
  mightReopen,
  type AppliedChange,
  type ReopenedFinding,
  type StoredWorks,
} from "./roadReopenedRule.js";

/** From the Street Manager open data docs. */
export const STREET_MANAGER_TOPIC_ARNS = [
  "arn:aws:sns:eu-west-2:287813576808:prod-permit-topic",
  "arn:aws:sns:eu-west-2:287813576808:prod-activity-topic",
];

export function isStreetManagerEnabled(): boolean {
  return process.env.STREET_MANAGER_SNS_ENABLED === "1";
}

export interface SnsMessage {
  Type?: string;
  MessageId?: string;
  Token?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  SubscribeURL?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
}

/** The canonical string AWS signs, per message type. */
export function snsStringToSign(m: SnsMessage): string | null {
  const keys =
    m.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : m.Type === "SubscriptionConfirmation" || m.Type === "UnsubscribeConfirmation"
        ? ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
        : null;
  if (!keys) return null;
  let out = "";
  for (const k of keys) {
    const v = (m as Record<string, unknown>)[k];
    if (v == null) {
      if (k === "Subject") continue; // optional on notifications
      return null;
    }
    out += `${k}\n${String(v)}\n`;
  }
  return out;
}

/** Only AWS SNS hosts, over HTTPS. */
export function isAwsSnsUrl(raw: string | undefined, requirePem: boolean): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (!/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname)) return false;
    if (requirePem && !u.pathname.endsWith(".pem")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Verify with the signing certificate (or a public key, in tests). */
export function verifySnsSignature(m: SnsMessage, certOrKeyPem: string): boolean {
  const toSign = snsStringToSign(m);
  if (!toSign || !m.Signature) return false;
  if (m.SignatureVersion === "1") return verifyRsaSha1(toSign, m.Signature, certOrKeyPem);
  if (m.SignatureVersion !== "2") return false;
  try {
    const v = createVerify("RSA-SHA256");
    v.update(toSign, "utf8");
    return v.verify(certOrKeyPem, m.Signature, "base64");
  } catch {
    return false;
  }
}

/** DER prefix of a PKCS#1 v1.5 DigestInfo for SHA-1. */
const SHA1_DIGEST_INFO_PREFIX = Buffer.from("3021300906052b0e03021a05000414", "hex");

/**
 * SNS signs with SHA-1 (SignatureVersion 1) unless the topic owner opts into
 * SHA-256, and DfT's topics use 1. The production server's system crypto
 * policy refuses SHA-1 signatures ("invalid digest" from createVerify), which
 * rejected DfT's first two confirmations on 2 Oct 2026. So verify by hand:
 * recover the signed DigestInfo with the certificate's public key and compare
 * it with our own SHA-1 of the canonical string. Same maths, no policy gate.
 */
function verifyRsaSha1(toSign: string, signatureB64: string, certOrKeyPem: string): boolean {
  try {
    const key = createPublicKey(certOrKeyPem);
    const recovered = publicDecrypt(
      { key, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(signatureB64, "base64")
    );
    const expected = Buffer.concat([
      SHA1_DIGEST_INFO_PREFIX,
      createHash("sha1").update(toSign, "utf8").digest(),
    ]);
    return recovered.length === expected.length && timingSafeEqual(recovered, expected);
  } catch {
    return false;
  }
}

const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string | null> {
  const hit = certCache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const pem = await res.text();
    if (!pem.includes("BEGIN CERTIFICATE")) return null;
    certCache.set(url, pem);
    return pem;
  } catch {
    return null;
  }
}

export interface SnsResult {
  status: number;
  outcome: string;
}

/** Handle one POST body from SNS. Never throws. */
export async function handleSnsBody(raw: string): Promise<SnsResult> {
  if (!isStreetManagerEnabled()) return { status: 404, outcome: "disabled" };
  let m: SnsMessage;
  try {
    m = JSON.parse(raw) as SnsMessage;
  } catch {
    return { status: 400, outcome: "bad_json" };
  }
  if (!m.TopicArn || !STREET_MANAGER_TOPIC_ARNS.includes(m.TopicArn)) return { status: 403, outcome: "unknown_topic" };
  if (!isAwsSnsUrl(m.SigningCertURL, true)) return { status: 403, outcome: "bad_cert_url" };
  const pem = await fetchCert(m.SigningCertURL!);
  if (!pem) return { status: 503, outcome: "cert_unavailable" }; // SNS retries
  if (!verifySnsSignature(m, pem)) return { status: 403, outcome: "bad_signature" };

  if (m.Type === "SubscriptionConfirmation") {
    if (!isAwsSnsUrl(m.SubscribeURL, false)) return { status: 403, outcome: "bad_subscribe_url" };
    try {
      const res = await fetch(m.SubscribeURL!);
      logEvent("road_alerts.street_manager_subscribed", null, { topic: m.TopicArn, status: res.status });
      return { status: 200, outcome: res.ok ? "subscribed" : `subscribe_${res.status}` };
    } catch {
      return { status: 503, outcome: "subscribe_failed" };
    }
  }
  if (m.Type === "UnsubscribeConfirmation") {
    logEvent("road_alerts.street_manager_unsubscribed", null, { topic: m.TopicArn });
    return { status: 200, outcome: "unsubscribed" };
  }
  if (m.Type !== "Notification") return { status: 200, outcome: "ignored_type" };

  const change = parseStreetManagerMessage(m.Message);
  try {
    if (change.kind === "ignore") return { status: 200, outcome: `ignored_${change.reason}` };
    return { status: 200, outcome: await applyStreetWorksChange(change) };
  } catch (err) {
    console.error("[streetManager] store failed:", (err as Error).message);
    return { status: 500, outcome: "store_failed" }; // SNS retries
  }
}

/** Apply one parsed upsert or delete to the store. Throws on a database
 *  error (the caller answers 500 so SNS retries). */
export async function applyStreetWorksChange(change: AppliedChange): Promise<"deleted" | "stored"> {
  // A message that could finish a closure: read the row as it was first,
  // so "Road reopened" can tell an early finish (services/roadReopenedRule.ts).
  const before = mightReopen(change) ? await readBefore(change.kind === "delete" ? change.reference : change.record.reference) : null;
  if (change.kind === "delete") {
    const res = await prisma.streetWorksEvent.deleteMany({
      where: { reference: change.reference, lastEventAt: { lte: change.eventAt } },
    });
    if (res.count > 0) noteReopened(before, change);
    return "deleted";
  }
  const outcome = await upsertWorks(change.record);
  if (outcome !== "older") noteReopened(before, change);
  return "stored";
}

/** The stored row before a message is applied, for "Road reopened". A failed
 *  read never fails the message. */
async function readBefore(reference: string): Promise<StoredWorks | null> {
  try {
    return await prisma.streetWorksEvent.findUnique({
      where: { reference },
      select: {
        trafficManagement: true,
        workStatus: true,
        startAt: true,
        endAt: true,
        streetName: true,
        town: true,
        promoter: true,
        workCategory: true,
        geometry: true,
      },
    });
  } catch {
    return null;
  }
}

/** A closure that just finished early becomes a pending row; the matching
 *  and sending happen later, on the road alerts tick (jobs/roadReopened.ts),
 *  so the SNS request returns at once. Fire-and-forget. */
function noteReopened(before: StoredWorks | null, change: AppliedChange): void {
  let finding: ReopenedFinding | null;
  try {
    finding = detectReopened(before, change);
  } catch {
    return;
  }
  if (!finding) return;
  void recordReopened(finding).catch((err) =>
    console.error("[streetManager] reopened note failed:", (err as Error).message)
  );
}

/** One pending row per closure: a redelivery, another permit for the same
 *  job, or the activity for the same closure adds nothing. */
export async function recordReopened(f: ReopenedFinding): Promise<void> {
  const or: Prisma.AppEventWhereInput[] = [{ metadata: { path: "$.reference", equals: f.reference } }];
  if (f.workReference) or.push({ metadata: { path: "$.workReference", equals: f.workReference } });
  if (f.streetName) or.push({ metadata: { path: "$.streetName", equals: f.streetName } });
  const rows = await prisma.appEvent.findMany({
    where: {
      type: ROAD_REOPENED_PENDING_EVENT,
      createdAt: { gte: new Date(Date.now() - REOPENED_PENDING_KEEP_DAYS * 86400000) },
      OR: or,
    },
    select: { metadata: true },
    take: 50,
  });
  const seen = rows.some((r) => {
    const other = findingFromMetadata(r.metadata);
    return other != null && sameClosure(other, f);
  });
  if (seen) return;
  logEvent(ROAD_REOPENED_PENDING_EVENT, null, findingToMetadata(f));
}

function bboxOf(lines: LatLng[][], points: LatLng[]) {
  const all = [...points, ...lines.flat()];
  return {
    minLat: Math.min(...all.map((p) => p[0])),
    maxLat: Math.max(...all.map((p) => p[0])),
    minLng: Math.min(...all.map((p) => p[1])),
    maxLng: Math.max(...all.map((p) => p[1])),
  };
}

const round6 = (p: LatLng): LatLng => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];

function isUniqueClash(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Store one works record, newest event wins.
 *
 * This used to be findUnique, then prisma.upsert. On MySQL Prisma's upsert is
 * a read followed by an INSERT or UPDATE, not one atomic statement, and SNS
 * often delivers two messages for one reference at once (a permit and its
 * activity, or a redelivery). Both saw no row, both inserted, and the second
 * failed with P2002 on street_works_events_reference_key (many a night). The
 * separate findUnique was also a check-then-act race: an older message could
 * pass the check and then overwrite a newer one written in between.
 *
 * Now each write is a single statement that carries the guard itself:
 *   1. UPDATE ... WHERE reference = ? AND lastEventAt <= eventAt. One row
 *      changed: done. MySQL locks the row, so the guard and the write are
 *      atomic and an older event can never overwrite a newer one.
 *   2. Nothing changed: either there is no row yet, or the stored one is
 *      newer. Try to INSERT.
 *   3. The INSERT clashes on the reference (P2002): another message created
 *      the row in between. Run the guarded UPDATE again, so this event still
 *      lands if it is the newer one and is dropped if it is older.
 */
export async function upsertWorks(r: StreetWorksRecord): Promise<"updated" | "created" | "older"> {
  const data = worksData(r);
  const guardedUpdate = () =>
    prisma.streetWorksEvent.updateMany({
      where: { reference: r.reference, lastEventAt: { lte: r.eventAt } },
      data,
    });
  if ((await guardedUpdate()).count > 0) return "updated";
  try {
    await prisma.streetWorksEvent.create({ data: { reference: r.reference, ...data } });
    return "created";
  } catch (err) {
    if (!isUniqueClash(err)) throw err;
  }
  return (await guardedUpdate()).count > 0 ? "updated" : "older";
}

function worksData(r: StreetWorksRecord) {
  const bb = bboxOf(r.lines, r.points);
  return {
    objectType: r.objectType,
    trafficManagement: r.trafficManagement,
    isTrafficSensitive: r.isTrafficSensitive,
    workStatus: r.workStatus?.slice(0, 40) ?? null,
    // Only when the message carries one: activities and some permit events
    // leave it out, and must never clear a stored category.
    ...(r.workCategory ? { workCategory: r.workCategory.slice(0, 32) } : {}),
    streetName: r.streetName?.slice(0, 200) ?? null,
    town: r.town?.slice(0, 100) ?? null,
    areaName: r.areaName?.slice(0, 200) ?? null,
    highwayAuthority: r.highwayAuthority?.slice(0, 200) ?? null,
    promoter: r.promoter?.slice(0, 200) ?? null,
    startAt: r.startAt,
    endAt: r.endAt,
    ...bb,
    geometry: { lines: r.lines.map((l) => l.map(round6)), points: r.points.map(round6) },
    lastEventAt: r.eventAt,
  };
}

/** The street_works_events columns the road alert rules read. Selected
 *  explicitly, so a column the database lacks can never blank the alerts. */
const WORKS_COLUMNS = {
  reference: true,
  trafficManagement: true,
  isTrafficSensitive: true,
  workStatus: true,
  streetName: true,
  town: true,
  promoter: true,
  startAt: true,
  endAt: true,
  geometry: true,
} as const;

export interface WorksRow {
  reference: string;
  trafficManagement: string;
  isTrafficSensitive: boolean;
  workStatus: string | null;
  workCategory: string | null;
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  startAt: Date | null;
  endAt: Date | null;
  geometry: unknown;
}

let categoryColumnMissing = false;

/** Stored works rows with the columns above plus workCategory. If the
 *  workCategory column is not there yet (the API restarted before its
 *  migration ran), the rows come back without it rather than not at all. */
export async function findWorksRows(where: Prisma.StreetWorksEventWhereInput, take: number): Promise<WorksRow[]> {
  if (!categoryColumnMissing) {
    try {
      return await prisma.streetWorksEvent.findMany({ where, select: { ...WORKS_COLUMNS, workCategory: true }, take });
    } catch (err) {
      if (!/workCategory/i.test((err as Error).message)) throw err;
      categoryColumnMissing = true;
      console.error("[streetManager] workCategory column missing; run the migration. Loading without it.");
    }
  }
  const rows = await prisma.streetWorksEvent.findMany({ where, select: WORKS_COLUMNS, take });
  return rows.map((r) => ({ ...r, workCategory: null }));
}

/** Stored works overlapping a bbox that have not ended and start within the
 *  horizon, as RoadEvents. Empty when the feature is off or the table is not
 *  migrated yet. */
export async function loadStreetWorks(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  now: Date,
  horizonDays: number
): Promise<RoadEvent[]> {
  if (!isStreetManagerEnabled()) return [];
  try {
    const rows = await findWorksRows(
      {
        minLat: { lte: bbox.maxLat },
        maxLat: { gte: bbox.minLat },
        minLng: { lte: bbox.maxLng },
        maxLng: { gte: bbox.minLng },
        OR: [{ endAt: null }, { endAt: { gte: now } }],
        AND: [{ OR: [{ startAt: null }, { startAt: { lte: new Date(now.getTime() + horizonDays * 86400000) } }] }],
      },
      3000
    );
    // Non-closure works are listed only on traffic-sensitive streets.
    const worth = rows.filter((r) => r.trafficManagement === "road_closure" || r.isTrafficSensitive);
    return worth.map((r) => {
      const g = (r.geometry ?? {}) as { lines?: LatLng[][]; points?: LatLng[] };
      return streetWorksToRoadEvent(
        {
          reference: r.reference,
          trafficManagement: r.trafficManagement,
          isTrafficSensitive: r.isTrafficSensitive,
          streetName: r.streetName,
          town: r.town,
          promoter: r.promoter,
          startAt: r.startAt,
          endAt: r.endAt,
          workCategory: r.workCategory,
          lines: Array.isArray(g.lines) ? g.lines : [],
          points: Array.isArray(g.points) ? g.points : [],
        },
        now
      );
    });
  } catch (err) {
    console.error("[streetManager] load failed:", (err as Error).message);
    return [];
  }
}

/** Ended works are kept this long so a trip's detail can still name the
 *  roadworks it drove through (GET /trips/:id/roadworks). */
export const STREET_WORKS_KEEP_ENDED_DAYS = 14;

/** Works that ended more than STREET_WORKS_KEEP_ENDED_DAYS ago, and "Road
 *  reopened" pending rows older than three days (they are written whatever
 *  ROAD_REOPENED_PUSH says, so this runs whatever it says too). */
export async function purgeEndedStreetWorks(now: Date = new Date()): Promise<number> {
  if (!isStreetManagerEnabled()) return 0;
  try {
    await prisma.appEvent.deleteMany({
      where: {
        type: ROAD_REOPENED_PENDING_EVENT,
        createdAt: { lt: new Date(now.getTime() - REOPENED_PENDING_KEEP_DAYS * 86400000) },
      },
    });
  } catch (err) {
    console.error("[streetManager] pending purge failed:", (err as Error).message);
  }
  try {
    const res = await prisma.streetWorksEvent.deleteMany({
      where: { endAt: { lt: new Date(now.getTime() - STREET_WORKS_KEEP_ENDED_DAYS * 86400000) } },
    });
    return res.count;
  } catch {
    return 0;
  }
}
