import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { getTaxYear } from "@mileclear/shared";
import { PremiumGate } from "../components/PremiumGate";
import { BetaBanner } from "../components/BetaBanner";
import {
  fetchHmrcStatus,
  fetchHmrcBusinesses,
  fetchHmrcObligations,
  fetchAuthorizeUrl,
  disconnectHmrc,
  type HmrcStatus,
  type HmrcBusinessSummary,
  type HmrcObligation,
} from "../lib/api/hmrc";
import { isApiError } from "../lib/api";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;
const RED = colors.red;

// ── Setup state machine ──────────────────────────────────────────────
//
// The MTD ITSA flow has four prerequisites the user must satisfy in order
// before they can submit anything:
//
//   1. Authenticated MileClear account (handled by route guard)
//   2. HMRC OAuth connection (status.connected = true)
//   3. NINO captured + persisted on HmrcConnection
//   4. businessId chosen + persisted on HmrcConnection
//
// We render a single screen with one of four sub-states, transitioning
// the user through. Each sub-state has a clear next action.

type SetupStep = "connect" | "nino" | "business" | "ready";

interface ScreenState {
  step: SetupStep;
  status: HmrcStatus | null;
  /** From /user/profile — used to detect "is NINO set" without exposing it. */
  hasNino: boolean;
  /** From /user/profile — same as above for businessId. */
  hasBusinessId: boolean;
  obligations: HmrcObligation[];
  businesses: HmrcBusinessSummary[];
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: ScreenState = {
  step: "connect",
  status: null,
  hasNino: false,
  hasBusinessId: false,
  obligations: [],
  businesses: [],
  loading: true,
  error: null,
};

export default function TaxMtdScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Tax (MTD)", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
      <PremiumGate feature="MTD ITSA">
        <TaxMtdContent />
      </PremiumGate>
    </View>
  );
}

