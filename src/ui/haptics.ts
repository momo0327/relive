import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback used across the app, so every touch feels the same:
 *  - tap: buttons, rows, cards, tiles
 *  - select: switches, filters, colour pickers, selection toggles
 *  - impact: primary actions that start something (camera, capture)
 */
export const haptic = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  select: () => Haptics.selectionAsync().catch(() => undefined),
  impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined),
};

/** Wraps a handler so it plays a light tap first. */
export function withTap<A extends unknown[]>(fn?: (...args: A) => void) {
  return (...args: A) => {
    haptic.tap();
    fn?.(...args);
  };
}
