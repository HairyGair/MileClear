// The admin area's navigation, in one place. The sidebar, the mobile drawer
// and the breadcrumb all read this list, so adding a page is one entry here
// (see STYLEGUIDE.md, "Adding a nav item").
//
// Every URL the admin area has ever had still resolves: an item's `children`
// are real pages shown indented under it, and `aliases` are extra paths that
// should light the item up without getting their own line.

import type { AdminIconName } from "./icons";

export interface AdminNavChild {
  label: string;
  href: string;
}

export interface AdminNavItem {
  label: string;
  href: string;
  icon: AdminIconName;
  /** Short line shown under the label in the drawer and as a tooltip. */
  hint?: string;
  /** Sub-pages, listed under the item in the sidebar. */
  children?: AdminNavChild[];
  /** Other paths that belong to this item but are not listed. */
  aliases?: string[];
  /** Small marker for something new. */
  isNew?: boolean;
}

export interface AdminNavGroup {
  label: string | null;
  items: AdminNavItem[];
}

export const ADMIN_ROOT = "/dashboard/admin";

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: null,
    items: [{ label: "Overview", href: ADMIN_ROOT, icon: "overview", hint: "The whole fleet at a glance" }],
  },
  {
    label: "Growth",
    items: [
      {
        label: "Sign-ups & geography",
        href: `${ADMIN_ROOT}/geography`,
        icon: "geography",
        hint: "Where new drivers are signing up",
        isNew: true,
        children: [{ label: "Density map", href: `${ADMIN_ROOT}/geographic-density` }],
      },
      {
        label: "Acquisition",
        href: `${ADMIN_ROOT}/acquisition`,
        icon: "acquisition",
        hint: "How they heard, QR scans, referrals",
      },
      {
        label: "Funnel & activation",
        href: `${ADMIN_ROOT}/funnel`,
        icon: "funnel",
        hint: "From sign-up to first trip",
        children: [{ label: "Activation", href: `${ADMIN_ROOT}/activation` }],
      },
      {
        label: "Engagement",
        href: `${ADMIN_ROOT}/growth`,
        icon: "engagement",
        hint: "Daily and monthly actives, retention",
      },
      { label: "Insights", href: `${ADMIN_ROOT}/insights`, icon: "insights", hint: "Funnel, retention, live recordings" },
      {
        label: "Community numbers",
        href: `${ADMIN_ROOT}/community`,
        icon: "community",
        hint: "Last month across the whole fleet, plus ready-made posts",
        isNew: true,
      },
    ],
  },
  {
    label: "Drivers",
    items: [
      { label: "Users", href: `${ADMIN_ROOT}/users`, icon: "users", hint: "Every account, searchable" },
      { label: "Inbox", href: `${ADMIN_ROOT}/inbox`, icon: "inbox", hint: "Every email to support@, read and reply here", isNew: true },
      {
        label: "Support",
        href: `${ADMIN_ROOT}/support`,
        icon: "support",
        hint: "Who is waiting on a reply",
        children: [{ label: "Missing trips", href: `${ADMIN_ROOT}/missing-trips` }],
      },
      {
        label: "Capture health",
        href: `${ADMIN_ROOT}/capture`,
        icon: "capture",
        hint: "Is the fleet recording drives?",
        children: [{ label: "ClearTrack", href: `${ADMIN_ROOT}/cleartrack` }],
      },
      { label: "Android", href: `${ADMIN_ROOT}/android`, icon: "android", hint: "Android drivers and testers" },
    ],
  },
  {
    label: "Companies",
    items: [
      {
        label: "Milesheet",
        href: `${ADMIN_ROOT}/milesheet`,
        icon: "teams",
        hint: "Company teams: invites, approvals, billing",
        isNew: true,
        children: [
          { label: "Teams", href: `${ADMIN_ROOT}/milesheet/teams` },
          { label: "Journey", href: `${ADMIN_ROOT}/milesheet/journey` },
          { label: "Needs attention", href: `${ADMIN_ROOT}/milesheet/attention` },
        ],
      },
    ],
  },
  {
    label: "Money",
    items: [{ label: "Revenue", href: `${ADMIN_ROOT}/revenue`, icon: "revenue", hint: "Paying subscribers and MRR" }],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Ops",
        href: `${ADMIN_ROOT}/ops`,
        icon: "ops",
        hint: "System health, webhooks, jobs",
        children: [
          { label: "Build health", href: `${ADMIN_ROOT}/build-health` },
          { label: "Issues by hour", href: `${ADMIN_ROOT}/issues-by-hour` },
        ],
      },
      { label: "Comms", href: `${ADMIN_ROOT}/comms`, icon: "comms", hint: "Emails and push notifications" },
    ],
  },
];

function matches(pathname: string, href: string): boolean {
  if (href === ADMIN_ROOT) return pathname === ADMIN_ROOT || pathname === `${ADMIN_ROOT}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface ActiveNav {
  group: AdminNavGroup;
  item: AdminNavItem;
  child: AdminNavChild | null;
}

/** Which nav entry the current path belongs to, or null outside the list. */
export function findActiveNav(pathname: string): ActiveNav | null {
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      const child = item.children?.find((c) => matches(pathname, c.href)) ?? null;
      if (child) return { group, item, child };
      if (matches(pathname, item.href) || (item.aliases ?? []).some((a) => matches(pathname, a))) {
        return { group, item, child: null };
      }
    }
  }
  return null;
}
