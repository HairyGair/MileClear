// "Missed a deadline?" (SPEC 4.8). Short, plain, and checked against GOV.UK
// (see lib/tax/mtdHelpCopy.ts for the pages and the date).

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../components/Button";
import { GOVUK_MTD_PENALTIES, LATE_SECTIONS, LATE_TITLE } from "../lib/tax/mtdHelpCopy";
import { MTD_HUB_ROUTE } from "../lib/tax/quarterlyCard";
import { colors, fonts, fontScaleCap, radii, spacing } from "../lib/theme";

export default function TaxMtdLateScreen() {
  const router = useRouter();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.display}>
        {LATE_TITLE}
      </Text>
      {LATE_SECTIONS.map((s, i) => (
        <View key={s.heading ?? `s${i}`} style={i === 0 ? styles.lead : styles.card}>
          {s.heading && (
            <Text style={styles.heading} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
              {s.heading}
            </Text>
          )}
          <Text style={i === 0 ? styles.leadText : styles.text} maxFontSizeMultiplier={fontScaleCap.body}>
            {s.body}
          </Text>
        </View>
      ))}
      <TouchableOpacity
        onPress={() => Linking.openURL(GOVUK_MTD_PENALTIES)}
        accessibilityRole="link"
        accessibilityLabel="Read HMRC's penalty rules on GOV.UK"
        style={styles.link}
      >
        <Text style={styles.linkText}>HMRC's penalty rules on GOV.UK ›</Text>
      </TouchableOpacity>
      <Button title="Go to quarterly updates" variant="primary" fullWidth onPress={() => router.push(MTD_HUB_ROUTE as never)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, color: colors.text1 },
  lead: { marginTop: spacing.md, marginBottom: spacing.sm },
  leadText: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: colors.text1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  heading: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text1 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text2, marginTop: 6 },
  link: { minHeight: 44, justifyContent: "center", marginTop: spacing.md, marginBottom: spacing.md },
  linkText: { fontFamily: fonts.medium, fontSize: 14, color: colors.amber },
});
