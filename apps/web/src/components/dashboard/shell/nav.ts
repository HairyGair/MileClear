import type { IconName } from "../kit/Icon";
import type { ViewMode } from "../../../lib/dashboard/mode";

export interface NavItem {
  key: "home" | "trips" | "slot3" | "more";
  label: string;
  href: string;
  icon: IconName;
  iconActive: IconName;
}

/**
 * The four destinations. Slot 3 is Tax in Work mode and Insights in Personal
 * mode; outside the UK (ukTax false, 23 Oct 2026) there is no Tax, so it is
 * Insights in both.
 */
export function navItems(mode: ViewMode, ukTax = true): NavItem[] {
  return [
    { key: "home", label: "Home", href: "/dashboard", icon: "home-outline", iconActive: "home" },
    { key: "trips", label: "Trips", href: "/dashboard/trips", icon: "car-outline", iconActive: "car" },
    mode === "work" && ukTax
      ? { key: "slot3", label: "Tax", href: "/dashboard/tax", icon: "calculator-outline", iconActive: "calculator" }
      : { key: "slot3", label: "Insights", href: "/dashboard/insights", icon: "stats-chart-outline", iconActive: "stats-chart" },
    { key: "more", label: "More", href: "/dashboard/more", icon: "ellipsis-horizontal-circle-outline", iconActive: "ellipsis-horizontal-circle-outline" },
  ];
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/**
 * Which item is active. Pages reached from More highlight More, including
 * Insights in Work mode and Tax in Personal mode.
 */
export function activeNavKey(pathname: string, mode: ViewMode, ukTax = true): NavItem["key"] {
  if (pathname === "/dashboard") return "home";
  if (under(pathname, "/dashboard/trips")) return "trips";
  const taxSlot = mode === "work" && ukTax;
  if (taxSlot && under(pathname, "/dashboard/tax")) return "slot3";
  if (!taxSlot && under(pathname, "/dashboard/insights")) return "slot3";
  return "more";
}
