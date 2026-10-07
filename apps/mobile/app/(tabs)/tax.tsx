// Tax hub: the seven-odd tax entries the old avatar menu listed, grouped by
// what the driver is trying to do. Work mode shows it as a tab; Personal mode
// reaches it from More and gets a back arrow.

import { useCallback, useState } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AppHeader from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { TaxReadinessCard } from "../../components/business/TaxReadinessCard";
import { fetchGamificationStats } from "../../lib/api/gamification";
import { useUser } from "../../lib/user/context";
import { useMode } from "../../lib/mode/context";
import { colors } from "../../lib/theme";

export default function TaxScreen() {
  const router = useRouter();
  const { user, isCompanyDriver, isLoading } = useUser();
  const { isPersonal } = useMode();
  // null = not known yet (or offline): show the readiness card, which copes
  // with its own failures, rather than a "nothing to claim" message.
  const [totalTrips, setTotalTrips] = useState<number | null>(null);
  // The readiness card already links to Self Assessment, the payment plan, the
  // first-return guide and reconciliation. Show those as rows only when the
  // card is not on screen (no trips yet, or it could not load).
  const [cardShown, setCardShown] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchGamificationStats()
        .then((res) => setTotalTrips(res.data.totalTrips ?? null))
        .catch(() => {});
    }, [])
  );

  const proBadge = isLoading || user?.isPremium ? undefined : "PRO";
  const workType = user?.workType ?? "gig";
  const isGigDriver = (workType === "gig" || workType === "both") && !isCompanyDriver;
  const isEmployee = workType === "employee" || workType === "both";

  const showCardRows = totalTrips === 0 || cardShown === false;

  const go = (route: string) => () => router.push(route as never);

  return (
    <View style={styles.container}>
      <AppHeader title="Tax" showBack={isPersonal} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {totalTrips === 0 ? (
          <EmptyState
            icon="calculator-outline"
            title="Nothing to claim yet"
            description="Mark work trips as Business and your mileage claim builds up here."
            size="card"
          />
        ) : (
          <TaxReadinessCard onResolved={setCardShown} />
        )}

        {(showCardRows || isGigDriver) && (
        <SettingsGroup title="YOUR TAX RETURN">
          {showCardRows && (
            <SettingsRow icon="calculator-outline" label="Self Assessment" hint="Your return, box by box" onPress={go("/self-assessment")} />
          )}
          {showCardRows && !isCompanyDriver && (
            <SettingsRow icon="calendar-outline" label="Tax payment plan" hint="What to pay and when" onPress={go("/tax-planner")} />
          )}
          {showCardRows && isGigDriver && (
            <SettingsRow icon="book-outline" label="First Self Assessment?" hint="A plain guide to your first return" onPress={go("/first-tax-return")} />
          )}
          {isGigDriver && (
            <SettingsRow icon="checkbox-outline" label="Ready for 31 January?" hint="A checklist before you file" onPress={go("/sa-checklist")} />
          )}
        </SettingsGroup>
        )}

        <SettingsGroup title="RECORDS">
          <SettingsRow icon="download-outline" label="Tax exports" hint="CSV and PDF for you or your accountant" badge={proBadge} onPress={go("/exports")} />
          <SettingsRow icon="ribbon-outline" label="Mileage certificate" hint="A summary of your miles you can share" badge={proBadge} onPress={go("/mileage-certificate")} />
          {showCardRows && (
            <SettingsRow icon="git-compare-outline" label="Check against HMRC's figures" hint="Compare your records with your tax account" onPress={go("/hmrc-reconciliation")} />
          )}
          <SettingsRow icon="people-outline" label="Your accountant" hint="Let your accountant see your records" badge={proBadge} onPress={go("/accountant")} />
        </SettingsGroup>

        {isEmployee && (
          <SettingsGroup title="CLAIMS">
            <SettingsRow icon="trending-down-outline" label="Mileage Allowance Relief" hint="Claim the gap from your employer's rate" onPress={go("/mileage-relief")} />
          </SettingsGroup>
        )}

        <SettingsGroup title="SETTINGS">
          <SettingsRow icon="briefcase-outline" label="Work & Tax" hint="Work type, mileage rates, tax band" onPress={go("/settings/work-tax")} />
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
});
