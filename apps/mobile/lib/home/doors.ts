// Home's door rows (PROPOSALS 0.6): up to three plain rows, each a door to
// another screen that says one true thing about what is behind it. A row with
// nothing honest to say is skipped and the next one moves up, so there is never
// a zero and never a blank row.
//
// Pure and unit-tested: which rows each driver can see, in what order.

import type { HomePersona } from "./persona";
import type { DoorRowId } from "./doorPrefs";

export type DoorId = DoorRowId | "road" | "help";

export interface DoorRow {
  id: DoorId;
  text: string;
  /** Where a tap goes. */
  route: string;
  /** Ionicons name. */
  icon: string;
  /** Road alerts are the one amber row. */
  urgent?: boolean;
}

/** What each door would say right now; null means "nothing honest to say". */
export interface DoorTexts {
  road: { text: string } | null;
  tax: { text: string; route: string } | null;
  insights: { text: string; route: string } | null;
  earnings: string | null;
  badges: string | null;
  fuel: string | null;
}

export interface DoorInputs {
  mode: "work" | "personal";
  persona: HomePersona;
  /** Total trips ever recorded: zero makes this a new driver. */
  totalTrips: number;
  /** Has logged at least one fuel fill-up (Work mode shows Fuel only then). */
  hasFuelLogs: boolean;
  /** Sunday 18:00 to Monday 12:00: the Insights row leads. */
  endOfWeek: boolean;
  hidden: readonly DoorRowId[];
  texts: DoorTexts;
}

export const MAX_DOOR_ROWS = 3;

const ICONS: Record<DoorId, string> = {
  road: "warning-outline",
  tax: "document-text-outline",
  insights: "stats-chart-outline",
  earnings: "cash-outline",
  badges: "ribbon-outline",
  fuel: "water-outline",
  help: "help-circle-outline",
};

const ROUTES: Record<DoorId, string> = {
  road: "/road-alerts",
  tax: "/(tabs)/tax",
  insights: "/insights",
  earnings: "/(tabs)/earnings",
  badges: "/achievements",
  fuel: "/(tabs)/fuel",
  help: "/help",
};

/** Candidate order per driver, before hiding and skipping. */
export function doorOrder(args: {
  mode: "work" | "personal";
  persona: HomePersona;
  totalTrips: number;
  endOfWeek: boolean;
}): DoorRowId[] {
  const { mode, persona, totalTrips, endOfWeek } = args;
  // A new driver has nothing to tease yet; "How MileClear works" is added by selectDoorRows.
  if (totalTrips === 0) return ["tax"];
  let order: DoorRowId[];
  if (mode === "personal" || persona === "personal") {
    order = ["insights", "badges", "fuel"];
  } else if (persona === "gig" || persona === "both") {
    order = ["tax", "insights", "earnings", "badges", "fuel"];
  } else if (persona === "employee") {
    order = ["tax", "insights", "badges", "fuel"];
  } else {
    order = ["insights", "badges", "fuel"];
  }
  if (endOfWeek && order.includes("insights")) {
    order = ["insights", ...order.filter((d) => d !== "insights")];
  }
  return order;
}

export function selectDoorRows(i: DoorInputs): DoorRow[] {
  const rows: DoorRow[] = [];

  if (i.texts.road) {
    rows.push({ id: "road", text: i.texts.road.text, route: ROUTES.road, icon: ICONS.road, urgent: true });
  }

  const order = doorOrder(i);
  for (const id of order) {
    if (rows.length >= MAX_DOOR_ROWS) break;
    if (i.hidden.includes(id)) continue;
    // Fuel in Work mode only for a driver who logs fuel.
    if (id === "fuel" && i.mode === "work" && !i.hasFuelLogs) continue;

    let text: string | null = null;
    let route = ROUTES[id];
    if (id === "tax") {
      if (i.texts.tax) {
        text = i.texts.tax.text;
        route = i.texts.tax.route;
      }
    } else if (id === "insights") {
      if (i.texts.insights) {
        text = i.texts.insights.text;
        route = i.texts.insights.route;
      }
    } else if (id === "earnings") text = i.texts.earnings;
    else if (id === "badges") text = i.texts.badges;
    else if (id === "fuel") text = i.texts.fuel;

    if (text) rows.push({ id, text, route, icon: ICONS[id] });
  }

  // A new driver: How MileClear works is the one door.
  if (i.totalTrips === 0 && rows.length < MAX_DOOR_ROWS) {
    rows.push({ id: "help", text: "How MileClear works", route: ROUTES.help, icon: ICONS.help });
  }

  return rows.slice(0, MAX_DOOR_ROWS);
}

/** Sunday 18:00 to Monday 12:00, local time. */
export function isEndOfWeek(now: Date): boolean {
  const d = now.getDay();
  const h = now.getHours();
  return (d === 0 && h >= 18) || (d === 1 && h < 12);
}
