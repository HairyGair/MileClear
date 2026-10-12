import { TouchableOpacity, Text, Image, ActivityIndicator, StyleSheet } from "react-native";
import { colors, fonts } from "../../lib/theme";

/**
 * Google's own "G" on a dark outlined button, the dark-theme style Google's
 * branding rules allow. Used on sign-in and sign-up, on iPhone and Android.
 */
export function GoogleSignInButton({
  label = "Sign in with Google",
  loading,
  disabled,
  onPress,
}: {
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.button, disabled && !loading && s.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
    >
      {loading ? (
        <ActivityIndicator color={colors.text1} />
      ) : (
        <>
          <Image source={require("../../assets/branding/google-g.png")} style={s.logo} accessible={false} />
          <Text style={s.text}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#131314",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  disabled: { opacity: 0.6 },
  logo: { width: 18, height: 18 },
  text: { color: colors.text1, fontSize: 17, fontFamily: fonts.semibold },
});
