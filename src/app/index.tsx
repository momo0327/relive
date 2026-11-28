import { Link, Stack, useNavigation, useRouter } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { formatTripDates, plural } from '@/lib/format';
import { syncTripNotifications } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { onTripListChange, takeTripListStale, withLocalCover } from '@/lib/trip-list';
import { setTripPreview } from '@/lib/trip-preview';
import type { TripSummary } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { useLayout } from '@/ui/layout';
import { SkeletonCards } from '@/ui/skeleton';
import { ErrorState, MessageState } from '@/ui/states';
import { radius, space, useTheme } from '@/ui/theme';
import { TripPoster } from '@/ui/trip-poster';
import { haptic, withTap } from '@/ui/haptics';

export default function MyTrips() {
  const router = useRouter();
  const { backend, pendingInvite, setPendingInvite, mode } = useSession();
  const { gutter, contentWidth, tripColumns } = useLayout();
  // The app's grey (cards, fields), used as the tint of the header's glass buttons.
  const c = useTheme();
  const {
    data: loaded,
    error,
    refreshing,
    reload,
    refresh,
    setData,
  } = useLoad(() => backend.listTrips(), { refocusAfterMs: 60_000, stale: takeTripListStale });
  // Trips created, deleted or left elsewhere show up here instantly.
  useEffect(
    () =>
      onTripListChange((edit) => {
        if (edit) setData((prev) => (prev ? edit(prev) : prev));
        // Background refresh: silent, never the pull-to-refresh spinner.
        else refresh();
      }),
    [setData, refresh],
  );
  const data = loaded ? loaded.map(withLocalCover) : null;

  // Like Photos: while a closing trip's card is flying back into the list
  // (iOS's zoom animation, ~0.45 s, measured from a screen recording), the list
  // doesn't scroll. iOS animates the card to where it was when closing began,
  // so scrolling during the flight made it land on top of other cards. The
  // pause starts when the trip page starts closing and ends as the card lands.
  // (iOS's own "transition ended" signal arrives at the start of the zoom, so
  // it can't be used here.)
  const navigation = useNavigation();
  const [cardFlying, setCardFlying] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasAway = false;
    const offBlur = navigation.addListener('blur', () => {
      wasAway = true;
    });
    const offFocus = navigation.addListener('focus', () => {
      // Only when coming back to the list, not when the app first opens.
      if (!wasAway) return;
      wasAway = false;
      setCardFlying(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setCardFlying(false), CARD_FLIGHT_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      offBlur();
      offFocus();
    };
  }, [navigation]);


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
        <Stack.Toolbar.Button
          icon="person.crop.circle"
          variant="prominent"
          tintColor={c.surface}
          accessibilityLabel="Settings"
          onPress={withTap(() => router.push('/account'))}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="link"
          separateBackground
          variant="prominent"
          tintColor={c.surface}
          accessibilityLabel="Join a trip with a link"
          onPress={withTap(() => router.push('/join-link'))}
        />
        <Stack.Toolbar.Button
          icon="plus"
          separateBackground
          variant="prominent"
          tintColor={c.surface}
          accessibilityLabel="New trip"
          onPress={withTap(() => router.push('/trips/new'))}
        />
      </Stack.Toolbar>
    </>
  );

  if (!data) {
    return (
      <>
        {header}
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            scrollEnabled={false}
            contentContainerStyle={{ alignItems: 'center', paddingTop: space.md }}>
            <SkeletonCards width={contentWidth} />
          </ScrollView>
        )}
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
        scrollEnabled={!cardFlying}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.xxxl, alignItems: 'center' }}>
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
    </>
  );
}

/** A tap may wobble this much (points); anything more is a swipe and doesn't open the card. */
const TAP_SLOP = 8;

/** How long iOS's zoom-back animation takes to land the card (from a recording). */
const CARD_FLIGHT_MS = 450;

// Redrawn only when what the card shows changes, so returning home (or a
// background refresh) doesn't re-lay out the cards under the zoom-back animation.
const TripCard = memo(
  function TripCard({ trip, width }: { trip: TripSummary; width: number }) {
    const touchStart = useRef<{ x: number; y: number } | null>(null);
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
        onPress={(e) => {
          // A swipe that started on a card (even a short one) must scroll, never open it.
          const start = touchStart.current;
          const { pageX, pageY } = e.nativeEvent;
          if (start && Math.hypot(pageX - start.x, pageY - start.y) > TAP_SLOP) {
            e.preventDefault();
            return;
          }
          haptic.tap();
          setTripPreview(trip);
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11y}
          style={{ width }}
          onPressIn={(e) => {
            touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          }}>
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
  },
  (a, b) =>
    a.width === b.width &&
    a.trip.id === b.trip.id &&
    a.trip.name === b.trip.name &&
    a.trip.coverUrl?.split('?')[0] === b.trip.coverUrl?.split('?')[0] &&
    a.trip.coverKey === b.trip.coverKey &&
    a.trip.coverTone === b.trip.coverTone &&
    a.trip.status === b.trip.status &&
    a.trip.memoryCount === b.trip.memoryCount &&
    +a.trip.startsAt === +b.trip.startsAt &&
    +a.trip.unlocksAt === +b.trip.unlocksAt &&
    +(a.trip.createdAt ?? 0) === +(b.trip.createdAt ?? 0),
);

const styles = StyleSheet.create({
  // Matches the poster's rounded corners so the zoom starts from the card shape.
  zoomSource: { borderRadius: radius.lg, overflow: 'hidden' },
});
