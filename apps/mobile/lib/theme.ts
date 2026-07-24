import { StyleSheet } from "react-native";
import * as SQLite from "expo-sqlite";

// ── Theme selection (UI 2.0 Phase C) ────────────────────────────────
//
// The palette is chosen ONCE, synchronously, at module init - before any
// StyleSheet.create in the app freezes colors into styles. That keeps all
// ~144 consumers untouched: they keep importing `colors` as a plain
// object. Switching theme persists the pref and reloads the JS runtime
// (Updates.reloadAsync) so every module re-evaluates with the new palette.

export type ThemeName = "midnight" | "daylight";

const THEME_DB = "theme.db";

function themeDb() {
  const db = SQLite.openDatabaseSync(THEME_DB);
  db.execSync("CREATE TABLE IF NOT EXISTS pref (k TEXT PRIMARY KEY, v TEXT)");
  return db;
}

function readThemePref(): ThemeName {
  try {
    const row = themeDb().getFirstSync<{ v: string }>(
      "SELECT v FROM pref WHERE k='theme'"
    );
    return row?.v === "daylight" ? "daylight" : "midnight";
  } catch {
    return "midnight";
  }
}

/** Persist the theme choice. Takes effect on next JS load - callers
 *  should follow with Updates.reloadAsync() (or tell the user to
 *  reopen the app). */
export function setThemePref(name: ThemeName): void {
  themeDb().runSync("INSERT OR REPLACE INTO pref (k,v) VALUES ('theme',?)", [name]);
}

export const themeName: ThemeName = readThemePref();

// ── Colors ──────────────────────────────────────────────────────────

// UI System 2.0 (docs/design/ui-2.0/, adopted 24 Jul 2026). Key NAMES are
// stable — every consumer picks the new palette up from here. New tiers
// (bg1/surface2/surface3/borderStrong/faint) are additive.
const MIDNIGHT = {
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

type Palette = { [K in keyof typeof MIDNIGHT]: string };

// Daylight palette from the canvas [data-theme="light"] block, with the
// same AA discipline as midnight: canvas light text-3 (#94a0b2) is
// sub-AA on white - it lands as `faint`; text3 uses #5f6b80 (AA on both
// #ffffff and #faf8f3 at body weight).
const DAYLIGHT: Palette = {
  bg: "#ece8de",
  bg1: "#faf8f3",
  surface: "#ffffff",
  surfaceElevated: "#f3f0e8",
  surface3: "#e9e4d8",
  surfaceBorder: "rgba(15,23,42,0.1)",
  borderStrong: "rgba(15,23,42,0.18)",

  amber: "#a05e00",
  amberSolid: "#f5a623",
  amberInk: "#241700",
  amberDim: "rgba(245, 166, 35, 0.15)",
  amberLine: "rgba(245, 166, 35, 0.55)",
  amberGlow: "rgba(245, 166, 35, 0.2)",

  text1: "#0b1220",
  text2: "#5c6a82",
  text3: "#5f6b80",
  faint: "#94a0b2",

  green: "#047a52",
  greenDim: "rgba(5, 122, 85, 0.1)",
  red: "#d64545",
  redSolid: "#d64545",
  redDim: "rgba(220, 38, 38, 0.1)",
  live: "#0a7d3b",

  overlay: "rgba(15, 23, 42, 0.45)",
  subtleBorder: "rgba(15,23,42,0.08)",
};

export const colors: Palette = themeName === "daylight" ? DAYLIGHT : MIDNIGHT;

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
  control: 13,
  lg: 16,
  card: 18,
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

/** UI 2.0 display face — Sora, for hero stats and big numbers ONLY.
 *  Body copy stays Plus Jakarta Sans. Loaded in app/_layout.tsx. */
export const fontsDisplay = {
  semibold: "Sora_600SemiBold",
  bold: "Sora_700Bold",
  extrabold: "Sora_800ExtraBold",
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
  // UI 2.0 compact row card: 11px radius, tight padding - list rows
  cardCompact: {
    backgroundColor: colors.surface,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  // UI 2.0 card: 18px radius, 20px padding, hairline border
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.xl,
    marginBottom: spacing.sm,
  },
  cardElevated: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    padding: spacing.xl,
    marginBottom: spacing.sm,
  },

  // Buttons
  buttonPrimary: {
    backgroundColor: colors.amberSolid,
    borderRadius: radii.control,
    paddingVertical: 16,
    alignItems: "center" as const,
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.amberInk,
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
    backgroundColor: colors.amberSolid,
    borderColor: colors.amberSolid,
  },
  chipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  chipTextActive: {
    color: colors.amberInk,
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
    backgroundColor: colors.amberSolid,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.amberInk,
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(3, 7, 18, 0.7)",
  },
});
