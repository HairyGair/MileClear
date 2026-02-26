import React from "react";
import Svg, { Circle, Rect, Path, G, Ellipse, Line } from "react-native-svg";

// ---------------------------------------------------------------------------
// Individual vehicle avatar components
// Each renders a side-view cartoon vehicle on a dark circular background.
// Designed to look good at both 52px (profile) and 30px (map marker) sizes.
// ---------------------------------------------------------------------------

const BG = "#0a1120";
const BORDER = "rgba(255,255,255,0.1)";

// Helper — dark circular background shared by all avatars
function AvatarBase({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 52 52">
      {/* Background circle */}
      <Circle cx="26" cy="26" r="25.5" fill={BG} />
      {/* Border */}
      <Circle
        cx="26"
        cy="26"
        r="25.5"
        fill="none"
        stroke={BORDER}
        strokeWidth="1"
      />
      {children}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 1. sedan-red — Red Sedan
// ---------------------------------------------------------------------------
function SedanRed({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Body */}
      <Rect x="7" y="27" width="38" height="12" rx="3" fill="#e53e3e" />
      {/* Roof */}
      <Path d="M13 27 L16 18 L36 18 L39 27 Z" fill="#c53030" />
      {/* Windscreen */}
      <Path d="M17 27 L19 20 L26 20 L26 27 Z" fill="#90cdf4" opacity="0.9" />
      {/* Rear window */}
      <Path d="M26 27 L26 20 L33 20 L35 27 Z" fill="#90cdf4" opacity="0.9" />
      {/* Wheels */}
      <Circle cx="14" cy="39" r="5" fill="#1a202c" />
      <Circle cx="14" cy="39" r="2.5" fill="#718096" />
      <Circle cx="38" cy="39" r="5" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2.5" fill="#718096" />
      {/* Headlight */}
      <Rect x="43" y="29" width="3" height="4" rx="1" fill="#fefcbf" />
      {/* Tail light */}
      <Rect x="6" y="29" width="3" height="4" rx="1" fill="#fc8181" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 2. suv-blue — Blue SUV
// ---------------------------------------------------------------------------
function SuvBlue({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Body */}
      <Rect x="6" y="25" width="40" height="14" rx="3" fill="#3182ce" />
      {/* Tall roof */}
      <Rect x="9" y="15" width="33" height="11" rx="3" fill="#2b6cb0" />
      {/* Front window */}
      <Rect x="32" y="17" width="8" height="8" rx="1" fill="#90cdf4" opacity="0.9" />
      {/* Rear window */}
      <Rect x="11" y="17" width="8" height="8" rx="1" fill="#90cdf4" opacity="0.9" />
      {/* Mid window */}
      <Rect x="21" y="17" width="9" height="8" rx="1" fill="#90cdf4" opacity="0.9" />
      {/* Wheels */}
      <Circle cx="15" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="15" cy="39" r="2.5" fill="#718096" />
      <Circle cx="37" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="37" cy="39" r="2.5" fill="#718096" />
      {/* Headlight */}
      <Rect x="43" y="27" width="3" height="5" rx="1" fill="#fefcbf" />
      {/* Tail light */}
      <Rect x="6" y="27" width="3" height="5" rx="1" fill="#fc8181" />
      {/* Roof rails */}
      <Line x1="12" y1="15" x2="40" y2="15" stroke="#63b3ed" strokeWidth="1.5" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 3. taxi-yellow — Yellow Taxi
// ---------------------------------------------------------------------------
function TaxiYellow({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Body */}
      <Rect x="7" y="27" width="38" height="12" rx="3" fill="#f6e05e" />
      {/* Roof */}
      <Path d="M13 27 L16 19 L36 19 L39 27 Z" fill="#ecc94b" />
      {/* Taxi sign */}
      <Rect x="20" y="14" width="12" height="5" rx="1" fill="#f6e05e" />
      <Rect x="21" y="15" width="10" height="3" rx="0.5" fill="#744210" />
      {/* Windows */}
      <Path d="M17 27 L19 21 L26 21 L26 27 Z" fill="#bee3f8" opacity="0.9" />
      <Path d="M26 27 L26 21 L33 21 L35 27 Z" fill="#bee3f8" opacity="0.9" />
      {/* Wheels */}
      <Circle cx="14" cy="39" r="5" fill="#1a202c" />
      <Circle cx="14" cy="39" r="2.5" fill="#718096" />
      <Circle cx="38" cy="39" r="5" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2.5" fill="#718096" />
      {/* Headlight */}
      <Rect x="43" y="29" width="3" height="4" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 4. hatchback-green — Green Hatchback
// ---------------------------------------------------------------------------
function HatchbackGreen({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Body */}
      <Rect x="7" y="28" width="38" height="11" rx="3" fill="#38a169" />
      {/* Roof — shorter, steeper rear */}
      <Path d="M12 28 L15 19 L34 19 L40 28 Z" fill="#2f855a" />
      {/* Front window */}
      <Path d="M26 28 L26 20 L33 20 L38 28 Z" fill="#9ae6b4" opacity="0.85" />
      {/* Rear window */}
      <Path d="M16 28 L18 20 L26 20 L26 28 Z" fill="#9ae6b4" opacity="0.85" />
      {/* Wheels */}
      <Circle cx="14" cy="39" r="5" fill="#1a202c" />
      <Circle cx="14" cy="39" r="2.5" fill="#68d391" />
      <Circle cx="38" cy="39" r="5" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2.5" fill="#68d391" />
      {/* Headlight */}
      <Rect x="43" y="30" width="3" height="4" rx="1" fill="#fefcbf" />
      {/* Hatch door line */}
      <Line x1="34" y1="19" x2="40" y2="28" stroke="#276749" strokeWidth="1" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 5. sports-orange — Orange Sports Car
// ---------------------------------------------------------------------------
function SportsOrange({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Low sleek body */}
      <Path d="M5 32 L8 28 L15 24 L32 23 L44 28 L47 32 L47 37 L5 37 Z" fill="#ed8936" />
      {/* Roof — very low */}
      <Path d="M16 28 L20 22 L33 22 L37 28 Z" fill="#c05621" />
      {/* Windscreen */}
      <Path d="M26 28 L26 23 L33 23 L36 28 Z" fill="#bee3f8" opacity="0.9" />
      {/* Rear window */}
      <Path d="M20 28 L20 23 L26 23 L26 28 Z" fill="#bee3f8" opacity="0.9" />
      {/* Spoiler */}
      <Rect x="5" y="28" width="6" height="2" rx="1" fill="#7b341e" />
      {/* Wheels */}
      <Circle cx="14" cy="37" r="5.5" fill="#1a202c" />
      <Circle cx="14" cy="37" r="2.5" fill="#f6ad55" />
      <Circle cx="38" cy="37" r="5.5" fill="#1a202c" />
      <Circle cx="38" cy="37" r="2.5" fill="#f6ad55" />
      {/* Headlight */}
      <Rect x="43" y="29" width="3" height="3" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 6. muscle-purple — Purple Muscle Car
// ---------------------------------------------------------------------------
function MusclePurple({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Wide chunky body */}
      <Rect x="5" y="27" width="42" height="12" rx="2" fill="#805ad5" />
      {/* Hood bulge */}
      <Path d="M30 27 L32 22 L44 22 L46 27 Z" fill="#6b46c1" />
      {/* Roof */}
      <Path d="M12 27 L15 20 L31 20 L33 27 Z" fill="#6b46c1" />
      {/* Windscreen */}
      <Path d="M26 27 L26 21 L31 21 L32 27 Z" fill="#e9d8fd" opacity="0.85" />
      {/* Rear window */}
      <Path d="M15 27 L17 21 L26 21 L26 27 Z" fill="#e9d8fd" opacity="0.85" />
      {/* Side stripe */}
      <Rect x="5" y="32" width="42" height="2" fill="#553c9a" />
      {/* Wheels — wider */}
      <Circle cx="14" cy="39" r="6" fill="#1a202c" />
      <Circle cx="14" cy="39" r="3" fill="#b794f4" />
      <Circle cx="38" cy="39" r="6" fill="#1a202c" />
      <Circle cx="38" cy="39" r="3" fill="#b794f4" />
      {/* Headlight */}
      <Rect x="43" y="28" width="3" height="5" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 7. convertible-pink — Pink Convertible
// ---------------------------------------------------------------------------
function ConvertiblePink({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Body */}
      <Rect x="7" y="29" width="38" height="11" rx="3" fill="#ed64a6" />
      {/* Low windscreen only (open top) */}
      <Path d="M26 29 L29 23 L38 23 L40 29 Z" fill="#fed7e2" opacity="0.85" />
      {/* Front bonnet */}
      <Path d="M34 29 L36 25 L46 25 L46 29 Z" fill="#d53f8c" />
      {/* Rear deck */}
      <Path d="M5 29 L5 26 L14 26 L14 29 Z" fill="#d53f8c" />
      {/* Windscreen frame */}
      <Path d="M25 29 L29 23 L30 23 L26 29 Z" fill="#b83280" />
      {/* Wheels */}
      <Circle cx="14" cy="40" r="5" fill="#1a202c" />
      <Circle cx="14" cy="40" r="2.5" fill="#f687b3" />
      <Circle cx="38" cy="40" r="5" fill="#1a202c" />
      <Circle cx="38" cy="40" r="2.5" fill="#f687b3" />
      {/* Headlight */}
      <Rect x="43" y="30" width="3" height="3" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 8. van-white — White Delivery Van
// ---------------------------------------------------------------------------
function VanWhite({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Box body */}
      <Rect x="6" y="18" width="40" height="21" rx="3" fill="#e2e8f0" />
      {/* Cab section darker */}
      <Rect x="30" y="18" width="16" height="21" rx="2" fill="#cbd5e0" />
      {/* Cab window */}
      <Rect x="32" y="20" width="11" height="10" rx="1" fill="#90cdf4" opacity="0.9" />
      {/* Panel lines on cargo */}
      <Line x1="6" y1="25" x2="30" y2="25" stroke="#a0aec0" strokeWidth="0.8" />
      <Line x1="18" y1="18" x2="18" y2="39" stroke="#a0aec0" strokeWidth="0.8" />
      {/* Wheels */}
      <Circle cx="14" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="14" cy="39" r="2.5" fill="#a0aec0" />
      <Circle cx="38" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2.5" fill="#a0aec0" />
      {/* Headlight */}
      <Rect x="43" y="23" width="3" height="5" rx="1" fill="#fefcbf" />
      {/* Tail light */}
      <Rect x="6" y="23" width="3" height="5" rx="1" fill="#fc8181" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 9. pickup-black — Black Pickup Truck
// ---------------------------------------------------------------------------
function PickupBlack({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Cargo bed */}
      <Rect x="6" y="26" width="18" height="13" rx="2" fill="#2d3748" />
      {/* Cab */}
      <Rect x="22" y="22" width="24" height="17" rx="3" fill="#4a5568" />
      {/* Cab window */}
      <Rect x="25" y="24" width="18" height="10" rx="1" fill="#90cdf4" opacity="0.8" />
      {/* Bed walls */}
      <Rect x="6" y="26" width="18" height="3" rx="1" fill="#1a202c" />
      {/* Wheels */}
      <Circle cx="13" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="13" cy="39" r="2.5" fill="#4a5568" />
      <Circle cx="37" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="37" cy="39" r="2.5" fill="#4a5568" />
      {/* Headlight */}
      <Rect x="43" y="27" width="3" height="5" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 10. motorcycle-silver — Silver Motorcycle
// ---------------------------------------------------------------------------
function MotorcycleSilver({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Frame */}
      <Path d="M18 32 L26 22 L34 32" stroke="#a0aec0" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Tank */}
      <Ellipse cx="26" cy="27" rx="6" ry="4" fill="#718096" />
      {/* Seat */}
      <Rect x="17" y="28" width="10" height="3" rx="1.5" fill="#4a5568" />
      {/* Handlebars */}
      <Line x1="32" y1="24" x2="38" y2="22" stroke="#a0aec0" strokeWidth="2" strokeLinecap="round" />
      {/* Fork */}
      <Line x1="35" y1="25" x2="37" y2="33" stroke="#a0aec0" strokeWidth="2" strokeLinecap="round" />
      {/* Wheels */}
      <Circle cx="15" cy="37" r="7" fill="none" stroke="#a0aec0" strokeWidth="2.5" />
      <Circle cx="15" cy="37" r="2" fill="#718096" />
      <Circle cx="37" cy="37" r="7" fill="none" stroke="#a0aec0" strokeWidth="2.5" />
      <Circle cx="37" cy="37" r="2" fill="#718096" />
      {/* Exhaust */}
      <Path d="M16 33 L10 35 L9 37" stroke="#e2e8f0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 11. bus-red — Red Double Decker Bus
// ---------------------------------------------------------------------------
function BusRed({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Lower deck */}
      <Rect x="7" y="28" width="38" height="12" rx="2" fill="#e53e3e" />
      {/* Upper deck */}
      <Rect x="7" y="14" width="34" height="15" rx="2" fill="#c53030" />
      {/* Lower windows */}
      <Rect x="10" y="30" width="7" height="6" rx="1" fill="#bee3f8" opacity="0.85" />
      <Rect x="20" y="30" width="7" height="6" rx="1" fill="#bee3f8" opacity="0.85" />
      <Rect x="30" y="30" width="7" height="6" rx="1" fill="#bee3f8" opacity="0.85" />
      {/* Upper windows */}
      <Rect x="10" y="17" width="7" height="7" rx="1" fill="#bee3f8" opacity="0.85" />
      <Rect x="20" y="17" width="7" height="7" rx="1" fill="#bee3f8" opacity="0.85" />
      <Rect x="30" y="17" width="7" height="7" rx="1" fill="#bee3f8" opacity="0.85" />
      {/* Door */}
      <Rect x="39" y="30" width="5" height="10" rx="1" fill="#9b2c2c" />
      {/* Wheels */}
      <Circle cx="14" cy="40" r="5" fill="#1a202c" />
      <Circle cx="14" cy="40" r="2" fill="#718096" />
      <Circle cx="36" cy="40" r="5" fill="#1a202c" />
      <Circle cx="36" cy="40" r="2" fill="#718096" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 12. racer-blue — Blue Racing Car
// ---------------------------------------------------------------------------
function RacerBlue({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Low flat body */}
      <Path d="M4 34 L8 27 L40 26 L48 30 L48 36 L4 36 Z" fill="#2b6cb0" />
      {/* Cockpit */}
      <Ellipse cx="26" cy="27" rx="7" ry="4" fill="#1a365d" />
      <Ellipse cx="26" cy="27" rx="5" ry="2.5" fill="#90cdf4" opacity="0.85" />
      {/* Front wing */}
      <Rect x="40" y="34" width="8" height="2" rx="1" fill="#2c5282" />
      {/* Rear wing */}
      <Rect x="4" y="30" width="8" height="2" rx="1" fill="#2c5282" />
      <Rect x="5" y="27" width="1.5" height="5" rx="0.5" fill="#2c5282" />
      <Rect x="10" y="27" width="1.5" height="5" rx="0.5" fill="#2c5282" />
      {/* Race stripe */}
      <Rect x="4" y="31" width="44" height="2" fill="#63b3ed" />
      {/* Wheels */}
      <Circle cx="13" cy="36" r="5" fill="#1a202c" />
      <Circle cx="13" cy="36" r="2" fill="#63b3ed" />
      <Circle cx="38" cy="36" r="5" fill="#1a202c" />
      <Circle cx="38" cy="36" r="2" fill="#63b3ed" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 13. schoolbus-yellow — Yellow School Bus
// ---------------------------------------------------------------------------
function SchoolbusYellow({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Long body */}
      <Rect x="5" y="22" width="42" height="17" rx="3" fill="#f6e05e" />
      {/* Front cab rounded */}
      <Rect x="37" y="22" width="10" height="17" rx="3" fill="#ecc94b" />
      {/* Windows */}
      <Rect x="8" y="25" width="7" height="7" rx="1" fill="#bee3f8" opacity="0.85" />
      <Rect x="17" y="25" width="7" height="7" rx="1" fill="#bee3f8" opacity="0.85" />
      <Rect x="26" y="25" width="7" height="7" rx="1" fill="#bee3f8" opacity="0.85" />
      <Rect x="39" y="25" width="6" height="7" rx="1" fill="#bee3f8" opacity="0.85" />
      {/* Black stripe */}
      <Rect x="5" y="33" width="42" height="2.5" fill="#1a202c" />
      {/* Wheels */}
      <Circle cx="13" cy="39" r="5" fill="#1a202c" />
      <Circle cx="13" cy="39" r="2" fill="#a0aec0" />
      <Circle cx="38" cy="39" r="5" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2" fill="#a0aec0" />
      {/* Headlight */}
      <Rect x="44" y="26" width="3" height="4" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 14. electric-green — Green Electric Car
// ---------------------------------------------------------------------------
function ElectricGreen({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Aerodynamic body */}
      <Path d="M6 32 L10 24 L38 23 L46 28 L46 36 L6 36 Z" fill="#48bb78" />
      {/* Smooth roof */}
      <Path d="M15 28 L19 21 L36 21 L40 28 Z" fill="#38a169" />
      {/* Front window */}
      <Path d="M26 28 L27 22 L36 22 L39 28 Z" fill="#c6f6d5" opacity="0.85" />
      {/* Rear window */}
      <Path d="M15 28 L19 22 L26 22 L26 28 Z" fill="#c6f6d5" opacity="0.85" />
      {/* Charge port */}
      <Rect x="6" y="28" width="3" height="3" rx="0.5" fill="#276749" />
      {/* Lightning bolt */}
      <Path d="M24 14 L21 20 L24 20 L22 26 L27 19 L24 19 Z" fill="#f6e05e" />
      {/* Wheels */}
      <Circle cx="14" cy="36" r="5" fill="#1a202c" />
      <Circle cx="14" cy="36" r="2.5" fill="#68d391" />
      <Circle cx="38" cy="36" r="5" fill="#1a202c" />
      <Circle cx="38" cy="36" r="2.5" fill="#68d391" />
      {/* Headlight — thin LED strip */}
      <Rect x="43" y="28" width="3" height="2" rx="1" fill="#c6f6d5" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 15. monster-orange — Orange Monster Truck
// ---------------------------------------------------------------------------
function MonsterOrange({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Huge wheels */}
      <Circle cx="13" cy="36" r="9" fill="#1a202c" />
      <Circle cx="13" cy="36" r="5" fill="#718096" />
      <Circle cx="39" cy="36" r="9" fill="#1a202c" />
      <Circle cx="39" cy="36" r="5" fill="#718096" />
      {/* Body high up */}
      <Rect x="8" y="16" width="36" height="18" rx="3" fill="#ed8936" />
      {/* Windows */}
      <Rect x="12" y="18" width="12" height="9" rx="1" fill="#fefce8" opacity="0.85" />
      <Rect x="26" y="18" width="12" height="9" rx="1" fill="#fefce8" opacity="0.85" />
      {/* Axle */}
      <Line x1="13" y1="33" x2="39" y2="33" stroke="#4a5568" strokeWidth="2" />
      {/* Headlight */}
      <Rect x="41" y="20" width="3" height="5" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 16. f1-teal — Teal F1 Car
// ---------------------------------------------------------------------------
function F1Teal({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Narrow nose */}
      <Path d="M46 30 L38 28 L10 28 L4 31 L4 33 L10 32 L38 32 L46 32 Z" fill="#319795" />
      {/* Front wing */}
      <Rect x="42" y="32" width="8" height="1.5" rx="0.5" fill="#2c7a7b" />
      <Rect x="43" y="29" width="1" height="4" rx="0.5" fill="#2c7a7b" />
      <Rect x="47" y="29" width="1" height="4" rx="0.5" fill="#2c7a7b" />
      {/* Rear wing */}
      <Rect x="4" y="26" width="8" height="1.5" rx="0.5" fill="#2c7a7b" />
      <Rect x="6" y="27" width="1" height="4" rx="0.5" fill="#2c7a7b" />
      <Rect x="10" y="27" width="1" height="4" rx="0.5" fill="#2c7a7b" />
      {/* Cockpit */}
      <Ellipse cx="23" cy="28" rx="5" ry="3.5" fill="#1d4044" />
      <Ellipse cx="23" cy="28" rx="3.5" ry="2" fill="#81e6d9" opacity="0.75" />
      {/* Airbox/engine cover */}
      <Rect x="16" y="23" width="6" height="5" rx="1" fill="#2c7a7b" />
      {/* Wheels */}
      <Circle cx="12" cy="34" r="5" fill="#1a202c" />
      <Circle cx="12" cy="34" r="2" fill="#4fd1c5" />
      <Circle cx="37" cy="34" r="5" fill="#1a202c" />
      <Circle cx="37" cy="34" r="2" fill="#4fd1c5" />
      {/* Halo */}
      <Path d="M18 25 Q23 22 28 25" stroke="#e6fffa" strokeWidth="1.5" fill="none" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 17. luxury-gold — Gold Luxury Car
// ---------------------------------------------------------------------------
function LuxuryGold({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Long elegant body */}
      <Path d="M6 30 L10 26 L40 25 L46 28 L46 37 L6 37 Z" fill="#d69e2e" />
      {/* Roof */}
      <Path d="M14 29 L18 21 L35 21 L39 28 Z" fill="#b7791f" />
      {/* Front window */}
      <Path d="M27 28 L28 22 L35 22 L38 28 Z" fill="#fefcbf" opacity="0.8" />
      {/* Rear window */}
      <Path d="M15 28 L19 22 L27 22 L27 28 Z" fill="#fefcbf" opacity="0.8" />
      {/* Chrome grille */}
      <Rect x="43" y="27" width="4" height="8" rx="1" fill="#e2e8f0" />
      <Line x1="43" y1="29" x2="47" y2="29" stroke="#a0aec0" strokeWidth="0.8" />
      <Line x1="43" y1="31" x2="47" y2="31" stroke="#a0aec0" strokeWidth="0.8" />
      <Line x1="43" y1="33" x2="47" y2="33" stroke="#a0aec0" strokeWidth="0.8" />
      {/* Chrome trim */}
      <Rect x="6" y="35" width="40" height="1.5" fill="#f6e05e" />
      {/* Wheels */}
      <Circle cx="14" cy="37" r="5" fill="#1a202c" />
      <Circle cx="14" cy="37" r="2.5" fill="#d69e2e" />
      <Circle cx="38" cy="37" r="5" fill="#1a202c" />
      <Circle cx="38" cy="37" r="2.5" fill="#d69e2e" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 18. jeep-brown — Brown Jeep
// ---------------------------------------------------------------------------
function JeepBrown({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Box body */}
      <Rect x="8" y="22" width="36" height="17" rx="2" fill="#8b5e3c" />
      {/* Open top / roll cage lines */}
      <Rect x="8" y="22" width="36" height="3" rx="1" fill="#6b4226" />
      {/* Windscreen */}
      <Rect x="27" y="23" width="13" height="10" rx="1" fill="#bee3f8" opacity="0.8" />
      {/* Side windows */}
      <Rect x="11" y="23" width="13" height="10" rx="1" fill="#bee3f8" opacity="0.8" />
      {/* Front grille — iconic 7 slots */}
      <Rect x="40" y="24" width="6" height="12" rx="1" fill="#6b4226" />
      <Line x1="41" y1="25" x2="41" y2="35" stroke="#8b5e3c" strokeWidth="1" />
      <Line x1="43" y1="25" x2="43" y2="35" stroke="#8b5e3c" strokeWidth="1" />
      <Line x1="44.5" y1="25" x2="44.5" y2="35" stroke="#8b5e3c" strokeWidth="1" />
      {/* Big off-road wheels */}
      <Circle cx="14" cy="39" r="6" fill="#1a202c" />
      <Circle cx="14" cy="39" r="3" fill="#6b4226" />
      <Circle cx="38" cy="39" r="6" fill="#1a202c" />
      <Circle cx="38" cy="39" r="3" fill="#6b4226" />
      {/* Headlight */}
      <Circle cx="44" cy="25" r="2" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 19. ambulance-navy — Navy Ambulance
// ---------------------------------------------------------------------------
function AmbulanceNavy({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Box body */}
      <Rect x="6" y="19" width="40" height="20" rx="3" fill="#2c5282" />
      {/* Cab */}
      <Rect x="32" y="19" width="14" height="20" rx="2" fill="#2b4c7e" />
      {/* Cab window */}
      <Rect x="34" y="21" width="10" height="10" rx="1" fill="#90cdf4" opacity="0.85" />
      {/* Red cross */}
      <Rect x="12" y="24" width="3" height="10" rx="1" fill="#fc8181" />
      <Rect x="8" y="27" width="11" height="4" rx="1" fill="#fc8181" />
      {/* Stripe */}
      <Rect x="6" y="31" width="40" height="3" fill="#e53e3e" />
      {/* Lights on roof */}
      <Rect x="22" y="16" width="8" height="3" rx="1" fill="#e53e3e" />
      <Rect x="23" y="15" width="3" height="4" rx="0.5" fill="#fc8181" />
      <Rect x="27" y="15" width="3" height="4" rx="0.5" fill="#63b3ed" />
      {/* Wheels */}
      <Circle cx="14" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="14" cy="39" r="2.5" fill="#4299e1" />
      <Circle cx="37" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="37" cy="39" r="2.5" fill="#4299e1" />
      {/* Headlight */}
      <Rect x="43" y="23" width="3" height="4" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 20. firetruck-red — Red Fire Truck
// ---------------------------------------------------------------------------
function FiretruckRed({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Long body */}
      <Rect x="5" y="22" width="42" height="17" rx="3" fill="#e53e3e" />
      {/* Cab */}
      <Rect x="34" y="18" width="13" height="21" rx="2" fill="#c53030" />
      {/* Cab window */}
      <Rect x="36" y="20" width="9" height="10" rx="1" fill="#90cdf4" opacity="0.85" />
      {/* Equipment boxes */}
      <Rect x="8" y="26" width="10" height="8" rx="1" fill="#9b2c2c" />
      <Rect x="20" y="26" width="10" height="8" rx="1" fill="#9b2c2c" />
      {/* Ladder on top */}
      <Rect x="6" y="20" width="28" height="2" rx="1" fill="#fc8181" />
      <Line x1="10" y1="20" x2="10" y2="22" stroke="#e53e3e" strokeWidth="1.5" />
      <Line x1="16" y1="20" x2="16" y2="22" stroke="#e53e3e" strokeWidth="1.5" />
      <Line x1="22" y1="20" x2="22" y2="22" stroke="#e53e3e" strokeWidth="1.5" />
      <Line x1="28" y1="20" x2="28" y2="22" stroke="#e53e3e" strokeWidth="1.5" />
      {/* Lights */}
      <Rect x="36" y="15" width="9" height="3" rx="1" fill="#fc8181" />
      {/* Wheels — large */}
      <Circle cx="12" cy="39" r="6" fill="#1a202c" />
      <Circle cx="12" cy="39" r="2.5" fill="#718096" />
      <Circle cx="38" cy="39" r="6" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2.5" fill="#718096" />
      {/* Headlight */}
      <Rect x="44" y="23" width="3" height="5" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 21. gokart-lime — Lime Go-Kart
// ---------------------------------------------------------------------------
function GokartLime({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Very flat chassis */}
      <Rect x="8" y="30" width="36" height="6" rx="2" fill="#84cc16" />
      {/* Seat */}
      <Rect x="18" y="24" width="10" height="8" rx="2" fill="#65a30d" />
      {/* Steering wheel */}
      <Circle cx="32" cy="27" r="4" fill="none" stroke="#4d7c0f" strokeWidth="1.5" />
      <Line x1="32" y1="23" x2="32" y2="31" stroke="#4d7c0f" strokeWidth="1" />
      <Line x1="28" y1="27" x2="36" y2="27" stroke="#4d7c0f" strokeWidth="1" />
      {/* Bumper front */}
      <Path d="M42 28 L46 30 L46 34 L42 34 Z" fill="#4d7c0f" />
      {/* Bumper rear */}
      <Path d="M10 28 L6 30 L6 34 L10 34 Z" fill="#4d7c0f" />
      {/* Number */}
      <Rect x="22" y="26" width="6" height="5" rx="0.5" fill="#1a2e05" />
      {/* Small wheels */}
      <Circle cx="11" cy="38" r="4.5" fill="#1a202c" />
      <Circle cx="11" cy="38" r="2" fill="#a3e635" />
      <Circle cx="40" cy="38" r="4.5" fill="#1a202c" />
      <Circle cx="40" cy="38" r="2" fill="#a3e635" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 22. minivan-indigo — Indigo Minivan
// ---------------------------------------------------------------------------
function MinivanIndigo({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Tall roomy body */}
      <Rect x="6" y="17" width="40" height="22" rx="3" fill="#5a67d8" />
      {/* Front section */}
      <Rect x="33" y="17" width="13" height="22" rx="2" fill="#4c51bf" />
      {/* Front window */}
      <Rect x="35" y="19" width="9" height="11" rx="1" fill="#c3dafe" opacity="0.85" />
      {/* Side windows row */}
      <Rect x="9" y="19" width="8" height="9" rx="1" fill="#c3dafe" opacity="0.85" />
      <Rect x="19" y="19" width="8" height="9" rx="1" fill="#c3dafe" opacity="0.85" />
      {/* Sliding door line */}
      <Line x1="29" y1="17" x2="29" y2="39" stroke="#4c51bf" strokeWidth="1" />
      {/* Roof rack */}
      <Line x1="8" y1="17" x2="33" y2="17" stroke="#818cf8" strokeWidth="1.5" />
      {/* Wheels */}
      <Circle cx="14" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="14" cy="39" r="2.5" fill="#818cf8" />
      <Circle cx="38" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2.5" fill="#818cf8" />
      {/* Headlight */}
      <Rect x="43" y="22" width="3" height="5" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 23. scooter-rose — Rose Scooter
// ---------------------------------------------------------------------------
function ScooterRose({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Body / fairings */}
      <Path d="M18 30 Q22 20 30 20 Q38 20 38 28 L32 30 Z" fill="#f43f5e" />
      {/* Step-through frame */}
      <Path d="M18 30 L16 34 L24 34 L26 30 Z" fill="#e11d48" />
      {/* Front fork */}
      <Line x1="36" y1="26" x2="38" y2="36" stroke="#be123c" strokeWidth="2.5" strokeLinecap="round" />
      {/* Handlebars */}
      <Line x1="33" y1="22" x2="40" y2="20" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" />
      {/* Seat */}
      <Ellipse cx="22" cy="28" rx="6" ry="2.5" fill="#9f1239" />
      {/* Front basket */}
      <Rect x="37" y="22" width="5" height="4" rx="1" fill="#be123c" />
      {/* Wheels */}
      <Circle cx="16" cy="38" r="6" fill="none" stroke="#f43f5e" strokeWidth="2.5" />
      <Circle cx="16" cy="38" r="2" fill="#fb7185" />
      <Circle cx="38" cy="38" r="6" fill="none" stroke="#f43f5e" strokeWidth="2.5" />
      <Circle cx="38" cy="38" r="2" fill="#fb7185" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 24. icecream-cyan — Cyan Ice Cream Truck
// ---------------------------------------------------------------------------
function IcecreamCyan({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Body */}
      <Rect x="6" y="20" width="40" height="19" rx="3" fill="#06b6d4" />
      {/* Cab */}
      <Rect x="33" y="20" width="13" height="19" rx="2" fill="#0891b2" />
      {/* Cab window */}
      <Rect x="35" y="22" width="9" height="10" rx="1" fill="#cffafe" opacity="0.85" />
      {/* Service window */}
      <Rect x="9" y="22" width="16" height="10" rx="2" fill="#0e7490" />
      <Rect x="10" y="23" width="14" height="8" rx="1" fill="#cffafe" opacity="0.7" />
      {/* Ice cream swirl on top */}
      <Path d="M18 14 Q20 10 22 14 Q24 10 26 14 Q28 10 30 14" stroke="#fde68a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <Rect x="23" y="13" width="2" height="7" rx="0.5" fill="#fde68a" />
      {/* Stripes */}
      <Rect x="6" y="30" width="40" height="3" fill="#0e7490" />
      {/* Wheels */}
      <Circle cx="13" cy="39" r="5" fill="#1a202c" />
      <Circle cx="13" cy="39" r="2" fill="#67e8f9" />
      <Circle cx="37" cy="39" r="5" fill="#1a202c" />
      <Circle cx="37" cy="39" r="2" fill="#67e8f9" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 25. limo-magenta — Magenta Limousine
// ---------------------------------------------------------------------------
function LimoMagenta({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Very long body */}
      <Rect x="4" y="28" width="44" height="12" rx="3" fill="#d946ef" />
      {/* Roof — long and low */}
      <Path d="M9 28 L12 21 L42 21 L44 28 Z" fill="#a21caf" />
      {/* Many windows */}
      <Rect x="13" y="22" width="5" height="6" rx="0.5" fill="#fdf4ff" opacity="0.8" />
      <Rect x="20" y="22" width="5" height="6" rx="0.5" fill="#fdf4ff" opacity="0.8" />
      <Rect x="27" y="22" width="5" height="6" rx="0.5" fill="#fdf4ff" opacity="0.8" />
      <Rect x="34" y="22" width="7" height="6" rx="0.5" fill="#fdf4ff" opacity="0.8" />
      {/* Door */}
      <Line x1="19" y1="28" x2="19" y2="40" stroke="#a21caf" strokeWidth="0.8" />
      <Line x1="26" y1="28" x2="26" y2="40" stroke="#a21caf" strokeWidth="0.8" />
      <Line x1="33" y1="28" x2="33" y2="40" stroke="#a21caf" strokeWidth="0.8" />
      {/* Wheels */}
      <Circle cx="11" cy="40" r="5" fill="#1a202c" />
      <Circle cx="11" cy="40" r="2" fill="#e879f9" />
      <Circle cx="25" cy="40" r="5" fill="#1a202c" />
      <Circle cx="25" cy="40" r="2" fill="#e879f9" />
      <Circle cx="40" cy="40" r="5" fill="#1a202c" />
      <Circle cx="40" cy="40" r="2" fill="#e879f9" />
      {/* Headlight */}
      <Rect x="44" y="30" width="3" height="4" rx="1" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 26. military-olive — Olive Military Jeep
// ---------------------------------------------------------------------------
function MilitaryOlive({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Boxy body */}
      <Rect x="8" y="22" width="36" height="17" rx="2" fill="#556b2f" />
      {/* Open cab / windscreen frame */}
      <Rect x="26" y="22" width="16" height="11" rx="1" fill="#6b8e23" />
      <Rect x="28" y="24" width="12" height="8" rx="1" fill="#bee3f8" opacity="0.6" />
      {/* Hood */}
      <Rect x="38" y="22" width="8" height="17" rx="2" fill="#4a5e28" />
      {/* Grille lines */}
      <Line x1="39" y1="24" x2="39" y2="37" stroke="#556b2f" strokeWidth="1" />
      <Line x1="41" y1="24" x2="41" y2="37" stroke="#556b2f" strokeWidth="1" />
      <Line x1="43" y1="24" x2="43" y2="37" stroke="#556b2f" strokeWidth="1" />
      {/* Jerry can */}
      <Rect x="8" y="24" width="5" height="8" rx="1" fill="#4a5e28" />
      {/* Star */}
      <Path d="M23 27 L24 24 L25 27 L28 27 L26 29 L27 32 L24 30 L21 32 L22 29 L20 27 Z" fill="#f6e05e" />
      {/* Big off-road wheels */}
      <Circle cx="14" cy="39" r="6" fill="#1a202c" />
      <Circle cx="14" cy="39" r="3" fill="#4a5568" />
      <Circle cx="38" cy="39" r="6" fill="#1a202c" />
      <Circle cx="38" cy="39" r="3" fill="#4a5568" />
      {/* Headlight */}
      <Circle cx="44" cy="26" r="2.5" fill="#fefcbf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 27. beetle-coral — Coral VW Beetle
// ---------------------------------------------------------------------------
function BeetleCoral({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Classic rounded body */}
      <Path d="M8 35 Q8 24 20 20 Q26 18 32 20 Q44 24 44 35 Z" fill="#ff7f6e" />
      {/* Underbody */}
      <Rect x="8" y="33" width="36" height="5" rx="2" fill="#e8604c" />
      {/* Large windscreen */}
      <Path d="M19 29 Q20 21 26 20 Q32 21 33 29 Z" fill="#bee3f8" opacity="0.85" />
      {/* Rear window */}
      <Path d="M14 29 Q15 23 19 22 L19 29 Z" fill="#bee3f8" opacity="0.6" />
      {/* Headlight round */}
      <Circle cx="40" cy="28" r="3" fill="#fefcbf" />
      <Circle cx="40" cy="28" r="1.5" fill="#f6e05e" />
      {/* Tail light round */}
      <Circle cx="12" cy="28" r="2.5" fill="#fc8181" />
      {/* Bumper */}
      <Rect x="7" y="33" width="5" height="3" rx="1" fill="#e2e8f0" />
      <Rect x="40" y="33" width="5" height="3" rx="1" fill="#e2e8f0" />
      {/* Wheels */}
      <Circle cx="15" cy="38" r="5.5" fill="#1a202c" />
      <Circle cx="15" cy="38" r="2.5" fill="#fc8181" />
      <Circle cx="37" cy="38" r="5.5" fill="#1a202c" />
      <Circle cx="37" cy="38" r="2.5" fill="#fc8181" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 28. camper-turquoise — Turquoise Camper Van
// ---------------------------------------------------------------------------
function CamperTurquoise({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* VW Bus style box */}
      <Rect x="7" y="16" width="38" height="23" rx="4" fill="#0d9488" />
      {/* Two-tone split */}
      <Rect x="7" y="28" width="38" height="11" rx="3" fill="#0f766e" />
      {/* Front windows — wide */}
      <Rect x="28" y="19" width="14" height="10" rx="1.5" fill="#99f6e4" opacity="0.85" />
      {/* VW circle */}
      <Circle cx="22" cy="23" r="7" fill="#134e4a" />
      <Circle cx="22" cy="23" r="5" fill="none" stroke="#2dd4bf" strokeWidth="1" />
      {/* VW logo simplified */}
      <Path d="M19 21 L22 27 L25 21" stroke="#2dd4bf" strokeWidth="1" fill="none" />
      <Line x1="18" y1="22" x2="26" y2="22" stroke="#2dd4bf" strokeWidth="1" />
      {/* Side porthole window */}
      <Circle cx="14" cy="24" r="4" fill="#134e4a" />
      <Circle cx="14" cy="24" r="2.5" fill="#99f6e4" opacity="0.7" />
      {/* Roof pop-top */}
      <Rect x="12" y="12" width="24" height="5" rx="2" fill="#0d9488" />
      {/* Wheels */}
      <Circle cx="14" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="14" cy="39" r="2.5" fill="#2dd4bf" />
      <Circle cx="38" cy="39" r="5.5" fill="#1a202c" />
      <Circle cx="38" cy="39" r="2.5" fill="#2dd4bf" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 29. classic-maroon — Maroon Classic Car
// ---------------------------------------------------------------------------
function ClassicMaroon({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Long running boards */}
      <Rect x="5" y="35" width="42" height="4" rx="1" fill="#6b2737" />
      {/* Body */}
      <Rect x="8" y="28" width="36" height="9" rx="2" fill="#9b2c45" />
      {/* Separate boot */}
      <Path d="M5 33 L5 28 L8 28 L8 37 L5 37 Z" fill="#7b2235" />
      {/* Engine hood — long */}
      <Path d="M36 28 L36 24 L46 26 L46 35 L36 35 Z" fill="#7b2235" />
      {/* Roof */}
      <Path d="M12 28 L15 20 L32 20 L35 28 Z" fill="#7b2235" />
      {/* Windscreen */}
      <Path d="M26 28 L27 21 L32 21 L34 28 Z" fill="#fef3c7" opacity="0.75" />
      {/* Rear window */}
      <Path d="M15 28 L17 21 L26 21 L26 28 Z" fill="#fef3c7" opacity="0.75" />
      {/* Running board chrome */}
      <Line x1="5" y1="36" x2="47" y2="36" stroke="#d69e2e" strokeWidth="0.8" />
      {/* Chrome headlight round */}
      <Circle cx="44" cy="30" r="3" fill="#e2e8f0" />
      <Circle cx="44" cy="30" r="2" fill="#fefcbf" />
      {/* Large spoke wheels */}
      <Circle cx="14" cy="38" r="6" fill="#1a202c" />
      <Circle cx="14" cy="38" r="3.5" fill="none" stroke="#9b2c45" strokeWidth="1.5" />
      <Circle cx="14" cy="38" r="1.5" fill="#718096" />
      <Circle cx="38" cy="38" r="6" fill="#1a202c" />
      <Circle cx="38" cy="38" r="3.5" fill="none" stroke="#9b2c45" strokeWidth="1.5" />
      <Circle cx="38" cy="38" r="1.5" fill="#718096" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// 30. tesla-electric — Electric Blue Tesla
// ---------------------------------------------------------------------------
function TeslaElectric({ size }: { size: number }) {
  return (
    <AvatarBase size={size}>
      {/* Sleek aerodynamic body */}
      <Path d="M6 32 L12 25 L38 24 L46 28 L46 37 L6 37 Z" fill="#1d4ed8" />
      {/* Smooth sloping roof */}
      <Path d="M16 28 L20 20 L37 20 L41 27 Z" fill="#1e40af" />
      {/* Panoramic windscreen */}
      <Path d="M26 28 L27 21 L37 21 L40 27 Z" fill="#bfdbfe" opacity="0.9" />
      {/* Rear window */}
      <Path d="M16 28 L20 21 L26 21 L26 28 Z" fill="#bfdbfe" opacity="0.9" />
      {/* No grille — smooth nose */}
      <Path d="M44 28 L46 30 L46 34 L44 35 Z" fill="#1e3a8a" />
      {/* T logo */}
      <Rect x="24" y="17" width="4" height="3" rx="0.5" fill="#93c5fd" />
      <Rect x="24.5" y="19" width="3" height="2" rx="0.5" fill="#93c5fd" />
      <Rect x="25.5" y="17" width="1" height="5" rx="0.5" fill="#93c5fd" />
      {/* LED headlight strip */}
      <Rect x="43" y="29" width="3" height="1.5" rx="0.5" fill="#93c5fd" />
      {/* LED tail strip */}
      <Rect x="6" y="30" width="3" height="1.5" rx="0.5" fill="#ef4444" />
      {/* Charge port */}
      <Rect x="6" y="33" width="3" height="2.5" rx="0.5" fill="#3b82f6" />
      {/* Aero wheels */}
      <Circle cx="14" cy="37" r="5.5" fill="#1a202c" />
      <Circle cx="14" cy="37" r="3" fill="#1d4ed8" />
      <Circle cx="14" cy="37" r="1.5" fill="#93c5fd" />
      <Circle cx="38" cy="37" r="5.5" fill="#1a202c" />
      <Circle cx="38" cy="37" r="3" fill="#1d4ed8" />
      <Circle cx="38" cy="37" r="1.5" fill="#93c5fd" />
    </AvatarBase>
  );
}

// ---------------------------------------------------------------------------
// AVATARS registry
// ---------------------------------------------------------------------------

export interface AvatarDef {
  id: string;
  label: string;
  component: React.FC<{ size: number }>;
}

export const AVATARS: AvatarDef[] = [
  { id: "sedan-red", label: "Red Sedan", component: SedanRed },
  { id: "suv-blue", label: "Blue SUV", component: SuvBlue },
  { id: "taxi-yellow", label: "Yellow Taxi", component: TaxiYellow },
  { id: "hatchback-green", label: "Green Hatchback", component: HatchbackGreen },
  { id: "sports-orange", label: "Orange Sports Car", component: SportsOrange },
  { id: "muscle-purple", label: "Purple Muscle Car", component: MusclePurple },
  { id: "convertible-pink", label: "Pink Convertible", component: ConvertiblePink },
  { id: "van-white", label: "White Delivery Van", component: VanWhite },
  { id: "pickup-black", label: "Black Pickup Truck", component: PickupBlack },
  { id: "motorcycle-silver", label: "Silver Motorcycle", component: MotorcycleSilver },
  { id: "bus-red", label: "Red Double Decker Bus", component: BusRed },
  { id: "racer-blue", label: "Blue Racing Car", component: RacerBlue },
  { id: "schoolbus-yellow", label: "Yellow School Bus", component: SchoolbusYellow },
  { id: "electric-green", label: "Green Electric Car", component: ElectricGreen },
  { id: "monster-orange", label: "Orange Monster Truck", component: MonsterOrange },
  { id: "f1-teal", label: "Teal F1 Car", component: F1Teal },
  { id: "luxury-gold", label: "Gold Luxury Car", component: LuxuryGold },
  { id: "jeep-brown", label: "Brown Jeep", component: JeepBrown },
  { id: "ambulance-navy", label: "Navy Ambulance", component: AmbulanceNavy },
  { id: "firetruck-red", label: "Red Fire Truck", component: FiretruckRed },
  { id: "gokart-lime", label: "Lime Go-Kart", component: GokartLime },
  { id: "minivan-indigo", label: "Indigo Minivan", component: MinivanIndigo },
  { id: "scooter-rose", label: "Rose Scooter", component: ScooterRose },
  { id: "icecream-cyan", label: "Cyan Ice Cream Truck", component: IcecreamCyan },
  { id: "limo-magenta", label: "Magenta Limousine", component: LimoMagenta },
  { id: "military-olive", label: "Olive Military Jeep", component: MilitaryOlive },
  { id: "beetle-coral", label: "Coral VW Beetle", component: BeetleCoral },
  { id: "camper-turquoise", label: "Turquoise Camper Van", component: CamperTurquoise },
  { id: "classic-maroon", label: "Maroon Classic Car", component: ClassicMaroon },
  { id: "tesla-electric", label: "Electric Blue Tesla", component: TeslaElectric },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find an avatar definition by its ID string.
 * Returns undefined if no match found.
 *
 * Usage:
 *   const avatar = getAvatarById("sedan-red");
 *   if (avatar) { ... }
 */
export function getAvatarById(id: string): AvatarDef | undefined {
  return AVATARS.find((a) => a.id === id);
}

// ---------------------------------------------------------------------------
// AvatarIcon — primary render component
// ---------------------------------------------------------------------------

interface AvatarIconProps {
  /** The avatar ID string, e.g. "sedan-red" */
  avatarId: string;
  /** Rendered size in dp — looks good at 30 (map marker) and 52 (profile) */
  size: number;
}

/**
 * Renders the vehicle avatar SVG for a given avatarId.
 * Falls back to SedanRed if the ID is not found.
 *
 * Usage:
 *   <AvatarIcon avatarId="taxi-yellow" size={52} />
 *   <AvatarIcon avatarId={user.avatarId ?? "sedan-red"} size={30} />
 */
export function AvatarIcon({ avatarId, size }: AvatarIconProps) {
  const avatar = getAvatarById(avatarId);
  const Component = avatar?.component ?? SedanRed;
  return <Component size={size} />;
}
