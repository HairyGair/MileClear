// Directions events carry counts only (PLAN Dev6). Pure, so it is tested.

/** Only numbers, booleans and short codes go out. */
export type CountMeta = Record<string, number | boolean | string | null>;

const ALLOWED_STRING = /^[a-z0-9_]{1,40}$/i;

/** Drops anything that is not a count, a flag or a short code. */
export function countsOnly(meta: CountMeta | undefined): CountMeta {
  const out: CountMeta = {};
  if (!meta) return out;
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v * 10) / 10;
    else if (typeof v === "boolean" || v === null) out[k] = v;
    else if (typeof v === "string" && ALLOWED_STRING.test(v)) out[k] = v;
  }
  return out;
}

