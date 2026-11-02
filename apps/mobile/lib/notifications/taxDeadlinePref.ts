import { getNotificationPreferences, setNotificationPreferences } from "./preferences";
import { cancelTaxDeadlineReminders, scheduleTaxYearDeadlineReminder } from "./scheduler";

/**
 * Turn the "Tax deadlines" reminders on or off, everywhere they come from:
 * - the server's pushes (quarterly update, Self Assessment, payment
 *   reminders all read this setting before sending), saved and waited for;
 * - the reminder this phone schedules itself before 5 April.
 *
 * If the server save fails, the phone's copy is put back as it was and the
 * error is thrown, so the switch can flip back and say it didn't save.
 * Used by the Quarterly updates hub and Settings > Notifications, so the two
 * always agree.
 */
export async function setTaxDeadlinePref(value: boolean): Promise<void> {
  const before = (await getNotificationPreferences()).taxDeadline;
  try {
    await setNotificationPreferences({ taxDeadline: value }, { awaitServer: true, throwOnServerError: true });
  } catch (err) {
    // Put the phone back as it was. Not awaited for the server: it already
    // has the old value, since the save just failed.
    await setNotificationPreferences({ taxDeadline: before }).catch(() => {});
    throw err;
  }
  if (value) {
    await scheduleTaxYearDeadlineReminder().catch(() => {});
  } else {
    await cancelTaxDeadlineReminders().catch(() => {});
  }
}
