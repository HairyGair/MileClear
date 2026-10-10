import { useCallback } from "react";
import { Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { apiRequest } from "../../lib/api";
import { getDatabase } from "../../lib/db";
import { rateHint, rateTarget } from "../../lib/settings/rate";

export default function HelpSettings() {
  const router = useRouter();
  const platform = Platform.OS === "ios" ? "ios" : "android";

  const handleRate = useCallback(async () => {
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({ type: "rating.manual_open", metadata: { source: "settings_help", platform } }),
    }).catch(() => {});
    try {
      const d = await getDatabase();
      await d.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('review_given', '1')"
      );
    } catch {}
    const target = rateTarget(platform);
    Linking.openURL(target.primary).catch(() => Linking.openURL(target.fallback).catch(() => {}));
  }, [platform]);

  return (
    <SettingsScreen>
      <SettingsGroup>
        <SettingsRow
          icon="play-circle-outline"
          label="Help and how-tos"
          hint="Quick start tour and answers to common questions"
          onPress={() => router.push("/help" as never)}
        />
        <SettingsRow
          icon="chatbubble-ellipses-outline"
          label="Tell us about a problem or idea"
          hint="Vote on features the team is building"
          onPress={() => router.push("/feedback")}
        />
        <SettingsRow
          icon="mail-outline"
          label="Email support"
          hint="support@mileclear.com"
          onPress={() => Linking.openURL("mailto:support@mileclear.com?subject=MileClear%20Support")}
        />
        <SettingsRow
          icon="chatbubbles-outline"
          label="MileClear community"
          hint="Chat with other drivers"
          onPress={() => router.push("/settings/community" as never)}
        />
        <SettingsRow
          icon="star-outline"
          label="Rate MileClear"
          hint={rateHint(platform)}
          onPress={handleRate}
        />
        <SettingsRow
          icon="gift-outline"
          label="Invite a friend, get Pro free"
          hint="Up to 3 free months"
          onPress={() => router.push("/refer" as never)}
        />
        <SettingsRow
          icon="globe-outline"
          label="mileclear.com/support"
          hint="The full online support pages"
          onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/support")}
        />
      </SettingsGroup>
      <SettingsGroup title="LEGAL">
        <SettingsRow
          icon="document-text-outline"
          label="Terms of Use"
          onPress={() => Linking.openURL("https://mileclear.com/terms")}
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          onPress={() => Linking.openURL("https://mileclear.com/privacy")}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
