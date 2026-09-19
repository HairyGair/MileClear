/** Numbers the marketing pages are allowed to quote.
 *
 *  Every figure here was read from production (admin analytics) or from
 *  Apple's own lookup feed on the date below. Round DOWN when you display
 *  them, never up, and refresh this file rather than inventing a figure in a
 *  component. If a number here is older than a couple of months, check it
 *  again before shipping copy that leans on it.
 *
 *  Checked 20 September 2026:
 *    accounts 1,199 | drivers tracking in the last 30 days 663
 *    trips 77,835 | miles 982,422
 *    App Store (GB) 4.94 from 48 ratings
 */
export const STATS_CHECKED = "September 2026";

/** Drivers who recorded at least one trip in the last 30 days. */
export const ACTIVE_DRIVERS_DISPLAY = "660+";

/** Miles recorded by MileClear drivers, all time. */
export const MILES_TRACKED_DISPLAY = "980,000+";

/** Trips recorded, all time. */
export const TRIPS_TRACKED_DISPLAY = "77,000+";

/** App Store, Great Britain storefront. */
export const APP_STORE_RATING = "4.9";
export const APP_STORE_RATING_COUNT = 48;

/** Achievements in the app. Source: ACHIEVEMENT_TYPES in @mileclear/shared. */
export const ACHIEVEMENT_COUNT = 39;

/** UK forecourts in the fuel price data. Source: services/fuelFinder.ts. */
export const FUEL_STATIONS_DISPLAY = "8,300+";
