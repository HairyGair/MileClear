// Home's door rows (SPEC-VISUAL 5.6): up to three plain list rows in one
// rounded group, each an icon, one sentence and a chevron. Long-press a row for
// "Hide this row" (the Settings > Home screen page brings it back). Road alerts
// and "How MileClear works" are never hideable.

import { useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { DOOR_ROW_IDS, type DoorRowId } from "../../lib/home/doorPrefs";
import type { DoorRow } from "../../lib/home/doors";
import { doorKeyFigure } from "../../lib/home/doorText";
import { trackHomeTap } from "../../lib/home/trackHomeTap";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

interface Props {
  rows: DoorRow[];
  mode: "work" | "personal";
  state: string;
  onHide: (id: DoorRowId) => void;
}

function isHideable(id: string): id is DoorRowId {
  return (DOOR_ROW_IDS as readonly string[]).includes(id);
}

/** The sentence with its one key figure in bold (SPEC-VISUAL 5.6). */
function DoorSentence({ text }: { text: string }) {
  const k = doorKeyFigure(text);
  return (
    <Text style={s.text} maxFontSizeMultiplier={fontScaleCap.body}>
      {k ? (
        <>
          {k.before}
          <Text style={s.figure}>{k.figure}</Text>
          {k.after}
        </>
      ) : (
        text
      )}
    </Text>
  );
}

export function DoorRows({ rows, mode, state, onHide }: Props) {
  const router = useRouter();

  const confirmHide = useCallback(
    (row: DoorRow) => {
      if (!isHideable(row.id)) return;
      const id = row.id;
      trackHomeTap("door_hide", mode, state);
      Alert.alert(
        "Hide this shortcut?",
        "You can bring it back any time in Settings, under Home screen.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Hide it", style: "destructive", onPress: () => onHide(id) },
        ]
      );
    },
    [mode, state, onHide]
  );

  if (rows.length === 0) return null;

  return (
    <View style={s.group}>
      {rows.map((row, i) => {
        const hideable = isHideable(row.id);
        return (
          <View key={row.id}>
            {i > 0 ? <View style={s.divider} /> : null}
            <Pressable
              onPress={() => {
                trackHomeTap(`door_${row.id}`, mode, state);
                router.navigate(row.route as never);
              }}
              onLongPress={hideable ? () => confirmHide(row) : undefined}
              delayLongPress={450}
              style={({ pressed }) => [s.row, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={row.text}
              accessibilityHint={hideable ? "Opens it. Press and hold to hide this shortcut." : undefined}
              accessibilityActions={hideable ? [{ name: "hide", label: "Hide this shortcut" }] : undefined}
              onAccessibilityAction={hideable ? () => confirmHide(row) : undefined}
            >
              <Ionicons
                name={row.icon as keyof typeof Ionicons.glyphMap}
                size={20}
                color={row.urgent ? colors.amber : colors.text2}
                accessible={false}
              />
              <DoorSentence text={row.text} />
              <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  text: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.text1, lineHeight: 21 },
  figure: { fontFamily: fonts.bold },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 52 },
});
