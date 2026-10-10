import { useCallback, useState } from "react";
import { Alert, View, Text, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { AvatarPicker } from "../../components/avatars/AvatarPicker";
import { useDeleteAccount } from "../../components/settings/useDeleteAccount";
import { usePrompt } from "../../components/prompt";
import { fetchProfile, updateProfile } from "../../lib/api/user";
import { useUser } from "../../lib/user/context";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import type { User } from "@mileclear/shared";

/**
 * Your account: picture, names, email, password and Delete account, in one
 * place. Names and the picture change right here; only the email goes to its
 * own form because changing it needs your password and a code. Replaces
 * Settings > Profile, Edit Profile and the Profile tab's top card.
 */
export default function AccountSettings() {
  const router = useRouter();
  const { refreshUser } = useUser();
  const { prompt } = usePrompt();
  const [user, setUser] = useState<User | null>(null);
  const del = useDeleteAccount();

  const load = useCallback(() => {
    fetchProfile()
      .then((res) => setUser(res.data))
      .catch((e) => console.warn("[settings/account] profile load failed:", e));
  }, []);

  // Re-read on focus: the email form and the verify code screen sit on top.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = useCallback(
    async (patch: { displayName?: string | null; fullName?: string | null; avatarId?: string | null }) => {
      try {
        const res = await updateProfile(patch);
        setUser(res.data);
        refreshUser();
      } catch (err: unknown) {
        Alert.alert("Couldn't save that", err instanceof Error ? err.message : "Try again in a moment.");
      }
    },
    [refreshUser]
  );

  const editDisplayName = useCallback(async () => {
    const res = await prompt({
      title: "Display name",
      message: "How MileClear addresses you.",
      defaultValue: user?.displayName ?? "",
      placeholder: "Nickname",
      neutralLabel: user?.displayName ? "Remove" : undefined,
    });
    if (res.action === "cancel") return;
    if (res.action === "neutral") return save({ displayName: null });
    save({ displayName: res.value.trim() || null });
  }, [prompt, user?.displayName, save]);

  const editFullName = useCallback(async () => {
    const res = await prompt({
      title: "Full name",
      message: "Your legal name. It goes on your tax records and PDF downloads.",
      defaultValue: user?.fullName ?? "",
      placeholder: "Your legal name",
      neutralLabel: user?.fullName ? "Remove" : undefined,
    });
    if (res.action === "cancel") return;
    if (res.action === "neutral") return save({ fullName: null });
    save({ fullName: res.value.trim() || null });
  }, [prompt, user?.fullName, save]);

  return (
    <SettingsScreen>
      <View style={styles.picture}>
        <AvatarPicker
          currentAvatarId={user?.avatarId ?? null}
          onSelect={(avatarId) => save({ avatarId })}
        />
        {user?.email ? (
          <Text style={styles.email} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
            {user.email}
          </Text>
        ) : null}
      </View>

      <SettingsGroup title="ABOUT YOU">
        <SettingsRow
          icon="person-outline"
          label="Display name"
          hint={user?.displayName || "Not set"}
          onPress={editDisplayName}
        />
        <SettingsRow
          icon="document-text-outline"
          label="Full name"
          hint={user?.fullName || "For your tax records. Not set"}
          onPress={editFullName}
        />
      </SettingsGroup>

      <SettingsGroup title="SIGN IN">
        <SettingsRow
          icon="mail-outline"
          label="Email"
          hint={
            user?.pendingEmail
              ? `${user.email}. Waiting for you to confirm ${user.pendingEmail}`
              : user?.email ?? "Loading..."
          }
          onPress={() => router.push("/profile-edit" as never)}
        />
        <SettingsRow
          icon="key-outline"
          label="Change password"
          onPress={() => router.push("/change-password" as never)}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon="trash-outline"
          label={del.deleting ? "Deleting..." : "Delete account"}
          hint="Permanently removes your account and everything in it"
          destructive
          onPress={del.start}
          accessibilityHint="Permanently deletes your account. This cannot be undone."
        />
      </SettingsGroup>
      {del.element}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  picture: { alignItems: "center", paddingTop: 8 },
  email: { marginTop: 8, fontSize: 14, fontFamily: fonts.regular, color: colors.text2 },
});
