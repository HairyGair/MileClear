import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../../lib/theme";

/**
 * The Profile tab is retired (Oct 2026 Settings redesign): the avatar opens
 * Settings, and Your car, Your plan, Your account and Log out are on that page.
 * Kept so an old push notification or link never lands nowhere.
 *
 * Not a <Redirect>: from inside the tabs that would REPLACE the whole tab
 * navigator in the root stack with Settings, leaving Settings with no back
 * button and no way home. Instead go to the Home tab, then open Settings on
 * top of it, so Back returns to Home.
 */
export default function ProfileRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.navigate("/(tabs)/dashboard" as never);
    const t = setTimeout(() => router.push("/settings" as never), 0);
    return () => clearTimeout(t);
  }, [router]);
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
