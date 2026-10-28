import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyError } from '@/lib/errors';
import { formatRevealMoment } from '@/lib/format';
import { cacheInvite, cachedInvite, inviteUrl } from '@/lib/invite-link';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/use-load';
import { useLayout } from '@/ui/layout';
import { MembersRow } from '@/ui/members-row';
import { Button, Icon, Row, Txt } from '@/ui/primitives';
import { ErrorState, LoadingState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';

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
  const message = `Join “${trip.name}” on L8R. Everything we capture stays hidden until the trip ends. ${link}`;
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
        <View style={{ alignItems: 'center', gap: space.xs }}>
          <Txt variant="title2" style={{ fontWeight: '700', textAlign: 'center' }} accessibilityRole="header">
            Invite to {trip.name}
          </Txt>
          <Txt variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            Friends who join can add memories until {formatRevealMoment(trip.unlocksAt)}.
          </Txt>
        </View>

        <MembersRow members={trip.members} />

        <Pressable
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel="Invite link"
          accessibilityHint="Copies the link"
          style={({ pressed }) => [styles.linkCard, { backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
          <Txt variant="caption" tone="secondary" style={styles.label}>
            INVITE LINK
          </Txt>
          <Txt variant="callout" style={{ textAlign: 'center', fontWeight: '600' }} numberOfLines={2}>
            {displayLink}
          </Txt>
          <Row gap={space.xs}>
            <Icon name={copied ? 'checkmark' : 'doc.on.doc'} size={13} color={copied ? c.success : c.textSecondary} />
            <Txt variant="footnote" tone={copied ? 'success' : 'secondary'}>
              {copied ? 'Copied' : 'Tap to copy'}
            </Txt>
          </Row>
        </Pressable>

        <Button
          title="Share invite link"
          icon="square.and.arrow.up"
          onPress={() => Share.share({ message })}
          style={{ alignSelf: 'stretch' }}
        />

        <View style={{ alignSelf: 'stretch', gap: space.sm }}>
          <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <Icon name="eye.slash" size={15} color={c.textSecondary} />
            <Txt variant="footnote" tone="secondary" style={{ flex: 1 }}>
              {mode === 'preview'
                ? 'Preview mode: this is a sample link and won’t work for anyone else.'
                : 'Anyone with the link can join. Nobody sees any memories until the trip ends.'}
            </Txt>
          </Row>
          {trip.isOwner ? (
            <Pressable onPress={makeNewLink} disabled={renewing} accessibilityRole="button" hitSlop={8}>
              <Txt variant="subhead" tone="accent" style={{ fontWeight: '600', marginLeft: 23 }}>
                {renewing ? 'Making a new link…' : 'Make a new link'}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xl },
  linkCard: { alignSelf: 'stretch', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, padding: space.xl },
  label: { letterSpacing: 1 },
});
