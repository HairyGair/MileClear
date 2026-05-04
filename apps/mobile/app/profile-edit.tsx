import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { fetchProfile, updateProfile } from "../lib/api/user";
import { Button } from "../components/Button";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

export default function ProfileEditScreen() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    fetchProfile()
      .then((res) => {
        setDisplayName(res.data.displayName || "");
        setFullName((res.data as any).fullName || "");
        setEmail(res.data.email);
        setOriginalEmail(res.data.email);
      })
      .catch((err: unknown) => {
        Alert.alert("Couldn't load your profile", err instanceof Error ? err.message : "Try again in a moment.");
        router.back();
      })
      .finally(() => setLoadingProfile(false));
  }, [router]);

  const emailChanged = email.trim().toLowerCase() !== originalEmail.toLowerCase();

  const handleSave = useCallback(async () => {
    if (emailChanged && !currentPassword) {
      Alert.alert("Password required", "Enter your current password to change your email.");
      return;
    }

    setSaving(true);
    try {
      const data: Record<string, unknown> = {};

      data.displayName = displayName.trim() || null;
      data.fullName = fullName.trim() || null;

      if (emailChanged) {
        data.email = email.trim().toLowerCase();
        data.currentPassword = currentPassword;
      }

      await updateProfile(data);

      if (emailChanged) {
        Alert.alert("Profile updated", "Your email has been changed. Please verify your new email address.");
      }

      router.back();
    } catch (err: unknown) {
      Alert.alert("Couldn't update your profile", err instanceof Error ? err.message : "Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [displayName, fullName, email, currentPassword, emailChanged, router]);

  if (loadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{ title: "Edit Profile" }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Full Name</Text>
        <Text style={styles.fieldHint}>Used on PDF exports and tax documents</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your legal name"
          placeholderTextColor={TEXT_3}
          autoCapitalize="words"
          maxLength={200}
          accessibilityLabel="Full name, used on PDF exports and tax documents"
        />

        <Text style={styles.label}>Display Name</Text>
        <Text style={styles.fieldHint}>Public nickname (optional)</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Nickname"
          placeholderTextColor={TEXT_3}
          autoCapitalize="words"
          maxLength={100}
          accessibilityLabel="Display name, public nickname, optional"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor={TEXT_3}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Email address"
        />

        {emailChanged && (
          <>
            <Text style={styles.hint}>
              Changing your email requires your current password. Email verification will be reset.
            </Text>
            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              placeholderTextColor={TEXT_3}
              secureTextEntry
              accessibilityLabel="Current password, required to change email"
            />
          </>
        )}

        <Button
          title="Save Changes"
          icon="checkmark"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: 28 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  fieldHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: AMBER,
    marginTop: 10,
    lineHeight: 18,
  },
});
