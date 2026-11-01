import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, spacing } from "../../lib/theme";
import type { PreSendCheck } from "../../lib/tax/mtdChecks";

/**
 * "Check before you send". Advice only: nothing here stops an update going.
 *
 * Usage: <PreSendChecks checks={checks} onAction={(target) => ...} />
 */
export function PreSendChecks({
  checks,
  onAction,
}: {
  checks: PreSendCheck[];
  onAction: (target: NonNullable<PreSendCheck["action"]>["target"]) => void;
}) {
  if (checks.length === 0) return null;
  return (
    <View style={styles.card}>
      {checks.map((c, i) => (
        <View key={c.id} style={[styles.row, i > 0 && styles.rowBorder]}>
          <Ionicons
            name={c.kind === "ok" ? "checkmark-circle" : c.kind === "warn" ? "alert-circle" : "information-circle-outline"}
            size={20}
            color={c.kind === "ok" ? colors.green : c.kind === "warn" ? colors.amber : colors.text3}
            style={{ marginTop: 1 }}
            accessible={false}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{c.title}</Text>
            {c.detail ? <Text style={styles.detail}>{c.detail}</Text> : null}
          </View>
          {c.action && (
            <TouchableOpacity
              style={styles.action}
              onPress={() => onAction(c.action!.target)}
              accessibilityRole="button"
              accessibilityLabel={`${c.action.label}: ${c.title}`}
            >
              <Text style={styles.actionText}>{c.action.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  title: { fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 20, color: colors.text1 },
  detail: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text2, marginTop: 2 },
  action: {
    alignSelf: "center",
    minHeight: 36,
    justifyContent: "center",
    backgroundColor: colors.amber,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  actionText: { fontFamily: fonts.bold, fontSize: 13, color: "#000" },
});
