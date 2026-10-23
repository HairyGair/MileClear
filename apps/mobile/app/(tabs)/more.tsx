// More (Oct 2026 redesign, direction A "Jobs with live sentences"). Grouped by
// what the driver looks after: car, work, money (or records), progress, tools,
// help and settings. Each row says one live fact, and only the rows that apply
// to this driver show (lib/more/rows.ts). When something is broken, Home's red
// strip sits under the name card; Log out lives at the bottom of Settings.

import { useCallback, useMemo } from "react";
import { Platform, ScrollView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { driveForOf } from "@mileclear/shared";
import AppHeader from "../../components/AppHeader";
import { UserAvatar } from "../../components/avatars/AvatarRegistry";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { StatusLine } from "../../components/home/StatusLine";
import { useUser } from "../../lib/user/context";
import { useMode } from "../../lib/mode/context";
import { useAssistantAvailable } from "../../lib/api/assistant";
import { useMoreStatus } from "../../components/settings/useSettingsChecks";
import { useMoreFacts } from "../../components/more/useMoreFacts";
import { useCountryFeatures } from "../../lib/country/country";
import { moreGroups, PRO_ROWS, type MoreRowId } from "../../lib/more/rows";
import {
  badgesLine,
  bankLine,
  bankRoute,
  carsLine,
  earningsLine,
  expensesLine,
  fuelLine,
  insightsLine,
  invoicesLine,
  mainCar,
  odometerLine,
  placesLine,
  planLine,
  roadLine,
  settingsLine,
  shiftsLine,
  workHoursLine,
  type Line,
} from "../../lib/more/sentences";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

interface RowView {
  icon: string;
  label: string;
  line?: Line;
  route: string;
  /** Shows the soft "Pro" chip (free drivers, whole-row Pro features only). */
  pro?: boolean;
}

export default function MoreScreen() {
  const router = useRouter();
  const { user, company, isCompanyDriver, seesCompanyDriverApp: companyApp, isLoading } = useUser();
  const { isWork } = useMode();
  const assistantAvailable = useAssistantAvailable();
  const more = useMoreStatus();
  const country = useCountryFeatures();

  // A paying subscriber should not be advertised features they own, team
  // company drivers get Pro through their team, and the profile is null while
  // loading: treat all three as Pro rather than flash "Pro".
  const isPro = isLoading || !!user?.isPremium || isCompanyDriver;
  const driveFor = driveForOf(user);
  const companyCar = companyApp || driveFor === "company";

  // Facts first need to know which rows could show; employees' money rows show
  // only when they have something there, so those are always read for them.
  const probeGroups = moreGroups({
    driveFor,
    companyApp,
    isWork,
    electric: false,
    hasShifts: true,
    hasEarnings: true,
    hasInvoices: true,
    bankLinked: true,
    assistant: assistantAvailable === true,
    isAdmin: !!user?.isAdmin,
    features: country,
  });
  const want = useMemo(
    () => new Set<MoreRowId>(probeGroups.flatMap((g) => g.rows)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [probeGroups.map((g) => g.rows.join(",")).join("|")]
  );
  const facts = useMoreFacts({ userId: user?.id, isPro, isWork, want });

  const car = mainCar(facts.cars);
  const electric = car?.fuelType === "electric";
  const groups = moreGroups({
    driveFor,
    companyApp,
    isWork,
    electric,
    hasShifts: !!facts.lastShift,
    hasEarnings: (facts.earningsEver ?? 0) > 0,
    hasInvoices: (facts.invoices?.total ?? 0) > 0,
    bankLinked: (facts.bank?.banks.length ?? 0) > 0,
    assistant: assistantAvailable === true,
    isAdmin: !!user?.isAdmin,
    features: country,
  });

  const now = new Date();
  const rows: Record<MoreRowId, RowView> = {
    cars: { icon: "car-outline", label: "Your cars", line: carsLine(facts.cars, now, { companyCar }), route: "/vehicles" },
    fuel: {
      icon: "water-outline",
      label: "Fuel",
      line: {
        text: fuelLine({
          lastFillUpAt: facts.lastFillUpAt,
          // UK station prices only mean something in the UK.
          cheapestPence: country.fuelPrices ? facts.cheapestPence : null,
          electric,
        }),
      },
      route: "/(tabs)/fuel",
    },
    odometer: { icon: "speedometer-outline", label: "Odometer", line: odometerLine(facts.cars), route: "/odometer-log" },
    places: { icon: "location-outline", label: "Saved places", line: { text: placesLine(facts.places) }, route: "/saved-locations" },
    road: { icon: "construct-outline", label: "Road alerts", line: { text: roadLine(facts.road) }, route: "/road-alerts" },
    chargers: { icon: "flash-outline", label: "Chargers near you", line: { text: "Charge points and prices nearby" }, route: "/charging-nearby" },
    shifts: { icon: "time-outline", label: "Shifts", line: { text: shiftsLine(facts.lastShift) }, route: "/shifts" },
    work_hours: { icon: "calendar-outline", label: "Work hours", line: { text: workHoursLine(facts.slots) }, route: "/work-schedule" },
    manager: { icon: "people-outline", label: "Invite your manager", line: { text: "If your employer pays your mileage" }, route: "/nominate-manager" },
    earnings: { icon: "cash-outline", label: "Earnings", line: { text: earningsLine(facts.earnings, now) }, route: "/(tabs)/earnings" },
    expenses: { icon: "receipt-outline", label: "Expenses", line: { text: expensesLine(facts.expenses, now) }, route: "/expenses" },
    invoices: { icon: "document-text-outline", label: "Invoices", line: { text: invoicesLine(facts.invoices) }, route: "/invoices" },
    bank: {
      icon: "business-outline",
      label: "Bank",
      line: { text: bankLine(facts.bank, isPro) },
      route: bankRoute(facts.bank, isPro),
      pro: true,
    },
    records: { icon: "ribbon-outline", label: "Records", line: { text: "Mileage certificate and downloads" }, route: "/(tabs)/tax" },
    downloads: { icon: "download-outline", label: "Downloads", line: { text: "Your trip log as a PDF or spreadsheet" }, route: "/exports" },
    drive_for_work: {
      icon: "briefcase-outline",
      label: "Drive for work?",
      line: { text: "Tell us and the Tax tab appears" },
      route: "/settings/work-tax",
    },
    insights: { icon: "stats-chart-outline", label: "Insights", line: { text: insightsLine(facts.week) }, route: "/(tabs)/insights" },
    badges: { icon: "trophy-outline", label: "Badges", line: { text: badgesLine(facts.badges) }, route: "/achievements" },
    ticket: { icon: "shield-checkmark-outline", label: "Ticket defender", line: { text: "Check a fine against your trips" }, route: "/ticket-defender" },
    emsee: { icon: "chatbubbles-outline", label: "Ask EmSee", line: { text: "Questions about your trips and tax" }, route: "/assistant" },
    settings: {
      icon: "settings-outline",
      label: "Settings",
      line: {
        text: settingsLine({
          problem: !!more.status.problem,
          recordingNote: more.status.recordingNote,
          checking: more.checking,
          pendingUploads: more.pendingCount,
        }),
      },
      route: "/settings",
    },
    help: { icon: "help-circle-outline", label: "Help and how-tos", route: "/help" },
    feedback: { icon: "chatbubble-outline", label: "Tell us about a problem or idea", route: "/feedback" },
    invite: { icon: "gift-outline", label: "Invite a friend, get Pro free", route: "/refer" },
    admin: { icon: "shield-outline", label: "Admin panel", route: "/(tabs)/admin" },
  };

  // Tab screens switch tabs; everything else is pushed on the root stack.
  const go = useCallback(
    (route: string) => () => {
      if (route.startsWith("/(tabs)/")) router.navigate(route as never);
      else router.push(route as never);
    },
    [router]
  );

  const onProblem = useCallback(() => {
    const p = more.status.problem;
    if (!p) return;
    switch (p.tap) {
      case "fix_location":
        void more.fixLocation();
        break;
      case "fix_background_refresh":
      case "fix_notifications":
        more.openPhoneSettings();
        break;
      case "sync_status":
        router.push("/sync-status" as never);
        break;
    }
  }, [more, router]);

  const plan = planLine(facts.plan ?? (user ? { isPremium: !!user.isPremium } : null), {
    teamName: isCompanyDriver ? company?.orgName ?? null : null,
  });
  const name = user ? user.displayName || "Driver" : "Loading...";

  const platform = Platform.OS === "ios" ? "ios" : "android";
  const version = Constants.expoConfig?.version ?? "";
  const build =
    platform === "ios" ? Constants.expoConfig?.ios?.buildNumber : String(Constants.expoConfig?.android?.versionCode ?? "");

  return (
    <View style={styles.container}>
      <AppHeader title="More" hideAvatar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.profileCard}
          onPress={go("/settings")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={user ? `${name}${plan ? `, ${plan}` : ""}. Open settings` : "Open settings"}
        >
          <UserAvatar avatarId={user?.avatarId} name={user?.displayName} email={user?.email} size={44} />
          <View style={styles.profileInfo}>
            <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
              {name}
            </Text>
            {plan ? (
              <Text style={styles.plan} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                {plan}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
        </TouchableOpacity>

        {more.status.problem ? (
          <View style={styles.problem}>
            <StatusLine
              model={more.status.problem.model}
              onPress={onProblem}
              onAction={onProblem}
              hint={more.status.problem.hint}
            />
          </View>
        ) : null}

        {groups.map((g) => (
          <SettingsGroup key={g.title} title={g.title}>
            {g.rows.map((id) => {
              const r = rows[id];
              const pro = !isPro && (PRO_ROWS.includes(id) || r.pro);
              return (
                <SettingsRow
                  key={id}
                  icon={r.icon as never}
                  label={r.label}
                  hint={r.line?.text}
                  hintTone={r.line?.tone}
                  badge={pro ? "Pro" : undefined}
                  onPress={go(r.route)}
                />
              );
            })}
          </SettingsGroup>
        ))}

        {version ? (
          <Text style={styles.version} maxFontSizeMultiplier={fontScaleCap.body}>
            {`Version ${version}${build ? ` (${build})` : ""}`}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: 14,
    minHeight: 72,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  profileInfo: { flex: 1 },
  name: { fontSize: 16, fontFamily: fonts.bold, color: colors.text1 },
  plan: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  problem: { marginTop: spacing.md },
  version: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: spacing.xl,
  },
});
