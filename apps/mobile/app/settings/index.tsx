import { useCallback, useState } from "react";
import { Alert, Linking, Platform, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getTaxYear, driveForOf, driveForSummary, type DriveFor } from "@mileclear/shared";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import { CheckRowView } from "../../components/settings/CheckRowView";
import { UserAvatar } from "../../components/avatars/AvatarRegistry";
import { useSettingsChecks } from "../../components/settings/useSettingsChecks";
import { useSettingsPage } from "../../components/settings/useSettingsPage";
import { useAppLock } from "../../lib/appLock/context";
import { useAuth } from "../../lib/auth/context";
import { useUser } from "../../lib/user/context";
import { useIsPremium } from "../../components/PremiumGate";
import { rateHint, rateTarget } from "../../lib/settings/rate";
import { apiRequest } from "../../lib/api";
import { getDatabase } from "../../lib/db";
import { availableDoorRows } from "../../lib/home/doors";
import { homePersona } from "../../lib/home/persona";
import { DOOR_ROW_LABELS } from "../../lib/home/doorPrefs";
import { useMode } from "../../lib/mode/context";
import type { CheckRow, CheckTap } from "../../lib/settings/checks";
import {
  carSummary,
  downloadsSummary,
  homeScreenSummary,
  placesSummary,
  planSummary,
  recordingOptionsSummary,
  workHoursSummary,
} from "../../lib/settings/summaries";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

const RELOCK = [
  { label: "Immediately", ms: 0 },
  { label: "After 1 minute", ms: 60_000 },
  { label: "After 5 minutes", ms: 5 * 60_000 },
];

