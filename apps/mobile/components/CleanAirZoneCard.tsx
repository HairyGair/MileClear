// Clean Air Zone / ULEZ compliance card for the vehicle screen.
//
// Compliance is computed (shared/assessCleanAirZones) from DVLA emissions data,
// not an official API — so it's framed as GUIDANCE with a link to the official
// checker. Free "fighting your corner" feature: a driver knows before they
// drive whether a city's daily charge will hit them, and (Phase B) charges get
// logged as a deductible expense.

import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence, type CazAssessment } from "@mileclear/shared";
import { colors, fonts, radii } from "../lib/theme";

const EMERALD = "#10b981";
const AMBER = "#f59e0b";

export function CleanAirZoneCard({ assessment }: { assessment: CazAssessment }) {
  const ok = assessment.verdict === "compliant";
  const unknown = assessment.verdict === "unknown";
  const accent = ok ? EMERALD : unknown ? colors.text3 : AMBER;

  // Zones that actually charge THIS vehicle when non-compliant — the ones that
  // cost the driver money. When compliant, we still list them as "no charge".
  const charging = assessment.zones.filter((z) => z.chargesThisVehicle);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name={ok ? "leaf" : unknown ? "help-circle-outline" : "alert-circle"}
          size={18}
          color={accent}
        />
        <Text style={styles.title}>Clean Air Zones &amp; ULEZ</Text>
        {assessment.confidence === "estimated" && (
          <Text style={styles.estTag}>estimated</Text>
        )}
      </View>

      <Text style={[styles.summary, { color: accent }]}>{assessment.summary}</Text>

      {!unknown && charging.length > 0 && (
        <View style={styles.zoneList}>
          {charging.map((z) => (
            <View key={z.id} style={styles.zoneRow}>
              <Text style={styles.zoneName}>{z.name}</Text>
              <Text style={[styles.zoneCharge, { color: ok ? colors.text3 : AMBER }]}>
                {ok ? "No charge" : `${formatPence(z.chargePence ?? 0)}/day`}
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.checkLink}
        onPress={() =>
          Linking.openURL("https://www.gov.uk/clean-air-zones").catch(() => {})
        }
        accessibilityRole="link"
        accessibilityLabel="Check the official Clean Air Zone status on gov.uk"
      >
        <Text style={styles.checkLinkText}>Check the official gov.uk status</Text>
        <Ionicons name="open-outline" size={13} color={colors.amber} />
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        Guidance based on your vehicle&apos;s emissions data, not an official ruling.
        Always confirm with the official checker.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginTop: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  title: { color: colors.text1, fontFamily: fonts.bold, fontSize: 14, flex: 1 },
  estTag: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.text3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summary: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  zoneList: { marginTop: 8, gap: 4 },
  zoneRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  zoneName: { color: colors.text2, fontFamily: fonts.regular, fontSize: 12.5, flex: 1 },
  zoneCharge: { fontFamily: fonts.semibold, fontSize: 12.5 },
  checkLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
  },
  checkLinkText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 13 },
  disclaimer: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
  },
});
