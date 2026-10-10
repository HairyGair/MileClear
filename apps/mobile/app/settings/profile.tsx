import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Settings > Profile became Your account.
 */
export default function Legacy_profile() {
  return <Redirect href="/settings/account" />;
}
