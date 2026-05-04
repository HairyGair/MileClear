import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NumberDerivation } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

const BG = colors.bg;
const CARD_BG = colors.surface;
const CARD_BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

interface DerivationPanelProps {
  visible: boolean;
  title: string;
  /** The figure being explained — shown big at the top of the panel. */
  formattedValue: string;
  derivation: NumberDerivation | null | undefined;
  onClose: () => void;
}

/**
 * "Why this number?" — slide-up panel that explains how a computed
 * figure was derived from the user's data. Audit item #5.
 *
 * Pattern: tap any computed figure on the dashboard → this panel slides
 * up showing the derivation. The first user of this is the YTD mileage
 * deduction; the same component supports any other figure with a
 * NumberDerivation server response.
 */
export function DerivationPanel({
  visible,
  title,
  formattedValue,
  derivation,
  onClose,
}: DerivationPanelProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Drag handle for visual affordance */}
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Why this number?</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close derivation panel"
            >
              <Ionicons name="close" size={22} color={TEXT_2} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero figure */}
            <Text style={styles.heroLabel}>{title}</Text>
            <Text style={styles.heroValue}>{formattedValue}</Text>

            {derivation && (
              <>
                <Text style={styles.summary}>{derivation.summary}</Text>

                {derivation.formula && (
                  <View style={styles.formulaBox}>
                    <Text style={styles.formulaLabel}>Calculation</Text>
                    <Text style={styles.formula}>{derivation.formula}</Text>
                  </View>
                )}

                {derivation.components.length > 0 && (
                  <View style={styles.componentsBox}>
                    <Text style={styles.sectionTitle}>Breakdown</Text>
                    {derivation.components.map((c, i) => (
                      <View
                        key={`${i}-${c.label}`}
                        style={[
                          styles.componentRow,
                          c.highlight && styles.componentRowHighlight,
                          i === derivation.components.length - 1 &&
                            styles.componentRowLast,
                        ]}
                      >
                        <Text
                          style={[
                            styles.componentLabel,
                            c.highlight && styles.componentLabelHighlight,
                          ]}
                        >
                          {c.label}
                        </Text>
                        <Text
                          style={[
                            styles.componentValue,
                            c.highlight && styles.componentValueHighlight,
                          ]}
                        >
                          {c.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {derivation.sources && derivation.sources.length > 0 && (
                  <View style={styles.sourcesBox}>
                    <Text style={styles.sectionTitle}>Sources</Text>
                    {derivation.sources.map((src, i) => (
                      <View key={`src-${i}`} style={styles.sourceRow}>
                        <Ionicons
                          name="layers-outline"
                          size={14}
                          color={TEXT_3}
                          style={{ marginRight: 8 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sourceText}>
                            {src.count.toLocaleString("en-GB")}{" "}
                            {src.description}
                          </Text>
                          {src.dateRange && (
                            <Text style={styles.sourceDate}>
                              {formatDateShort(src.dateRange.from)} –{" "}
                              {formatDateShort(src.dateRange.to)}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {derivation.notes && derivation.notes.length > 0 && (
                  <View style={styles.notesBox}>
                    {derivation.notes.map((note, i) => (
                      <Text key={`note-${i}`} style={styles.noteText}>
                        {note}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}

            {!derivation && (
              <Text style={styles.summary}>
                No derivation available for this figure yet.
              </Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
    maxHeight: "85%",
    minHeight: "50%",
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
  heroLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: TEXT_2,
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: fonts.bold,
    fontSize: 36,
    color: TEXT_1,
    marginBottom: 16,
  },
  summary: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 20,
  },
  formulaBox: {
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  formulaLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  formula: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: TEXT_1,
    lineHeight: 22,
  },
  componentsBox: {
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: CARD_BORDER,
  },
  componentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: CARD_BORDER,
  },
  componentRowLast: {
    borderBottomWidth: 0,
  },
  componentRowHighlight: {
    backgroundColor: "rgba(245,166,35,0.06)",
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
    borderBottomWidth: 0,
  },
  componentLabel: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: TEXT_2,
    flex: 1,
    paddingRight: 12,
  },
  componentLabelHighlight: {
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  componentValue: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: TEXT_1,
  },
  componentValueHighlight: {
    fontFamily: fonts.bold,
    color: AMBER,
    fontSize: 16,
  },
  sourcesBox: {
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  sourceText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: TEXT_2,
  },
  sourceDate: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: TEXT_3,
    marginTop: 2,
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
