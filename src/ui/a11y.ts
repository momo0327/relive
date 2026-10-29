import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

type Prefs = { reduceMotion: boolean; reduceTransparency: boolean; increaseContrast: boolean };

let current: Prefs = { reduceMotion: false, reduceTransparency: false, increaseContrast: false };
const listeners = new Set<() => void>();

function set(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
}

AccessibilityInfo.isReduceMotionEnabled().then((v) => set({ reduceMotion: v }));
AccessibilityInfo.isReduceTransparencyEnabled().then((v) => set({ reduceTransparency: v }));
AccessibilityInfo.isDarkerSystemColorsEnabled?.().then((v) => set({ increaseContrast: v }));
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => set({ reduceMotion: v }));
AccessibilityInfo.addEventListener('reduceTransparencyChanged', (v) => set({ reduceTransparency: v }));
AccessibilityInfo.addEventListener('darkerSystemColorsChanged', (v) => set({ increaseContrast: v }));

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** System accessibility settings: Reduce Motion, Reduce Transparency, Increase Contrast. */
export function useA11yPrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => current);
}
