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
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Button } from "../components/Button";
import { updateProfile } from "../lib/api/user";
import { getDatabase } from "../lib/db/index";
import { useMode } from "../lib/mode/context";
import type { WorkType } from "@mileclear/shared";

// ── Constants ────────────────────────────────────────────────────────────────

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const ERROR_BG = "rgba(220, 38, 38, 0.1)";
const ERROR_BORDER = "rgba(220, 38, 38, 0.2)";
const SUCCESS = "#10b981";

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
  const { setMode: setAppMode } = useMode();

  // Location state
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "requesting" | "granted" | "denied"
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
      const { status: fgStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (fgStatus !== "granted") {
        setLocationStatus("denied");
        return;
      }

      // Foreground granted — that's enough to proceed.
      // Try background but don't require it (may fail in Expo Go too).
      try {
        await Location.requestBackgroundPermissionsAsync();
      } catch {
        // Expected in Expo Go — foreground-only is fine
      }

      setLocationStatus("granted");
    } catch {
      setLocationStatus("denied");
    }
  }, []);

  // Re-check permission when returning from Settings (user may have enabled it there)
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || locationStatus !== "denied") return;
      try {
        const fg = await Location.getForegroundPermissionsAsync();
        if (fg.status === "granted") {
          setLocationStatus("granted");
        }
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

        // Save intent to server (fire-and-forget)
        if (userIntent) {
          updateProfile({
            userIntent,
            ...(userIntent !== "personal" && { workType }),
          }).catch(() => {});
        }

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
    [router, userIntent, workType, setAppMode, reminderTime, weeklyGoal]
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
                  No records means no tax deduction at year-end
                </Text>
              </View>
              <View style={s.painBullet}>
                <View style={s.painBulletDot} />
                <Text style={s.painBulletText}>
                  Scrambling through receipts and bank statements every April
                </Text>
              </View>
              <View style={s.painBullet}>
                <View style={s.painBulletDot} />
                <Text style={s.painBulletText}>
                  Every forgotten mile is 45p lost in HMRC deductions
                </Text>
              </View>
            </View>

            <Text style={s.painSecondary}>
              Or maybe you just want a record of every journey you take.
            </Text>

            {/* Trust signals */}
            <View style={s.trustSignals}>
              <View style={s.trustSignalRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={SUCCESS} />
                <Text style={s.trustSignalText}>Free forever for trip tracking</Text>
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
                  <Text style={s.transformBulletTitle}>Automatic GPS tracking</Text>
                  <Text style={s.transformBulletText}>
                    Start driving and we'll record your route in the background
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
                Trusted by gig workers across the UK
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

            <Text style={s.stepHeading}>Enable Location</Text>
            <Text style={s.stepSubtitle}>
              This is how MileClear tracks your trips automatically — GPS records your route while you drive.
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
                    Continues tracking with the screen off. Required for automatic trip detection.
                  </Text>
                </View>
              </View>
            </View>

            {locationStatus === "granted" && (
              <View style={s.grantedBanner}>
                <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                <Text style={s.grantedText}>Location access enabled</Text>
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
              {locationStatus !== "granted" && locationStatus !== "denied" && (
                <Button
                  variant="hero"
                  title={
                    locationStatus === "requesting"
                      ? "Requesting..."
                      : "Enable Location"
                  }
                  icon="location-outline"
                  size="lg"
                  onPress={handleRequestLocation}
                  loading={locationStatus === "requesting"}
                />
              )}

              <Button
                variant={locationStatus === "granted" ? "hero" : "primary"}
                title={locationStatus === "denied" ? "Continue without auto-detection" : "Continue"}
                icon="arrow-forward"
                size="lg"
                onPress={goNext}
              />

              {locationStatus === "idle" && (
                <Button
                  variant="ghost"
                  title="Skip for now"
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
                  <Text style={s.permCardTitle}>Trip detection</Text>
                  <Text style={s.permCardText}>
                    Get notified when we detect you're driving so you can start recording.
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
              MileClear is ready to track your first trip. You can add your vehicle and tweak settings from the dashboard anytime.
            </Text>

            {/* Quick setup hints */}
            <View style={s.setupHints}>
              <View style={s.setupHint}>
                <Ionicons name="car-outline" size={18} color={TEXT_2} />
                <Text style={s.setupHintText}>
                  Add your vehicle for accurate HMRC rates
                </Text>
              </View>
              <View style={s.setupHint}>
                <Ionicons name="bluetooth" size={18} color={TEXT_2} />
                <Text style={s.setupHintText}>
                  Connect car Bluetooth for auto-trip detection
                </Text>
              </View>
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 22,
    flex: 1,
  },
  painSecondary: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 3,
  },
  transformBulletText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  wordmarkClear: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  welcomeHeading: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    textAlign: "center",
    letterSpacing: -0.3,
    marginBottom: 8,
    lineHeight: 32,
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },

  // ── Section label ──────────────────────────────────────────────
  sectionLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    marginBottom: 2,
  },
  intentTitleActive: {
    color: AMBER,
  },
  intentDesc: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_3,
  },
  workTypeChipTextActive: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 3,
  },
  permCardText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f87171",
  },
  deniedBody: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
    lineHeight: 19,
  },
  deniedHelp: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 10,
  },
  readySubtitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 28,
    paddingHorizontal: 8,
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    flex: 1,
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#c0c8d4",
    flex: 1,
    lineHeight: 20,
  },
  supportCardBold: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  dashboardLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  dashboardLinkText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textDecorationLine: "underline",
  },
});
