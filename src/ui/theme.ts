import { useColorScheme } from 'react-native';

import { useA11yPrefs } from './a11y';

const dark = {
  scheme: 'dark' as 'dark' | 'light',
  background: '#0E0F10',
  surface: '#191A1A',
  surfaceRaised: '#191A1A',
  border: 'rgba(255,255,255,0.09)',
  text: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.64)',
  textTertiary: 'rgba(235,235,245,0.4)',
  accent: '#F2C46D',
  onAccent: '#1A1405',
  danger: '#FF6B6B',
  success: '#5AD19A',
  locked: '#9C8CFF',
  scrim: 'rgba(14,15,16,0.86)',
  /** Translucent fills for panels laid over the blurred locked grid. */
  frost: 'rgba(255,255,255,0.07)',
  frostStrong: 'rgba(255,255,255,0.1)',
};

type Palette = typeof dark;

const light: Palette = {
  scheme: 'light',
  background: '#FAFAFA',
  surface: '#E4E4E4',
  surfaceRaised: '#E4E4E4',
  border: 'rgba(11,11,15,0.1)',
  text: '#0B0B0F',
  textSecondary: 'rgba(28,28,34,0.68)',
  textTertiary: 'rgba(28,28,34,0.46)',
  accent: '#9A6510',
  onAccent: '#FFFFFF',
  danger: '#C62828',
  success: '#1B7F4F',
  locked: '#5B48D6',
  scrim: 'rgba(250,250,250,0.9)',
  frost: 'rgba(255,255,255,0.55)',
  frostStrong: 'rgba(255,255,255,0.7)',
};

export function useTheme(): Palette {
  const scheme = useColorScheme();
  const { increaseContrast } = useA11yPrefs();
  const base = scheme === 'light' ? light : dark;
  if (!increaseContrast) return base;
  return base.scheme === 'dark'
    ? { ...base, textSecondary: 'rgba(245,245,250,0.86)', textTertiary: 'rgba(245,245,250,0.7)', border: 'rgba(255,255,255,0.28)' }
    : { ...base, textSecondary: 'rgba(11,11,15,0.86)', textTertiary: 'rgba(11,11,15,0.72)', border: 'rgba(11,11,15,0.32)' };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

/**
 * Tinted glass of the locked page's cards (Memories / Members pills, the
 * Upload / Invite pill). `strong` is the main "Memories locked" card.
 */
export function lockedCardColors(scheme: 'light' | 'dark', strong = false) {
  const dark = scheme === 'dark';
  return {
    backgroundColor: dark ? `rgba(28,28,30,${strong ? 0.78 : 0.55})` : `rgba(255,255,255,${strong ? 0.75 : 0.5})`,
    borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)',
  };
}

/** Page colour of a locked trip (a soft grey in light mode instead of white). */
export function lockedPageColor(scheme: 'light' | 'dark', background: string) {
  return scheme === 'light' ? '#F1F1F3' : background;
}
