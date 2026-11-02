/**
 * Where a cumulative (year-to-date) update starts. The tax year begins on 6
 * April, but a driver who chose calendar quarters has an obligation starting
 * 1 April, and those first days belong in their figures too. Only an exact
 * 1 April start moves it; anything else keeps 6 April.
 */
export function cumulativeStartFor(taxYear: string, requestedStart?: string | null): string {
  const year = taxYear.slice(0, 4);
  return requestedStart === `${year}-04-01` ? `${year}-04-01` : `${year}-04-06`;
}
