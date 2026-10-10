// Home's hero: the driver's own number (SPEC-VISUAL 5.3). Same card family as
// the Insights hero (tint, amber edge, radius 20), shorter and without a dial.
// Figure in text1, never amber; no streak, no upsell line, never a zero.
// The whole card opens the screen that explains the figure.

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import { Skeleton } from "../Skeleton";
import { useReducedMotion } from "../../lib/accessibility";
import { getDatabase } from "../../lib/db/index";
import { claimGainNote, type HeroModel } from "../../lib/home/hero";
import { colors, fonts, fontScaleCap, heroCard, motion, numberSizes } from "../../lib/theme";

const SEEN_KEY = "home_seen_claim_pence";
const NOTE_MS = 20000;

/**
 * Remembers the claim between visits. When it has gone up by a pound or more
 * since the driver last looked, returns "+£6.82 from your last trip" for this
 * visit only; the next app open compares against the new figure, so it is gone.
 */
function useClaimGain(claimPence: number | null, recentTrip: boolean): { note: string | null; shown: number | null } {
  const prev = useRef<number | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(claimPence);

  useEffect(() => {
    if (claimPence == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (prev.current === undefined) {
        let stored: number | null = null;
        try {
          const db = await getDatabase();
          const row = await db.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = ?",
            [SEEN_KEY]
          );
          const n = row ? parseInt(row.value, 10) : NaN;
          stored = Number.isFinite(n) ? n : null;
        } catch {
          stored = null;
        }
        prev.current = stored;
      }
      if (cancelled) return;
      const text = recentTrip ? claimGainNote(prev.current ?? null, claimPence) : null;
      if (text) {
        setNote(text);
        timer = setTimeout(() => !cancelled && setNote(null), NOTE_MS);
      }
      setShown(claimPence);
      prev.current = claimPence;
      try {
        const db = await getDatabase();
        await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
          SEEN_KEY,
          String(claimPence),
        ]);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [claimPence, recentTrip]);

  return { note, shown };
}

/** Counts a figure from its old value to its new one (pence). Instant under Reduce Motion. */
function useCountedPence(target: number | null, enabled: boolean): number | null {
  const reduced = useReducedMotion();
  const [value, setValue] = useState<number | null>(target);
  const from = useRef<number | null>(target);

  useEffect(() => {
    if (target == null) {
      setValue(null);
      from.current = null;
      return;
    }
    const start = from.current;
    if (!enabled || reduced || start == null || Math.abs(target - start) < 100) {
      setValue(target);
      from.current = target;
      return;
    }
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / motion.settle);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, reduced]);

  return value;
}

interface Props {
  model: HeroModel;
  onPress: () => void;
  /** The last trip finished within 12 hours (the gain note only makes sense then). */
  recentTrip: boolean;
}

export function HeroCard({ model, onPress, recentTrip }: Props) {
  const claim = model.kind === "figure" ? model.claimPence : null;
  const { note, shown } = useClaimGain(claim, recentTrip);
  const counted = useCountedPence(shown, true);

  if (model.kind === "hidden") return null;
  if (model.kind === "loading") {
    return (
      <View style={s.card} accessible={false}>
        <Skeleton height={14} width={150} radius={6} />
        <Skeleton height={44} width={190} radius={8} style={{ marginTop: 10 }} />
        <Skeleton height={16} width={210} radius={6} style={{ marginTop: 10 }} />
      </View>
    );
  }

  const figure = claim != null && counted != null ? formatPence(counted) : model.figure;
  const smallFigure = model.figure.length > 12;
  // "A quiet month so far" is words, not a number: 22 bold and free to wrap
  // (SPEC-VISUAL 8), rather than a 44pt line squeezed to fit.
  const wordsFigure = !/^[£\d]/.test(model.figure);
  const hint =
    model.target === "insights_month" ? "Opens Insights for this month" : "Opens the Tax tab";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${model.a11yLabel}${note ? ` ${note}.` : ""}`}
      accessibilityHint={hint}
    >
      <View style={s.labelRow}>
        <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.body}>{model.label}</Text>
        {note ? (
          <Text style={s.note} maxFontSizeMultiplier={fontScaleCap.body}>{note}</Text>
        ) : null}
      </View>
      <View style={s.figureRow}>
        {wordsFigure ? (
          <Text style={s.figureWords} maxFontSizeMultiplier={fontScaleCap.heading}>
            {figure}
          </Text>
        ) : (
          // Figure and unit are siblings so only the figure shrinks to fit.
          // No lineHeight on the figure: with adjustsFontSizeToFit, iOS drew
          // "205 miles" a few points high (QA 10 Oct).
          <View style={s.figureLine}>
            <Text
              style={[s.figure, smallFigure && s.figureSmall]}
              maxFontSizeMultiplier={fontScaleCap.display}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
            >
              {figure}
            </Text>
            {model.unit ? (
              <Text style={s.unit} maxFontSizeMultiplier={fontScaleCap.body} numberOfLines={1}>
                {model.unit}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      {model.line ? (
        <Text style={s.line} maxFontSizeMultiplier={fontScaleCap.body} numberOfLines={3}>
          {model.line}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.text3} style={s.chevron} accessible={false} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: heroCard.tint,
    borderColor: heroCard.border,
    borderWidth: 1,
    borderRadius: heroCard.radius,
    padding: 20,
    minHeight: 132,
    justifyContent: "center",
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingRight: 22 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, flexShrink: 1 },
  note: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, flexShrink: 1, textAlign: "right" },
  figureRow: { marginTop: 4, paddingRight: 22 },
  figureLine: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  figure: {
    fontSize: numberSizes.hero,
    fontFamily: fonts.bold,
    color: colors.text1,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  figureSmall: { fontSize: 30 },
  figureWords: { fontSize: 22, lineHeight: 28, fontFamily: fonts.bold, color: colors.text1, marginVertical: 6 },
  unit: { fontSize: 18, fontFamily: fonts.semibold, color: colors.text2, letterSpacing: 0, flexShrink: 0 },
  line: { marginTop: 8, fontSize: 16, lineHeight: 22, fontFamily: fonts.regular, color: colors.text1, paddingRight: 22 },
  chevron: { position: "absolute", right: 16, top: "50%", marginTop: -8 },
});
