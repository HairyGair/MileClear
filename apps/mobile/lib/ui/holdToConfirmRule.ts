// HoldToConfirm's words: the pure part. No React Native, so it runs under vitest.
//
// 14 Oct 2026 (Tom, iPhone): "the trip seems to record, then doesn't give me
// the ability to end it". The End button's resting label was drawn in the
// page's navy over a faint amber tint, about 1.2:1, so "Hold to end trip" was
// only readable once the amber fill grew behind it. A tap let go early also
// did nothing visible. The label is now amber at rest (navy only where the
// fill sits behind it), a line under the button says to press and hold, and
// a tap let go too soon says to keep holding.

/** How long the "keep holding" line stays after an early release. */
export const EARLY_RELEASE_HINT_MS = 2500;

export interface HoldHintInput {
  loading: boolean;
  holding: boolean;
  /** A press was let go before the fill completed, a moment ago. */
  releasedEarly: boolean;
  /** Resting line under the button, e.g. "Press and hold to end the trip". */
  hint?: string;
  /** Shown after an early release, e.g. "Keep holding until the bar fills". */
  earlyReleaseHint?: string;
}

export const DEFAULT_HOLD_HINT = "Press and hold";
export const DEFAULT_EARLY_RELEASE_HINT = "Keep holding until the bar fills";

/** The line under the button, or null for none (while saving or holding,
 *  the button's own label says what is happening). */
export function holdHintText(input: HoldHintInput): string | null {
  if (input.loading || input.holding) return null;
  if (input.releasedEarly) return input.earlyReleaseHint ?? DEFAULT_EARLY_RELEASE_HINT;
  return input.hint ?? DEFAULT_HOLD_HINT;
}

/** Was this press-out a hold let go too soon? Not when the hold completed,
 *  and not while the button is busy saving (presses are ignored then). */
export function isEarlyRelease(completed: boolean, loading: boolean): boolean {
  return !completed && !loading;
}

/** Where the navy copy of the label sits inside the fill. onLayout measures
 *  the resting label from the button's outer edge; the fill starts inside the
 *  border, so the copy moves back by the border width to sit exactly on top. */
export function fillCopyFrame(
  row: { x: number; y: number; width: number; height: number },
  borderWidth: number
): { left: number; top: number; width: number; height: number } {
  return { left: row.x - borderWidth, top: row.y - borderWidth, width: row.width, height: row.height };
}

/** WCAG contrast ratio of two opaque #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` at `alpha` over the opaque `base`, as #rrggbb. */
export function blend(top: string, alpha: number, base: string): string {
  const t = parseInt(top.replace("#", ""), 16);
  const b = parseInt(base.replace("#", ""), 16);
  const mix = (shift: number) =>
    Math.round(((t >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha));
  return "#" + [16, 8, 0].map((s) => mix(s).toString(16).padStart(2, "0")).join("");
}
