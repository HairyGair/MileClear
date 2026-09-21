/** The Google Play listing, and the one switch that says whether it is public.
 *
 *  Submitted 19 September 2026, approved and live on 21 September. Every
 *  Android surface reads this flag: the store buttons, the copy on the SEO
 *  pages, the schema, and the "tell me when it lands" form on /android, which
 *  disappears when this is true. */
export const PLAY_LIVE = true;

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.mileclear.app";

/** Where a Google Play button goes. */
export const ANDROID_HREF = PLAY_LIVE ? PLAY_STORE_URL : "/android";

/** Fits "MileClear is ..." */
export const ANDROID_STATUS = PLAY_LIVE
  ? "on Google Play in the UK"
  : "finished on Android and waiting on Google's approval to appear on Google Play";

/** A whole answer, for FAQ entries and structured data. */
export const ANDROID_FAQ_ANSWER = PLAY_LIVE
  ? "Yes. MileClear is on the App Store for iPhone and iPad and on Google Play for Android in the UK. One account works on both, and your trips follow you."
  : "Yes. The Android app is built and in testing, and its public release is with Google now, so it appears on Google Play as soon as they approve it. One account works on both, and your trips follow you.";

/** A comparison-table cell for the platforms MileClear runs on. */
export const ANDROID_PLATFORMS_CELL = PLAY_LIVE ? "iOS and Android" : "iOS, Android in testing";

/** schema.org operatingSystem. */
export const ANDROID_OS_SCHEMA = PLAY_LIVE ? "iOS, Android" : "iOS";
