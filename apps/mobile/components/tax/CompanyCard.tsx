// Company drivers: the work miles this tax year and a way to share the log.
// No pounds on purpose: the team's rate is not what Home uses (SPEC 3.4).

import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { formatMiles } from "@mileclear/shared";
import { Button } from "../Button";
import { fontScaleCap } from "../../lib/theme";
import { taxCard } from "./cardStyles";

export function CompanyCard({ taxYear, businessMiles }: { taxYear: string; businessMiles: number }) {
  const router = useRouter();
  const value = `${formatMiles(businessMiles).replace(/\s*mi$/, "")} work miles`;
  return (
    <View style={taxCard.hero}>
      <View
        accessible
        accessibilityLabel={`This tax year, ${taxYear}. ${value}. Your company pays you for these through Milesheet.`}
      >
        <Text style={taxCard.eyebrow} maxFontSizeMultiplier={fontScaleCap.body}>{`THIS TAX YEAR (${taxYear})`}</Text>
        <Text style={taxCard.figure} maxFontSizeMultiplier={fontScaleCap.display}>{value}</Text>
        <Text style={taxCard.body} maxFontSizeMultiplier={fontScaleCap.body}>
          Your company pays you for these through Milesheet.
        </Text>
      </View>
      <View style={taxCard.actions}>
        <Button title="Share my mileage log" variant="primary" fullWidth onPress={() => router.push("/exports" as never)} />
      </View>
    </View>
  );
}
