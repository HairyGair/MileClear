import { useState } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useUser } from "../lib/user/context";
import AvatarDropdownMenu from "./AvatarDropdownMenu";

export default function AvatarMenuButton() {
  const { user } = useUser();
  const [menuVisible, setMenuVisible] = useState(false);

  const initial = user
    ? (user.displayName || user.email)[0].toUpperCase()
    : "?";

  return (
    <>
      <TouchableOpacity
        style={styles.avatar}
        onPress={() => setMenuVisible(true)}
        hitSlop={6}
        activeOpacity={0.7}
      >
        <Text style={styles.initial}>{initial}</Text>
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
    marginRight: 8,
  },
  initial: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
});
