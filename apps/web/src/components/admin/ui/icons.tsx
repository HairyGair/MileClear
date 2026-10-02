// Inline stroke icons for the admin area. 24x24 grid, 1.75 stroke, drawn in
// currentColor so they take the text colour of whatever holds them. No icon
// library: the web app has none and these are all we need.

import type { CSSProperties, ReactNode } from "react";

export type AdminIconName =
  | "overview"
  | "geography"
  | "acquisition"
  | "funnel"
  | "engagement"
  | "insights"
  | "users"
  | "support"
  | "capture"
  | "android"
  | "revenue"
  | "ops"
  | "comms"
  | "search"
  | "menu"
  | "close"
  | "arrowRight"
  | "arrowUp"
  | "arrowDown"
  | "alert"
  | "refresh"
  | "sortUp"
  | "sortDown"
  | "sort"
  | "inbox";

const PATHS: Record<AdminIconName, ReactNode> = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  geography: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  acquisition: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  funnel: <path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8L4 5z" />,
  engagement: (
    <>
      <path d="M3.5 16.5l5-5 3.5 3.5 7.5-7.5" />
      <path d="M15 7.5h4.5V12" />
    </>
  ),
  insights: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.8c1.8.7 3.1 2.5 3.5 5.2" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M6 6l3.5 3.5M14.5 14.5L18 18M18 6l-3.5 3.5M9.5 14.5L6 18" />
    </>
  ),
  capture: (
    <path d="M3 12h3.5l2.5-6 4 12 2.5-6H21" />
  ),
  android: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  revenue: (
    <>
      <path d="M15.5 6.5A3.8 3.8 0 0 0 9 9.2V13" />
      <path d="M7.5 13h6M7 19h10M9 13c0 2.6-.6 4.6-2 6" />
    </>
  ),
  ops: (
    <>
      <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
      <path d="M7 7.25h.01M7 16.75h.01" strokeWidth="2.5" />
    </>
  ),
  comms: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  alert: (
    <>
      <path d="M12 3.5l9.5 16.5h-19L12 3.5z" />
      <path d="M12 10v4.5M12 17.2h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5" />
      <path d="M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.3L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </>
  ),
  sortUp: <path d="M8 14l4-4 4 4" />,
  sortDown: <path d="M8 10l4 4 4-4" />,
  sort: <path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4" />,
  inbox: (
    <>
      <path d="M3.5 13.5l2.6-7.8A1.5 1.5 0 0 1 7.5 4.7h9a1.5 1.5 0 0 1 1.4 1l2.6 7.8V18a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18v-4.5z" />
      <path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
    </>
  ),
};

interface AdminIconProps {
  name: AdminIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export function AdminIcon({ name, size = 18, strokeWidth = 1.75, className, style }: AdminIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
