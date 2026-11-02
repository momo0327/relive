import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Member } from '@/lib/types';

import { useA11yPrefs } from './a11y';
import { Avatar } from './avatar';
import { withTap } from './haptics';
import { Icon, Txt } from './primitives';
import { useTheme } from './theme';

const SIZE = 36;
const OVERLAP = 10;
const MAX_SHOWN = 6;
/** Overlapping member avatars, optionally ending in an invite "+" button. */
export function MembersRow({ members, onInvite }: { members: Member[]; onInvite?: () => void }) {
  const c = useTheme();
  const shown = members.slice(0, MAX_SHOWN);
  const extra = members.length - shown.length;
  const ring = { borderColor: c.background, borderWidth: 2 };
  const names = members.map((m) => (m.isMe ? 'you' : m.displayName)).join(', ');

  return (
    <View style={styles.row}>
      <View style={styles.row} accessible accessibilityLabel={`${members.length} members: ${names}`}>
        {shown.map((m, i) => (
          <Avatar
            key={m.userId}
            id={m.userId}
            name={m.displayName || (m.isMe ? 'You' : '?')}
            url={m.avatarUrl}
            color={m.avatarColor}
            size={SIZE}
            style={[ring, { marginLeft: i === 0 ? 0 : -OVERLAP, zIndex: MAX_SHOWN - i }]}
          />
        ))}
        {extra > 0 ? (
          <View style={[styles.avatar, ring, { backgroundColor: c.surface, marginLeft: -OVERLAP }]}>
            <Txt variant="caption" tone="secondary" maxFontSizeMultiplier={1.2}>
              +{extra}
            </Txt>
          </View>
        ) : null}
      </View>
      {onInvite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Invite friends"
          onPress={withTap(onInvite)}
          hitSlop={8}
          style={({ pressed }) => [styles.avatar, ring, { backgroundColor: c.surface, marginLeft: -OVERLAP + 4, opacity: pressed ? 0.7 : 1 }]}>
          <Icon name="plus" size={14} color={c.textSecondary} weight="semibold" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
});

/** Loading placeholder for MembersRow: overlapping circles with a soft ripple of light passing across them. */
export function MembersRowSkeleton({ count = 4 }: { count?: number }) {
  const c = useTheme();
  const { reduceMotion } = useA11yPrefs();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    clock.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [clock, reduceMotion]);
  return (
    <View style={styles.row} accessible accessibilityLabel="Loading members">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonDot key={i} index={i} count={count} clock={clock} ring={c.background} marginLeft={i === 0 ? 0 : -OVERLAP} />
      ))}
    </View>
  );
}

function SkeletonDot({
  index,
  count,
  clock,
  ring,
  marginLeft,
}: {
  index: number;
  count: number;
  clock: SharedValue<number>;
  ring: string;
  marginLeft: number;
}) {
  // Each circle brightens as the wave passes over it, left to right.
  const style = useAnimatedStyle(() => {
    const center = (index + 0.5) / count;
    const distance = Math.abs(clock.value * 1.6 - 0.3 - center);
    return { opacity: interpolate(distance, [0, 0.35], [0.55, 0.22], Extrapolation.CLAMP) };
  });
  return (
    <Animated.View
      style={[
        styles.avatar,
        { borderColor: ring, borderWidth: 2, marginLeft, zIndex: count - index, backgroundColor: '#FFFFFF' },
        style,
      ]}
    />
  );
}
