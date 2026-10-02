// "Ready for 31 January?" checklist (2 Oct 2026).
//
// The full list behind the Work dashboard countdown card and the reminder
// pushes: for the tax year the next 31 January deadline is for, what is done,
// what still needs doing, and a button straight to the screen that fixes each
// one. Free, except the last step (the Self Assessment PDF), which keeps the
// usual Pro paywall. Opens at any time of year; only the dashboard card is
// limited to 1 December to 31 January.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatPence, type SaChecklist, type SaChecklistItem } from "@mileclear/shared";
import { fetchSaChecklist } from "../lib/api/selfAssessment";
import { useUser } from "../lib/user/context";
import { useIsPremium } from "../components/PremiumGate";
import { usePaywall } from "../components/paywall";
import { daysLabel, downloadSaPdf, routeForSaAction, wantsSaPreview } from "../lib/saCountdown";
import { colors, fonts } from "../lib/theme";

function statusIcon(item: SaChecklistItem): { name: keyof typeof Ionicons.glyphMap; color: string; label: string } {
  if (item.status === "done") return { name: "checkmark-circle", color: colors.green, label: "Done" };
  if (item.status === "attention") return { name: "alert-circle", color: colors.amber, label: "Needs doing" };
  return { name: "ellipse-outline", color: colors.text3, label: "Optional" };
}

function milesText(miles: number): string {
  return `${Math.round(miles).toLocaleString("en-GB")} mi`;
}

export default function SaChecklistScreen() {
  const router = useRouter();
  const { user } = useUser();
  const isPremium = useIsPremium();
  const { showPaywall } = usePaywall();
  const [checklist, setChecklist] = useState<SaChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const preview = wantsSaPreview(user);

  const load = useCallback(async () => {
    try {
      const res = await fetchSaChecklist({ preview });
      setChecklist(res.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [preview]);

  // Reload whenever the driver comes back from fixing something.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleDownload = useCallback(async () => {
    if (!checklist) return;
    if (!isPremium) {
      showPaywall("self-assessment");
      return;
    }
    setDownloading(true);
    try {
      await downloadSaPdf(checklist.taxYear);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      if (msg === "Premium subscription required") {
        showPaywall("self-assessment");
        return;
      }
      Alert.alert("Download failed", msg);
    } finally {
      setDownloading(false);
    }
  }, [checklist, isPremium, showPaywall]);

  const onAction = useCallback(
    (item: SaChecklistItem) => {
      if (!item.action) return;
      if (item.action === "sa_pdf") {
        handleDownload();
        return;
      }
      const route = routeForSaAction(item.action);
      if (route) router.push(route as never);
    },
    [handleDownload, router]
  );

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (error || !checklist) {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.errorText}>Couldn't load your checklist. Check your connection and try again.</Text>
        <TouchableOpacity
          style={s.retryBtn}
          onPress={() => {
            setLoading(true);
            load();
          }}
          accessibilityRole="button"
        >
          <Text style={s.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const c = checklist;
  const urgent = c.daysToDeadline <= 14;

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.amber}
          />
        }
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.pill, { backgroundColor: urgent ? colors.redDim : colors.amberDim }]}>
            <Ionicons name="time-outline" size={12} color={urgent ? colors.red : colors.amber} />
            <Text style={[s.pillText, { color: urgent ? colors.red : colors.amber }]}>
              {daysLabel(c.daysToDeadline)}
            </Text>
          </View>
          <Text style={s.headline}>{c.headline}</Text>
          <Text style={s.heroSub}>
            Your {c.taxYear} return covers {c.taxYearLabel}. The online filing deadline is 31 January{" "}
            {new Date(c.deadline).getUTCFullYear()}.
          </Text>
          {!c.eligible && (
            <Text style={s.note}>
              {c.ineligibleReason === "employee"
                ? "You've told us you drive as an employee, so this may not apply to you. It's here if you also do self-employed work."
                : "You're in Personal mode, so this may not apply to you. It's here if you also drive for work."}
            </Text>
          )}
        </View>

        {/* Figures */}
        <View style={s.figures}>
          <View style={s.figure}>
            <Text style={s.figureValue}>{milesText(c.businessMiles)}</Text>
            <Text style={s.figureLabel}>Business miles</Text>
          </View>
          <View style={s.figure}>
            <Text style={s.figureValue}>{formatPence(c.mileageClaimPence)}</Text>
            <Text style={s.figureLabel}>Mileage claim</Text>
          </View>
          <View style={s.figure}>
            <Text style={s.figureValue}>{formatPence(c.earningsPence)}</Text>
            <Text style={s.figureLabel}>Earnings</Text>
          </View>
        </View>

        {/* Checklist */}
        {c.items.map((item, idx) => {
          const icon = statusIcon(item);
          const isPdf = item.action === "sa_pdf";
          const label = isPdf && !isPremium ? "Download PDF (Pro)" : item.actionLabel;
          return (
            <View key={item.id} style={[s.item, idx === c.items.length - 1 && s.itemLast]}>
              <Ionicons
                name={icon.name}
                size={22}
                color={icon.color}
                accessibilityLabel={icon.label}
                style={{ marginTop: 1 }}
              />
              <View style={s.itemBody}>
                <View style={s.itemTitleRow}>
                  <Text style={s.itemTitle}>{item.title}</Text>
                  {item.status === "optional" && <Text style={s.optional}>Optional</Text>}
                </View>
                <Text style={s.itemDetail}>{item.detail}</Text>
                {item.action && label && (
                  <TouchableOpacity
                    style={[s.actionBtn, item.status === "attention" && s.actionBtnPrimary]}
                    onPress={() => onAction(item)}
                    disabled={isPdf && downloading}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}: ${item.title}`}
                  >
                    {isPdf && downloading ? (
                      <ActivityIndicator size="small" color={colors.amber} />
                    ) : (
                      <>
                        {isPdf && (
                          <Ionicons
                            name={isPremium ? "download-outline" : "lock-closed"}
                            size={14}
                            color={colors.amber}
                          />
                        )}
                        <Text style={[s.actionText, item.status === "attention" && s.actionTextPrimary]}>
                          {label}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        <Text style={s.footer}>
          You file your return yourself on GOV.UK, or your accountant does it for you. MileClear doesn't send
          anything on your behalf. The figures here are worked out from what you've logged in the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  content: { padding: 16, paddingBottom: 48 },
  errorText: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.amber,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 14 },
  hero: { marginBottom: 16 },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  headline: { color: colors.text1, fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 },
  heroSub: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  note: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  figures: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  figure: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  figureValue: { color: colors.text1, fontFamily: fonts.bold, fontSize: 15 },
  figureLabel: { color: colors.text3, fontFamily: fonts.regular, fontSize: 11.5, marginTop: 3 },
  item: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginBottom: 8,
  },
  itemLast: { borderColor: "rgba(245,166,35,0.25)" },
  itemBody: { flex: 1 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15, flexShrink: 1 },
  optional: { color: colors.text3, fontFamily: fonts.medium, fontSize: 11 },
  itemDetail: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 3,
  },
  actionBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
  },
  actionBtnPrimary: { backgroundColor: colors.amber, borderColor: colors.amber },
  actionText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 13.5 },
  actionTextPrimary: { color: colors.bg },
  footer: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 16,
  },
});
