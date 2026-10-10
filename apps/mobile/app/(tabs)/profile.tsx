import { Redirect } from "expo-router";

/**
 * The Profile tab is retired (Oct 2026 Settings redesign): the avatar opens
 * Settings, and Your car, Your plan, Your account and Log out are on that page.
 * Kept as a redirect so an old push notification or link never lands nowhere.
 */
export default function ProfileRedirect() {
  return <Redirect href="/settings" />;
}
