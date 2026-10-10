// "What your phone allows": the four ticks on the Recording screen. Each one
// is a phone setting that decides whether MileClear can record in the
// background, with the fix when it is wrong. Pure, tested.

import type { CheckLook } from "./checks";

export type PhoneRowId = "location" | "background_refresh" | "motion" | "low_power";

export interface PhoneRow {
  id: PhoneRowId;
  look: CheckLook;
  title: string;
  hint: string | null;
  action: string | null;
  /** What the fix does: ask in the app, or open the phone's Settings. */
  fix: "request_location" | "open_phone_settings" | "request_motion" | null;
}

export interface PhoneInputs {
  platform: "ios" | "android";
  tier: "none" | "foreground" | "always";
  bgRefreshOff: boolean;
  motion: "granted" | "denied" | "undetermined" | "unavailable";
  lowPower: boolean;
}

export function phoneRows(i: PhoneInputs): PhoneRow[] {
  const ios = i.platform === "ios";
  const rows: PhoneRow[] = [];

  // Location
  const always = ios ? "Always" : "Allow all the time";
  if (i.tier === "always") {
    rows.push({ id: "location", look: "ok", title: `Location: ${always}`, hint: null, action: null, fix: null });
  } else if (i.tier === "foreground") {
    rows.push({
      id: "location",
      look: "bad",
      title: `Location: ${ios ? "While Using" : "Only while using the app"}`,
      hint: `Trips only record with the app open. Set it to ${always}`,
      action: "Fix",
      fix: "request_location",
    });
  } else {
    rows.push({
      id: "location",
      look: "bad",
      title: "Location: Off",
      hint: "MileClear can't record trips without it",
      action: "Fix",
      fix: "request_location",
    });
  }

  // Background App Refresh is an iPhone setting
  if (ios) {
    rows.push(
      i.bgRefreshOff
        ? {
            id: "background_refresh",
            look: "bad",
            title: "Background App Refresh: Off",
            hint: "The phone won't let MileClear run in the background",
            action: "Fix",
            fix: "open_phone_settings",
          }
        : { id: "background_refresh", look: "ok", title: "Background App Refresh: On", hint: null, action: null, fix: null }
    );
  }

  // Motion and fitness (Physical activity on Android). Left out when the phone can't say.
  if (i.motion !== "unavailable") {
    const name = ios ? "Motion & Fitness" : "Physical activity";
    if (i.motion === "granted") {
      rows.push({ id: "motion", look: "ok", title: `${name}: Allowed`, hint: null, action: null, fix: null });
    } else if (i.motion === "undetermined") {
      rows.push({
        id: "motion",
        look: "warn",
        title: `${name}: Not asked yet`,
        hint: "It is how MileClear catches the moment a drive starts",
        action: "Turn on",
        fix: "request_motion",
      });
    } else {
      rows.push({
        id: "motion",
        look: "warn",
        title: `${name}: Not allowed`,
        hint: "Short drives may be missed",
        action: "Fix",
        fix: "open_phone_settings",
      });
    }
  }

  // Low Power Mode / Battery Saver
  const lp = ios ? "Low Power Mode" : "Battery Saver";
  rows.push(
    i.lowPower
      ? {
          id: "low_power",
          look: "warn",
          title: `${lp}: On`,
          hint: "Drives may not record. Turn it off while you drive",
          action: "Open",
          fix: "open_phone_settings",
        }
      : { id: "low_power", look: "ok", title: `${lp}: Off`, hint: null, action: null, fix: null }
  );
  return rows;
}
