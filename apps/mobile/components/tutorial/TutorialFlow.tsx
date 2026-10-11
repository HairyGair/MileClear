// The first-run tour (Oct 2026, direction A "Set up and go",
// docs/tutorial-oct2026/PROPOSALS.md). Full-screen Stack route, never a modal
// over Home (build 67 froze on exactly that).
//
//   1 How it works   2 You drive for (+ employer's rate)
//   3 Location (+ not Always, + Start Trip only)   4 Check   5 Your app
//
// The first run (app/welcome.tsx) does all five. A replay from Help or the
// What's new sheet (app/tour.tsx) shows the teaching steps, plus the check
// only when something on the phone still needs the driver. Skip is on every
// step but the last, and leaves the tour.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import {
  DRIVE_FOR_OPTIONS,
  driveForOf,
  getHmrcRatesForTaxYear,
  getTaxYear,
  type DriveFor,
} from "@mileclear/shared";
import { useUser } from "../../lib/user/context";
import { useMode } from "../../lib/mode/context";
import { useReducedMotion } from "../../lib/accessibility";
import { usePhoneState, recordingMessages } from "../settings/useSettingsChecks";
import { StatusLine } from "../home/StatusLine";
import { MiniRoute } from "../home/MiniRoute";
import { selectStatusLine } from "../../lib/home/statusLine";
import { getLocationPermissionStatus, requestOrFixBackgroundLocation } from "../../lib/permissions/location";
import { registerForPushNotifications } from "../../lib/notifications";
import { registerPushToken } from "../../lib/api/notifications";
import { fetchVehicles } from "../../lib/api/vehicles";
import { trackTutorial } from "../../lib/events/tutorial";
import {
  appPlaces,
  dotStep,
  modePillLine,
  parseEmployerRate,
  proLine,
  setUpForText,
  tourCheckRows,
  tourSteps,
  type AppPlace,
  type CheckFix,
  type LocationTier,
  type StepId,
  type TourSource,
} from "../../lib/tutorial/rule";
import {
  markLocationAsked,
  markNotificationsAsked,
  markWorkExplainerSeen,
  notifyFirstRunFinished,
  readFirstRunStored,
  readLocalOwnerId,
  saveDriveFor,
  writeFirstRunStored,
} from "../../lib/tutorial/state";
import { Body, Box, IconBadge, LinkButton, PrimaryButton, TickLine, Tick, Title, TopBar, parts } from "./TutorialParts";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

const ios = Platform.OS === "ios";
const PRIVACY_URL = "https://mileclear.com/privacy";

const PLACE_ICONS: Record<AppPlace["id"], keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  trips: "car-outline",
  tax: "document-text-outline",
  insights: "stats-chart-outline",
  more: "ellipsis-horizontal-circle-outline",
};

// A gentle S for the "How it works" drawing, in made-up coordinates.
const DEMO_ROUTE = Array.from({ length: 24 }, (_, i) => {
  const t = i / 23;
  return { lat: t, lng: t + 0.18 * Math.sin(t * Math.PI * 2) };
});

type LocationChoice = "allow" | "settings" | "start_trip_only" | "skip";

