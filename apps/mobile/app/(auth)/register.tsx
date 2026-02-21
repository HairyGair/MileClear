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
} from "react-native";
import { Link, router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../../lib/auth/context";

const AMBER = "#f5a623";
const CARD_BG = "#0a1120";
const BORDER = "rgba(255,255,255,0.06)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";

export default function RegisterScreen() {
  const { register, loginWithApple, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSocialLogin = async (provider: "apple" | "google") => {
    setError("");
    setSocialLoading(provider);
    try {
      if (provider === "apple") {
        await loginWithApple();
      } else {
        await loginWithGoogle();
      }
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED" && e.code !== "SIGN_IN_CANCELLED") {
        setError(e.message || `${provider === "apple" ? "Apple" : "Google"} sign-in failed`);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const handleRegister = async () => {
    setError("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await register(
        email.trim().toLowerCase(),
        password,
        displayName.trim() || undefined,
      );
      router.replace("/(auth)/verify");
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field: string) => [
    s.input,
    focusedField === field && s.inputFocused,
  ];

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
          <Text style={s.brandName}>MileClear</Text>
          <View style={s.brandRule} />
          <Text style={s.brandTagline}>Create your account</Text>
        </View>

        {/* Form card */}
        <View style={s.card}>
          <Text style={s.title}>Get started</Text>

          {error ? (
            <View style={s.errorWrap}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Social sign-in buttons */}
          {Platform.OS === "ios" && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={s.appleButton}
              onPress={() => handleSocialLogin("apple")}
            />
          )}

          <TouchableOpacity
            style={s.googleButton}
            onPress={() => handleSocialLogin("google")}
            disabled={!!socialLoading}
            activeOpacity={0.8}
          >
            {socialLoading === "google" ? (
              <ActivityIndicator color={TEXT_1} />
            ) : (
              <Text style={s.googleButtonText}>Sign up with Google</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          <Text style={s.label}>Email</Text>
          <TextInput
            style={inputStyle("email")}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            placeholder="you@example.com"
            placeholderTextColor={TEXT_3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <Text style={s.label}>Display name</Text>
          <TextInput
            style={inputStyle("name")}
            value={displayName}
            onChangeText={setDisplayName}
            onFocus={() => setFocusedField("name")}
            onBlur={() => setFocusedField(null)}
            placeholder="Optional"
            placeholderTextColor={TEXT_3}
            autoCorrect={false}
            editable={!loading}
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={inputStyle("password")}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            placeholder="At least 8 characters"
            placeholderTextColor={TEXT_3}
            secureTextEntry
            editable={!loading}
          />

          <Text style={s.label}>Confirm password</Text>
          <TextInput
            style={inputStyle("confirm")}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setFocusedField("confirm")}
            onBlur={() => setFocusedField(null)}
            placeholder="Re-enter your password"
            placeholderTextColor={TEXT_3}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#030712" />
            ) : (
              <Text style={s.buttonText}>Create account</Text>
            )}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
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
    alignItems: "center",
    marginBottom: 40,
  },
  brandName: {
    fontSize: 28,
    fontWeight: "200",
    color: AMBER,
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  brandRule: {
    width: 32,
    height: 1,
    backgroundColor: "rgba(245, 166, 35, 0.3)",
    marginVertical: 12,
  },
  brandTagline: {
    fontSize: 14,
    color: TEXT_2,
    fontWeight: "300",
    letterSpacing: 0.5,
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
    fontWeight: "300",
    color: TEXT_1,
    marginBottom: 24,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 12,
    color: TEXT_2,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontWeight: "600",
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
    fontWeight: "700",
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
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  footerText: {
    color: TEXT_2,
    fontSize: 14,
  },
  link: {
    color: AMBER,
    fontSize: 14,
    fontWeight: "600",
  },
  // Social buttons
  appleButton: {
    height: 50,
    marginBottom: 12,
  },
  googleButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginBottom: 4,
  },
  googleButtonText: {
    color: TEXT_1,
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dividerText: {
    color: TEXT_3,
    fontSize: 13,
    marginHorizontal: 16,
    textTransform: "lowercase",
  },
});