function TaxMtdContent() {
  const [state, setState] = useState<ScreenState>(INITIAL_STATE);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const statusRes = await fetchHmrcStatus();
      const status = statusRes.data;

      if (!status.connected) {
        setState({
          step: "connect",
          status,
          hasNino: false,
          hasBusinessId: false,
          obligations: [],
          businesses: [],
          loading: false,
          error: null,
        });
        return;
      }

      // Fetch follow-on data only for the prerequisites already cleared.
      // Saves a round-trip when the user is mid-setup.
      let businesses: HmrcBusinessSummary[] = [];
      let obligations: HmrcObligation[] = [];

      if (status.hasNino && !status.hasBusinessId) {
        // NINO set, business not — load the business list so the picker
        // has something to render when the screen falls into that branch.
        try {
          const businessesRes = await fetchHmrcBusinesses();
          businesses = businessesRes.data.businesses;
        } catch (err) {
          if (!(isApiError(err) && err.statusCode === 400)) throw err;
        }
      }

      if (status.hasNino && status.hasBusinessId) {
        try {
          const oblig = await fetchHmrcObligations({ status: "Open" });
          obligations = oblig.data.obligations;
        } catch (err) {
          if (!(isApiError(err) && err.statusCode === 400)) throw err;
        }
      }

      const step: SetupStep = !status.hasNino
        ? "nino"
        : !status.hasBusinessId
        ? "business"
        : "ready";

      setState({
        step,
        status,
        hasNino: status.hasNino,
        hasBusinessId: status.hasBusinessId,
        obligations,
        businesses,
        loading: false,
        error: null,
      });
    } catch (err) {
      // HMRC tokens revoked on HMRC's end — drop into the connect step
      // instead of showing a generic error. Mobile API client throws this
      // before any access-token refresh attempt.
      if (isApiError(err) && err.code === "HMRC_REAUTH_REQUIRED") {
        setState({
          step: "connect",
          status: { connected: false, hasNino: false, hasBusinessId: false },
          hasNino: false,
          hasBusinessId: false,
          obligations: [],
          businesses: [],
          loading: false,
          error: "Your HMRC connection expired. Reconnect to continue.",
        });
        return;
      }
      const msg =
        isApiError(err) ? err.message : err instanceof Error ? err.message : "Failed to load HMRC status.";
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onConnect = useCallback(async () => {
    try {
      const res = await fetchAuthorizeUrl();
      const url = res.data.url;
      // openAuthSessionAsync handles the OAuth dance properly — closes
      // the browser when the deep-link redirect (mileclear://hmrc-connected)
      // fires after the server completes token exchange.
      const result = await WebBrowser.openAuthSessionAsync(url, "mileclear://hmrc-connected");
      if (result.type === "success") {
        await load();
      } else if (result.type === "cancel") {
        // user dismissed — no action needed
      }
    } catch (err) {
      Alert.alert(
        "Connection failed",
        err instanceof Error ? err.message : "Could not open HMRC consent screen."
      );
    }
  }, [load]);

  const onDisconnect = useCallback(() => {
    Alert.alert(
      "Disconnect from HMRC?",
      "You'll need to reconnect before you can submit again. Your existing submissions stay with HMRC.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await disconnectHmrc();
              await load();
            } catch (err) {
              Alert.alert(
                "Couldn't disconnect",
                err instanceof Error ? err.message : "Try again."
              );
            }
          },
        },
      ]
    );
  }, [load]);

  if (state.loading) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <ActivityIndicator color={AMBER} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
      refreshControl={<RefreshControl tintColor={AMBER} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <BetaBanner
        label="Beta · Sandbox"
        title="HMRC integration is in beta"
        body="The full flow works against HMRC's sandbox while we complete production accreditation (estimated 4-8 weeks). You can connect, preview, and walk through submissions — but they won't reach real HMRC yet. Your live tax data is unaffected."
      />

      <Header status={state.status} onDisconnect={state.status?.connected ? onDisconnect : undefined} />

      {state.error && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={20} color={RED} />
          <Text style={styles.errorText}>{state.error}</Text>
        </View>
      )}

      {state.step === "connect" && <ConnectStep onConnect={onConnect} />}
      {state.step === "nino" && <NinoStep onDone={load} />}
      {state.step === "business" && <BusinessStep businesses={state.businesses} onDone={load} />}
      {state.step === "ready" && <ReadyStep obligations={state.obligations} />}
    </ScrollView>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function Header({
  status,
  onDisconnect,
}: {
  status: HmrcStatus | null;
  onDisconnect?: () => void;
}) {
  const isConnected = status?.connected === true;
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View
            style={[styles.statusDot, { backgroundColor: isConnected ? GREEN : TEXT_3 }]}
            accessibilityLabel={isConnected ? "Connected" : "Not connected"}
            accessible={true}
          />
          <Text style={styles.headerTitle}>
            {isConnected ? "Connected to HMRC" : "Not connected"}
          </Text>
        </View>
        {onDisconnect && (
          <TouchableOpacity onPress={onDisconnect} hitSlop={8} accessibilityRole="button" accessibilityLabel="Disconnect from HMRC">
            <Text style={styles.disconnectLink}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>
      {isConnected && status?.environment && (
        <Text style={styles.headerSub}>
          Environment: {status.environment} · Token expires {formatExpiry(status.expiresAt)}
        </Text>
      )}
    </View>
  );
}

// ── Step: Connect ────────────────────────────────────────────────────

function ConnectStep({ onConnect }: { onConnect: () => void }) {
  return (
    <View style={styles.stepCard}>
      <Ionicons name="shield-checkmark-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
      <Text style={styles.stepTitle}>Connect to HMRC</Text>
      <Text style={styles.stepBody}>
        Sign in with HMRC to start filing your quarterly Self Assessment updates from
        MileClear. You'll grant read + write access to your Self Employment data.
      </Text>
      <Bullets
        items={[
          "Your figures stay accurate — MileClear does the mapping",
          "Quarterly periods submit in seconds, not hours",
          "Cross-check HMRC's calc against your Tax Readiness estimate",
        ]}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={onConnect} accessibilityRole="button" accessibilityLabel="Continue to HMRC">
        <Text style={styles.primaryButtonText}>Continue to HMRC</Text>
        <Ionicons name="arrow-forward" size={18} color="#000" />
      </TouchableOpacity>
      <Text style={styles.fineprint}>
        You'll be redirected to HMRC's sign-in page. Tokens are stored encrypted on
        MileClear's server and revocable any time via Disconnect.
      </Text>
    </View>
  );
}

// ── Step: NINO ───────────────────────────────────────────────────────

function NinoStep({ onDone: _onDone }: { onDone: () => void }) {
  return (
    <View style={styles.stepCard}>
      <Ionicons name="finger-print-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
      <Text style={styles.stepTitle}>Enter your NINO</Text>
      <Text style={styles.stepBody}>
        We need your National Insurance Number to identify you to HMRC. It's stored
        encrypted and only used for MTD submissions.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push("/tax-mtd-nino" as never)}
        accessibilityRole="button"
        accessibilityLabel="Enter NINO"
      >
        <Text style={styles.primaryButtonText}>Enter NINO</Text>
        <Ionicons name="arrow-forward" size={18} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

// ── Step: Business picker ────────────────────────────────────────────

function BusinessStep({
  businesses,
  onDone: _onDone,
}: {
  businesses: HmrcBusinessSummary[];
  onDone: () => void;
}) {
  const seBusinesses = businesses.filter((b) => b.typeOfBusiness === "self-employment");

  if (seBusinesses.length === 0) {
    return (
      <View style={styles.stepCard}>
        <Ionicons name="briefcase-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
        <Text style={styles.stepTitle}>No self-employment trade on file</Text>
        <Text style={styles.stepBody}>
          HMRC has no self-employment business registered against your NINO. Register
          your trade with HMRC first (Self Assessment online), then come back here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.stepCard}>
      <Ionicons name="briefcase-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
      <Text style={styles.stepTitle}>Choose your trade</Text>
      <Text style={styles.stepBody}>
        Pick the self-employment business this MileClear account submits against.
      </Text>
      {seBusinesses.map((b) => (
        <TouchableOpacity
          key={b.businessId}
          style={styles.businessOption}
          onPress={() =>
            router.push({
              pathname: "/tax-mtd-business" as never,
              params: { businessId: b.businessId },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Select trade: ${b.tradingName ?? "Self-Employment"}`}
          accessibilityHint="Opens confirmation screen for this trade"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.businessName}>{b.tradingName ?? "Self-Employment"}</Text>
            <Text style={styles.businessId}>{b.businessId}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_3} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Step: Ready (obligations list) ───────────────────────────────────

function ReadyStep({ obligations }: { obligations: HmrcObligation[] }) {
  const sorted = useMemo(
    () => [...obligations].sort((a, b) => a.due.localeCompare(b.due)),
    [obligations]
  );
  const taxYear = getTaxYear(new Date());

  if (sorted.length === 0) {
    return (
      <View style={styles.stepCard}>
        <Ionicons name="checkmark-circle-outline" size={48} color={GREEN} style={{ alignSelf: "center" }} />
        <Text style={styles.stepTitle}>All caught up</Text>
        <Text style={styles.stepBody}>
          No open quarterly obligations from HMRC right now. We'll show your next
          period here as soon as it's available.
        </Text>
        <Text style={styles.helperLink} onPress={() => router.push("/tax-mtd-history" as never)} accessibilityRole="button" accessibilityLabel="View submission history">
          View submission history →
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>Open obligations · Tax year {taxYear}</Text>
      {sorted.map((o, idx) => (
        <ObligationCard key={`${o.start}-${o.end}-${idx}`} obligation={o} />
      ))}
      <Text style={[styles.helperLink, { marginTop: 8, textAlign: "center" }]} onPress={() => router.push("/tax-mtd-history" as never)} accessibilityRole="button" accessibilityLabel="View submission history">
        View submission history →
      </Text>
    </View>
  );
}

function ObligationCard({ obligation }: { obligation: HmrcObligation }) {
  const due = new Date(obligation.due);
  const now = new Date();
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const overdue = daysLeft < 0;
  const urgent = daysLeft >= 0 && daysLeft <= 14;

  return (
    <TouchableOpacity
      style={styles.obligationCard}
      onPress={() =>
        router.push({
          pathname: "/tax-mtd-preview" as never,
          params: { from: obligation.start, to: obligation.end },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Submit quarter: ${formatPeriodLabel(obligation.start, obligation.end)}`}
      accessibilityHint="Opens preview screen to review and submit this quarterly update"
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.obligationDates}>
          {formatPeriodLabel(obligation.start, obligation.end)}
        </Text>
        <Text style={styles.obligationDue}>
          Due {formatHumanDate(obligation.due)}
        </Text>
      </View>
      <View
        style={[
          styles.daysBadge,
          {
            backgroundColor: overdue ? RED : urgent ? AMBER : GREEN,
          },
        ]}
      >
        <Text style={styles.daysBadgeText}>
          {overdue ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d left`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 8, marginVertical: 12 }}>
      {items.map((item, idx) => (
        <View key={idx} style={styles.bulletRow}>
          <Ionicons name="checkmark-circle" size={16} color={AMBER} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function formatExpiry(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Treat epoch-adjacent placeholders (the new Date(0) draft-row leak)
  // as missing data rather than rendering "1 Jan 1970 at 01:00".
  if (d.getFullYear() < 2000) return "—";
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function formatHumanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatPeriodLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const endMonth = end.toLocaleDateString("en-GB", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  if (start.getFullYear() === end.getFullYear()) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${end.getFullYear()}`;
  }
  return `${startDay} ${startMonth} ${start.getFullYear()} – ${endDay} ${endMonth} ${end.getFullYear()}`;
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { alignItems: "center", justifyContent: "center" },

  header: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  headerTitle: {
    color: TEXT_1,
    fontSize: 16,
    fontFamily: fonts.semibold,
  },
  headerSub: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
  },
  disconnectLink: {
    color: TEXT_3,
    fontSize: 13,
    fontFamily: fonts.medium,
  },

  errorCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 16,
  },
  errorText: {
    color: RED,
    fontSize: 13,
    fontFamily: fonts.regular,
    flex: 1,
  },

  stepCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    gap: 8,
  },
  stepTitle: {
    color: TEXT_1,
    fontSize: 22,
    fontFamily: fonts.bold,
    textAlign: "center",
    marginTop: 8,
  },
  stepBody: {
    color: TEXT_2,
    fontSize: 15,
    fontFamily: fonts.regular,
    lineHeight: 22,
    textAlign: "center",
  },

  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bulletText: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    flex: 1,
    lineHeight: 20,
  },

  primaryButton: {
    backgroundColor: AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#000",
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  fineprint: {
    color: TEXT_3,
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },

  businessOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    gap: 8,
  },
  businessName: {
    color: TEXT_1,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  businessId: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 2,
  },

  sectionLabel: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  obligationCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  obligationDates: {
    color: TEXT_1,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  obligationDue: {
    color: TEXT_3,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  daysBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  daysBadgeText: {
    color: "#000",
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  helperLink: {
    color: AMBER,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
});
