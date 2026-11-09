import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TripDetail } from "@/lib/types";

import { useLayout } from "./layout";
import { MembersRow, MembersRowSkeleton } from "./members-row";
import { space, useTheme } from "./theme";
import { Cover } from "./trip-visuals";

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
  children,
}: {
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
  const height = Math.max(
    insets.top + 250,
    Math.min(width * (regular ? 0.5 : 0.82), windowHeight * 0.4, 460),
  );

  // Sticky bar: appears when the in-page header would slide under the nav bar.
  const navBottom = insets.top + NAV_BAR_HEIGHT;
  const stickAt = height - HERO_OVERLAP + stickyOffset - navBottom;
  const y = useSharedValue(0);
  const [stuck, setStuck] = useState(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  useAnimatedReaction(
    () => !!stickyHeader && y.value >= stickAt,
    (now, before) => {
      if (now !== before) scheduleOnRN(setStuck, now);
    },
  );
  useEffect(() => onStuckChange?.(stuck), [stuck, onStuckChange]);
  const stickyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      y.value,
      [stickAt - 12, stickAt],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        // The banner runs under the status bar and header.
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        contentContainerStyle={contentContainerStyle}
      >
        {/* Light status bar text over the photo, while this screen is visible. */}
        <StatusBar style={stuck && c.scheme === 'light' ? 'dark' : 'light'} />
        <View style={{ width, height, marginBottom: -HERO_OVERLAP }}>
          {/* Landing spot for the home card's zoom transition. */}
          <Link.AppleZoomTarget>
            <View style={StyleSheet.absoluteFill}>
              <Cover
                uri={trip.coverUrl}
                cacheKey={trip.coverKey}
                seed={trip.id}
                scrim={false}
                instant
                style={styles.fill}
              />
            </View>
          </Link.AppleZoomTarget>
          {/* Top: keeps the back and ••• buttons readable. */}
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]}
            locations={[0, 0.45]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* Long, smooth fade into the page colour, starting high so there's no hard edge. */}
          <LinearGradient
            colors={[
              "rgba(0,0,0,0)",
              "rgba(0,0,0,0.35)",
              withAlpha(c.background, 0.75),
              c.background,
            ]}
            locations={[0.25, 0.55, 0.86, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* Name and dates are the header's title (crisp, see the trip screen); members sit just below. */}
          <View
            style={[styles.text, { top: insets.top + 50, left: 64, right: 64 }]}
          >
            <View
              style={{
                marginTop: space.sm,
                minHeight: 28,
                alignItems: "center",
              }}
            >
              {trip.members.length ? (
                <MembersRow
                  members={trip.members}
                  onInvite={onInvite}
                  size={28}
                />
              ) : (
                <MembersRowSkeleton
                  count={Math.min(Math.max(trip.memberCount, 2), 6)}
                  size={28}
                />
              )}
            </View>
          </View>
        </View>
        {children}
      </Animated.ScrollView>
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
          pointerEvents={stuck ? "box-none" : "none"}
          accessibilityElementsHidden={!stuck}
        >
          <View
            style={{ width, alignItems: "center", paddingBottom: space.sm }}
          >
            {stickyHeader}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const NAV_BAR_HEIGHT = 54;

const styles = StyleSheet.create({
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fill: { flex: 1, borderRadius: 0 },
  text: { position: "absolute", alignItems: "center", gap: 1 },
  title: {
    fontSize: 19,
    lineHeight: 30,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
});
