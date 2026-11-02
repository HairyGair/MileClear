import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, fonts, fontSizes, radii, spacing } from "../../lib/theme";
import type { HmrcBusinessSummary } from "../../lib/api/hmrc";
import type { HmrcEnv } from "../../lib/tax/mtdCopy";
import { forgetSignedUp, hasSaidSignedUp, rememberSignedUp } from "../../lib/tax/mtdSignUp";
import {
  addBusinessHandoff,
  connectHandoff,
  signUpHandoff,
  type HandoffCopy,
  type HandoffKind,
} from "../../lib/tax/mtdHandoffCopy";
import {
  BUSINESS_NOT_FOUND,
  CHOOSE_BUSINESS,
  CONNECTION_EXPIRED,
  FOUND_BUSINESS_SUB,
  HAVE_READY,
  HAVE_READY_HEADING,
  NOT_SIGNED_UP_COPY,
  SETUP_BUTTONS,
  SETUP_EYEBROW,
  SETUP_FOOTER,
  SETUP_STEP_COPY,
  SETUP_TITLE,
  collapseStepsForScope,
  foundBusinessLine,
  setupBody,
  setupSteps,
  stepsHeading,
  type SetupStepKey,
  type SetupStepView,
} from "../../lib/tax/mtdSetupCopy";
import { MtdScopeCheck, type ScopeState } from "../MtdScopeCheck";
import { HmrcHandoffSheet } from "../HmrcHandoffSheet";

const HAVE_READY_ICON: Record<(typeof HAVE_READY)[number]["key"], keyof typeof Ionicons.glyphMap> = {
  gateway: "key-outline",
  nino: "card-outline",
  phone: "phone-portrait-outline",
};

const TAG_ICON: Record<SetupStepKey, keyof typeof Ionicons.glyphMap> = {
  signUp: "open-outline",
  connect: "lock-closed-outline",
  details: "phone-portrait-outline",
};

/**
 * What setup remembers across the screen's reloads (the load spinner unmounts
 * this component): the scope answer, and a "Set up anyway" tap. Held by the screen.
 */
export interface SetupMemory {
  scope: ScopeState | null;
  setUpAnyway: boolean;
}

export const EMPTY_SETUP_MEMORY: SetupMemory = { scope: null, setUpAnyway: false };

interface Props {
  env: HmrcEnv;
  /** The real service (or not known): 3 steps. Only the known test service drops the GOV.UK sign-up. */
  live: boolean;
  userId: string | null;
  /** The screen's setup step ("ready" only when HMRC says not signed up). */
  step: "connect" | "nino" | "business" | "ready";
  connected: boolean;
  /** HMRC ended the connection (asked to sign in again). */
  expired: boolean;
  notSignedUp: boolean;
  businesses: HmrcBusinessSummary[];
  memory: SetupMemory;
  onMemory: (m: SetupMemory) => void;
  /** Starts HMRC sign-in (the screen's existing OAuth flow, unchanged). */
  onConnect: () => Promise<void> | void;
  onDisconnect?: () => void;
  /** Ask HMRC again (after signing up, or adding a business). */
  onRetry: () => void;
  /** Called before leaving for the NI number or business screens, so the hub reloads on return. */
  onLeave: () => void;
}

/**
 * The Quarterly updates setup screen (HMRC redesign spec 4.3): a heading, the
 * compact scope answer, what to have ready, and the 3 steps with where each
 * one happens. Hand-off sheets explain GOV.UK and HMRC sign-in before we send
 * the driver there. "I've done this" is remembered on the phone.
 */
