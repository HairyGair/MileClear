// Google Maps (Android) night style for Directions (DESIGN 2.15): navy
// land, muted roads, labels readable, so the amber route stands out. Apple
// Maps uses userInterfaceStyle "dark" instead.

export const GOOGLE_NIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8494a7" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#030712" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2a3d" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c3a52" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050b16" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1f2a3d" }] },
] as const;
