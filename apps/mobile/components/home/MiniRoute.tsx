// The little route thumbnail on the Last trip card: the route as an amber
// line on the dark track colour, a hollow ring where it started and an amber
// dot where it ended. Plain Views, no map tiles (SPEC-VISUAL 5.5). A trip
// added by hand draws a dashed line from start to end.

import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { layoutRoute, type LatLng } from "../../lib/home/miniRoute";
import { chart, colors } from "../../lib/theme";

interface Props {
  route: LatLng[];
  start: LatLng | null;
  end: LatLng | null;
  size: number;
  dashed: boolean;
}

export function MiniRoute({ route, start, end, size, dashed }: Props) {
  const drawing = useMemo(
    () => layoutRoute({ route, start, end, size, pad: size >= 56 ? 9 : 7, dashed }),
    [route, start, end, size, dashed]
  );
  const line = dashed ? 1.5 : 2.5;
  const lineColor = dashed ? colors.text3 : colors.amber;

  return (
    <View
      style={[s.box, { width: size, height: size }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {drawing.pieces.map((p, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: p.cx - p.length / 2,
            top: p.cy - line / 2,
            width: p.length,
            height: line,
            borderRadius: line / 2,
            backgroundColor: lineColor,
            transform: [{ rotate: `${p.angleDeg}deg` }],
          }}
        />
      ))}
      {drawing.start ? (
        <View style={[s.ring, { left: drawing.start.x - 3, top: drawing.start.y - 3 }]} />
      ) : null}
      {drawing.end ? (
        <View style={[s.dot, { left: drawing.end.x - 3, top: drawing.end.y - 3 }]} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 10, backgroundColor: chart.track, overflow: "hidden" },
  ring: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.text1,
    backgroundColor: chart.track,
  },
  dot: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber },
});
