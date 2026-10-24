// A phone joined to a car, for the "link this car's Bluetooth" screens.
// Unlinked: a dotted, waiting connection. Linked: a solid amber one with a
// tick. Decorative only; the words around it say what it means.
//
// react-native-svg is native and missing on older binaries, so it is
// required lazily (as components/directions/Glyph.tsx does) and an Ionicons
// stand-in is drawn instead of crashing.

import { Platform, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";

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

// Car body and phone rim; windows and wheels use the theme's dark tones.
const BODY = colors.text3;
const GLASS = colors.practiceMark;
const OUTLINE = colors.bg;
const HUB = colors.text2;

interface Props {
  /** Width in points; height follows the 160 x 100 artboard. */
  size?: number;
  linked?: boolean;
}

export default function CarBluetoothArt({ size = 160, linked = false }: Props) {
  const height = (size * 100) / 160;
  const m = loadSvg();

  if (!m) {
    return (
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height, alignItems: "center", justifyContent: "center", flexDirection: "row" }}
      >
        <Ionicons name="car-sport" size={height * 0.6} color={BODY} />
        <Ionicons
          name={linked ? "checkmark-circle" : "ellipsis-horizontal"}
          size={height * 0.3}
          color={linked ? colors.amber : HUB}
        />
        <Ionicons name="phone-portrait" size={height * 0.45} color={BODY} />
      </View>
    );
  }

  const { default: Svg, Path, Rect, Circle, Ellipse } = m;
  // Phone edge to the car's windscreen.
  const link = "M122 34 Q104 18 86 36";

  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={height} viewBox="0 0 160 100">
        <Ellipse cx={62} cy={88} rx={52} ry={3.5} fill="#000" opacity={0.35} />
        <Path
          d="M12 72 V64 Q12 58 18 57 L32 55 L45 42 Q48 39 53 39 H79 Q84 39 87 43 L96 54 L106 56 Q112 57.5 112 64 V72 Q112 76 108 76 H16 Q12 76 12 72 Z"
          fill={BODY}
          stroke={OUTLINE}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <Path d="M37 55 L47 44.5 Q48.5 43 51 43 H60 V55 Z" fill={GLASS} stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M64 43 H78 Q80.5 43 82 45 L90 55 H64 Z" fill={GLASS} stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M62 55 V74 M50 61 H55 M69 61 H74" stroke={OUTLINE} strokeWidth={2} strokeLinecap="round" />
        <Rect x={104} y={60} width={8} height={4.5} rx={2.2} fill={colors.amber} stroke={OUTLINE} strokeWidth={1.6} />
        <Circle cx={34} cy={76} r={10} fill={OUTLINE} />
        <Circle cx={34} cy={76} r={4.5} fill={HUB} />
        <Circle cx={90} cy={76} r={10} fill={OUTLINE} />
        <Circle cx={90} cy={76} r={4.5} fill={HUB} />

        {linked ? (
          <>
            <Path d={link} fill="none" stroke={colors.amber} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={104} cy={25} r={9} fill={colors.amber} stroke={OUTLINE} strokeWidth={2.5} />
            <Path
              d="M99.5 25.2 L102.6 28.2 L108.5 22.2"
              fill="none"
              stroke={OUTLINE}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <Path d={link} fill="none" stroke={HUB} strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 7" />
        )}

        <Rect x={124} y={14} width={26} height={44} rx={5} fill={GLASS} stroke={BODY} strokeWidth={2.5} />
        <Rect x={128.5} y={20} width={17} height={30} rx={2} fill={OUTLINE} />
        <Circle cx={137} cy={35} r={4} fill={linked ? colors.amber : HUB} />
        <Path d="M134 54 H140" stroke={BODY} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
