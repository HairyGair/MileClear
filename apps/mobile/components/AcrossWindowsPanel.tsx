import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NumberAcrossWindows } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

const BG = colors.bg;
const CARD_BG = colors.surface;
const CARD_BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

interface AcrossWindowsPanelProps {
  visible: boolean;
  title: string;
  data: NumberAcrossWindows | null | undefined;
  onClose: () => void;
}

/**
 * "Across time windows" — slide-up panel that shows the same metric
 * across multiple time periods (last 7 days, this month, this tax year,
 * last tax year). Triggered by long-press on a dashboard figure.
 *
 * Sibling to DerivationPanel. Different feature shape:
 *   - DerivationPanel (tap)   → why this number? (formula, sources)
 *   - AcrossWindowsPanel (LP) → how does it compare across time?
 *
 * Layer 3 polish (premium_app_feel.md).
 */
export function AcrossWindowsPanel({
  visible,
  title,
  data,
  onClose,
}: AcrossWindowsPanelProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Across time windows</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close comparison panel"
            >
              <Ionicons name="close" size={22} color={TEXT_2} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>{title}</Text>
            {data && <Text style={styles.subtitle}>{data.label}</Text>}

            {data && (
              <View style={styles.windowsBox}>
                {data.windows.map((window, i) => (
                  <View
                    key={window.key}
                    style={[
                      styles.windowRow,
                      window.highlight && styles.windowRowHighlight,
                      i === data.windows.length - 1 && styles.windowRowLast,
                    ]}
                  >
                    <View style={styles.windowMeta}>
                      <Text
                        style={[
                          styles.windowLabel,
                          window.highlight && styles.windowLabelHighlight,
                        ]}
                      >
                        {window.label}
                      </Text>
                      {window.range && (
                        <Text style={styles.windowRange}>{window.range}</Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.windowValue,
                        window.highlight && styles.windowValueHighlight,
                      ]}
                    >
                      {window.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {data?.notes && data.notes.length > 0 && (
              <View style={styles.notesBox}>
                {data.notes.map((note, i) => (
                  <Text key={`note-${i}`} style={styles.noteText}>
                    {note}
                  </Text>
                ))}
              </View>
            )}

            {!data && (
              <Text style={styles.subtitle}>No comparison data available yet.</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    minHeight: "40%",
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: CARD_BORDER,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: TEXT_3,
    opacity: 0.4,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: CARD_BORDER,
  },
  headerTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: TEXT_1,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 16,
  },
  windowsBox: {
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  windowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: CARD_BORDER,
  },
  windowRowLast: {
    borderBottomWidth: 0,
  },
  windowRowHighlight: {
    backgroundColor: "rgba(245,166,35,0.06)",
    marginHorizontal: -14,
    paddingHorizontal: 14,
  },
  windowMeta: {
    flex: 1,
    paddingRight: 12,
  },
  windowLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: TEXT_2,
  },
  windowLabelHighlight: {
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  windowRange: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: TEXT_3,
    marginTop: 2,
  },
  windowValue: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: TEXT_1,
  },
  windowValueHighlight: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: AMBER,
  },
  notesBox: {
    paddingHorizontal: 4,
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: TEXT_3,
    lineHeight: 18,
    marginBottom: 8,
  },
});
