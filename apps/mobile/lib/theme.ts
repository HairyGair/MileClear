import { StyleSheet } from "react-native";

// ── Colors ──────────────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg: "#030712",
  surface: "#111827",
  surfaceElevated: "#0a1120",
  surfaceBorder: "#1f2937",

  // Brand
  amber: "#f5a623",
  amberDim: "rgba(245, 166, 35, 0.12)",
  amberGlow: "rgba(245, 166, 35, 0.35)",

  // Text
  text1: "#f0f2f5",
  text2: "#8494a7",
  text3: "#4a5568",

  // Semantic
  green: "#10b981",
  greenDim: "rgba(16, 185, 129, 0.12)",
  red: "#ef4444",
  redDim: "rgba(239, 68, 68, 0.12)",
  live: "#34c759",

  // Overlays
  overlay: "rgba(0, 0, 0, 0.6)",
  subtleBorder: "rgba(255, 255, 255, 0.06)",
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
    fontSize: 10,
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
