// After a car's Bluetooth is linked (car screen or "Which car is X?"): offer
// to move the recorded drives from the last three days that the phone was on
// that Bluetooth for (earlierTripsInCar). The driver says yes or no in one
// alert; nothing moves without it. Never throws: linking has already worked.

import { Alert } from "react-native";
import { EARLIER_TRIPS_MAX, earlierTripsInCar, withoutOverlaps, type EarlierTrip } from "./carBluetooth";
import { currentDistanceUnit, distanceUnitApi } from "../units/distanceUnit";

/** Shown in the alert; the rest are "and 3 more". */
const LISTED = 4;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today 19:33", "Yesterday 08:10", "Fri 23 Oct 17:45" (phone's time zone). */
export function whenLabel(startMs: number, nowMs: number = Date.now()): string {
  const d = new Date(startMs);
  const now = new Date(nowMs);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay(d, now)) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday ${time}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
}

/** "47, The Bridges, Sunderland" -> "47 The Bridges"; "Home" stays "Home". */
export function shortPlace(address: string | null): string | null {
  if (!address?.trim()) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (/^\d+[a-z]?$/i.test(parts[0]) && parts[1]) return `${parts[0]} ${parts[1]}`;
  return parts[0];
}

export function tripLine(t: EarlierTrip, nowMs: number = Date.now()): string {
  const from = shortPlace(t.startAddress);
  const to = shortPlace(t.endAddress);
  const route = from && to ? `, ${from} to ${to}` : to ? `, to ${to}` : from ? `, from ${from}` : "";
  return `${whenLabel(t.startMs, nowMs)}${route}, ${distanceUnitApi(currentDistanceUnit()).fmt(t.distanceMiles)}`;
}

/** The alert's wording, for one trip or several. */
export function earlierTripsMessage(trips: EarlierTrip[], carLabel: string, nowMs: number = Date.now()) {
  const one = trips.length === 1;
  const lines = trips.slice(0, LISTED).map((t) => tripLine(t, nowMs));
  if (trips.length > LISTED) lines.push(`and ${trips.length - LISTED} more`);
  return {
    title: one ? `Was this drive in your ${carLabel}?` : `Were these ${trips.length} drives in your ${carLabel}?`,
    body:
      `Your phone was on its Bluetooth for ${one ? "this drive" : "these drives"}:\n\n` +
      lines.join("\n") +
      `\n\nMove ${one ? "it" : "them"} to your ${carLabel}?`,
    move: one ? "Move it" : "Move them",
    keep: one ? "Leave it" : "Leave them",
  };
}

/** How long the server gets to vouch for the trips before we ask anyway. */
const SERVER_CHECK_MS = 3000;

/**
 * Drop trips the phone still holds that the server no longer has (deleted on
 * the web or another phone, or a doubled copy removed): synced trips must be
 * in the server's list for the window. Trips not yet sent stay. Offline, slow
 * or a list too long to be sure of: everything stays.
 */
export async function keepTripsTheServerHas(trips: EarlierTrip[]): Promise<EarlierTrip[]> {
  if (!trips.some((t) => t.synced)) return trips;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // An hour early: the server may have moved a start back (a late-start
    // fix) that the phone hasn't caught up with.
    const fromMs = Math.min(...trips.map((t) => t.startMs)) - 60 * 60 * 1000;
    const { fetchTrips } = await import("../api/trips");
    const res = await Promise.race([
      fetchTrips({ from: new Date(fromMs).toISOString(), pageSize: 200 }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SERVER_CHECK_MS);
      }),
    ]);
    const list = res?.data;
    if (!Array.isArray(list)) return trips;
    const total = (res as { total?: unknown }).total;
    if (typeof total === "number" && total > list.length) return trips;
    const ids = new Set(list.map((t) => t?.id));
    return trips.filter((t) => !t.synced || ids.has(t.id));
  } catch {
    return trips;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Look back and, if anything was in this car, ask. Resolves once the driver
 * has answered (or straight away when there is nothing to ask); a move runs
 * on after that, so the car screen never waits on the network.
 */
export async function offerEarlierTrips(
  vehicleId: string,
  carLabel: string,
  out: { name: string; id: string | null }
): Promise<void> {
  let trips: EarlierTrip[] = [];
  try {
    // The server check first, so a deleted copy never hides the real drive.
    trips = withoutOverlaps(await keepTripsTheServerHas(await earlierTripsInCar(vehicleId, out))).slice(
      0,
      EARLIER_TRIPS_MAX
    );
  } catch {
    return;
  }
  if (trips.length === 0) return;
  const label = carLabel.trim() || "car";
  const m = earlierTripsMessage(trips, label);
  const logged = (moved: number, failed = 0) =>
    import("../tracking/recordingDrops")
      .then((r) => r.queueAppEvent("trip.car_bluetooth", { decision: "look_back", vehicleId, offered: trips.length, moved, failed }))
      .catch(() => {});

  // syncUpdateTrip writes the phone's copy and queues the change before it
  // calls the server, and the queue retries, so a throw here is the server
  // call only: counted for the log, not shown as "couldn't move".
  const move = async () => {
    const { syncUpdateTrip } = await import("../sync/actions");
    let failed = 0;
    for (const t of trips) {
      try {
        await syncUpdateTrip(t.id, { vehicleId });
      } catch {
        failed += 1;
      }
    }
    void logged(trips.length - failed, failed);
  };

  await new Promise<void>((resolve) => {
    let answered = false;
    const once = (fn: () => void) => () => {
      if (answered) return;
      answered = true;
      fn();
      resolve();
    };
    Alert.alert(
      m.title,
      m.body,
      [
        { text: m.keep, style: "cancel", onPress: once(() => void logged(0)) },
        { text: m.move, onPress: once(() => void move().catch(() => {})) },
      ],
      { cancelable: true, onDismiss: once(() => void logged(0)) }
    );
  });
}
