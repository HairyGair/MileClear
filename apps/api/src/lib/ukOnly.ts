// UK-only jobs and pushes (23 Oct 2026). A driver outside the UK (users.country,
// see shared featuresFor) gets no HMRC tax reminders, Self Assessment or MTD
// pushes, MOT or Clean Air Zone reminders, UK fuel prices or road alerts.
// Spread ukOnlyUser() into the user `where` of any such job; every driver
// before the Country setting is GB, so they keep everything.
//
// Only while the Country setting is on for everyone (lib/countrySetting):
// with it off every driver is treated as GB, so nobody is filtered out.
import { UK_COUNTRY_CODES } from "@mileclear/shared";
import { countrySettingOnForAll } from "./countrySetting.js";

/** Prisma `where` on User: the driver drives in the UK (empty while the switch is off). */
export function ukOnlyUser(): { country?: { in: string[] } } {
  return countrySettingOnForAll() ? { country: { in: [...UK_COUNTRY_CODES] } } : {};
}
