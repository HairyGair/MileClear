import { LayoutAnimation, type LayoutAnimationConfig } from "react-native";

/**
 * Layout animation for list changes (filter taps, rows leaving). It moves
 * things to their new place and nothing else.
 *
 * LayoutAnimation.Presets.easeInEaseOut also fades new views in from
 * opacity 0 and fades removed views out. On Android, when a second change
 * lands before that fade finishes (a filter tap starts one, the list data
 * arriving starts another, the missed-drives card appearing starts a third),
 * the interrupted fade can be left part-way, and the whole list sits at
 * about a third of its brightness until the next full re-render
 * (Android driver, 13 Oct 2026: the To sort list dimmed on every tap).
 * With no create/delete opacity step there is no fade to get stuck.
 */
export const MOVE_ONLY_ANIMATION: LayoutAnimationConfig = {
  duration: 200,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
};

export function animateListChange(): void {
  LayoutAnimation.configureNext(MOVE_ONLY_ANIMATION);
}
