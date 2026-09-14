// DashboardBlockerCard — the one red card that means "MileClear cannot
// record your miles right now".
//
// Replaces three near-identical hardcoded blocks on the dashboard. Which one
// shows is decided by lib/dashboardMessages (never more than one), so this
// component only has to render the chosen id and route its tap.
//
// Non-dismissible by design: an app that silently can't do its job is worse
// than one that says so. Adnan K, 1 June 2026 — onboarding_complete with
// permission 'undetermined', zero trips, gone in 90 seconds.
//
// Usage:
//   <DashboardBlockerCard
//     id={messages.blocker}
//     onFixLocation={fixLocation}
//     onOpenSettings={() => Linking.openSettings()}
//   />

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";
import type { BlockerId } from "../lib/dashboardMessages";

interface BlockerCopy {
  title: string;
  body: string;
  /** "location" fires the in-app permission escalation; "settings" leaves
   *  the app, because iOS offers no in-app fix for these. */
  action: "location" | "settings";
  a11y: string;
}

const COPY: Record<BlockerId, BlockerCopy> = {
  no_location: {
    title: "Your trips aren't being recorded",
    body: "MileClear needs location access to log your miles. Until it's on, every drive is lost, and so is every £ of tax deduction. Tap to turn it on.",
    action: "location",
    a11y:
      "Your trips are not being recorded. Tap to turn on location access so MileClear can log your miles.",
  },
  bg_refresh_off: {
    title: "Background App Refresh is off",
    body: "iOS won't let MileClear run in the background, so your trips can't record automatically. Turn it on in Settings, MileClear, Background App Refresh. Tap to open Settings.",
    action: "settings",
    a11y:
      "Background App Refresh is off. Tap to open Settings and turn it on so MileClear can record your trips in the background.",
  },
  permission_lost: {
    title: "Your trips stopped recording",
    body: "MileClear had background location access, but it's been turned off, so your drives aren't being recorded anymore. Tap to switch it back to Always.",
    action: "location",
    a11y:
      "You've lost background location access. Tap to restore it so MileClear can record your trips again.",
  },
};

interface Props {
  id: BlockerId;
  /** In-app permission escalation (never Linking.openSettings for a fresh
   *  install: iOS shows no Location row until the app has asked once). */
  onFixLocation: () => void;
  onOpenSettings: () => void;
}

export function DashboardBlockerCard({ id, onFixLocation, onOpenSettings }: Props) {
  const copy = COPY[id];
  return (
    <TouchableOpacity
      style={s.card}
      onPress={copy.action === "location" ? onFixLocation : onOpenSettings}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={copy.a11y}
    >
      <View style={s.row}>
        <View style={s.iconWrap}>
          <Ionicons name="warning" size={20} color={colors.red} accessible={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{copy.title}</Text>
          <Text style={s.body}>{copy.body}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    padding: 14,
    marginBottom: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: "#fca5a5",
    marginBottom: 2,
  },
  body: { fontSize: 12, fontFamily: fonts.regular, color: colors.text2, lineHeight: 17 },
});
