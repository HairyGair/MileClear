// What a trip saved from a shift is classified as (28 Sep 2026).
//
// A shift-only driver: "I also don't understand why I have to manually select
// business for trips recorded whilst on shift." Starting a shift is the driver
// saying "I am working now", so every trip cut from its breadcrumbs is
// business. Until now they took the Pro work schedule's answer, which is
// "unclassified" for anyone without it switched on.
//
// Only a real shift, meaning one the server knows (serverShiftId). A Start
// Trip recovered from its lock, or an arrived-but-unsaved trip, has no shift
// behind it and keeps the schedule's answer, as before: the trip form asks
// the driver about those.

export type ShiftTripClassification = "business" | "unclassified";

export function shiftTripClassification(
  serverShiftId: string | undefined,
  scheduleClassification: ShiftTripClassification
): ShiftTripClassification {
  if (typeof serverShiftId === "string" && serverShiftId.length > 0) return "business";
  return scheduleClassification;
}
