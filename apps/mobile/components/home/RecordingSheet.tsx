// The Recording sheet behind Home's status line: the Automatic trips switch,
// Pause with today's choices, "Not working? Tell us" and the Work / Personal
// explainer link. Nothing here is new behaviour, only a new container for what
// used to sit on Home (Oct 2026).

import { useCallback, useEffect, useState } from "react";
import { View, Text, Switch, Pressable, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HomeSheet } from "./HomeSheet";
import { readAutomaticTrips, setAutomaticTrips } from "../../lib/tracking/automaticTrips";
import { pauseChoices, pausedRowText, type PauseChoice } from "../../lib/tracking/pauseRule";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

// "Not working? Tell us": straight to support with the state in the subject.
function tellUs(on: boolean | null) {
  const state = on === null ? "" : ` (${on ? "on" : "off"})`;
  const subject = `Automatic trips${state} not working`;
  const body = "Hi,\n\nWhat happened:\n\n";
  Linking.openURL(
    `mailto:support@mileclear.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  ).catch(() => {});
}

interface Props {
  visible: boolean;
  onClose: () => void;
  pausedUntil: number | null;
  onPause: (choice: PauseChoice) => void;
  onResume: () => void;
  /** Told after the switch changes, so Home can refresh what depends on it. */
  onAutomaticChange: (on: boolean) => void;
  onExplainer: () => void;
}

export function RecordingSheet({
  visible,
  onClose,
  pausedUntil,
  onPause,
  onResume,
  onAutomaticChange,
  onExplainer,
}: Props) {
  // null until read, so a switched-off phone never flashes "on".
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    readAutomaticTrips()
      .then((v) => live && setOn(v))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [visible]);

  const toggle = useCallback(
    async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      setOn(next); // show the choice at once; the work below is slower
      try {
        await setAutomaticTrips(next);
      } catch {
        // stored or not, show what is really there
      }
      try {
        const actual = await readAutomaticTrips();
        setOn(actual);
        onAutomaticChange(actual);
      } catch {
        onAutomaticChange(next);
      } finally {
        setBusy(false);
      }
    },
    [busy, onAutomaticChange]
  );

  const now = Date.now();
  const paused = pausedUntil !== null && pausedUntil > now;

  return (
    <HomeSheet visible={visible} title="Recording" onClose={onClose}>
      <View style={s.card}>
        <View style={s.switchRow}>
          <View style={s.switchText}>
            <Text style={s.rowTitle} maxFontSizeMultiplier={fontScaleCap.body}>Automatic trips</Text>
            <Text style={s.hint} maxFontSizeMultiplier={fontScaleCap.body}>
              {on === false ? "Only shifts and Start Trip record." : "Drives record by themselves."}
            </Text>
          </View>
          {on !== null ? (
            <Switch
              value={on}
              onValueChange={toggle}
              disabled={busy}
              trackColor={{ false: "#374151", true: colors.amber }}
              thumbColor="#fff"
              ios_backgroundColor="#374151"
              accessibilityRole="switch"
              accessibilityLabel="Automatic trips"
              accessibilityHint={on ? "Drives record by themselves." : "Only shifts and Start Trip record."}
              accessibilityState={{ checked: on, disabled: busy }}
            />
          ) : null}
        </View>
      </View>

      <View style={s.card}>
        {paused ? (
          <>
            <Text style={s.rowTitle} maxFontSizeMultiplier={fontScaleCap.body}>
              {pausedRowText(pausedUntil as number, now)}
            </Text>
            <Pressable
              onPress={() => {
                onResume();
                onClose();
              }}
              style={s.primaryOutline}
              accessibilityRole="button"
              accessibilityLabel="Resume recording now"
            >
              <Text style={s.primaryOutlineText} maxFontSizeMultiplier={fontScaleCap.body}>Resume recording</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.rowTitle} maxFontSizeMultiplier={fontScaleCap.body}>Pause recording</Text>
            <Text style={s.hint} maxFontSizeMultiplier={fontScaleCap.body}>
              MileClear uses about 2 to 4% of battery over an 8-hour shift. Recording comes back on by itself
              when the pause ends. You can still add trips by hand.
            </Text>
            {pauseChoices(now).map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  onPause(c);
                  onClose();
                }}
                style={s.choice}
                accessibilityRole="button"
                accessibilityLabel={`Pause recording ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}`}
              >
                <Ionicons name="pause-outline" size={18} color={colors.text2} accessible={false} />
                <Text style={s.choiceText} maxFontSizeMultiplier={fontScaleCap.body}>{c.label}</Text>
              </Pressable>
            ))}
          </>
        )}
      </View>

      <View style={s.card}>
        <Pressable
          onPress={() => tellUs(on)}
          style={s.linkRow}
          accessibilityRole="link"
          accessibilityLabel="Not working? Email us"
        >
          <Ionicons name="mail-outline" size={18} color={colors.text2} accessible={false} />
          <Text style={s.linkText} maxFontSizeMultiplier={fontScaleCap.body}>Not working? Tell us</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
        </Pressable>
        <View style={s.divider} />
        <Pressable
          onPress={onExplainer}
          style={s.linkRow}
          accessibilityRole="link"
          accessibilityLabel="What is the difference between Work and Personal?"
        >
          <Ionicons name="help-circle-outline" size={18} color={colors.text2} accessible={false} />
          <Text style={s.linkText} maxFontSizeMultiplier={fontScaleCap.body}>
            What's the difference between Work and Personal?
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
        </Pressable>
      </View>
    </HomeSheet>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchText: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1 },
  hint: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 3, lineHeight: 19 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  choiceText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text1 },
  primaryOutline: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryOutlineText: { fontSize: 15, fontFamily: fonts.bold, color: colors.amber },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  linkText: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.text1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
});
