import { useCallback, useState } from "react";
import { Alert, Share } from "react-native";
import { useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { exportUserData } from "../../lib/api/user";
import { scanLowConfidenceTrips } from "../../lib/api/trips";

export default function DataExportsSettings() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);

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

  const handleScanAndFix = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      // First pass: scanOnly so the user sees the count before we mutate.
      const scanRes = await scanLowConfidenceTrips({ scanOnly: true, limit: 100 });
      const found = scanRes.data.candidateCount;

      if (found === 0) {
        Alert.alert("All clear", "We didn't find any trips that look off. Your distances are already road-routed and confidence-checked.");
        setScanning(false);
        return;
      }

      Alert.alert(
        "Found suspicious trips",
        `We found ${found} trip${found === 1 ? "" : "s"} where the distance might be wrong (sparse GPS, no road match, or unverified). Re-running our routing engine usually corrects these. Apply now?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setScanning(false) },
          {
            text: "Fix them",
            style: "default",
            onPress: async () => {
              try {
                const applyRes = await scanLowConfidenceTrips({ scanOnly: false, limit: 100 });
                const r = applyRes.data;
                const milesGained = r.totalMilesGained ?? 0;
                const lines = [
                  `Improved ${r.improved} of ${r.applied} trips.`,
                  milesGained > 0 ? `Recovered ${milesGained.toFixed(1)} miles total.` : "",
                  r.polylinesAdded ? `Added road-snapped routes to ${r.polylinesAdded}.` : "",
                ].filter(Boolean);
                Alert.alert("Done", lines.join("\n"));
              } catch (err) {
                Alert.alert("Couldn't fix all trips", err instanceof Error ? err.message : "Try again later.");
              } finally {
                setScanning(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert("Couldn't scan", err instanceof Error ? err.message : "Try again later.");
      setScanning(false);
    }
  }, [scanning]);

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

      <SettingsGroup title="DATA QUALITY">
        <SettingsRow
          icon="shield-checkmark-outline"
          label={scanning ? "Scanning..." : "Recheck suspicious trips"}
          hint="Find trips with sparse GPS or unverified distances and re-run our routing engine to correct them"
          onPress={handleScanAndFix}
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
