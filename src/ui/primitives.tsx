import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useA11yPrefs } from './a11y';
import { haptic as tapHaptic, withTap } from './haptics';
import { radius, space, useTheme } from './theme';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const variants = {
  hero: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.6 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'success' | 'locked' | 'inverse';

export function Txt({
  variant = 'body',
  tone = 'primary',
  style,
  ...props
}: TextProps & { variant?: keyof typeof variants; tone?: Tone }) {
  const c = useTheme();
  const color = {
    primary: c.text,
    secondary: c.textSecondary,
    tertiary: c.textTertiary,
    accent: c.accent,
    danger: c.danger,
    success: c.success,
    locked: c.locked,
    inverse: c.background,
  }[tone];
  return <Text {...props} style={[variants[variant], { color }, style]} />;
}

// ---------------------------------------------------------------------------
// Icon (SF Symbols on iOS)
// ---------------------------------------------------------------------------

export function Icon({
  name,
  size = 20,
  color,
  weight = 'medium',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color?: string;
  weight?: SymbolViewProps['weight'];
}) {
  const c = useTheme();
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color ?? c.text}
      weight={weight}
      accessibilityElementsHidden
      importantForAccessibility="no"
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  kind?: 'primary' | 'secondary' | 'accent' | 'destructive' | 'plain';
  icon?: SymbolViewProps['name'];
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
};

export function Button({ title, kind = 'primary', icon, loading, disabled, style, haptic = true, onPress, ...rest }: ButtonProps) {
  const c = useTheme();
  const palette = {
    primary: { bg: c.text, fg: c.background },
    accent: { bg: c.accent, fg: c.onAccent },
    secondary: { bg: c.surfaceRaised, fg: c.text },
    destructive: { bg: 'transparent', fg: c.danger },
    plain: { bg: 'transparent', fg: c.text },
  }[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={(e) => {
        if (haptic) tapHaptic.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, opacity: inactive ? 0.45 : pressed ? 0.75 : 1 },
        kind === 'destructive' && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.buttonRow}>
          {icon ? <Icon name={icon} color={palette.fg} size={18} weight="semibold" /> : null}
          <Txt variant="headline" style={{ color: palette.fg, textAlign: 'center', flexShrink: 1 }}>
            {title}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

/** Circular icon button for headers and overlays. Always has a label for VoiceOver. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 44,
  glass = false,
  overMedia = false,
  tint,
  disabled,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  size?: number;
  glass?: boolean;
  overMedia?: boolean;
  tint?: string;
  disabled?: boolean;
}) {
  const c = useTheme();
  const content = <Icon name={icon} size={size * 0.42} color={tint ?? (overMedia ? '#fff' : c.text)} weight="semibold" />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={withTap(onPress)}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      {glass ? (
        <Glass interactive overMedia={overMedia} style={[styles.iconButton, { width: size, height: size }]}>
          {content}
        </Glass>
      ) : (
        <View style={[styles.iconButton, { width: size, height: size }]}>{content}</View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Liquid Glass (iOS 26+) with an opaque fallback
// ---------------------------------------------------------------------------

const glassSupported = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

/**
 * Use only for floating controls (capture bar, viewer chrome) — never as a
 * background behind content. Falls back to a solid surface on older iOS, on
 * Android, and when Reduce Transparency is on.
 */
export function Glass({
  children,
  style,
  interactive = false,
  overMedia = false,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  /** Over photos/video/camera: always dark glass so white controls stay legible. */
  overMedia?: boolean;
}) {
  const c = useTheme();
  const { reduceTransparency } = useA11yPrefs();
  if (glassSupported && !reduceTransparency) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={overMedia ? 'dark' : 'auto'}
        isInteractive={interactive}
        style={[{ borderRadius: radius.pill, overflow: 'hidden' }, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        {
          borderRadius: radius.pill,
          backgroundColor: overMedia ? 'rgba(28,28,34,0.94)' : c.surfaceRaised,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: overMedia ? 'rgba(255,255,255,0.18)' : c.border,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          padding: space.lg,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
});
