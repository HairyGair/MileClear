"use client";

import Link from "next/link";
import { Icon } from "../kit";
import "./trips.css";

/**
 * The two-row strip above the list. Always two rows, so the page does not
 * jump when the counts change. Row 1 says what is waiting (or "All sorted"),
 * row 2 opens the missing-trip report.
 */
export function TripsReviewStrip({
  unclassified,
  journeys,
  ready,
  onReport,
}: {
  unclassified: number;
  journeys: number;
  ready: boolean;
  onReport: () => void;
}) {
  const parts: string[] = [];
  if (unclassified > 0) parts.push(`${unclassified} ${unclassified === 1 ? "trip" : "trips"} to classify`);
  if (journeys > 0) parts.push(`${journeys} ${journeys === 1 ? "journey" : "journeys"} to check`);
  const waiting = parts.length > 0;

  return (
    <div className="mc-card mc-card--flush mc-review" data-testid="review-strip">
      {waiting ? (
        <Link href="/dashboard/trips?view=inbox" className="mc-review__row">
          <span>{parts.join(" · ")}</span>
          <span className="mc-review__go">
            Review <Icon name="chevron-forward" size={14} />
          </span>
        </Link>
      ) : (
        <div className="mc-review__row mc-review__row--quiet">
          {ready ? (
            <span className="mc-review__ok">
              <Icon name="checkmark-circle-outline" size={18} /> All sorted
            </span>
          ) : (
            <span>Checking your trips</span>
          )}
        </div>
      )}
      <button type="button" className="mc-review__row" onClick={onReport}>
        <span>Missing a trip you made?</span>
        <span className="mc-review__go">
          Tell us <Icon name="chevron-forward" size={14} />
        </span>
      </button>
    </div>
  );
}
