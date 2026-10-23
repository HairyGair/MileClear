// The new Home when no shift is running (Oct 2026, layout A "calm list").
//
// Same order every time, in both modes:
//   header with the Work | Personal pill
//   status line      am I recording?
//   hero figure      my number
//   Start Trip (+ Start Shift for gig and Both drivers in Work mode)
//   Last trip        with a one-tap Business / Personal
//   Odometer         the running reading, once a vehicle has one (15 Oct 2026)
//   up to three door rows into Tax, Insights, Earnings, Badges, Fuel (and
//   Invoices for a driver who made one in the last 90 days)
//   one ask, slim, at the bottom
//
// What shows is decided by the pure rules in lib/home; this file fetches,
// wires taps and lays it out. State that belongs to the dashboard (permissions,
// the shift, the dismissals of its older asks) comes in as props.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { GamificationStats, ShiftScorecard } from "@mileclear/shared";
import AppHeader from "../AppHeader";
import { FadeInStagger } from "../FadeInStagger";
import { AcquisitionSourceCard } from "../AcquisitionSourceCard";
import { UpdateReadingSheet } from "../odometer/UpdateReadingSheet";
import { useIsPremium } from "../PremiumGate";
import { usePaywall } from "../paywall";
import { AskRow, type AskView } from "./AskRow";
import { DoorRows } from "./DoorRows";
import { HeroCard } from "./HeroCard";
import { HomeSheet } from "./HomeSheet";
import { LastTripCard } from "./LastTripCard";
import { ModePill } from "./ModePill";
import { OdometerCard } from "./OdometerCard";
import { TripButtons } from "./TripButtons";
import { DirectionsHomeRows } from "../directions/DirectionsEntry";
import { useHomeData } from "./useHomeData";
import { useHomeOdometer } from "./useHomeOdometer";
import { useLastTrip } from "./useHomeSignals";
import {
  useAcquisitionAsk,
  useAskQuietDay,
  useEmployerAsk,
  useFirstWeekLocal,
  useOdometerAsk,
  useNzBalanceDateAsk,
  usePracticeAsk,
  useShiftAsk,
  useVehicleAskSnooze,
} from "./useAsks";
import { resolveShiftSuggestion } from "../../lib/api/shifts";
import { useMode } from "../../lib/mode/context";
import { useUser } from "../../lib/user/context";
import { useCountryFeatures } from "../../lib/country/country";
import RegimeClaimCard, { hasRegimeClaim } from "../tax/RegimeClaimCard";
import { useDistanceUnit } from "../../lib/units/distanceUnit";
import { insightsCache } from "../../lib/insights/requestCache";
import { stampInsightsLink } from "../../lib/insights/linkParams";
import { selectAsk, proAskLine, type AskId } from "../../lib/home/ask";
import { selectDoorRows } from "../../lib/home/doors";
import { FIRST_WEEK_DAYS, selectFirstWeek } from "../../lib/home/firstWeek";
import { getHiddenDoorRows, setDoorRowHidden, type DoorRowId } from "../../lib/home/doorPrefs";
import { selectHero } from "../../lib/home/hero";
import { selectLastTrip, RECENT_TRIP_MS } from "../../lib/home/lastTrip";
import { homePersona, showsStartShift } from "../../lib/home/persona";
import { describeSuggestion } from "../../lib/home/shiftSuggestion";
import type { StatusLine } from "../../lib/home/statusLine";
import { trackHomeTap } from "../../lib/home/trackHomeTap";
import { requestAskTitle, shortDay } from "../../lib/practice/logic";
import { firstSortHint } from "../../lib/tutorial/rule";
import type { HeroYearFigure } from "../../lib/heroFigure";
import { colors, spacing } from "../../lib/theme";

/** An ask that the dashboard already tracks (it owns the dismissal storage). */
export interface DashboardAsk {
  eligible: boolean;
  dismiss: () => void;
}

