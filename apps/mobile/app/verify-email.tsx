/**
 * Confirm a changed email (5 Oct 2026). Opened by profile-edit after a driver
 * changes their email: the server has already sent a code to the new address
 * (PATCH /user/profile), so this screen does not send one on open, unlike the
 * sign-up verify screen. "Resend code" asks for another.
 */
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../lib/auth/context";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const BORDER = colors.surfaceBorder;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { sendVerificationCode, verifyEmail } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendLoading, setResendLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleVerify = async () => {
    setError("");
    if (code.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(code);
      Alert.alert("Email confirmed", "Thanks. Your new email address is confirmed.");
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "That code didn't work. Check it and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setError("");
    try {
      await sendVerificationCode();
      setResendCooldown(60);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't send a new code. Try again in a moment.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Confirm your email" }} />
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.title}>Check your email</Text>
          <Text style={s.subtitle}>
            {email
              ? `We've sent a 6-digit code to ${email}. Enter it here to confirm your new address.`
              : "We've sent a 6-digit code to your new email address. Enter it here to confirm it."}
          </Text>

          {error ? (
            <View style={s.errorWrap} accessibilityLiveRegion="polite" accessibilityRole="alert">
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={s.label}>Code</Text>
          <TextInput
            ref={inputRef}
            style={s.input}
            value={code}
            onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={TEXT_3}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            editable={!loading}
            accessibilityLabel="Email code"
          />

          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Confirm email"
            accessibilityState={{ disabled: loading }}
          >
            {loading ? <ActivityIndicator color={BG} accessibilityLabel="Loading" /> : <Text style={s.buttonText}>Confirm</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0 || resendLoading}
            style={s.resendWrap}
            accessibilityRole="button"
            accessibilityLabel={resendCooldown > 0 ? `Resend code, available in ${resendCooldown} seconds` : "Resend code"}
            accessibilityState={{ disabled: resendCooldown > 0 || resendLoading }}
          >
            {resendLoading ? (
              <ActivityIndicator size="small" color={AMBER} accessibilityLabel="Loading" />
            ) : (
              <Text style={[s.resendText, resendCooldown > 0 && s.resendDisabled]}>
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={s.skipWrap} accessibilityRole="button" accessibilityLabel="Do this later">
            <Text style={s.skipText}>Do this later</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  brandIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  brandText: {
    flexDirection: "row",
    marginLeft: 14,
  },
  brandName: {
    fontSize: 26,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  brandNameAccent: {
    fontSize: 26,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.light,
    color: TEXT_1,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_2,
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  label: {
    fontSize: 12,
    color: TEXT_2,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontFamily: fonts.semibold,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 24,
    color: TEXT_1,
    marginBottom: 18,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: fonts.regular,
  },
  button: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: AMBER,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: BG,
    fontSize: 16,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  errorWrap: {
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  errorText: {
    color: "#f87171",
    fontSize: 13,
    textAlign: "center",
    fontFamily: fonts.regular,
  },
  resendWrap: {
    alignItems: "center",
    marginTop: 20,
  },
  resendText: {
    color: AMBER,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  resendDisabled: {
    color: TEXT_3,
    fontFamily: fonts.regular,
  },
  skipWrap: {
    alignItems: "center",
    marginTop: 16,
  },
  skipText: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
});
