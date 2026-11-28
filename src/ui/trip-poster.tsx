import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatCreatedMonth } from '@/lib/format';

import { Txt } from './primitives';
import { space } from './theme';
import { Cover } from './trip-visuals';

/**
 * The trip "poster": cover photo (or gradient) with the trip name in large
 * Protest Strike capitals near the top, over a soft dark fade on photo covers. Used on the home page and as the live preview when creating or
 * editing a trip, so all three always match.
 */
export function TripPoster({
  name,
  coverUrl,
  coverKey,
  tone,
  seed,
  createdAt,
  style,
  compact = false,
}: {
  /** Small card (e.g. the invite sheet): smaller title and date. */
  compact?: boolean;
  /** Shows "NOVEMBER" / "NOVEMBER 2025" under the title. */
  createdAt?: Date | null;
  name: string;
  coverUrl: string | null;
  coverKey: string | null;
  tone: 'light' | 'dark';
  seed: string;
  style?: StyleProp<ViewStyle>;
}) {
  // White over the darkened photo; on plain gradients, follow the tone.
  const titleColor = coverUrl || tone !== 'light' ? '#FFFFFF' : '#0E0F10';
  return (
    <Cover uri={coverUrl} cacheKey={coverKey} seed={seed} scrim={false} style={[{ aspectRatio: 4 / 5 }, style]}>
      {coverUrl ? (
        // Soft darkening behind the title so it reads on any photo.
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
          locations={[0, 0.28, 0.55]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.titleWrap]} pointerEvents="none">
        <Txt
          variant="largeTitle"
          numberOfLines={3}
          maxFontSizeMultiplier={1.4}
          style={[styles.title, compact && styles.titleCompact, { color: titleColor }]}>
          {name.toLocaleUpperCase()}
        </Txt>
        {createdAt ? (
          <Txt maxFontSizeMultiplier={1.3} style={[styles.date, compact && styles.dateCompact, { color: titleColor }]}>
            {formatCreatedMonth(createdAt)}
          </Txt>
        ) : null}
      </View>
    </Cover>
  );
}

const styles = StyleSheet.create({
  titleCompact: { fontSize: 24, lineHeight: 25 },
  dateCompact: { fontSize: 9, letterSpacing: 1.5, marginTop: 0 },
  // Upper part of the card, like a travel poster.
  titleWrap: { alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: space.xl, paddingTop: '11%' },
  date: { fontFamily: 'Poppins_500Medium', fontSize: 15, letterSpacing: 2.5, marginTop: -2, textAlign: 'center' },
  title: {
    fontFamily: 'ProtestStrike_400Regular',
    fontWeight: 'normal',
    fontSize: 60,
    lineHeight: 60,
    textAlign: 'center',
  },
});
