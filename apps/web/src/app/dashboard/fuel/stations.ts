import type { FuelStation } from "@mileclear/shared";

const SMALL = new Set(["and", "of", "the", "on", "at", "in"]);
const KEEP_UPPER = new Set(["bp", "uk", "m1", "a1", "a1m", "m62", "m6", "m25", "hgv", "tfl"]);

/** "ESSO DURHAM ROAD" -> "Esso Durham Road". Mixed-case names are left alone. */
export function titleCase(name: string): string {
  const s = name.trim().replace(/\s+/g, " ");
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (KEEP_UPPER.has(w) || /^[a-z]{1,2}\d{1,3}[a-z]?$/.test(w)) return w.toUpperCase();
      if (i > 0 && SMALL.has(w)) return w;
      return w.replace(/(^|[-'(/])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(" ");
}

/**
 * "Esso Durham Road", not "ESSO DURHAM ROAD (ESSO)": title-case, and drop the brand when the
 * station name already starts with it. Otherwise the brand leads, as in "Esso, Durham Road".
 */
export function stationLabel(s: Pick<FuelStation, "stationName" | "brand">): string {
  const name = tidyName(titleCase(s.stationName));
  const brand = s.brand ? titleCase(s.brand) : "";
  if (!brand) return name;
  const lower = name.toLowerCase();
  if (lower === brand.toLowerCase() || lower.startsWith(`${brand.toLowerCase()} `)) return name;
  if (lower.includes(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

/** The same forecourt can arrive twice (two feeds, or a repeated site). Keep the nearest of each. */
export function dedupeStations<T extends FuelStation>(list: T[]): T[] {
  const seen = new Map<string, T>();
  for (const st of list) {
    const key = st.siteId ? `id:${st.siteId}` : `n:${stationLabel(st).toLowerCase()}|${st.postcode.replace(/\s/g, "").toLowerCase()}`;
    const nameKey = `n:${stationLabel(st).toLowerCase()}|${st.postcode.replace(/\s/g, "").toLowerCase()}`;
    const hit = seen.get(key) ?? seen.get(nameKey);
    if (!hit) {
      seen.set(key, st);
      seen.set(nameKey, st);
    } else if (st.distanceMiles < hit.distanceMiles) {
      for (const [k, v] of seen) if (v === hit) seen.set(k, st);
    }
  }
  return [...new Set(seen.values())];
}

/**
 * Some feeds put the address in the name: "..., Pallion Road, Sunderland, SR4 6nd, Sunderland".
 * Capitalise postcodes and drop a repeated part.
 */
export function tidyName(name: string): string {
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const raw of parts) {
    const p = /^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/i.test(raw) ? raw.toUpperCase() : raw;
    if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  return out.join(", ");
}

/** Labels for a list, with the postcode added where two stations would read the same. */
export function stationLabels<T extends FuelStation>(list: T[]): Map<T, string> {
  const base = new Map(list.map((s) => [s, stationLabel(s)] as const));
  const counts = new Map<string, number>();
  for (const l of base.values()) counts.set(l.toLowerCase(), (counts.get(l.toLowerCase()) ?? 0) + 1);
  const out = new Map<T, string>();
  for (const [s, l] of base) {
    const pc = s.postcode?.trim().toUpperCase();
    out.set(s, (counts.get(l.toLowerCase()) ?? 0) > 1 && pc && !l.toUpperCase().includes(pc) ? `${l} (${pc})` : l);
  }
  return out;
}
