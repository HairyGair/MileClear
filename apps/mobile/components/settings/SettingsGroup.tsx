import { Children, ReactNode, isValidElement, cloneElement } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

/**
 * Card-like wrapper for a list of settings rows. Optional sentence-case
 * section title above the card ("Your car", never "YOUR CAR"). Auto-injects `border={true}` on every
 * child except the last so the row separator is consistent and callers
 * don't have to count.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const childArray = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title && <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>{title}</Text>}
      <View style={styles.card}>
        {childArray.map((child, idx) => {
          if (!isValidElement(child)) return child;
          const isLast = idx === childArray.length - 1;
          // Type assertion: any settings row supporting `border` prop is
          // free to ignore it; we just hand it down where the row wants
          // to draw a bottom separator.
          return cloneElement(child as React.ReactElement<{ border?: boolean }>, {
            border: !isLast,
          });
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text2,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
});
