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

import { createVerify } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import {
  parseStreetManagerMessage,
  streetWorksToRoadEvent,
  type RoadEvent,
  type StreetWorksRecord,
} from "./roadEvents.js";
import type { LatLng } from "./roadCorridor.js";

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
  const algo = m.SignatureVersion === "2" ? "RSA-SHA256" : m.SignatureVersion === "1" ? "RSA-SHA1" : null;
  if (!algo) return false;
  try {
    const v = createVerify(algo);
    v.update(toSign, "utf8");
    return v.verify(certOrKeyPem, m.Signature, "base64");
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
    if (change.kind === "delete") {
      await prisma.streetWorksEvent.deleteMany({
        where: { reference: change.reference, lastEventAt: { lte: change.eventAt } },
      });
      return { status: 200, outcome: "deleted" };
    }
    await upsertWorks(change.record);
    return { status: 200, outcome: "stored" };
  } catch (err) {
    console.error("[streetManager] store failed:", (err as Error).message);
    return { status: 500, outcome: "store_failed" }; // SNS retries
  }
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

async function upsertWorks(r: StreetWorksRecord): Promise<void> {
  const existing = await prisma.streetWorksEvent.findUnique({
    where: { reference: r.reference },
    select: { lastEventAt: true },
  });
  if (existing && existing.lastEventAt > r.eventAt) return; // a late, older message
  const bb = bboxOf(r.lines, r.points);
  const data = {
    objectType: r.objectType,
    trafficManagement: r.trafficManagement,
    isTrafficSensitive: r.isTrafficSensitive,
    workStatus: r.workStatus?.slice(0, 40) ?? null,
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
  await prisma.streetWorksEvent.upsert({
    where: { reference: r.reference },
    create: { reference: r.reference, ...data },
    update: data,
  });
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
    const rows = await prisma.streetWorksEvent.findMany({
      where: {
        minLat: { lte: bbox.maxLat },
        maxLat: { gte: bbox.minLat },
        minLng: { lte: bbox.maxLng },
        maxLng: { gte: bbox.minLng },
        OR: [{ endAt: null }, { endAt: { gte: now } }],
        AND: [{ OR: [{ startAt: null }, { startAt: { lte: new Date(now.getTime() + horizonDays * 86400000) } }] }],
      },
      take: 3000,
    });
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

/** Works that ended more than two days ago. */
export async function purgeEndedStreetWorks(now: Date = new Date()): Promise<number> {
  if (!isStreetManagerEnabled()) return 0;
  try {
    const res = await prisma.streetWorksEvent.deleteMany({
      where: { endAt: { lt: new Date(now.getTime() - 2 * 86400000) } },
    });
    return res.count;
  } catch {
    return 0;
  }
}
