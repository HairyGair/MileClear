import { NO_TRADE_COPY, isConnectionExpired, connectionLine, describeMtdLoadError, obligationsErrorText, isMtdTest, type HmrcEnv, isMtdLive } from "../lib/tax/mtdCopy";
import { useHmrcEnvironment, rememberHmrcEnvironment } from "../lib/tax/useHmrcEnvironment";
import { useCallback, useRef, useState } from "react";
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
import { MtdSignpost } from "../components/MtdSignpost";
import { MtdScopeCheck } from "../components/MtdScopeCheck";
import { MtdSignUpCard } from "../components/MtdSignUpCard";
import { MtdBalanceCard } from "../components/MtdBalanceCard";
import { isNotSignedUpError } from "../lib/tax/mtdSignUp";
import { summariseQuarters, taxYearOfPeriodStart, localToday } from "../lib/tax/mtdQuarters";
import { hubConnectionLabel, FINISH_YEAR_COPY } from "../lib/tax/mtdHubCopy";
import { useMtdHubFigures } from "../lib/tax/useMtdHubFigures";
import { NextUpCard } from "../components/mtd/NextUpCard";
import { YearTimeline } from "../components/mtd/YearTimeline";
import { MtdSheet, SheetRow, sheetText } from "../components/mtd/MtdSheet";
import { useUser } from "../lib/user/context";
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
  /** Updates HMRC already has for this tax year (the Sent rows on the timeline). */
  fulfilled: HmrcObligation[];
  /** False when the fulfilled list couldn't be read, so "N of 4 sent" isn't shown as if it were known. */
  fulfilledKnown: boolean;
  /**
   * True when the obligations call itself failed, as opposed to HMRC
   * legitimately returning none. Without this the screen showed the
   * reassuring "All caught up" for both, so a failed call read as
   * "nothing to file" — the worst possible way for a tax app to fail.
   */
  obligationsUnavailable: boolean;
  /**
   * Why the obligations call failed, in the server's words, and whether
   * pulling down to retry could help. A refusal such as "update the app"
   * won't change on a retry, so we don't suggest one.
   */
  obligationsError: { message: string; canRetry: boolean } | null;
  businesses: HmrcBusinessSummary[];
  /** HMRC refused because this driver hasn't signed up for Making Tax Digital. */
  notSignedUp: boolean;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: ScreenState = {
  step: "connect",
  status: null,
  hasNino: false,
  hasBusinessId: false,
  obligations: [],
  fulfilled: [],
  fulfilledKnown: false,
  obligationsUnavailable: false,
  obligationsError: null,
  businesses: [],
  notSignedUp: false,
  loading: true,
  error: null,
};

/** The hub's last good read, so coming back to the screen doesn't ask HMRC again within a minute. */
const HUB_CACHE_MS = 60_000;
let hubCache: { userId: string | null; at: number; state: ScreenState } | null = null;

export default function TaxMtdScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Quarterly updates", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
      <PremiumGate feature="Quarterly updates">
        <TaxMtdContent />
      </PremiumGate>
    </View>
  );
}

