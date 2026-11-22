import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { friendlyError } from '@/lib/errors';
import { formatRevealMoment, formatTripDates, plural } from '@/lib/format';
import { parseInviteToken } from '@/lib/invite-link';
import { ensureNotificationPermission } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import type { InvitePreview } from '@/lib/types';
import { useLayout } from '@/ui/layout';
import { Button, Card, Icon, Row, Txt } from '@/ui/primitives';
import { LoadingState, MessageState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';
import { TripPoster } from '@/ui/trip-poster';

export default function JoinTrip() {
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = parseInviteToken(raw ?? '');
  const router = useRouter();
  const c = useTheme();
  const { signedIn, onboarded, mode, backend, setPendingInvite, signOut } = useSession();
  const { readableWidth } = useLayout();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const live = signedIn && mode === 'live';

  useEffect(() => {
    if (!live || !token) return;
    backend
      .previewInvite(token)
      .then(setPreview)
      .catch((e) => setError(friendlyError(e)));
  }, [live, token, backend]);

  // Not signed in (or onboarded) yet: remember the invite and continue after.
  const deferred = !!token && (!signedIn || !onboarded);
  useEffect(() => {
    if (deferred) setPendingInvite(token);
  }, [deferred, token, setPendingInvite]);

  if (deferred) return <Redirect href={signedIn ? '/onboarding' : '/welcome'} />;

  if (!token) {
    return <MessageState icon="link.badge.plus" title="This link doesn’t look right" message="Ask your friend to send the invite again." action={{ title: 'Go to my trips', onPress: () => router.replace('/') }} />;
  }

  if (mode === 'preview') {
    return (
      <MessageState
        icon="person.crop.circle.badge.plus"
        title="Sign in to join"
        message="You’re exploring the preview. Sign in with a real account to join this trip."
        action={{ title: 'Exit preview', onPress: async () => { setPendingInvite(token); await signOut(); } }}
      />
    );
  }

  if (error) return <MessageState icon="exclamationmark.triangle" title="Couldn’t open invite" message={error} action={{ title: 'Go to my trips', onPress: () => router.replace('/') }} />;
  if (preview === undefined) return <LoadingState label="Checking invite" />;
  if (preview === null) {
    return (
      <MessageState
        icon="link"
        title="This invite isn’t valid"
        message="It may have expired, been reset by the organizer, or the trip has already ended."
        action={{ title: 'Go to my trips', onPress: () => router.replace('/') }}
      />
    );
  }
  if (preview.banned) {
    return <MessageState icon="hand.raised" title="You can’t join this trip" message="The organizer removed you from this trip." action={{ title: 'Go to my trips', onPress: () => router.replace('/') }} />;
  }

  async function join() {
    setJoining(true);
    try {
      const tripId = await backend.acceptInvite(token!);
      if (!tripId) throw new Error('invalid_invite');
      ensureNotificationPermission().catch(() => undefined);
      router.replace(`/trips/${tripId}`);
    } catch (e) {
      Alert.alert('Couldn’t join', friendlyError(e, 'This invite is no longer valid.'));
      setJoining(false);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ alignItems: 'center', padding: space.xl }}>
      <View style={{ width: readableWidth, gap: space.xl }}>
        <View style={{ gap: space.md, alignItems: 'center' }}>
          <Txt variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {preview.alreadyMember ? 'You’re already in this trip' : `${preview.ownerName} invited you to`}
          </Txt>
          {/* The same card as on the home page. */}
          <View style={{ width: '100%', borderRadius: radius.lg, overflow: 'hidden' }}>
            <TripPoster
              name={preview.name}
              coverUrl={preview.coverUrl}
              coverKey={preview.coverKey}
              tone={preview.coverTone}
              seed={preview.tripId}
              createdAt={preview.createdAt}
            />
          </View>
          <Txt variant="subhead" tone="secondary" style={{ textAlign: 'center' }}>
            {formatTripDates(preview.startsAt, preview.unlocksAt)} · {plural(preview.memberCount, 'member')}
          </Txt>
        </View>

        <Card style={{ gap: space.md }}>
          <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
            <Icon name="lock.fill" size={16} color={c.locked} />
            <Txt variant="callout" tone="secondary" style={{ flex: 1 }}>
              Everything members add stays sealed until {formatRevealMoment(preview.unlocksAt)}. Then all trip members,
              including you, can see, save and share the photos and videos you add.
            </Txt>
          </Row>
        </Card>

        {preview.alreadyMember ? (
          <Button title="Open trip" onPress={() => router.replace(`/trips/${preview.tripId}`)} />
        ) : (
          <>
            <Button title="Join trip" onPress={join} loading={joining} />
            <Button title="Not now" kind="plain" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </ScrollView>
  );
}
