import { useState } from "react";
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
import { Link, router } from "expo-router";
import { useAuth } from "../../lib/auth/context";

const AMBER = "#f5a623";
const CARD_BG = "#0a1120";
const BORDER = "rgba(255,255,255,0.06)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      router.push({
        pathname: "/(auth)/reset-password",
        params: { email: email.trim().toLowerCase() },
      });
    } catch (e: any) {
      setError(e.message || "Failed to send reset code");
    } finally {
      setLoading(false);
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
          />
          <View style={s.brandText}>
            <Text style={s.brandName}>Mile</Text>
            <Text style={s.brandNameAccent}>Clear</Text>
          </View>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.title}>Forgot password?</Text>
          <Text style={s.subtitle}>
            Enter your email and we'll send you a code to reset your password.
          </Text>

          {error ? (
            <View style={s.errorWrap}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={s.label}>Email</Text>
          <TextInput
            style={[
              s.input,
              focusedField === "email" && s.inputFocused,
            ]}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            placeholder="you@example.com"
            placeholderTextColor={TEXT_3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!loading}
          />

          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#030712" />
            ) : (
              <Text style={s.buttonText}>Send reset code</Text>
            )}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>Remember your password? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={s.link}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
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
    fontSize: 16,
    color: TEXT_1,
    marginBottom: 18,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  inputFocused: {
    borderColor: "rgba(245, 166, 35, 0.35)",
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  footerText: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  link: {
    color: AMBER,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
});
