import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SettingsScreen } from "../components/settings/SettingsScreen";
import { SettingsGroup } from "../components/settings/SettingsGroup";
import { ContextualHelp } from "../components/ContextualHelp";
import { fetchProfile, updateProfile } from "../lib/api/user";
import { useUser } from "../lib/user/context";
import { colors, fonts, radii, spacing } from "../lib/theme";

/**
 * "My Accountant" settings screen. Laura Joyce request 11 May 2026.
 *
 * The user pays an accountant a known annual fee. MileClear treats it
 * as a fixed weekly expense (fee / 52) and adds it to the Tax
 * Readiness set-aside guidance so they're putting cash aside for both
 * tax AND the accountant.
 *
 * Intentionally minimal — no marketplace, no accountant login, no
 * shared dashboards. Three fields, save, done.
 */
export default function AccountantSettings() {
  const { refreshUser } = useUser();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [feePounds, setFeePounds] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchProfile();
        const user = res.data as unknown as {
          accountantName?: string | null;
          accountantContact?: string | null;
          accountantAnnualFeePence?: number | null;
        };
        setName(user.accountantName ?? "");
        setContact(user.accountantContact ?? "");
        if (user.accountantAnnualFeePence != null && user.accountantAnnualFeePence > 0) {
          setFeePounds((user.accountantAnnualFeePence / 100).toFixed(2));
        }
      } catch (err) {
        console.warn("[accountant] profile load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedContact = contact.trim();
      const feeNumber = feePounds.trim() ? parseFloat(feePounds.trim()) : 0;
      if (feePounds.trim() && (!isFinite(feeNumber) || feeNumber < 0)) {
        Alert.alert("Invalid fee", "Enter a positive number (e.g. 240.00).");
        setSaving(false);
        return;
      }
      const feePence = feeNumber > 0 ? Math.round(feeNumber * 100) : null;
      await updateProfile({
        accountantName: trimmedName.length > 0 ? trimmedName : null,
        accountantContact: trimmedContact.length > 0 ? trimmedContact : null,
        accountantAnnualFeePence: feePence,
      });
      await refreshUser();
      router.back();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save accountant details";
      Alert.alert("Save failed", message);
    } finally {
      setSaving(false);
    }
  }, [name, contact, feePounds, refreshUser]);

  const weeklyHint = (() => {
    const feeNumber = feePounds.trim() ? parseFloat(feePounds.trim()) : 0;
    if (!isFinite(feeNumber) || feeNumber <= 0) return null;
    const weekly = feeNumber / 52;
    return `That's about £${weekly.toFixed(2)} added to your weekly set-aside.`;
  })();

  if (loading) {
    return (
      <SettingsScreen>
        <Text style={styles.loading}>Loading...</Text>
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen>
      <View style={styles.intro}>
        <View style={styles.introTitleRow}>
          <Text style={styles.introTitle}>Set aside the accountant fee too</Text>
          <ContextualHelp topicId="accountant" size={16} />
        </View>
        <Text style={styles.introBody}>
          Enter your accountant's annual fee and we'll spread it across your
          weekly set-aside on the Tax Readiness card. So when filing comes
          around, both the tax and the accountant are already covered.
        </Text>
      </View>

      <SettingsGroup title="ACCOUNTANT">
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Izzy at Deadsimpleaccounting"
            placeholderTextColor={colors.text3}
            maxLength={120}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Contact</Text>
          <TextInput
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder="Email or phone (optional)"
            placeholderTextColor={colors.text3}
            maxLength={255}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Annual fee (£)</Text>
          <TextInput
            style={styles.input}
            value={feePounds}
            onChangeText={setFeePounds}
            placeholder="e.g. 240.00"
            placeholderTextColor={colors.text3}
            keyboardType="decimal-pad"
            maxLength={12}
          />
          {weeklyHint ? <Text style={styles.hint}>{weeklyHint}</Text> : null}
        </View>
      </SettingsGroup>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={onSave}
        disabled={saving}
        activeOpacity={0.7}
      >
        <Ionicons name="checkmark-circle" size={18} color={colors.bg} />
        <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
      </TouchableOpacity>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    color: colors.text2,
    textAlign: "center",
    marginTop: spacing.xl,
    fontFamily: fonts.regular,
  },
  intro: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  introTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  introTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  introBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 19,
  },
  fieldGroup: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.text2,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text1,
    paddingVertical: 8,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.amber,
    marginTop: 6,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    paddingVertical: 14,
    marginTop: spacing.md,
    marginHorizontal: spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.bg,
  },
});
