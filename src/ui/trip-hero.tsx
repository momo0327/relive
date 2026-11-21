import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TripDetail } from '@/lib/types';

import { useLayout } from './layout';
import { MembersRow, MembersRowSkeleton } from './members-row';
import { lockedPageColor, space, useTheme } from './theme';
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
  stickyHeader,
  stickyOffset = 0,
  onStuckChange,
  onScrollY,
  list,
  immersive = false,
  children,
}: {
  /**
   * Locked page look: the cover runs on behind the content, blurring and
   * fading out gradually (instead of washing to the page colour right under
   * the banner), so frosted cards can sit on it.
   */
  immersive?: boolean;
  /**
   * Virtualised list under the header (e.g. the gallery grid). `children`
   * then become the list's header, after the banner.
   */
  list?: {
    data: readonly unknown[];
    renderItem: (info: { item: unknown; index: number }) => ReactElement | null;
    keyExtractor: (item: unknown, index: number) => string;
    numColumns?: number;
    masonry?: boolean;
    contentPadding?: number;
    /** Separate recycling pools for cells with different contents (e.g. photo / video). */
    getItemType?: (item: unknown) => string;
  };
  /** Throttled vertical offset, for loading only what's on screen. */
  onScrollY?: (y: number) => void;
  trip: TripDetail;
  onInvite?: () => void;
  refreshControl?: ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Pinned under the header once the page scrolls past it (e.g. the gallery filter). */
  stickyHeader?: ReactNode;
  /** Where the in-page copy of the sticky header starts, measured from the banner's bottom edge. */
  stickyOffset?: number;
  onStuckChange?: (stuck: boolean) => void;
  children: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight, regular } = useLayout();
  // Tall enough to feel like a poster, short enough that the page content fits
  // above the floating camera button without scrolling on an iPhone.
  const height = Math.max(insets.top + 250, Math.min(width * (regular ? 0.5 : 0.82), windowHeight * 0.4, 460));

  // Sticky bar: appears when the in-page header would slide under the nav bar.
  const navBottom = insets.top + NAV_BAR_HEIGHT;
  const stickAt = height - HERO_OVERLAP + stickyOffset - navBottom;
  const y = useSharedValue(0);
  const [stuck, setStuck] = useState(false);
  const lastReported = useSharedValue(-1000);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
    // Report every ~250 pt of movement; enough for windowing, cheap for JS.
    if (onScrollY && Math.abs(e.contentOffset.y - lastReported.value) > 250) {
      lastReported.value = e.contentOffset.y;
      scheduleOnRN(onScrollY, e.contentOffset.y);
    }
  });
  useAnimatedReaction(
    () => !!stickyHeader && y.value >= stickAt,
    (now, before) => {
      if (now !== before) scheduleOnRN(setStuck, now);
    },
  );
  useEffect(() => onStuckChange?.(stuck), [stuck, onStuckChange]);
  const stickyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [stickAt - 12, stickAt], [0, 1], Extrapolation.CLAMP),
  }));

  const [immersiveReady, setImmersiveReady] = useState(false);
  useEffect(() => {
    if (!immersive) return;
    const timer = setTimeout(() => setImmersiveReady(true), 450);
    return () => clearTimeout(timer);
  }, [immersive]);

  const header = (
    <>
      {/* Light status bar text over the photo, while this screen is visible. */}
      <StatusBar style={stuck && c.scheme === 'light' ? 'dark' : 'light'} />
      <View style={{ width, height, marginBottom: -HERO_OVERLAP }}>
        {/* Landing spot for the home card's zoom transition. */}
        <Link.AppleZoomTarget>
          <View style={StyleSheet.absoluteFill}>
            <Cover uri={trip.coverUrl} cacheKey={trip.coverKey} seed={trip.id} scrim={false} instant style={styles.fill} />
          </View>
        </Link.AppleZoomTarget>
        {/* Top: keeps the back and ••• buttons readable. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']}
          locations={[0, 0.45]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Revealed page: the photo as it is, no fade or blur. */}
        {immersive && immersiveReady ? (
          // Built only after the zoom transition, then faded in, so opening the trip stays smooth.
          <Animated.View entering={FadeIn.duration(220)} pointerEvents="none" style={styles.immersiveLayer}>
            <ImmersiveCover trip={trip} width={width} height={height + IMMERSIVE_EXTRA} />
          </Animated.View>
        ) : null}
        {/* Name and dates are the header's title (crisp, see the trip screen); members sit just below. */}
        <View style={[styles.text, { top: insets.top + 50, left: 64, right: 64 }]}>
          <View
            style={{
              marginTop: space.sm,
              minHeight: 28,
              alignItems: 'center',
            }}>
            {trip.members.length ? (
              <MembersRow members={trip.members} onInvite={onInvite} size={28} />
            ) : (
              <MembersRowSkeleton count={Math.min(Math.max(trip.memberCount, 2), 6)} size={28} />
            )}
          </View>
        </View>
      </View>
    </>
  );

  const scrollProps = {
    onScroll,
    scrollEventThrottle: 16,
    // The banner runs under the status bar and header.
    contentInsetAdjustmentBehavior: 'never' as const,
    showsVerticalScrollIndicator: false,
    refreshControl,
  };

  return (
    <View style={{ flex: 1 }}>
      {list ? (
        <AnimatedFlashList
          {...scrollProps}
          data={list.data}
          renderItem={list.renderItem}
          keyExtractor={list.keyExtractor}
          numColumns={list.numColumns}
          masonry={list.masonry}
          getItemType={list.getItemType}
          // Draw about a screen ahead, so a fast flick never shows empty cells.
          drawDistance={windowHeight}
          contentContainerStyle={{ paddingHorizontal: list.contentPadding ?? 0, paddingBottom: 140 }}
          ListHeaderComponent={
            <View style={{ marginHorizontal: -(list.contentPadding ?? 0) }}>
              {header}
              {children}
            </View>
          }
        />
      ) : (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          // The banner runs under the status bar and header.
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          contentContainerStyle={contentContainerStyle}>
          {header}
          {children}
        </Animated.ScrollView>
      )}
      {stickyHeader ? (
        <Animated.View
          style={[
            styles.sticky,
            {
              paddingTop: navBottom,
              backgroundColor: c.background,
              borderBottomColor: c.border,
            },
            stickyStyle,
          ]}
          pointerEvents={stuck ? 'box-none' : 'none'}
          accessibilityElementsHidden={!stuck}>
          <View style={{ width, alignItems: 'center', paddingBottom: space.sm }}>{stickyHeader}</View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const NAV_BAR_HEIGHT = 54;
/** How far the immersive cover runs on below the banner. */
const IMMERSIVE_EXTRA = 160;
/** The sharp photo fades into the blurred copy over this range (fractions of the height), in thin steps. */
const FADE_FROM = 0.4;
const FADE_TO = 0.72;
const FADE_STEPS = 6;
/** The blurred copy is drawn this many times smaller, then scaled up. */
const BLUR_SCALE = 10;

/**
 * Locked page background: the cover, blurring out as it runs down behind the
 * cards and fading into the page. Built from plain images (a blurred copy,
 * blurred once when decoded, with the sharp photo fading into it in thin
 * slices) instead of live blur layers, so opening and closing stay fast.
 */
function ImmersiveCover({ trip, width, height }: { trip: TripDetail; width: number; height: number }) {
  const c = useTheme();
  // Fades into the locked page's colour.
  const page = lockedPageColor(c.scheme, c.background);
  const source = trip.coverUrl ? { uri: trip.coverUrl, cacheKey: trip.coverKey ?? undefined } : null;
  const step = (FADE_TO - FADE_FROM) / FADE_STEPS;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height, overflow: 'hidden' }}>
      {source ? (
        <>
          {/* Blurred copy: a tiny version of the photo, lightly blurred and scaled up
              (looks the same as blurring the full image, at a fraction of the work). */}
          <Image
            source={source}
            blurRadius={3}
            style={{
              position: 'absolute',
              width: width / BLUR_SCALE,
              height: height / BLUR_SCALE,
              left: (width - width / BLUR_SCALE) / 2,
              top: (height - height / BLUR_SCALE) / 2,
              transform: [{ scale: BLUR_SCALE }],
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
          {[
            { top: 0, size: FADE_FROM, opacity: 1 },
            ...Array.from({ length: FADE_STEPS }, (_, i) => ({
              top: FADE_FROM + step * i,
              size: step,
              opacity: 1 - (i + 1) / (FADE_STEPS + 1),
            })),
          ].map((slice) => (
            <View
              key={slice.top}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: slice.top * height,
                height: slice.size * height + 1,
                overflow: 'hidden',
                opacity: slice.opacity,
              }}>
              <Image
                source={source}
                style={{ position: 'absolute', left: 0, right: 0, top: -slice.top * height, height }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
            </View>
          ))}
        </>
      ) : (
        <Cover uri={null} cacheKey={null} seed={trip.id} scrim={false} instant style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', withAlpha(page, 0.6), page]}
        locations={[0, 0.22, 0.55, 0.82, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
// Reanimated scroll handler on a virtualised list.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList as any) as any;

const styles = StyleSheet.create({
  immersiveLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  sticky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fill: { flex: 1, borderRadius: 0 },
  text: { position: 'absolute', alignItems: 'center', gap: 1 },
  title: {
    fontSize: 19,
    lineHeight: 30,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
});
