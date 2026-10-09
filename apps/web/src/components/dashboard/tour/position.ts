// Where the tour card and the spotlight ring go. Pure.

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
export interface Size {
  w: number;
  h: number;
}
export type Side = "right" | "below" | "above" | "left";
export type Align = "start" | "end" | "center";

const OPPOSITE: Record<Side, Side> = { right: "left", left: "right", below: "above", above: "below" };

function at(t: Rect, c: Size, side: Side, align: Align, gap: number): { left: number; top: number } {
  if (side === "right") return { left: t.left + t.width + gap, top: t.top + t.height / 2 - c.h / 2 };
  if (side === "left") return { left: t.left - gap - c.w, top: t.top + t.height / 2 - c.h / 2 };
  const left = align === "end" ? t.left + t.width - c.w : align === "center" ? t.left + t.width / 2 - c.w / 2 : t.left;
  return { left, top: side === "below" ? t.top + t.height + gap : t.top - gap - c.h };
}

/**
 * Card position for a target. Tries the preferred side, then the opposite,
 * then below, then above; if none fits, clamps into the viewport. `minRoom`
 * makes a vertical side need at least that much space (the home stop wants 260).
 */
export function placeCard(
  target: Rect,
  card: Size,
  viewport: Size,
  preferred: Side,
  align: Align = "start",
  opts: { gap?: number; margin?: number; minRoom?: number } = {}
): { left: number; top: number; side: Side } {
  const gap = opts.gap ?? 16;
  const margin = opts.margin ?? 16;
  const minRoom = opts.minRoom ?? 0;
  const order = Array.from(new Set<Side>([preferred, OPPOSITE[preferred], "below", "above"]));

  const fits = (side: Side, p: { left: number; top: number }): boolean => {
    const inside =
      p.left >= margin && p.top >= margin && p.left + card.w <= viewport.w - margin && p.top + card.h <= viewport.h - margin;
    if (!inside) return false;
    if (minRoom > 0 && (side === "below" || side === "above")) {
      const room = side === "below" ? viewport.h - (target.top + target.height) - gap - margin : target.top - gap - margin;
      if (room < minRoom) return false;
    }
    return true;
  };

  for (const side of order) {
    const p = at(target, card, side, align, gap);
    if (fits(side, p)) return { ...p, side };
  }
  const first = at(target, card, preferred, align, gap);
  return {
    side: preferred,
    left: Math.max(margin, Math.min(first.left, viewport.w - margin - card.w)),
    top: Math.max(margin, Math.min(first.top, viewport.h - margin - card.h)),
  };
}

/** The ring rectangle: the target grown by `pad`, optionally cut to a vertical band. */
export function ringRect(target: Rect, pad: number, clip?: { top: number; bottom: number }): Rect {
  let top = target.top - pad;
  let bottom = target.top + target.height + pad;
  if (clip) {
    top = Math.max(top, clip.top);
    bottom = Math.min(bottom, clip.bottom);
  }
  return { top, left: target.left - pad, width: target.width + pad * 2, height: Math.max(0, bottom - top) };
}
