import { useState, useEffect, useCallback, useMemo } from "react";
import { LayoutAnimation, Platform, UIManager } from "react-native";
import { getDatabase } from "../db/index";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Types ──────────────────────────────────────────────────────────

export interface SectionDef {
  key: string;
  label: string;
  icon: string;
  locked?: boolean;
  description?: string;
}

export interface LayoutPref {
  key: string;
  visible: boolean;
  position: number;
}

export type ScreenKey =
  | "dashboard_work"
  | "dashboard_personal"
  | "profile"
  | "avatar_menu";

// ── Section Registry ───────────────────────────────────────────────

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  dashboard_work: "Work Dashboard",
  dashboard_personal: "Personal Dashboard",
  profile: "Profile",
  avatar_menu: "Menu",
};

export const SECTION_REGISTRY: Record<ScreenKey, SectionDef[]> = {
  dashboard_work: [
    {
      key: "work_hero",
      label: "Tax Deduction",
      icon: "cash-outline",
      description: "Tax year deduction summary",
    },
    {
      key: "work_cta",
      label: "Start Trip",
      icon: "navigate",
      locked: true,
    },
    {
      key: "work_shift",
      label: "Start Shift",
      icon: "play",
      locked: true,
    },
    {
      key: "work_quicknav",
      label: "Quick Actions",
      icon: "grid-outline",
      description: "Insights, Trips, Exports, Badges",
    },
    {
      key: "journey_map",
      label: "Recent Journeys",
      icon: "map-outline",
      description: "Map of your recent trips",
    },
    {
      key: "community",
      label: "Community Insights",
      icon: "people-outline",
      description: "Local driving intelligence",
    },
  ],
  dashboard_personal: [
    {
      key: "personal_summary",
      label: "Driving Summary",
      icon: "speedometer-outline",
      description: "Monthly miles, trips, fuel cost",
    },
    {
      key: "personal_cta",
      label: "Start Trip",
      icon: "navigate",
      locked: true,
    },
    {
      key: "personal_quicknav",
      label: "Quick Actions",
      icon: "grid-outline",
      description: "Insights, Trips, Fuel, Badges",
    },
    {
      key: "journey_map",
      label: "Recent Journeys",
      icon: "map-outline",
      description: "Map of your recent trips",
    },
    {
      key: "community",
      label: "Community Insights",
      icon: "people-outline",
      description: "Local driving intelligence",
    },
  ],
  profile: [
    {
      key: "profile_card",
      label: "Profile Card",
      icon: "person-outline",
      locked: true,
    },
    {
      key: "profile_actions",
      label: "Quick Actions",
      icon: "apps-outline",
      description: "Edit Profile, Export, Locations, Sync",
    },
    {
      key: "profile_settings",
      label: "Settings",
      icon: "settings-outline",
      description: "Drive detection, weekly goal",
    },
    {
      key: "profile_work_settings",
      label: "Work Settings",
      icon: "briefcase-outline",
      description: "Work type, employer rate",
    },
    {
      key: "profile_notifications",
      label: "Notifications",
      icon: "notifications-outline",
      description: "Push notification toggles",
    },
    {
      key: "profile_subscription",
      label: "Subscription",
      icon: "diamond-outline",
      description: "MileClear Pro status",
    },
    {
      key: "profile_vehicles",
      label: "My Vehicles",
      icon: "car-outline",
      description: "Vehicle list and management",
    },
    {
      key: "profile_account",
      label: "Account",
      icon: "shield-outline",
      locked: true,
      description: "Logout and delete account",
    },
  ],
  avatar_menu: [
    {
      key: "menu_dashboard",
      label: "Dashboard",
      icon: "speedometer-outline",
      locked: true,
    },
    { key: "menu_trips", label: "Trips", icon: "car-outline" },
    { key: "menu_fuel", label: "Fuel", icon: "water-outline" },
    { key: "menu_earnings", label: "Earnings", icon: "cash-outline" },
    {
      key: "menu_insights",
      label: "Insights",
      icon: "stats-chart-outline",
    },
    {
      key: "menu_exports",
      label: "Tax Exports",
      icon: "download-outline",
    },
    {
      key: "menu_suggestions",
      label: "Suggestions",
      icon: "bulb-outline",
    },
    {
      key: "menu_logout",
      label: "Log out",
      icon: "log-out-outline",
      locked: true,
    },
  ],
};

