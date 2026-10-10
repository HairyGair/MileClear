import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. App lock is now a switch on the Settings page.
 */
export default function Legacy_security() {
  return <Redirect href="/settings" />;
}
