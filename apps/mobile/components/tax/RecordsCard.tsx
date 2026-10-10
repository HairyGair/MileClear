// Personal mode "Records": miles since 6 April and the mileage certificate.
// No tax, claim or deduction wording here (SPEC 3.5).

import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { formatMiles } from "@mileclear/shared";
import { Button } from "../Button";
import { fontScaleCap } from "../../lib/theme";
import { taxCard } from "./cardStyles";

export function RecordsCard({ taxYear, totalMiles }: { taxYear: string; totalMiles: number }) {
  const router = useRouter();
  const value = `${formatMiles(totalMiles).replace(/\s*mi$/, "")} miles`;
  return (
    <View style={taxCard.plain}>
      <View accessible accessibilityLabel={`Since 6 April, ${taxYear}. ${value}.`}>
        <Text style={taxCard.eyebrow} maxFontSizeMultiplier={fontScaleCap.body}>{`SINCE 6 APRIL (${taxYear})`}</Text>
        <Text style={taxCard.figure} maxFontSizeMultiplier={fontScaleCap.display}>{value}</Text>
        <Text style={taxCard.body} maxFontSizeMultiplier={fontScaleCap.body}>
          Need proof of your driving for an insurer, employer or anyone else?
        </Text>
      </View>
      <View style={taxCard.actions}>
        <Button title="Mileage certificate" variant="primary" fullWidth onPress={() => router.push("/mileage-certificate" as never)} />
      </View>
    </View>
  );
}
