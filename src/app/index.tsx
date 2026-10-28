import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { formatTripDates, plural } from '@/lib/format';
import { syncTripNotifications } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import type { TripSummary } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { useLayout } from '@/ui/layout';
import { FloatingButton } from '@/ui/floating-button';
import { Txt } from '@/ui/primitives';
import { ErrorState, LoadingState, MessageState } from '@/ui/states';
import { space, useTheme } from '@/ui/theme';
import { TripPoster } from '@/ui/trip-poster';

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
        <Stack.Toolbar.Button icon="person.crop.circle" accessibilityLabel="Settings" onPress={() => router.push('/account')} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="link" accessibilityLabel="Join a trip with a link" onPress={() => router.push('/join-link')} />
      </Stack.Toolbar>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Txt maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.wordmark}>
              relive
            </Txt>
          ),
        }}
      />
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
          <PageHeading title="Memories" />
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
  const router = useRouter();
  const a11y = [
    trip.name,
    formatTripDates(trip.startsAt, trip.unlocksAt),
    trip.status === 'revealed' ? 'Revealed' : 'Locked',
    plural(trip.memoryCount, 'memory', 'memories'),
  ].join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => router.push(`/trips/${trip.id}`)}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}>
      <TripPoster name={trip.name} coverUrl={trip.coverUrl} coverKey={trip.coverKey} tone={trip.coverTone} seed={trip.id} />
    </Pressable>
  );
}

/** Centred page heading with a sketched double underline, like a pen mark. */
function PageHeading({ title }: { title: string }) {
  const c = useTheme();
  return (
    <View style={styles.heading}>
      <Txt variant="largeTitle" accessibilityRole="header" style={{ fontWeight: '600', letterSpacing: -0.3 }}>
        {title}
      </Txt>
      <View style={styles.underline} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.stroke, { backgroundColor: c.text, width: '108%', transform: [{ rotate: '-1.2deg' }] }]} />
        <View style={[styles.stroke, { backgroundColor: c.text, width: '96%', marginTop: 3, opacity: 0.85, transform: [{ rotate: '0.6deg' }, { translateX: 4 }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { fontFamily: 'Inter_600SemiBold', fontWeight: '600', fontSize: 21, letterSpacing: -0.3 },
  heading: { alignSelf: 'center', alignItems: 'center', marginBottom: space.sm },
  underline: { alignSelf: 'stretch', alignItems: 'center', marginTop: 2 },
  stroke: { height: 2, borderRadius: 1 },
});
