import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyError } from '@/lib/errors';
import { cacheInvite, cachedInvite, inviteUrl } from '@/lib/invite-link';
import { useSession } from '@/lib/session';
import type { Member, TripDetail } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { useA11yPrefs } from '@/ui/a11y';
import { Avatar } from '@/ui/avatar';
import { useLayout } from '@/ui/layout';
import { Button, Icon, Row, Txt } from '@/ui/primitives';
import { ErrorState, LoadingState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';
import { withTap } from '@/ui/haptics';
import { TripPoster } from '@/ui/trip-poster';

/** Invite Friends sheet: one link, one big share button, and "Make a new link" for the organizer. */
export default function Invite() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { readableWidth } = useLayout();
  const { backend, mode } = useSession();
  const [copied, setCopied] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const { data, error, reload, setData } = useLoad(async () => {
    const trip = await backend.getTrip(id);
    let token = mode === 'live' ? await cachedInvite(id) : null;
    if (!token) {
      token = await backend.createInvite(id);
      if (mode === 'live') await cacheInvite(id, token);
    }
    return { trip, link: inviteUrl(token) };
  });

  if (!data) return error ? <ErrorState message={error} onRetry={reload} /> : <LoadingState label="Creating invite link" />;
  const { trip, link } = data;
  const message = `Join “${trip.name}” on Relive. Everything we capture stays hidden until the trip ends. ${link}`;
  const displayLink = link.replace(/^[a-z]+:\/\//, '');

  async function copy() {
    await Clipboard.setStringAsync(link);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function makeNewLink() {
    Alert.alert('Make a new link?', 'Every link shared so far stops working. People already in the trip stay in it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make new link',
        style: 'destructive',
        onPress: async () => {
          setRenewing(true);
          try {
            await backend.revokeInvites(id);
            const token = await backend.createInvite(id);
            if (mode === 'live') await cacheInvite(id, token);
            setData({ trip, link: inviteUrl(token) });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          } catch (e) {
            Alert.alert('Couldn’t make a new link', friendlyError(e));
          } finally {
            setRenewing(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
      <View style={{ width: readableWidth, gap: space.lg, alignItems: 'center' }}>
        <InviteHero trip={trip} />

        <View style={{ alignItems: 'center', gap: space.xs }}>
          <Txt variant="title2" style={{ fontWeight: '700', textAlign: 'center' }} accessibilityRole="header">
            Share with friends
          </Txt>
          <Txt variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            Give your friends access to {trip.name} and count down to the reveal together.
          </Txt>
        </View>

        <Pressable
          onPress={withTap(copy)}
          accessibilityRole="button"
          accessibilityLabel="Invite link"
          accessibilityHint="Copies the link"
          style={({ pressed }) => [styles.linkCard, { backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
          <Icon name="link" size={16} color={c.textSecondary} />
          <Txt variant="subhead" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
            {displayLink}
          </Txt>
          <Row gap={4}>
            <Icon name={copied ? 'checkmark' : 'doc.on.doc'} size={13} color={copied ? c.success : c.textSecondary} />
            <Txt variant="footnote" tone={copied ? 'success' : 'secondary'}>
              {copied ? 'Copied' : 'Copy'}
            </Txt>
          </Row>
        </Pressable>

        <Button title="Invite Friends" onPress={() => Share.share({ message })} style={{ alignSelf: 'stretch' }} />

        {mode === 'preview' || trip.isOwner ? (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            {mode === 'preview' ? (
              <Txt variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                Preview mode: this is a sample link and won’t work for anyone else.
              </Txt>
            ) : null}
            {trip.isOwner ? (
              <Pressable onPress={withTap(makeNewLink)} disabled={renewing} accessibilityRole="button" hitSlop={8}>
                <Txt variant="footnote" tone="secondary" style={{ fontWeight: '600', textDecorationLine: 'underline' }}>
                  {renewing ? 'Making a new link…' : 'Make a new link'}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Emoji faces that float around the card when there are few member photos. */
const FACES = ['🥳', '😎', '🤩'];

/**
 * The trip's card (same poster as on the home page) with members' faces
 * floating around it, gently bobbing.
 */
function InviteHero({ trip }: { trip: TripDetail }) {
  const withPhotos = trip.members.filter((m) => m.avatarUrl).slice(0, 3);
  const bubbles: ({ kind: 'member'; member: Member } | { kind: 'emoji'; face: string })[] = [
    ...withPhotos.map((member) => ({ kind: 'member' as const, member })),
    ...FACES.map((face) => ({ kind: 'emoji' as const, face })),
  ].slice(0, 3);
  return (
    <View style={styles.hero} accessible accessibilityLabel={`${trip.name} trip card`}>
      <View style={styles.heroCard}>
        <TripPoster
          name={trip.name}
          coverUrl={trip.coverUrl}
          coverKey={trip.coverKey}
          tone={trip.coverTone}
          seed={trip.id}
          createdAt={trip.createdAt}
          compact
        />
      </View>
      {bubbles.map((b, i) => (
        <Floating key={i} index={i} style={BUBBLE_SPOTS[i]}>
          {b.kind === 'member' ? (
            <Avatar id={b.member.userId} name={b.member.displayName} url={b.member.avatarUrl} color={b.member.avatarColor} size={BUBBLE_SPOTS[i].width - 8} />
          ) : (
            <Text style={{ fontSize: (BUBBLE_SPOTS[i].width as number) * 0.5 }}>{b.face}</Text>
          )}
        </Floating>
      ))}
    </View>
  );
}

const BUBBLE_SPOTS = [
  { width: 64, height: 64, top: -6, right: 30 },
  { width: 58, height: 58, bottom: 10, left: 22 },
  { width: 44, height: 44, top: 22, left: 40 },
];

/** A white bubble that bobs up and down (still with Reduce Motion). */
function Floating({ index, style, children }: { index: number; style: object; children: React.ReactNode }) {
  const { reduceMotion } = useA11yPrefs();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    y.value = withDelay(
      index * 400,
      withRepeat(withSequence(withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })), -1),
    );
  }, [index, reduceMotion, y]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.bubble, style, animated]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  sheet: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xl },
  linkCard: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, paddingHorizontal: space.lg, minHeight: 52 },
  hero: { width: 300, height: 230, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    width: 160,
    borderRadius: 22,
    overflow: 'hidden',
    transform: [{ rotate: '-3deg' }],
  },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
