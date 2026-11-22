import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from './primitives';

/** Colours offered in Edit Profile; also the deterministic fallback palette. */
export const AVATAR_COLORS = ['#7C6FE0', '#5B7FD6', '#4FA3A5', '#6E9E4F', '#B5913A', '#D9825B', '#E0605E', '#C2589B'];

function tintFor(id: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Storage path of a signed URL (without the expiring token), for image caching. */
function stableKey(url: string) {
  return url.split('?')[0];
}

/** Profile photo if there is one, otherwise initials on the chosen (or derived) colour. */
export function Avatar({
  id,
  name,
  url,
  color,
  size,
  style,
}: {
  id: string;
  name: string;
  url?: string | null;
  color?: string | null;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? tintFor(id) },
        styles.base,
        style,
      ]}>
      {url ? (
        <Image
          // Signed URLs change on every fetch; key the cache by the file itself so
          // a photo already shown appears instantly instead of re-downloading.
          source={{ uri: url, cacheKey: stableKey(url) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Txt
          maxFontSizeMultiplier={1.2}
          style={{ color: '#fff', fontWeight: '700', fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.46) }}>
          {initials(name)}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
