import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useUser } from "../lib/user/context";
import { submitFeedback } from "../lib/api/feedback";
import { FEEDBACK_CATEGORIES } from "@mileclear/shared";
import type { FeedbackCategory } from "@mileclear/shared";

const AMBER = "#f5a623";
const BG = "#030712";
const CARD_BG = "#0a1120";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";
const INPUT_BG = "#0c1425";
const CARD_BORDER = "rgba(255,255,255,0.08)";

const CATEGORY_COLORS: Record<string, string> = {
  feature_request: "#3b82f6",
  bug_report: "#ef4444",
  improvement: "#a855f7",
  other: "#8494a7",
};

export default function FeedbackFormScreen() {
  const router = useRouter();
  const { user } = useUser();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [category, setCategory] = useState<FeedbackCategory>("feature_request");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const titleValid = title.length >= 3 && title.length <= 200;
  const bodyValid = body.length >= 10 && body.length <= 2000;
  const canSubmit = titleValid && bodyValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitFeedback({
        displayName: displayName.trim() || undefined,
        title: title.trim(),
        body: body.trim(),
        category,
      });
      Alert.alert("Submitted!", "Thanks for your suggestion.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Display Name */}
        <View style={s.field}>
          <Text style={s.label}>Display Name</Text>
          <Text style={s.labelHint}>Optional — shown publicly</Text>
          <TextInput
            style={s.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Anonymous"
            placeholderTextColor={TEXT_3}
            maxLength={100}
            autoCapitalize="words"
          />
        </View>

        {/* Category */}
        <View style={s.field}>
          <Text style={s.label}>Category</Text>
          <View style={s.categoryRow}>
            {FEEDBACK_CATEGORIES.map((cat) => {
              const active = category === cat.value;
              const color = CATEGORY_COLORS[cat.value] ?? TEXT_3;
              return (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    s.categoryPill,
                    { borderColor: active ? color : CARD_BORDER },
                    active && { backgroundColor: color + "18" },
                  ]}
                  onPress={() => setCategory(cat.value as FeedbackCategory)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      s.categoryPillText,
                      { color: active ? color : TEXT_2 },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Title */}
        <View style={s.field}>
          <View style={s.labelRow}>
            <Text style={s.label}>Title</Text>
            <Text style={[s.charCount, titleValid ? s.charCountOk : title.length > 0 ? s.charCountBad : null]}>
              {title.length}/200
            </Text>
          </View>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Short, descriptive title"
            placeholderTextColor={TEXT_3}
            maxLength={200}
            autoCapitalize="sentences"
          />
          {title.length > 0 && title.length < 3 && (
            <Text style={s.validationText}>At least 3 characters</Text>
          )}
        </View>

        {/* Description */}
        <View style={s.field}>
          <View style={s.labelRow}>
            <Text style={s.label}>Description</Text>
            <Text style={[s.charCount, bodyValid ? s.charCountOk : body.length > 0 ? s.charCountBad : null]}>
              {body.length}/2000
            </Text>
          </View>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={body}
            onChangeText={setBody}
            placeholder="Describe your idea, the problem it solves, or what you'd like to see..."
            placeholderTextColor={TEXT_3}
            maxLength={2000}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            autoCapitalize="sentences"
          />
          {body.length > 0 && body.length < 10 && (
            <Text style={s.validationText}>At least 10 characters</Text>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitButton, !canSubmit && s.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <Text style={s.submitButtonText}>Submit Suggestion</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  field: { marginBottom: 20 },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 2,
  },
  labelHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  charCountOk: { color: "#34c759" },
  charCountBad: { color: "#ef4444" },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  inputMultiline: {
    minHeight: 120,
    paddingTop: 12,
  },
  validationText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#ef4444",
    marginTop: 4,
    marginLeft: 2,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  submitButton: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
});
