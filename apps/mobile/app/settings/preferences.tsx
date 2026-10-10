import { Redirect } from "expo-router";

/**
 * Kept so an old link, a deep link or a push notification never lands on a
 * missing screen. Preferences dissolved: Dashboard mode became "You drive for" in Your tax details; the weekly goal lives in Insights.
 */
export default function Legacy_preferences() {
  return <Redirect href="/settings/work-tax" />;
}
