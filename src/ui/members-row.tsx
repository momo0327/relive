import { Pressable, StyleSheet, View } from 'react-native';

import type { Member } from '@/lib/types';

import { Avatar } from './avatar';
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
          onPress={onInvite}
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
