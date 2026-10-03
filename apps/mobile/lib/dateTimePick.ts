// Pure helpers for the Android date-then-time picker (DateTimePickerField).
//
// Android has no single date-and-time dialog: the field opens a calendar,
// then a clock. The clock only knows hours and minutes, so the driver's pick
// is the calendar day from the first dialog with the clock time from the
// second, built in the phone's local time.

/** The calendar day of `day` at the hour and minute of `time`, local time,
 *  seconds and milliseconds zeroed. */
export function combineDayAndTime(day: Date, time: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.getHours(),
    time.getMinutes(),
    0,
    0
  );
}

/** True only when the driver pressed OK. The Android dialog also calls
 *  back on Cancel, the back button and a tap outside, and passes the
 *  ORIGINAL value with them, so a defined date is not proof of a pick. */
export function isPickerSet(event: { type?: string } | null | undefined, date: Date | undefined | null): date is Date {
  return event?.type === "set" && date instanceof Date && !isNaN(date.getTime());
}
