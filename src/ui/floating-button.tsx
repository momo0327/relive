import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { SymbolViewProps } from 'expo-symbols';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useA11yPrefs } from './a11y';
import { haptic } from './haptics';
import { useLayout } from './layout';
import { Icon } from './primitives';
import { space, useTheme } from './theme';

const glassSupported = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

/**
 * Large floating action button at the bottom right: Liquid Glass on iOS 26,
 * solid elsewhere. "accent" is tinted (white in dark mode, black in light);
 * "plain" is untinted system glass.
 */
export function FloatingButton({
  icon,
  label,
  hint,
  onPress,
  variant = 'accent',
}: {
  variant?: 'accent' | 'plain';
  icon: SymbolViewProps['name'];
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const c = useTheme();
  const dark = c.scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const { reduceTransparency } = useA11yPrefs();
  const glass = glassSupported && !reduceTransparency;
  const plain = variant === 'plain';
  const glyphColor = plain ? c.text : dark ? '#0E0F10' : '#FFFFFF';
  const glyph = <Icon name={icon} size={28} color={glyphColor} weight="semibold" />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => {
        haptic.impact();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { right: gutter, bottom: Math.max(insets.bottom, space.lg) + space.sm, transform: [{ scale: pressed ? 0.94 : 1 }] },
        !glass && [styles.fallback, { backgroundColor: plain ? c.surfaceRaised : dark ? '#FFFFFF' : '#0E0F10' }],
      ]}>
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor={plain ? undefined : dark ? 'rgba(255,255,255,0.92)' : 'rgba(14,15,16,0.92)'}
          isInteractive
          style={styles.inner}>
          {glyph}
        </GlassView>
      ) : (
        glyph
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { position: 'absolute', width: 68, height: 68, borderRadius: 34 },
  inner: { flex: 1, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
