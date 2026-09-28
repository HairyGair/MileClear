/**
 * When a "journey to check" stops being offered (pure, unit-tested).
 *
 * 28 Sep 2026: 476 of 649 active drivers had open offers, median 6, 164 with
 * 10 or more and 28 with 25 or more. A list that long gets ignored wholesale,
 * so the fresh offers that matter are lost in it.
 *
 * Age is measured from the JOURNEY, not from when the row was made: a gap
 * row is recreated by the scan for as long as its two trips sit in the scan's
 * 30-day window, so createdAt says nothing about how old the drive is. We use
 * arrivedAt, the latest moment the drive could have happened, so nothing
 * expires before it is a full window old whichever end of the gap it was.
 *
 * Evidence (prod, 90 days of decisions to 28 Sep 2026, 812 rows):
 *   - 25 of 317 acceptances (8%) came more than 14 days after the journey;
 *     gap 10 of 111, trip_start 14 of 166, recorded 1 of 29.
 *   - Every dropped_* decision (walk, phantom, Start Trip) came within 14 days.
 *   - Of the 4,916 open offers, 2,421 (49%) were already over 14 days old.
 * So a 14-day window keeps 92% of what drivers accept and halves the pile.
 * The 8% are not lost for good: "Missing a trip?" adds any past drive.
 *
 * One exception, "dropped_start_trip": the driver pressed Start Trip, drove,
 * and the recording was discarded or never saved. It is a whole journey they
 * chose to record, 4 of 5 decided were accepted, and there are only a few
 * dozen open at any time, so it adds nothing to the pile. It keeps 30 days,
 * the same reach as the scan itself.
 *
 * Expired rows move to status "expired": decidedAt stays null because the
 * driver decided nothing, accept/dismiss counts stay honest, and the change is
 * reversible by setting the status back. Same shape as "covered" (26 Sep).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default age, in days after the journey, beyond which an offer is not shown. */
export const OFFER_MAX_AGE_DAYS = 14;

/** Sources that keep a different window, with the reason in the header. */
export const OFFER_MAX_AGE_DAYS_BY_SOURCE: Readonly<Record<string, number>> = {
  dropped_start_trip: 30,
};

export function offerMaxAgeDays(source: string): number {
  return OFFER_MAX_AGE_DAYS_BY_SOURCE[source] ?? OFFER_MAX_AGE_DAYS;
}

export interface ExpiryProposalInput {
  source: string;
  arrivedAt: Date;
}

/** The moment an offer stops being offered. */
export function offerExpiresAt(p: ExpiryProposalInput): Date {
  return new Date(p.arrivedAt.getTime() + offerMaxAgeDays(p.source) * DAY_MS);
}

/** True once the journey is older than its source's window. An unreadable
 *  date never expires anything. */
export function isOfferExpired(p: ExpiryProposalInput, now: number): boolean {
  const t = p.arrivedAt.getTime();
  if (!Number.isFinite(t) || !Number.isFinite(now)) return false;
  return now > offerExpiresAt(p).getTime();
}
