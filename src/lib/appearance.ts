import { useState } from 'react';
import { Appearance } from 'react-native';

import { readJson, writeJson } from './kv';

type AppearancePref = 'system' | 'light' | 'dark';
const KEY = 'appearance';

function apply(pref: AppearancePref) {
  // Overrides the whole app, including native views (glass, blur, pickers, sheets).
  Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
}

/** Call once at startup, before the first render. */
export function applyStoredAppearance() {
  apply(readJson<AppearancePref>(KEY, 'system'));
}

export function useAppearancePref() {
  const [pref, setPref] = useState<AppearancePref>(() => readJson<AppearancePref>(KEY, 'system'));
  return [
    pref,
    (next: AppearancePref) => {
      writeJson(KEY, next);
      apply(next);
      setPref(next);
    },
  ] as const;
}
