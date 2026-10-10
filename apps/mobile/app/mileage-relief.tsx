import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import {
  formatPence,
  getTaxYear,
  MAR_GOV_UK_URL,
  MAR_P87_POST_URL,
  P87_MAX_CLAIM_PENCE,
  type MarKindResult,
  type MarYearResult,
  type MileageReliefData,
  type MileageReliefYearMiles,
} from "@mileclear/shared";
import { fetchMileageRelief } from "../lib/api/mileageRelief";
import { useMarRelief } from "../lib/mileageRelief/useMarRelief";
import { usePrompt } from "../components/prompt";
import { colors, fonts, fontScaleCap, radii, spacing } from "../lib/theme";

/**
 * Mileage Allowance Relief for employees (free). Every rule and number is
 * sourced in packages/shared/src/utils/mileageRelief.ts; this screen only
 * shows the result and the workings.
 *
 * The driver's answers here (where they pay tax, whether they file Self
 * Assessment, a corrected employer payment for a year) stay on this phone in
 * tracking_state. A corrected payment never overwrites the employer rate in
 * your tax details.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function longDate(d: { year: number; month: number; day: number }): string {
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}

function miles(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const [whole, frac] = rounded.toFixed(1).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === "0" ? withCommas : `${withCommas}.${frac}`;
}

function yearRange(taxYear: string): string {
  const start = parseInt(taxYear.slice(0, 4), 10);
  return `6 April ${start} to 5 April ${start + 1}`;
}

function kindLabel(kind: MarKindResult["kind"]): string {
  if (kind === "car_van") return "Car or van";
  if (kind === "motorcycle") return "Motorbike";
  return "Bicycle";
}

function parsePounds(raw: string): number | null {
  const cleaned = raw.replace(/[£,\s]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100);
}

function parsePence(raw: string): number | null {
  const cleaned = raw.replace(/[p\s]/gi, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n < 0 || n > 200) return null;
  return n;
}

export default function MileageReliefScreen() {
  const { prompt } = usePrompt();
  const [data, setData] = useState<MileageReliefData | null>(null);
  const { prefs, updatePrefs, results, totalReliefPence, ready } = useMarRelief(data);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchMileageRelief();
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your miles.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totalRelief = totalReliefPence ?? 0;

  const editPaid = useCallback(
    async (y: MileageReliefYearMiles) => {
      if (!data) return;
      const choose = () =>
        new Promise<"rate" | "total" | "reset" | null>((resolve) => {
          const buttons: { text: string; style?: "cancel" | "destructive"; onPress: () => void }[] = [
            { text: "A rate per mile", onPress: () => resolve("rate") },
            { text: "The total I was paid", onPress: () => resolve("total") },
          ];
          if (prefs.overrides[y.taxYear]) {
            buttons.push({ text: "Use my usual rate", onPress: () => resolve("reset") });
          }
          buttons.push({ text: "Cancel", style: "cancel", onPress: () => resolve(null) });
          Alert.alert(
            `What your employer paid in ${y.taxYear}`,
            "Count only mileage payments for business journeys, including any monthly car allowance meant to cover them. Leave out payments for carrying passengers. Your payslips show the amounts. This only changes the figure here, not the rate in your tax details.",
            buttons,
          );
        });

      const pick = await choose();
      if (!pick) return;

      if (pick === "reset") {
        const overrides = { ...prefs.overrides };
        delete overrides[y.taxYear];
        updatePrefs({ ...prefs, overrides });
        return;
      }

      if (pick === "rate") {
        const first = await prompt({
          title: `Pence per mile in ${y.taxYear}`,
          message: "What your employer paid per business mile for the first 10,000 miles of the tax year. Enter 0 if they paid nothing.",
          keyboardType: "number-pad",
          defaultValue: data.employerMileageRatePence != null ? String(data.employerMileageRatePence) : "",
          submitLabel: "Next",
        });
        if (first.action !== "submit") return;
        const firstP = parsePence(first.value);
        if (firstP == null) {
          Alert.alert("Check the rate", "Enter a whole number of pence, for example 25.");
          return;
        }
        let afterP: number | null = null;
        if (y.carVanMiles > 10_000) {
          const after = await prompt({
            title: "After 10,000 miles",
            message: `Pence per mile after 10,000 business miles. Leave blank if it stayed at ${firstP}p.`,
            keyboardType: "number-pad",
            submitLabel: "Save",
          });
          if (after.action === "cancel") return;
          if (after.action === "submit" && after.value.trim()) {
            afterP = parsePence(after.value);
            if (afterP == null) {
              Alert.alert("Check the rate", "Enter a whole number of pence, or leave it blank.");
              return;
            }
          }
        }
        updatePrefs({
          ...prefs,
          overrides: {
            ...prefs.overrides,
            [y.taxYear]: { kind: "rates", carVanFirst10kPence: firstP, carVanAfter10kPence: afterP },
          },
        });
        return;
      }

      // Totals
      let carVanPence = 0;
      let motorcyclePence = 0;
      if (y.carVanMiles > 0 || y.motorcycleMiles === 0) {
        const res = await prompt({
          title: `Total paid in ${y.taxYear}`,
          message: "In pounds, everything your employer paid for business miles in your car or van that tax year.",
          keyboardType: "decimal-pad",
          submitLabel: y.motorcycleMiles > 0 ? "Next" : "Save",
        });
        if (res.action !== "submit") return;
        const p = parsePounds(res.value);
        if (p == null) {
          Alert.alert("Check the amount", "Enter an amount in pounds, for example 1500.");
          return;
        }
        carVanPence = p;
      }
      if (y.motorcycleMiles > 0) {
        const res = await prompt({
          title: "Motorbike total",
          message: "In pounds, everything your employer paid for business miles on your motorbike that tax year.",
          keyboardType: "decimal-pad",
          submitLabel: "Save",
        });
        if (res.action !== "submit") return;
        const p = parsePounds(res.value);
        if (p == null) {
          Alert.alert("Check the amount", "Enter an amount in pounds, for example 300.");
          return;
        }
        motorcyclePence = p;
      }
      updatePrefs({
        ...prefs,
        overrides: {
          ...prefs.overrides,
          [y.taxYear]: { kind: "totals", carVanPence, motorcyclePence, cyclePence: 0 },
        },
      });
    },
    [data, prefs, prompt, updatePrefs],
  );

  if (loading || (data && !ready)) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.amber} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={s.center}>
        <Text style={s.body}>{error ?? "Could not load your miles."}</Text>
        <TouchableOpacity style={s.secondaryBtn} onPress={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
          <Text style={s.secondaryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isEmployee = data.workType === "employee" || data.workType === "both";
  const rateSet = data.employerMileageRatePence != null;
  const currentTaxYear = getTaxYear(new Date());
  const joined = new Date(data.joinedAt);
  const firstTrip = data.firstTripAt ? new Date(data.firstTripAt) : null;
  const recordsFrom = firstTrip && firstTrip < joined ? firstTrip : joined;
  const recordsFromLabel = `${recordsFrom.getDate()} ${MONTHS[recordsFrom.getMonth()]} ${recordsFrom.getFullYear()}`;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
    >
      <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.heading}>Mileage Allowance Relief</Text>
      <Text style={s.body} maxFontSizeMultiplier={fontScaleCap.body}>
        If you use your own vehicle for your job and your employer pays you less per mile than
        the approved mileage rates, you can claim tax relief on the difference. You can claim for
        this tax year and the 4 before it.
      </Text>

      {!isEmployee && (
        <View style={[s.card, s.noteCard]}>
          <Text style={s.cardText}>
            This is for employees who drive their own vehicle for work. Self-employed miles are
            claimed on your Self Assessment instead. If you are also employed, set your work type
            to Employee or Both in your tax details.
          </Text>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.push("/settings/work-tax")}>
            <Text style={s.secondaryBtnText}>Open your tax details</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Your answers */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Your employer rate</Text>
        <Text style={s.cardText}>
          {rateSet
            ? data.employerMileageRatePenceAfter10k != null
              ? `${data.employerMileageRatePence}p a mile for the first 10,000 miles, then ${data.employerMileageRatePenceAfter10k}p.`
              : `${data.employerMileageRatePence}p a mile.`
            : "Not set. The figures below assume your employer paid you nothing for mileage, which is only right if that is true."}
          {" "}If it was different in a year, change it on that year below.
        </Text>
        <TouchableOpacity style={s.linkRow} onPress={() => router.push("/settings/work-tax")}>
          <Text style={s.link}>{rateSet ? "Change your usual rate" : "Set your employer rate"}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.amber} />
        </TouchableOpacity>

        <Text style={[s.cardTitle, s.gapTop]}>Where do you pay Income Tax?</Text>
        <View style={s.pillRow}>
          {([
            { v: "rUK" as const, label: "England, Wales or NI" },
            { v: "scotland" as const, label: "Scotland" },
            { v: null, label: "Not sure" },
          ]).map((o) => (
            <Pill key={o.label} label={o.label} active={prefs.region === o.v} onPress={() => updatePrefs({ ...prefs, region: o.v })} />
          ))}
        </View>

        <Text style={[s.cardTitle, s.gapTop]}>Do you fill in a Self Assessment tax return?</Text>
        <View style={s.pillRow}>
          {([
            { v: true, label: "Yes" },
            { v: false, label: "No" },
            { v: null, label: "Not sure" },
          ]).map((o) => (
            <Pill key={o.label} label={o.label} active={prefs.filesSa === o.v} onPress={() => updatePrefs({ ...prefs, filesSa: o.v })} />
          ))}
        </View>
      </View>

      {totalRelief > 0 && (
        <View style={[s.card, s.heroCard]}>
          <Text style={s.heroLabel}>Relief across the years below</Text>
          <Text style={s.heroValue} maxFontSizeMultiplier={fontScaleCap.display}>{formatPence(totalRelief)}</Text>
          <Text style={s.cardText}>
            This is the amount your taxable pay can be reduced by, not the tax you get back. The
            tax back depends on your tax rate each year, shown on each year.
          </Text>
        </View>
      )}

      {results.map(({ miles: y, result, overridden }) => (
        <YearCard
          key={y.taxYear}
          y={y}
          r={result}
          overridden={overridden}
          isCurrent={y.taxYear === currentTaxYear}
          rateSet={rateSet}
          regionKnown={prefs.region != null}
          filesSaUnknown={prefs.filesSa == null}
          onEditPaid={() => editPaid(y)}
        />
      ))}

      {/* How to claim */}
      <View style={s.card}>
        <Text style={s.cardTitle}>How to claim</Text>
        <Step n={1} text="Check each journey was business travel. Driving between home and your normal workplace is commuting and does not count, unless you were going to a temporary place of work." />
        <Step n={2} text="Keep a mileage log. HMRC asks for the reason for every journey and the postcode where each one started and ended, with a separate log for each employer. Your trips in MileClear show where each one started and ended." />
        <Step n={3} text={`If your job expenses for a year come to ${formatPence(P87_MAX_CLAIM_PENCE)} or less and you do not fill in Self Assessment, claim online or by post on form P87. Over ${formatPence(P87_MAX_CLAIM_PENCE)}, or if you already fill in Self Assessment, claim on your tax return. The ${formatPence(P87_MAX_CLAIM_PENCE)} counts all your job expenses for the year together, not only mileage.`} />
        <Step n={4} text="For this tax year HMRC usually changes your tax code. For earlier years they change your tax code or send a refund." />
        <TouchableOpacity style={s.primaryBtn} onPress={() => WebBrowser.openBrowserAsync(MAR_GOV_UK_URL).catch(() => {})}>
          <Ionicons name="open-outline" size={16} color={colors.bg} />
          <Text style={s.primaryBtnText}>Claim on GOV.UK</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryBtn} onPress={() => WebBrowser.openBrowserAsync(MAR_P87_POST_URL).catch(() => {})}>
          <Text style={s.secondaryBtnText}>Claim by post (form P87)</Text>
        </TouchableOpacity>
      </View>

      {/* What these figures are */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Before you claim</Text>
        <Bullet text="MileClear does not send the claim for you. You claim with HMRC, and HMRC decides what you get." />
        <Bullet text="The miles are the business trips recorded in MileClear. Trips you have not marked as business are not counted." />
        <Bullet text={`Your MileClear records start on ${recordsFromLabel}. Journeys before then are not included. You can add past trips by hand and they will be counted here.`} />
        <Bullet text="It only covers your own vehicle, not a company car." />
        <Bullet text="We count all your business miles against one 10,000 mile limit, as if you had one employer. If you changed jobs during a year and the employers are not connected, each job has its own 10,000 miles, so your relief could be a little higher. HMRC works it out per job." />
        <Bullet text="Payments for carrying work colleagues as passengers are left out. There is no relief for passengers." />
        <Bullet text="The tax you get back cannot be more than the Income Tax you paid that year, and you must have paid tax in the year you claim for." />
      </View>

      <TouchableOpacity
        style={s.secondaryBtn}
        onPress={() => router.push({ pathname: "/trip-form", params: { mode: "manual" } } as never)}
      >
        <Text style={s.secondaryBtnText}>Add a past trip</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function YearCard({
  y,
  r,
  overridden,
  isCurrent,
  rateSet,
  regionKnown,
  filesSaUnknown,
  onEditPaid,
}: {
  y: MileageReliefYearMiles;
  r: MarYearResult;
  overridden: boolean;
  isCurrent: boolean;
  rateSet: boolean;
  regionKnown: boolean;
  filesSaUnknown: boolean;
  onEditPaid: () => void;
}) {
  const noMiles = y.carVanMiles <= 0 && y.motorcycleMiles <= 0;

  return (
    <View style={s.card}>
      <View style={s.yearHead}>
        <Text style={s.yearTitle}>{y.taxYear}{isCurrent ? " (so far)" : ""}</Text>
        {r.reliefPence > 0 && <Text style={s.yearRelief}>{formatPence(r.reliefPence)}</Text>}
      </View>
      <Text style={s.hint}>{yearRange(y.taxYear)} · claim by {longDate(y.claimBy)}</Text>

      {noMiles ? (
        <Text style={[s.cardText, s.gapTop]}>No business miles recorded for this tax year.</Text>
      ) : (
        <>
          {r.kinds.map((k) => (
            <View key={k.kind} style={s.workings}>
              <Text style={s.workLabel}>{kindLabel(k.kind)}: {miles(k.miles)} business miles</Text>
              <WorkLine
                left={`${miles(k.milesAtFirstRate)} mi × ${k.amapFirstRatePence}p`}
                right={formatPence(Math.round(k.milesAtFirstRate * k.amapFirstRatePence))}
              />
              {k.milesAfter10k > 0 && (
                <WorkLine
                  left={`${miles(k.milesAfter10k)} mi × ${k.amapAfter10kRatePence}p`}
                  right={formatPence(Math.round(k.milesAfter10k * k.amapAfter10kRatePence))}
                />
              )}
              <WorkLine left="Approved amount" right={formatPence(k.approvedPence)} strong />
              <WorkLine left="Your employer paid" right={`− ${formatPence(k.paidPence)}`} />
              {k.reliefPence > 0 && <WorkLine left="Relief" right={formatPence(k.reliefPence)} strong accent />}
              {k.taxableExcessPence > 0 && <WorkLine left="Paid over the approved amount" right={formatPence(k.taxableExcessPence)} strong />}
            </View>
          ))}
          <Text style={s.hint}>
            {overridden
              ? "Using what you entered for this year."
              : rateSet
                ? "Employer paid worked out from your usual rate."
                : "Assumes your employer paid nothing."}
            {!r.ratesPublished ? " The approved rates for this year are not published yet, so last year's are used." : ""}
          </Text>
        </>
      )}

      {r.reliefPence > 0 && (
        <View style={s.gapTop}>
          <Text style={s.cardTitle}>Tax you could get back</Text>
          {r.taxBack.length === 0 ? (
            <Text style={s.cardText}>Your tax rate times {formatPence(r.reliefPence)}.</Text>
          ) : (
            r.taxBack.map((tb) => (
              <View key={tb.region} style={s.taxBack}>
                {!regionKnown && (
                  <Text style={s.workLabel}>{tb.region === "rUK" ? "England, Wales or Northern Ireland" : "Scotland"}</Text>
                )}
                {tb.bands.map((b) => (
                  <WorkLine key={b.label} left={`${b.label} (${b.ratePct}%)`} right={`about ${formatPence(b.pence)}`} />
                ))}
              </View>
            ))
          )}
          <Text style={s.hint}>Your rate is the highest rate you pay on your wages that year.</Text>

          <View style={[s.routeBox, s.gapTop]}>
            <Ionicons name="document-text-outline" size={16} color={colors.amber} />
            <Text style={s.routeText}>
              {r.route === "p87"
                ? `Claim online or by post on form P87.${filesSaUnknown ? " If you fill in Self Assessment, claim on your tax return instead." : ""}`
                : r.routeReason === "files_self_assessment"
                  ? "Claim on your Self Assessment tax return, as you already fill one in."
                  : `Over ${formatPence(P87_MAX_CLAIM_PENCE)}, so claim on a Self Assessment tax return.`}
            </Text>
          </View>
        </View>
      )}

      {r.taxableExcessPence > 0 && (
        <Text style={[s.cardText, s.gapTop]}>
          Your employer paid {formatPence(r.taxableExcessPence)} more than the approved amount
          {r.reliefPence > 0 ? " on one kind of vehicle" : ""}. That extra counts as taxable pay
          and your employer normally reports it to HMRC on a P11D. There is nothing to claim on it.
        </Text>
      )}

      {(y.commuteMilesLeftOut > 0 || y.selfEmployedMilesLeftOut > 0 || y.unclassifiedTrips > 0) && (
        <View style={s.gapTop}>
          {y.commuteMilesLeftOut > 0 && (
            <Text style={s.hint}>{miles(y.commuteMilesLeftOut)} business miles tagged as commuting are left out.</Text>
          )}
          {y.selfEmployedMilesLeftOut > 0 && (
            <Text style={s.hint}>
              {miles(y.selfEmployedMilesLeftOut)} miles on trips tagged with a gig platform are left out. Those are
              self-employed and go on your Self Assessment instead.
            </Text>
          )}
          {y.unclassifiedTrips > 0 && (
            <Text style={s.hint}>
              {y.unclassifiedTrips} {y.unclassifiedTrips === 1 ? "trip" : "trips"} ({miles(y.unclassifiedMiles)} mi) not yet
              marked business or personal. Mark the work ones as business to count them.
            </Text>
          )}
        </View>
      )}

      {!noMiles && (
        <TouchableOpacity style={s.linkRow} onPress={onEditPaid}>
          <Text style={s.link}>Change what your employer paid for {y.taxYear}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.amber} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function WorkLine({ left, right, strong, accent }: { left: string; right: string; strong?: boolean; accent?: boolean }) {
  return (
    <View style={s.workLine}>
      <Text style={[s.workLeft, strong && s.workStrong]}>{left}</Text>
      <Text style={[s.workRight, strong && s.workStrong, accent && s.accent]}>{right}</Text>
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.pill, active && s.pillActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.pillText, active && s.pillTextActive]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.step}>
      <View style={s.stepNum}><Text style={s.stepNumText}>{n}</Text></View>
      <Text style={[s.cardText, s.flex]}>{text}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={s.step}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={[s.cardText, s.flex]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  flex: { flex: 1 },
  title: { fontSize: 22, fontFamily: fonts.bold, color: colors.text1 },
  body: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
  },
  noteCard: { borderColor: colors.amberGlow },
  heroCard: { borderColor: colors.amberGlow, backgroundColor: colors.amberDim },
  heroLabel: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, textTransform: "uppercase", letterSpacing: 0.6 },
  heroValue: { fontSize: 28, fontFamily: fonts.bold, color: colors.amber, marginVertical: spacing.xs },
  cardTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1, marginBottom: spacing.xs },
  cardText: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, lineHeight: 20 },
  hint: { fontSize: 12, fontFamily: fonts.regular, color: colors.text3, lineHeight: 17, marginTop: spacing.xs },
  gapTop: { marginTop: spacing.md },
  yearHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  yearTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.text1 },
  yearRelief: { fontSize: 18, fontFamily: fonts.bold, color: colors.amber },
  workings: { marginTop: spacing.md, gap: 4 },
  workLabel: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text1, marginBottom: 2 },
  workLine: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  workLeft: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: colors.text2 },
  workRight: { fontSize: 13, fontFamily: fonts.medium, color: colors.text1 },
  workStrong: { fontFamily: fonts.semibold, color: colors.text1 },
  accent: { color: colors.amber },
  taxBack: { gap: 4, marginBottom: spacing.sm },
  routeBox: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.md,
    padding: spacing.md,
  },
  routeText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.text1, lineHeight: 18 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md },
  link: { fontSize: 14, fontFamily: fonts.semibold, color: colors.amber },
  pillRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  pill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  pillActive: { backgroundColor: colors.amberDim, borderColor: colors.amber },
  pillText: { fontSize: 13, fontFamily: fonts.medium, color: colors.text2, textAlign: "center" },
  pillTextActive: { color: colors.amber, fontFamily: fonts.semibold },
  step: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "flex-start" },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumText: { fontSize: 12, fontFamily: fonts.bold, color: colors.amber },
  bulletDot: { fontSize: 14, color: colors.text3, lineHeight: 20, width: 12 },
  primaryBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    paddingVertical: 13,
    marginTop: spacing.lg,
  },
  primaryBtnText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.bg },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
});
