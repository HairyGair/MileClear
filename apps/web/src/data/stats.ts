/** Numbers the marketing pages are allowed to quote.
 *
 *  Miles and active drivers are LIVE: data/liveStats.ts reads them from
 *  GET /community/totals (rounded down by the API, refreshed hourly). The
 *  figures below are only the fallbacks used when the API can't be reached,
 *  and the hand-checked numbers that have no live source.
 *
 *  Every hand-checked figure was read from production (admin analytics) or
 *  from Apple's own lookup feed on the date below. Round DOWN when you
 *  display them, never up, and refresh this file rather than inventing a
 *  figure in a component.
 *
 *  Checked 20 September 2026:
 *    accounts 1,199 | drivers tracking in the last 30 days 663
 *    trips 77,835 | miles 982,422
 *    App Store (GB) 4.94 from 48 ratings
 *  Checked 4 October 2026: miles about 1.3 million, drivers in the last
 *  30 days about 811.
 */
export const STATS_CHECKED = "September 2026";

/** Fallback for all-time miles when the API is down. All-time miles only
 *  grow, so a figure that was true when checked stays true: this is a floor,
 *  kept below the last reading. There is deliberately no fallback for active
 *  drivers (that number can fall), so the site hides it instead. */
export const MILES_TRACKED_FLOOR = 1_200_000;

/** Trips recorded, all time. */
export const TRIPS_TRACKED_DISPLAY = "77,000+";

/** App Store, Great Britain storefront. */
export const APP_STORE_RATING = "4.9";
export const APP_STORE_RATING_COUNT = 48;

/** Achievements in the app. Source: ACHIEVEMENT_TYPES in @mileclear/shared. */
export const ACHIEVEMENT_COUNT = 39;

/** UK forecourts in the fuel price data. Source: services/fuelFinder.ts. */
export const FUEL_STATIONS_DISPLAY = "8,300+";
