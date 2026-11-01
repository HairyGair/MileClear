import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import { colors, fonts, spacing } from "../../lib/theme";
import type { FigureSource } from "../../lib/tax/mtdChecks";

const ICONS: Record<FigureSource["id"], keyof typeof Ionicons.glyphMap> = {
  earnings: "cash-outline",
  car: "car-outline",
  phone: "phone-portrait-outline",
  other: "receipt-outline",
};

/**
 * One figure HMRC will see, tap to show where it came from. Only reads the
 * numbers the preview already returned.
 *
 * Usage: <FigureRow source={source} onOpenNote={(link) => ...} />
 */
export function FigureRow({
  source,
  onOpenNote,
  startOpen = false,
}: {
  source: FigureSource;
  onOpenNote?: (link: "earnings" | "trips") => void;
  startOpen?: boolean;
}) {
  const expandable = source.lines.length > 0 || !!source.note;
  const [open, setOpen] = useState(startOpen && expandable);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.top}
        onPress={() => expandable && setOpen((o) => !o)}
        disabled={!expandable}
        accessibilityRole={expandable ? "button" : "text"}
        accessibilityLabel={`${source.label} ${formatPence(source.pence)}`}
        accessibilityHint={expandable ? (open ? "Hides where this came from" : "Shows where this came from") : undefined}
        accessibilityState={expandable ? { expanded: open } : undefined}
      >
        <Ionicons name={ICONS[source.id]} size={20} color={colors.amber} accessible={false} />
        <Text style={styles.label}>{source.label}</Text>
        <Text style={styles.value}>{formatPence(source.pence)}</Text>
        {expandable && (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.text3} accessible={false} />
        )}
      </TouchableOpacity>

      {open && (
        <View style={styles.src}>
          {source.lines.map((l, i) => (
            <View key={`${l.label}-${i}`} style={styles.srcRow}>
              <Text style={styles.srcLabel}>{l.label}</Text>
              <Text style={styles.srcValue}>{formatPence(l.pence)}</Text>
            </View>
          ))}
          {source.note && (
            <Text style={styles.note}>
              {source.note}
              {source.noteLink && onOpenNote ? (
                <>
                  {" · "}
                  <Text style={styles.noteLink} onPress={() => onOpenNote(source.noteLink!)} accessibilityRole="link">
                    See them
                  </Text>
                </>
              ) : null}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingVertical: 14 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text1 },
  value: { fontFamily: fonts.bold, fontSize: 16, color: colors.text1, fontVariant: ["tabular-nums"] },
  src: {
    marginTop: 10,
    marginLeft: 30,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 7,
  },
  srcRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  srcLabel: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.text2 },
  srcValue: { fontFamily: fonts.regular, fontSize: 13, color: colors.text1, fontVariant: ["tabular-nums"] },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.text2 },
  noteLink: { fontFamily: fonts.semibold, color: colors.amber },
});
