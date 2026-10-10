import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Data & Exports became Your data (Downloads is a row on Settings).
 */
export default function Legacy_data_exports() {
  return <Redirect href="/settings/data" />;
}
