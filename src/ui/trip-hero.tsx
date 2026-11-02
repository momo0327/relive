import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatTripDates } from '@/lib/format';
import type { TripDetail } from '@/lib/types';

import { useLayout } from './layout';
import { MembersRow } from './members-row';
import { Txt } from './primitives';
import { space, useTheme } from './theme';
import { Cover } from './trip-visuals';

/** Height of the part of the banner that the page content overlaps. */
export const HERO_OVERLAP = 28;

/** '#RRGGBB' → 'rgba(r,g,b,a)'. */
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Trip page layout: a full-width cover banner (name, dates, members) under the
 * status bar and header buttons, fading into the page, with the page content
 * overlapping its bottom edge. The banner is the landing spot for the home
 * card's zoom transition, so tapping a card morphs straight into this layout.
 */
export function TripHeroScroll({
  trip,
  onInvite,
  refreshControl,
  contentContainerStyle,
  children,
}: {
  trip: TripDetail;
  onInvite?: () => void;
  refreshControl?: ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight, gutter, regular } = useLayout();
  // Tall enough to feel like a poster, short enough that the page content fits
  // above the floating camera button without scrolling on an iPhone.
  const height = Math.max(insets.top + 250, Math.min(width * (regular ? 0.5 : 0.82), windowHeight * 0.4, 460));

  return (
    <ScrollView
      // The banner runs under the status bar and header.
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}>
      {/* Light status bar text over the photo, while this screen is visible. */}
      <StatusBar style="light" />
      <View style={{ width, height, marginBottom: -HERO_OVERLAP }}>
        {/* Landing spot for the home card's zoom transition. */}
        <Link.AppleZoomTarget>
          <View style={StyleSheet.absoluteFill}>
            <Cover uri={trip.coverUrl} cacheKey={trip.coverKey} seed={trip.id} scrim={false} instant style={styles.fill} />
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
          {/* Same height while members load, so nothing shifts when they appear. */}
          <View style={{ marginTop: space.md, minHeight: 36 }}>
            {trip.members.length ? <MembersRow members={trip.members} onInvite={onInvite} /> : null}
          </View>
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, borderRadius: 0 },
  text: { position: 'absolute', gap: 2 },
});
