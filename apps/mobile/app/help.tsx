import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
} from "react-native";
import { router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, fonts, radii, spacing } from "../lib/theme";
import { getDatabase } from "../lib/db";

/**
 * Help & Tutorials — in-app guide for first-time users + anyone who
 * needs a refresher. Sectioned FAQ with tap-to-expand answers + a
 * "Show me the quick start again" button at the top.
 *
 * Content is intentionally plain-English, scoped to what a UK gig
 * worker or self-employed driver actually needs to know. Long-form
 * articles live at mileclear.com/support — we deep-link out for
 * the deeper topics.
 */

interface Topic {
  id: string;
  q: string;
  a: string;
  /** Optional deep-link to the screen this topic is about. */
  goTo?: string;
  /** Optional external article. */
  externalUrl?: string;
}

interface Section {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  topics: Topic[];
}

const SECTIONS: Section[] = [
  {
    title: "Getting started",
    icon: "rocket-outline",
    topics: [
      {
        id: "what-it-does",
        q: "What does MileClear do for me?",
        a: "MileClear automatically records every mile you drive for work and calculates the tax deduction HMRC owes you back. At year-end you can export a PDF Self Assessment, submit quarterly returns direct to HMRC, or hand the numbers to your accountant.\n\nFor 2024-25 and earlier UK tax years, the standard rate is 45p per mile for the first 10,000 business miles and 25p after — MileClear tracks both tiers automatically.",
      },
      {
        id: "trip-detection",
        q: "How does MileClear know when I'm driving?",
        a: "Two ways. Drive past 15mph for more than a few minutes and the app starts a recording automatically (\"watch-and-wait\" detection). Or set up saved locations like Home and Work, and we'll auto-detect when you leave one and arrive at another — the Lock Screen shows a Live Activity from the moment you cross the boundary.\n\nYou can also add trips manually from the dashboard if the detection missed one.",
      },
      {
        id: "modes",
        q: "Work mode vs Personal mode?",
        a: "Top of the dashboard — switch between Work and Personal whenever your day changes. Work mode shows your tax deduction, business insights, and HMRC tooling. Personal mode shows journey timeline, milestones, and fuel costs.\n\nIf you do both, set your dashboard mode to \"Both\" in Settings to see everything at once.",
        goTo: "/settings/general",
      },
      {
        id: "first-trip",
        q: "I just installed the app — what should I do first?",
        a: "Three things, in order:\n\n1. Add your vehicle in Settings → Vehicles. We need fuel type + MPG to calculate fuel costs.\n2. Add Home and Work as saved locations (Settings → Saved Locations). The app will then auto-detect trips between them.\n3. Take your first drive. You'll see a \"Trip Active\" Live Activity on the Lock Screen.",
      },
    ],
  },
  {
    title: "Tax & HMRC",
    icon: "calculator-outline",
    topics: [
      {
        id: "tax-readiness",
        q: "What's the Tax Readiness card?",
        a: "Real-time estimate of what you'll owe HMRC at the end of the current tax year, based on the trips and earnings you've recorded so far. The \"Set aside\" line tells you what to save each week to cover both income tax and Class 4 NI on your gig profits.\n\nThe more accurate your earnings + trip data is, the better the estimate.",
      },
      {
        id: "mtd-itsa",
        q: "What is MTD ITSA?",
        a: "Making Tax Digital for Income Tax Self Assessment. From April 2026, sole traders earning over £50k a year must submit four quarterly returns to HMRC plus a year-end statement — no more single January 31 Self Assessment.\n\nMileClear's Pro tier handles all four quarters automatically. Avatar → Work & Tax → MTD ITSA. Currently in sandbox mode while HMRC reviews our production accreditation.",
        goTo: "/tax-mtd",
      },
      {
        id: "paye-offset",
        q: "I have a day job too — does MileClear handle that?",
        a: "Yes. Settings → Work & Tax → enter what your employer has already deducted in PAYE this year (it's on your most recent payslip, year-to-date tax line). Tax Readiness then shows what you STILL owe on top of PAYE, rather than the full gross liability.",
        goTo: "/settings/work-tax",
      },
      {
        id: "cash-vs-accruals",
        q: "Cash or accruals basis — what's the difference?",
        a: "Cash basis (default since April 2024 for most sole traders) counts invoice income when the money actually arrives in your account. Accruals counts it when you sent the invoice, regardless of payment.\n\nUnless your accountant has told you otherwise, leave it on cash. It matches how the money actually flows.",
      },
      {
        id: "accountant",
        q: "I pay an accountant — can I factor that in?",
        a: "Settings → Work & Tax → Sole Trader → My Accountant. Enter their annual filing fee. We spread it across 52 weeks and add it to your weekly set-aside, so by filing season the cash is already there for both the tax and the accountant.",
        goTo: "/accountant",
      },
    ],
  },
  {
    title: "Trips",
    icon: "car-outline",
    topics: [
      {
        id: "manual-trip",
        q: "How do I add a trip manually?",
        a: "Dashboard → Start Trip → Manual. Enter the start and end address (or pick on the map), set the date, classify as Work or Personal, save.\n\nManual trips use our routing engine for accurate distance — the same address pair always returns the same mileage.",
      },
      {
        id: "classification",
        q: "How does auto-classification work?",
        a: "Tag the same A → B journey as Work three times consistently, and the fourth time MileClear suggests Work automatically. After saving you'll see a toast confirming the auto-decision — tap to override if it's wrong.\n\nFor auto-detected trips, the Lock Screen confirmation push leads with the suggestion: \"Work trip detected — Tap Yes, Work to confirm.\"",
      },
      {
        id: "wrong-distance",
        q: "A trip's distance looks wrong",
        a: "Open the trip → Recalculate distance. Hits our routing engine on demand. For sparse-GPS trips, also try Settings → Data Quality → Recheck suspicious trips — we'll re-route any trip with low confidence in bulk.",
      },
      {
        id: "confidence",
        q: "What does the High / Medium / Low badge mean?",
        a: "Confidence level for each trip's distance figure, based on GPS sample quality, breadcrumb density, route verification, and speed sanity. Tap any badge for the plain-English breakdown. High = bulletproof for HMRC defence; Low = worth a Recalculate before you rely on it.",
      },
    ],
  },
  {
    title: "Money",
    icon: "card-outline",
    topics: [
      {
        id: "earnings",
        q: "Earnings vs invoices?",
        a: "Earnings = gig platform income (Uber, Deliveroo, Just Eat). Either typed in manually, imported from a platform CSV (Pro), or auto-imported via Open Banking (Pro).\n\nInvoices = freelance / consultancy work you've billed clients for. Free tier covers 3 invoices per calendar month; Pro unlimited.",
        goTo: "/(tabs)/earnings",
      },
      {
        id: "fuel",
        q: "Should I log fuel?",
        a: "Optional — but logging fuel unlocks running-cost analytics. The Personal dashboard shows pence-per-mile, monthly fuel spend, recent fill-ups. Doesn't affect HMRC mileage calculation (HMRC's rates already cover fuel as a notional allowance), just gives you the real picture of your driving costs.",
      },
      {
        id: "pro-features",
        q: "What's in Pro?",
        a: "Quarterly HMRC submissions, HMRC self-assessment PDF, CSV earnings import, Open Banking auto-import, auto-classify rules, business insights, journey map, accountant sharing, unlimited invoices, unlimited saved locations and vehicles.\n\n£4.99/month or £44.99/year. Cancel anytime from your Apple ID settings.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    icon: "construct-outline",
    topics: [
      {
        id: "la-not-showing",
        q: "Live Activity not showing on the Lock Screen",
        a: "Two things to check:\n\n1. Settings (iOS) → Notifications → MileClear → Live Activities — must be ON.\n2. Settings (iOS) → MileClear → Live Activities → also ON.\n\nIf both are on and you still don't see one, restart the app once.",
      },
      {
        id: "trips-not-syncing",
        q: "Trips not appearing on the web dashboard",
        a: "Open Settings → Sync Status. Pending trips upload as soon as you're back online. If you see \"failed\" items, tap Retry. Trips are always saved locally first — they don't get lost if sync is delayed.",
        goTo: "/sync-status",
      },
      {
        id: "logged-out",
        q: "I got logged out and ended up in a blank profile",
        a: "Known issue we've now fixed (1.2.0). If it happens, log out of the blank profile and sign in again using the method you originally signed up with (email + password, OR Apple ID — whichever you used first). You'll be back in your real account with all your data.",
      },
      {
        id: "battery",
        q: "Is GPS tracking going to kill my battery?",
        a: "MileClear uses iOS's significant-location-change API while you're stationary, and only escalates to active GPS during a recording. Typical impact is 2-4% per 8-hour shift. If you notice more than that, check Settings → Data Quality — your tracking permissions might be sub-optimal.",
      },
      {
        id: "still-stuck",
        q: "Still stuck?",
        a: "Email support@mileclear.com with a description of what's happening + your device model. Anthony (founder) reads every email personally. Usual response within a few hours.",
      },
    ],
  },
];

export default function HelpScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleReplayTour = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        "DELETE FROM tracking_state WHERE key = 'quick_start_shown'"
      );
    } catch {
      // No-op — replay just won't fire if SQLite is unavailable
    }
    router.replace("/(tabs)/dashboard" as never);
  }, []);

  const handleTopic = useCallback((topic: Topic) => {
    if (topic.externalUrl) {
      WebBrowser.openBrowserAsync(topic.externalUrl).catch(() => {});
      return;
    }
    if (topic.goTo) {
      router.push(topic.goTo as never);
      return;
    }
    setExpandedId((prev) => (prev === topic.id ? null : topic.id));
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Help & Tutorials",
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text1,
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="play-circle-outline" size={28} color={colors.amber} />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle} maxFontSizeMultiplier={1.4}>
              Replay the Quick Start
            </Text>
            <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.4}>
              The 5-card welcome tour you saw on first launch.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.heroCta}
            onPress={handleReplayTour}
            accessibilityRole="button"
            accessibilityLabel="Replay the Quick Start tour"
          >
            <Text style={styles.heroCtaText} maxFontSizeMultiplier={1.2}>
              Play
            </Text>
          </TouchableOpacity>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon} size={18} color={colors.amber} accessible={false} />
              <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.4}>
                {section.title}
              </Text>
            </View>
            <View style={styles.sectionCard}>
              {section.topics.map((topic, idx) => {
                const isExpanded = expandedId === topic.id;
                const isLast = idx === section.topics.length - 1;
                return (
                  <View key={topic.id} style={[!isLast && styles.topicBorder]}>
                    <TouchableOpacity
                      style={styles.topicRow}
                      onPress={() => handleTopic(topic)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={topic.q}
                      accessibilityState={{ expanded: isExpanded }}
                      accessibilityHint={
                        topic.goTo
                          ? "Opens the related screen"
                          : topic.externalUrl
                          ? "Opens an external article"
                          : "Tap to read the answer"
                      }
                    >
                      <Text style={styles.topicQ} maxFontSizeMultiplier={1.5}>
                        {topic.q}
                      </Text>
                      <Ionicons
                        name={
                          topic.goTo || topic.externalUrl
                            ? "chevron-forward"
                            : isExpanded
                            ? "chevron-up"
                            : "chevron-down"
                        }
                        size={16}
                        color={colors.text3}
                        accessible={false}
                      />
                    </TouchableOpacity>
                    {isExpanded && !topic.goTo && !topic.externalUrl ? (
                      <View style={styles.topicAnswer}>
                        <Text style={styles.topicAnswerText} maxFontSizeMultiplier={1.5}>
                          {topic.a}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.footerCard}>
          <Text style={styles.footerLabel} maxFontSizeMultiplier={1.2}>
            STILL STUCK?
          </Text>
          <TouchableOpacity
            style={styles.footerBtn}
            onPress={() => Linking.openURL("mailto:support@mileclear.com?subject=MileClear%20Support")}
            accessibilityRole="button"
            accessibilityLabel="Email MileClear support"
          >
            <Ionicons name="mail-outline" size={18} color={colors.amber} accessible={false} />
            <Text style={styles.footerBtnText} maxFontSizeMultiplier={1.3}>
              Email support@mileclear.com
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerBtn}
            onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/support")}
            accessibilityRole="link"
            accessibilityLabel="Open the full MileClear support site"
          >
            <Ionicons name="open-outline" size={18} color={colors.amber} accessible={false} />
            <Text style={styles.footerBtnText} maxFontSizeMultiplier={1.3}>
              Open mileclear.com/support
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.amberDim,
    justifyContent: "center",
    alignItems: "center",
  },
  heroBody: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  heroSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  heroCta: {
    backgroundColor: colors.amber,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  heroCtaText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.text2,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  topicBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  topicQ: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  topicAnswer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  topicAnswerText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 21,
  },
  footerCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    gap: 8,
    marginTop: spacing.md,
  },
  footerLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.text2,
    letterSpacing: 1,
    marginBottom: 4,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: "rgba(245, 166, 35, 0.06)",
  },
  footerBtnText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.amber,
  },
});
