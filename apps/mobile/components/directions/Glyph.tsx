// Draws the graphics designer's SVGs (glyphData.ts) with react-native-svg.
// Single-colour glyphs use currentColor, so `color` tints them.
//
// react-native-svg is native and ships only in the 1.4.0 build. On an older
// binary the view managers are missing; this draws an Ionicons stand-in
// instead of crashing (Directions are hidden there anyway, PLAN F6).

import { createElement, type ReactElement } from "react";
import { Platform, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ENTRY_GLYPHS, MANOEUVRE_GLYPHS, MAP_GLYPHS, type SvgGlyph, type SvgNode } from "./glyphData";
import type { GlyphName } from "../../lib/navigation/phrases";

type SvgModule = Record<string, any>;

let svg: SvgModule | null | undefined;
function loadSvg(): SvgModule | null {
  if (svg !== undefined) return svg;
  svg = null;
  try {
    const present =
      Platform.OS !== "web" &&
      (UIManager.getViewManagerConfig?.("RNSVGPath") != null || UIManager.getViewManagerConfig?.("RNSVGSvgView") != null);
    if (present) svg = require("react-native-svg") as SvgModule;
  } catch {
    svg = null;
  }
  return svg;
}

export function svgAvailable(): boolean {
  return loadSvg() !== null;
}

const TAGS: Record<SvgNode["t"], string> = {
  path: "Path",
  circle: "Circle",
  rect: "Rect",
  g: "G",
  mask: "Mask",
  defs: "Defs",
  line: "Line",
  polyline: "Polyline",
  polygon: "Polygon",
  ellipse: "Ellipse",
};

function render(m: SvgModule, n: SvgNode, key: string): ReactElement | null {
  const C = m[TAGS[n.t]];
  if (!C) return null;
  return createElement(C, { key, ...n.p }, n.c?.map((c, i) => render(m, c, `${key}.${i}`)));
}

function drawGlyph(g: SvgGlyph | undefined, size: number, color: string, height?: number): ReactElement | null {
  const m = loadSvg();
  if (!m || !g) return null;
  return createElement(
    m.default ?? m.Svg,
    { width: size, height: height ?? size, viewBox: g.viewBox, color },
    g.nodes.map((n, i) => render(m, n, String(i)))
  );
}

const FALLBACK: Record<string, keyof typeof Ionicons.glyphMap> = {
  "turn-left": "arrow-back",
  "turn-right": "arrow-forward",
  "slight-left": "arrow-back",
  "slight-right": "arrow-forward",
  "sharp-left": "arrow-back",
  "sharp-right": "arrow-forward",
  "keep-left": "arrow-back",
  "keep-right": "arrow-forward",
  uturn: "arrow-undo",
  arrive: "flag",
  depart: "arrow-up",
  continue: "arrow-up",
};

/** A manoeuvre glyph (graphics/manoeuvres). */
export function ManoeuvreGlyph({ name, size, color }: { name: GlyphName; size: number; color: string }) {
  const drawn = drawGlyph(MANOEUVRE_GLYPHS[name], size, color);
  if (drawn) return <View accessible={false}>{drawn}</View>;
  const icon = FALLBACK[name] ?? (name.startsWith("roundabout") ? "refresh" : "arrow-up");
  return <Ionicons name={icon} size={size * 0.8} color={color} accessible={false} />;
}

/** The car puck (graphics/map): chevron when the course is known, a dot when not. */
export function Puck({ heading, size = 48 }: { heading: boolean; size?: number }) {
  const drawn = drawGlyph(MAP_GLYPHS[heading ? "puck-heading" : "puck-no-heading"], size, "#f5a623");
  if (drawn) return drawn;
  return <Ionicons name={heading ? "navigate" : "ellipse"} size={size * 0.6} color="#f5a623" />;
}

/** The destination pin; anchor its marker at { x: 0.5, y: 0.97 }. */
export function DestinationPin({ width = 36 }: { width?: number }) {
  const drawn = drawGlyph(MAP_GLYPHS["destination-pin"], width, "#f5a623", (width * 64) / 48);
  if (drawn) return drawn;
  return <Ionicons name="flag" size={width * 0.8} color="#f5a623" />;
}

/** The Directions entry icon (graphics/entry): outline by default, filled when active. */
export function DirectionsIcon({ size = 24, color, filled }: { size?: number; color: string; filled?: boolean }) {
  const drawn = drawGlyph(ENTRY_GLYPHS[filled ? "navigate" : "navigate-outline"], size, color);
  if (drawn) return <View accessible={false}>{drawn}</View>;
  return <Ionicons name="navigate-outline" size={size} color={color} accessible={false} />;
}
