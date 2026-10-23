/**
 * Test doubles for the Project / client lookups in services/projectTotals.ts:
 * the byte-exact spellings query ($queryRaw ... GROUP BY), the byte-exact
 * trip ids query ($queryRaw ... SELECT id), and the one count that tells
 * whether the database's accent-blind `in` matches more trips than the exact
 * spellings hold.
 */
import { vi } from "vitest";

export interface SpellingRow {
  label: string;
  trips: number;
  lastAt?: Date;
}

export interface LabelMockOptions {
  /** Trips the database's accent-blind `in` matches on top of the exact ones. */
  accentTwins?: number;
  /** What the byte-exact ids query returns. */
  ids?: string[];
}

function sqlOf(strings: unknown): string {
  return Array.isArray(strings) ? strings.join("?") : String(strings);
}

/** A $queryRaw implementation answering the two label queries for one user. */
export function labelQueryRaw(userId: string, rows: SpellingRow[], opts: LabelMockOptions = {}) {
  return vi.fn(async (strings: unknown, ...values: unknown[]) => {
    const sql = sqlOf(strings);
    if (values[0] !== userId) return [];
    if (sql.includes("GROUP BY")) {
      return rows.map((r) => ({ raw: Buffer.from(r.label, "utf8"), n: BigInt(r.trips), lastAt: r.lastAt ?? new Date("2026-05-01T09:00:00Z") }));
    }
    if (sql.includes("SELECT id")) return (opts.ids ?? []).map((id) => ({ id }));
    return [];
  });
}

/**
 * True for the collision count resolveProjectLabel makes: userId and a
 * projectLabel `in`, without the list's isPhantomTrip.
 */
export function isLabelCollisionCount(args: { where?: Record<string, unknown> } | undefined): boolean {
  const w = args?.where ?? {};
  return w.isPhantomTrip === undefined && !!(w.projectLabel as { in?: unknown } | undefined)?.in;
}

/** The count the database would give for that collision check. */
export function labelCollisionCount(
  args: { where?: Record<string, unknown> } | undefined,
  rows: SpellingRow[],
  opts: LabelMockOptions = {}
): number {
  const spellings = ((args?.where?.projectLabel as { in: string[] }).in ?? []) as string[];
  const exact = rows.filter((r) => spellings.includes(r.label)).reduce((s, r) => s + r.trips, 0);
  return exact + (opts.accentTwins ?? 0);
}