interface Props {
  stats: GamificationStats | null;
  previousYear: HeroYearFigure | null;
  status: StatusLine;
  statusElement: ReactElement;
  hasVehicle: boolean;
  starting: boolean;
  onStartShift: () => void;
  onShiftGraded: (scorecard: ShiftScorecard | null) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** A trip was sorted from the Last trip card: re-read the claim behind the hero. */
  onTripClassified: () => void;
  savedPlaces: DashboardAsk & { count: number };
  pro: DashboardAsk;
  referral: DashboardAsk;
  androidBeta: DashboardAsk;
}

const ANDROID_BETA_URL = "https://mileclear.com/updates/mileclear-on-android-closed-beta";

export function HomeIdle(p: Props) {
  const router = useRouter();
  const { mode, isPersonal } = useMode();
  const { user, isCompanyDriver, seesCompanyDriverApp } = useUser();
  const isPremium = useIsPremium();
  const { showPaywall } = usePaywall();
  const { width, fontScale } = useWindowDimensions();
  const { unit } = useDistanceUnit();
  const { ukTax, country } = useCountryFeatures();

  const isWork = mode === "work";
  const persona = homePersona({ isPersonal, isCompanyDriver, workType: user?.workType });
  const totalTrips = p.stats?.totalTrips ?? 0;
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Data ──
  const lastTrip = useLastTrip();
  const data = useHomeData({
    mode,
    persona,
    stats: p.stats,
    isPro: isPremium,
    userId: user?.id,
    refreshKey,
  });

  const heroModel = useMemo(
    () =>
      selectHero({
        persona,
        now: new Date(),
        stats: p.stats
          ? {
              taxYear: p.stats.taxYear,
              deductionPence: p.stats.deductionPence,
              businessMiles: p.stats.businessMiles,
              totalMiles: p.stats.totalMiles,
              totalTrips: p.stats.totalTrips,
            }
          : null,
        previousYear: p.previousYear,
        week: data.week,
        month: data.month,
        unit,
        ukTax,
      }),
    [persona, p.stats, p.previousYear, data.week, data.month, unit, ukTax]
  );
  // Home only draws once the dashboard's first load has finished, so no stats
  // (or no month for Personal) means the request failed, usually no signal.
  // Leave the space empty rather than a skeleton that never resolves.
  const hero =
    heroModel.kind === "loading" && (!p.stats || ((persona === "personal" || !ukTax) && data.monthFailed))
      ? ({ kind: "hidden" } as const)
      : heroModel;

  const personalOnlyDriver = !!p.stats && p.stats.businessMiles <= 0 && p.stats.deductionPence <= 0;
  const lastTripView = useMemo(
    () =>
      selectLastTrip({
        mode,
        personalOnlyDriver,
        trip: lastTrip.trip,
        totalTrips,
        unsortedCount: lastTrip.unsortedCount,
        missedCount: lastTrip.missedCount,
        now: Date.now(),
        unit,
      }),
    [mode, personalOnlyDriver, lastTrip.trip, totalTrips, lastTrip.unsortedCount, lastTrip.missedCount, unit]
  );
  const recentTrip =
    !!lastTrip.trip &&
    Date.now() - new Date(lastTrip.trip.endedAt ?? lastTrip.trip.startedAt).getTime() < RECENT_TRIP_MS;

  // ── Door rows ──
  const [hidden, setHidden] = useState<DoorRowId[]>([]);
  useFocusEffect(
    useCallback(() => {
      getHiddenDoorRows().then(setHidden);
    }, [])
  );
  const doorRows = useMemo(
    () =>
      selectDoorRows({
        mode,
        persona,
        totalTrips,
        usesInvoices: data.usesInvoices,
        hasFuelLogs: data.hasFuelLogs,
        endOfWeek: data.endOfWeek,
        hidden,
        texts: data.texts,
      }),
    [mode, persona, totalTrips, data.usesInvoices, data.hasFuelLogs, data.endOfWeek, hidden, data.texts]
  );
  const hideDoor = useCallback(async (id: DoorRowId) => {
    setHidden(await setDoorRowHidden(id, true));
  }, []);

  // ── Odometer card: both modes, only when a vehicle has a reading ──
  // A new last trip, or the same trip once it uploads, changes the server's figure.
  const odoTripKey = lastTrip.trip ? `${lastTrip.trip.id}|${lastTrip.trip.sync}|${lastTrip.trip.distanceMiles}` : "";
  const odometerRows = useHomeOdometer(!hidden.includes("odometer"), user?.id, refreshKey, odoTripKey);
  const hideOdometer = useCallback(() => {
    hideDoor("odometer");
  }, [hideDoor]);

  // ── The ask ──
  const quiet = useAskQuietDay();
  const acq = useAcquisitionAsk(user?.createdAt);
  const vehicleSnooze = useVehicleAskSnooze();
  const hasBusinessMileage = (p.stats?.deductionPence ?? 0) > 0;
  const odo = useOdometerAsk(isWork, totalTrips);
  const { eligible: nzBalanceDateDue, done: nzBalanceDateDone } = useNzBalanceDateAsk(country);
  const employer = useEmployerAsk({
    isWork,
    // Anyone on the company-driver app (team or "A company car") has an
    // employer arrangement already; do not ask them again.
    isCompanyDriver: seesCompanyDriverApp,
    workType: user?.workType,
    hasBusinessMileage,
  });
  const shiftEligibleDriver = isWork && showsStartShift(persona);
  const shiftAsk = useShiftAsk(shiftEligibleDriver);
  const practice = usePracticeAsk();
  // A new driver's first trips and what they add up to (lib/home/firstWeek.ts).
  const createdMs = user?.createdAt ? Date.parse(user.createdAt) : NaN;
  const youngAccount = Number.isFinite(createdMs) && Date.now() - createdMs < FIRST_WEEK_DAYS * 24 * 60 * 60 * 1000;
  const fwLocal = useFirstWeekLocal(
    youngAccount,
    lastTrip.trip ? `${lastTrip.trip.id}|${lastTrip.trip.classification}|${lastTrip.trip.distanceMiles}` : ""
  );
  const firstWeek = useMemo(
    () =>
      selectFirstWeek({
        persona,
        createdAt: user?.createdAt,
        now: Date.now(),
        local: fwLocal.local,
        doneBefore: fwLocal.done,
        rates: {
          workType: user?.workType,
          employerMileageRatePence: user?.employerMileageRatePence,
          employerMileageRatePenceAfter10k: user?.employerMileageRatePenceAfter10k,
        },
      }),
    [persona, user?.createdAt, user?.workType, user?.employerMileageRatePence, user?.employerMileageRatePenceAfter10k, fwLocal.local, fwLocal.done]
  );
  // Only while the Last trip card is offering the newest (unsorted) trip's
  // Business / Personal: the value line sits right above that choice.
  const firstWeekOnCard =
    ukTax && !!firstWeek && lastTripView.look === "full" && lastTripView.showChoice && lastTripView.choice === "unclassified";
  const [gradingShift, setGradingShift] = useState(false);
  const [acqOpen, setAcqOpen] = useState(false);
  const [odoOpen, setOdoOpen] = useState(false);

  const eligible: Partial<Record<AskId, boolean>> = {
    practice: !!practice.ask,
    // The first-week figure and the employer ask are HMRC mileage claims:
    // UK only (23 Oct 2026).
    first_week: ukTax && firstWeekOnCard && !!firstWeek?.isAsk,
    acquisition: acq.eligible,
    vehicle: !p.hasVehicle && !vehicleSnooze.snoozed,
    odometer: !!odo.vehicle,
    nz_balance_date: nzBalanceDateDue,
    employer: ukTax && employer.eligible,
    shift: shiftEligibleDriver && !!shiftAsk.suggestion,
    saved_places: p.savedPlaces.eligible,
    pro: p.pro.eligible,
    referral: p.referral.eligible,
    android_beta: p.androidBeta.eligible,
  };
  const askId = selectAsk({ statusRed: p.status.red, quietToday: quiet.quietToday, eligible });

  const askView: AskView | null = useMemo(() => {
    if (!askId) return null;
    const press = (fn: () => void) => () => {
      trackHomeTap(`ask_${askId}`, mode, p.status.kind);
      fn();
    };
    const dismiss = (extra?: () => void) => () => {
      trackHomeTap(`ask_dismiss_${askId}`, mode, p.status.kind);
      extra?.();
      quiet.markDismissedToday();
    };
    switch (askId) {
      // Drawn on the Last trip card (firstWeek prop), not as an ask row.
      case "first_week":
        return null;
      case "practice": {
        const a = practice.ask!;
        if (a.kind === "consent") {
          return {
            id: askId, icon: "people-outline", title: `${a.link.practice.name} would like to see your records`,
            line: "Nothing is shared unless you say yes.", dismissLabel: "Not now, ask me tomorrow",
            onPress: press(() => router.push(`/practice-consent?linkId=${a.link.id}` as never)), onDismiss: dismiss(),
          };
        }
        if (a.kind === "renewal") {
          return {
            id: askId, icon: "refresh-outline", title: `Keep sharing with ${a.link.practice.name}?`,
            line: `Sharing ends on ${shortDay(a.link.endsAt)}.`, dismissLabel: "Not now, ask me tomorrow",
            onPress: press(() => router.push("/accountant" as never)), onDismiss: dismiss(),
          };
        }
        const r = a.request;
        return {
          id: askId, icon: "document-text-outline", title: requestAskTitle(r),
          line: r.dueDate ? `Due ${shortDay(r.dueDate)}` : "Tap to see what they need.",
          dismissLabel: "Not now, ask me tomorrow",
          onPress: press(() => router.push("/accountant" as never)), onDismiss: dismiss(),
        };
      }
      case "acquisition":
        return {
          id: askId, icon: "chatbubble-ellipses-outline", title: "Where did you hear about MileClear?",
          line: "One tap. It helps us a lot.", dismissLabel: "Not now, ask me tomorrow",
          onPress: press(() => setAcqOpen(true)), onDismiss: dismiss(),
        };
      case "vehicle":
        return {
          id: askId, icon: "car-outline", title: "Add your vehicle",
          line: isWork ? "So your mileage uses the right rate." : "Track which car you drive and its fuel costs.",
          dismissLabel: "Dismiss, ask me later",
          onPress: press(() => router.push("/vehicle-form" as never)),
          onDismiss: dismiss(vehicleSnooze.snooze),
        };
      case "odometer":
        return {
          id: askId, icon: "speedometer-outline", title: "Add an odometer reading",
          line: "Once is enough. We add your trips to it.", dismissLabel: "Not now",
          onPress: press(() => setOdoOpen(true)), onDismiss: dismiss(odo.dismiss),
        };
      case "nz_balance_date":
        return {
          id: askId, icon: "speedometer-outline", title: "Note each car's odometer for 31 March",
          line: "IRD asks for it every year.", dismissLabel: "Not now",
          onPress: press(() => {
            nzBalanceDateDone();
            router.push("/vehicles" as never);
          }),
          onDismiss: dismiss(nzBalanceDateDone),
        };
      case "employer":
        return {
          id: askId, icon: "briefcase-outline", title: "Does your employer pay your mileage?",
          line: "Invite your manager to approve it each month.", dismissLabel: "No, dismiss this",
          onPress: press(() => router.push("/nominate-manager" as never)), onDismiss: dismiss(employer.decline),
        };
      case "shift": {
        const s = shiftAsk.suggestion!;
        return {
          id: askId, icon: "time-outline", title: "Looks like a shift. Grade it",
          line: describeSuggestion(s), dismissLabel: "Not a shift", busy: gradingShift,
          onPress: press(async () => {
            if (gradingShift) return;
            setGradingShift(true);
            try {
              const res = await resolveShiftSuggestion(s.id, "accept");
              shiftAsk.remove(s.id);
              if (!res.skipped) p.onShiftGraded(res.scorecard ?? null);
            } catch {
              shiftAsk.reload();
            } finally {
              setGradingShift(false);
            }
          }),
          onDismiss: dismiss(() => {
            shiftAsk.remove(s.id);
            resolveShiftSuggestion(s.id, "dismiss").catch(() => shiftAsk.reload());
          }),
        };
      }
      case "saved_places":
        return {
          id: askId, icon: "sparkles-outline", title: "Save places you visit often",
          line: `${p.savedPlaces.count} spotted in your recent trips. Name them once.`,
          dismissLabel: "Dismiss, ask me later",
          onPress: press(() => router.push("/saved-locations-suggest" as never)),
          onDismiss: dismiss(p.savedPlaces.dismiss),
        };
      case "pro":
        return {
          id: askId, icon: "star-outline", title: "Upgrade to Pro", amberWord: "Pro",
          line: proAskLine(Date.now()), dismissLabel: "Dismiss, ask me later",
          onPress: press(() => showPaywall("dashboard_nudge")), onDismiss: dismiss(p.pro.dismiss),
        };
      case "referral":
        return {
          id: askId, icon: "gift-outline", title: "Invite a friend, get Pro free",
          line: "A free month for each friend who joins and takes a trip (up to 3).",
          dismissLabel: "Dismiss, ask me later",
          onPress: press(() => router.push("/refer" as never)), onDismiss: dismiss(p.referral.dismiss),
        };
      case "android_beta":
        return {
          id: askId, icon: "megaphone-outline", title: "MileClear is on Android",
          line: "In closed testing. Know an Android driver? Testers get Pro free.",
          dismissLabel: "Dismiss",
          onPress: press(() => { Linking.openURL(ANDROID_BETA_URL).catch(() => {}); }),
          onDismiss: dismiss(p.androidBeta.dismiss),
        };
    }
  }, [askId, mode, p, isWork, router, quiet, vehicleSnooze, odo, employer, shiftAsk, gradingShift, showPaywall, practice.ask, nzBalanceDateDone]);

  // ── Layout ──
  const narrow = width < 380 || fontScale > 1.3;
  // A trip on this phone counts too, so a driver who opens Home with no signal
  // (stats not loaded) can still start a shift.
  const showShift =
    isWork && showsStartShift(persona, p.stats?.totalShifts ?? 0) && (totalTrips > 0 || !!lastTrip.trip);

  const refresh = useCallback(() => {
    insightsCache.invalidate();
    setRefreshKey((n) => n + 1);
    lastTrip.reload();
    p.onRefresh();
  }, [lastTrip, p]);

  // After a Business / Personal tap: the card, the week line and the claim.
  const onTripChanged = useCallback(() => {
    lastTrip.reload();
    insightsCache.invalidate();
    setRefreshKey((n) => n + 1);
    p.onTripClassified();
  }, [lastTrip, p]);

  // When the "where did you hear" sheet closes, check again: an answer or a
  // skip means the ask is gone for good.
  const acqWasOpen = useRef(false);
  useEffect(() => {
    if (acqOpen) {
      acqWasOpen.current = true;
    } else if (acqWasOpen.current) {
      acqWasOpen.current = false;
      acq.recheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acqOpen]);

  const heroShown = hero.kind !== "hidden";
  let stagger = 0;

  return (
    <>
      <AppHeader right={narrow ? undefined : <ModePill onChange={(m) => trackHomeTap("mode_pill", m, p.status.kind)} />} />
      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={refresh} tintColor={colors.amber} />}
      >
        {narrow ? (
          <View style={{ marginBottom: spacing.md }}>
            <ModePill variant="row" onChange={(m) => trackHomeTap("mode_pill", m, p.status.kind)} />
          </View>
        ) : null}

        <FadeInStagger index={stagger++} delayPer={40}>
          <View>{p.statusElement}</View>
        </FadeInStagger>

        {heroShown ? (
          <FadeInStagger index={stagger++} delayPer={40}>
            <View style={s.afterStatus}>
              <HeroCard
                model={hero}
                recentTrip={recentTrip}
                onPress={() => {
                  trackHomeTap("hero", mode, p.status.kind);
                  if (hero.kind !== "figure") return;
                  if (hero.target === "insights_month") router.navigate(stampInsightsLink("/insights?period=month") as never);
                  else router.navigate("/(tabs)/tax" as never);
                }}
              />
            </View>
          </FadeInStagger>
        ) : null}

        {/* Outside the UK, Work: the claim under the country's own rules (NZ first). Renders nothing for the UK. */}
        {isWork && !ukTax && !isCompanyDriver && hasRegimeClaim(country) ? (
          <FadeInStagger index={stagger++} delayPer={40}>
            <View style={s.afterHero}>
              <RegimeClaimCard refreshToken={refreshKey} />
            </View>
          </FadeInStagger>
        ) : null}

        <FadeInStagger index={stagger++} delayPer={40}>
          <View style={heroShown ? s.afterHero : s.afterStatus}>
            <DirectionsHomeRows placement="resume" />
            <TripButtons
              showShift={showShift}
              starting={p.starting}
              onStartTrip={() => {
                trackHomeTap("start_trip", mode, p.status.kind);
                router.push("/trip-form" as never);
              }}
              onStartShift={() => {
                trackHomeTap("start_shift", mode, p.status.kind);
                p.onStartShift();
              }}
            />
            <DirectionsHomeRows placement="where" />
          </View>
        </FadeInStagger>

        {lastTripView.look !== "none" ? (
          <FadeInStagger index={stagger++} delayPer={40}>
            <View style={s.group}>
              <LastTripCard
                view={lastTripView}
                mode={mode}
                state={p.status.kind}
                onChanged={onTripChanged}
                firstSortHint={totalTrips <= 1 ? firstSortHint(persona) : null}
                firstWeek={
                  firstWeekOnCard && firstWeek && (firstWeek.isAsk ? askId === "first_week" : true)
                    ? firstWeek
                    : null
                }
              />
            </View>
          </FadeInStagger>
        ) : null}

        {odometerRows.length > 0 ? (
          <FadeInStagger index={stagger++} delayPer={40}>
            <View style={s.group}>
              <OdometerCard rows={odometerRows} mode={mode} state={p.status.kind} onHide={hideOdometer} />
            </View>
          </FadeInStagger>
        ) : null}

        {doorRows.length > 0 ? (
          <FadeInStagger index={stagger++} delayPer={40}>
            <View style={s.group}>
              <DoorRows rows={doorRows} mode={mode} state={p.status.kind} onHide={hideDoor} />
            </View>
          </FadeInStagger>
        ) : null}

        {askView ? (
          <View style={s.group}>
            <AskRow ask={askView} />
          </View>
        ) : null}
      </ScrollView>

      <HomeSheet visible={acqOpen} title="Quick question" onClose={() => setAcqOpen(false)}>
        <AcquisitionSourceCard assumeEligible onFinished={() => setAcqOpen(false)} />
      </HomeSheet>
      {odo.vehicle ? (
        <UpdateReadingSheet
          visible={odoOpen}
          vehicle={odo.vehicle}
          onClose={() => setOdoOpen(false)}
          onSaved={() => {
            setOdoOpen(false);
            odo.dismiss();
          }}
          onSeeReadings={() => router.push(`/odometer-log?view=readings&vehicleId=${odo.vehicle!.id}` as never)}
        />
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: spacing.xxxl },
  afterStatus: { marginTop: spacing.md },
  afterHero: { marginTop: spacing.lg },
  group: { marginTop: spacing.xl },
});
