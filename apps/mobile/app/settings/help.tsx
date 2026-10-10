import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Help, community, invite and terms are rows on the Settings page.
 */
export default function Legacy_help() {
  return <Redirect href="/settings" />;
}
