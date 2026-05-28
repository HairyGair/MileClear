import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";
import { fetchReferralSummary, applyReferralCode } from "../lib/api/referrals";
import type { ReferralSummary } from "@mileclear/shared";

const AMBER = colors.amber;
const GREEN = colors.green;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const CARD = colors.surface;
const BORDER = colors.surfaceBorder;

function shareMessage(url: string): string {
  return `I'm using MileClear to track my miles and claim tax back automatically - it's free. Sign up with my link and you'll help me earn a free month of Pro: ${url}`;
}

export default function ReferScreen() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // "Have a code?" catch-up entry
  const [codeInput, setCodeInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchReferralSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(load);

  const onShare = useCallback(async () => {
    if (!summary) return;
    try {
      await Share.share({ message: shareMessage(summary.shareUrl) });
    } catch {
      // user cancelled / share unavailable
    }
  }, [summary]);

  const onApply = useCallback(async () => {
    const code = codeInput.trim();
    if (!code) return;
    setApplying(true);
    const result = await applyReferralCode(code);
    setApplying(false);
    if (result.ok) {
      setApplied(true);
      setCodeInput("");
      Alert.alert("Code applied", "Thanks! Your friend will earn their free month once you record your first trip.");
    } else {
      Alert.alert("Couldn't apply code", result.error ?? "That referral code isn't valid.");
    }
  }, [codeInput]);

  if (loading && !summary) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
      </View>
    );
  }

  const earned = summary?.earnedMonths ?? 0;
  const max = summary?.maxRewards ?? 3;
  const pending = summary?.pendingCount ?? 0;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Hero */}
      <View style={s.heroIconWrap}>
        <Ionicons name="gift" size={32} color={AMBER} />
      </View>
      <Text style={s.heroTitle}>Give MileClear, get Pro free</Text>
      <Text style={s.heroSub}>
        Invite up to {max} friends. For every one who signs up and records their first trip, you get a{" "}
        <Text style={s.bold}>free month of Pro</Text> - HMRC exports, business insights, the lot.
      </Text>

      {/* Progress */}
      <View style={s.progressCard}>
        <View style={s.progressRow}>
          <Text style={s.progressBig}>{earned}</Text>
          <Text style={s.progressOf}>/ {max}</Text>
          <Text style={s.progressLabel}>free months earned</Text>
        </View>
        <View style={s.dots}>
          {Array.from({ length: max }).map((_, i) => (
            <View
              key={i}
              style={[s.progDot, i < earned ? s.progDotEarned : i < earned + pending ? s.progDotPending : null]}
            />
          ))}
        </View>
        {pending > 0 && (
          <Text style={s.pendingNote}>
            {pending} friend{pending === 1 ? "" : "s"} signed up - you'll earn the month once they record a trip.
          </Text>
        )}
        {summary?.referralProUntil && (
          <Text style={s.creditNote}>
            Your referral Pro is active until {new Date(summary.referralProUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
          </Text>
        )}
      </View>

      {/* Code + share */}
      <Text style={s.sectionLabel}>YOUR INVITE CODE</Text>
      <TouchableOpacity style={s.codeBox} onPress={onShare} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Share your code ${summary?.code}`}>
        <Text style={s.codeText}>{summary?.code}</Text>
        <View style={s.copyPill}>
          <Ionicons name="share-outline" size={14} color={AMBER} />
          <Text style={s.copyPillText}>Share</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={s.shareBtn} onPress={onShare} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Share your invite link">
        <Ionicons name="share-outline" size={18} color="#0b0e14" />
        <Text style={s.shareBtnText}>Share invite link</Text>
      </TouchableOpacity>

      {/* How it works */}
      <View style={s.stepsCard}>
        <Text style={s.sectionLabel}>HOW IT WORKS</Text>
        {[
          { n: "1", t: "Share your link", b: "Send it to friends and colleagues who drive." },
          { n: "2", t: "They sign up + drive", b: "They join free and record their first trip." },
          { n: "3", t: "You get a free month", b: `Up to ${max} months of Pro, one per friend.` },
        ].map((step) => (
          <View key={step.n} style={s.stepRow}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{step.n}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>{step.t}</Text>
              <Text style={s.stepBody}>{step.b}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Invite statuses */}
      {summary && summary.referrals.length > 0 && (
        <View style={s.listCard}>
          <Text style={s.sectionLabel}>YOUR INVITES</Text>
          {summary.referrals.map((r, i) => {
            const isQualified = r.status === "qualified";
            const label =
              r.status === "qualified" ? "Free month earned" : r.status === "over_cap" ? "Joined (cap reached)" : "Signed up - not driven yet";
            return (
              <View key={i} style={s.inviteRow}>
                <Ionicons
                  name={isQualified ? "checkmark-circle" : "time-outline"}
                  size={18}
                  color={isQualified ? GREEN : TEXT_3}
                />
                <Text style={s.inviteLabel}>{label}</Text>
                <Text style={s.inviteDate}>
                  {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Have a code? (catch-up) */}
      {!applied && (
        <View style={s.applyCard}>
          <Text style={s.sectionLabel}>GOT A CODE FROM A FRIEND?</Text>
          <Text style={s.applyHint}>Enter it in your first week to credit the friend who invited you.</Text>
          <View style={s.applyRow}>
            <TextInput
              style={s.applyInput}
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.toUpperCase())}
              placeholder="CODE"
              placeholderTextColor={TEXT_3}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
              accessibilityLabel="Enter a friend's referral code"
            />
            <TouchableOpacity
              style={[s.applyBtn, (!codeInput.trim() || applying) && s.applyBtnDisabled]}
              onPress={onApply}
              disabled={!codeInput.trim() || applying}
              accessibilityRole="button"
              accessibilityLabel="Apply referral code"
            >
              {applying ? <ActivityIndicator size="small" color={AMBER} /> : <Text style={s.applyBtnText}>Apply</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: "center", alignItems: "center" },
  content: { padding: 20 },

  heroIconWrap: {
    width: 64, height: 64, borderRadius: 20, alignSelf: "center",
    backgroundColor: colors.amberDim, justifyContent: "center", alignItems: "center", marginTop: 8, marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontFamily: fonts.semibold, color: TEXT_1, textAlign: "center", marginBottom: 8 },
  heroSub: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, textAlign: "center", lineHeight: 21, marginBottom: 22 },
  bold: { fontFamily: fonts.semibold, color: AMBER },

  progressCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 22,
  },
  progressRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  progressBig: { fontSize: 34, fontFamily: fonts.semibold, color: AMBER },
  progressOf: { fontSize: 18, fontFamily: fonts.medium, color: TEXT_3 },
  progressLabel: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_2, marginLeft: 8 },
  dots: { flexDirection: "row", gap: 8, marginTop: 14 },
  progDot: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)" },
  progDotEarned: { backgroundColor: AMBER },
  progDotPending: { backgroundColor: colors.amberGlow },
  pendingNote: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, marginTop: 12, lineHeight: 17 },
  creditNote: { fontSize: 12, fontFamily: fonts.medium, color: GREEN, marginTop: 8 },

  sectionLabel: { fontSize: 12, fontFamily: fonts.semibold, color: TEXT_2, letterSpacing: 0.5, marginBottom: 10 },

  codeBox: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: "rgba(245,166,35,0.3)",
    borderStyle: "dashed", paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12,
  },
  codeText: { fontSize: 26, fontFamily: fonts.semibold, color: TEXT_1, letterSpacing: 3 },
  copyPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyPillText: { fontSize: 13, fontFamily: fonts.semibold, color: AMBER },

  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: AMBER, borderRadius: 12, paddingVertical: 15, marginBottom: 24,
  },
  shareBtnText: { fontSize: 15, fontFamily: fonts.semibold, color: "#0b0e14" },

  stepsCard: { marginBottom: 24 },
  stepRow: { flexDirection: "row", gap: 12, marginBottom: 14, alignItems: "flex-start" },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.amberDim, justifyContent: "center", alignItems: "center", marginTop: 1 },
  stepNumText: { fontSize: 13, fontFamily: fonts.semibold, color: AMBER },
  stepTitle: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_1, marginBottom: 2 },
  stepBody: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 18 },

  listCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 24 },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  inviteLabel: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: TEXT_2 },
  inviteDate: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3 },

  applyCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16 },
  applyHint: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, lineHeight: 17, marginBottom: 12 },
  applyRow: { flexDirection: "row", gap: 10 },
  applyInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: fonts.semibold, color: TEXT_1, letterSpacing: 2,
  },
  applyBtn: {
    paddingHorizontal: 20, justifyContent: "center", alignItems: "center",
    backgroundColor: colors.amberDim, borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,166,35,0.35)",
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { fontSize: 14, fontFamily: fonts.semibold, color: AMBER },
});
