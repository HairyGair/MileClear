import { useEffect, useState } from "react";
import { AccessibilityInfo, useWindowDimensions } from "react-native";

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

/**
 * True once the system text size is above 130%. Text that is cut to one or
 * two lines at normal sizes should drop that limit and wrap when this is
 * true (WCAG 1.4.4, text resized to 200% without loss of content), so the
 * default and slightly larger sizes look exactly as designed:
 *   numberOfLines={largeText ? undefined : 1}
 */
export const LARGE_TEXT_SCALE = 1.3;

export function useLargeText(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale > LARGE_TEXT_SCALE;
}
