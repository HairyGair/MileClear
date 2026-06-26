import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";

/**
 * HMRC-mandated MTD signposts. The production-approval checklist requires that,
 * for an in-year self-employment-only product, the software clearly states:
 *  - the tax calculation is only an estimate based on info HMRC holds so far,
 *  - which income types are NOT supported (link to compatible software),
 *  - that end-of-year / Final Declaration is not supported (same link).
 * One small component so the copy + the GOV.UK link stay consistent everywhere.
 */
const GOVUK_COMPATIBLE_SOFTWARE =
  "https://www.gov.uk/guidance/find-software-thats-compatible-with-making-tax-digital-for-income-tax";

export function MtdSignpost({
  text,
  showLink = true,
  icon = "information-circle-outline",
}: {
  text: string;
  showLink?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name={icon} size={16} color={colors.text3} style={{ marginTop: 1 }} accessible={false} />
        <Text style={styles.text}>{text}</Text>
      </View>
      {showLink && (
        <TouchableOpacity
          onPress={() => Linking.openURL(GOVUK_COMPATIBLE_SOFTWARE)}
          accessibilityRole="link"
          accessibilityLabel="Find MTD-compatible software on GOV.UK"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.link}>Find compatible software on GOV.UK ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  text: { flex: 1, color: colors.text2, fontSize: 12.5, fontFamily: fonts.regular, lineHeight: 18 },
  link: { color: colors.amber, fontSize: 12.5, fontFamily: fonts.medium, marginTop: 8, marginLeft: 24 },
});
