import type { SupportDeviceContext } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { isProUser } from "./proEntitlement.js";

// Phone details attached to an in-app problem report (6 Oct 2026), so the
// admin can answer "your phone is on an old update" without digging through
// the dump. Built from the latest diagnostic dump (the app uploads a fresh one
// just before it sends the report) and the last few trips.

type Json = Record<string, unknown>;

export interface DumpLike {
  capturedAt: Date;
  platform: string;
  osVersion: string;
  appVersion: string;
  buildNumber: string;
  verdict: string;
  statusJson: unknown;
}

export interface TripLike {
  startedAt: Date;
  distanceMiles: number;
  isManualEntry: boolean;
  shiftId: string | null;
  coordinateCount: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

/** Pure: dump + Pro flag + recent trips -> the context stored on the message. */
export function shapeDeviceContext(
  dump: DumpLike | null,
  isPro: boolean | null,
  trips: TripLike[]
): SupportDeviceContext {
  const ctx: SupportDeviceContext = { isPro };
  if (dump) {
    const st = obj(dump.statusJson);
    const updates = obj(st.updates);
    const device = obj(st.device);
    const asid = str(st.activeShiftId);
    Object.assign(ctx, {
      capturedAt: dump.capturedAt.toISOString(),
      platform: str(dump.platform),
      osVersion: str(dump.osVersion),
      appVersion: str(dump.appVersion),
      buildNumber: str(dump.buildNumber),
      verdict: str(dump.verdict),
      updateCreatedAt: str(updates.createdAt),
      runtimeVersion: str(updates.runtimeVersion),
      backgroundPermission: str(st.backgroundPermission),
      motionPermission: str(st.motionPermission),
      autoDetectEnabled: bool(st.enabled),
      lowPowerMode: bool(device.lowPowerMode),
      modelName: str(device.modelName),
      screenWidth: typeof device.screenWidth === "number" ? device.screenWidth : null,
      screenHeight: typeof device.screenHeight === "number" ? device.screenHeight : null,
      fontScale: typeof device.fontScale === "number" ? device.fontScale : null,
      activeShiftId: asid && asid !== "null" ? asid : null,
    });
  }
  ctx.recentTrips = trips.slice(0, 5).map((t) => ({
    startedAt: t.startedAt.toISOString(),
    distanceMiles: Math.round(t.distanceMiles * 100) / 100,
    source: t.isManualEntry ? "manual" : t.shiftId ? "shift" : "auto",
    points: t.coordinateCount ?? 0,
  }));
  return ctx;
}

/** Never throws: anything that can't be read is left out. */
export async function buildDeviceContext(userId: string): Promise<SupportDeviceContext> {
  const [dump, isPro, trips] = await Promise.all([
    prisma.diagnosticDump
      .findUnique({
        where: { userId },
        select: {
          capturedAt: true,
          platform: true,
          osVersion: true,
          appVersion: true,
          buildNumber: true,
          verdict: true,
          statusJson: true,
        },
      })
      .catch(() => null),
    isProUser(userId).catch(() => null),
    prisma.trip
      .findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: { startedAt: true, distanceMiles: true, isManualEntry: true, shiftId: true, coordinateCount: true },
      })
      .catch(() => [] as TripLike[]),
  ]);
  return shapeDeviceContext(dump, isPro, trips);
}
