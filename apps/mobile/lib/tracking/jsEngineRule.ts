// Which platforms have a JS detection engine worth falling back to.
//
// On iOS the old expo-location path is a real engine: it ran the whole fleet
// for months, so an iPhone parked on it still captures. On Android capture is
// the native foreground service and nothing else, so a phone put on the JS
// engine there records nothing at all, permanently, while the dashboard still
// says tracking is on. Becky O'Neill's moto g55 5G is the proof (self-healed
// 10 Sep 2026, then zero auto trips for the following week), and the fleet
// carries the same shape at scale: Android drivers lose a median 44% of days
// to silence against 10% on iOS (measured on production, 21 Sep 2026).
//
// selfHealRule.ts already refuses to heal an Android phone onto the JS engine
// (reason no_js_fallback_on_platform, fixed in 6a482f9). This is that same
// rule for the paths the self-heal fix did not cover: the unknown-state
// default in nativeEngineFlag.ts, the set_native_engine silent push, and the
// diagnostics screen's toggle.
//
// Pure module, like pauseRule.ts and selfHealRule.ts, so the test runner can
// reason about it without importing SQLite or the native stack.

/**
 * Can this platform still capture drives on the JS detection engine?
 *
 * Android is the one platform measured to capture nothing there, so it is the
 * one platform that gets forced onto native. Everywhere else keeps the
 * behaviour it has always had, because nothing says that behaviour is broken.
 */
export function canPlatformRunJsEngine(platform: string): boolean {
  return platform !== "android";
}
