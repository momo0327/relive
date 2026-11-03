import { Pressable, StyleSheet, View } from 'react-native';

import type { Member } from '@/lib/types';

import { Avatar } from './avatar';
import { withTap } from './haptics';
import { Icon, Txt } from './primitives';
import { Skeleton } from './skeleton';
import { useTheme } from './theme';

const SIZE = 36;
const MAX_SHOWN = 6;
/** Overlapping member avatars, optionally ending in an invite "+" button. */
export function MembersRow({ members, onInvite, size = SIZE }: { members: Member[]; onInvite?: () => void; size?: number }) {
  const c = useTheme();
  const OVERLAP = Math.round(size * 0.28);
  const circle = { width: size, height: size, borderRadius: size / 2 };
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
            size={size}
            style={[ring, { marginLeft: i === 0 ? 0 : -OVERLAP, zIndex: MAX_SHOWN - i }]}
          />
        ))}
        {extra > 0 ? (
          <View style={[styles.avatar, circle, ring, { backgroundColor: c.surface, marginLeft: -OVERLAP }]}>
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
          style={({ pressed }) => [styles.avatar, circle, ring, { backgroundColor: c.surface, marginLeft: -OVERLAP + 4, opacity: pressed ? 0.7 : 1 }]}>
          <Icon name="plus" size={Math.round(size * 0.4)} color={c.textSecondary} weight="semibold" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
});

/** Loading placeholder for MembersRow: overlapping circles with the app's skeleton ripple. */
export function MembersRowSkeleton({ count = 4, size = SIZE }: { count?: number; size?: number }) {
  const c = useTheme();
  const overlap = Math.round(size * 0.28);
  return (
    <View style={styles.row} accessible accessibilityLabel="Loading members">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          width={size}
          height={size}
          rounded={size / 2}
          order={i}
          style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: count - i, borderWidth: 2, borderColor: c.background }}
        />
      ))}
    </View>
  );
}
