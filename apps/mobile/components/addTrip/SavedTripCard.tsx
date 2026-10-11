// "Trip added": the card after a past trip is saved (mockup a-saved,
// PROPOSALS 0.7, decision H). It is the start of the next trip for a driver
// back-filling a day: "Add the next trip" (From is where this one ended, same
// day, after it arrived) and "Add the way back" (the ends swapped). Done
// stays. The "Missing a trip?" sheet ends on this card too (decision J), with
// Business or Personal to pick there and then.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TripClassification } from "@mileclear/shared";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

interface ChainButton {
  subtitle: string;
  onPress: () => void;
}

interface Props {
  miles: number;
  /** "Home to Depot · Sat 3 Oct, 08:35 to 09:01" */
  summary: string;
  classification: TripClassification;
  /** "Uber Eats", "Client meeting", "Commute". */
  detail?: string | null;
  /** "Worked out from the road route" / "Miles typed in". */
  milesFrom: string;
  /** "Saved to your account" / "Saved on your phone. It uploads when you're back online." */
  savedWhere: string;
  /** The server sorted it from similar trips. */
  autoNote?: string | null;
  /** Business or Personal, pickable here (the "Missing a trip?" sheet). */
  onClassify?: ((c: TripClassification) => void) | null;
  next?: ChainButton | null;
  wayBack?: ChainButton | null;
  onDone: () => void;
  /** Drawn over the whole screen (the form) or in place (a sheet). */
  overlay?: boolean;
}

export function SavedTripCard(p: Props) {
  const isBusiness = p.classification === "business";
  const isPersonal = p.classification === "personal";
  const chip = isBusiness ? "Business" : isPersonal ? "Personal" : "In To sort";
  const body = (
    <View style={styles.inner}>
      <View style={styles.tick}>
        <Ionicons name="checkmark-circle" size={44} color={colors.green} accessible={false} />
      </View>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>Trip added</Text>
      <Text style={styles.miles} maxFontSizeMultiplier={fontScaleCap.display}>{p.miles.toFixed(1)} miles</Text>
      <Text style={styles.summary} maxFontSizeMultiplier={fontScaleCap.body}>{p.summary}</Text>

      {p.onClassify ? (
        <View style={styles.classifyRow}>
          {(["business", "personal"] as const).map((c) => {
            const on = p.classification === c;
            const business = c === "business";
            return (
              <TouchableOpacity
                key={c}
                style={[styles.classify, on && (business ? styles.businessOn : styles.personalOn)]}
                onPress={() => p.onClassify?.(on ? "unclassified" : c)}
                accessibilityRole="button"
                accessibilityLabel={business ? "Mark as Business" : "Mark as Personal"}
                accessibilityState={{ selected: on }}
              >
                <Ionicons
                  name={business ? "briefcase-outline" : "person-outline"}
                  size={18}
                  color={on && business ? colors.amber : colors.text1}
                  accessible={false}
                />
                <Text style={[styles.classifyText, on && business && { color: colors.amber }]} maxFontSizeMultiplier={fontScaleCap.body}>
                  {business ? "Business" : "Personal"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={[styles.chip, isBusiness ? styles.chipBusiness : isPersonal ? styles.chipPersonal : styles.chipSort]}>
          {(isBusiness || isPersonal) && (
            <Ionicons
              name={isBusiness ? "briefcase" : "person"}
              size={14}
              color={isBusiness ? colors.amber : colors.text1}
              accessible={false}
            />
          )}
          <Text style={[styles.chipText, isBusiness && { color: colors.amber }]} maxFontSizeMultiplier={fontScaleCap.body}>
            {p.detail ? `${chip} · ${p.detail}` : chip}
          </Text>
        </View>
      )}

      {p.autoNote ? (
        <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>{p.autoNote}</Text>
      ) : null}
      <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
        {p.milesFrom}
        {"\n"}
        {p.savedWhere}
      </Text>

      <View style={styles.actions}>
        {p.next && (
          <TouchableOpacity
            style={[styles.action, styles.actionPrimary]}
            onPress={p.next.onPress}
            accessibilityRole="button"
            accessibilityLabel={`Add the next trip. ${p.next.subtitle}`}
          >
            <Ionicons name="arrow-forward" size={22} color={colors.bg} accessible={false} />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitlePrimary} maxFontSizeMultiplier={fontScaleCap.body}>Add the next trip</Text>
              <Text style={styles.actionSubPrimary} maxFontSizeMultiplier={fontScaleCap.body}>{p.next.subtitle}</Text>
            </View>
          </TouchableOpacity>
        )}
        {p.wayBack && (
          <TouchableOpacity
            style={styles.action}
            onPress={p.wayBack.onPress}
            accessibilityRole="button"
            accessibilityLabel={`Add the way back. ${p.wayBack.subtitle}`}
          >
            <Ionicons name="return-down-back" size={22} color={colors.text2} accessible={false} />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle} maxFontSizeMultiplier={fontScaleCap.body}>Add the way back</Text>
              <Text style={styles.actionSub} maxFontSizeMultiplier={fontScaleCap.body}>{p.wayBack.subtitle}</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.done} onPress={p.onDone} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.doneText} maxFontSizeMultiplier={fontScaleCap.body}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  if (!p.overlay) return body;
  return <View style={styles.overlay}>{body}</View>;
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    justifyContent: "center",
    paddingHorizontal: 20,
    zIndex: 1000,
  },
  inner: { width: "100%", maxWidth: 440, alignSelf: "center", alignItems: "center" },
  tick: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.greenDim,
    marginBottom: 14,
  },
  title: { fontSize: 22, fontFamily: fonts.bold, color: colors.text1 },
  miles: { fontSize: 40, fontFamily: fonts.bold, color: colors.text1, marginTop: 6, fontVariant: ["tabular-nums"] },
  summary: { fontSize: 15, fontFamily: fonts.regular, color: colors.text2, marginTop: 6, textAlign: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
    marginTop: 14,
  },
  chipBusiness: { backgroundColor: colors.amberDim },
  chipPersonal: { backgroundColor: colors.personal },
  chipSort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  chipText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  classifyRow: { flexDirection: "row", gap: 10, marginTop: 16, alignSelf: "stretch" },
  classify: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  businessOn: { backgroundColor: colors.amberDim, borderColor: colors.amberGlow },
  personalOn: { backgroundColor: colors.personal, borderColor: colors.personalEdge },
  classifyText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  note: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, color: colors.text2, textAlign: "center", marginTop: 14 },
  actions: { alignSelf: "stretch", marginTop: 28, gap: 12 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  actionPrimary: { backgroundColor: colors.amber, borderColor: colors.amber },
  actionTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.text1 },
  actionSub: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  actionTitlePrimary: { fontSize: 17, fontFamily: fonts.bold, color: colors.bg },
  actionSubPrimary: { fontSize: 14, fontFamily: fonts.medium, color: colors.bg, marginTop: 2, opacity: 0.85 },
  done: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  doneText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text2 },
});
