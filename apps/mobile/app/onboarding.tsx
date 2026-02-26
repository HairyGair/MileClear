import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Button } from "../components/Button";
import { createVehicle } from "../lib/api/vehicles";
import { getDatabase } from "../lib/db/index";
import type { FuelType, VehicleType } from "@mileclear/shared";
import { FUEL_TYPES, VEHICLE_TYPES } from "@mileclear/shared";

// ── Constants ────────────────────────────────────────────────────────────────

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";
const INPUT_BG = "rgba(255,255,255,0.03)";
const INPUT_BORDER = "rgba(255,255,255,0.06)";
const INPUT_FOCUSED_BORDER = "rgba(245, 166, 35, 0.35)";
const ERROR_BG = "rgba(220, 38, 38, 0.1)";
const ERROR_BORDER = "rgba(220, 38, 38, 0.2)";

const TOTAL_STEPS = 4;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Human-readable labels mirroring those in profile.tsx
const FUEL_LABELS: Record<FuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  electric: "Electric",
  hybrid: "Hybrid",
};

const VEHICLE_LABELS: Record<VehicleType, string> = {
  car: "Car",
  motorbike: "Motorbike",
  van: "Van",
};

// ── How it works cards ────────────────────────────────────────────────────────

interface HowItWorksCard {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const HOW_IT_WORKS: HowItWorksCard[] = [
  {
    icon: "play-circle-outline",
    title: "Start a Shift",
    body: "Tap once to begin tracking. GPS records every mile automatically while you drive.",
  },
  {
    icon: "list-outline",
    title: "Review Trips",
    body: "After each shift, quickly classify your trips as business or personal.",
  },
  {
    icon: "calculator-outline",
    title: "Save on Tax",
    body: "HMRC mileage deductions are calculated automatically — up to 45p per mile.",
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;

  const [step, setStep] = useState(1);

  // Vehicle form state
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [yearText, setYearText] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [vehicleError, setVehicleError] = useState("");
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Location state
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "requesting" | "granted" | "denied"
  >("idle");
  const [finishingSetup, setFinishingSetup] = useState(false);

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const animateProgress = useCallback((toStep: number) => {
    Animated.spring(progressAnim, {
      toValue: toStep / TOTAL_STEPS,
      tension: 180,
      friction: 18,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  const goToStep = useCallback((target: number) => {
    const clamped = Math.min(Math.max(target, 1), TOTAL_STEPS);
    setStep(clamped);
    animateProgress(clamped);
    scrollRef.current?.scrollTo({ x: (clamped - 1) * SCREEN_WIDTH, animated: true });
  }, [animateProgress]);

  const goNext = useCallback(() => goToStep(step + 1), [goToStep, step]);

  // ── Vehicle submission ─────────────────────────────────────────────────────

  const handleAddVehicle = useCallback(async () => {
    setVehicleError("");

    if (!make.trim()) {
      setVehicleError("Please enter the vehicle make.");
      return;
    }
    if (!model.trim()) {
      setVehicleError("Please enter the vehicle model.");
      return;
    }

    const year = yearText.trim() ? parseInt(yearText.trim(), 10) : undefined;
    if (yearText.trim() && (isNaN(year!) || year! < 1900 || year! > new Date().getFullYear() + 1)) {
      setVehicleError("Enter a valid 4-digit year.");
      return;
    }

    setAddingVehicle(true);
    try {
      await createVehicle({
        make: make.trim(),
        model: model.trim(),
        year,
        fuelType,
        vehicleType,
        isPrimary: true,
      });
      goNext();
    } catch (err: unknown) {
      setVehicleError(
        err instanceof Error ? err.message : "Failed to add vehicle. Check your connection."
      );
    } finally {
      setAddingVehicle(false);
    }
  }, [make, model, yearText, fuelType, vehicleType, goNext]);

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

      const { status: bgStatus } =
        await Location.requestBackgroundPermissionsAsync();

      setLocationStatus(bgStatus === "granted" ? "granted" : "denied");
    } catch {
      setLocationStatus("denied");
    }
  }, []);

  // ── Complete onboarding ────────────────────────────────────────────────────

  const handleFinishSetup = useCallback(async () => {
    setFinishingSetup(true);
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('onboarding_complete', 'true')"
      );
      router.replace("/(tabs)/dashboard");
    } catch {
      Alert.alert(
        "Something went wrong",
        "Could not save your setup progress. You can still continue.",
        [{ text: "Continue", onPress: () => router.replace("/(tabs)/dashboard") }]
      );
    } finally {
      setFinishingSetup(false);
    }
  }, [router]);

  // ── Input style helper ─────────────────────────────────────────────────────

  const inputStyle = (field: string) => [
    s.input,
    focusedField === field && s.inputFocused,
  ];

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

      {/* Steps rendered in a horizontal ScrollView (disabled swipe — nav is code-controlled) */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={s.stepScroller}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1: Welcome ──────────────────────────────────────── */}
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

            <Text style={s.welcomeHeading}>Welcome to MileClear</Text>
            <Text style={s.welcomeSubtitle}>
              Track your mileage, save on tax.
            </Text>

            <View style={s.welcomeFeatureList}>
              {[
                "Automatic GPS trip tracking",
                "HMRC deductions calculated for you",
                "Built for UK gig workers",
              ].map((item) => (
                <View key={item} style={s.welcomeFeatureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                  <Text style={s.welcomeFeatureText}>{item}</Text>
                </View>
              ))}
            </View>

            <Button
              variant="hero"
              title="Get Started"
              icon="arrow-forward"
              size="lg"
              onPress={goNext}
            />
          </ScrollView>
        </View>

        {/* ── Step 2: Add Vehicle ──────────────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={s.stepContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.stepIconWrap}>
              <Ionicons name="car-outline" size={32} color={AMBER} />
            </View>

            <Text style={s.stepHeading}>Add Your Vehicle</Text>
            <Text style={s.stepSubtitle}>
              Accurate HMRC mileage calculations require your vehicle type.
            </Text>

            {vehicleError ? (
              <View style={s.errorWrap}>
                <Text style={s.errorText}>{vehicleError}</Text>
              </View>
            ) : null}

            {/* Make */}
            <Text style={s.label}>Make</Text>
            <TextInput
              style={inputStyle("make")}
              value={make}
              onChangeText={setMake}
              onFocus={() => setFocusedField("make")}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. Ford"
              placeholderTextColor={TEXT_3}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />

            {/* Model */}
            <Text style={s.label}>Model</Text>
            <TextInput
              style={inputStyle("model")}
              value={model}
              onChangeText={setModel}
              onFocus={() => setFocusedField("model")}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. Focus"
              placeholderTextColor={TEXT_3}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />

            {/* Year */}
            <Text style={s.label}>Year (optional)</Text>
            <TextInput
              style={inputStyle("year")}
              value={yearText}
              onChangeText={setYearText}
              onFocus={() => setFocusedField("year")}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. 2021"
              placeholderTextColor={TEXT_3}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="done"
            />

            {/* Vehicle type picker */}
            <Text style={s.label}>Vehicle Type</Text>
            <View style={s.segmentRow}>
              {(VEHICLE_TYPES as readonly VehicleType[]).map((vt) => (
                <TouchableOpacity
                  key={vt}
                  style={[
                    s.segmentOption,
                    vehicleType === vt && s.segmentOptionActive,
                  ]}
                  onPress={() => setVehicleType(vt)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      s.segmentOptionText,
                      vehicleType === vt && s.segmentOptionTextActive,
                    ]}
                  >
                    {VEHICLE_LABELS[vt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fuel type picker */}
            <Text style={[s.label, { marginTop: 4 }]}>Fuel Type</Text>
            <View style={[s.segmentRow, s.segmentRowWrap]}>
              {(FUEL_TYPES as readonly FuelType[]).map((ft) => (
                <TouchableOpacity
                  key={ft}
                  style={[
                    s.segmentOption,
                    s.segmentOptionHalf,
                    fuelType === ft && s.segmentOptionActive,
                  ]}
                  onPress={() => setFuelType(ft)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      s.segmentOptionText,
                      fuelType === ft && s.segmentOptionTextActive,
                    ]}
                  >
                    {FUEL_LABELS[ft]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.buttonStack}>
              <Button
                title="Add Vehicle"
                icon="checkmark"
                size="lg"
                onPress={handleAddVehicle}
                loading={addingVehicle}
              />
              <Button
                variant="ghost"
                title="Skip for now"
                onPress={goNext}
                disabled={addingVehicle}
              />
            </View>
          </ScrollView>
        </View>

        {/* ── Step 3: How It Works ─────────────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={s.stepContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.stepIconWrap}>
              <Ionicons name="information-circle-outline" size={32} color={AMBER} />
            </View>

            <Text style={s.stepHeading}>How It Works</Text>
            <Text style={s.stepSubtitle}>
              Everything you need to stay on top of your mileage.
            </Text>

            <View style={s.howItWorksCards}>
              {HOW_IT_WORKS.map((card, index) => (
                <View key={card.title} style={s.howCard}>
                  <View style={s.howCardIconWrap}>
                    <Text style={s.howCardStep}>{index + 1}</Text>
                    <Ionicons name={card.icon} size={24} color={AMBER} />
                  </View>
                  <View style={s.howCardBody}>
                    <Text style={s.howCardTitle}>{card.title}</Text>
                    <Text style={s.howCardText}>{card.body}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Button
              title="Next"
              icon="arrow-forward"
              size="lg"
              onPress={goNext}
            />
          </ScrollView>
        </View>

        {/* ── Step 4: Location Permission ──────────────────────────── */}
        <View style={[s.stepPage, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={s.stepContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.locationIconOuter}>
              <View style={s.locationIconInner}>
                <Ionicons name="location-outline" size={40} color={AMBER} />
              </View>
            </View>

            <Text style={s.stepHeading}>Enable Location</Text>
            <Text style={s.stepSubtitle}>
              MileClear uses GPS to automatically track your trips while you
              drive — no manual logging required.
            </Text>

            {/* Explanation cards */}
            <View style={s.permissionCards}>
              <View style={s.permCard}>
                <Ionicons name="navigate-outline" size={20} color={AMBER} style={s.permCardIcon} />
                <View style={s.permCardBody}>
                  <Text style={s.permCardTitle}>Foreground location</Text>
                  <Text style={s.permCardText}>
                    Tracks your route while you have the app open.
                  </Text>
                </View>
              </View>
              <View style={s.permCard}>
                <Ionicons name="radio-button-on-outline" size={20} color={AMBER} style={s.permCardIcon} />
                <View style={s.permCardBody}>
                  <Text style={s.permCardTitle}>Background location</Text>
                  <Text style={s.permCardText}>
                    Continues tracking with the screen off or app minimised.
                  </Text>
                </View>
              </View>
            </View>

            {locationStatus === "granted" && (
              <View style={s.grantedBanner}>
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                <Text style={s.grantedText}>Location access enabled</Text>
              </View>
            )}

            {locationStatus === "denied" && (
              <View style={s.deniedBanner}>
                <Ionicons name="warning-outline" size={20} color="#f87171" />
                <Text style={s.deniedText}>
                  Location denied — you can enable it later in Settings.
                </Text>
              </View>
            )}

            <View style={s.buttonStack}>
              {locationStatus !== "granted" && (
                <Button
                  title={
                    locationStatus === "requesting"
                      ? "Requesting..."
                      : "Enable Location"
                  }
                  icon="location-outline"
                  size="lg"
                  onPress={handleRequestLocation}
                  loading={locationStatus === "requesting"}
                  disabled={locationStatus === "denied"}
                />
              )}

              <Button
                variant={locationStatus === "granted" ? "hero" : "primary"}
                title="Finish Setup"
                icon="checkmark-circle-outline"
                size="lg"
                onPress={handleFinishSetup}
                loading={finishingSetup}
              />

              {locationStatus === "idle" && (
                <Button
                  variant="ghost"
                  title="Maybe Later"
                  onPress={handleFinishSetup}
                  disabled={finishingSetup}
                />
              )}
            </View>
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
    paddingTop: 40,
    paddingBottom: 16,
  },

  // Dot indicators
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dotActive: {
    width: 20,
    backgroundColor: AMBER,
  },

  // ── Welcome step ───────────────────────────────────────────────
  welcomeLogoWrap: {
    alignItems: "center",
    marginBottom: 20,
  },
  welcomeLogo: {
    width: 80,
    height: 80,
    borderRadius: 20,
  },
  wordmarkRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 32,
  },
  wordmarkMile: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  wordmarkClear: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  welcomeHeading: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  welcomeSubtitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 36,
    lineHeight: 24,
  },
  welcomeFeatureList: {
    gap: 12,
    marginBottom: 40,
    paddingHorizontal: 4,
  },
  welcomeFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  welcomeFeatureText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
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

  // ── Form elements ──────────────────────────────────────────────
  label: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
    marginBottom: 18,
  },
  inputFocused: {
    borderColor: INPUT_FOCUSED_BORDER,
  },
  errorWrap: {
    backgroundColor: ERROR_BG,
    borderWidth: 1,
    borderColor: ERROR_BORDER,
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#f87171",
    textAlign: "center",
  },

  // Segmented picker
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  segmentRowWrap: {
    flexWrap: "wrap",
  },
  segmentOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
  },
  segmentOptionHalf: {
    flexBasis: "45%",
    flexGrow: 0,
  },
  segmentOptionActive: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  segmentOptionText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  segmentOptionTextActive: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },

  // Button stack
  buttonStack: {
    gap: 10,
    marginTop: 8,
  },

  // ── How It Works step ──────────────────────────────────────────
  howItWorksCards: {
    gap: 12,
    marginBottom: 32,
  },
  howCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
    }),
  },
  howCardIconWrap: {
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    minWidth: 36,
  },
  howCardStep: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_3,
    letterSpacing: 0.3,
  },
  howCardBody: {
    flex: 1,
  },
  howCardTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 4,
  },
  howCardText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 20,
  },

  // ── Location permission step ───────────────────────────────────
  locationIconOuter: {
    alignSelf: "flex-start",
    marginBottom: 24,
  },
  locationIconInner: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
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
    color: "#10b981",
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
});
