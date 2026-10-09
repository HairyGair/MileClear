// One quiet celebration when a mileage milestone or a personal record is
// newly passed. "Newly" means higher than what this phone last saw, kept in
// tracking_state, so it plays once per device and never replays on refresh.
// A first ever visit just records where the driver is: no replaying history.

import { useEffect, useState } from "react";
import { highestPassed, newlyPassed, type Milestone } from "../lib/insights/milestones";
import {
  getInsightsValue,
  setInsightsValue,
  MILESTONE_SEEN_KEY,
  RECORDS_SEEN_KEY,
} from "../lib/insights/store";

export interface Celebration {
  /** "Explorer: 500 miles" or "New record: best day". */
  title: string;
  /** Plain follow-on line. */
  detail: string;
}

export function useInsightsCelebration(
  lifetimeMiles: number | null,
  records: { bestDay: number; longestTrip: number } | null
): Celebration | null {
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  useEffect(() => {
    if (lifetimeMiles === null) return;
    let cancelled = false;
    (async () => {
      const seenRaw = await getInsightsValue(MILESTONE_SEEN_KEY);
      const seen = seenRaw === null ? null : Number(seenRaw);
      const passed: Milestone | null = newlyPassed(lifetimeMiles, seen !== null && isFinite(seen) ? seen : null);
      const top = highestPassed(lifetimeMiles);
      const topMiles = top ? top.miles : 0;
      if (seen === null || (isFinite(seen) && topMiles > seen)) {
        await setInsightsValue(MILESTONE_SEEN_KEY, String(topMiles));
      }
      if (passed && !cancelled) {
        setCelebration({
          title: `${passed.label}: ${passed.miles.toLocaleString("en-GB")} miles`,
          detail: `That's about ${passed.funFact}.`,
        });
        return;
      }

      if (!records) return;
      const prevRaw = await getInsightsValue(RECORDS_SEEN_KEY);
      const now = `${Math.round(records.bestDay * 10)}|${Math.round(records.longestTrip * 10)}`;
      if (prevRaw === null) {
        await setInsightsValue(RECORDS_SEEN_KEY, now);
        return;
      }
      if (prevRaw === now) return;
      const [pd, pl] = prevRaw.split("|").map(Number);
      await setInsightsValue(RECORDS_SEEN_KEY, now);
      const beatDay = Math.round(records.bestDay * 10) > (pd || 0);
      const beatTrip = Math.round(records.longestTrip * 10) > (pl || 0);
      if ((beatDay || beatTrip) && !cancelled) {
        setCelebration({
          title: beatDay ? "New record: your best day" : "New record: your longest trip",
          detail: "It is in your records below.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lifetimeMiles, records?.bestDay, records?.longestTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  return celebration;
}
