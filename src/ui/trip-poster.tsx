import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from './primitives';
import { space } from './theme';
import { Cover } from './trip-visuals';

/**
 * The trip "poster": cover photo (or gradient) with the trip name in large
 * Protest Strike capitals near the top, black on bright covers and white on
 * dark ones. Used on the home page and as the live preview when creating or
 * editing a trip, so all three always match.
 */
export function TripPoster({
  name,
  coverUrl,
  coverKey,
  tone,
  seed,
  style,
}: {
  name: string;
  coverUrl: string | null;
  coverKey: string | null;
  tone: 'light' | 'dark';
  seed: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Cover uri={coverUrl} cacheKey={coverKey} seed={seed} scrim={false} style={[{ aspectRatio: 4 / 5 }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.titleWrap]} pointerEvents="none">
        <Txt
          variant="largeTitle"
          numberOfLines={3}
          maxFontSizeMultiplier={1.4}
          style={[styles.title, { color: tone === 'light' ? '#0E0F10' : '#FFFFFF' }]}>
          {name.toLocaleUpperCase()}
        </Txt>
      </View>
    </Cover>
  );
}

const styles = StyleSheet.create({
  // Upper part of the card, like a travel poster.
  titleWrap: { alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: space.xl, paddingTop: '11%' },
  title: {
    fontFamily: 'ProtestStrike_400Regular',
    fontWeight: 'normal',
    fontSize: 60,
    lineHeight: 60,
    textAlign: 'center',
  },
});
