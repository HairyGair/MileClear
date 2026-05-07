import { useCallback } from "react";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { apiRequest } from "../../lib/api";
import { getDatabase } from "../../lib/db";

const APP_STORE_ID = "6759671005";

export default function HelpSettings() {
  const router = useRouter();

  const handleRate = useCallback(async () => {
    // Direct App Store deep link. Bypasses SKStoreReviewController's
    // silent per-user-per-year 3-prompt ceiling.
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({ type: "rating.manual_open", metadata: { source: "settings_help" } }),
    }).catch(() => {});
    try {
      const d = await getDatabase();
      await d.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('review_given', '1')"
      );
    } catch {}
    Linking.openURL(
      `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`
    ).catch(() =>
      Linking.openURL(`https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`)
    );
  }, []);

  return (
    <SettingsScreen>
      <SettingsGroup>
        <SettingsRow
          icon="star-outline"
          label="Rate MileClear"
          hint="Open the App Store review screen"
          onPress={handleRate}
        />
        <SettingsRow
          icon="chatbubble-ellipses-outline"
          label="Suggestions & Feedback"
          hint="Vote on features the team is building"
          onPress={() => router.push("/feedback")}
        />
        <SettingsRow
          icon="mail-outline"
          label="Email Support"
          hint="support@mileclear.com"
          onPress={() => Linking.openURL("mailto:support@mileclear.com?subject=MileClear%20Support")}
        />
        <SettingsRow
          icon="help-circle-outline"
          label="FAQ & Help"
          hint="Common questions and tax-time tips"
          onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/support")}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
