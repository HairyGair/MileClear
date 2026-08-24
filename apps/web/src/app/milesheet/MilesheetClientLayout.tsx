"use client";

import "../dashboard/dashboard.css";
import "./milesheet.css";

/**
 * Milesheet's outer shell. Deliberately carries NO AuthProvider: the overview
 * page is public marketing, and AuthProvider fetches the profile on mount,
 * which 401s for a logged-out visitor and sends them to /login. That put a
 * login wall in front of the one page written for people who do not have an
 * account yet. Auth belongs to the portal, which is the part that needs it.
 *
 * dashboard.css is imported for the shared component classes (cards, tables,
 * badges); milesheet.css then re-points the accent tokens, so those components
 * arrive in Milesheet's colours rather than MileClear's.
 */
export default function MilesheetClientLayout({ children }: { children: React.ReactNode }) {
  return <div className="milesheet">{children}</div>;
}
