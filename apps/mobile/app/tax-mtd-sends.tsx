// "What MileClear sends, and what it doesn't". Mirrors what the update
// actually contains (services/hmrc/periodMapping.ts) and what GOV.UK says an
// update holds: totals, not individual receipts or invoices.

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GOVUK_MTD_SEND_UPDATES, SENDS_SECTIONS, SENDS_TITLE } from "../lib/tax/mtdHelpCopy";
import { colors, fonts, fontScaleCap, radii, spacing } from "../lib/theme";

export default function TaxMtdSendsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.display}>
        {SENDS_TITLE}
      </Text>
      {SENDS_SECTIONS.map((s) => (
        <View key={s.heading} style={styles.card} accessible accessibilityLabel={`${s.heading}. ${s.body}`}>
          <Ionicons
            name={s.icon}
            size={22}
            color={s.icon === "checkmark-circle" ? colors.green : colors.text3}
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.heading} maxFontSizeMultiplier={fontScaleCap.heading}>{s.heading}</Text>
            <Text style={styles.text} maxFontSizeMultiplier={fontScaleCap.body}>{s.body}</Text>
          </View>
        </View>
      ))}
      <TouchableOpacity
        onPress={() => Linking.openURL(GOVUK_MTD_SEND_UPDATES)}
        accessibilityRole="link"
        accessibilityLabel="Read what a quarterly update contains on GOV.UK"
        style={styles.link}
      >
        <Text style={styles.linkText}>What a quarterly update contains, on GOV.UK ›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, color: colors.text1, marginBottom: spacing.sm },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  heading: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text1 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text2, marginTop: 4 },
  link: { minHeight: 44, justifyContent: "center", marginTop: spacing.md },
  linkText: { fontFamily: fonts.medium, fontSize: 14, color: colors.amber },
});
