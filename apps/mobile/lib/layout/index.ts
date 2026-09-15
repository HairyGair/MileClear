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
  // Sections a device has never seen (new install, or a registry entry
  // added after the device last loaded prefs) default to visible: true.
  // Set this to false to opt a section out of that default instead.
  defaultVisible?: boolean;
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
    // Top: emotional summary + primary action
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
    // Tax Readiness moved up to position 3 — the most useful piece of
    // information on the dashboard (estimated tax owed + weekly set-aside)
    // was previously buried below Daily Recap and Business Mileage.
    // Tax-anxious users now see "what HMRC will want" right after the
    // hero (Anthony 16 May audit).
    {
      key: "tax_readiness",
      label: "Tax Readiness",
      icon: "shield-checkmark-outline",
      description: "HMRC estimate, weekly set-aside, filing deadline countdown",
    },
    // Summary cards (today / year / week)
    // Default-hidden: shows three zeroes to anyone who hasn't driven yet
    // today, on the same dashboard as Business Mileage below it. Still
    // reachable via Settings > What You See (13 Sep reorder).
    {
      key: "daily_recap",
      label: "Today's Recap",
      icon: "today-outline",
      description: "Daily driving summary card",
      defaultVisible: false,
    },
    {
      key: "business_mileage",
      label: "Business Mileage",
      icon: "speedometer-outline",
      description: "Business miles by month, with prev/next navigation to past months",
    },
    // Straight below the mileage (15 Sep). Only 152 of 626 active drivers
    // ever pressed Start Shift; the card offers a run of recent trips as a
    // shift and grades it in one tap. Renders nothing when there is nothing
    // to offer.
    {
      key: "shift_suggestion",
      label: "Shift Suggestions",
      icon: "time-outline",
      description: "Recent trips that look like a shift, ready to grade",
    },
    {
      key: "weekly_goal",
      label: "Weekly Goal",
      icon: "flag-outline",
      description: "Progress towards your weekly earnings target",
    },
    // Utility nav
    {
      key: "work_quicknav",
      label: "Quick Actions",
      icon: "grid-outline",
      description: "Insights, Trips, Exports, Badges",
    },
    {
      key: "work_shift",
      label: "Start Shift",
      icon: "play",
      locked: true,
    },
    // Detail / exploration
    {
      key: "journey_map",
      label: "Recent Journeys",
      icon: "map-outline",
      description: "Map of your recent trips",
    },
    {
      key: "activity_heatmap",
      label: "Activity Heatmap",
      icon: "grid-outline",
      description: "When you drive and earn most, by hour and platform",
    },
    {
      key: "benchmark",
      label: "How You Compare",
      icon: "people-outline",
      description: "Anonymous benchmarks vs other UK drivers",
    },
    {
      key: "work_calendar",
      label: "Working Calendar",
      icon: "calendar-outline",
      description: "Monthly heatmap of your driving activity",
    },
    // Default-hidden: low-signal at the bottom of an 11-card dashboard
    // (13 Sep reorder). Still reachable via Settings > What You See.
    {
      key: "community",
      label: "Community Insights",
      icon: "people-outline",
      description: "Local driving intelligence",
      defaultVisible: false,
    },
  ],
  dashboard_personal: [
    {
      key: "personal_cta",
      label: "Start Trip & Quick Actions",
      icon: "navigate",
      locked: true,
    },
    // Month first, today second (14 Sep). The summary card below leads on
    // today, which reads 0.0 first thing every morning, so with it on top the
    // dashboard opened as a card of zeros while the month's real numbers sat
    // underneath.
    {
      key: "monthly_history",
      label: "Monthly History",
      icon: "calendar-outline",
      description: "Mileage by month with prev/next chevrons - navigate back to past months",
    },
    {
      key: "personal_summary",
      label: "Driving Summary",
      icon: "speedometer-outline",
      description: "Today's miles and trips, plus this week and fuel cost",
    },
    // Default-hidden: it repeats figures the two cards above already carry,
    // and it shows zeroes to anyone who hasn't driven yet today (13 Sep).
    // The duplicate month miles and trip count it originally also called out
    // were removed from Driving Summary itself on 14 Sep.
    {
      key: "daily_recap",
      label: "Today's Recap",
      icon: "today-outline",
      description: "Daily driving summary card",
      defaultVisible: false,
    },
    {
      key: "milestone",
      label: "Mileage Milestone",
      icon: "flag-outline",
      description: "Progress to your next milestone",
    },
    {
      key: "driving_patterns",
      label: "Driving Patterns",
      icon: "bar-chart-outline",
      description: "When and where you drive most",
    },
    {
      key: "journey_map",
      label: "Recent Journeys",
      icon: "map-outline",
      description: "Map of your recent trips",
    },
    // Default-hidden: low-signal at the bottom of the dashboard, same as
    // the work dashboard's copy of this card (13 Sep reorder). Still
    // reachable via Settings > What You See.
    {
      key: "community",
      label: "Community Insights",
      icon: "people-outline",
      description: "Local driving intelligence",
      defaultVisible: false,
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
    // menu_dashboard stays locked (see the GROUPS comment in
    // AvatarMenuButton.tsx): locked keeps it un-hideable and un-reorderable
    // in Customize Layout.
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
    { key: "menu_reconciliation", label: "Reconciliation", icon: "git-compare-outline" },
    { key: "menu_exports", label: "Tax Exports", icon: "download-outline" },
    { key: "menu_accountant", label: "Accountant", icon: "people-outline" },
    { key: "menu_work_tax", label: "Tax Settings", icon: "briefcase-outline" },
    { key: "menu_earnings", label: "Earnings", icon: "cash-outline" },
    { key: "menu_expenses", label: "Expenses", icon: "receipt-outline" },
    { key: "menu_bank", label: "Link Bank", icon: "business-outline" },
    { key: "menu_inbox", label: "Bank Inbox", icon: "mail-unread-outline" },
    { key: "menu_insights", label: "Insights", icon: "stats-chart-outline" },
    { key: "menu_analytics", label: "Analytics", icon: "bar-chart-outline" },
    { key: "menu_achievements", label: "Achievements", icon: "trophy-outline" },
    { key: "menu_schedule", label: "Work Schedule", icon: "time-outline" },
    { key: "menu_refer", label: "Refer a Driver", icon: "gift-outline" },
    { key: "menu_suggestions", label: "Suggestions", icon: "bulb-outline" },
    { key: "menu_help", label: "Help & Tutorials", icon: "help-circle-outline" },
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
        // Same defaultVisible honouring as defaultPrefs() above - without
        // this, a device that already has other prefs saved would still
        // see a newly-registered defaultVisible: false section appended
        // as visible: true, silently ignoring the flag.
        visible: section.defaultVisible ?? true,
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
