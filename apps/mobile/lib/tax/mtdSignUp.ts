// "Signed up for Making Tax Digital with HMRC?" HMRC only takes quarterly
// updates from someone who has signed up on GOV.UK, and a driver who hasn't
// gets HMRC's own refusal after connecting. The quarterly updates screen asks
// first, and remembers a "Yes" on this phone (per account) so it never asks
// again; HMRC refusing for this reason later forgets it, so the help returns.

import { isApiError } from "../api/apiError";
import { getDatabase } from "../db/index";

export const GOVUK_MTD_SIGN_UP =
  "https://www.gov.uk/guidance/sign-up-your-business-for-making-tax-digital-for-income-tax";

/** HMRC's code when the person signed in has no Making Tax Digital for Income Tax sign-up. */
export const NOT_SIGNED_UP_CODE = "CLIENT_OR_AGENT_NOT_AUTHORISED";

/** True when an HMRC read failed because the driver isn't signed up for MTD. */
export function isNotSignedUpError(err: unknown): boolean {
  return isApiError(err) && err.code === NOT_SIGNED_UP_CODE;
}

const keyFor = (userId: string) => `mtd_signed_up:${userId}`;

/** Whether this driver has told us they've signed up. Unknown counts as no, so the help shows. */
export async function hasSaidSignedUp(userId: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [keyFor(userId)]
    );
    return row != null;
  } catch {
    return false;
  }
}

export async function rememberSignedUp(userId: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      keyFor(userId),
      String(Date.now()),
    ]);
  } catch {
    /* best effort: the worst case is being asked again */
  }
}

export async function forgetSignedUp(userId: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [keyFor(userId)]);
  } catch {
    /* best effort */
  }
}
