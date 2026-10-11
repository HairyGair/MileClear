// The consent sheet (Accountant mode phase 1, SPEC-UX 2.1, SPEC-VISUAL 6.1).
//
// Opened from a practice's invite (email link, push, Home, Your accountant)
// with ?invite= or ?linkId=, or from a practice's join link with ?code=.
// Nothing is shared until the driver taps "Share with <firm>" here. The one
// amber button names the firm on purpose; "Not now" at the top right closes
// it and changes nothing.

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../components/Button";
import { PracticeMark } from "../components/practice/PracticeMark";
import { PracticeChip } from "../components/practice/OutlineChip";
import { ShareScopeRows } from "../components/practice/ShareScopeRows";
import { useAuth } from "../lib/auth/context";
import { isApiError } from "../lib/api/apiError";
import {
  consentToPractice,
  lookupPractice,
  reportPractice,
  type PracticeForDriver,
  type ShareScopes,
} from "../lib/api/practice";
import { durationLine, longDate, practiceSubline } from "../lib/practice/logic";
import { savePendingConsent } from "../lib/practice/pending";
import { setPracticeFlash } from "../lib/practice/flash";
import { haptic } from "../lib/haptics";
import { colors, fonts, fontScaleCap, radii, spacing } from "../lib/theme";

type View_ =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "error"; message: string }
  | { kind: "expired" }
  | { kind: "not_found"; message: string }
  | { kind: "info"; practice: PracticeForDriver; title: string; body: string }
  | {
      kind: "ask";
      practice: PracticeForDriver;
      target: { linkId: string } | { code: string };
      endsAt: string | null;
      isEmployee: boolean;
      fromPractice: boolean;
    };

function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v || undefined;
}

