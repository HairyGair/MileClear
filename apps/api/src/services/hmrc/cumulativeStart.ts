/**
 * Where a cumulative (year-to-date) update starts: 6 April, the start of the
 * tax year, for every driver. This is what has been sent since quarterly
 * updates went live on 30 Oct 2026.
 *
 * Drivers who chose calendar quarters have obligations starting 1 April, so
 * 1-5 April could belong in their figures. Moving their start to 1 April
 * changes what HMRC receives, and it would have to apply to every update of
 * the year (decided from the quarter style, not the first update's date), so
 * it stays off until HMRC's test service confirms it accepts a 1 April start.
 */
export function cumulativeStartFor(taxYear: string, _requestedStart?: string | null): string {
  return `${taxYear.slice(0, 4)}-04-06`;
}
