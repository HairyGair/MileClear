import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { sendAdminPush } from "../lib/api/admin";
import type { AdminPushAudience, AdminPushResult } from "@mileclear/shared";

const AMBER = "#f5a623";
const EMERALD = "#10b981";
const RED = "#ef4444";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const INPUT_BG = "#111827";

type AudienceOption = {
  value: AdminPushAudience;
  label: string;
};

const AUDIENCE_OPTIONS: AudienceOption[] = [
  { value: "all", label: "All Users" },
  { value: "premium", label: "Premium" },
  { value: "inactive", label: "Inactive" },
  { value: "specific", label: "Specific User" },
];

export default function AdminPushScreen() {
  const [audience, setAudience] = useState<AdminPushAudience>("all");
  const [userId, setUserId] = useState("");
  const [inactiveDays, setInactiveDays] = useState("14");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<AdminPushResult | null>(null);

  const canSend = title.trim().length > 0 && body.trim().length > 0 &&
    (audience !== "specific" || userId.trim().length > 0);

  async function handleSend(dryRun: boolean) {
    if (!canSend) return;

    const execute = async () => {
      setSending(true);
      setResult(null);
      try {
        const payload = {
          audience,
          title: title.trim(),
          body: body.trim(),
          dryRun,
          ...(audience === "specific" && { userId: userId.trim() }),
          ...(audience === "inactive" && { inactiveDays: parseInt(inactiveDays, 10) || 14 }),
        };
        const res = await sendAdminPush(payload);
        setResult(res.data);
      } catch (err: any) {
        Alert.alert("Error", err?.message ?? "Failed to send push notification.");
      } finally {
        setSending(false);
      }
    };

    if (dryRun) {
      execute();
    } else {
      Alert.alert(
        "Send Push Notification",
        `Send "${title.trim()}" to ${AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label ?? audience}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Send", style: "destructive", onPress: execute },
        ]
      );
    }
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Compose card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Send Push Notification</Text>

        {/* Audience selector */}
        <Text style={s.fieldLabel}>Audience</Text>
        <View style={s.chipRow}>
          {AUDIENCE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[s.chip, audience === opt.value && s.chipActive]}
              onPress={() => setAudience(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: audience === opt.value }}
              accessibilityLabel={opt.label}
            >
              <Text style={[s.chipText, audience === opt.value && s.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Specific user ID input */}
        {audience === "specific" && (
          <>
            <Text style={s.fieldLabel}>User ID</Text>
            <TextInput
              style={s.input}
              value={userId}
              onChangeText={setUserId}
              placeholder="Enter user UUID"
              placeholderTextColor={TEXT_3}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="User ID"
            />
          </>
        )}

        {/* Inactive days input */}
        {audience === "inactive" && (
          <>
            <Text style={s.fieldLabel}>Inactive for (days)</Text>
            <TextInput
              style={s.input}
              value={inactiveDays}
              onChangeText={setInactiveDays}
              placeholder="14"
              placeholderTextColor={TEXT_3}
              keyboardType="number-pad"
              accessibilityLabel="Inactive days threshold"
            />
          </>
        )}

        {/* Title */}
        <Text style={s.fieldLabel}>Title</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Notification title"
          placeholderTextColor={TEXT_3}
          accessibilityLabel="Notification title"
        />

        {/* Body */}
        <Text style={s.fieldLabel}>Body</Text>
        <TextInput
          style={[s.input, s.inputMultiline]}
          value={body}
          onChangeText={setBody}
          placeholder="Notification body text"
          placeholderTextColor={TEXT_3}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel="Notification body"
        />

        {/* Action buttons */}
        <View style={s.buttonRow}>
          <TouchableOpacity
            style={[s.btn, s.btnSecondary, !canSend && s.btnDisabled]}
            onPress={() => handleSend(true)}
            disabled={!canSend || sending}
            accessibilityRole="button"
            accessibilityLabel="Dry run"
            accessibilityState={{ disabled: !canSend || sending }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={AMBER} />
            ) : (
              <Text style={[s.btnTextSecondary, !canSend && s.btnTextDisabled]}>Dry Run</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, s.btnPrimary, !canSend && s.btnDisabled]}
            onPress={() => handleSend(false)}
            disabled={!canSend || sending}
            accessibilityRole="button"
            accessibilityLabel="Send push notification"
            accessibilityState={{ disabled: !canSend || sending }}
          >
            <Text style={[s.btnTextPrimary, !canSend && s.btnTextDisabled]}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Result card */}
      {result && (
        <View style={s.card}>
          <View style={s.resultHeader}>
            <Text style={s.cardTitle}>Result</Text>
            {result.dryRun && (
              <View style={s.dryRunBadge}>
                <Text style={s.dryRunBadgeText}>DRY RUN</Text>
              </View>
            )}
          </View>

          <View style={s.resultGrid}>
            <View style={s.resultItem}>
              <Text style={[s.resultValue, { color: EMERALD }]}>{result.sent}</Text>
              <Text style={s.resultLabel}>Sent</Text>
            </View>
            <View style={s.resultItem}>
              <Text style={[s.resultValue, { color: result.failed > 0 ? RED : TEXT_2 }]}>
                {result.failed}
              </Text>
              <Text style={s.resultLabel}>Failed</Text>
            </View>
            <View style={s.resultItem}>
              <Text style={[s.resultValue, { color: TEXT_1 }]}>{result.totalTargeted}</Text>
              <Text style={s.resultLabel}>Targeted</Text>
            </View>
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 16,
  },

  fieldLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginBottom: 6,
    marginTop: 4,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: INPUT_BG,
  },
  chipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  chipTextActive: {
    color: "#030712",
  },

  input: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
    marginBottom: 12,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 10,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: AMBER,
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: AMBER,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnTextPrimary: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  btnTextSecondary: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  btnTextDisabled: {
    opacity: 0.6,
  },

  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  dryRunBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "rgba(245,166,35,0.15)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  dryRunBadgeText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
    letterSpacing: 0.5,
  },

  resultGrid: {
    flexDirection: "row",
    gap: 10,
  },
  resultItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: "#0d1626",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  resultValue: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: -0.5,
  },
  resultLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 4,
  },
});
