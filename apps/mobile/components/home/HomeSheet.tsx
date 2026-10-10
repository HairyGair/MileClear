// The bottom sheet Home uses for the Recording sheet, the setup checklist, the
// Low Power explainer and the "where did you hear" question. Our own dark
// sheet inside AppModal (never an ActionSheetIOS), so it stays dark in Light
// appearance and hit-tests correctly on iPad (see AppModal).

import type { ReactNode } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { AppModal } from "../AppModal";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function HomeSheet({ visible, title, onClose, children }: Props) {
  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.handle} accessible={false} />
          <View style={s.head}>
            <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={s.close}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
            >
              <Text style={s.closeText} maxFontSizeMultiplier={fontScaleCap.body}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    maxHeight: "86%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { flex: 1, color: colors.text1, fontFamily: fonts.bold, fontSize: 18 },
  close: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  closeText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 16 },
  body: { flexGrow: 0 },
});
