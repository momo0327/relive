import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { formatTripDates } from '@/lib/format';
import type { TripDetail } from '@/lib/types';

import { useLayout } from './layout';
import { MembersRow } from './members-row';
import { Txt } from './primitives';
import { space, useTheme } from './theme';
import { Cover, coverAspects } from './trip-visuals';

/** Height of the part of the banner that the page content overlaps. */
export const HERO_OVERLAP = 28;

/** '#RRGGBB' → 'rgba(r,g,b,a)'. */
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Trip page layout with a collapsing cover.
 *
 * Opens on the full-screen cover with the poster title (the home card's zoom
 * transition lands here). Scrolling up shrinks the photo into a banner while
 * the poster title fades out and the banner title, dates and members fade in,
 * and the page content slides up over it. Snaps to either state.
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
  // Collapsed banner: tall enough to feel like a poster, short enough that the
  // page content fits above the floating camera button on an iPhone.
  const banner = Math.max(insets.top + 250, Math.min(width * (regular ? 0.5 : 0.82), windowHeight * 0.4, 460));
  // Expanded: the cover at its own proportions (height ÷ width), full width.
  const key = trip.coverKey ?? trip.coverUrl ?? '';
  const [aspect, setAspect] = useState(() => coverAspects.get(key) ?? 5 / 4);
  const natural = Math.min(width * (trip.coverUrl ? aspect : 5 / 4), windowHeight * 0.9);
  // Wide photos are already shorter than the banner: show them as the banner directly.
  const full = natural - banner < 40 ? banner : natural;
  const distance = full - banner;

  const y = useSharedValue(0);
  const [collapsed, setCollapsed] = useState(distance <= 0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  useAnimatedReaction(
    () => distance <= 0 || y.value > distance * 0.6,
    (now, before) => {
      if (now !== before) scheduleOnRN(setCollapsed, now);
    },
  );

  // Photo layer: full screen → banner, then scrolls away with the content.
  const heroStyle = useAnimatedStyle(() => ({
    height: y.value < distance ? full - y.value : banner,
    transform: [{ translateY: y.value > distance ? distance - y.value : 0 }],
  }));
  const progress = () => {
    'worklet';
    return distance > 0 ? interpolate(y.value, [0, distance], [0, 1], Extrapolation.CLAMP) : 1;
  };
  const posterStyle = useAnimatedStyle(() => {
    const p = progress();
    return {
      opacity: interpolate(p, [0, 0.55], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 1], [1, 0.7]) }, { translateY: interpolate(p, [0, 1], [0, -24]) }],
    };
  });
  const bannerShadeStyle = useAnimatedStyle(() => ({ opacity: progress() }));
  const bannerTextStyle = useAnimatedStyle(() => {
    const p = progress();
    return {
      opacity: interpolate(p, [0.3, 0.8], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(p, [0.3, 0.8], [24, 0], Extrapolation.CLAMP) }],
    };
  });

  // Same place as on the home card, but clear of the back and ••• buttons.
  const posterTop = Math.max(full * 0.11, insets.top + 56);

  return (
    <View style={{ flex: 1 }}>
      {/* Light status bar text over the photo, while this screen is visible. */}
      <StatusBar style="light" />

      <Animated.View style={[styles.hero, { width }, heroStyle]} pointerEvents="none">
        {/* Landing spot for the home card's zoom transition. */}
        <Link.AppleZoomTarget>
          <View style={StyleSheet.absoluteFill}>
            <Cover
              uri={trip.coverUrl}
              cacheKey={trip.coverKey}
              seed={trip.id}
              scrim={false}
              instant
              onAspect={setAspect}
              style={styles.fill}
            />
          </View>
        </Link.AppleZoomTarget>

        {/* Expanded: poster look, like the home card. */}
        <Animated.View style={[StyleSheet.absoluteFill, posterStyle]}>
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
            locations={[0, 0.22, 0.45]}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ paddingTop: posterTop, paddingHorizontal: space.xl, alignItems: 'center' }}>
            <Txt numberOfLines={3} maxFontSizeMultiplier={1.3} style={styles.posterTitle}>
              {trip.name.toLocaleUpperCase()}
            </Txt>
            <Txt maxFontSizeMultiplier={1.3} style={styles.posterDates}>
              {formatTripDates(trip.startsAt, trip.unlocksAt).toLocaleUpperCase()}
            </Txt>
          </View>
        </Animated.View>

        {/* Collapsed: banner shading behind the header buttons and the name. */}
        <Animated.View style={[StyleSheet.absoluteFill, bannerShadeStyle]}>
          <LinearGradient colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)']} locations={[0, 0.3]} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', withAlpha(c.background, 0.75), c.background]}
            locations={[0.25, 0.55, 0.86, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        // The cover runs under the status bar and header.
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        snapToOffsets={distance > 0 ? [0, distance] : undefined}
        snapToEnd={false}
        decelerationRate="fast"
        refreshControl={refreshControl}
        contentContainerStyle={contentContainerStyle}>
        {/* Space over the cover; the banner's name, dates and members sit at its bottom. */}
        <View style={{ width, height: full - HERO_OVERLAP }} pointerEvents="box-none">
          <Animated.View
            style={[styles.bannerText, { left: gutter, right: gutter, bottom: space.xl }, bannerTextStyle]}
            pointerEvents={collapsed ? 'box-none' : 'none'}
            accessibilityElementsHidden={!collapsed}>
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
          </Animated.View>
        </View>
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  fill: { flex: 1, borderRadius: 0 },
  posterTitle: {
    fontFamily: 'ProtestStrike_400Regular',
    fontWeight: 'normal',
    fontSize: 64,
    lineHeight: 64,
    color: '#fff',
    textAlign: 'center',
  },
  posterDates: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 15,
    letterSpacing: 2.5,
    marginTop: -2,
    color: '#fff',
    textAlign: 'center',
  },
  bannerText: { position: 'absolute', gap: 2 },
});
