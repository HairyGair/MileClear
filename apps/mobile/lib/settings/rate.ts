// Where "Rate MileClear" goes on each phone. It used to open the App Store on
// every phone, including Android ones, where that link goes nowhere useful.

export const APP_STORE_ID = "6759671005";
export const ANDROID_PACKAGE = "com.mileclear.app";

export interface RateTarget {
  /** Tried first (opens the store app directly). */
  primary: string;
  /** Used when the store app link cannot open. */
  fallback: string;
}

export function rateTarget(platform: "ios" | "android"): RateTarget {
  if (platform === "android") {
    return {
      primary: `market://details?id=${ANDROID_PACKAGE}`,
      fallback: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
    };
  }
  return {
    // Direct App Store link: skips SKStoreReviewController's silent
    // three-prompts-a-year ceiling.
    primary: `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    fallback: `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
  };
}

/** What the row says it opens. */
export function rateHint(platform: "ios" | "android"): string {
  return platform === "android" ? "Open the Play Store" : "Open the App Store review screen";
}
