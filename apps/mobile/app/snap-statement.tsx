/**
 * Snap your statement (Pro).
 *
 * A driver takes or picks a screenshot of a platform's earnings summary
 * (Uber weekly, Deliveroo statement, Amazon Flex week...). Text recognition
 * runs on the phone (Apple Vision on iOS, ML Kit on Android, see lib/ocr),
 * lib/ocr/statementParser reads platform, period and total, and the driver
 * checks every field before anything is saved.
 *
 * Saves through POST /earnings/statement with source "ocr" and an externalId
 * of platform + period + amount, so the same statement is never saved twice.
 */

import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { GIG_PLATFORMS, formatPence } from "@mileclear/shared";
import { recognizeText, isOcrAvailable } from "../lib/ocr";
import {
  parseStatementText,
  statementExternalId,
  type StatementParseResult,
} from "../lib/ocr/statementParser";
import { createStatementEarning, type CreateStatementEarningData } from "../lib/api/earnings";
import { isApiError } from "../lib/api";
import { isNetworkError } from "../lib/sync/errors";
import { getDatabase } from "../lib/db/index";
import { useUser } from "../lib/user/context";
import { usePaywall } from "../components/paywall";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { Button } from "../components/Button";
import { showSupportAlert } from "../lib/support";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

const BG = colors.bg;
const CARD_BG = colors.surface;
const BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

type Step = "pick" | "reading" | "confirm";

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

/** "2026-09-28" -> a local Date at midday (midday keeps it clear of BST edges). */
function fromIsoDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** A local Date -> "2026-09-28", the calendar day the driver picked. */
function toIsoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function confidenceMessage(result: StatementParseResult): string {
  if (result.rawLines.length === 0) {
    return "We couldn't read any text in that image. Fill in the figures below, or try a clearer screenshot.";
  }
  if (result.confidence === "high") return "Here's what we read. Check each figure before you save.";
  if (result.confidence === "medium") {
    return "We found the total, but not everything else. Fill in what's missing below.";
  }
  return "We couldn't tell which figure is your total. Pick it below or type it in.";
}

