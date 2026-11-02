import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/use-load';
import { GalleryView } from '@/screens/gallery';
import { LockedTripView } from '@/screens/locked-trip';
import { ErrorState, LoadingState } from '@/ui/states';
import { withTap } from '@/ui/haptics';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { backend } = useSession();
  const { data: trip, error, reload } = useLoad(() => backend.getTrip(id));
  const polls = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  // The countdown hit zero on our clock. Ask the server, which decides; if it
  // still says locked (clock skew), check again a few times.
  const onCountdownElapsed = useCallback(() => {
    polls.current = 0;
    const check = async () => {
      await reload();
      polls.current += 1;
      if (polls.current < 6) pollTimer.current = setTimeout(check, 5000);
    };
    check();
  }, [reload]);

  useEffect(() => {
    if (trip?.status === 'revealed' && pollTimer.current) clearTimeout(pollTimer.current);
  }, [trip?.status]);

  const header = (
    <Stack.Screen
      options={{
        title: trip?.name ?? '',
        // The name and dates live in the cover banner.
        headerTitle: '',
        headerRight: undefined,
      }}
    />
  );

  if (!trip) {
    return (
      <>
        {header}
        {error ? <ErrorState message={error} onRetry={reload} /> : <LoadingState label="Loading trip" />}
      </>
    );
  }

  return (
    <>
      {header}
      {/* Native header item, drawn with Liquid Glass on iOS 26. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="ellipsis"
          accessibilityLabel="Trip options"
          onPress={withTap(() => router.push(`/trips/${id}/options`))}
        />
      </Stack.Toolbar>
      {trip.status === 'revealed' ? (
        <GalleryView trip={trip} />
      ) : (
        <LockedTripView trip={trip} onReload={reload} onCountdownElapsed={onCountdownElapsed} />
      )}
    </>
  );
}
