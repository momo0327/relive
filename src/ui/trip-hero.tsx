import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatTripDates } from '@/lib/format';
import type { TripDetail } from '@/lib/types';

import { useLayout } from './layout';
import { MembersRow } from './members-row';
import { Txt } from './primitives';
import { space, useTheme } from './theme';
import { Cover } from './trip-visuals';

/** Height of the part of the banner that the page content may overlap. */
export const HERO_OVERLAP = 28;

/** '#RRGGBB' → 'rgba(r,g,b,a)'. */
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
/**
 * Full-width cover banner at the top of a trip page, running under the
 * status bar and header buttons. Name, dates and members sit bottom-left over
 * a dark fade; the banner's bottom edge fades into the page background.
 */
export function TripHero({ trip, onInvite }: { trip: TripDetail; onInvite?: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight, gutter, regular } = useLayout();
  // Tall enough to feel like a poster, short enough that the page content fits
  // above the floating camera button without scrolling on an iPhone.
  const height = Math.max(insets.top + 250, Math.min(width * (regular ? 0.5 : 0.82), windowHeight * 0.4, 460));

  return (
    <View style={{ width, height }}>
      {/* Light status bar text over the photo, while this screen is visible. */}
      <StatusBar style="light" />
      {/* Landing spot for the home card's zoom transition. */}
      <Link.AppleZoomTarget>
        <View style={styles.cover}>
          <Cover uri={trip.coverUrl} cacheKey={trip.coverKey} seed={trip.id} scrim={false} style={styles.fill} />
        </View>
      </Link.AppleZoomTarget>
      {/* Top: keeps the back and ••• buttons readable. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)']}
        locations={[0, 0.3]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Long, smooth fade into the page colour, starting high so there's no hard edge. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', withAlpha(c.background, 0.75), c.background]}
        locations={[0.25, 0.55, 0.86, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.text, { left: gutter, right: gutter, bottom: HERO_OVERLAP + space.xl }]}>
        <Txt
          variant="hero"
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
          style={{ color: '#fff', fontWeight: '700', fontSize: 38, lineHeight: 44 }}
          accessibilityRole="header">
          {trip.name}
        </Txt>
        <Txt variant="callout" style={{ color: 'rgba(255,255,255,0.88)' }}>
          {formatTripDates(trip.startsAt, trip.unlocksAt)}
        </Txt>
        <View style={{ marginTop: space.md }}>
          <MembersRow members={trip.members} onInvite={onInvite} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fill: { flex: 1, borderRadius: 0 },
  text: { position: 'absolute', gap: 2 },
});