export default function PracticeConsentScreen() {
  const params = useLocalSearchParams<{ invite?: string; code?: string; linkId?: string; from?: string }>();
  const invite = param(params.invite);
  const code = param(params.code)?.toUpperCase();
  const linkId = param(params.linkId);
  const from = param(params.from);
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [view, setView] = useState<View_>({ kind: "loading" });
  const [scopes, setScopes] = useState<ShareScopes>({ shareEarnings: true, shareExpenses: true, sharePersonalTrips: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const res = await lookupPractice({ invite, code, linkId });
      if (res.link) {
        const l = res.link;
        const firm = l.practice.name;
        switch (l.state) {
          case "asking":
          case "ended":
          case "stopped":
            setScopes({
              shareEarnings: l.shareEarnings,
              shareExpenses: l.shareExpenses,
              sharePersonalTrips: l.state === "asking" ? false : l.sharePersonalTrips,
            });
            setView({
              kind: "ask",
              practice: l.practice,
              target: { linkId: l.id },
              endsAt: l.state === "asking" ? l.endsAt : null,
              isEmployee: res.isEmployee,
              // Sharing again after an ending goes straight back live.
              fromPractice: l.state !== "asking" || l.startedBy === "practice",
            });
            return;
          case "asking_expired":
            setView({ kind: "expired" });
            return;
          case "sharing":
            setView({
              kind: "info",
              practice: l.practice,
              title: `You're sharing with ${firm}`,
              body: `Until ${longDate(l.endsAt)}. You can see what they look at in More > Your accountant.`,
            });
            return;
          case "waiting_for_practice":
            setView({
              kind: "info",
              practice: l.practice,
              title: `We've asked ${firm} to accept you`,
              body: "Nothing is shared until they do. You'll get a notification.",
            });
            return;
          case "paused":
            setView({
              kind: "info",
              practice: l.practice,
              title: `${firm}'s account is paused`,
              body: "Nothing is being shared.",
            });
            return;
          default:
            setView({ kind: "not_found", message: "This request is no longer open." });
            return;
        }
      }
      setView({
        kind: "ask",
        practice: res.practice,
        target: { code: code! },
        endsAt: res.endsAt,
        isEmployee: res.isEmployee,
        fromPractice: false,
      });
    } catch (err) {
      if (isApiError(err) && err.statusCode === 410) return setView({ kind: "expired" });
      if (isApiError(err) && err.statusCode === 404) {
        return setView({ kind: "not_found", message: err.message || "This request is not recognised." });
      }
      setView({ kind: "error", message: "Couldn't load. Check your connection and try again." });
    }
  }, [invite, code, linkId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      // Keep the invite so Home can open this again once they're signed in.
      if (invite || code) void savePendingConsent({ invite, code });
      setView({ kind: "signed_out" });
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load, invite, code]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard" as never);
  }, []);

  const share = useCallback(async () => {
    if (view.kind !== "ask") return;
    setSaving(true);
    try {
      const res = await consentToPractice({ ...scopes, ...view.target });
      haptic("success");
      const firm = res.practiceName || view.practice.name;
      setPracticeFlash(
        res.state === "sharing"
          ? `Shared with ${firm}. You can see what they look at in More > Your accountant.`
          : `We've asked ${firm} to accept you. Nothing is shared until they do.`
      );
      close();
      if (from !== "accountant") router.push("/accountant" as never);
    } catch (err) {
      if (isApiError(err) && err.statusCode === 410) {
        setView({ kind: "expired" });
      } else {
        Alert.alert("Couldn't share", isApiError(err) ? err.message : "Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }, [view, scopes, close, from]);

  const report = useCallback(() => {
    if (view.kind !== "ask" || !("linkId" in view.target)) {
      // A join link the driver opened themselves: nothing to report, just close.
      close();
      return;
    }
    const target = view.target;
    Alert.alert(
      "Report this request?",
      `We'll end the request and check ${view.practice.name}. Nothing is shared.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: async () => {
            try {
              await reportPractice(target.linkId);
              Alert.alert("Thanks for telling us", "We've ended the request. Nothing was shared.");
              close();
            } catch {
              Alert.alert("Couldn't report", "Check your connection and try again.");
            }
          },
        },
      ]
    );
  }, [view, close]);

  const firm = view.kind === "ask" || view.kind === "info" ? view.practice.name : "";

  return (
    <View style={[s.root, { paddingBottom: 0 }]}>
      <View style={s.header}>
        <View style={s.grabber} />
        <Pressable
          onPress={close}
          style={s.notNow}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={8}
        >
          <Text style={s.notNowText} maxFontSizeMultiplier={fontScaleCap.body}>
            Not now
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
          Share with your accountant
        </Text>

        {view.kind === "loading" ? (
          <ActivityIndicator color={colors.text2} style={{ marginTop: spacing.xxxl }} />
        ) : null}

        {view.kind === "signed_out" ? (
          <Message
            icon="log-in-outline"
            title="Sign in to answer"
            body="Sign in or create your free account with the email the request was sent to. We'll open it again for you."
            action={{ label: "Sign in", onPress: () => router.replace("/(auth)/login" as never) }}
          />
        ) : null}

        {view.kind === "expired" ? (
          <Message icon="time-outline" title="This request has expired." body="Ask your accountant to send a new one." />
        ) : null}

        {view.kind === "not_found" ? (
          <Message icon="help-circle-outline" title="We couldn't find this request" body={view.message} />
        ) : null}

        {view.kind === "error" ? (
          <Message icon="cloud-offline-outline" title="Couldn't load" body={view.message} action={{ label: "Try again", onPress: load }} />
        ) : null}

        {view.kind === "info" ? (
          <>
            <IdentityCard practice={view.practice} />
            <Message icon="checkmark-circle-outline" title={view.title} body={view.body} />
          </>
        ) : null}

        {view.kind === "ask" ? (
          <>
            <IdentityCard practice={view.practice} />

            <Text style={s.section} maxFontSizeMultiplier={fontScaleCap.heading}>
              They&apos;ll be able to see
            </Text>
            <ShareScopeRows scopes={scopes} onChange={setScopes} isEmployee={view.isEmployee} />

            <Text style={s.section} maxFontSizeMultiplier={fontScaleCap.heading}>
              They can&apos;t
            </Text>
            {["Change or delete anything", "See where you went on personal trips"].map((line) => (
              <View key={line} style={s.cantRow}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.text2} accessible={false} />
                <Text style={s.cantText} maxFontSizeMultiplier={fontScaleCap.body}>
                  {line}
                </Text>
              </View>
            ))}

            <Text style={s.duration} maxFontSizeMultiplier={fontScaleCap.body}>
              {view.fromPractice ? durationLine(view.endsAt) : "Sharing starts when they accept you. We'll ask you before it ends."}
              {"\n"}Stop any time in More &gt; Your accountant.
            </Text>
          </>
        ) : null}
      </ScrollView>

      {view.kind === "ask" ? (
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button
            title={`Share with ${firm}`}
            onPress={share}
            loading={saving}
            fullWidth
            size="lg"
            accessibilityLabel={`Share with ${firm}`}
          />
          <Pressable onPress={report} style={s.report} accessibilityRole="button">
            <Text style={s.reportText} maxFontSizeMultiplier={fontScaleCap.body}>
              Don&apos;t know them? Report this
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function IdentityCard({ practice }: { practice: PracticeForDriver }) {
  const sub = practiceSubline(practice);
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <PracticeMark practice={practice} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.firm} maxFontSizeMultiplier={fontScaleCap.heading}>
            {practice.name}
          </Text>
          {sub ? (
            <Text style={s.sub} maxFontSizeMultiplier={fontScaleCap.body}>
              {sub}
            </Text>
          ) : null}
          {!practice.checked ? <PracticeChip label="Not checked yet" tone="outline" icon="help-circle-outline" /> : null}
        </View>
      </View>
      {!practice.checked ? (
        <>
          <View style={s.hair} />
          <Text style={s.warn} maxFontSizeMultiplier={fontScaleCap.body}>
            We haven&apos;t checked this practice yet. Only share if you know them.
          </Text>
        </>
      ) : null}
    </View>
  );
}

function Message({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[s.card, { alignItems: "center", paddingVertical: spacing.xxl, marginTop: spacing.lg }]}>
      <View style={s.msgIcon}>
        <Ionicons name={icon} size={24} color={colors.text2} accessible={false} />
      </View>
      <Text style={[s.firm, { textAlign: "center", fontSize: 16 }]} maxFontSizeMultiplier={fontScaleCap.heading}>
        {title}
      </Text>
      <Text style={[s.sub, { textAlign: "center", marginTop: 6 }]} maxFontSizeMultiplier={fontScaleCap.body}>
        {body}
      </Text>
      {action ? (
        <View style={{ marginTop: spacing.lg, alignSelf: "stretch" }}>
          <Button title={action.label} onPress={action.onPress} fullWidth />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { height: 52, alignItems: "center", justifyContent: "center" },
  grabber: { position: "absolute", top: 8, width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  notNow: { position: "absolute", right: 12, top: 4, minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: 8 },
  notNowText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text2 },
  scroll: { paddingHorizontal: 20, paddingBottom: spacing.xxxl },
  title: { fontSize: 22, fontFamily: fonts.bold, color: colors.text1, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: "row", gap: 14, alignItems: "center" },
  firm: { fontSize: 18, fontFamily: fonts.bold, color: colors.text1 },
  sub: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, lineHeight: 20 },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginVertical: spacing.md },
  warn: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, lineHeight: 17 },
  section: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text2, marginTop: spacing.xl, marginBottom: 8, marginLeft: 4 },
  cantRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, marginLeft: 4 },
  cantText: { fontSize: 15, fontFamily: fonts.regular, color: colors.text1 },
  duration: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, lineHeight: 19, marginTop: spacing.xl, marginLeft: 4 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  report: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  reportText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  msgIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
});
