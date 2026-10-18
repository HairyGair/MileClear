// Native modules Directions need, loaded so an older binary never crashes
// (PLAN.md F6). Main's JS reaches 7 runtimes by OTA; only the 1.4.0 build has
// nav-voice, expo-speech and react-native-svg compiled in. On any other
// binary each loader returns null, every voice call is a no-op, and the entry
// points never show because directionsAvailable() is false.
//
// No React Native import here, so the gate is testable under vitest.

export function loadOptional<T>(load: () => T): T | null {
  try {
    const m = load();
    return m == null ? null : m;
  } catch {
    return null;
  }
}

/**
 * Show Directions anywhere only when the server has switched them on for
 * this driver AND this binary has the native voice module (which ships in the
 * same build as expo-speech and react-native-svg).
 */
export function directionsAvailable(args: { navigationEnabled: boolean | null | undefined; navVoicePresent: boolean }): boolean {
  return args.navigationEnabled === true && args.navVoicePresent;
}