export default function SnapStatementScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { showPaywall } = usePaywall();
  const isPremium = !!user?.isPremium;
  const ocrAvailable = isOcrAvailable();

  const [step, setStep] = useState<Step>("pick");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<StatementParseResult | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  // Editable fields
  const [platform, setPlatform] = useState("");
  const [platformName, setPlatformName] = useState<string | null>(null);
  const [isRange, setIsRange] = useState(true);
  const [periodStart, setPeriodStart] = useState<Date | null>(null);
  const [periodEnd, setPeriodEnd] = useState<Date | null>(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setStep("pick");
    setImageUri(null);
    setResult(null);
    setShowRawText(false);
    setPlatform("");
    setPlatformName(null);
    setIsRange(true);
    setPeriodStart(null);
    setPeriodEnd(null);
    setAmount("");
  }, []);

  // ── Reading the image ─────────────────────────────────────────────────────

  const processImage = useCallback(async (uri: string) => {
    setImageUri(uri);
    setStep("reading");
    try {
      const lines = await recognizeText(uri);
      const parsed = parseStatementText(lines);
      setResult(parsed);
      setPlatform(parsed.platform ?? "");
      setPlatformName(parsed.platformName);
      setIsRange(parsed.periodKind !== "day");
      setPeriodStart(parsed.periodStart ? fromIsoDay(parsed.periodStart) : null);
      setPeriodEnd(parsed.periodEnd ? fromIsoDay(parsed.periodEnd) : null);
      setAmount(parsed.amountPence !== null ? (parsed.amountPence / 100).toFixed(2) : "");
      setStep("confirm");
    } catch {
      Alert.alert("That didn't work", "We couldn't read the image. Try again with a screenshot.");
      reset();
    }
  }, [reset]);

  const handleLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Photos access needed",
        "Allow access to your photos in Settings to pick a screenshot."
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (!picked.canceled && picked.assets[0]) {
      await processImage(picked.assets[0].uri);
    }
  }, [processImage]);

  const handleCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera access needed", "Allow camera access in Settings to take a photo.");
      return;
    }
    const taken = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (!taken.canceled && taken.assets[0]) {
      await processImage(taken.assets[0].uri);
    }
  }, [processImage]);

  // ── Saving ────────────────────────────────────────────────────────────────

  const save = useCallback(
    async (force: boolean) => {
      if (!platform) {
        Alert.alert("Pick a platform", "Choose which app or company paid you.");
        return;
      }
      const pounds = parseFloat(amount.replace(/[£,\s]/g, ""));
      if (!amount.trim() || isNaN(pounds) || pounds <= 0) {
        Alert.alert("Check the amount", "Enter the total you were paid, more than £0.");
        return;
      }
      const start = periodStart;
      const end = isRange ? periodEnd : periodStart;
      if (!start || !end) {
        Alert.alert("Add the dates", isRange ? "Add the first and last day this covers." : "Add the day this covers.");
        return;
      }
      const startDay = toIsoDay(start);
      const endDay = toIsoDay(end);
      if (endDay < startDay) {
        Alert.alert("Check the dates", "The last day must be on or after the first day.");
        return;
      }

      const amountPence = Math.round(pounds * 100);
      const otherName = platform === "other" ? platformName : null;
      const payload: CreateStatementEarningData = {
        platform,
        amountPence,
        periodStart: startDay,
        periodEnd: endDay,
        externalId: statementExternalId(platform, startDay, endDay, amountPence, otherName),
        notes: otherName ? `${otherName} statement` : undefined,
        force: force || undefined,
      };
      const platformLabel = otherName ?? PLATFORM_LABELS[platform] ?? platform;

      setSaving(true);
      try {
        const res = await createStatementEarning(payload);

        if (res.duplicate?.kind === "exact") {
          Alert.alert(
            "Already saved",
            "This statement is already in your earnings, so it hasn't been added again."
          );
          return;
        }
        if (res.duplicate?.kind === "similar") {
          Alert.alert(
            "You may already have this",
            `There's already a ${formatPence(amountPence)} ${platformLabel} earning for these dates. Save this one as well?`,
            [
              { text: "Don't save", style: "cancel" },
              { text: "Save anyway", onPress: () => { void save(true); } },
            ]
          );
          return;
        }

        const saved = res.data;
        if (saved) {
          // Show it straight away in the offline list too; hydration would
          // add it on the next sync otherwise.
          try {
            const db = await getDatabase();
            await db.runAsync(
              `INSERT OR IGNORE INTO earnings
                 (id, platform, amount_pence, period_start, period_end, source, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                saved.id,
                saved.platform,
                saved.amountPence,
                String(saved.periodStart),
                String(saved.periodEnd),
                saved.source,
                new Date().toISOString(),
              ]
            );
          } catch {
            // The server has it; the local copy is only a convenience.
          }
        }

        haptic("success");
        Alert.alert(
          "Saved",
          `${formatPence(amountPence)} from ${platformLabel} is now in your earnings.`,
          [
            { text: "Snap another", onPress: reset },
            { text: "Done", style: "cancel", onPress: () => router.back() },
          ]
        );
      } catch (err: unknown) {
        if (isApiError(err) && err.code === "PREMIUM_REQUIRED") {
          showPaywall("snap_statement");
        } else if (isNetworkError(err)) {
          Alert.alert(
            "No connection",
            "Your figures are still here. Try again when you're back online."
          );
        } else {
          showSupportAlert(
            "Couldn't save",
            err instanceof Error ? err.message : "Try again in a moment."
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [platform, platformName, amount, periodStart, periodEnd, isRange, reset, router, showPaywall]
  );

  // ── Gates ─────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Snap a statement" }} />
        <View style={styles.centreBox}>
          <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
        </View>
      </View>
    );
  }

  if (!isPremium) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Snap a statement" }} />
        <View style={styles.centreBox}>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={28} color={AMBER} />
          </View>
          <Text style={styles.centreTitle}>Snap a statement is part of Pro</Text>
          <Text style={styles.centreBody}>
            Take a screenshot of your weekly or daily earnings in Uber, Deliveroo, Just Eat,
            Amazon Flex or another app, and MileClear reads the total and the dates for you.
            You check it before anything is saved.
          </Text>
          <Button
            title="See Pro"
            icon="star"
            onPress={() => showPaywall("snap_statement")}
            style={{ alignSelf: "stretch" }}
          />
          <Button
            variant="ghost"
            title="Add an earning by hand"
            onPress={() => router.replace("/earning-form")}
            style={{ alignSelf: "stretch", marginTop: 10 }}
          />
        </View>
      </View>
    );
  }

  if (!ocrAvailable) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Snap a statement" }} />
        <View style={styles.centreBox}>
          <Ionicons name="camera-outline" size={44} color={TEXT_2} style={{ marginBottom: 16 }} />
          <Text style={styles.centreTitle}>Needs the latest app</Text>
          <Text style={styles.centreBody}>
            {Platform.OS === "android"
              ? "Reading screenshots isn't in the version of MileClear on this phone yet. Update the app from Google Play, then try again."
              : "Reading screenshots isn't in the version of MileClear on this phone. Update the app from the App Store, then try again."}
          </Text>
          <Button
            variant="ghost"
            title="Add an earning by hand"
            onPress={() => router.replace("/earning-form")}
            style={{ alignSelf: "stretch" }}
          />
        </View>
      </View>
    );
  }

  // ── Pick ──────────────────────────────────────────────────────────────────

  if (step === "pick") {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Snap a statement" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Snap your earnings</Text>
          <Text style={styles.subheading}>
            Open your earnings screen in Uber, Deliveroo, Just Eat, Amazon Flex or another app,
            take a screenshot of the week or the day, then choose it here.
          </Text>
          <Text style={styles.privacyNote}>
            The text is read on your phone. The image is never uploaded.
          </Text>

          <Button
            title="Choose a screenshot"
            icon="images-outline"
            onPress={handleLibrary}
            accessibilityLabel="Choose a screenshot of your earnings"
          />
          <Button
            variant="secondary"
            title="Take a photo"
            icon="camera-outline"
            onPress={handleCamera}
            style={{ marginTop: 10 }}
            accessibilityLabel="Take a photo of your earnings statement"
          />

          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>For the best result</Text>
            <Text style={styles.tipsLine}>Make sure the total and the dates are on screen.</Text>
            <Text style={styles.tipsLine}>One week or one day per screenshot.</Text>
            <Text style={styles.tipsLine}>A screenshot reads better than a photo of a screen.</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  if (step === "reading") {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Snap a statement" }} />
        <View style={styles.centreBox}>
          <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Reading" />
          <Text style={[styles.centreBody, { marginTop: 16 }]}>Reading your screenshot...</Text>
        </View>
      </View>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  const showCandidates =
    !!result && result.amountCandidates.length > 0 && result.amountPence === null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: "Check and save" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.thumbnail}
            resizeMode="contain"
            accessibilityLabel="Your screenshot"
          />
        )}

        {result && (
          <View style={styles.notice}>
            <Ionicons
              name={result.confidence === "high" ? "checkmark-circle-outline" : "alert-circle-outline"}
              size={18}
              color={result.confidence === "high" ? colors.green : AMBER}
            />
            <Text style={styles.noticeText}>{confidenceMessage(result)}</Text>
          </View>
        )}

        {/* Platform */}
        <Text style={styles.label}>Platform</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {GIG_PLATFORMS.map((p) => {
            const active = platform === p.value;
            const label = p.value === "other" && platformName && active ? platformName : p.label;
            return (
              <TouchableOpacity
                key={p.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  setPlatform(p.value);
                  if (p.value !== "other") setPlatformName(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${label} platform`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Amount */}
        <Text style={styles.label}>Total you were paid</Text>
        {showCandidates && (
          <View style={styles.candidateBox}>
            <Text style={styles.candidateHint}>Figures on your screenshot. Tap the total:</Text>
            <View style={styles.candidateWrap}>
              {result!.amountCandidates.map((c) => {
                const value = (c.amountPence / 100).toFixed(2);
                const active = amount === value;
                return (
                  <TouchableOpacity
                    key={c.amountPence}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setAmount(value)}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatPence(c.amountPence)}${c.label ? `, ${c.label}` : ""}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {formatPence(c.amountPence)}
                      {c.label ? ` · ${c.label.slice(0, 24)}` : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix} accessible={false}>£</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={TEXT_3}
            keyboardType="decimal-pad"
            accessibilityLabel="Total in pounds"
          />
        </View>
        {result?.tipsPence != null && (
          <Text style={styles.helper}>
            Tips shown on the screenshot: {formatPence(result.tipsPence)}. Most apps include tips in
            the total, so check yours does before adding them again.
          </Text>
        )}

        {/* Period */}
        <Text style={styles.label}>Covers</Text>
        <View style={styles.segment}>
          {[
            { key: "day", label: "One day", value: false },
            { key: "range", label: "A week or range", value: true },
          ].map((opt) => {
            const active = isRange === opt.value;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => setIsRange(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <DateTimePickerField
          label={isRange ? "First day" : "Day"}
          value={periodStart}
          onChange={setPeriodStart}
          maximumDate={new Date()}
          mode="date"
          hideNow
        />
        {isRange && (
          <DateTimePickerField
            label="Last day"
            value={periodEnd}
            onChange={setPeriodEnd}
            maximumDate={new Date()}
            mode="date"
            hideNow
          />
        )}

        <Button
          title="Save earning"
          icon="checkmark"
          onPress={() => { void save(false); }}
          loading={saving}
          style={{ marginTop: 28 }}
        />
        <Button
          variant="ghost"
          title="Try another screenshot"
          onPress={reset}
          disabled={saving}
          style={{ marginTop: 10 }}
        />

        {result && result.rawLines.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <TouchableOpacity
              onPress={() => setShowRawText((v) => !v)}
              style={styles.rawToggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRawText }}
            >
              <Text style={styles.rawToggleText}>What we read</Text>
              <Ionicons name={showRawText ? "chevron-up" : "chevron-down"} size={14} color={TEXT_2} />
            </TouchableOpacity>
            {showRawText && (
              <View style={styles.rawBox}>
                {result.rawLines.map((line, i) => (
                  <Text key={i} style={styles.rawLine}>{line}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  centreBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  lockBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  centreTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 10,
  },
  centreBody: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  heading: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginTop: 12,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 21,
    marginBottom: 10,
  },
  privacyNote: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_3,
    marginBottom: 28,
  },
  tipsBox: {
    marginTop: 28,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 6,
  },
  tipsTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 2,
  },
  tipsLine: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 19,
  },
  thumbnail: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    marginBottom: 12,
  },
  notice: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_1,
    lineHeight: 19,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 6,
    marginTop: 18,
  },
  helper: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 18,
    marginTop: 6,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  chipText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  chipTextActive: {
    color: BG,
  },
  candidateBox: {
    marginBottom: 10,
  },
  candidateHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginBottom: 8,
  },
  candidateWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyPrefix: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginRight: 8,
  },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: TEXT_1,
    borderWidth: 1,
    borderColor: BORDER,
  },
  amountInput: {
    flex: 1,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 3,
    marginBottom: 4,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  segmentItemActive: {
    backgroundColor: colors.amberDim,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  segmentTextActive: {
    color: AMBER,
  },
  rawToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  rawToggleText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  rawBox: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginTop: 6,
  },
  rawLine: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 18,
  },
});
