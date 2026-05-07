import { useCallback, useState } from "react";
import { Alert, Share } from "react-native";
import { useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { exportUserData } from "../../lib/api/user";

export default function DataExportsSettings() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  const handleGdprExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await exportUserData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({
        message: json,
        title: "MileClear Data Export",
      });
    } catch (err: unknown) {
      Alert.alert(
        "Export didn't go through",
        err instanceof Error ? err.message : "Try again in a moment."
      );
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return (
    <SettingsScreen>
      <SettingsGroup>
        <SettingsRow
          icon="receipt-outline"
          label="Tax exports"
          hint="HMRC self-assessment, CSV, PDF trip log"
          badge="Pro"
          onPress={() => router.push("/exports")}
        />
        <SettingsRow
          icon="sync-outline"
          label="Sync status"
          hint="Pending uploads + retry failed items"
          onPress={() => router.push("/sync-status")}
        />
        <SettingsRow
          icon="grid-outline"
          label="Customize dashboard layout"
          hint="Drag to reorder cards, hide what you don't use"
          onPress={() => router.push("/customize-layout")}
        />
      </SettingsGroup>

      <SettingsGroup title="MY DATA">
        <SettingsRow
          icon="cloud-download-outline"
          label={exporting ? "Preparing..." : "Export my data"}
          hint="Full JSON copy of everything we hold (GDPR Article 20)"
          onPress={handleGdprExport}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