export function MtdSetup({
  env,
  live,
  userId,
  step,
  connected,
  expired,
  notSignedUp,
  businesses,
  memory,
  onMemory,
  onConnect,
  onDisconnect,
  onRetry,
  onLeave,
}: Props) {
  const [saidSignedUp, setSaidSignedUp] = useState<boolean | null>(null);
  // The sheet stays mounted while it closes; `sheetOpen` drives visibility.
  const [sheetKind, setSheetKind] = useState<HandoffKind>("signUp");
  const [sheetOpen, setSheetOpen] = useState(false);
  // HMRC sign-in is under way (from the tap, through the sheet's close delay,
  // until the browser returns): a second Connect does nothing.
  const connecting = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!userId) {
      setSaidSignedUp(false);
      return;
    }
    if (notSignedUp) {
      // HMRC has the last word: forget the "I've done this" so step 1 reopens.
      void forgetSignedUp(userId);
      setSaidSignedUp(false);
      return;
    }
    hasSaidSignedUp(userId).then((yes) => {
      if (alive) setSaidSignedUp(yes);
    });
    return () => {
      alive = false;
    };
  }, [userId, notSignedUp]);

  const markSignedUp = () => {
    setSaidSignedUp(true);
    if (userId) void rememberSignedUp(userId);
  };

  const changeNumber = () => {
    onLeave();
    router.push("/tax-mtd-nino" as never);
  };

  const openSheet = (kind: HandoffKind) => {
    if (kind === "connect" && connecting.current) return;
    setSheetKind(kind);
    setSheetOpen(true);
  };

  // Runs after the sheet's close delay; `connecting` was set when Continue was tapped.
  const startConnect = () => {
    connecting.current = true;
    Promise.resolve()
      .then(() => onConnect())
      .finally(() => {
        connecting.current = false;
      });
  };

  // Hold the steps until we know the "I've done this" answer, so the driver's
  // place doesn't flash back to step 1.
  if (saidSignedUp === null) return <Heading env={env} />;

  const steps = setupSteps({ live, saidSignedUp, connected, expired, notSignedUp, step });
  const recheck = steps.some((s) => s.key === "signUp" && s.state === "attention");
  const collapsed =
    !memory.setUpAnyway &&
    collapseStepsForScope({
      live,
      scope: memory.scope?.line.tone ?? null,
      saidSignedUp,
      connected: connected || expired,
      notSignedUp,
    });

  const sheetCopy: HandoffCopy =
    sheetKind === "connect"
      ? connectHandoff(env)
      : sheetKind === "addBusiness"
        ? addBusinessHandoff()
        : signUpHandoff({ recheck });

  const openWeb = (url: string | null) => {
    if (url) void WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  return (
    <View>
      <Heading env={env} />

      {!connected && (
        <MtdScopeCheck value={memory.scope} onChange={(scope) => onMemory({ ...memory, scope })} />
      )}

      {collapsed ? (
        <TouchableOpacity
          style={[styles.secondaryBtn, { marginBottom: spacing.xl }]}
          onPress={() => onMemory({ ...memory, setUpAnyway: true })}
          accessibilityRole="button"
          accessibilityLabel={SETUP_BUTTONS.setUpAnyway}
        >
          <Text style={styles.secondaryBtnText}>{SETUP_BUTTONS.setUpAnyway}</Text>
        </TouchableOpacity>
      ) : (
        <>
          {!connected && !expired && (
            <>
              <Text style={styles.sectionLabel}>{HAVE_READY_HEADING}</Text>
              <View style={[styles.card, { gap: spacing.lg }]}>
                {HAVE_READY.map((h) => (
                  <View key={h.key} style={styles.readyRow} accessible accessibilityLabel={`${h.title}. ${h.body}`}>
                    <View style={styles.readyIcon}>
                      <Ionicons name={HAVE_READY_ICON[h.key]} size={20} color={colors.amber} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.readyTitle}>{h.title}</Text>
                      <Text style={styles.readyBody}>{h.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionLabel}>{stepsHeading(steps.length)}</Text>
          <View style={styles.card}>
            {steps.map((s, i) => (
              <StepRow key={s.key} view={s} last={i === steps.length - 1}>
                {s.key === "signUp" && s.state === "current" && (
                  <View style={styles.btnRow}>
                    <PrimaryBtn label={SETUP_BUTTONS.showMeHow} onPress={() => openSheet("signUp")} />
                    <SecondaryBtn label={SETUP_BUTTONS.done} onPress={markSignedUp} />
                  </View>
                )}
                {s.key === "signUp" && s.state === "attention" && (
                  <NotSignedUp
                    onShowHow={() => openSheet("signUp")}
                    onChangeNumber={connected ? changeNumber : undefined}
                    onCheckAgain={connected ? onRetry : undefined}
                  />
                )}
                {s.key === "connect" && s.state === "current" && (
                  <View style={styles.btnRow}>
                    <PrimaryBtn label={SETUP_BUTTONS.connect} onPress={() => openSheet("connect")} />
                  </View>
                )}
                {s.key === "connect" && s.state === "attention" && (
                  <View style={styles.warnBox}>
                    <Text style={styles.warnTitle}>{CONNECTION_EXPIRED.title}</Text>
                    <Text style={styles.stepBody}>{CONNECTION_EXPIRED.body}</Text>
                    <View style={styles.btnRow}>
                      <PrimaryBtn label={CONNECTION_EXPIRED.button} onPress={() => openSheet("connect")} />
                    </View>
                  </View>
                )}
                {s.key === "connect" && s.state === "done" && onDisconnect && (
                  <TouchableOpacity
                    onPress={onDisconnect}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={SETUP_BUTTONS.disconnect}
                    style={{ alignSelf: "flex-start", marginTop: spacing.sm }}
                  >
                    <Text style={styles.quietLink}>{SETUP_BUTTONS.disconnect}</Text>
                  </TouchableOpacity>
                )}
                {s.key === "details" && s.state === "current" && step === "nino" && (
                  <View style={styles.btnRow}>
                    <PrimaryBtn
                      label={SETUP_BUTTONS.enterNumber}
                      onPress={() => {
                        onLeave();
                        router.push("/tax-mtd-nino" as never);
                      }}
                    />
                  </View>
                )}
                {s.key === "details" && s.state === "current" && step === "business" && (
                  notSignedUp ? (
                    <NotSignedUp onChangeNumber={changeNumber} onCheckAgain={onRetry} />
                  ) : (
                    <BusinessPart
                      businesses={businesses}
                      onShowHow={() => openSheet("addBusiness")}
                      onChangeNumber={changeNumber}
                      onCheckAgain={onRetry}
                      onLeave={onLeave}
                    />
                  )
                )}
              </StepRow>
            ))}
          </View>
        </>
      )}

      <Text style={styles.footer}>{SETUP_FOOTER}</Text>

      <HmrcHandoffSheet
        visible={sheetOpen}
        copy={sheetCopy}
        onClose={() => setSheetOpen(false)}
        onPrimaryTap={() => {
          if (sheetCopy.kind === "connect") connecting.current = true;
        }}
        onPrimary={() => (sheetCopy.kind === "connect" ? startConnect() : openWeb(sheetCopy.url))}
        onSecondary={sheetCopy.kind === "signUp" ? (recheck ? onRetry : markSignedUp) : undefined}
      />
    </View>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────

function Heading({ env }: { env: HmrcEnv }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.eyebrow}>{SETUP_EYEBROW}</Text>
      <Text style={styles.h1} accessibilityRole="header">{SETUP_TITLE}</Text>
      <Text style={styles.lede}>{setupBody(env)}</Text>
    </View>
  );
}

function StepRow({ view, last, children }: { view: SetupStepView; last: boolean; children?: ReactNode }) {
  const copy = SETUP_STEP_COPY[view.key];
  const dim = view.state === "later";
  const done = view.state === "done";
  const attention = view.state === "attention";
  const stateWord =
    view.state === "done" ? "done" : view.state === "later" ? "still to do" : attention ? "needs attention" : "to do now";
  return (
    <View style={styles.stepRow}>
      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            view.state === "current" && styles.dotCurrent,
            attention && styles.dotAttention,
            done && styles.dotDone,
          ]}
        >
          {done ? (
            <Ionicons name="checkmark" size={18} color={colors.green} />
          ) : attention ? (
            <Ionicons name="alert" size={18} color={colors.amber} />
          ) : (
            <Text style={[styles.dotText, view.state === "current" && { color: "#000" }]}>{view.number}</Text>
          )}
        </View>
        {!last && <View style={styles.line} />}
      </View>
      <View style={[styles.stepMain, !last && { paddingBottom: spacing.xl }]}>
        <View accessible accessibilityLabel={`Step ${view.number}, ${stateWord}: ${copy.title}. ${done ? "" : copy.body}`}>
          <Text style={[styles.stepTitle, dim && { color: colors.text2 }]}>{copy.title}</Text>
          {!done && <Text style={[styles.stepBody, dim && { opacity: 0.8 }]}>{copy.body}</Text>}
          <View style={styles.tagRow}>
            <Ionicons name={TAG_ICON[view.key]} size={13} color={colors.text3} />
            <Text style={styles.tag}>{copy.tag}</Text>
          </View>
        </View>
        {children}
      </View>
    </View>
  );
}

function NotSignedUp({
  onShowHow,
  onChangeNumber,
  onCheckAgain,
}: {
  onShowHow?: () => void;
  onChangeNumber?: () => void;
  onCheckAgain?: () => void;
}) {
  return (
    <View style={styles.warnBox}>
      <Text style={styles.warnTitle}>{NOT_SIGNED_UP_COPY.title}</Text>
      <Text style={styles.stepBody}>{NOT_SIGNED_UP_COPY.body}</Text>
      <View style={styles.btnRow}>
        {onShowHow && <PrimaryBtn label={SETUP_BUTTONS.showMeHow} onPress={onShowHow} />}
        {onChangeNumber && <SecondaryBtn label={SETUP_BUTTONS.changeNumber} onPress={onChangeNumber} />}
      </View>
      {onCheckAgain && <QuietLink label={SETUP_BUTTONS.checkAgain} onPress={onCheckAgain} />}
    </View>
  );
}

function BusinessPart({
  businesses,
  onShowHow,
  onChangeNumber,
  onCheckAgain,
  onLeave,
}: {
  businesses: HmrcBusinessSummary[];
  onShowHow: () => void;
  onChangeNumber: () => void;
  onCheckAgain: () => void;
  onLeave: () => void;
}) {
  const se = businesses.filter((b) => b.typeOfBusiness === "self-employment");
  const choose = (businessId: string) => {
    onLeave();
    router.push({ pathname: "/tax-mtd-business" as never, params: { businessId } });
  };

  if (se.length === 0) {
    return (
      <View style={styles.warnBox}>
        <Text style={styles.warnTitle}>{BUSINESS_NOT_FOUND.title}</Text>
        <Text style={styles.stepBody}>{BUSINESS_NOT_FOUND.intro}</Text>
        {BUSINESS_NOT_FOUND.causes.map((c) => (
          <View key={c.key} style={styles.cause}>
            <Text style={styles.causeTitle}>{c.title}</Text>
            <Text style={styles.stepBody}>{c.fix}</Text>
            <View style={styles.btnRow}>
              <SecondaryBtn
                label={c.button}
                onPress={c.key === "notAdded" ? onShowHow : onChangeNumber}
              />
            </View>
          </View>
        ))}
        <QuietLink label={BUSINESS_NOT_FOUND.checkAgain} onPress={onCheckAgain} />
      </View>
    );
  }

  // One business: name it, and one tap opens the existing Confirm trade
  // screen, which shows HMRC's details and is the only confirmation.
  if (se.length === 1) {
    const b = se[0];
    const line = foundBusinessLine(b.tradingName);
    return (
      <TouchableOpacity
        style={[styles.businessOption, { marginTop: spacing.md }]}
        onPress={() => choose(b.businessId)}
        accessibilityRole="button"
        accessibilityLabel={`${line}. ${FOUND_BUSINESS_SUB}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.businessName}>{line}</Text>
          <Text style={styles.stepBody}>{FOUND_BUSINESS_SUB}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text3} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.found}>{CHOOSE_BUSINESS.title}</Text>
      <Text style={styles.stepBody}>{CHOOSE_BUSINESS.body}</Text>
      {se.map((b) => (
        <TouchableOpacity
          key={b.businessId}
          style={styles.businessOption}
          onPress={() => choose(b.businessId)}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${b.tradingName ?? "Self-employed"}`}
        >
          <Text style={styles.businessName}>{b.tradingName ?? "Self-employed"}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text3} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PrimaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.primaryBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.secondaryBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function QuietLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ alignSelf: "flex-start", marginTop: spacing.md }}
    >
      <Text style={styles.quietLink}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.amber,
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  h1: { color: colors.text1, fontFamily: fonts.bold, fontSize: fontSizes.display, lineHeight: 34 },
  lede: { color: colors.text2, fontFamily: fonts.regular, fontSize: fontSizes.bodyLg, lineHeight: 23, marginTop: spacing.sm },

  sectionLabel: {
    color: colors.text3,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.caption,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
  },

  readyRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  readyIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  readyTitle: { color: colors.text1, fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg - 1 },
  readyBody: { color: colors.text2, fontFamily: fonts.regular, fontSize: fontSizes.body - 1, lineHeight: 19, marginTop: 1 },

  stepRow: { flexDirection: "row", gap: spacing.md },
  rail: { alignItems: "center", width: 32 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotCurrent: { backgroundColor: colors.amber, borderWidth: 4, borderColor: colors.amberDim, width: 36, height: 36, borderRadius: 18 },
  dotAttention: { backgroundColor: colors.amberDim, borderWidth: 1, borderColor: colors.amber },
  dotDone: { backgroundColor: colors.greenDim },
  dotText: { color: colors.text2, fontFamily: fonts.bold, fontSize: fontSizes.bodyLg - 1 },
  line: { flex: 1, width: 1, backgroundColor: colors.hairline, marginTop: spacing.xs },
  stepMain: { flex: 1 },
  stepTitle: { color: colors.text1, fontFamily: fonts.bold, fontSize: fontSizes.bodyLg + 1, marginTop: 4 },
  stepBody: { color: colors.text2, fontFamily: fonts.regular, fontSize: fontSizes.body, lineHeight: 20, marginTop: 2 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  tag: {
    color: colors.text3,
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption - 1,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  primaryBtn: {
    flexGrow: 1,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#000", fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg - 1 },
  secondaryBtn: {
    flexGrow: 1,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: colors.text1, fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg - 1 },
  quietLink: { color: colors.text2, fontFamily: fonts.semibold, fontSize: fontSizes.body },

  warnBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
    backgroundColor: colors.amberDim,
  },
  warnTitle: { color: colors.text1, fontFamily: fonts.bold, fontSize: fontSizes.bodyLg - 1 },
  cause: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  causeTitle: { color: colors.text1, fontFamily: fonts.semibold, fontSize: fontSizes.body, lineHeight: 20 },

  found: { color: colors.text1, fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg - 1 },
  businessOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: 14,
    marginTop: spacing.sm,
  },
  businessName: { color: colors.text1, fontFamily: fonts.semibold, fontSize: fontSizes.body + 1 },

  footer: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: fontSizes.caption + 1,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
