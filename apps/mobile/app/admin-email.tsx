import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { sendAdminEmail } from "../lib/api/admin";

const AMBER = "#f5a623";
const EMERALD = "#10b981";
const RED = "#ef4444";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";

type CampaignType = "re-engagement" | "update" | "service-status";

type CampaignResult = {
  sent: number;
  errors: number;
  totalUsers: number;
  dryRun: boolean;
};

type CampaignState = {
  sending: boolean;
  result: CampaignResult | null;
};

const CAMPAIGNS: { type: CampaignType; title: string; description: string; hasInactiveToggle: boolean }[] = [
  {
    type: "re-engagement",
    title: "Re-engagement",
    description: "Personalised email to bring users back, with their trip stats.",
    hasInactiveToggle: true,
  },
  {
    type: "update",
    title: "Product Update",
    description: "Send the latest changelog/update email to all users.",
    hasInactiveToggle: false,
  },
  {
    type: "service-status",
    title: "Service Status",
    description: "Quick 'we're back up' notification to all users.",
    hasInactiveToggle: false,
  },
];

export default function AdminEmailScreen() {
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [states, setStates] = useState<Record<CampaignType, CampaignState>>({
    "re-engagement": { sending: false, result: null },
    "update": { sending: false, result: null },
    "service-status": { sending: false, result: null },
  });

  function setSending(type: CampaignType, value: boolean) {
    setStates((prev) => ({ ...prev, [type]: { ...prev[type], sending: value } }));
  }

  function setResult(type: CampaignType, value: CampaignResult | null) {
    setStates((prev) => ({ ...prev, [type]: { ...prev[type], result: value } }));
  }

  async function handleSend(type: CampaignType, dryRun: boolean) {
    const execute = async () => {
      setSending(type, true);
      setResult(type, null);
      try {
        const opts = {
          dryRun,
          ...(type === "re-engagement" && { onlyInactive }),
        };
        const res = await sendAdminEmail(type, opts);
        setResult(type, res.data);
      } catch (err: any) {
        Alert.alert("Error", err?.message ?? "Failed to send email campaign.");
      } finally {
        setSending(type, false);
      }
    };

    if (dryRun) {
      execute();
    } else {
      const campaign = CAMPAIGNS.find((c) => c.type === type);
      Alert.alert(
        "Send Email Campaign",
        `Send "${campaign?.title}" email to ${type === "re-engagement" && onlyInactive ? "inactive users" : "all users"}?`,
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
    >
      {CAMPAIGNS.map((campaign) => {
        const state = states[campaign.type];
        return (
          <View key={campaign.type} style={s.card}>
            {/* Card header */}
            <Text style={s.campaignTitle}>{campaign.title}</Text>
            <Text style={s.campaignDescription}>{campaign.description}</Text>

            {/* Inactive toggle (re-engagement only) */}
            {campaign.hasInactiveToggle && (
              <View style={s.toggleRow}>
                <Text style={s.toggleLabel}>Only inactive users</Text>
                <Switch
                  value={onlyInactive}
                  onValueChange={setOnlyInactive}
                  trackColor={{ false: "#1f2937", true: "rgba(245,166,35,0.4)" }}
                  thumbColor={onlyInactive ? AMBER : "#4b5563"}
                  accessibilityLabel="Only send to inactive users"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: onlyInactive }}
                />
              </View>
            )}

            {/* Action buttons */}
            <View style={s.buttonRow}>
              <TouchableOpacity
                style={[s.btn, s.btnSecondary, state.sending && s.btnDisabled]}
                onPress={() => handleSend(campaign.type, true)}
                disabled={state.sending}
                accessibilityRole="button"
                accessibilityLabel={`Dry run ${campaign.title}`}
                accessibilityState={{ disabled: state.sending }}
              >
                {state.sending ? (
                  <ActivityIndicator size="small" color={AMBER} />
                ) : (
                  <Text style={s.btnTextSecondary}>Dry Run</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btn, s.btnPrimary, state.sending && s.btnDisabled]}
                onPress={() => handleSend(campaign.type, false)}
                disabled={state.sending}
                accessibilityRole="button"
                accessibilityLabel={`Send ${campaign.title}`}
                accessibilityState={{ disabled: state.sending }}
              >
                <Text style={s.btnTextPrimary}>Send</Text>
              </TouchableOpacity>
            </View>

            {/* Result display */}
            {state.result && (
              <View style={s.resultBlock}>
                <View style={s.resultDivider} />
                <View style={s.resultHeaderRow}>
                  <Text style={s.resultHeading}>Result</Text>
                  {state.result.dryRun && (
                    <View style={s.dryRunBadge}>
                      <Text style={s.dryRunBadgeText}>DRY RUN</Text>
                    </View>
                  )}
                </View>
                <View style={s.resultGrid}>
                  <View style={s.resultItem}>
                    <Text style={[s.resultValue, { color: EMERALD }]}>{state.result.sent}</Text>
                    <Text style={s.resultLabel}>Sent</Text>
                  </View>
                  <View style={s.resultItem}>
                    <Text
                      style={[s.resultValue, { color: state.result.errors > 0 ? RED : TEXT_2 }]}
                    >
                      {state.result.errors}
                    </Text>
                    <Text style={s.resultLabel}>Errors</Text>
                  </View>
                  <View style={s.resultItem}>
                    <Text style={[s.resultValue, { color: TEXT_1 }]}>{state.result.totalUsers}</Text>
                    <Text style={s.resultLabel}>Targeted</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      })}

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

  campaignTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 4,
  },
  campaignDescription: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 19,
    marginBottom: 14,
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
    marginBottom: 14,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
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

  resultBlock: {
    marginTop: 14,
  },
  resultDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginBottom: 12,
  },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  resultHeading: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    gap: 8,
  },
  resultItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#0d1626",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  resultValue: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: -0.5,
  },
  resultLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 3,
  },
});
