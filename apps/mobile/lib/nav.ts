import { router } from "expo-router";

/**
 * Navigate back safely.
 *
 * Plain `router.back()` silently does nothing when there's no history to pop -
 * which happens when a screen is reached via `router.replace()`, a deep link,
 * or (on iOS 26) when the native header back button misbehaves. The result is a
 * dead back button. `safeBack` pops when it can, and otherwise falls back to a
 * sensible home so the back affordance is never a dead end.
 *
 * @param fallback route to land on when there's nothing to go back to.
 */
export function safeBack(fallback: string = "/(tabs)/dashboard"): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as never);
  }
}
