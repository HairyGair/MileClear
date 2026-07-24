import { StyleSheet } from "react-native";

// ── Colors ──────────────────────────────────────────────────────────

// UI System 2.0 (docs/design/ui-2.0/, adopted 24 Jul 2026). Key NAMES are
// stable — every consumer picks the new palette up from here. New tiers
// (bg1/surface2/surface3/borderStrong/faint) are additive.
export const colors = {
  // Backgrounds — three surface tiers replace the old flat surface
  bg: "#030712",
  bg1: "#080d19",
  surface: "#0d1526",
  surfaceElevated: "#131d31",
  surface3: "#1a2540",
  surfaceBorder: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.15)",

  // Brand — amber is the bright accent (#fbbf24) for text/icons/lines;
  // amberSolid is the fill for primary buttons; amberInk is text ON amber.
  amber: "#fbbf24",
  amberSolid: "#f5a623",
  amberInk: "#1a1204",
  amberDim: "rgba(251, 191, 36, 0.12)",
  amberLine: "rgba(251, 191, 36, 0.34)",
  amberGlow: "rgba(234, 179, 8, 0.16)",

  // Text — UI 2.0 ramp, re-audited against bg (#030712) and surface
  // (#0d1526); all pass WCAG AA at body weight:
  //   text1  #f8fafc  → 15.8:1        (display + primary copy)
  //   text2  #96a2b6  → 7.2:1         (secondary copy + labels)
  //   text3  #8494a7  → 6.1:1         (tertiary copy + hints)
  // DELIBERATE DEVIATION from the canvas: its text-3 (#5f6b80) is
  // sub-AA on our backgrounds (~4.3:1) — same trap we fixed 12 May.
  // text3 stays AA; the canvas tone lives on as `faint` for DECORATIVE
  // non-text elements only (dividers, inactive glyphs).
  text1: "#f8fafc",
  text2: "#96a2b6",
  text3: "#8494a7",
  faint: "#5f6b80",

  // Semantic — emerald brightened per UI 2.0; red split into text
  // accent (red) vs solid destructive fill (redSolid).
  green: "#34d399",
  greenDim: "rgba(52, 211, 153, 0.13)",
  red: "#f87171",
  redSolid: "#ef4444",
  redDim: "rgba(239, 68, 68, 0.12)",
  live: "#34c759",

  // Overlays
  overlay: "rgba(0, 0, 0, 0.6)",
  subtleBorder: "rgba(255,255,255,0.07)",
} as const;

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
