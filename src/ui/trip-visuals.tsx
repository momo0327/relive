import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { serverNowMs } from '@/lib/clock';

import { radius } from './theme';

const gradients: [string, string][] = [
  ['#3B2A5C', '#0B0B0F'], ['#2A4A5C', '#0B0B0F'], ['#5C3A2A', '#0B0B0F'],
  ['#2A5C47', '#0B0B0F'], ['#5C2A4A', '#0B0B0F'], ['#4A4A2A', '#0B0B0F'],
];

function gradientFor(seed: string): [string, string] {
  // FNV-1a: similar ids (shared prefixes) still spread across the palette.
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  return gradients[(hash >>> 0) % gradients.length];
}

/** Trip cover photo (chosen by the creator, not a trip memory) or a gradient. */
export function Cover({
  uri,
  cacheKey,
  seed,
  style,
  children,
  scrim = true,
}: {
  uri: string | null;
  cacheKey: string | null;
  seed: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Bottom darkening for text laid along the bottom edge. */
  scrim?: boolean;
}) {
  return (
    <View style={[styles.cover, style]}>
      {uri ? (
        <Image
          source={{ uri, cacheKey: cacheKey ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <LinearGradient colors={gradientFor(seed)} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      )}
      {scrim ? (
        // Legibility scrim for text laid along the bottom of the photo.
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}

/**
 * Milliseconds until the reveal on the server-anchored clock, ticking every
 * second. Calls onElapsed once when it reaches zero.
 */
export function useCountdown(unlocksAt: Date, onElapsed?: () => void) {
  // Depend on the timestamp, not the Date object, so reloads don't re-fire onElapsed.
  const target = unlocksAt.getTime();
  const [remaining, setRemaining] = useState(() => target - serverNowMs());
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const ms = target - serverNowMs();
      setRemaining(ms);
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        onElapsed?.();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, onElapsed]);

  return remaining;
}

const styles = StyleSheet.create({
  cover: { borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end' },
});
