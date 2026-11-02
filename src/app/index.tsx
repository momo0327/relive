import { Link, Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { formatTripDates, plural } from '@/lib/format';
import { syncTripNotifications } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { setTripPreview } from '@/lib/trip-preview';
import type { TripSummary } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { useLayout } from '@/ui/layout';
import { FloatingButton } from '@/ui/floating-button';
import { ErrorState, LoadingState, MessageState } from '@/ui/states';
import { radius, space } from '@/ui/theme';
import { TripPoster } from '@/ui/trip-poster';
import { haptic, withTap } from '@/ui/haptics';

export default function MyTrips() {
  const router = useRouter();
  const { backend, pendingInvite, setPendingInvite, mode } = useSession();
  const { gutter, contentWidth, tripColumns } = useLayout();
  const { data, error, refreshing, reload } = useLoad(() => backend.listTrips());

  // Keep this device's reminders and reveal alerts in step with the trip list.
  useEffect(() => {
    if (data && mode === 'live') syncTripNotifications(data).catch(() => undefined);
  }, [data, mode]);

  // Continue an invite that was opened before signing in.
  useEffect(() => {
    if (pendingInvite && mode === 'live') {
      setPendingInvite(null);
      router.push(`/join/${pendingInvite}`);
    }
  }, [pendingInvite, mode, router, setPendingInvite]);

  // Native header items: iOS 26 draws each as its own Liquid Glass button.
  const header = (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="person.crop.circle" accessibilityLabel="Settings" onPress={withTap(() => router.push('/account'))} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="link" accessibilityLabel="Join a trip with a link" onPress={withTap(() => router.push('/join-link'))} />
      </Stack.Toolbar>

    </>
  );

  if (!data) {
    return (
      <>
        {header}
        {error ? <ErrorState message={error} onRetry={reload} /> : <LoadingState label="Loading trips" />}
      </>
    );
  }

  // One list, no headings: trips in progress first, then upcoming (soonest
  // first), then revealed (most recent first).
  const trips: TripSummary[] = [
    ...data.filter((t) => t.status === 'active'),
    ...data.filter((t) => t.status === 'upcoming').reverse(),
    ...data.filter((t) => t.status === 'revealed'),
  ];

  const cardWidth = (contentWidth - space.lg * (tripColumns - 1)) / tripColumns;

  return (
    <>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 120, alignItems: 'center' }}>
        <View style={{ width: contentWidth, gap: space.xl, paddingTop: space.md }}>
          {trips.length === 0 ? (
            <View style={{ minHeight: 420 }}>
              <MessageState
                icon="suitcase.rolling"
                title="No trips yet"
                message="Start a trip and invite your friends. Everything you capture stays sealed until the trip ends."
                action={{ title: 'Create a trip', onPress: () => router.push('/trips/new') }}
              />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }}>
              {trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} width={cardWidth} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      <FloatingButton icon="plus" variant="plain" label="New trip" onPress={() => router.push('/trips/new')} />
    </>
  );
}

function TripCard({ trip, width }: { trip: TripSummary; width: number }) {
  const a11y = [
    trip.name,
    formatTripDates(trip.startsAt, trip.unlocksAt),
    trip.status === 'revealed' ? 'Revealed' : 'Locked',
    plural(trip.memoryCount, 'memory', 'memories'),
  ].join(', ');

  // iOS zoom transition: the card grows to fill the screen and settles into the
  // trip page's banner (Link.AppleZoomTarget in TripHero).
  return (
    <Link
      href={`/trips/${trip.id}`}
      asChild
      onPress={() => {
        haptic.tap();
        setTripPreview(trip);
      }}>
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} style={{ width }}>
        <Link.AppleZoom>
          <View style={styles.zoomSource}>
            <TripPoster
              name={trip.name}
              coverUrl={trip.coverUrl}
              coverKey={trip.coverKey}
              tone={trip.coverTone}
              seed={trip.id}
              createdAt={trip.createdAt}
            />
          </View>
        </Link.AppleZoom>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  // Matches the poster's rounded corners so the zoom starts from the card shape.
  zoomSource: { borderRadius: radius.lg, overflow: 'hidden' },
});
