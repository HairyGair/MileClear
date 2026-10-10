// Tax tab: the answer first, one next step, then a short steady list.
// Spec: docs/tax-tab-oct2026/SPEC.md (Option 1). Work mode shows it as a tab;
// Personal mode reaches it from More as "Records" and gets a back arrow.
//
// Everything the cards show comes from one request (useTaxOverview). The rows
// below depend only on the persona, never on whether a card loaded.

import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { formatPence, getTaxYear } from "@mileclear/shared";
import AppHeader from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ReturnCard } from "../../components/tax/ReturnCard";
import { ThisYearCard } from "../../components/tax/ThisYearCard";
import { ReliefCard } from "../../components/tax/ReliefCard";
import { CompanyCard } from "../../components/tax/CompanyCard";
import { RecordsCard } from "../../components/tax/RecordsCard";
import { taxCard } from "../../components/tax/cardStyles";
import { useTaxOverview } from "../../lib/tax/useTaxOverview";
import { useMarRelief } from "../../lib/mileageRelief/useMarRelief";
import { updateTaxPlannerSettings } from "../../lib/api/taxPlanner";
import {
  resolvePersona,
  returnCardMode,
  rowGroups,
  showProBadge,
  type Persona,
} from "../../lib/tax/persona";
import { useUser } from "../../lib/user/context";
import { useMode } from "../../lib/mode/context";
import { colors, fonts, heroCard, spacing } from "../../lib/theme";

function staleTime(updatedAt: number): string {
  const d = new Date(updatedAt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function SectionError() {
  return (
    <View style={taxCard.plain}>
      <Text style={taxCard.body}>Couldn't load this part. Pull down to try again.</Text>
    </View>
  );
}

export default function TaxScreen() {
  const router = useRouter();
  const { user, isCompanyDriver, isLoading: userLoading } = useUser();
  const { isPersonal, setMode } = useMode();
  const { data, loading, error, updatedAt, refresh } = useTaxOverview();
  const [refreshing, setRefreshing] = useState(false);
  const { prefs, results, totalReliefPence } = useMarRelief(data?.relief ?? null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh({ fresh: true });
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const persona: Persona = resolvePersona({
    isPersonal,
    isCompanyDriver,
    workType: user?.workType ?? data?.workType,
  });
  const failed = new Set(data?.failed ?? []);
  const reliefPence = totalReliefPence ?? 0;
  const isPremium = !!user?.isPremium || !!data?.isPremium || isCompanyDriver;
  const proBadge = showProBadge({ userLoading, isPremium }) ? "PRO" : undefined;

  const groups = useMemo(
    () => rowGroups(persona, { isPremium, reliefPence, formatPence }),
    [persona, isPremium, reliefPence],
  );

  const go = (route: string) => () => router.push(route as never);
  const currentTaxYear = data?.claim?.taxYear ?? data?.thisYear?.taxYear ?? getTaxYear(new Date());

  const startedThisYear = useCallback(async () => {
    try {
      await updateTaxPlannerSettings({ firstSelfEmployedTaxYear: currentTaxYear });
    } catch {
      // The card stays as it is; pulling down tries again.
    }
    await refresh({ fresh: true });
  }, [currentTaxYear, refresh]);

  // ── Lead and second cards ────────────────────────────────────────

  const cards = (() => {
    if (!data) {
      if (loading) {
        return <Skeleton height={160} radius={heroCard.radius} style={{ marginTop: spacing.sm, marginBottom: spacing.md }} />;
      }
      if (error) {
        return (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your tax figures"
            description="Check your connection and pull down to try again."
            size="card"
          />
        );
      }
      return <Skeleton height={160} radius={heroCard.radius} style={{ marginTop: spacing.sm, marginBottom: spacing.md }} />;
    }

    if (!data.hasTrips) {
      return isPersonal ? (
        <EmptyState
          icon="calculator-outline"
          title="No trips yet"
          description="Your trips will show here once you've driven."
          size="card"
        />
      ) : (
        <EmptyState
          icon="calculator-outline"
          title="Nothing to claim yet"
          description="Mark work trips as Business and your mileage builds up here."
          size="card"
        />
      );
    }

    if (persona === "personal") {
      return data.claim && !failed.has("claim") ? (
        <RecordsCard taxYear={data.claim.taxYear} totalMiles={data.claim.totalMiles} />
      ) : (
        <SectionError />
      );
    }

    if (persona === "company") {
      return data.claim && !failed.has("claim") ? (
        <CompanyCard taxYear={data.claim.taxYear} businessMiles={data.claim.businessMiles} />
      ) : (
        <SectionError />
      );
    }

    if (persona === "employee") {
      if (failed.has("relief") || !data.relief) return <SectionError />;
      if (totalReliefPence == null) {
        return <Skeleton height={160} radius={heroCard.radius} style={{ marginTop: spacing.sm, marginBottom: spacing.md }} />;
      }
      const withRelief = results.filter((r) => r.result.reliefPence > 0).map((r) => r.miles.taxYear);
      // Newest first in the data.
      return (
        <ReliefCard
          reliefPence={totalReliefPence}
          firstYear={withRelief.length ? withRelief[withRelief.length - 1] : null}
          lastYear={withRelief.length ? withRelief[0] : null}
          employerRateSet={data.relief.employerMileageRatePence != null}
          scotland={prefs.region === "scotland"}
        />
      );
    }

    // gig and both
    const ret = data.return;
    const mode = returnCardMode(data.lead, ret, data.plan?.firstSelfEmployedTaxYear);
    const returnFailed = failed.has("return");
    const returnCard =
      returnFailed && data.lead === "return" ? (
        <SectionError key="return-error" />
      ) : ret && mode !== "hidden" ? (
        <ReturnCard
          key="return"
          ret={ret}
          mode={mode}
          lead={data.lead === "return"}
          currentTaxYear={currentTaxYear}
          onStartedThisYear={startedThisYear}
        />
      ) : null;
    const thisYearCard = failed.has("thisYear") ? (
      <SectionError key="thisyear-error" />
    ) : data.thisYear ? (
      <ThisYearCard
        key="thisyear"
        thisYear={data.thisYear}
        plan={data.plan}
        lead={data.lead === "this_year" || !returnCard}
        claimPence={data.claim?.claimPence ?? null}
        canAddEarnings
      />
    ) : null;

    return data.lead === "return" ? (
      <>
        {returnCard}
        {thisYearCard}
      </>
    ) : (
      <>
        {thisYearCard}
        {returnCard}
      </>
    );
  })();

  const showStale = !!data && error && updatedAt != null;

  return (
    <View style={styles.container}>
      <AppHeader title={isPersonal ? "Records" : "Tax"} showBack={isPersonal} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
      >
        {showStale && (
          <Text style={styles.stale}>{`Last updated ${staleTime(updatedAt)}. Pull down to refresh.`}</Text>
        )}

        {cards}

        {groups.map((g, gi) => (
          <SettingsGroup key={g.title ?? `g${gi}`} title={g.title}>
            {g.rows.map((r) => (
              <SettingsRow
                key={r.id}
                icon={r.icon as never}
                label={r.label}
                hint={r.hint}
                badge={r.pro ? proBadge : undefined}
                onPress={
                  r.id === "switch_work"
                    ? () => setMode("work")
                    : go(r.route as string)
                }
              />
            ))}
          </SettingsGroup>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  stale: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.text2,
    marginTop: spacing.sm,
  },
});
