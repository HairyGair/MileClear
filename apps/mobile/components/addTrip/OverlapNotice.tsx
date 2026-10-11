// "MileClear already has a trip around then" (PROPOSALS 0.4, decision C: warn,
// never block). A quiet amber line under When as soon as the day and time
// meet a trip MileClear has, and, if it is still there at Save, a sheet with
// "It's the same drive" first. Amber, not red: nothing is broken. Some drivers
// really do make two trips in that window.

import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppModal } from "../AppModal";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import { describeKnownTrip, type DescribableTrip } from "../../lib/trips/overlapText";

export function OverlapLine({ trip, onOpen }: { trip: DescribableTrip; onOpen: () => void }) {
  const w = describeKnownTrip(trip);
  return (
    // Not one accessibility element: on iOS that would hide the Open button.
    <View style={styles.line} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle-outline" size={18} color={colors.amber} accessible={false} />
      <Text style={styles.lineText} maxFontSizeMultiplier={fontScaleCap.body}>
        MileClear already has a trip around then: {w.route}, {w.times}
      </Text>
      <TouchableOpacity onPress={onOpen} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Open ${w.route}`}>
        <Text style={styles.lineOpen} maxFontSizeMultiplier={fontScaleCap.body}>Open</Text>
      </TouchableOpacity>
    </View>
  );
}

interface SheetProps {
  visible: boolean;
  trip: DescribableTrip | null;
  /** "Home to Depot · 08:35 · 12.4 mi" */
  yours: string;
  onSame: () => void;
  onOpen: () => void;
  onAddAnyway: () => void;
  onClose: () => void;
}

export function OverlapSheet({ visible, trip, yours, onSame, onOpen, onAddAnyway, onClose }: SheetProps) {
  const w = trip ? describeKnownTrip(trip) : null;
  return (
    <AppModal visible={visible && !!w} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessible={false} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
            MileClear already has a trip around then
          </Text>
          <Text style={styles.sub} maxFontSizeMultiplier={fontScaleCap.body}>Is it the drive you&apos;re adding?</Text>
          {w && (
            <View style={styles.tripCard} accessible accessibilityLabel={`${w.route}, ${w.times}, ${w.miles}. ${w.how}.`}>
              <View style={styles.tripIcon}>
                <Ionicons name="git-commit-outline" size={22} color={colors.amber} accessible={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tripRoute} maxFontSizeMultiplier={fontScaleCap.body}>{w.route}</Text>
                <Text style={styles.tripMeta} maxFontSizeMultiplier={fontScaleCap.body}>
                  {w.day} · {w.times} · {w.miles}
                </Text>
                <Text style={styles.tripHow} maxFontSizeMultiplier={fontScaleCap.body}>{w.how}</Text>
              </View>
            </View>
          )}
          <Text style={styles.yours} maxFontSizeMultiplier={fontScaleCap.body}>Yours: {yours}</Text>

          <TouchableOpacity
            style={styles.primary}
            onPress={onSame}
            accessibilityRole="button"
            accessibilityLabel="It's the same drive. Close without adding it"
          >
            <Text style={styles.primaryText} maxFontSizeMultiplier={fontScaleCap.body}>It&apos;s the same drive</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open that trip to fix it">
            <Text style={styles.secondaryText} maxFontSizeMultiplier={fontScaleCap.body}>Open that trip to fix it</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghost} onPress={onAddAnyway} accessibilityRole="button" accessibilityLabel="Add mine as well">
            <Text style={styles.ghostText} maxFontSizeMultiplier={fontScaleCap.body}>Add mine as well</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.amberGlow,
    backgroundColor: colors.amberDim,
  },
  lineText: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: fonts.medium, color: colors.text1 },
  lineOpen: { fontSize: 15, fontFamily: fonts.semibold, color: colors.amber },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.surfaceBorder,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.bold, color: colors.text1 },
  sub: { fontSize: 15, fontFamily: fonts.regular, color: colors.text2, marginTop: 4, marginBottom: 14 },
  tripCard: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  tripIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  tripRoute: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  tripMeta: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 2, fontVariant: ["tabular-nums"] },
  tripHow: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  yours: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 12, marginBottom: 14 },
  primary: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 16, fontFamily: fonts.bold, color: colors.bg },
  secondary: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 6 },
  ghostText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text2 },
});
