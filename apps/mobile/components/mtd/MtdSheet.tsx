import type { ReactNode } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { AppModal } from "../AppModal";
import { colors, fonts, fontSizes, radii, spacing } from "../../lib/theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A small bottom sheet for the hub: Manage, and "Finishing the year isn't here yet". */
export function MtdSheet({ visible, title, onClose, children }: Props) {
  return (
    <AppModal scrollable visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {children}
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AppModal>
  );
}

/** One tappable row inside a sheet. */
export function SheetRow({
  label,
  sub,
  destructive,
  onPress,
}: {
  label: string;
  sub?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
    >
      <Text style={[styles.rowLabel, destructive && { color: colors.red }]}>{label}</Text>
      {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

export const sheetText = StyleSheet.create({
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    lineHeight: 21,
    color: colors.text2,
    marginBottom: spacing.sm,
  },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    marginBottom: spacing.lg,
  },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.title, color: colors.text1, marginBottom: spacing.md },
  row: {
    minHeight: 52,
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowLabel: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: colors.text1 },
  rowSub: { fontFamily: fonts.regular, fontSize: fontSizes.caption + 1, color: colors.text2, marginTop: 2 },
  close: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  closeText: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: colors.text1 },
});
