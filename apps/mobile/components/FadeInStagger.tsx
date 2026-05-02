// FadeInStagger — wraps a child in a fade-in-from-below animation that
// staggers based on its index in a list. Used on the dashboard to make
// cards animate in one-after-another instead of all-at-once when the
// data loads.
//
// Usage:
//   {items.map((item, index) => (
//     <FadeInStagger key={item.id} index={index}>
//       <SomeCard item={item} />
//     </FadeInStagger>
//   ))}
//
// Tuning notes:
//   - delayPer = 50ms means a 12-card dashboard finishes its full cascade
//     in 600ms + 250ms of fade = ~850ms total. Feels alive without
//     dragging.
//   - The intentional limit is 8 — beyond that the cascade gets boring.
//     Cards 9+ animate at the same time as card 8.

import { useEffect, useRef } from "react";
import { Animated } from "react-native";

interface FadeInStaggerProps {
  /** Position in the parent list. 0 = first, fades in immediately. */
  index: number;
  /** Children to wrap. */
  children: React.ReactNode;
  /** Per-index stagger in ms. Default 50. */
  delayPer?: number;
  /** Cap the stagger. Cards beyond this index animate together. Default 8. */
  maxStaggered?: number;
}

export function FadeInStagger({
  index,
  children,
  delayPer = 50,
  maxStaggered = 8,
}: FadeInStaggerProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const delay = Math.min(index, maxStaggered) * delayPer;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  // We deliberately omit dependencies — animations only run on mount and
  // shouldn't restart if index changes (which would cause a re-shuffle
  // of the cards, animating again, which is jarring during scroll).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
