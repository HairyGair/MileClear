// More: every destination the old avatar menu held, in plain groups. The
// tab bar carries Home, Trips, Tax/Insights; everything else is a row here.
// Visibility rules are the old menu's: company drivers never see earnings
// rows, EmSee only shows when the server has it, Admin only for admins, and
// the PRO chips are for free users only.

import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AppHeader from "../../components/AppHeader";
import { UserAvatar } from "../../components/avatars/AvatarRegistry";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useAuth } from "../../lib/auth/context";
import { useUser } from "../../lib/user/context";
import { useMode } from "../../lib/mode/context";
import { useAssistantAvailable } from "../../lib/api/assistant";
import { colors, fonts, radii, spacing } from "../../lib/theme";

export default function MoreScreen() {
  const router = useRouter();
  const { user, isCompanyDriver, isLoading } = useUser();
  const { logout } = useAuth();
  const { isWork } = useMode();
  const assistantAvailable = useAssistantAvailable();

  // A paying subscriber should not be advertised features they own, and the
  // profile is null while loading: treat both as Pro rather than flash "PRO".
  const proBadge = isLoading || user?.isPremium ? undefined : "PRO";

  // Tab screens switch tabs; everything else is pushed on the root stack.
  const go = (route: string) => () => {
    if (route.startsWith("/(tabs)/")) {
      router.navigate(route as never);
    } else {
      router.push(route as never);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader title="More" hideAvatar />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.profileCard}
          onPress={go("/(tabs)/profile")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            user
              ? `${user.displayName || "Driver"}, ${user.email}. Go to profile`
              : "Go to profile"
          }
        >
          <UserAvatar
            avatarId={user?.avatarId}
            name={user?.displayName}
            email={user?.email}
            size={44}
          />
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {user ? user.displayName || "Driver" : "Loading..."}
              </Text>
              {user?.isPremium && (
                <View style={styles.proChip}>
                  <Text style={styles.proChipText}>PRO</Text>
                </View>
              )}
            </View>
            {user?.email ? (
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
        </TouchableOpacity>

        <SettingsGroup title="YOUR DRIVING">
          <SettingsRow icon="key-outline" label="Vehicles" hint="Your cars, MOT and tax dates" onPress={go("/vehicles")} />
          <SettingsRow icon="speedometer-outline" label="Odometer log" hint="Start and end readings for each day" onPress={go("/odometer-log")} />
          <SettingsRow icon="time-outline" label="Shifts" hint="Your work sessions" onPress={go("/shifts")} />
          <SettingsRow icon="location-outline" label="Saved places" hint="Home, work and other places you go" onPress={go("/saved-locations")} />
          <SettingsRow icon="water-outline" label="Fuel" hint="Fill-ups and prices near you" onPress={go("/(tabs)/fuel")} />
          <SettingsRow icon="trophy-outline" label="Achievements" hint="Your badges" onPress={go("/achievements")} />
          {isWork ? (
            <SettingsRow icon="stats-chart-outline" label="Insights" hint="Your numbers and trends" onPress={go("/(tabs)/insights")} />
          ) : (
            <SettingsRow icon="ribbon-outline" label="Records" hint="Mileage certificate and downloads" onPress={go("/(tabs)/tax")} />
          )}
        </SettingsGroup>

        <SettingsGroup title="MONEY">
          {!isCompanyDriver && (
            <SettingsRow icon="cash-outline" label="Earnings" hint="What you were paid" onPress={go("/(tabs)/earnings")} />
          )}
          <SettingsRow icon="receipt-outline" label="Expenses" hint="Parking, tolls and other costs" onPress={go("/expenses")} />
          {!isCompanyDriver && (
            <SettingsRow icon="document-text-outline" label="Invoices" hint="Bill your clients" onPress={go("/invoices")} />
          )}
          {!isCompanyDriver && (
            <SettingsRow icon="business-outline" label="Link a bank" hint="Bring in your earnings automatically" badge={proBadge} onPress={go("/open-banking")} />
          )}
          {!isCompanyDriver && (
            <SettingsRow icon="mail-unread-outline" label="Bank inbox" hint="Payments waiting to be sorted" badge={proBadge} onPress={go("/inbox")} />
          )}
        </SettingsGroup>

        <SettingsGroup title="TOOLS">
          <SettingsRow icon="shield-checkmark-outline" label="Ticket defender" hint="Check a fine against your trips" badge={proBadge} onPress={go("/ticket-defender")} />
          {assistantAvailable === true && (
            <SettingsRow icon="chatbubbles-outline" label="EmSee" hint="Ask about MileClear" badge={proBadge} onPress={go("/assistant")} />
          )}
          {isWork && !isCompanyDriver && (user?.workType === "employee" || user?.workType === "both") && (
            <SettingsRow icon="people-outline" label="Invite your manager" hint="If your employer pays your mileage" onPress={go("/nominate-manager")} />
          )}
          <SettingsRow icon="calendar-outline" label="Work schedule" hint="Your working days and hours" onPress={go("/work-schedule")} />
        </SettingsGroup>

        <SettingsGroup title="HELP AND SETTINGS">
          <SettingsRow icon="settings-outline" label="Settings" hint="Notifications, tracking, work and tax" onPress={go("/settings")} />
          <SettingsRow icon="help-circle-outline" label="Help and tutorials" hint="How MileClear works" onPress={go("/help")} />
          <SettingsRow icon="bulb-outline" label="Feedback" hint="Ideas and problems" onPress={go("/feedback")} />
          <SettingsRow icon="gift-outline" label="Invite a friend, get Pro free" onPress={go("/refer")} />
        </SettingsGroup>

        {user?.isAdmin && (
          <SettingsGroup title="ADMIN">
            <SettingsRow icon="shield-outline" iconColor={colors.red} label="Admin panel" onPress={go("/(tabs)/admin")} />
          </SettingsGroup>
        )}

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={logout}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.red} accessible={false} />
          <Text style={styles.logoutLabel}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: 14,
    minHeight: 72,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1, fontSize: 16, fontFamily: fonts.bold, color: colors.text1 },
  proChip: {
    backgroundColor: colors.amberDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  proChipText: { fontSize: 11, fontFamily: fonts.semibold, color: colors.amber },
  email: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.xl,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.06)",
  },
  logoutLabel: { fontSize: 15, fontFamily: fonts.semibold, color: colors.red },
});
