import { useState } from "react";
import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { useUser } from "../lib/user/context";
import AvatarDropdownMenu from "./AvatarDropdownMenu";
import { AvatarIcon } from "./avatars/AvatarRegistry";

export default function AvatarMenuButton() {
  const { user } = useUser();
  const [menuVisible, setMenuVisible] = useState(false);

  const initial = user
    ? (user.displayName || user.email)[0].toUpperCase()
    : "?";

  return (
    <>
      <TouchableOpacity
        onPress={() => setMenuVisible(true)}
        hitSlop={6}
        activeOpacity={0.7}
        style={{ marginRight: 8 }}
      >
        {user?.avatarId ? (
          <AvatarIcon avatarId={user.avatarId} size={32} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.initial}>{initial}</Text>
          </View>
        )}
      </TouchableOpacity>
      <AvatarDropdownMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f5a623",
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
});