/**
 * Settings (Oct 2026 redesign, direction A "Check-up first"). One page in five
 * groups: is MileClear working, you and your car, how it works for you, your
 * records, help. The four checks at the top use Home's own words and rules.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, company, isCompanyDriver } = useUser();
  const isPremium = useIsPremium();
  const { mode, isPersonal } = useMode();
  const checks = useSettingsChecks();
  const page = useSettingsPage(isPremium);
  const lock = useAppLock();
  const [lockBusy, setLockBusy] = useState(false);
  const platform = Platform.OS === "ios" ? "ios" : "android";

  const driveFor: DriveFor = driveForOf(user);
  const companyCar = driveFor === "company" || isCompanyDriver;
  const showWorkHours = driveFor !== "personal";
  const car = carSummary(page.cars, { companyCar, failed: page.carsFailed });
  const taxYear = getTaxYear(new Date());

  const available = availableDoorRows({
    mode,
    persona: homePersona({ isPersonal, isCompanyDriver, workType: user?.workType }),
  });
  const homeSummary = homeScreenSummary(
    available.map((id) => ({ label: DOOR_ROW_LABELS[id], shown: !page.hiddenDoors.includes(id) }))
  );

  const go = (path: string) => () => router.push(path as never);

  const onCheckTap = useCallback(
    async (tap: CheckTap) => {
      switch (tap) {
        case "recording_screen":
          router.push("/settings/recording" as never);
          break;
        case "fix_location":
          await checks.fixLocation();
          break;
        case "fix_background_refresh":
          checks.openPhoneSettings();
          break;
        case "resume": {
          const m = await import("../../lib/tracking/detection");
          await m.resumeDriveDetection("manual").catch(() => {});
          checks.phone.refresh();
          break;
        }
        case "trips":
          router.navigate("/(tabs)/trips" as never);
          break;
        case "notifications_screen":
          router.push("/settings/notifications" as never);
          break;
        case "fix_notifications":
          await checks.fixNotifications();
          break;
        case "sync_status":
          router.push("/sync-status" as never);
          break;
      }
    },
    [checks, router]
  );

  // App lock: the old Security screen's one switch, here on the page.
  const isIos = Platform.OS === "ios";
  const method = isIos
    ? lock.lockType === "face" ? "Face ID" : lock.lockType === "fingerprint" ? "Touch ID" : "your passcode"
    : lock.lockType === "face" ? "face unlock" : lock.lockType === "fingerprint" ? "your fingerprint" : "your screen lock";
  const setupHint = isIos
    ? "Set up Face ID, Touch ID or a passcode in your iPhone's Settings first."
    : "Set up a fingerprint, face unlock or screen lock in your phone's settings first.";
  const onLockToggle = useCallback(
    async (next: boolean) => {
      setLockBusy(true);
      try {
        const ok = await lock.setEnabled(next);
        if (next && !ok) {
          Alert.alert(
            lock.available ? "Couldn't turn on app lock" : "Not available yet",
            lock.available ? "It didn't work that time. Try again." : setupHint
          );
        }
      } finally {
        setLockBusy(false);
      }
    },
    [lock, setupHint]
  );
  const relockLabel = RELOCK.find((o) => o.ms === lock.config.requireAfterMs)?.label ?? "Immediately";
  const pickRelock = useCallback(() => {
    Alert.alert("Ask again", "Lock MileClear again after it has been in the background for:", [
      ...RELOCK.map((o) => ({ text: o.label, onPress: () => void lock.setRequireAfterMs(o.ms) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }, [lock]);

  const handleRate = useCallback(async () => {
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({ type: "rating.manual_open", metadata: { source: "settings", platform } }),
    }).catch(() => {});
    try {
      const d = await getDatabase();
      await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('review_given', '1')");
    } catch {}
    const target = rateTarget(platform);
    Linking.openURL(target.primary).catch(() => Linking.openURL(target.fallback).catch(() => {}));
  }, [platform]);

  const termsAndPrivacy = useCallback(() => {
    Alert.alert("Terms and privacy", undefined, [
      { text: "Terms of Use", onPress: () => Linking.openURL("https://mileclear.com/terms") },
      { text: "Privacy Policy", onPress: () => Linking.openURL("https://mileclear.com/privacy") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);

  const confirmLogout = useCallback(() => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);
  }, [logout]);

  const version = Constants.expoConfig?.version ?? "";
  const build =
    platform === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? "");
  const versionText = version ? `MileClear ${version}${build ? ` (${build})` : ""}` : "MileClear";

  return (
    <SettingsScreen>
      <SettingsGroup title="IS MILECLEAR WORKING?">
        {checks.rows.map((row: CheckRow) => (
          <CheckRowView
            key={row.id}
            look={row.look}
            title={row.title}
            hint={row.hint}
            action={row.action}
            onPress={() => onCheckTap(row.tap)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="YOU AND YOUR CAR">
        <AccountRow
          name={user?.displayName || "Driver"}
          email={user?.email ?? ""}
          avatarId={user?.avatarId}
          onPress={go("/settings/account")}
        />
        <SettingsRow
          icon="car-outline"
          label="Your car"
          hint={car.text}
          iconColor={car.tone === "add" ? colors.amber : undefined}
          onPress={go("/vehicles")}
        />
        <SettingsRow
          icon="briefcase-outline"
          label="You drive for"
          hint={driveForSummary(driveFor, {
            employerRatePence: user?.employerMileageRatePence,
            teamName: company?.orgName,
          })}
          onPress={go("/settings/work-tax")}
        />
        <SettingsRow
          icon="star-outline"
          label="Your plan"
          hint={planSummary(page.plan)}
          onPress={go("/settings/plan")}
        />
      </SettingsGroup>

      <SettingsGroup title="HOW MILECLEAR WORKS FOR YOU">
        <SettingsRow
          icon="navigate-outline"
          label="Recording options"
          hint={recordingOptionsSummary(page.journeyEndLabel)}
          onPress={go("/settings/recording")}
        />
        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          hint="Choose which ones you get"
          onPress={go("/settings/notifications")}
        />
        <SettingsRow
          icon="bookmark-outline"
          label="Saved places"
          hint={placesSummary(page.places)}
          onPress={go("/saved-locations")}
        />
        {showWorkHours && (
          <SettingsRow
            icon="calendar-outline"
            label="Work hours"
            hint={workHoursSummary(page.slots)}
            onPress={go("/work-schedule")}
          />
        )}
        <SettingsRow
          icon="home-outline"
          label="Home screen"
          hint={homeSummary}
          onPress={go("/settings/home")}
        />
        <ToggleRow
          icon="lock-closed-outline"
          label="App lock"
          hint={lock.available || lock.isLockRequired ? `Ask for ${method} when you open it` : setupHint}
          value={lock.isLockRequired}
          onToggle={onLockToggle}
          disabled={lockBusy || (!lock.available && !lock.isLockRequired)}
        />
        {lock.isLockRequired && (
          <SettingsRow icon="time-outline" label="Ask again" hint={relockLabel} onPress={pickRelock} />
        )}
      </SettingsGroup>

      <SettingsGroup title="YOUR RECORDS">
        <SettingsRow
          icon="download-outline"
          label="Downloads"
          hint={downloadsSummary(taxYear, companyCar)}
          badge={isPremium || isCompanyDriver ? undefined : "Pro"}
          onPress={go("/exports")}
        />
        <SettingsRow
          icon="shield-outline"
          label="Your data"
          hint="Get a copy of everything we hold"
          onPress={go("/settings/data")}
        />
      </SettingsGroup>

      <SettingsGroup title="HELP">
        <SettingsRow icon="help-circle-outline" label="Help and how-tos" onPress={go("/help")} />
        <SettingsRow icon="chatbubble-outline" label="Tell us about a problem or idea" onPress={go("/feedback")} />
        <SettingsRow
          icon="mail-outline"
          label="Email support"
          hint="support@mileclear.com"
          onPress={() => Linking.openURL("mailto:support@mileclear.com?subject=MileClear%20Support").catch(() => {})}
        />
        <SettingsRow
          icon="people-outline"
          label="MileClear community"
          hint="Chat with other drivers"
          onPress={go("/settings/community")}
        />
        <SettingsRow icon="star-outline" label="Rate MileClear" hint={rateHint(platform)} onPress={handleRate} />
        <SettingsRow
          icon="gift-outline"
          label="Invite a friend, get Pro free"
          hint="Up to 3 free months"
          onPress={go("/refer")}
        />
        <SettingsRow icon="document-text-outline" label="Terms and privacy" onPress={termsAndPrivacy} />
      </SettingsGroup>

      <TouchableOpacity
        style={styles.logout}
        onPress={confirmLogout}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Log out"
      >
        <Text style={styles.logoutText} maxFontSizeMultiplier={fontScaleCap.body}>
          Log out
        </Text>
      </TouchableOpacity>
      <Text style={styles.version} maxFontSizeMultiplier={fontScaleCap.body}>
        {versionText}
      </Text>
    </SettingsScreen>
  );
}

/** The account row: picture, name, email. `border` is injected by SettingsGroup. */
function AccountRow({
  name,
  email,
  avatarId,
  onPress,
  border,
}: {
  name: string;
  email: string;
  avatarId?: string | null;
  onPress: () => void;
  border?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.account, border && styles.accountBorder]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`You. ${name}, ${email}`}
      accessibilityHint="Your picture, names, car and plan"
    >
      <UserAvatar avatarId={avatarId} name={name} email={email} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.accountName} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
          {name}
        </Text>
        {email ? (
          <Text style={styles.accountEmail} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
            {email}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 64,
  },
  accountBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  accountName: { fontSize: 16, fontFamily: fonts.bold, color: colors.text1 },
  accountEmail: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  logout: {
    marginTop: spacing.xl,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  logoutText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.red },
  version: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 4,
    marginBottom: spacing.md,
  },
});