function TaxMtdContent() {
  const [state, setState] = useState<ScreenState>(INITIAL_STATE);
  const [refreshing, setRefreshing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  // Bumped on pull-to-refresh so the "What you owe HMRC" card asks again.
  const [balanceKey, setBalanceKey] = useState(0);
  // Which HMRC service the server uses. The status this screen loads says;
  // the shared hook covers the moments it doesn't (an expired connection).
  const fallbackEnv = useHmrcEnvironment();
  const env: HmrcEnv = state.status?.environment ?? fallbackEnv;
  const test = isMtdTest(env);
  const live = isMtdLive(env);
  const { user } = useUser();
  const userId = user?.id ?? null;

  const returningFromSend = useRef(false);
  const load = useCallback(async (force = true) => {
    if (!force && hubCache && hubCache.userId === userId && Date.now() - hubCache.at < HUB_CACHE_MS) {
      setState(hubCache.state);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const statusRes = await fetchHmrcStatus();
      let status = statusRes.data;
      rememberHmrcEnvironment(status.environment);

      if (!status.connected) {
        setState({
          step: "connect",
          status,
          hasNino: false,
          hasBusinessId: false,
          obligations: [],
          fulfilled: [],
          fulfilledKnown: false,
          obligationsUnavailable: false,
          obligationsError: null,
          businesses: [],
          notSignedUp: false,
          loading: false,
          error: null,
        });
        return;
      }

      // Fetch follow-on data only for the prerequisites already cleared.
      // Saves a round-trip when the user is mid-setup.
      let businesses: HmrcBusinessSummary[] = [];
      let obligations: HmrcObligation[] = [];
      let fulfilled: HmrcObligation[] = [];
      let fulfilledKnown = false;
      let obligationsUnavailable = false;
      let obligationsError: ScreenState["obligationsError"] = null;
      let notSignedUp = false;

      if (status.hasNino && !status.hasBusinessId) {
        // NINO set, business not — load the business list so the picker
        // has something to render when the screen falls into that branch.
        try {
          const businessesRes = await fetchHmrcBusinesses();
          businesses = businessesRes.data.businesses;
        } catch (err) {
          if (isNotSignedUpError(err)) notSignedUp = true;
          else if (!(isApiError(err) && err.statusCode === 400)) throw err;
        }
      }

      if (status.hasNino && status.hasBusinessId) {
        try {
          // Two reads, in parallel. The undated one finds anything still open,
          // including a missed quarter from an earlier tax year. The dated one
          // covers this tax year, from 1 April so calendar quarters are in, and
          // is split by status here (the server filters status locally anyway).
          // A failure of the dated read only hides the sent count.
          const y = Number(taxYearOfPeriodStart(localToday()).slice(0, 4));
          const [openRes, yearRes] = await Promise.allSettled([
            fetchHmrcObligations({ status: "Open" }),
            fetchHmrcObligations({ from: `${y}-04-01`, to: `${y + 1}-04-05` }),
          ]);
          if (openRes.status === "rejected") throw openRes.reason;
          obligations = openRes.value.data.obligations;
          if (yearRes.status === "fulfilled") {
            const year = yearRes.value.data.obligations;
            obligations = [...obligations, ...year.filter((o) => o.status === "Open")];
            fulfilled = year.filter((o) => o.status === "Fulfilled");
            fulfilledKnown = true;
          } else if (isApiError(yearRes.reason) && yearRes.reason.code === "HMRC_REAUTH_REQUIRED") {
            throw yearRes.reason;
          }
        } catch (err) {
          // An expired HMRC connection has its own screen (outer catch).
          if (isApiError(err) && err.code === "HMRC_REAUTH_REQUIRED") throw err;
          if (isNotSignedUpError(err)) notSignedUp = true;
          // Any failure here means we could not ask HMRC, not that there is
          // nothing due. Say so rather than implying the user is clear, and
          // use the server's reason so "update the app" isn't hidden behind
          // "pull down to try again".
          obligationsUnavailable = true;
          obligationsError = describeMtdLoadError(
            err,
            "We couldn't load your quarterly updates just now.",
          );
        }
      }

      // The stored access token lasts a few hours and the server renews it on
      // the next HMRC call (the obligations call above). Read the status again
      // so a token renewed just now isn't shown as "expired".
      if (isConnectionExpired(status.expiresAt) && status.hasNino) {
        try {
          status = (await fetchHmrcStatus()).data;
        } catch {
          // keep the first status
        }
      }

      const step: SetupStep = !status.hasNino
        ? "nino"
        : !status.hasBusinessId
        ? "business"
        : "ready";

      const next: ScreenState = {
        step,
        status,
        hasNino: status.hasNino,
        hasBusinessId: status.hasBusinessId,
        obligations,
        fulfilled,
        fulfilledKnown,
        obligationsUnavailable,
        obligationsError,
        businesses,
        notSignedUp,
        loading: false,
        error: null,
      };
      hubCache = step === "ready" && !obligationsUnavailable ? { userId, at: Date.now(), state: next } : null;
      setState(next);
    } catch (err) {
      hubCache = null;
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
          fulfilled: [],
          fulfilledKnown: false,
          obligationsUnavailable: false,
          obligationsError: null,
          businesses: [],
          notSignedUp: false,
          loading: false,
          error: "expired",
        });
        return;
      }
      const { message, canRetry } = describeMtdLoadError(err, "Couldn't load your connection.");
      const msg = canRetry ? `${message} Pull down to try again.` : message;
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, [userId]);

  // Within a minute of the last good read, coming back reuses it. After a
  // trip to Review (a send may have happened) it always asks again.
  useFocusEffect(
    useCallback(() => {
      const force = returningFromSend.current;
      returningFromSend.current = false;
      load(force);
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setBalanceKey((k) => k + 1);
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
      // preferEphemeralSession keeps this out of Safari's shared cookie
      // jar. Without it HMRC sees whichever Government Gateway session is
      // already cached and silently re-authorises as that user, never
      // showing a sign-in form (7 Aug 2026: five reconnects in a row all
      // came back as the previous test user, each in under 15 seconds).
      // That is not just a testing nuisance — on a shared or family
      // device it can link somebody else's tax account with no visible
      // sign-in step at all.
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        "mileclear://hmrc-connected",
        { preferEphemeralSession: true }
      );
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
      test ? "Disconnect the test connection?" : "Disconnect from HMRC?",
      test
        ? "You'll need to connect again to carry on with the test version."
        : "You'll need to connect again to send updates.",
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
  }, [load, test]);

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
      {test && (
        <BetaBanner
          label="Test version"
          title="Quarterly updates are a test version"
          body="This works with HMRC's test service while we wait to be allowed to send real updates. You can connect, preview and walk through an update, but nothing reaches HMRC and your tax account is not changed."
        />
      )}

      {state.step === "ready" ? (
        <ConnectionLine
          status={state.status}
          env={env}
          onManage={() => setManageOpen(true)}
          onConnect={onConnect}
        />
      ) : (
        <Header status={state.status} test={test} onDisconnect={state.status?.connected ? onDisconnect : undefined} />
      )}

      {state.error && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={20} color={RED} />
          <Text style={styles.errorText}>
            {state.error === "expired"
              ? (test
                  ? "Your test connection has expired. Connect again to carry on."
                  : "Your connection to HMRC has expired. Connect again to carry on.")
              : state.error}
          </Text>
        </View>
      )}

      {/* Before connecting: does MTD apply to this driver yet? */}
      {state.step === "connect" && <MtdScopeCheck />}
      {/* Only the real service needs a GOV.UK sign-up; test logins don't. */}
      {live && (state.step === "connect" || state.notSignedUp) && (
        <MtdSignUpCard userId={userId} notSignedUp={state.notSignedUp} />
      )}
      {state.step === "connect" && <ConnectStep test={test} onConnect={onConnect} />}
      {state.step === "nino" && <NinoStep test={test} onDone={load} />}
      {state.step === "business" && <BusinessStep businesses={state.businesses} onDone={load} />}
      {state.step === "ready" && (
        <ReadyStep
          obligations={state.obligations}
          fulfilled={state.fulfilledKnown ? state.fulfilled : null}
          businessId={state.status?.businessId ?? null}
          env={env}
          refreshKey={balanceKey}
          onLeaveForReview={() => {
            returningFromSend.current = true;
          }}
          unavailable={state.obligationsUnavailable}
          unavailableReason={state.obligationsError}
          expired={isConnectionExpired(state.status?.expiresAt)}
          test={test}
          onConnect={onConnect}
        />
      )}
      {state.step === "ready" && !state.notSignedUp && !isConnectionExpired(state.status?.expiresAt) && (
        <MtdBalanceCard refreshKey={balanceKey} />
      )}

      {state.step === "ready" && (
        <TouchableOpacity
          style={styles.historyRow}
          onPress={() => router.push("/tax-mtd-history" as never)}
          accessibilityRole="button"
          accessibilityLabel="Update history"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.obligationDates}>Update history</Text>
            <Text style={styles.obligationDue}>What you've sent, and HMRC's estimates</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_3} />
        </TouchableOpacity>
      )}

      {/* Signposts HMRC requires. They sit under our own explanation, not at the
          top. On the real service the end-of-year return isn't offered (the
          final declaration isn't built); on the test service it can be tried
          from "Finish the year" on the timeline. */}
      {state.step === "ready" && !test && (
        <MtdSignpost text="MileClear sends your quarterly updates for self-employment income only. If you also have UK or foreign property, or other untaxed income, you'll need MTD-compatible software for those. The end-of-year tax return isn't in MileClear yet, so send it with HMRC or other compatible software." />
      )}
      {state.step === "ready" && test && (
        <MtdSignpost text="When it goes live, MileClear will send your quarterly updates for self-employment income only. If you also have UK or foreign property, or other untaxed income, you'll need MTD-compatible software for those. The end-of-year tax return in this test version is for trying only, so for now send your real tax return with HMRC or other compatible software." />
      )}

      <MtdSheet visible={manageOpen} title="Manage connection" onClose={() => setManageOpen(false)}>
        <Text style={sheetText.body}>
          {connectionLine(state.status?.expiresAt, formatExpiry(state.status?.expiresAt), undefined, env)}
        </Text>
        <SheetRow
          label="Change National Insurance number"
          onPress={() => {
            setManageOpen(false);
            router.push("/tax-mtd-nino" as never);
          }}
        />
        <SheetRow
          label={test ? "Disconnect the test connection" : "Disconnect from HMRC"}
          destructive
          onPress={() => {
            setManageOpen(false);
            // iOS drops an alert shown while the sheet is still closing.
            setTimeout(onDisconnect, 450);
          }}
        />
      </MtdSheet>
    </ScrollView>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function Header({
  status,
  test,
  onDisconnect,
}: {
  status: HmrcStatus | null;
  test: boolean;
  onDisconnect?: () => void;
}) {
  const isConnected = status?.connected === true;
  const sandbox = status?.environment !== "production";
  const expired = isConnected && isConnectionExpired(status?.expiresAt);
  const title = expired
    ? (test ? "Test connection expired" : "Connection expired")
    : isConnected
      ? (sandbox ? "Connected to HMRC's test service" : "Connected to HMRC")
      : "Not connected";
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View
            style={[styles.statusDot, { backgroundColor: expired ? TEXT_3 : isConnected ? (sandbox ? AMBER : GREEN) : TEXT_3 }]}
            accessibilityLabel={title}
            accessible={true}
          />
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        {onDisconnect && (
          <TouchableOpacity onPress={onDisconnect} hitSlop={8} accessibilityRole="button" accessibilityLabel={test ? "Disconnect the test connection" : "Disconnect from HMRC"}>
            <Text style={styles.disconnectLink}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>
      {isConnected && status?.environment && (
        <Text style={styles.headerSub}>
          {connectionLine(status.expiresAt, formatExpiry(status.expiresAt), undefined, status.environment)}
        </Text>
      )}
    </View>
  );
}

// ── Connection line (set up) ─────────────────────────────────────────

function ConnectionLine({
  status,
  env,
  onManage,
  onConnect,
}: {
  status: HmrcStatus | null;
  env: HmrcEnv;
  onManage: () => void;
  onConnect: () => void;
}) {
  const expired = isConnectionExpired(status?.expiresAt);
  const label = hubConnectionLabel(env, expired, getTaxYear(new Date()));
  const dot = expired ? AMBER : isMtdTest(env) ? AMBER : GREEN;
  return (
    <View style={styles.connLine}>
      <View style={styles.headerLeft}>
        <View style={[styles.statusDot, { backgroundColor: dot }]} />
        <Text style={styles.connText} numberOfLines={1} accessibilityRole="text">{label}</Text>
      </View>
      <TouchableOpacity
        onPress={expired ? onConnect : onManage}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.connAction}
        accessibilityRole="button"
        accessibilityLabel={expired ? "Connect again" : "Manage connection"}
      >
        <Text style={[styles.connActionText, expired && { color: AMBER }]}>{expired ? "Connect again" : "Manage"}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Step: Connect ────────────────────────────────────────────────────

function ConnectStep({ test, onConnect }: { test: boolean; onConnect: () => void }) {
  if (!test) {
    return (
      <View style={styles.stepCard}>
        <Ionicons name="shield-checkmark-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
        <Text style={styles.stepTitle}>Connect to HMRC</Text>
        <Text style={styles.stepBody}>
          Sign in with your HMRC (Government Gateway) details and agree to let
          MileClear send your quarterly updates.
        </Text>
        <Bullets
          items={[
            "MileClear works out the figures from your trips and earnings",
            "Preview each quarter before you send it",
            "HMRC shows you an estimate of your tax so far",
          ]}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={onConnect} accessibilityRole="button" accessibilityLabel="Continue to HMRC">
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#000" />
        </TouchableOpacity>
        <Text style={styles.fineprint}>
          You'll be taken to HMRC's own sign-in page. The connection lasts a
          limited time, so you may need to connect again. You can disconnect any time.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.stepCard}>
      <Ionicons name="shield-checkmark-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
      <Text style={styles.stepTitle}>Connect to the test service</Text>
      <Text style={styles.stepBody}>
        Sign in to HMRC's test service to try quarterly updates. Nothing reaches
        your real tax account.
      </Text>
      <Bullets
        items={[
          "MileClear works out the figures from your trips and earnings",
          "Preview each quarter before you go any further",
          "Compare the result with your tax so far on the Tax tab",
        ]}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={onConnect} accessibilityRole="button" accessibilityLabel="Continue to the test service">
        <Text style={styles.primaryButtonText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color="#000" />
      </TouchableOpacity>
      <Text style={styles.fineprint}>
        You'll be taken to HMRC's sign-in page for the test service. The connection
        lasts a limited time, so you may need to connect again. You can disconnect any time.
      </Text>
    </View>
  );
}

// ── Step: NINO ───────────────────────────────────────────────────────

function NinoStep({ test, onDone: _onDone }: { test: boolean; onDone: () => void }) {
  return (
    <View style={styles.stepCard}>
      <Ionicons name="finger-print-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
      <Text style={styles.stepTitle}>Your National Insurance number</Text>
      <Text style={styles.stepBody}>
        {test
          ? "We need your National Insurance Number to set up the test connection. It's stored encrypted and only used for quarterly updates."
          : "HMRC needs your National Insurance Number to find your tax record. It's stored encrypted and only used for quarterly updates."}
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push("/tax-mtd-nino" as never)}
        accessibilityRole="button"
        accessibilityLabel="Enter your National Insurance number"
      >
        <Text style={styles.primaryButtonText}>Enter number</Text>
        <Ionicons name="arrow-forward" size={18} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

// ── Step: Business picker ────────────────────────────────────────────

function BusinessStep({
  businesses,
  onDone,
}: {
  businesses: HmrcBusinessSummary[];
  onDone: () => void;
}) {
  const seBusinesses = businesses.filter((b) => b.typeOfBusiness === "self-employment");

  if (seBusinesses.length === 0) {
    return (
      <View style={styles.stepCard}>
        <Ionicons name="briefcase-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
        <Text style={styles.stepTitle}>{NO_TRADE_COPY.title}</Text>
        <Text style={styles.stepBody}>{NO_TRADE_COPY.body}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onDone} accessibilityRole="button" accessibilityLabel={NO_TRADE_COPY.retryLabel}>
          <Text style={styles.primaryButtonText}>{NO_TRADE_COPY.retryLabel}</Text>
        </TouchableOpacity>
        <Text style={[styles.helperLink, { marginTop: 12, textAlign: "center" }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={NO_TRADE_COPY.backLabel}>
          {NO_TRADE_COPY.backLabel}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.stepCard}>
      <Ionicons name="briefcase-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
      <Text style={styles.stepTitle}>Choose your trade</Text>
      <Text style={styles.stepBody}>
        Pick the self-employment business to use for quarterly updates.
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
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_3} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Step: Ready (the hub) ────────────────────────────────────────────

function ReadyStep({
  obligations,
  fulfilled,
  businessId,
  env,
  refreshKey,
  onLeaveForReview,
  unavailable,
  unavailableReason,
  expired,
  test,
  onConnect,
}: {
  obligations: HmrcObligation[];
  /** Null when the sent list couldn't be read. */
  fulfilled: HmrcObligation[] | null;
  businessId: string | null;
  env: HmrcEnv;
  refreshKey: number;
  /** Called before opening Review, so the hub asks HMRC again when the driver comes back. */
  onLeaveForReview: () => void;
  unavailable: boolean;
  unavailableReason: { message: string; canRetry: boolean } | null;
  expired: boolean;
  test: boolean;
  onConnect: () => void;
}) {
  const now = new Date();
  const taxYear = taxYearOfPeriodStart(localToday(now));
  const summary = summariseQuarters([...obligations, ...(fulfilled ?? [])], now, taxYear);
  const figures = useMtdHubFigures(businessId, summary.next, refreshKey);
  const [finishOpen, setFinishOpen] = useState(false);

  // An empty list means one of two very different things. Saying "all
  // caught up" when the call actually failed tells someone they have
  // nothing to file when we simply could not ask, which in a tax app is
  // the one mistake worth going out of our way to avoid.
  if (summary.total === 0 && !summary.next && unavailable) {
    return (
      <View style={styles.stepCard}>
        <Ionicons name="alert-circle-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
        <Text style={styles.stepTitle}>
          {expired ? (test ? "Your test connection has expired" : "Your connection to HMRC has expired") : "Couldn't load your updates"}
        </Text>
        <Text style={styles.stepBody}>
          {expired
            ? (test
                ? "Connect again to carry on. Your past test updates stay in your history."
                : "Connect again to carry on. Your past updates stay in your history.")
            : obligationsErrorText(unavailableReason)}
        </Text>
        {expired && (
          <TouchableOpacity style={styles.primaryButton} onPress={onConnect} accessibilityRole="button" accessibilityLabel="Connect again">
            <Text style={styles.primaryButtonText}>Connect again</Text>
            <Ionicons name="arrow-forward" size={18} color="#000" />
          </TouchableOpacity>
        )}
        <Text style={styles.helperLink} onPress={() => router.push("/tax-mtd-history" as never)} accessibilityRole="button" accessibilityLabel="See update history">
          See update history
        </Text>
      </View>
    );
  }

  if (summary.total === 0 && !summary.next) {
    return (
      <View style={styles.stepCard}>
        <Ionicons name="checkmark-circle-outline" size={48} color={GREEN} style={{ alignSelf: "center" }} />
        <Text style={styles.stepTitle}>Nothing to send yet</Text>
        <Text style={styles.stepBody}>
          HMRC hasn't listed a quarterly update for you right now. We'll show your next period here as
          soon as it's available.
        </Text>
      </View>
    );
  }

  const next = summary.next;
  const openReview = (q: { start: string; end: string }) => {
    onLeaveForReview();
    router.push({ pathname: "/tax-mtd-preview" as never, params: { from: q.start, to: q.end } });
  };
  const sentKnown = fulfilled !== null;

  return (
    <View>
      <NextUpCard
        quarter={next}
        following={summary.following ? { label: summary.following.label, due: summary.following.due } : null}
        allSent={summary.allSent}
        sentCount={summary.sentCount}
        taxYear={taxYear}
        env={env}
        figures={figures}
        now={now}
        onReview={() => next && openReview(next)}
        early={summary.early}
        onSendEarly={summary.early ? () => openReview(summary.early!) : undefined}
        onFixTrips={() => router.push({ pathname: "/(tabs)/trips" as never, params: { filter: "unclassified" } })}
        onMissedDeadline={() => router.push("/tax-mtd-late" as never)}
      />

      {sentKnown ? (
        <YearTimeline
          quarters={summary.quarters}
          sentCount={summary.sentCount}
          taxYear={taxYear}
          env={env}
          now={now}
          onFinishYear={() => (test ? router.push("/tax-mtd-year-end" as never) : setFinishOpen(true))}
        />
      ) : (
        <Text style={styles.fineprintLeft}>
          We couldn't check which updates HMRC already has. Pull down to try again.
        </Text>
      )}

      <MtdSheet visible={finishOpen} title={FINISH_YEAR_COPY.title} onClose={() => setFinishOpen(false)}>
        <Text style={sheetText.body}>{FINISH_YEAR_COPY.body}</Text>
      </MtdSheet>
    </View>
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
  if (!iso) return "Not set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  // Treat epoch-adjacent placeholders (the new Date(0) draft-row leak)
  // as missing data rather than rendering "1 Jan 1970 at 01:00".
  if (d.getFullYear() < 2000) return "Not set";
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  headerTitle: {
    flexShrink: 1,
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

  connLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  connText: { flexShrink: 1, color: TEXT_2, fontSize: 14, fontFamily: fonts.medium },
  connAction: { minHeight: 32, justifyContent: "center" },
  connActionText: { color: TEXT_2, fontSize: 14, fontFamily: fonts.semibold },
  historyRow: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },
  fineprintLeft: { color: TEXT_3, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 8 },

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
