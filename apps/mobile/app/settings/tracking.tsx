import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Tracking & Locations became Recording.
 */
export default function Legacy_tracking() {
  return <Redirect href="/settings/recording" />;
}
