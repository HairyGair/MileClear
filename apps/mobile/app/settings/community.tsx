// Community settings — currently just the Discord link card. Will grow
// into a richer hub as more community surfaces ship.
//
// Phase 1A: Discord OAuth link / unlink with Pro Member role sync.

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import {
  startDiscordLink,
  getDiscordStatus,
  unlinkDiscord,
  type DiscordLinkStatus,
} from "../../lib/api/discord";
import { colors, fonts } from "../../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const CARD_BORDER = colors.surfaceBorder ?? "rgba(255,255,255,0.06)";
const GREEN = colors.green;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

const DISCORD_BLURPLE = "#5865F2";
const DISCORD_INVITE = "https://discord.gg/mileclear";

export default function CommunitySettings() {
  const [status, setStatus] = useState<DiscordLinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getDiscordStatus();
      setStatus(res.data);
    } catch {
      setStatus({ linked: false, discordUserId: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch on focus so coming back from the OAuth browser picks up
  // the new linked state even if the WebBrowser result was missed.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleConnect = useCallback(async () => {
    setBusy(true);
    try {
      const res = await startDiscordLink();
      const result = await WebBrowser.openAuthSessionAsync(
        res.data.url,
        "mileclear://discord-linked"
      );
      // openAuthSessionAsync resolves with .type = "success" | "cancel" | "dismiss"
      if (result.type === "success" && result.url) {
        const u = new URL(result.url);
        const ok = u.searchParams.get("ok") === "true";
        const reason = u.searchParams.get("reason");
        if (!ok) {
          const msg = friendlyReason(reason);
          Alert.alert("Couldn't link Discord", msg);
        }
      }
      await load();
    } catch (err) {
      Alert.alert(
        "Couldn't open Discord",
        err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setBusy(false);
    }
  }, [load]);

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      "Disconnect Discord?",
      "You'll keep your MileClear account but lose your Pro Member badge in the Discord server.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await unlinkDiscord();
              await load();
            } catch (err) {
              Alert.alert(
                "Couldn't disconnect",
                err instanceof Error ? err.message : "Try again."
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [load]);

  const openInvite = useCallback(() => {
    WebBrowser.openBrowserAsync(DISCORD_INVITE).catch(() => {});
  }, []);

  return (
    <SettingsScreen>
      {/* Hero card — Discord */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Pressable
            style={styles.discordIcon}
            onPress={openInvite}
            accessibilityRole="link"
            accessibilityLabel="Open the MileClear Discord server"
          >
            <Image
              source={require("../../assets/branding/discord/symbol-blurple.png")}
              style={styles.discordIconImage}
              resizeMode="contain"
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>MileClear on Discord</Text>
            <Text style={styles.cardSubtitle}>
              UK drivers, tax tips, community help. Pro members get a badge.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AMBER} />
          </View>
        ) : status?.linked ? (
          <>
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={16} color={GREEN} />
              <Text style={styles.statusText}>
                Connected · Discord ID{" "}
                <Text style={styles.statusId}>{status.discordUserId}</Text>
              </Text>
            </View>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={openInvite}
              disabled={busy}
            >
              <Ionicons name="open-outline" size={16} color={TEXT_1} />
              <Text style={styles.btnSecondaryText}>Open community</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnDanger]}
              onPress={handleDisconnect}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={TEXT_3} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color={TEXT_3} />
                  <Text style={styles.btnDangerText}>Disconnect</Text>
                </>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.benefitText}>
              Link your account to unlock the Pro Member badge (if you're Pro) and
              keep your community profile in sync.
            </Text>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleConnect}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Image
                    source={require("../../assets/branding/discord/symbol-white.png")}
                    style={styles.btnIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.btnPrimaryText}>Connect Discord</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={openInvite}
              disabled={busy}
            >
              <Ionicons name="open-outline" size={16} color={TEXT_1} />
              <Text style={styles.btnSecondaryText}>Visit the server</Text>
            </Pressable>
          </>
        )}
      </View>
    </SettingsScreen>
  );
}

function friendlyReason(reason: string | null): string {
  switch (reason) {
    case "already_linked_elsewhere":
      return "That Discord account is already linked to a different MileClear account.";
    case "bad_state":
      return "The link request expired. Try again.";
    case "exchange_failed":
      return "Discord didn't recognise the sign-in. Try again.";
    case "missing_params":
    case null:
      return "We didn't get a response back from Discord. Try again.";
    default:
      if (reason?.startsWith("denied_")) {
        return "You cancelled the Discord sign-in. No changes made.";
      }
      return "Something went wrong. Try again.";
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  discordIcon: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: "rgba(88,101,242,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  discordIconImage: {
    width: 28,
    height: 28,
  },
  cardTitle: {
    color: TEXT_1,
    fontSize: 16,
    fontFamily: fonts.semibold,
    marginBottom: 2,
  },
  cardSubtitle: {
    color: TEXT_2,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  benefitText: {
    color: TEXT_2,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.regular,
    marginTop: 4,
  },
  loadingRow: {
    paddingVertical: 8,
    alignItems: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  statusText: {
    color: TEXT_2,
    fontSize: 13,
    fontFamily: fonts.regular,
    flex: 1,
  },
  statusId: {
    color: TEXT_3,
    fontFamily: fonts.regular,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  btnIcon: {
    width: 18,
    height: 18,
  },
  btnPrimary: {
    backgroundColor: DISCORD_BLURPLE,
  },
  btnPrimaryText: {
    color: "#fff",
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  btnSecondaryText: {
    color: TEXT_1,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  btnDanger: {
    backgroundColor: "transparent",
  },
  btnDangerText: {
    color: TEXT_3,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
});
