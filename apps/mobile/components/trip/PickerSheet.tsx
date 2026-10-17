// A short sheet of choices from the bottom of the screen, for the trip
// screen's Which app, Purpose and Category rows (PROPOSALS 6.5, T-G) and its
// "Save a place" and "New trip from here" rows. One row per choice, 52 pt
// high, a tick on the one that is set. Choosing closes the sheet.

import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppModal } from "../AppModal";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

export interface PickerOption {
  key: string;
  label: string;
  /** A second, grey line under the label. */
  sub?: string;
  /** Ionicons name, drawn grey. */
  icon?: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: PickerOption[];
  /** The key that is set now (ticked), if any. */
  selectedKey?: string | null;
  onPick: (key: string) => void;
  onClose: () => void;
  /** iOS: called once the sheet has finished sliding away. Use it to present
   *  something else (a share sheet, the paywall) without clashing. */
  onDismiss?: () => void;
}

export function PickerSheet({ visible, title, options, selectedKey, onPick, onClose, onDismiss }: Props) {
  const { height } = useWindowDimensions();
  return (
    <AppModal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      rest={onDismiss ? { onDismiss } : undefined}
    >
      {/* Not an accessibility element: on iOS a focusable parent hides
          everything inside it, so VoiceOver would find one "Close" button and
          none of the choices. Cancel closes the sheet for VoiceOver. */}
      <Pressable style={s.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          style={[s.sheet, { maxHeight: height * 0.8 }]}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
          accessibilityViewIsModal
        >
          <View style={s.handle} />
          <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
            {title}
          </Text>
          <ScrollView style={s.list} bounces={false}>
            <View style={s.card}>
              {options.map((o, i) => {
                const selected = selectedKey != null && o.key === selectedKey;
                return (
                  <TouchableOpacity
                    key={o.key}
                    style={[s.row, i > 0 && s.rowBorder]}
                    onPress={() => {
                      onPick(o.key);
                      onClose();
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={o.sub ? `${o.label}. ${o.sub}` : o.label}
                    accessibilityState={{ selected }}
                  >
                    {o.icon ? (
                      <Ionicons
                        name={o.icon as keyof typeof Ionicons.glyphMap}
                        size={20}
                        color={colors.text2}
                        accessible={false}
                      />
                    ) : null}
                    <View style={s.rowText}>
                      <Text style={[s.label, selected && s.labelSelected]} maxFontSizeMultiplier={fontScaleCap.body}>
                        {o.label}
                      </Text>
                      {o.sub ? (
                        <Text style={s.sub} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
                          {o.sub}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark" size={20} color={colors.text1} accessible={false} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <TouchableOpacity
            style={s.cancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={s.cancelText} maxFontSizeMultiplier={fontScaleCap.body}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.surfaceBorder,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontFamily: fonts.bold, color: colors.text1, marginBottom: 12 },
  list: { flexGrow: 0 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  rowText: { flex: 1 },
  label: { fontSize: 16, fontFamily: fonts.regular, color: colors.text1 },
  labelSelected: { fontFamily: fonts.semibold },
  sub: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  cancel: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  cancelText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text2 },
});
