// What is allowed to wake the tracking engine (24 Sep 2026).
//
// By default the engine wakes for any movement the motion coprocessor
// reports: walking, running, cycling or driving. So a dog walker ran GPS for
// hours a day and the battery went with it (Rowena: "it was draining my
// battery", she left for a beacon-based app). On iPhone we can say which
// activities may wake it; the SDK checks each motion reading against this
// list (SOMotionDetector isMoving:triggerActivities).
//
// "on_bicycle" stays in on purpose: the iPhone often calls a motorbike ride
// cycling, and motorbikes are a vehicle type MileClear claims at 24p. The
// speed backstop and the wake-lag start extension still catch a drive the
// coprocessor is slow to label, as they do today.
//
// Only when Motion & Fitness is GRANTED. The SDK's own warning: the list
// "requires that the user grant your app the Motion/Health permission". A
// phone without it has no activity to test, and a trigger list could stop it
// waking for a drive at all. 24 Sep 2026: 65 iPhones denied and 10 never
// asked, 13% of the iPhone fleet; they keep today's behaviour. Re-checked on
// every launch (ready() resets to defaults), so granting it later applies the
// list and revoking it removes the list.
//
// Android gets nothing: its motion permission is blocked for Play, so the SDK
// has no activity to test and a trigger list would stop it waking at all.

export function engineTriggerActivities(
  platform: string,
  motionPermission: string
): string | undefined {
  return platform === "ios" && motionPermission === "granted" ? "in_vehicle, on_bicycle" : undefined;
}
