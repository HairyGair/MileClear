import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Padding for a full-screen ScrollView that centres its content and has no
 * header of its own. When the content fits, nothing changes. When it is taller
 * than the screen (large text, a small phone, held sideways) it would start
 * underneath the status bar, so the top safe area is added. The sides always
 * keep clear of the notch when the phone is held sideways.
 * Usage: const safe = useSafeScroll();
 *   <ScrollView onLayout={safe.onLayout} onContentSizeChange={safe.onContentSizeChange}
 *     contentContainerStyle={[s.scrollContent, safe.padding]}>
 */
export function useSafeScroll(base = 24) {
  const insets = useSafeAreaInsets();
  const [viewHeight, setViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setViewHeight(e.nativeEvent.layout.height), []);
  const onContentSizeChange = useCallback((_w: number, h: number) => setContentHeight(h), []);
  const overflows = contentHeight > viewHeight + 1;
  return {
    onLayout,
    onContentSizeChange,
    padding: {
      paddingTop: overflows ? base + insets.top : base,
      paddingBottom: overflows ? base + insets.bottom : base,
      paddingLeft: Math.max(base, insets.left),
      paddingRight: Math.max(base, insets.right),
    },
  };
}
