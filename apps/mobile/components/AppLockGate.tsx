// Full-screen lock overlay. Renders nothing unless the user enabled app-lock
// AND the app is currently locked. Auto-prompts for Face ID / Touch ID /
// passcode when it appears; the "Unlock" button retries after a cancel. Mounted
// inside RootNavigator (gated on authenticated + onboarded) as a sibling to the
// Stack, so it covers the UI without touching the native tracking engine.
import { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";
import { useAppLock } from "../lib/appLock/context";

export function AppLockGate() {
  const { isLocked, isLockRequired, authenticate, lockType } = useAppLock();
  const visible = isLockRequired && isLocked;

  // Prompt automatically the moment the lock appears (cold start / re-lock).
  useEffect(() => {
    if (visible) void authenticate();
  }, [visible, authenticate]);

  if (!visible) return null;

  const sub =
    lockType === "face"
      ? "Unlock with Face ID"
      : lockType === "fingerprint"
        ? "Unlock with Touch ID"
        : "Unlock with your passcode";

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={40} color={colors.amber} />
        </View>
        <Text style={styles.title}>MileClear is locked</Text>
        <Text style={styles.sub}>{sub}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => void authenticate()} activeOpacity={0.85}>
          <Text style={styles.btnText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amberDim,
    marginBottom: 24,
  },
  title: {
    color: colors.text1,
    fontFamily: fonts.bold,
    fontSize: 22,
  },
  sub: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 15,
    marginTop: 8,
  },
  btn: {
    marginTop: 32,
    height: 50,
    paddingHorizontal: 48,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: colors.bg,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
