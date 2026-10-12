import { View, StyleSheet } from "react-native";
import { colors } from "../../lib/theme";

/**
 * The sign-in screen's map: a few streets and one amber drive, drawn with
 * plain Views (the app has no SVG library) so it is sharp at any size.
 * Drawn on a 430 x 400 grid and scaled to cover the box, like a photo would.
 */

type Pt = [number, number];

const ROADS: { from: Pt; to: Pt; w: number; c: string }[] = [
  { from: [-10, 90], to: [440, 58], w: 10, c: "rgba(255,255,255,0.07)" },
  { from: [-10, 210], to: [440, 222], w: 10, c: "rgba(255,255,255,0.07)" },
  { from: [-10, 330], to: [440, 298], w: 10, c: "rgba(255,255,255,0.07)" },
  { from: [78, -160], to: [104, 410], w: 10, c: "rgba(255,255,255,0.07)" },
  { from: [220, -160], to: [236, 410], w: 10, c: "rgba(255,255,255,0.07)" },
  { from: [352, -160], to: [330, 410], w: 10, c: "rgba(255,255,255,0.07)" },
  { from: [-10, 150], to: [440, 138], w: 4, c: "rgba(255,255,255,0.035)" },
  { from: [-10, 270], to: [440, 260], w: 4, c: "rgba(255,255,255,0.035)" },
  { from: [155, -160], to: [165, 410], w: 4, c: "rgba(255,255,255,0.035)" },
  { from: [286, -160], to: [280, 410], w: 4, c: "rgba(255,255,255,0.035)" },
  { from: [405, -160], to: [398, 410], w: 4, c: "rgba(255,255,255,0.035)" },
];

const ROUTE: Pt[] = [
  [92, 318],
  [98, 210],
  [160, 206],
  [227, 216],
  [218, 120],
  [343, 68],
];

const GRID_W = 430;
const GRID_H = 400;

export function RouteHero({ width, height, topInset = 0 }: { width: number; height: number; topInset?: number }) {
  // "cover" the area under the status bar: scale to fill, centre the overflow
  const mapH = height - topInset;
  const k = Math.max(width / GRID_W, mapH / GRID_H);
  const ox = (width - GRID_W * k) / 2;
  const oy = topInset + (mapH - GRID_H * k) / 2;
  const P = ([x, y]: Pt): Pt => [ox + x * k, oy + y * k];

  const line = (a: Pt, b: Pt, w: number, c: string, key: string) => {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const t = w * k;
    return (
      <View
        key={key}
        style={{
          position: "absolute",
          left: (x1 + x2) / 2 - len / 2,
          top: (y1 + y2) / 2 - t / 2,
          width: len,
          height: t,
          borderRadius: t / 2,
          backgroundColor: c,
          transform: [{ rotate: `${angle}rad` }],
        }}
      />
    );
  };

  const dot = (p: Pt, r: number, style: object, key: string) => {
    const [x, y] = P(p);
    const R = r * k;
    return (
      <View
        key={key}
        style={[{ position: "absolute", left: x - R, top: y - R, width: R * 2, height: R * 2, borderRadius: R }, style]}
      />
    );
  };

  const segs = ROUTE.slice(1).map((p, i) => [ROUTE[i], p] as [Pt, Pt]);
  const joints = ROUTE.slice(1, -1);

  // A soft fade into the page, as stacked bands (no gradient library either).
  const bands = 8;
  const fadeTop = height * 0.72;
  const bandH = (height - fadeTop) / bands;

  return (
    <View style={[s.box, { width, height }]} pointerEvents="none" accessible={false}>
      {ROADS.map((r, i) => line(r.from, r.to, r.w, r.c, `r${i}`))}
      {segs.map(([a, b], i) => line(a, b, 16, "rgba(245,166,35,0.25)", `g${i}`))}
      {joints.map((p, i) => dot(p, 8, { backgroundColor: "rgba(245,166,35,0.25)" }, `gj${i}`))}
      {segs.map(([a, b], i) => line(a, b, 5, colors.amber, `l${i}`))}
      {joints.map((p, i) => dot(p, 2.5, { backgroundColor: colors.amber }, `lj${i}`))}
      {dot(ROUTE[0], 9, { backgroundColor: colors.bg, borderWidth: 4 * k, borderColor: colors.green }, "start")}
      {dot(ROUTE[ROUTE.length - 1], 11, { backgroundColor: colors.amber }, "end")}
      {dot(ROUTE[ROUTE.length - 1], 4, { backgroundColor: colors.bg }, "endc")}
      {Array.from({ length: bands }, (_, i) => (
        <View
          key={`f${i}`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: fadeTop + i * bandH,
            height: bandH + 1,
            backgroundColor: colors.bg,
            opacity: (i + 1) / bands,
          }}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    backgroundColor: "#070d1a",
  },
});
