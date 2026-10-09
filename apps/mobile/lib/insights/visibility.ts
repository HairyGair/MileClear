// Which cards show, by how many trips the driver has ever recorded
// (SPEC-UX section 12) and who they are. Pure.

export const FIRST_WEEK_TRIPS = 10;

export interface Visibility {
  /** No trips ever: only the friendly empty state. */
  onlyEmptyState: boolean;
  /** Under 10 trips: records, Drivers near you and Go deeper wait. */
  firstWeek: boolean;
  showRecords: boolean;
  showDriversNearYou: boolean;
  showGoDeeper: boolean;
}

/** `tripsEver` null = not known yet: show the normal screen, never the empty state on a guess. */
export function insightsVisibility(tripsEver: number | null): Visibility {
  const known = tripsEver !== null;
  const onlyEmptyState = known && tripsEver === 0;
  const firstWeek = known && tripsEver < FIRST_WEEK_TRIPS;
  return {
    onlyEmptyState,
    firstWeek,
    showRecords: !firstWeek,
    showDriversNearYou: !firstWeek,
    showGoDeeper: !firstWeek,
  };
}

/** "Trips to sort" row: every Work-mode driver (employees too) with unsorted trips. */
export function tripsToSort(isWork: boolean, unclassifiedTrips: number | undefined | null): number {
  if (!isWork) return 0;
  return unclassifiedTrips && unclassifiedTrips > 0 ? unclassifiedTrips : 0;
}