// ── SQLite persistence ─────────────────────────────────────────────

function defaultPrefs(screen: ScreenKey): LayoutPref[] {
  return SECTION_REGISTRY[screen].map((s, i) => ({
    key: s.key,
    visible: true,
    position: i,
  }));
}

async function loadPrefs(screen: ScreenKey): Promise<LayoutPref[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    section_key: string;
    visible: number;
    position: number;
  }>(
    "SELECT section_key, visible, position FROM layout_prefs WHERE screen = ? ORDER BY position ASC",
    [screen]
  );

  if (rows.length === 0) return defaultPrefs(screen);

  // Merge: if new sections were added to the registry that aren't in DB yet
  const dbKeys = new Set(rows.map((r) => r.section_key));
  const result: LayoutPref[] = rows.map((r) => ({
    key: r.section_key,
    visible: r.visible === 1,
    position: r.position,
  }));

  for (const section of SECTION_REGISTRY[screen]) {
    if (!dbKeys.has(section.key)) {
      result.push({
        key: section.key,
        visible: true,
        position: result.length,
      });
    }
  }

  // Remove keys no longer in registry
  const registryKeys = new Set(
    SECTION_REGISTRY[screen].map((s) => s.key)
  );
  return result
    .filter((p) => registryKeys.has(p.key))
    .sort((a, b) => a.position - b.position);
}

async function savePrefs(
  screen: ScreenKey,
  prefs: LayoutPref[]
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM layout_prefs WHERE screen = ?", [screen]);
  for (const pref of prefs) {
    await db.runAsync(
      "INSERT INTO layout_prefs (screen, section_key, visible, position) VALUES (?, ?, ?, ?)",
      [screen, pref.key, pref.visible ? 1 : 0, pref.position]
    );
  }
}

export async function resetAllLayouts(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM layout_prefs");
}

// ── Hook ───────────────────────────────────────────────────────────

export function useLayoutPrefs(screen: ScreenKey) {
  const [prefs, setPrefs] = useState<LayoutPref[]>(() =>
    defaultPrefs(screen)
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPrefs(screen).then((p) => {
      if (!cancelled) {
        setPrefs(p);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [screen]);

  const isVisible = useCallback(
    (key: string): boolean => {
      const pref = prefs.find((p) => p.key === key);
      return pref ? pref.visible : true;
    },
    [prefs]
  );

  const visibleKeys = useMemo(
    () => prefs.filter((p) => p.visible).map((p) => p.key),
    [prefs]
  );

  const toggleVisibility = useCallback(
    async (key: string) => {
      const section = SECTION_REGISTRY[screen].find((s) => s.key === key);
      if (section?.locked) return;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      const updated = prefs.map((p) =>
        p.key === key ? { ...p, visible: !p.visible } : p
      );
      setPrefs(updated);
      await savePrefs(screen, updated);
    },
    [prefs, screen]
  );

  const moveUp = useCallback(
    async (key: string) => {
      const idx = prefs.findIndex((p) => p.key === key);
      if (idx <= 0) return;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      const updated = [...prefs];
      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      const reindexed = updated.map((p, i) => ({ ...p, position: i }));
      setPrefs(reindexed);
      await savePrefs(screen, reindexed);
    },
    [prefs, screen]
  );

  const moveDown = useCallback(
    async (key: string) => {
      const idx = prefs.findIndex((p) => p.key === key);
      if (idx < 0 || idx >= prefs.length - 1) return;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      const updated = [...prefs];
      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
      const reindexed = updated.map((p, i) => ({ ...p, position: i }));
      setPrefs(reindexed);
      await savePrefs(screen, reindexed);
    },
    [prefs, screen]
  );

  const reset = useCallback(async () => {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM layout_prefs WHERE screen = ?", [screen]);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPrefs(defaultPrefs(screen));
  }, [screen]);

  return {
    prefs,
    loaded,
    isVisible,
    visibleKeys,
    toggleVisibility,
    moveUp,
    moveDown,
    reset,
  };
}
