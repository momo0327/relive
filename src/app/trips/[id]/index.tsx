import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatTripDates } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getTripPreview } from '@/lib/trip-preview';
import { useLoad } from '@/lib/use-load';
import { GalleryView } from '@/screens/gallery';
import { LockedTripView } from '@/screens/locked-trip';
import { ErrorState, LoadingState } from '@/ui/states';
import { withTap } from '@/ui/haptics';
import { Txt } from '@/ui/primitives';
import { useTheme } from '@/ui/theme';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { backend } = useSession();
  const c = useTheme();
  // Once the gallery filter is pinned, the header sits on the page colour instead of the photo.
  const [stuck, setStuck] = useState(false);
  const { data: loaded, error, reload } = useLoad(() => backend.getTrip(id), { refocusAfterMs: 60_000 });
  // Until the details arrive, draw from the home card's data so the zoom
  // transition lands on the cover, not a loading screen.
  const [preview] = useState(() => getTripPreview(id));
  const trip = loaded ?? preview;
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
        // Name and dates as the header's own title: iOS keeps it crisp, whereas
        // anything of ours drawn behind the bar gets faded by the iOS 26 edge effect.
        headerTitle: trip
          ? () => (
              <View style={{ alignItems: 'center' }} accessible accessibilityRole="header">
                <Txt numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: stuck ? c.text : '#fff', fontSize: 17, fontWeight: '700' }}>
                  {trip.name}
                </Txt>
                <Txt variant="caption" numberOfLines={1} maxFontSizeMultiplier={1.3} tone="secondary" style={stuck ? undefined : { color: 'rgba(255,255,255,0.85)' }}>
                  {formatTripDates(trip.startsAt, trip.unlocksAt)}
                </Txt>
              </View>
            )
          : () => null,
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
        <GalleryView trip={trip} onStuckChange={setStuck} />
      ) : (
        <LockedTripView trip={trip} onReload={reload} onCountdownElapsed={onCountdownElapsed} />
      )}
    </>
  );
}
