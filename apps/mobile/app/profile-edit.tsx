import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { fetchProfile, updateProfile } from "../lib/api/user";

export default function ProfileEditScreen() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    fetchProfile()
      .then((res) => {
        setDisplayName(res.data.displayName || "");
        setEmail(res.data.email);
        setOriginalEmail(res.data.email);
      })
      .catch((err: unknown) => {
        Alert.alert("Error", err instanceof Error ? err.message : "Failed to load profile");
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
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }, [displayName, email, originalEmail, currentPassword, emailChanged, router]);

  if (loadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          title: "Edit Profile",
          headerStyle: { backgroundColor: "#030712" },
          headerTintColor: "#fff",
          headerShown: true,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
          maxLength={100}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor="#6b7280"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
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
              placeholderTextColor="#6b7280"
              secureTextEntry
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#030712",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#d1d5db",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  hint: {
    fontSize: 13,
    color: "#f59e0b",
    marginTop: 10,
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#030712",
  },
});
