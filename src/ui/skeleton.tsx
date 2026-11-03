import { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useA11yPrefs } from './a11y';
import { radius, space, useTheme } from './theme';

const PULSE_MS = 700;
const STAGGER_MS = 90;

/**
 * Placeholder block with a soft "ripple": blocks brighten one after another
 * (by `order`), so a group of them shows a wave moving across. Still when
 * Reduce Motion is on.
 */
export function Skeleton({
  width,
  height,
  rounded = radius.md,
  order = 0,
  style,
}: {
  width?: DimensionValue;
  height: DimensionValue;
  rounded?: number;
  order?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const { reduceMotion } = useA11yPrefs();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    const ease = Easing.inOut(Easing.quad);
    glow.value = withDelay(
      order * STAGGER_MS,
      withRepeat(withSequence(withTiming(1, { duration: PULSE_MS, easing: ease }), withTiming(0, { duration: PULSE_MS, easing: ease })), -1),
    );
  }, [glow, order, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.45 + glow.value * 0.45 }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: rounded, backgroundColor: c.surface }, animated, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Wrapper that announces loading once for a group of skeleton blocks. */
export function SkeletonGroup({ label = 'Loading', style, children }: { label?: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <View style={style} accessible accessibilityLabel={label} accessibilityRole="progressbar">
      {children}
    </View>
  );
}

/** Poster-shaped cards, as on the home page. */
export function SkeletonCards({ count = 2, width }: { count?: number; width: number }) {
  return (
    <SkeletonGroup label="Loading trips" style={{ gap: space.lg }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={width} height={width * 1.25} rounded={radius.lg} order={i * 3} />
      ))}
    </SkeletonGroup>
  );
}

/** Grid of tiles (gallery, Unsplash). */
export function SkeletonGrid({
  columns,
  width,
  gap,
  rows = 3,
  ratios = [1.3, 1, 1.5, 1.15, 1.4, 0.9],
}: {
  columns: number;
  width: number;
  gap: number;
  rows?: number;
  ratios?: number[];
}) {
  const tile = (width - gap * (columns - 1)) / columns;
  return (
    <SkeletonGroup label="Loading" style={{ flexDirection: 'row', gap }}>
      {Array.from({ length: columns }, (_, col) => (
        <View key={col} style={{ gap }}>
          {Array.from({ length: rows }, (_, row) => (
            <Skeleton
              key={row}
              width={tile}
              height={tile * ratios[(col * rows + row) % ratios.length]}
              rounded={14}
              order={col + row * columns}
            />
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Settings-style rows: circle + two lines. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  const c = useTheme();
  return (
    <SkeletonGroup style={{ backgroundColor: c.surface, borderRadius: 24, padding: space.lg, gap: space.lg }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Skeleton width={36} height={36} rounded={18} order={i * 2} style={{ backgroundColor: c.background }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="55%" height={14} order={i * 2 + 1} style={{ backgroundColor: c.background }} />
            <Skeleton width="30%" height={10} order={i * 2 + 1} style={{ backgroundColor: c.background }} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Generic page: heading, a large block and a few lines. */
export function SkeletonPage({ label }: { label?: string }) {
  return (
    <SkeletonGroup label={label} style={{ flex: 1, padding: space.xl, paddingTop: space.xxl, gap: space.lg }}>
      <Skeleton width="60%" height={26} order={0} />
      <Skeleton width="40%" height={14} order={1} />
      <Skeleton height={180} rounded={radius.xl} order={2} />
      <Skeleton height={52} rounded={radius.md} order={3} />
      <Skeleton height={52} rounded={radius.md} order={4} />
    </SkeletonGroup>
  );
}
