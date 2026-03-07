import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * Returns true when the user has enabled "Reduce Motion" in system settings.
 * Use this to disable non-essential animations.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced
    );
    return () => sub.remove();
  }, []);

  return reduced;
}

/**
 * Returns true when a screen reader (VoiceOver / TalkBack) is active.
 */
export function useScreenReader(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setActive);
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setActive
    );
    return () => sub.remove();
  }, []);

  return active;
}
