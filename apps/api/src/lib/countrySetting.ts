// The Country setting's switch (23 Oct 2026). OFF unless COUNTRY_SETTING=on;
// admins always have it, so it can be tried on our own phones first. While a
// driver doesn't have it, they are treated as GB everywhere: the profile
// reports GB, a country sent to the profile update is ignored, EmSee gets no
// country line, and the UK-only jobs don't filter anyone out. That lets the
// code be merged dark without any driver seeing it.
import { DEFAULT_COUNTRY } from "@mileclear/shared";

/** The whole fleet has it (COUNTRY_SETTING=on). Admin-only otherwise. */
export function countrySettingOnForAll(): boolean {
  return process.env.COUNTRY_SETTING === "on";
}

export function countrySettingEnabledFor(user: { isAdmin?: boolean | null }): boolean {
  return countrySettingOnForAll() || !!user.isAdmin;
}

/** For jobs and pushes, which go to everyone: the stored country only while
 *  the switch is on for all, else GB (admins testing don't change what jobs send). */
export function jobCountry(stored: string | null | undefined): string {
  return countrySettingOnForAll() ? stored || DEFAULT_COUNTRY : DEFAULT_COUNTRY;
}

/** The country to act on: the stored one with the switch on, else GB. */
export function effectiveCountry(user: { isAdmin?: boolean | null; country?: string | null }): string {
  return countrySettingEnabledFor(user) ? user.country || DEFAULT_COUNTRY : DEFAULT_COUNTRY;
}
