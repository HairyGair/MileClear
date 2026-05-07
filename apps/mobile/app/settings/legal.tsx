import { Linking } from "react-native";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";

export default function LegalSettings() {
  return (
    <SettingsScreen>
      <SettingsGroup>
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
