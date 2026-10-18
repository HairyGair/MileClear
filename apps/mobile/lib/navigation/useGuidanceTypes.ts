// Types shared by the Directions hook and its pure helpers (kept apart so
// the helpers can be tested without loading React Native).

import type { NavigationErrorKind } from "../api/navigationRules";

export type PreviewError = NavigationErrorKind | "OUTSIDE_GB" | "NO_PERMISSION" | "NO_FIX";
