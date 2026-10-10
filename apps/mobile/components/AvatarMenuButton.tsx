import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useUser } from "../lib/user/context";
import { UserAvatar } from "./avatars/AvatarRegistry";

// The header avatar. Tapping it opens Settings (the Profile tab was folded into it in Oct 2026). It used to open a bottom
// sheet holding every destination in the app; those now live on the More tab
// (app/(tabs)/more.tsx) and the tab bar (app/(tabs)/_layout.tsx). The count of
// trips to classify moved to the Trips tab badge, so the avatar carries none.
export default function AvatarMenuButton() {
  const { user } = useUser();
  const router = useRouter();

  return (
    <View style={styles.avatarBtn}>
      <Pressable
        onPress={() => router.push("/settings" as never)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        accessibilityRole="button"
        accessibilityLabel="Settings and your account"
      >
        <UserAvatar
          avatarId={user?.avatarId}
          name={user?.displayName}
          email={user?.email}
          size={36}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed size to prevent React Navigation stretch.
  avatarBtn: {
    width: 36,
    height: 36,
    marginRight: 8,
    alignSelf: "center",
  },
});
