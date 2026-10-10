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
  // Not listed in Customise or Settings > What You See: a card that renders
  // itself only when its own conditions hold (e.g. the odometer prompt).
  hiddenInCustomise?: boolean;
  description?: string;
  // Sections a device has never seen (new install, or a registry entry
  // added after the device last loaded prefs) default to visible: true.
  // Set this to false to opt a section out of that default instead.
  defaultVisible?: boolean;
  // Where a section added after a device saved its prefs lands on that
  // device: straight after this key if the device has it, else at the end
  // (the old behaviour). New installs use registry order regardless.
  insertAfter?: string;
}

export interface LayoutPref {
  key: string;
  visible: boolean;
  position: number;
}

// The Home dashboards had their own layouts until the Oct 2026 Home redesign.
// Rows an old install saved for them stay in the table, never read, and are
// removed by resetAllLayouts / clearOldHomeLayouts.
export type ScreenKey = "profile" | "avatar_menu";

// ── Section Registry ───────────────────────────────────────────────

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  profile: "Profile",
  avatar_menu: "Menu",
};

export const SECTION_REGISTRY: Record<ScreenKey, SectionDef[]> = {
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
    // menu_dashboard stays locked (see the GROUPS comment in
    // AvatarMenuButton.tsx): locked keeps it un-hideable and un-reorderable
    // in Customise Layout.
    { key: "menu_dashboard", label: "Dashboard", icon: "speedometer-outline", locked: true },
    { key: "menu_trips", label: "Trips", icon: "car-outline" },
    // Vehicles and Shifts added 13 Sep, once they finally had screens of their
    // own. They are the two most-used things in the app after trips (vehicles
    // 66% of users, shifts 28%) and until now neither could be navigated to:
    // vehicles existed only inside the Profile tab, shifts nowhere at all.
    { key: "menu_vehicles", label: "Vehicles", icon: "key-outline" },
    { key: "menu_shifts", label: "Shifts", icon: "time-outline" },
    { key: "menu_locations", label: "Saved Locations", icon: "location-outline" },
    { key: "menu_fuel", label: "Fuel", icon: "water-outline" },
    { key: "menu_tax", label: "Self Assessment", icon: "calculator-outline" },
    // Missed when the planner shipped (4 Oct 2026), so the menu hid it: the
    // menu only shows keys listed here.
    { key: "menu_tax_planner", label: "Tax Payment Plan", icon: "calendar-outline", insertAfter: "menu_tax" },
    { key: "menu_reconciliation", label: "Reconciliation", icon: "git-compare-outline" },
    { key: "menu_exports", label: "Tax Exports", icon: "download-outline" },
    { key: "menu_certificate", label: "Mileage Certificate", icon: "ribbon-outline", insertAfter: "menu_exports" },
    { key: "menu_accountant", label: "Accountant", icon: "people-outline" },
    { key: "menu_work_tax", label: "Tax Settings", icon: "briefcase-outline" },
    { key: "menu_mileage_relief", label: "Mileage Relief", icon: "trending-down-outline", insertAfter: "menu_work_tax" },
    { key: "menu_earnings", label: "Earnings", icon: "cash-outline" },
    { key: "menu_expenses", label: "Expenses", icon: "receipt-outline" },
    { key: "menu_bank", label: "Link Bank", icon: "business-outline" },
    { key: "menu_inbox", label: "Bank Inbox", icon: "mail-unread-outline" },
    { key: "menu_insights", label: "Insights", icon: "stats-chart-outline" },
    { key: "menu_analytics", label: "Analytics", icon: "bar-chart-outline" },
    { key: "menu_achievements", label: "Achievements", icon: "trophy-outline" },
    { key: "menu_schedule", label: "Work Schedule", icon: "time-outline" },
    { key: "menu_refer", label: "Refer a Driver", icon: "gift-outline" },
    { key: "menu_suggestions", label: "Feedback", icon: "bulb-outline" },
    { key: "menu_help", label: "Help & Tutorials", icon: "help-circle-outline" },
    { key: "menu_ticket_defender", label: "Ticket Defender", icon: "shield-checkmark-outline", insertAfter: "menu_help" },
    // EmSee, was Ask MileClear (Oct 2026). The menu only shows keys listed here; it is
    // also hidden while /assistant/status says unavailable.
    { key: "menu_ask", label: "EmSee", icon: "chatbubbles-outline", insertAfter: "menu_ticket_defender" },
    // Moved to the end of the list (was between Tax Settings and Link
    // Bank) and out of the MONEY group into MORE: 5 users have ever used
    // Invoices (0.5% of 1,093), so it no longer earns top billing next to
    // Expenses and Link Bank.
    { key: "menu_invoices", label: "Invoices", icon: "document-text-outline" },
    { key: "menu_logout", label: "Log out", icon: "log-out-outline", locked: true },
  ],
};

