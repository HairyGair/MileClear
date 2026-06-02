import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { Button } from "../components/Button";
import { updateProfile } from "../lib/api/user";
import { createVehicle } from "../lib/api/vehicles";
import { getDatabase } from "../lib/db/index";
import { useMode } from "../lib/mode/context";
import { requestOrFixBackgroundLocation, getLocationPermissionStatus } from "../lib/permissions/location";
import type { WorkType, VehicleType } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const GREEN = colors.green;

// ── Constants ────────────────────────────────────────────────────────────────

const BG = colors.bg;
const CARD_BG = colors.surface;
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const ERROR_BG = "rgba(220, 38, 38, 0.1)";
const ERROR_BORDER = "rgba(220, 38, 38, 0.2)";
const SUCCESS = GREEN;

const TOTAL_STEPS = 7;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;

  const [step, setStep] = useState(1);

  // User intent
  const [userIntent, setUserIntent] = useState<"work" | "personal" | "both" | null>(null);
  const [workType, setWorkType] = useState<WorkType>("gig");
  // Vehicle type captured during onboarding so HMRC rate calc works on day one.
  // A placeholder vehicle is auto-created on finish; user can edit make/model later.
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  // Employer per-mile rate in pence. Only relevant for employee/both work types.
  // Saved to user profile so the Business Mileage card calculates "owed by employer".
  const [employerRate, setEmployerRate] = useState<number | null>(null);
  const { setMode: setAppMode } = useMode();

  // Location state. "foreground" is a distinct, NOT-done state: the user
  // granted "While Using" but auto-detection needs "Always". Treating
  // foreground as success was the activation leak — ~47% of users never had
  // Always, so background trip detection silently never ran for them.
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "requesting" | "always" | "foreground" | "denied"
  >("idle");

  // Notification state
  const [notifStatus, setNotifStatus] = useState<
    "idle" | "requesting" | "granted" | "denied"
  >("idle");
  const [reminderTime, setReminderTime] = useState<"morning" | "evening" | "none" | null>(null);

  // Goal commitment
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);

  const [finishingSetup, setFinishingSetup] = useState(false);

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const animateProgress = useCallback(
    (toStep: number) => {
      Animated.spring(progressAnim, {
        toValue: toStep / TOTAL_STEPS,
        tension: 180,
        friction: 18,
        useNativeDriver: false,
      }).start();
    },
    [progressAnim]
  );

  const goToStep = useCallback(
    (target: number) => {
      const clamped = Math.min(Math.max(target, 1), TOTAL_STEPS);
      setStep(clamped);
      animateProgress(clamped);
      scrollRef.current?.scrollTo({
        x: (clamped - 1) * SCREEN_WIDTH,
        animated: true,
      });
    },
    [animateProgress]
  );

  const goNext = useCallback(() => goToStep(step + 1), [goToStep, step]);

  // ── Location permission ────────────────────────────────────────────────────

  const handleRequestLocation = useCallback(async () => {
    setLocationStatus("requesting");
    try {
      // Smart two-step escalation: fires the FG prompt, then the BG ("Always")
      // prompt, walking the user all the way to Always. We render our own
      // inline guidance below, so suppress the helper's Settings alert.
      const final = await requestOrFixBackgroundLocation({ showSettingsAlert: false });
      setLocationStatus(
        final.tier === "always" ? "always" : final.tier === "foreground" ? "foreground" : "denied"
      );
    } catch {
      setLocationStatus("denied");
    }
  }, []);

  // Re-check permission when returning from Settings — the user may have
  // flipped Location to Always (or to While Using). Re-evaluate the full tier
  // so the step reflects reality, not just a one-way denied->granted flip.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      if (locationStatus !== "denied" && locationStatus !== "foreground") return;
      try {
        const { tier } = await getLocationPermissionStatus();
        if (tier === "always") setLocationStatus("always");
        else if (tier === "foreground") setLocationStatus("foreground");
      } catch {
        // ignore
      }
    });
    return () => sub.remove();
  }, [locationStatus]);

  // ── Notification permission ────────────────────────────────────────────────

  const handleRequestNotifications = useCallback(async () => {
    setNotifStatus("requesting");
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotifStatus(status === "granted" ? "granted" : "denied");
    } catch {
      setNotifStatus("denied");
    }
  }, []);

  // ── Complete onboarding ────────────────────────────────────────────────────

  const handleFinish = useCallback(
    async (destination: "trip" | "dashboard") => {
      setFinishingSetup(true);
      try {
        const db = await getDatabase();
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('onboarding_complete', 'true')"
        );

        // Save notification reminder preference
        if (reminderTime && reminderTime !== "none") {
          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('notification_reminder_time', ?)",
            [reminderTime]
          );
        }

        // Mark that we've gone through the notification step (so trip-form fallback skips)
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('notification_contextual_asked', 'true')"
        );

        // Save weekly goal if set
        if (weeklyGoal) {
          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('personal_goal_miles', ?)",
            [String(weeklyGoal)]
          );
        }

        // Set default mode based on user intent
        if (userIntent === "personal") {
          setAppMode("personal");
        } else {
          setAppMode("work");
        }

        // Save intent + employer rate to server (fire-and-forget). Employer
        // rate is only meaningful for employee/both work types - the new
        // Business Mileage card uses it to calculate "owed by employer".
        if (userIntent) {
          const isEmployee =
            userIntent !== "personal" &&
            (workType === "employee" || workType === "both");
          updateProfile({
            userIntent,
            ...(userIntent !== "personal" && { workType }),
            ...(isEmployee && employerRate != null && { employerMileageRatePence: employerRate }),
          }).catch(() => {});
        }

        // Auto-create a placeholder vehicle so HMRC rate calculations work
        // immediately. User can edit make/model/MPG via Profile > Vehicles.
        // Fire-and-forget; failure is non-fatal.
        const placeholderMake =
          vehicleType === "motorbike" ? "My Motorbike" : vehicleType === "van" ? "My Van" : "My Car";
        createVehicle({
          make: placeholderMake,
          model: "(edit details)",
          vehicleType,
          fuelType: "petrol",
          isPrimary: true,
        }).catch(() => {});

        if (destination === "trip") {
          router.replace("/trip-form" as any);
        } else {
          router.replace("/(tabs)/dashboard");
        }
      } catch {
        Alert.alert(
          "Something went wrong",
          "Could not save your setup progress. You can still continue.",
          [
            {
              text: "Continue",
              onPress: () => router.replace("/(tabs)/dashboard"),
            },
          ]
        );
      } finally {
        setFinishingSetup(false);
      }
    },
    [router, userIntent, workType, vehicleType, employerRate, setAppMode, reminderTime, weeklyGoal]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Progress bar */}
      <View style={s.progressTrack}>
        <Animated.View
          style={[
            s.progressFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>

      {/* Skip setup — escape hatch for the ~33% who abandon mid-flow. Rather
          than force-quitting (and landing as a half-set-up, never-activated
          account), this completes onboarding with sensible defaults + the
          auto-created vehicle and drops them on the dashboard, where the
          location nudge + welcome nudge can still pull them to a first trip.
          Shown only after the value-prop steps (1-2), hidden on the final
          step (which has its own finish actions). */}
      {step >= 3 && step < TOTAL_STEPS && !finishingSetup && (
        <TouchableOpacity
          style={s.skipSetup}
          onPress={() => handleFinish("dashboard")}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Skip setup and go to the dashboard"
        >
          <Text style={s.skipSetupText}>Skip</Text>
          <Ionicons name="chevron-forward" size={14} color={TEXT_3} accessible={false} />
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={s.stepScroller}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1: Before (Pain) ────────────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={[s.stepContent, s.painContent]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.painIconWrap}>
              <Ionicons name="warning-outline" size={40} color="#f87171" />
            </View>

            <Text style={s.painHeading}>
              Are you losing money{"\n"}every time you drive?
            </Text>

            <View style={s.painBullets}>
              <View style={s.painBullet}>
                <View style={s.painBulletDot} />
                <Text style={s.painBulletText}>
                  No records means no claim - to HMRC or to your employer
                </Text>
              </View>
              <View style={s.painBullet}>
                <View style={s.painBulletDot} />
                <Text style={s.painBulletText}>
                  Scrambling through bank statements at tax time, or end of every payroll period
                </Text>
              </View>
              <View style={s.painBullet}>
                <View style={s.painBulletDot} />
                <Text style={s.painBulletText}>
                  Every forgotten mile is money lost - 55p/mile from HMRC, or whatever your employer pays
                </Text>
              </View>
            </View>

            <Text style={s.painSecondary}>
              Or maybe you just want a record of every journey you take.
            </Text>

            {/* Trust signals */}
            <View style={s.trustSignals}>
              <View style={s.trustSignalRow}>
                <Ionicons name="infinite-outline" size={14} color={SUCCESS} />
                <Text style={s.trustSignalText}>Unlimited trip tracking, free forever - no drive cap</Text>
              </View>
              <View style={s.trustSignalRow}>
                <Ionicons name="card-outline" size={14} color={SUCCESS} />
                <Text style={s.trustSignalText}>No credit card required</Text>
              </View>
              <View style={s.trustSignalRow}>
                <Ionicons name="lock-closed-outline" size={14} color={SUCCESS} />
                <Text style={s.trustSignalText}>Your data stays private</Text>
              </View>
            </View>

            <View style={{ flex: 1 }} />

            <Button
              variant="hero"
              title="There's a better way"
              icon="arrow-forward"
              size="lg"
              onPress={goNext}
            />
          </ScrollView>
        </View>

        {/* ── Step 2: After (Transformation) ───────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={[s.stepContent, s.transformContent]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.transformIconWrap}>
              <Ionicons name="checkmark-circle" size={40} color={SUCCESS} />
            </View>

            <Text style={s.transformHeading}>
              Track every mile.{"\n"}Claim every penny.
            </Text>

            <View style={s.transformBullets}>
              <View style={s.transformBullet}>
                <Ionicons name="navigate" size={20} color={AMBER} />
                <View style={s.transformBulletBody}>
                  <Text style={s.transformBulletTitle}>Automatic GPS tracking - unlimited, free</Text>
                  <Text style={s.transformBulletText}>
                    Start driving and we'll record your route in the background. No drive cap, ever - other apps stop you at 40 a month.
                  </Text>
                </View>
              </View>
              <View style={s.transformBullet}>
                <Ionicons name="calculator" size={20} color={AMBER} />
                <View style={s.transformBulletBody}>
                  <Text style={s.transformBulletTitle}>Instant HMRC calculation</Text>
                  <Text style={s.transformBulletText}>
                    See your tax deduction update in real time as you drive
                  </Text>
                </View>
              </View>
              <View style={s.transformBullet}>
                <Ionicons name="document-text" size={20} color={AMBER} />
                <View style={s.transformBulletBody}>
                  <Text style={s.transformBulletTitle}>One-tap export</Text>
                  <Text style={s.transformBulletText}>
                    PDF and CSV ready for your self-assessment
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.socialProofBadge}>
              <Ionicons name="people" size={16} color={TEXT_3} />
              <Text style={s.socialProofText}>
                Tracking thousands of miles every month for UK drivers
              </Text>
            </View>

            <View style={{ flex: 1 }} />

            <Button
              variant="hero"
              title="Let's get started"
              icon="arrow-forward"
              size="lg"
              onPress={goNext}
            />
          </ScrollView>
        </View>

        {/* ── Step 3: Welcome + Intent ──────────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={s.stepContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.welcomeLogoWrap}>
              <Image
                source={require("../assets/branding/logo-original.png")}
                style={s.welcomeLogo}
                resizeMode="contain"
                accessible={false}
              />
            </View>

            <View style={s.wordmarkRow}>
              <Text style={s.wordmarkMile}>Mile</Text>
              <Text style={s.wordmarkClear}>Clear</Text>
            </View>

            <Text style={s.welcomeHeading}>
              Track every mile.{"\n"}Claim what you're owed.
            </Text>
            <Text style={s.welcomeSubtitle}>
              GPS trip tracking, automatic HMRC deductions, and a personal driving journal — all in one app.
            </Text>

            <Text style={s.sectionLabel}>How will you use MileClear?</Text>

            <View style={s.intentCards}>
              <TouchableOpacity
                style={[
                  s.intentCard,
                  userIntent === "work" && s.intentCardActive,
                ]}
                onPress={() => setUserIntent("work")}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Work: tax deductions, shift tracking, earnings"
                accessibilityState={{ selected: userIntent === "work" }}
              >
                <View
                  style={[
                    s.intentIconWrap,
                    userIntent === "work" && s.intentIconWrapActive,
                  ]}
                >
                  <Ionicons
                    name="briefcase-outline"
                    size={22}
                    color={userIntent === "work" ? AMBER : TEXT_2}
                  />
                </View>
                <View style={s.intentBody}>
                  <Text
                    style={[
                      s.intentTitle,
                      userIntent === "work" && s.intentTitleActive,
                    ]}
                  >
                    Work
                  </Text>
                  <Text style={s.intentDesc}>
                    For gig workers, self-employed drivers, and employees who use their own car for work. Track business miles, calculate HMRC deductions, and prepare claims for your employer.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.intentCard,
                  userIntent === "personal" && s.intentCardActive,
                ]}
                onPress={() => setUserIntent("personal")}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Personal: for everyday drivers. Log journeys, track fuel costs, and see driving habits."
                accessibilityState={{ selected: userIntent === "personal" }}
              >
                <View
                  style={[
                    s.intentIconWrap,
                    userIntent === "personal" && s.intentIconWrapActive,
                  ]}
                >
                  <Ionicons
                    name="car-outline"
                    size={22}
                    color={userIntent === "personal" ? AMBER : TEXT_2}
                  />
                </View>
                <View style={s.intentBody}>
                  <Text
                    style={[
                      s.intentTitle,
                      userIntent === "personal" && s.intentTitleActive,
                    ]}
                  >
                    Personal
                  </Text>
                  <Text style={s.intentDesc}>
                    For everyday drivers. Log your journeys, track fuel costs, and see your driving habits over time.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.intentCard,
                  userIntent === "both" && s.intentCardActive,
                ]}
                onPress={() => setUserIntent("both")}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Both: use Work mode when on the clock, Personal for everything else"
                accessibilityState={{ selected: userIntent === "both" }}
              >
                <View
                  style={[
                    s.intentIconWrap,
                    userIntent === "both" && s.intentIconWrapActive,
                  ]}
                >
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={22}
                    color={userIntent === "both" ? AMBER : TEXT_2}
                  />
                </View>
                <View style={s.intentBody}>
                  <Text
                    style={[
                      s.intentTitle,
                      userIntent === "both" && s.intentTitleActive,
                    ]}
                  >
                    Both
                  </Text>
                  <Text style={s.intentDesc}>
                    Use Work mode when you're on the clock, Personal for everything else. Switch anytime.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Work type sub-selection */}
            {(userIntent === "work" || userIntent === "both") && (
              <View style={s.workTypeSection}>
                <Text style={s.sectionLabel}>What kind of work?</Text>
                <View style={s.workTypeRow}>
                  {([
                    { key: "gig" as WorkType, label: "Gig / Delivery", icon: "bicycle-outline" as const },
                    { key: "employee" as WorkType, label: "Employee", icon: "briefcase-outline" as const },
                    { key: "both" as WorkType, label: "Both", icon: "git-branch-outline" as const },
                  ]).map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        s.workTypeChip,
                        workType === opt.key && s.workTypeChipActive,
                      ]}
                      onPress={() => setWorkType(opt.key)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Work type: ${opt.label}`}
                      accessibilityState={{ selected: workType === opt.key }}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={16}
                        color={workType === opt.key ? AMBER : TEXT_3}
                      />
                      <Text
                        style={[
                          s.workTypeChipText,
                          workType === opt.key && s.workTypeChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Employer per-mile rate (employee or both) */}
            {(userIntent === "work" || userIntent === "both") &&
              (workType === "employee" || workType === "both") && (
                <View style={s.workTypeSection}>
                  <Text style={s.sectionLabel}>What does your employer pay per mile?</Text>
                  <View style={s.workTypeRow}>
                    {([25, 30, 40, 45]).map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          s.workTypeChip,
                          employerRate === p && s.workTypeChipActive,
                        ]}
                        onPress={() => setEmployerRate(employerRate === p ? null : p)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`Employer rate: ${p} pence per mile`}
                        accessibilityState={{ selected: employerRate === p }}
                      >
                        <Ionicons
                          name="cash-outline"
                          size={14}
                          color={employerRate === p ? AMBER : TEXT_3}
                        />
                        <Text
                          style={[
                            s.workTypeChipText,
                            employerRate === p && s.workTypeChipTextActive,
                          ]}
                        >
                          {p}p
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.helperText}>
                    Your employer&apos;s reimbursement rate (skip if you&apos;re not sure - you can set it later in Profile). If they pay below 55p you can claim the gap from HMRC as Mileage Allowance Relief (rate rose from 45p to 55p on 6 April 2026).
                  </Text>
                </View>
              )}

            {/* Vehicle type capture - affects HMRC rate (55p/25p car/van vs 24p motorbike, from 2026-27) */}
            <View style={s.workTypeSection}>
              <Text style={s.sectionLabel}>What do you drive?</Text>
              <View style={s.workTypeRow}>
                {([
                  { key: "car" as VehicleType, label: "Car", icon: "car-outline" as const },
                  { key: "van" as VehicleType, label: "Van", icon: "bus-outline" as const },
                  { key: "motorbike" as VehicleType, label: "Motorbike", icon: "bicycle-outline" as const },
                ]).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      s.workTypeChip,
                      vehicleType === opt.key && s.workTypeChipActive,
                    ]}
                    onPress={() => setVehicleType(opt.key)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Vehicle: ${opt.label}`}
                    accessibilityState={{ selected: vehicleType === opt.key }}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={vehicleType === opt.key ? AMBER : TEXT_3}
                    />
                    <Text
                      style={[
                        s.workTypeChipText,
                        vehicleType === opt.key && s.workTypeChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.helperText}>
                Sets your default HMRC mileage rate. You can add full vehicle details (make, model, MPG) anytime from Profile.
              </Text>
            </View>

            <Button
              variant="hero"
              title="Continue"
              icon="arrow-forward"
              size="lg"
              onPress={goNext}
              disabled={!userIntent}
            />
          </ScrollView>
        </View>

        {/* ── Step 4: Location Permission ────────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={s.stepContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.stepIconWrap}>
              <Ionicons name="location-outline" size={36} color={AMBER} />
            </View>

            <Text style={s.stepHeading}>Never miss a mile</Text>
            <Text style={s.stepSubtitle}>
              MileClear logs every business mile automatically — even with your screen off. A forgotten 20-mile trip is about £11 you can&apos;t claim back. &ldquo;Always&rdquo; location means you never miss one.
            </Text>

            {/* Explanation cards */}
            <View style={s.permissionCards}>
              <View style={s.permCard}>
                <Ionicons
                  name="navigate-outline"
                  size={20}
                  color={AMBER}
                  style={s.permCardIcon}
                />
                <View style={s.permCardBody}>
                  <Text style={s.permCardTitle}>While using the app</Text>
                  <Text style={s.permCardText}>
                    Tracks your route with the app open.
                  </Text>
                </View>
              </View>
              <View style={s.permCard}>
                <Ionicons
                  name="radio-button-on-outline"
                  size={20}
                  color={AMBER}
                  style={s.permCardIcon}
                />
                <View style={s.permCardBody}>
                  <Text style={s.permCardTitle}>Always (recommended)</Text>
                  <Text style={s.permCardText}>
                    Records trips with the app closed — so every claimable mile is captured, even the ones you&apos;d forget.
                  </Text>
                </View>
              </View>
            </View>

            {locationStatus === "always" && (
              <View style={s.grantedBanner}>
                <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                <Text style={s.grantedText}>Always location on — auto-detection is live</Text>
              </View>
            )}

            {/* Foreground-only: the critical "almost there" state. The user
                granted "While Using" but auto-detection needs "Always". This
                was previously treated as success, which is why ~half of users
                never got a single auto-trip. */}
            {locationStatus === "foreground" && (
              <View style={s.deniedCard}>
                <View style={s.deniedHeader}>
                  <Ionicons name="alert-circle-outline" size={20} color="#f59e0b" />
                  <Text style={[s.deniedTitle, { color: "#f59e0b" }]}>One more tap for auto-tracking</Text>
                </View>
                <Text style={s.deniedBody}>
                  You allowed location <Text style={{ fontFamily: fonts.semibold }}>While Using the App</Text>. Automatic trip detection needs <Text style={{ fontFamily: fonts.semibold }}>Always</Text> — otherwise trips only record while MileClear is open on screen.
                </Text>
                <Text style={s.deniedHelp}>
                  In Settings: Location {"->"} Always, and turn Precise Location on.
                </Text>
                <TouchableOpacity
                  style={[s.deniedSettingsBtn, { backgroundColor: "rgba(245,166,35,0.15)", borderColor: "rgba(245,166,35,0.3)" }]}
                  onPress={() => Linking.openSettings()}
                  accessibilityRole="button"
                  accessibilityLabel="Open Settings to switch to Always location access"
                >
                  <Ionicons name="settings-outline" size={16} color="#f59e0b" />
                  <Text style={[s.deniedSettingsBtnText, { color: "#f59e0b" }]}>Open Settings</Text>
                </TouchableOpacity>
              </View>
            )}

            {locationStatus === "denied" && (
              <View style={s.deniedCard}>
                <View style={s.deniedHeader}>
                  <Ionicons name="warning-outline" size={20} color="#f87171" />
                  <Text style={s.deniedTitle}>Auto-detection is off</Text>
                </View>
                <Text style={s.deniedBody}>
                  Without "Always" location access, MileClear can't record trips in the background. You'll need to tap Start before every drive, and any forgotten trips mean lost HMRC deductions.
                </Text>
                <Text style={s.deniedHelp}>
                  Tap below to open Settings, then choose Location {"->"} Always.
                </Text>
                <TouchableOpacity
                  style={s.deniedSettingsBtn}
                  onPress={() => Linking.openSettings()}
                  accessibilityRole="button"
                  accessibilityLabel="Open Settings to enable Always location access"
                >
                  <Ionicons name="settings-outline" size={16} color="#f87171" />
                  <Text style={s.deniedSettingsBtnText}>Open Settings</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={s.buttonStack}>
              {(locationStatus === "idle" || locationStatus === "requesting") && (
                <Button
                  variant="hero"
                  title={locationStatus === "requesting" ? "Requesting..." : "Enable Location"}
                  icon="location-outline"
                  size="lg"
                  onPress={handleRequestLocation}
                  loading={locationStatus === "requesting"}
                />
              )}

              {/* foreground/denied: let them retry the in-app escalation as well
                  as the Settings route in the card above. */}
              {(locationStatus === "foreground" || locationStatus === "denied") && (
                <Button
                  variant="primary"
                  title="Try again"
                  icon="refresh"
                  size="lg"
                  onPress={handleRequestLocation}
                />
              )}

              {/* Forward only AFTER the OS prompt has been answered. When idle we
                  deliberately offer no in-step bypass — the old "Continue" +
                  "Skip for now" buttons let a new user pass with permission still
                  'undetermined' (never even asked), landing in an app that can
                  never record a trip (Adnan K, 1 June). The OS dialog itself is
                  the choice: "Don't Allow" -> denied -> the
                  "Continue without auto-detection" path still lets them proceed,
                  but only once they've actually been asked. */}
              {locationStatus !== "idle" && locationStatus !== "requesting" && (
                <Button
                  variant={locationStatus === "always" ? "hero" : "primary"}
                  title={
                    locationStatus === "always"
                      ? "Continue"
                      : locationStatus === "foreground"
                        ? "Continue with limited tracking"
                        : "Continue without auto-detection"
                  }
                  icon="arrow-forward"
                  size="lg"
                  onPress={goNext}
                />
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── Step 5: Notification Permission ──────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={s.stepContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.stepIconWrap}>
              <Ionicons name="notifications-outline" size={36} color={AMBER} />
            </View>

            <Text style={s.stepHeading}>Stay on track</Text>
            <Text style={s.stepSubtitle}>
              Notifications help you build a tracking habit and never miss a drive.
            </Text>

            <View style={s.permissionCards}>
              <View style={s.permCard}>
                <Ionicons name="flame-outline" size={20} color={AMBER} style={s.permCardIcon} />
                <View style={s.permCardBody}>
                  <Text style={s.permCardTitle}>Streak reminders</Text>
                  <Text style={s.permCardText}>
                    A gentle nudge if you're about to lose your driving streak.
                  </Text>
                </View>
              </View>
              <View style={s.permCard}>
                <Ionicons name="car-outline" size={20} color={AMBER} style={s.permCardIcon} />
                <View style={s.permCardBody}>
                  <Text style={s.permCardTitle}>Classify-trip prompts</Text>
                  <Text style={s.permCardText}>
                    Quick lock-screen tap to mark each recorded trip as Business or Personal. Auto-tracking still works without these.
                  </Text>
                </View>
              </View>
              <View style={s.permCard}>
                <Ionicons name="bar-chart-outline" size={20} color={AMBER} style={s.permCardIcon} />
                <View style={s.permCardBody}>
                  <Text style={s.permCardTitle}>Weekly summary</Text>
                  <Text style={s.permCardText}>
                    Your miles, deductions, and progress — delivered every Sunday.
                  </Text>
                </View>
              </View>
            </View>

            {/* Reminder time chips */}
            <Text style={s.sectionLabel}>When should we nudge you?</Text>
            <View style={s.workTypeRow}>
              {([
                { key: "morning" as const, label: "Morning 9am", icon: "sunny-outline" as const },
                { key: "evening" as const, label: "Evening 7pm", icon: "moon-outline" as const },
                { key: "none" as const, label: "Don't remind me", icon: "notifications-off-outline" as const },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    s.workTypeChip,
                    reminderTime === opt.key && s.workTypeChipActive,
                  ]}
                  onPress={() => setReminderTime(opt.key)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: reminderTime === opt.key }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={14}
                    color={reminderTime === opt.key ? AMBER : TEXT_3}
                  />
                  <Text
                    style={[
                      s.workTypeChipText,
                      reminderTime === opt.key && s.workTypeChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {notifStatus === "granted" && (
              <View style={[s.grantedBanner, { marginTop: 16 }]}>
                <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                <Text style={s.grantedText}>Notifications enabled</Text>
              </View>
            )}

            {notifStatus === "denied" && (
              <View style={[s.deniedBanner, { marginTop: 16 }]}>
                <Ionicons name="warning-outline" size={20} color="#f87171" />
                <Text style={s.deniedText}>
                  Notifications denied — you can enable them later in Settings.
                </Text>
              </View>
            )}

            <View style={[s.buttonStack, { marginTop: 16 }]}>
              {notifStatus !== "granted" && reminderTime !== "none" && (
                <Button
                  variant="hero"
                  title={notifStatus === "requesting" ? "Requesting..." : "Enable Notifications"}
                  icon="notifications-outline"
                  size="lg"
                  onPress={handleRequestNotifications}
                  loading={notifStatus === "requesting"}
                  disabled={notifStatus === "denied"}
                />
              )}

              <Button
                variant={notifStatus === "granted" || reminderTime === "none" ? "hero" : "primary"}
                title="Continue"
                icon="arrow-forward"
                size="lg"
                onPress={goNext}
              />

              {notifStatus === "idle" && reminderTime !== "none" && (
                <Button
                  variant="ghost"
                  title="Skip for now"
                  onPress={goNext}
                />
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── Step 6: Goal Commitment ────────────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={s.stepContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.stepIconWrap}>
              <Ionicons name="flag-outline" size={36} color={AMBER} />
            </View>

            <Text style={s.stepHeading}>Set your weekly goal</Text>
            <Text style={s.stepSubtitle}>
              A small commitment helps you build the tracking habit.
            </Text>

            <View style={s.workTypeRow}>
              {([
                { miles: 50, label: "50 miles" },
                { miles: 100, label: "100 miles" },
                { miles: 200, label: "200 miles" },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.miles}
                  style={[
                    s.workTypeChip,
                    weeklyGoal === opt.miles && s.workTypeChipActive,
                  ]}
                  onPress={() => setWeeklyGoal(weeklyGoal === opt.miles ? null : opt.miles)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Weekly goal: ${opt.label}`}
                  accessibilityState={{ selected: weeklyGoal === opt.miles }}
                >
                  <Ionicons
                    name="flag-outline"
                    size={14}
                    color={weeklyGoal === opt.miles ? AMBER : TEXT_3}
                  />
                  <Text
                    style={[
                      s.workTypeChipText,
                      weeklyGoal === opt.miles && s.workTypeChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[s.buttonStack, { marginTop: 24 }]}>
              <Button
                variant="hero"
                title="Continue"
                icon="arrow-forward"
                size="lg"
                onPress={goNext}
              />
              <Button
                variant="ghost"
                title="Skip"
                onPress={goNext}
              />
            </View>
          </ScrollView>
        </View>

        {/* ── Step 7: You're all set! ────────────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={[s.stepContent, s.readyContent]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.readyIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color={SUCCESS} />
            </View>

            <Text style={s.readyHeading}>You're all set!</Text>
            <Text style={s.readySubtitle}>
              From now on, every business mile you drive is tracked automatically - free, forever, no drive cap. You can tweak any setting from the dashboard anytime.
            </Text>

            {/* What happens next - quick three-step preview of the first
                week so users know what to expect when they open the app */}
            <View style={s.nextStepsBlock}>
              <Text style={s.sectionLabel}>What happens next</Text>
              <View style={s.nextStepCard}>
                <View style={s.nextStepNumber}>
                  <Text style={s.nextStepNumberText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nextStepTitle}>Just drive</Text>
                  <Text style={s.nextStepBody}>
                    Auto-detection starts a trip the moment you move and ends it when you stop. You don't need to open the app.
                  </Text>
                </View>
              </View>
              <View style={s.nextStepCard}>
                <View style={s.nextStepNumber}>
                  <Text style={s.nextStepNumberText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nextStepTitle}>Tap to classify</Text>
                  <Text style={s.nextStepBody}>
                    Mark each trip business or personal in one tap. Only business miles count toward your HMRC deduction.
                  </Text>
                </View>
              </View>
              <View style={s.nextStepCard}>
                <View style={s.nextStepNumber}>
                  <Text style={s.nextStepNumberText}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nextStepTitle}>Watch your deduction grow</Text>
                  <Text style={s.nextStepBody}>
                    Open the Tax Readiness card on the dashboard for a live HMRC + NI estimate that updates with every mile.
                  </Text>
                </View>
              </View>
            </View>

            {/* Pro tip - small actionable next-step that improves the
                auto-detection experience materially */}
            <View style={s.tipCard}>
              <View style={s.tipIconWrap}>
                <Ionicons name="bulb-outline" size={18} color={AMBER} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tipTitle}>Pro tip: pin Home and Work</Text>
                <Text style={s.tipBody}>
                  Add saved locations from Profile - Locations. Auto-detection pauses when you're parked at one, which saves battery and keeps your trip list clean.
                </Text>
              </View>
            </View>

            {/* Discord community - soft invite to the public Discord
                where other UK drivers swap tax tips and platform notes */}
            <TouchableOpacity
              style={s.discordCard}
              onPress={() => Linking.openURL("https://discord.gg/Wxnvr3rzaq").catch(() => {})}
              activeOpacity={0.85}
              accessibilityRole="link"
              accessibilityLabel="Join the MileClear Discord community"
            >
              <View style={s.discordIconWrap}>
                <Ionicons name="chatbubbles-outline" size={20} color="#5865F2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.discordTitle}>Join the Discord</Text>
                <Text style={s.discordBody}>
                  Chat tax, platforms, fuel deals and product updates with other UK drivers. Free, no obligation.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
            </TouchableOpacity>

            {/* Setup status - dynamic checklist of what's actually configured */}
            <View style={s.setupHints}>
              <Text style={s.sectionLabel}>Setup status</Text>

              {/* Location */}
              <View style={s.setupCheckRow}>
                <Ionicons
                  name={locationStatus === "always" ? "checkmark-circle" : "alert-circle-outline"}
                  size={18}
                  color={locationStatus === "always" ? SUCCESS : "#f59e0b"}
                />
                <Text style={s.setupCheckLabel}>
                  Location:{" "}
                  <Text style={s.setupCheckValue}>
                    {locationStatus === "always"
                      ? "Always - auto-detection on"
                      : locationStatus === "foreground"
                        ? "While Using only - auto-detection off"
                        : locationStatus === "denied"
                          ? "Denied - auto-detection off"
                          : "Skipped - auto-detection off"}
                  </Text>
                </Text>
              </View>

              {/* Notifications */}
              <View style={s.setupCheckRow}>
                <Ionicons
                  name={
                    notifStatus === "granted" || reminderTime === "none"
                      ? "checkmark-circle"
                      : "alert-circle-outline"
                  }
                  size={18}
                  color={
                    notifStatus === "granted" || reminderTime === "none" ? SUCCESS : "#f59e0b"
                  }
                />
                <Text style={s.setupCheckLabel}>
                  Notifications:{" "}
                  <Text style={s.setupCheckValue}>
                    {notifStatus === "granted"
                      ? "Enabled"
                      : reminderTime === "none"
                        ? "Off (by choice)"
                        : "Skipped"}
                  </Text>
                </Text>
              </View>

              {/* Vehicle */}
              <View style={s.setupCheckRow}>
                <Ionicons name="checkmark-circle" size={18} color={SUCCESS} />
                <Text style={s.setupCheckLabel}>
                  Vehicle:{" "}
                  <Text style={s.setupCheckValue}>
                    {vehicleType === "car"
                      ? "Car (55p / 25p HMRC rate)"
                      : vehicleType === "van"
                        ? "Van (55p / 25p HMRC rate)"
                        : "Motorbike (24p HMRC rate)"}
                  </Text>
                </Text>
              </View>

              {/* Employer rate (only for employee / both) */}
              {(userIntent === "work" || userIntent === "both") &&
                (workType === "employee" || workType === "both") && (
                  <View style={s.setupCheckRow}>
                    <Ionicons
                      name={employerRate ? "checkmark-circle" : "alert-circle-outline"}
                      size={18}
                      color={employerRate ? SUCCESS : "#f59e0b"}
                    />
                    <Text style={s.setupCheckLabel}>
                      Employer rate:{" "}
                      <Text style={s.setupCheckValue}>
                        {employerRate ? `${employerRate}p/mile` : "Not set - update later in Profile"}
                      </Text>
                    </Text>
                  </View>
                )}

              {/* Goal (only if set) */}
              {weeklyGoal && (
                <View style={s.setupCheckRow}>
                  <Ionicons name="checkmark-circle" size={18} color={SUCCESS} />
                  <Text style={s.setupCheckLabel}>
                    Weekly goal:{" "}
                    <Text style={s.setupCheckValue}>{weeklyGoal} miles</Text>
                  </Text>
                </View>
              )}
            </View>

            {/* Support message */}
            <View style={s.supportCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={AMBER} />
              <Text style={s.supportCardText}>
                Got a question or something not working? I'm here to help. Tap{" "}
                <Text style={s.supportCardBold}>Help & Support</Text> in your profile, or email{" "}
                <Text style={s.supportCardBold}>support@mileclear.com</Text> any time.
              </Text>
            </View>

            <Button
              variant="hero"
              title="Start Your First Trip"
              icon="navigate"
              size="lg"
              onPress={() => handleFinish("trip")}
              loading={finishingSetup}
            />

            <TouchableOpacity
              style={s.dashboardLink}
              onPress={() => handleFinish("dashboard")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go to dashboard instead"
            >
              <Text style={s.dashboardLinkText}>
                or go to dashboard
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Step indicator dots */}
      <View style={s.dots}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[s.dot, step === i + 1 && s.dotActive]}
          />
        ))}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // Progress bar
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    width: "100%",
  },
  progressFill: {
    height: 3,
    backgroundColor: AMBER,
    borderRadius: 1.5,
  },

  // Skip-setup escape hatch (top-right, clears the status bar)
  skipSetup: {
    position: "absolute",
    top: 52,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingLeft: 10,
  },
  skipSetupText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_3,
  },

  // Step scroller
  stepScroller: {
    flex: 1,
  },
  stepPage: {
    flex: 1,
  },
  stepContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 16,
  },

  // Dot indicators
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dotActive: {
    width: 16,
    backgroundColor: AMBER,
  },

  // ── Pain (Before) step ───────────────────────────────────────
  painContent: {
    justifyContent: "center",
  },
  painIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  painHeading: {
    fontSize: 26,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    textAlign: "center",
    lineHeight: 34,
    marginBottom: 28,
  },
  painBullets: {
    gap: 16,
    marginBottom: 24,
  },
  painBullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 4,
  },
  painBulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f87171",
    marginTop: 6,
  },
  painBulletText: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 22,
    flex: 1,
  },
  painSecondary: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 16,
  },
  trustSignals: {
    gap: 8,
    marginBottom: 24,
  },
  trustSignalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  trustSignalText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },

  // ── Transform (After) step ───────────────────────────────────
  transformContent: {
    justifyContent: "center",
  },
  transformIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  transformHeading: {
    fontSize: 26,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    textAlign: "center",
    lineHeight: 34,
    marginBottom: 28,
  },
  transformBullets: {
    gap: 18,
    marginBottom: 24,
  },
  transformBullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
  },
  transformBulletBody: {
    flex: 1,
  },
  transformBulletTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 3,
  },
  transformBulletText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 19,
  },
  socialProofBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    marginBottom: 32,
  },
  socialProofText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },

  // ── Welcome step ───────────────────────────────────────────────
  welcomeLogoWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  welcomeLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  wordmarkRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
  },
  wordmarkMile: {
    fontSize: 26,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  wordmarkClear: {
    fontSize: 26,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  welcomeHeading: {
    fontSize: 24,
    fontFamily: fonts.light,
    color: TEXT_1,
    textAlign: "center",
    letterSpacing: -0.3,
    marginBottom: 8,
    lineHeight: 32,
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },

  // ── Section label ──────────────────────────────────────────────
  sectionLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  helperText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 17,
    marginTop: 8,
  },

  // ── Intent cards ───────────────────────────────────────────────
  intentCards: {
    gap: 10,
    marginBottom: 24,
  },
  intentCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  intentCardActive: {
    borderColor: "rgba(245, 166, 35, 0.5)",
    backgroundColor: "rgba(245, 166, 35, 0.04)",
  },
  intentIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  intentIconWrapActive: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderColor: "rgba(245, 166, 35, 0.25)",
  },
  intentBody: {
    flex: 1,
  },
  intentTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 2,
  },
  intentTitleActive: {
    color: AMBER,
  },
  intentDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 18,
  },

  // ── Work type sub-selection ────────────────────────────────────
  workTypeSection: {
    marginBottom: 24,
  },
  workTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  workTypeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  workTypeChipActive: {
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderColor: "rgba(245, 166, 35, 0.35)",
  },
  workTypeChipText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: TEXT_3,
  },
  workTypeChipTextActive: {
    color: AMBER,
    fontFamily: fonts.semibold,
  },

  // ── Shared step chrome ─────────────────────────────────────────
  stepIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  stepHeading: {
    fontSize: 26,
    fontFamily: fonts.light,
    color: TEXT_1,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 22,
    marginBottom: 28,
  },

  // ── Location permission step ───────────────────────────────────
  permissionCards: {
    gap: 10,
    marginBottom: 24,
  },
  permCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  permCardIcon: {
    marginTop: 2,
  },
  permCardBody: {
    flex: 1,
  },
  permCardTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 3,
  },
  permCardText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 19,
  },
  grantedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  grantedText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: SUCCESS,
  },
  deniedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ERROR_BG,
    borderWidth: 1,
    borderColor: ERROR_BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  deniedText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: "#f87171",
    flex: 1,
    lineHeight: 19,
  },
  deniedCard: {
    backgroundColor: ERROR_BG,
    borderWidth: 1,
    borderColor: ERROR_BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    gap: 10,
  },
  deniedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deniedTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: "#f87171",
  },
  deniedBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_1,
    lineHeight: 19,
  },
  deniedHelp: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
  },
  deniedSettingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(220, 38, 38, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.3)",
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 2,
  },
  deniedSettingsBtnText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: "#f87171",
  },

  // Button stack
  buttonStack: {
    gap: 10,
    marginTop: 8,
  },

  // ── Ready step ─────────────────────────────────────────────────
  readyContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  readyIconWrap: {
    marginBottom: 20,
  },
  readyHeading: {
    fontSize: 28,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 10,
  },
  readySubtitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  // "What happens next" three-step block
  nextStepsBlock: {
    gap: 10,
    marginBottom: 24,
    alignSelf: "stretch",
  },
  nextStepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nextStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(245, 166, 35, 0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  nextStepNumberText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  nextStepTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 2,
  },
  nextStepBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
  },

  // Pro tip card
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  tipIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  tipTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 2,
  },
  tipBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
  },

  // Discord community card
  discordCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(88, 101, 242, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(88, 101, 242, 0.22)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    alignSelf: "stretch",
  },
  discordIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(88, 101, 242, 0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  discordTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 2,
  },
  discordBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
  },

  setupHints: {
    gap: 10,
    marginBottom: 32,
    alignSelf: "stretch",
  },
  setupHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  setupHintText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    flex: 1,
  },
  setupCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  setupCheckLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  setupCheckValue: {
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  supportCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  supportCardText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: "#c0c8d4",
    flex: 1,
    lineHeight: 20,
  },
  supportCardBold: {
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  dashboardLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  dashboardLinkText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textDecorationLine: "underline",
  },
});
