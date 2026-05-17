import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { fetchProfile } from "../../lib/api/user";
import type { User } from "@mileclear/shared";

/**
 * Profile + account settings. Split from the old monolithic "General"
 * page so the hub doesn't have one row enumerating five different
 * things ("Name, email, password, avatar, dashboard mode"). Display
 * Name lives here; dashboard-mode + future preferences live in
 * /settings/preferences. Anthony 17 May audit.
 */
export default function ProfileSettings() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchProfile()
      .then((res) => setUser(res.data))
      .catch((e) => console.warn("[settings/profile] profile load failed:", e));
  }, []);

  return (
    <SettingsScreen>
      <SettingsGroup title="PROFILE">
        <SettingsRow
          icon="person-outline"
          label="Display name"
          hint={user?.displayName ?? "Set how MileClear addresses you"}
          onPress={() => router.push("/profile-edit" as never)}
        />
        <SettingsRow
          icon="document-text-outline"
          label="Full name (legal)"
          hint={user?.fullName ?? "Used on Self Assessment exports"}
          onPress={() => router.push("/profile-edit" as never)}
        />
        <SettingsRow
          icon="happy-outline"
          label="Avatar"
          hint="Pick the icon shown on the dashboard and map"
          onPress={() => router.push("/profile-edit" as never)}
        />
      </SettingsGroup>

      <SettingsGroup title="ACCOUNT">
        <SettingsRow
          icon="mail-outline"
          label="Email"
          hint={user?.email ?? "Loading..."}
          onPress={() => router.push("/profile-edit" as never)}
        />
        <SettingsRow
          icon="key-outline"
          label="Change password"
          onPress={() => router.push("/change-password" as never)}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
