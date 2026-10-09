import { StyleSheet } from "react-native";

// ── Colors ──────────────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg: "#030712",
  surface: "#0a1120",
  surfaceElevated: "#0a1120",
  surfaceBorder: "rgba(255,255,255,0.06)",

  // Brand
  amber: "#f5a623",
  amberDim: "rgba(245, 166, 35, 0.12)",
  amberGlow: "rgba(245, 166, 35, 0.35)",

  // Text — contrast-audited 12 May 2026 against bg (#030712) and
  // surface (#0a1120). All three pass WCAG AA at body-text weight:
  //   text1  #f0f2f5  → 15.4:1 / 14.4:1   (display + primary copy)
  //   text2  #8494a7  → 6.1:1  / 5.7:1    (secondary copy + labels)
  //   text3  #94a3b8  → 8.3:1  / 7.8:1    (tertiary copy + hints)
  // The previous text3 (#64748b) measured 4.23:1 on bg, sub-AA. Used
  // in 276 sites — bumped to #94a3b8 for a single-line fix.
  text1: "#f0f2f5",
  text2: "#8494a7",
  text3: "#94a3b8",

  // Semantic
  green: "#10b981",
  greenDim: "rgba(16, 185, 129, 0.12)",
  red: "#ef4444",
  redDim: "rgba(239, 68, 68, 0.12)",
  live: "#34c759",

  // Overlays
  overlay: "rgba(0, 0, 0, 0.6)",
  subtleBorder: "rgba(255, 255, 255, 0.06)",
  // Tab bar top edge and strip dividers; survives a 0.33pt hairline.
  hairline: "rgba(255,255,255,0.08)",

  // Personal classification (the trips list slate), and the border that
  // marks it selected so "selected" never rests on fill alone.
  personal: "#374151",
  personalEdge: "#94a3b8",
} as const;

// Recent Journeys route colours, newest first. Five, never cycled; older
// trips use mapOlder. Picked to stay apart under colour blindness.
export const mapPalette = ["#f5a623", "#a78bfa", "#2fbf9a", "#ff7a59", "#e2e8f0"] as const;
export const mapOlder = "#64748b";

export const tabBar = { contentHeight: 56, icon: 24, label: 12 } as const;

// ── Insights redesign (docs/insights-oct2026/SPEC-VISUAL.md section 3) ──
// Charts use solid hexes pre-blended on surface so bars never stack
// translucency and screenshots match the device.
export const chart = {
  current: "#f5a623", // = colors.amber. This week / this month.
  past: "#8b6322", // amber 55% on surface. 3.5:1 on surface.
  comparison: "#5d697b", // "Last week" ghost bar, personal segment. 3.4:1.
  track: "#191f2d", // empty bar stub, medal rims.
  trackOnHero: "#2c2e35", // dial unlit ticks on heroCard.tint.
  heat: ["#191f2d", "#342c21", "#684d21", "#a37222", "#f5a623"], // levels 0..4
  barRadius: 6,
  barMaxHeight: 96,
} as const;

export const heroCard = {
  tint: "#181a20", // amber 6% on surface.
  border: "rgba(245,166,35,0.35)", // = colors.amberGlow
  radius: 20,
} as const;

// Numbers on Insights only; deliberately off the fontSizes scale.
export const numberSizes = { hero: 44, stat: 28, small: 18 } as const;

export const motion = { quick: 180, settle: 420, celebrate: 700, stagger: 40 } as const;

// ── Spacing ─────────────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ── Radii ───────────────────────────────────────────────────────────

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 20,
  sheet: 20,
} as const;

// ── Typography ──────────────────────────────────────────────────────

export const fonts = {
  light: "PlusJakartaSans_300Light",
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
} as const;

/**
 * 6-step type scale. Existing screens use 15 distinct font sizes —
 * any new code should pick from this scale. Migration of existing
 * sites is intentionally not bundled into a single sweep (touches
 * ~200 sites, unsafe without visual testing). New surfaces should
 * reference these tokens; old surfaces can be migrated screen-by-
 * screen as they get touched.
 *
 *   caption  12pt  — micro-labels, footnotes (12pt minimum for AA)
 *   body     14pt  — secondary copy + form labels
 *   bodyLg   16pt  — primary readable copy, button text
 *   title    18pt  — card titles, screen sub-headers
 *   heading  22pt  — screen headers
 *   display  28pt  — hero stat values, modal headlines
 */
export const fontSizes = {
  caption: 12,
  body: 14,
  bodyLg: 16,
  title: 18,
  heading: 22,
  display: 28,
} as const;

/**
 * Caps for the iOS Dynamic Type / Larger Text accessibility setting.
 * Pass on every `<Text>` so user-scaled text doesn't overflow fixed-
 * size containers (hero stat cards, badges, Live Activity views).
 *
 *   display    1.3  — large numbers must not break their card
 *   heading    1.4  — section headers can grow but not double
 *   body       1.6  — readable copy scales most freely
 *   none       1.0  — never scale (badges, micro-icons text)
 */
export const fontScaleCap = {
  display: 1.3,
  heading: 1.4,
  body: 1.6,
  none: 1,
} as const;

// ── Shared Styles ───────────────────────────────────────────────────

export const shared = StyleSheet.create({
  // Containers
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    padding: spacing.lg,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardElevated: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },

  // Buttons
  buttonPrimary: {
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center" as const,
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 16,
    alignItems: "center" as const,
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  buttonDestructive: {
    backgroundColor: colors.redDim,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center" as const,
  },
  buttonDestructiveText: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.red,
  },

  // Inputs
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text1,
  },
  inputFocused: {
    borderColor: colors.amberGlow,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text2,
    marginBottom: spacing.sm,
  },

  // Filter chips
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chipActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  chipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  chipTextActive: {
    color: colors.bg,
  },

  // Section headings
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text1,
    marginBottom: spacing.md,
  },

  // Badges
  proBadge: {
    backgroundColor: colors.amber,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.bg,
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(3, 7, 18, 0.7)",
  },
});
