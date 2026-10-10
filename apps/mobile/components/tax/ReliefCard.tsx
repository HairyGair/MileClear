// Mileage Allowance Relief as the Tax tab's answer for employees. The pounds
// come from useMarRelief, the same number the relief screen shows as its hero.

import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { formatPence } from "@mileclear/shared";
import { Button } from "../Button";
import { fontScaleCap } from "../../lib/theme";
import { taxCard } from "./cardStyles";

export function ReliefCard({
  reliefPence,
  firstYear,
  lastYear,
  employerRateSet,
  scotland,
}: {
  reliefPence: number;
  /** Earliest and latest tax year that has relief in it, or null when none. */
  firstYear: string | null;
  lastYear: string | null;
  employerRateSet: boolean;
  scotland: boolean;
}) {
  const router = useRouter();
  const has = reliefPence > 0;
  const span =
    firstYear && lastYear
      ? firstYear === lastYear
        ? `For ${firstYear}.`
        : `Across ${firstYear} to ${lastYear}.`
      : "";
  const back = scotland
    ? "What you get back depends on your tax rate."
    : "You get back 20% or 40% of this, depending on your tax rate.";
  const sub = has
    ? `${span} ${back}`.trim()
    : "No relief to claim. Your employer pays at least the approved rate, or there are no business miles yet.";

  return (
    <View style={taxCard.hero}>
      <View
        accessible
        accessibilityLabel={`Mileage Allowance Relief. ${has ? `${formatPence(reliefPence)} to claim. ` : ""}${sub}`}
      >
        <Text style={taxCard.eyebrow} maxFontSizeMultiplier={fontScaleCap.body}>MILEAGE ALLOWANCE RELIEF</Text>
        {has && (
          <Text style={taxCard.figure} maxFontSizeMultiplier={fontScaleCap.display}>
            {`${formatPence(reliefPence)} to claim`}
          </Text>
        )}
        <Text style={taxCard.body} maxFontSizeMultiplier={fontScaleCap.body}>{sub}</Text>
        {!employerRateSet && (
          <Text style={taxCard.muted} maxFontSizeMultiplier={fontScaleCap.body}>
            Assumes your employer paid nothing for mileage.
          </Text>
        )}
      </View>
      {!employerRateSet && (
        <Pressable
          style={taxCard.linkRow}
          accessibilityRole="link"
          onPress={() => router.push("/settings/work-tax" as never)}
        >
          <Text style={taxCard.link}>Set your employer's rate</Text>
        </Pressable>
      )}
      <View style={taxCard.actions}>
        <Button title="How to claim" variant="primary" fullWidth onPress={() => router.push("/mileage-relief" as never)} />
      </View>
    </View>
  );
}
