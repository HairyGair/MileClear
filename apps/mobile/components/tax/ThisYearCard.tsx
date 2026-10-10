// "This tax year so far" for gig and both drivers: tax so far, what to put by
// each week, the next payment. Leads the page from 1 February to 5 April.

import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import type { TaxOverview } from "@mileclear/shared";
import { Button } from "../Button";
import { DerivationPanel } from "../DerivationPanel";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import { longDate } from "../../lib/taxPlanner/copy";
import { showsDiffersLine } from "../../lib/tax/persona";
import { taxCard } from "./cardStyles";

export function nextPaymentLine(plan: NonNullable<TaxOverview["plan"]>): string | null {
  const p = plan.nextPayment;
  if (!p) return plan.coversTo ? `No payment due before ${longDate(plan.coversTo)}` : null;
  if (p.amountPence == null) return `Next payment: by ${longDate(p.dueDate)}, amount not known yet`;
  return `Next payment: ${formatPence(p.amountPence)} by ${longDate(p.dueDate)}`;
}

export function ThisYearCard({
  thisYear,
  plan,
  lead,
  claimPence,
  canAddEarnings,
}: {
  thisYear: NonNullable<TaxOverview["thisYear"]>;
  plan: TaxOverview["plan"];
  lead: boolean;
  /** Home's mileage claim, to explain a difference (both persona, or an employer rate). */
  claimPence: number | null;
  canAddEarnings: boolean;
}) {
  const router = useRouter();
  const [showDerivation, setShowDerivation] = useState(false);
  const noEarnings = thisYear.grossEarningsPence <= 0;
  const weekly = plan?.weeklySetAsidePence ?? null;
  const next = plan ? nextPaymentLine(plan) : null;
  const fee = plan?.accountantWeeklyFeePence ?? 0;
  const mileage = formatPence(thisYear.returnMileagePence);

  let sentence = `on ${formatPence(thisYear.grossEarningsPence)} earned, after ${mileage} mileage on your tax return`;
  if (thisYear.allowableExpensesPence > 0) {
    sentence += `, and ${formatPence(thisYear.allowableExpensesPence)} expenses`;
  }

  const summary = noEarnings
    ? `This tax year so far, ${thisYear.taxYear}. Add your earnings to see your tax so far.`
    : `This tax year so far, ${thisYear.taxYear}. Tax so far ${formatPence(thisYear.estimatedTaxPence)}, ${sentence}.${weekly != null ? ` Put by ${formatPence(weekly)} each week.` : ""}${next ? ` ${next}.` : ""}`;

  return (
    <View style={lead ? taxCard.hero : taxCard.plain}>
      <View accessible accessibilityLabel={summary}>
        <Text style={taxCard.eyebrow} maxFontSizeMultiplier={fontScaleCap.body}>
          {`THIS TAX YEAR SO FAR (${thisYear.taxYear})`}
        </Text>

        {noEarnings ? (
          <Text style={taxCard.body} maxFontSizeMultiplier={fontScaleCap.body}>
            Add your earnings to see your tax so far.
          </Text>
        ) : (
          <>
            <View style={taxCard.kvRow}>
              <Text style={taxCard.kvLabel} maxFontSizeMultiplier={fontScaleCap.body}>Tax so far</Text>
              <Text style={taxCard.kvValue} maxFontSizeMultiplier={fontScaleCap.display}>
                {formatPence(thisYear.estimatedTaxPence)}
              </Text>
            </View>
            <Text style={taxCard.muted} maxFontSizeMultiplier={fontScaleCap.body}>{sentence}</Text>
          </>
        )}

        {!noEarnings && showsDiffersLine(claimPence, thisYear.returnMileagePence) && claimPence != null && (
          <Text style={taxCard.muted} maxFontSizeMultiplier={fontScaleCap.body}>
            {`Home shows a ${formatPence(claimPence)} mileage claim. Trips that aren't tagged to a gig app count at your employer's rate there; your tax return uses the approved rates for all of them.`}
          </Text>
        )}

        {weekly != null && (
          <>
            <View style={[taxCard.kvRow, { marginTop: 16 }]}>
              <Text style={taxCard.kvLabel} maxFontSizeMultiplier={fontScaleCap.body}>Put by each week</Text>
              <Text style={taxCard.kvValue} maxFontSizeMultiplier={fontScaleCap.display}>{formatPence(weekly)}</Text>
            </View>
            {fee > 0 && (
              <Text style={taxCard.muted} maxFontSizeMultiplier={fontScaleCap.body}>
                {`Includes ${formatPence(fee)} a week for your accountant.`}
              </Text>
            )}
          </>
        )}

        {next ? (
          <Text style={taxCard.muted} maxFontSizeMultiplier={fontScaleCap.body}>{next}</Text>
        ) : null}

        {weekly == null && plan && (
          <View style={{ marginTop: 12 }}>
            <Text style={taxCard.muted} maxFontSizeMultiplier={fontScaleCap.body}>
              Put by each week: not known yet.
            </Text>
            <Pressable
              style={taxCard.linkRow}
              accessibilityRole="link"
              onPress={() => router.push("/tax-planner" as never)}
            >
              <Text style={taxCard.link}>Tell the payment plan when you started</Text>
            </Pressable>
          </View>
        )}

        {thisYear.higherRateHeadroomPence != null && (
          <Text style={taxCard.muted} maxFontSizeMultiplier={fontScaleCap.body}>
            {`You're ${formatPence(thisYear.higherRateHeadroomPence)} away from the 40% rate. Every business mile you record keeps more of your profit at 20%.`}
          </Text>
        )}
      </View>

      {!noEarnings && (
        <Pressable
          style={[taxCard.linkRow, { marginTop: 4 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`How ${mileage} mileage on your tax return was worked out`}
          onPress={() => setShowDerivation(true)}
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.amber} />
          <Text style={[taxCard.link, { fontFamily: fonts.semibold, fontSize: 13 }]}>How the mileage was worked out</Text>
        </Pressable>
      )}

      <View style={taxCard.actions}>
        {noEarnings && canAddEarnings && (
          <Button title="Add earnings" variant="primary" fullWidth onPress={() => router.push("/earning-form" as never)} />
        )}
        <Button
          title="See payment plan"
          variant={lead && !(noEarnings && canAddEarnings) ? "primary" : "secondary"}
          fullWidth
          onPress={() => router.push("/tax-planner" as never)}
        />
      </View>

      <DerivationPanel
        visible={showDerivation}
        title={`Mileage on your tax return · ${thisYear.taxYear}`}
        formattedValue={mileage}
        derivation={thisYear.mileageDerivation}
        onClose={() => setShowDerivation(false)}
      />
    </View>
  );
}