export function TutorialFlow({ source }: { source: TourSource }) {
  const router = useRouter();
  const { user, refreshUser, isCompanyDriver } = useUser();
  const { setMode } = useMode();
  const reduced = useReducedMotion();
  const phone = usePhoneState();
  const refreshPhone = phone.refresh;
  const firstRun = source === "auto";

  // ── Steps ──
  // A replay decides its steps once, from the phone as it is when it opens.
  const [steps, setSteps] = useState<StepId[] | null>(firstRun ? tourSteps("auto", null) : null);
  useEffect(() => {
    if (steps || !phone.loaded) return;
    setSteps(
      tourSteps(source, {
        tier: phone.tier,
        motion: phone.motion,
        bgRefreshOff: phone.bgRefreshOff,
        notifications: phone.notifications,
      })
    );
  }, [steps, phone.loaded, phone.tier, phone.motion, phone.bgRefreshOff, phone.notifications, source]);

  const [step, setStep] = useState<StepId>("how");
  const history = useRef<StepId[]>([]);
  const startedAt = useRef(Date.now());
  const enteredAt = useRef(Date.now());

  // ── Answers ──
  const [answer, setAnswer] = useState<DriveFor | null>(null);
  const [motorbike, setMotorbike] = useState(false);
  const [rateText, setRateText] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  const [savedDriveFor, setSavedDriveFor] = useState(false);
  const [startTripOnly, setStartTripOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const locationBefore = useRef<LocationTier | null>(null);
  const locationReported = useRef(false);

  // A replay's wording follows what the account already says.
  const driveFor: DriveFor = answer ?? driveForOf(user);
  const [replayMotorbike, setReplayMotorbike] = useState(false);
  useEffect(() => {
    if (firstRun) return;
    fetchVehicles()
      .then((res) => {
        const primary = res.data.find((v) => v.isPrimary) ?? res.data[0];
        setReplayMotorbike(primary?.vehicleType === "motorbike");
      })
      .catch(() => {});
  }, [firstRun]);

  // ── Started ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cohort: "new" | "existing" = source === "whats_new" ? "existing" : "new";
      if (source === "help" && user) {
        cohort = (await readFirstRunStored(user.id)) === "existing" ? "existing" : "new";
      }
      if (!cancelled) trackTutorial("tutorial.started", { direction: "A", source, cohort });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // Once per tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cross-fade between screens (none with Reduce Motion) ──
  const fade = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (reduced) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [step, reduced, fade]);

  const dots = useMemo(() => steps ?? [], [steps]);
  const dotIndex = Math.max(0, dots.indexOf(dotStep(step)));
  const isLast = dots.length > 0 && dotStep(step) === dots[dots.length - 1];

  const go = useCallback(
    (next: StepId) => {
      trackTutorial("tutorial.step", { stepId: step, index: dotIndex, ms: Date.now() - enteredAt.current });
      history.current.push(step);
      enteredAt.current = Date.now();
      setStep(next);
    },
    [step, dotIndex]
  );

  /** The next dotted step after the current dot. */
  const nextDot = useCallback((): StepId => {
    const i = dots.indexOf(dotStep(step));
    return dots[Math.min(i + 1, dots.length - 1)] ?? "your_app";
  }, [dots, step]);

  const back = useCallback(() => {
    const prev = history.current.pop();
    if (prev) {
      enteredAt.current = Date.now();
      setStep(prev);
    }
  }, []);

  // ── Saving You drive for ──
  const saveAnswer = useCallback(
    (withRate: number | null) => {
      if (!answer || savedDriveFor) return;
      setSavedDriveFor(true);
      // Just me is Personal mode; every other answer starts in Work mode.
      setMode(answer === "personal" ? "personal" : "work");
      (async () => {
        const userId = user?.id ?? (await readLocalOwnerId());
        if (!userId) return;
        await saveDriveFor({
          userId,
          answer,
          motorbike: motorbike && answer !== "personal" && answer !== "company",
          employerRatePence: withRate,
          currentDashboardMode: user?.dashboardMode,
        });
        await refreshUser();
      })().catch(() => {});
    },
    [answer, user, savedDriveFor, motorbike, setMode, refreshUser]
  );

  const reportLocation = useCallback((choice: LocationChoice, after: LocationTier) => {
    if (locationReported.current) return;
    locationReported.current = true;
    trackTutorial("tutorial.location_result", { before: locationBefore.current, after, choice });
  }, []);

  // ── Leaving ──
  const finish = useCallback(
    async (how: "done" | "skipped") => {
      const userId = firstRun ? user?.id ?? (await readLocalOwnerId()) : null;
      if (userId) {
        await writeFirstRunStored(userId, how);
        // The last screen covered Work and Personal; Home needn't pop it up too.
        if (how === "done") await markWorkExplainerSeen();
      }
      if (firstRun) {
        // Tell the root layout first, or Home is redirected back here.
        notifyFirstRunFinished();
        router.replace("/(tabs)/dashboard" as never);
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)/dashboard" as never);
      }
    },
    [firstRun, user, router]
  );

  const skip = useCallback(() => {
    trackTutorial("tutorial.skipped", { stepId: step, index: dotIndex });
    if (step === "employer_rate") saveAnswer(null);
    if (step === "location" || step === "not_always") {
      getLocationPermissionStatus()
        .then((st) => reportLocation("skip", st.tier))
        .catch(() => reportLocation("skip", locationBefore.current ?? "none"));
    }
    finish("skipped").catch(() => {});
  }, [step, dotIndex, saveAnswer, reportLocation, finish]);

  const complete = useCallback(async () => {
    trackTutorial("tutorial.step", { stepId: step, index: dotIndex, ms: Date.now() - enteredAt.current });
    let tier: LocationTier = phone.tier;
    try {
      tier = (await getLocationPermissionStatus()).tier;
    } catch {}
    trackTutorial("tutorial.completed", {
      ms: Date.now() - startedAt.current,
      tier,
      driveFor,
      autoTrips: !startTripOnly && !phone.automaticOff,
    });
    await finish("done");
  }, [step, dotIndex, phone.tier, phone.automaticOff, driveFor, startTripOnly, finish]);

  // ── Location ──
  const startRecordingEngine = () => {
    import("../../lib/tracking/detection")
      .then((m) => m.startDriveDetection())
      .catch(() => {});
  };

  const allowLocation = useCallback(async () => {
    setBusy(true);
    try {
      const before = await getLocationPermissionStatus().catch(() => null);
      locationBefore.current = before?.tier ?? "none";
      // Our own screen explains the Settings route, so no system Alert on top.
      const final = await requestOrFixBackgroundLocation({ showSettingsAlert: false });
      await markLocationAsked();
      // Android asks for Physical activity on the same screen, straight after.
      if (!ios && final.tier !== "none") {
        const m = await import("../../lib/tracking/motionPermission");
        if ((await m.getMotionPermission()) === "undetermined") await m.requestMotionPermission();
      }
      refreshPhone();
      if (final.tier === "always") {
        reportLocation("allow", "always");
        startRecordingEngine();
        go("check");
      } else {
        go("not_always");
      }
    } catch {
      go("not_always");
    } finally {
      setBusy(false);
    }
  }, [go, refreshPhone, reportLocation]);

  // Back from the phone's Settings with Always on: move on by itself.
  useEffect(() => {
    if (step !== "not_always") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      getLocationPermissionStatus()
        .then((st) => {
          refreshPhone();
          if (st.tier === "always") {
            reportLocation("settings", "always");
            startRecordingEngine();
            go("check");
          }
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [step, go, refreshPhone, reportLocation]);

  const chooseStartTripOnly = useCallback(async () => {
    setBusy(true);
    try {
      if (locationBefore.current === null) {
        locationBefore.current = (await getLocationPermissionStatus().catch(() => null))?.tier ?? "none";
      }
      // Off on purpose, so Home says the true thing: "Automatic trips off.
      // Only Start Trip records" (PROPOSALS 0.5).
      const { setAutomaticTrips } = await import("../../lib/tracking/automaticTrips");
      await setAutomaticTrips(false);
      await markLocationAsked();
      const now = await getLocationPermissionStatus().catch(() => null);
      reportLocation("start_trip_only", now?.tier ?? "none");
      setStartTripOnly(true);
      refreshPhone();
      go("start_trip_only");
    } finally {
      setBusy(false);
    }
  }, [go, refreshPhone, reportLocation]);

  // ── Check ──
  const runFix = useCallback(
    async (fix: CheckFix) => {
      switch (fix) {
        case "location": {
          const final = await requestOrFixBackgroundLocation().catch(() => null);
          if (final?.tier === "always") startRecordingEngine();
          break;
        }
        case "motion": {
          const m = await import("../../lib/tracking/motionPermission");
          await m.requestMotionPermission().catch(() => {});
          break;
        }
        case "settings":
          Linking.openSettings().catch(() => {});
          break;
        case "notifications": {
          await markNotificationsAsked();
          // Register the token now, not on the next cold start, so the first
          // "trip saved" reaches this phone.
          const token = await registerForPushNotifications().catch(() => null);
          if (token) await registerPushToken(token).catch(() => {});
          break;
        }
      }
      refreshPhone();
    },
    [refreshPhone]
  );

  // ── Render ──
  const rates = useMemo(() => {
    const r = getHmrcRatesForTaxYear(getTaxYear(new Date()));
    return { first: r.car.first10000, after: r.car.after10000, motorbike: r.motorbike.flat };
  }, []);

  if (!steps) {
    return <SafeAreaView style={s.root} edges={["top", "bottom"]} />;
  }

  let content: ReactNode;
  let footer: ReactNode;

  switch (step) {
    case "how": {
      content = (
        <>
          <View style={s.drawing} accessible={false}>
            <View style={[s.chip, s.chipAmber]}>
              <Text style={s.chipAmberText} maxFontSizeMultiplier={fontScaleCap.body}>Starts at 15 mph</Text>
            </View>
            <MiniRoute route={DEMO_ROUTE} start={DEMO_ROUTE[0]} end={DEMO_ROUTE[DEMO_ROUTE.length - 1]} size={170} dashed={false} />
            <View style={[s.chip, s.chipEnd]}>
              <Text style={s.chipText} maxFontSizeMultiplier={fontScaleCap.body}>Stops when parked</Text>
            </View>
          </View>
          <Title>MileClear records your drives by itself</Title>
          <Body>
            You don't need to open the app or press anything. Drive as normal and each trip appears on Home when you
            stop.
          </Body>
          <TickLine title="Leave your phone in your pocket or cradle" hint="It works with the app closed." />
          <TickLine title="A stop of 4 minutes or more ends a trip" hint="A shop stop gives you two trips. Nothing is lost." />
          <TickLine title="You sort each trip" hint="Business or Personal, one tap." />
        </>
      );
      footer = <PrimaryButton title="Next" onPress={() => go(nextDot())} />;
      break;
    }

    case "drive_for": {
      const showVehicle = answer !== "personal" && answer !== "company";
      content = (
        <>
          <Title>What do you drive for?</Title>
          <Body>We set up the app around your answer. You can change it later in Settings.</Body>
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }} accessibilityRole="radiogroup">
            {DRIVE_FOR_OPTIONS.map((opt) => {
              const on = answer === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setAnswer(opt.value)}
                  style={[s.option, on && s.optionOn]}
                  accessibilityRole="radio"
                  accessibilityLabel={`${opt.label}. ${opt.hint}`}
                  accessibilityState={{ selected: on, checked: on }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.optionTitle} maxFontSizeMultiplier={fontScaleCap.body}>{opt.label}</Text>
                    <Text style={s.optionHint} maxFontSizeMultiplier={fontScaleCap.body}>{opt.hint}</Text>
                  </View>
                  <View style={[s.radio, on && s.radioOn]} accessible={false}>
                    {on ? <View style={s.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {showVehicle ? (
            <>
              <Text style={parts.sectionLabel} maxFontSizeMultiplier={fontScaleCap.heading}>You drive a</Text>
              <View style={s.segment} accessibilityRole="radiogroup" accessibilityLabel="You drive a">
                {([false, true] as const).map((bike) => {
                  const on = motorbike === bike;
                  const label = bike ? "Motorbike" : "Car or van";
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setMotorbike(bike)}
                      style={[s.segmentHalf, on && s.segmentOn]}
                      accessibilityRole="radio"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: on, checked: on }}
                    >
                      <Text style={[s.segmentText, on && s.segmentTextOn]} maxFontSizeMultiplier={fontScaleCap.body}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {motorbike ? (
                <Text style={[parts.small, { marginTop: spacing.sm }]} maxFontSizeMultiplier={fontScaleCap.body}>
                  Motorbikes claim {rates.motorbike}p a mile. We add a motorbike to your account, and you can fill in its
                  details later in More &gt; Vehicles.
                </Text>
              ) : null}
            </>
          ) : null}
        </>
      );
      footer = (
        <PrimaryButton
          title="Next"
          disabled={!answer}
          hint={answer ? undefined : "Choose an answer first"}
          onPress={() => {
            if (!answer) return;
            trackTutorial("tutorial.drive_for", { answer, vehicle: showVehicle && motorbike ? "motorbike" : "car_or_van" });
            if (answer === "employee" || answer === "both") {
              go("employer_rate");
            } else {
              saveAnswer(null);
              go(nextDot());
            }
          }}
        />
      );
      break;
    }

    case "employer_rate": {
      const parsed = parseEmployerRate(rateText);
      content = (
        <>
          <Title>What does your employer pay a mile?</Title>
          <Body>
            It's on your payslip or expenses form. If it's under {motorbike ? rates.motorbike : rates.first}p, you can
            claim the rest from HMRC, and MileClear works it out. Not sure? That's fine, you can add it later.
          </Body>
          <View style={s.rateRow}>
            <TextInput
              style={s.rateInput}
              value={rateText}
              onChangeText={(t) => setRateText(t.replace(/[^0-9]/g, "").slice(0, 3))}
              placeholder="45"
              placeholderTextColor={colors.text3}
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Pence a mile your employer pays"
              maxFontSizeMultiplier={fontScaleCap.heading}
            />
            <Text style={s.rateUnit} maxFontSizeMultiplier={fontScaleCap.heading}>p a mile</Text>
          </View>
          {rateText.length > 0 && parsed === null ? (
            <Text style={[parts.small, { color: colors.red, marginTop: spacing.sm }]} maxFontSizeMultiplier={fontScaleCap.body}>
              Enter whole pence, from 1 to 100.
            </Text>
          ) : null}
        </>
      );
      footer = (
        <>
          <PrimaryButton
            title="Next"
            disabled={parsed === null}
            onPress={() => {
              setRate(parsed);
              saveAnswer(parsed);
              go(nextDot());
            }}
          />
          <LinkButton
            title="Not sure"
            onPress={() => {
              saveAnswer(null);
              go(nextDot());
            }}
          />
        </>
      );
      break;
    }

    case "location": {
      content = (
        <>
          <IconBadge name="navigate-outline" />
          <Title center>One setting makes it work</Title>
          <Body center>
            To record drives while the app is closed, MileClear needs your location set to{" "}
            {ios ? "Always" : "Allow all the time"}.
          </Body>
          <Box>
            <Text style={[parts.boxTitle, { textAlign: "center", color: colors.text2 }]} maxFontSizeMultiplier={fontScaleCap.body}>
              {ios ? "Your iPhone will ask twice" : "Your phone will ask a few times"}
            </Text>
            <View style={s.askRow}>
              <Text style={s.askNum} maxFontSizeMultiplier={fontScaleCap.body}>1</Text>
              <Text style={s.askText} maxFontSizeMultiplier={fontScaleCap.body}>
                First, tap <Text style={s.askButton}>{ios ? "Allow While Using App" : "While using the app"}</Text>
              </Text>
            </View>
            <View style={s.askDivider} />
            <View style={s.askRow}>
              <Text style={s.askNum} maxFontSizeMultiplier={fontScaleCap.body}>2</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.askText} maxFontSizeMultiplier={fontScaleCap.body}>
                  {ios ? "Later, tap " : "Then choose "}
                  <Text style={s.askButton}>{ios ? "Change to Always Allow" : "Allow all the time"}</Text>
                </Text>
                <Text style={[parts.small, { marginTop: 4 }]} maxFontSizeMultiplier={fontScaleCap.body}>
                  This one is what lets trips record with the app closed.
                </Text>
              </View>
            </View>
            {!ios ? (
              <>
                <View style={s.askDivider} />
                <View style={s.askRow}>
                  <Text style={s.askNum} maxFontSizeMultiplier={fontScaleCap.body}>3</Text>
                  <Text style={s.askText} maxFontSizeMultiplier={fontScaleCap.body}>
                    Then allow <Text style={s.askButton}>Physical activity</Text>. It helps spot the start of a drive.
                  </Text>
                </View>
              </>
            ) : null}
          </Box>
          <Text style={[parts.small, { marginTop: spacing.lg }]} maxFontSizeMultiplier={fontScaleCap.body}>
            We only use your location to measure drives. We never sell it.{" "}
            <Text
              style={parts.amberText}
              onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}
              accessibilityRole="link"
            >
              Read how we use it
            </Text>
          </Text>
        </>
      );
      footer = (
        <>
          <PrimaryButton title="Allow location" busy={busy} onPress={allowLocation} />
          <LinkButton
            title="I'd rather add trips myself"
            hint="Turns automatic trips off. You use Start Trip or add trips by hand"
            onPress={chooseStartTripOnly}
          />
        </>
      );
      break;
    }

    case "not_always": {
      const off = phone.tier === "none";
      content = (
        <>
          <IconBadge name="navigate-outline" dim />
          <Title center>{off ? "Location is off" : ios ? "Location is on While Using" : "Location is on while using the app"}</Title>
          <Body center>
            {off
              ? "MileClear can't record your drives without it."
              : "MileClear can only record while the app is open on your screen. Most drives will be missed."}
          </Body>
          <Box>
            <Text style={parts.boxTitle} maxFontSizeMultiplier={fontScaleCap.body}>To change it</Text>
            {(ios
              ? ["Open Settings below", "Tap Location", "Choose Always"]
              : ["Open Settings below", "Tap Permissions, then Location", "Choose Allow all the time"]
            ).map((line, i) => (
              <View key={line} style={s.stepRow}>
                <View style={s.stepNum}>
                  <Text style={s.stepNumText} maxFontSizeMultiplier={fontScaleCap.body}>{i + 1}</Text>
                </View>
                <Text style={s.askText} maxFontSizeMultiplier={fontScaleCap.body}>{line}</Text>
              </View>
            ))}
          </Box>
          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton title="Open Settings" onPress={() => Linking.openSettings().catch(() => {})} />
          </View>
          <Pressable
            onPress={chooseStartTripOnly}
            style={[s.altBox]}
            accessibilityRole="button"
            accessibilityLabel="Use Start Trip only"
            accessibilityHint="Turns automatic trips off. You tap Start Trip before each drive or add trips by hand"
          >
            <View style={{ flex: 1 }}>
              <Text style={parts.boxTitle} maxFontSizeMultiplier={fontScaleCap.body}>Prefer to add trips yourself?</Text>
              <Text style={parts.small} maxFontSizeMultiplier={fontScaleCap.body}>
                Use Start Trip before each drive, or add past trips by hand. You can switch later.
              </Text>
              <Text style={[parts.boxTitle, { marginTop: spacing.sm, marginBottom: 0 }]} maxFontSizeMultiplier={fontScaleCap.body}>
                Use Start Trip only
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text3} accessible={false} />
          </Pressable>
        </>
      );
      footer = null;
      break;
    }

    case "start_trip_only": {
      content = (
        <>
          <IconBadge name="flag-outline" />
          <Title center>You're on Start Trip only</Title>
          <Body center>Automatic trips is off, so MileClear records only when you ask it to.</Body>
          <TickLine title="Before you drive, tap Start Trip" hint="It's the big button on Home." />
          <TickLine title="When you get there, tap Arrived" hint="Start Trip runs until you tap Arrived, however long you stop." />
          <TickLine title="Forgot? Add it by hand" hint="Trips > Add a past trip." />
          <Box>
            <Text style={parts.small} maxFontSizeMultiplier={fontScaleCap.body}>
              To record by itself later, turn on Automatic trips in More &gt; Settings &gt; Recording options and set
              location to {ios ? "Always" : "Allow all the time"}.
            </Text>
          </Box>
        </>
      );
      footer = <PrimaryButton title="Next" onPress={() => go(nextDot())} />;
      break;
    }

    case "check": {
      const rows = tourCheckRows({
        platform: ios ? "ios" : "android",
        tier: phone.tier,
        motion: phone.motion,
        bgRefreshOff: phone.bgRefreshOff,
        notifications: phone.notifications,
        startTripOnly: startTripOnly || (phone.automaticOff && phone.tier !== "always"),
      });
      const msgs = recordingMessages(phone);
      const line = selectStatusLine({
        recording: null,
        blocker: msgs.blocker,
        failedSyncCount: 0,
        pausedUntil: phone.pausedUntil,
        now: Date.now(),
        automaticOff: phone.automaticOff,
        lowPowerMode: phone.lowPower,
        platform: ios ? "ios" : "android",
        setup: msgs.setup,
        recovered: null,
      });
      content = (
        <>
          <Title>Let's check it's working</Title>
          <Body>We test your phone now, not later.</Body>
          <View style={s.checkCard}>
            {rows.map((r, i) => (
              <View key={r.id} style={[s.checkRow, i > 0 && s.checkBorder]}>
                <Tick ok={r.ok} />
                <View style={{ flex: 1 }} accessible accessibilityLabel={`${r.title}. ${r.ok ? "On" : "Not set"}. ${r.hint}`}>
                  <Text style={s.checkTitle} maxFontSizeMultiplier={fontScaleCap.body}>{r.title}</Text>
                  <Text style={s.checkHint} maxFontSizeMultiplier={fontScaleCap.body}>{r.hint}</Text>
                </View>
                {r.action && r.fix ? (
                  <Pressable
                    onPress={() => runFix(r.fix!)}
                    style={s.checkAction}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.action} ${r.title}`}
                  >
                    <Text style={s.checkActionText} maxFontSizeMultiplier={fontScaleCap.heading}>{r.action}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          <Text style={parts.sectionLabel} maxFontSizeMultiplier={fontScaleCap.heading}>What you'll see on Home</Text>
          <View style={s.statusPreview} pointerEvents="none" accessible accessibilityLabel={`Home status line: ${line.title}`}>
            <StatusLine model={line} onPress={() => {}} onAction={() => {}} />
          </View>
          <Text style={[parts.small, { marginTop: spacing.md, fontSize: 15, lineHeight: 22 }]} maxFontSizeMultiplier={fontScaleCap.body}>
            This line at the top of Home is your check. Green: all good. Red: tap it and we'll fix it.
          </Text>
        </>
      );
      footer = <PrimaryButton title="Next" onPress={() => go(nextDot())} />;
      break;
    }

    case "your_app": {
      const bike = firstRun ? motorbike : replayMotorbike;
      const places = appPlaces({
        driveFor,
        motorbike: bike,
        employerRatePence: rate ?? user?.employerMileageRatePence ?? null,
        rates,
      });
      const pill = modePillLine(driveFor);
      const pro = proLine({ isPremium: user?.isPremium ?? false, driveFor, isCompanyDriver });
      const job = startTripOnly
        ? "Before your next drive, open MileClear and tap Start Trip. Tap Arrived when you get there. That's it."
        : driveFor === "personal"
          ? "Go for a drive. When you stop, open MileClear and your trip is there. That's it."
          : "Go for a drive. When you stop, open MileClear and tap Business or Personal on your trip. That's it.";
      content = (
        <>
          <Title>{`Your app in ${places.length === 4 ? "four" : String(places.length)} places`}</Title>
          <Body>Set up for: {setUpForText(driveFor)}</Body>
          <View style={s.checkCard}>
            {places.map((p, i) => (
              <View key={p.id} style={[s.placeRow, i > 0 && s.checkBorder]} accessible accessibilityLabel={`${p.title}. ${p.body}`}>
                <View style={s.placeIcon}>
                  <Ionicons name={PLACE_ICONS[p.id]} size={24} color={colors.amber} accessible={false} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.checkTitle} maxFontSizeMultiplier={fontScaleCap.body}>{p.title}</Text>
                  <Text style={s.checkHint} maxFontSizeMultiplier={fontScaleCap.body}>{p.body}</Text>
                </View>
              </View>
            ))}
          </View>
          {pill ? (
            <Text style={[parts.small, { marginTop: spacing.md }]} maxFontSizeMultiplier={fontScaleCap.body}>{pill}</Text>
          ) : null}
          <Box tone="amber">
            <Text style={parts.boxTitleAmber} maxFontSizeMultiplier={fontScaleCap.heading}>Your first job</Text>
            <Text style={parts.boxBody} maxFontSizeMultiplier={fontScaleCap.body}>{job}</Text>
          </Box>
          {pro ? (
            <Text style={[parts.small, { marginTop: spacing.md }]} maxFontSizeMultiplier={fontScaleCap.body}>{pro}</Text>
          ) : null}
        </>
      );
      footer = (
        <>
          <PrimaryButton title={firstRun ? "Go to Home" : "Done"} onPress={() => complete().catch(() => {})} />
          <Text style={[parts.small, s.replayHint]} maxFontSizeMultiplier={fontScaleCap.body}>
            {firstRun ? "Replay any time: More > Help and how-tos > Take the tour" : "You can take the tour again from Help and how-tos"}
          </Text>
        </>
      );
      break;
    }
  }

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <TopBar
        index={dotIndex}
        total={dots.length}
        onBack={history.current.length > 0 ? back : null}
        onSkip={isLast ? null : skip}
      />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fade }}>{content}</Animated.View>
      </ScrollView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  drawing: {
    height: 220,
    borderRadius: radii.lg + 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.xxl,
    justifyContent: "center",
    alignItems: "center",
  },
  chip: {
    position: "absolute",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipAmber: { top: 18, left: 18, backgroundColor: "#181a20", borderColor: "rgba(245,166,35,0.35)" },
  chipAmberText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.amber },
  chipEnd: { bottom: 18, right: 18, backgroundColor: colors.bg, borderColor: colors.hairline },
  chipText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text1 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.amber, backgroundColor: "#181a20" },
  optionTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  optionHint: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.text3,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.amber, backgroundColor: colors.amber },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bg },
  segment: {
    flexDirection: "row",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    padding: 4,
    gap: 4,
  },
  segmentHalf: { flex: 1, minHeight: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: "#2a3544" },
  segmentText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text2 },
  segmentTextOn: { color: colors.text1, fontFamily: fonts.semibold },
  rateRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xl },
  rateInput: {
    width: 110,
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    color: colors.text1,
    fontSize: 24,
    fontFamily: fonts.semibold,
    textAlign: "center",
  },
  rateUnit: { fontSize: 18, fontFamily: fonts.medium, color: colors.text2 },
  askRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingVertical: spacing.sm },
  askNum: { width: 18, fontSize: 18, fontFamily: fonts.bold, color: colors.amber },
  askText: { flex: 1, fontSize: 16, lineHeight: 23, fontFamily: fonts.regular, color: colors.text1 },
  askButton: { fontFamily: fonts.semibold, color: "#60a5fa" },
  askDivider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.xs },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontSize: 13, fontFamily: fonts.bold, color: colors.amber },
  altBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  checkCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  checkBorder: { borderTopWidth: 1, borderTopColor: colors.surfaceBorder },
  checkTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  checkHint: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 2, lineHeight: 20 },
  checkAction: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  checkActionText: { fontSize: 16, fontFamily: fonts.bold, color: colors.amber },
  statusPreview: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  placeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  placeIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  replayHint: { textAlign: "center", marginTop: spacing.md },
});
