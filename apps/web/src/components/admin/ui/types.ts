// Shared vocabulary for the admin UI kit.

/** Colour role. Status tones (good / warn / bad) mean exactly that and are
 *  never used to tell two series apart. */
export type Tone = "neutral" | "good" | "warn" | "bad" | "accent" | "info";

/** The date ranges the PageHeader range selector offers. */
export type RangeKey = "7d" | "30d" | "90d" | "all";

export const RANGE_DAYS: Record<RangeKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};
