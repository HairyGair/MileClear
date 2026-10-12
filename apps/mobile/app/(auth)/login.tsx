import { useRef, useState } from "react";
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
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth/context";
import { GoogleSignInButton } from "../../components/auth/GoogleSignInButton";
import { RouteHero } from "../../components/auth/RouteHero";
import { colors, fonts } from "../../lib/theme";

let AppleAuthentication: typeof import("expo-apple-authentication") | null = null;
try { AppleAuthentication = require("expo-apple-authentication"); } catch {}

// Sign-in, "Route" look (12 Oct 2026): a map with a recorded drive on top,
// then Apple, Google and email. The email form opens in place so the first
// thing a new driver sees is what MileClear does, not two empty boxes.
// Apple and Google also create an account for someone new, hence the terms line.

const HERO_HEIGHT = 360;
const HERO_HEIGHT_EMAIL = 190;

export default function LoginScreen() {
  const { login, loginWithApple, loginWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"apple" | "google" | null>(null);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const appleAvailable = Platform.OS === "ios" && !!AppleAuthentication;
  const busy = loading || socialLoading !== null;

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
      // Don't show an error when the driver cancelled
      if (e.code !== "ERR_REQUEST_CANCELED" && e.code !== "SIGN_IN_CANCELLED") {
        setError(e.message || `${provider === "apple" ? "Apple" : "Google"} sign-in failed`);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const handleLogin = async () => {
    setError("");
    if (!email.trim()) {
      setError("Enter your email address");
      return;
    }
    if (!password) {
      setError("Enter your password");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const openEmail = () => {
    setError("");
    setMode("email");
  };

  const backToChoices = () => {
    setError("");
    setMode("choose");
  };

  const heroHeight = (mode === "email" ? HERO_HEIGHT_EMAIL : HERO_HEIGHT) + insets.top;

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* Map with a recorded drive, fading into the page */}
        <View style={[s.hero, { height: heroHeight }]}>
          <RouteHero width={screenWidth} height={heroHeight} topInset={insets.top} />
          <View style={[s.brandWrap, { top: insets.top + 20 }]}>
            <Image
              source={require("../../assets/branding/logo-original.png")}
              style={s.brandIcon}
              resizeMode="contain"
              accessible={false}
            />
            <Text style={s.brandName} accessibilityRole="header">
              Mile<Text style={s.brandAccent}>Clear</Text>
            </Text>
          </View>
          {mode === "choose" && (
            <View style={s.chip} accessible={false} importantForAccessibility="no-hide-descendants">
              <Text style={s.chipLabel}>Recorded by itself</Text>
              <Text style={s.chipValue}>
                12.4 mi <Text style={s.chipAccent}>· Business</Text>
              </Text>
            </View>
          )}
        </View>

        <View style={s.body}>
          {mode === "choose" ? (
            <>
              <Text style={s.headline} accessibilityRole="header">
                Every mile,{"\n"}counted.
              </Text>
              <Text style={s.sub}>
                MileClear records your drives on its own, so your mileage claim is ready when you need it.
              </Text>
            </>
          ) : (
            <Text style={s.title} accessibilityRole="header">Sign in with email</Text>
          )}

          {error ? (
            <View style={s.errorWrap} accessibilityLiveRegion="polite" accessibilityRole="alert">
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {mode === "choose" ? (
            <View style={s.buttons}>
              {appleAvailable && AppleAuthentication && (
                <View pointerEvents={busy ? "none" : "auto"} style={busy && socialLoading !== "apple" ? s.dimmed : undefined}>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={14}
                    style={s.appleButton}
                    onPress={() => handleSocialLogin("apple")}
                  />
                </View>
              )}

              <GoogleSignInButton
                loading={socialLoading === "google"}
                disabled={busy}
                onPress={() => handleSocialLogin("google")}
              />

              <TouchableOpacity
                style={[s.outlineButton, busy && s.dimmed]}
                onPress={openEmail}
                disabled={busy}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Sign in with email"
              >
                <Ionicons name="mail-outline" size={19} color={colors.text1} />
                <Text style={s.outlineButtonText}>Sign in with email</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.form}>
              <View style={s.field}>
                <Text style={s.label}>Email</Text>
                <TextInput
                  style={[s.input, focusedField === "email" && s.inputFocused]}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.text3}
                  keyboardType="email-address"
                  textContentType="username"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!loading}
                  accessibilityLabel="Email address"
                />
              </View>

              <View style={s.field}>
                <View style={s.labelRow}>
                  <Text style={s.label}>Password</Text>
                  <Link href="/(auth)/forgot-password" asChild>
                    <TouchableOpacity
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="link"
                      accessibilityLabel="Forgot password"
                    >
                      <Text style={s.forgotText}>Forgot?</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
                <View>
                  <TextInput
                    ref={passwordRef}
                    style={[s.input, s.passwordInput, focusedField === "password" && s.inputFocused]}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Your password"
                    placeholderTextColor={colors.text3}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    editable={!loading}
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity
                    style={s.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  >
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.text3} />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[s.primaryButton, loading && s.dimmed]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                accessibilityState={{ disabled: loading, busy: loading }}
              >
                {loading ? (
                  <ActivityIndicator color={colors.bg} accessibilityLabel="Signing in" />
                ) : (
                  <Text style={s.primaryButtonText}>Sign in</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.backLink}
                onPress={backToChoices}
                disabled={loading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Other ways to sign in"
              >
                <Ionicons name="chevron-back" size={16} color={colors.text2} />
                <Text style={s.backLinkText}>Other ways to sign in</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.spacer} />

          <View style={s.footer}>
            <Text style={s.footerText}>New to MileClear? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity accessibilityRole="link" accessibilityLabel="Create an account">
                <Text style={s.link}>Create an account</Text>
              </TouchableOpacity>
            </Link>
          </View>
          {mode === "choose" && (
            <Text style={s.terms}>
              By continuing you agree to our{" "}
              <Text style={s.termsLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/terms").catch(() => {})} accessibilityRole="link">
                terms
              </Text>{" "}
              and{" "}
              <Text style={s.termsLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/privacy").catch(() => {})} accessibilityRole="link">
                privacy policy
              </Text>
              .
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  // Hero
  hero: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#070d1a",
  },
  brandWrap: {
    position: "absolute",
    left: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  brandName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text1,
    letterSpacing: -0.3,
  },
  brandAccent: {
    color: colors.amber,
  },
  chip: {
    position: "absolute",
    right: 24,
    bottom: 64,
    backgroundColor: "rgba(10,17,32,0.92)",
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  chipLabel: {
    fontSize: 12,
    color: colors.text3,
    fontFamily: fonts.regular,
  },
  chipValue: {
    fontSize: 17,
    color: colors.text1,
    fontFamily: fonts.bold,
  },
  chipAccent: {
    color: colors.amber,
  },
  // Body
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  headline: {
    fontSize: 34,
    lineHeight: 38,
    fontFamily: fonts.bold,
    color: colors.text1,
    letterSpacing: -0.8,
  },
  sub: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text3,
    fontFamily: fonts.regular,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.text1,
    letterSpacing: -0.5,
  },
  buttons: {
    marginTop: 28,
    gap: 12,
  },
  appleButton: {
    height: 54,
    width: "100%",
  },
  outlineButton: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  outlineButtonText: {
    color: colors.text1,
    fontSize: 17,
    fontFamily: fonts.semibold,
  },
  dimmed: {
    opacity: 0.6,
  },
  // Email form
  form: {
    marginTop: 24,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    fontSize: 14,
    color: "#cbd5e1",
    fontFamily: fonts.semibold,
  },
  forgotText: {
    fontSize: 14,
    color: colors.amber,
    fontFamily: fonts.semibold,
  },
  input: {
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text1,
    fontFamily: fonts.regular,
  },
  passwordInput: {
    paddingRight: 52,
  },
  inputFocused: {
    borderColor: "rgba(245,166,35,0.5)",
  },
  eyeButton: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    marginTop: 4,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: colors.bg,
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
  },
  backLinkText: {
    color: colors.text2,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  // Error
  errorWrap: {
    marginTop: 16,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: fonts.regular,
  },
  // Footer
  spacer: {
    flex: 1,
    minHeight: 28,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    color: colors.text3,
    fontSize: 15,
    fontFamily: fonts.regular,
  },
  link: {
    color: colors.amber,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  terms: {
    marginTop: 14,
    textAlign: "center",
    color: colors.text2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  termsLink: {
    color: colors.text3,
    textDecorationLine: "underline",
  },
});
