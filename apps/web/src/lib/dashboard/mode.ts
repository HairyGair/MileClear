// Work / Personal view handling. `dashboardMode` comes from GET /user/profile.
// "both" lets the driver switch on Home; the choice is remembered locally.

export type DashboardMode = "work" | "personal" | "both";
export type ViewMode = "work" | "personal";

export const MODE_STORAGE_KEY = "mc_web_mode";

export function readStoredMode(): ViewMode {
  try {
    const v = window.localStorage.getItem(MODE_STORAGE_KEY);
    return v === "personal" ? "personal" : "work";
  } catch {
    return "work";
  }
}

export function storeMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Private windows can throw. The view just won't be remembered.
  }
}

/** The view actually shown: fixed for work/personal, the stored choice for both. */
export function effectiveMode(base: DashboardMode | undefined | null, stored: ViewMode): ViewMode {
  if (base === "personal") return "personal";
  if (base === "work") return "work";
  return stored;
}

/** localStorage helpers that never throw. */
export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