// ── SQLite persistence ─────────────────────────────────────────────

function defaultPrefs(screen: ScreenKey): LayoutPref[] {
  return SECTION_REGISTRY[screen].map((s, i) => ({
    key: s.key,
    // A section is visible by default unless it opts out via
    // defaultVisible: false (Today's Recap, Community Insights - 13 Sep).
    visible: s.defaultVisible ?? true,
    position: i,
  }));
}

/**
 * The index to swap with when moving `idx` one step up (-1) or down (1),
 * stepping over sections that are not listed in Customise. -1 when there is
 * nothing to swap with.
 */
export function neighbourIndex(
  screen: ScreenKey,
  prefs: readonly LayoutPref[],
  idx: number,
  dir: 1 | -1
): number {
  const hidden = new Set(
    SECTION_REGISTRY[screen].filter((s) => s.hiddenInCustomise).map((s) => s.key)
  );
  for (let i = idx + dir; i >= 0 && i < prefs.length; i += dir) {
    if (!hidden.has(prefs[i].key)) return i;
  }
  return -1;
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
  // Retired sections (e.g. work_quicknav, 7 Oct 2026) are dropped here so a
  // saved row for one never reaches the dashboard or More as a blank entry.
  const knownKeys = new Set(SECTION_REGISTRY[screen].map((sec) => sec.key));
  const result: LayoutPref[] = rows.filter((r) => knownKeys.has(r.section_key)).map((r) => ({
    key: r.section_key,
    visible: r.visible === 1,
    position: r.position,
  }));

  result.sort((a, b) => a.position - b.position);
  for (const section of SECTION_REGISTRY[screen]) {
    if (!dbKeys.has(section.key)) {
      const pref: LayoutPref = {
        key: section.key,
        // Same defaultVisible honouring as defaultPrefs() above - without
        // this, a device that already has other prefs saved would still
        // see a newly-registered defaultVisible: false section appended
        // as visible: true, silently ignoring the flag.
        visible: section.defaultVisible ?? true,
        position: result.length,
      };
      const anchor = section.insertAfter
        ? result.findIndex((p) => p.key === section.insertAfter)
        : -1;
      if (anchor >= 0) result.splice(anchor + 1, 0, pref);
      else result.push(pref);
    }
  }

  // Remove keys no longer in registry, then renumber so the positions match
  // the order (an insertAfter splice shifts everything below it).
  const registryKeys = new Set(
    SECTION_REGISTRY[screen].map((s) => s.key)
  );
  return result
    .filter((p) => registryKeys.has(p.key))
    .map((p, i) => ({ ...p, position: i }));
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

/** Delete the rows saved for the old Home dashboards; Profile and the rest are kept. */
export const OLD_HOME_SCREENS = ["dashboard_work", "dashboard_personal"] as const;
export async function resetHomeLayouts(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM layout_prefs WHERE screen IN (?, ?)", [...OLD_HOME_SCREENS]);
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
      const target = neighbourIndex(screen, prefs, idx, -1);
      if (idx <= 0 || target < 0) return;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      const updated = [...prefs];
      [updated[target], updated[idx]] = [updated[idx], updated[target]];
      const reindexed = updated.map((p, i) => ({ ...p, position: i }));
      setPrefs(reindexed);
      await savePrefs(screen, reindexed);
    },
    [prefs, screen]
  );

  const moveDown = useCallback(
    async (key: string) => {
      const idx = prefs.findIndex((p) => p.key === key);
      const target = neighbourIndex(screen, prefs, idx, 1);
      if (idx < 0 || target < 0) return;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      const updated = [...prefs];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      const reindexed = updated.map((p, i) => ({ ...p, position: i }));
      setPrefs(reindexed);
      await savePrefs(screen, reindexed);
    },
    [prefs, screen]
  );

  /**
   * Replace the entire ordering with a new key sequence (used by drag-and-drop).
   * Any keys missing from `newOrder` keep their visibility/position state but
   * are appended at the end (defensive against partial reorder calls).
   */
  const reorder = useCallback(
    async (newOrder: string[]) => {
      const byKey = new Map(prefs.map((p) => [p.key, p]));
      const seen = new Set<string>();
      const reordered: LayoutPref[] = [];
      for (const k of newOrder) {
        const pref = byKey.get(k);
        if (pref && !seen.has(k)) {
          reordered.push(pref);
          seen.add(k);
        }
      }
      // Append any prefs the caller forgot, preserving original order
      for (const pref of prefs) {
        if (!seen.has(pref.key)) reordered.push(pref);
      }
      const reindexed = reordered.map((p, i) => ({ ...p, position: i }));
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
    reorder,
    reset,
  };
}
