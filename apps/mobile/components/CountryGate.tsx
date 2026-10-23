// A screen for a UK-only feature (23 Oct 2026). The way in (a row, a card, a
// tab) is hidden outside the UK, but a link, a notification or an old
// shortcut can still open it, so it shows a short note instead of figures
// that don't apply. Decided by featuresFor(country), the one gate.
import type { ComponentType } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { NOT_IN_YOUR_COUNTRY, countryName, type CountryFeature } from "@mileclear/shared";
import { useCountryFeatures } from "../lib/country/country";
import { colors, fonts, fontScaleCap, radii, spacing } from "../lib/theme";

export function NotInYourCountry() {
  const router = useRouter();
  const { country } = useCountryFeatures();
  return (
    <View style={styles.root}>
      <Ionicons name="globe-outline" size={36} color={colors.text3} />
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.display}>
        {NOT_IN_YOUR_COUNTRY}
      </Text>
      <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
        This is built for UK drivers, and your country is set to {countryName(country)}. Recording and your trips
        work as normal. You can change your country in Settings.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard" as never))}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText} maxFontSizeMultiplier={fontScaleCap.heading}>
          Go back
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/settings/country" as never)} style={styles.link} accessibilityRole="button">
        <Text style={styles.linkText} maxFontSizeMultiplier={fontScaleCap.heading}>
          Change country
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Wrap a screen's default export: outside the feature's countries it shows NotInYourCountry. */
export function withCountryFeature<P extends object>(feature: CountryFeature, Screen: ComponentType<P>): ComponentType<P> {
  function Gated(props: P) {
    const f = useCountryFeatures();
    if (!f[feature]) return <NotInYourCountry />;
    return <Screen {...props} />;
  }
  Gated.displayName = `CountryGate(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return Gated;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  title: {
    marginTop: spacing.lg,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fonts.bold,
    color: colors.text1,
    textAlign: "center",
  },
  body: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: colors.text2,
    textAlign: "center",
  },
  button: {
    marginTop: spacing.xxl,
    minHeight: 50,
    alignSelf: "stretch",
    borderRadius: radii.lg,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 16, fontFamily: fonts.bold, color: colors.bg },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  linkText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text2 },
});
