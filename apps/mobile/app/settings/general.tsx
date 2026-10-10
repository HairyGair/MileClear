import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Old "General" link (very old builds): Your account.
 */
export default function Legacy_general() {
  return <Redirect href="/settings/account" />;
}
