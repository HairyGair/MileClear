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
  Image,
} from "react-native";
import { useAuth } from "../../lib/auth/context";

const AMBER = "#f5a623";
const CARD_BG = "#0a1120";
const BORDER = "rgba(255,255,255,0.06)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

export default function VerifyScreen() {
  const { completeAuth, sendVerificationCode, verifyEmail } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Send verification code on mount
  useEffect(() => {
    sendVerificationCode()
      .then(() => {
        setSent(true);
        setResendCooldown(60);
      })
      .catch(() => {
        // Silent — user can tap resend
      });
  }, [sendVerificationCode]);

  // Countdown timer for resend
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
      completeAuth();
    } catch (e: any) {
      setError(e.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setError("");
    setResendLoading(true);
    try {
      await sendVerificationCode();
      setResendCooldown(60);
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Failed to resend code");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={s.brandWrap}>
          <Image
            source={require("../../assets/branding/logo-original.png")}
            style={s.brandIcon}
            resizeMode="contain"
            accessible={false}
          />
          <View style={s.brandText}>
            <Text style={s.brandName}>Mile</Text>
            <Text style={s.brandNameAccent}>Clear</Text>
          </View>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.title}>Check your email</Text>
          <Text style={s.subtitle}>
            {sent
              ? "We've sent a 6-digit verification code to your email address."
              : "Sending verification code..."}
          </Text>

          {error ? (
            <View
              style={s.errorWrap}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={s.label}>Verification code</Text>
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
            accessibilityLabel="Verification code"
          />

          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Verify email"
            accessibilityState={{ disabled: loading }}
          >
            {loading ? (
              <ActivityIndicator color="#030712" accessibilityLabel="Loading" />
            ) : (
              <Text style={s.buttonText}>Verify</Text>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0 || resendLoading}
            style={s.resendWrap}
            accessibilityRole="button"
            accessibilityLabel={
              resendCooldown > 0
                ? `Resend code, available in ${resendCooldown} seconds`
                : "Resend verification code"
            }
            accessibilityState={{ disabled: resendCooldown > 0 || resendLoading }}
          >
            {resendLoading ? (
              <ActivityIndicator size="small" color={AMBER} accessibilityLabel="Loading" />
            ) : (
              <Text
                style={[
                  s.resendText,
                  resendCooldown > 0 && s.resendDisabled,
                ]}
              >
                {resendCooldown > 0
                  ? `Resend code (${resendCooldown}s)`
                  : "Resend code"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity
            onPress={() => completeAuth()}
            style={s.skipWrap}
            accessibilityRole="button"
            accessibilityLabel="Skip verification for now"
          >
            <Text style={s.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  brandNameAccent: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_2,
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  label: {
    fontSize: 12,
    color: TEXT_2,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_400Regular",
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
    color: "#030712",
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
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
    fontFamily: "PlusJakartaSans_400Regular",
  },
  resendWrap: {
    alignItems: "center",
    marginTop: 20,
  },
  resendText: {
    color: AMBER,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  resendDisabled: {
    color: TEXT_3,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  skipWrap: {
    alignItems: "center",
    marginTop: 16,
  },
  skipText: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
  },
});
