import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { nextAnnouncement } from "./announceLogic";

/**
 * Speak a message through VoiceOver (iOS). Android reads it through
 * accessibilityLiveRegion="polite" on the error Text instead, and announcing
 * here as well would make TalkBack say it twice, so this does nothing there.
 */
export function announce(message: string): void {
  if (Platform.OS !== "ios") return;
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Announce an inline error when it appears or changes.
 * Usage: useAnnounceError(error);
 * Pair it with accessibilityLiveRegion="polite" on the error's wrapper.
 */
export function useAnnounceError(message: string | null | undefined): void {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const text = nextAnnouncement(previous.current, message);
    previous.current = message ?? null;
    if (text) announce(text);
  }, [message]);
}

/**
 * Error state for a form whose handlers set the error directly.
 * Usage: const [error, setError] = useErrorState();
 * Every non-empty message is announced when it is set, so pressing the button
 * again and getting the same message is read out again (a clear and re-set in
 * the same handler is batched by React, so a change-based hook would miss it).
 * Pair it with accessibilityLiveRegion="polite" on the error's wrapper.
 */
export function useErrorState(): [string, (message: string) => void] {
  const [error, setErrorState] = useState("");
  const setError = useCallback((message: string) => {
    setErrorState(message);
    const text = message.trim();
    if (text) announce(text);
  }, []);
  return [error, setError];
}
