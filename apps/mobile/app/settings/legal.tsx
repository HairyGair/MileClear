import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Terms and privacy are a row on the Settings page.
 */
export default function Legacy_legal() {
  return <Redirect href="/settings" />;
}
