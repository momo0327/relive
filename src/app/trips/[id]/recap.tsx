import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { formatDuration, plural } from '@/lib/format';
import { computeRecap, markRecapSeen, type Recap } from '@/lib/recap';
import { useSession } from '@/lib/session';
import type { MediaItem, TripDetail } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { useA11yPrefs } from '@/ui/a11y';
import { Avatar } from '@/ui/avatar';
import { haptic } from '@/ui/haptics';
import { Button, Icon, IconButton, Txt } from '@/ui/primitives';
import { radius, space } from '@/ui/theme';

const SLIDE_MS = 5500;

type Slide = { key: string; background: MediaItem | null; body: ReactNode };

/** Full-screen, story-style trip recap: tap to advance, hold to pause. */
export default function RecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { backend } = useSession();
  const { data } = useLoad(async () => {
    const [trip, media] = await Promise.all([backend.getTrip(id), backend.listMedia(id)]);
    return { trip, media };
  });

  useEffect(() => markRecapSeen(id), [id]);

  if (!data) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  return <RecapStory trip={data.trip} recap={computeRecap(data.media, data.trip.members)} onClose={() => router.back()} />;
}

function RecapStory({ trip, recap, onClose }: { trip: TripDetail; recap: Recap; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useA11yPrefs();
  const slides = useMemo(() => buildSlides(trip, recap, onClose), [trip, recap, onClose]);
  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const paused = useRef(false);

  const go = (next: number) => {
    if (next < 0) return;
    if (next >= slides.length) return onClose();
    haptic.tap();
    setIndex(next);
  };

  // Auto-advance; the last slide waits for Done.
  useEffect(() => {
    progress.set(0);
    if (index >= slides.length - 1 || reduceMotion) return;
    progress.set(
      withTiming(1, { duration: SLIDE_MS, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(setIndex, index + 1);
      }),
    );
    return () => cancelAnimation(progress);
  }, [index, slides.length, progress, reduceMotion]);

  function pause() {
    paused.current = true;
    cancelAnimation(progress);
  }

  function resume() {
    if (!paused.current) return;
    paused.current = false;
    if (index >= slides.length - 1 || reduceMotion) return;
    const left = (1 - progress.get()) * SLIDE_MS;
    const at = index;
    progress.set(
      withTiming(1, { duration: left, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(setIndex, at + 1);
      }),
    );
  }

  const slide = slides[index];
  const bg = slide.background?.kind === 'photo' ? slide.background.url : trip.coverUrl;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Blurred photo behind each slide, darkened for legibility. */}
      {bg ? (
        <Animated.View key={`bg-${index}`} entering={FadeIn.duration(400)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
        </Animated.View>
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />

      {/* Tap zones: left goes back, right goes forward; holding pauses. */}
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
        <Pressable style={{ flex: 1 }} onPress={() => go(index - 1)} onLongPress={pause} onPressOut={resume} accessibilityLabel="Previous" />
        <Pressable style={{ flex: 2 }} onPress={() => go(index + 1)} onLongPress={pause} onPressOut={resume} accessibilityLabel="Next" />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={styles.bars} pointerEvents="none">
          {slides.map((s, i) => (
            <ProgressBar key={s.key} state={i < index ? 'done' : i > index ? 'todo' : 'current'} progress={progress} />
          ))}
        </View>
        <View style={styles.topRow} pointerEvents="box-none">
          <Txt variant="subhead" style={{ color: '#fff', fontWeight: '600' }}>
            {trip.name} · Recap
          </Txt>
          <IconButton icon="xmark" label="Close recap" tint="#fff" glass overMedia onPress={onClose} />
        </View>
      </View>

      <View style={[styles.body, { paddingTop: insets.top + 90, paddingBottom: insets.bottom + space.xl }]} pointerEvents="box-none">
        <Animated.View key={slide.key} entering={reduceMotion ? undefined : FadeInDown.duration(450)} style={{ flex: 1 }} pointerEvents="box-none">
          {slide.body}
        </Animated.View>
      </View>
    </View>
  );
}

function ProgressBar({ state, progress }: { state: 'done' | 'current' | 'todo'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === 'done' ? 1 : state === 'todo' ? 0 : progress.value) * 100}%`,
  }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, fill]} />
    </View>
  );
}

/* ---------- slides ---------- */

function buildSlides(trip: TripDetail, r: Recap, onClose: () => void): Slide[] {
  const days = Math.max(1, Math.round((trip.unlocksAt.getTime() - trip.startsAt.getTime()) / 86_400_000));
  const slides: Slide[] = [
    {
      key: 'intro',
      background: r.first,
      body: (
        <Center>
          <Kicker>Your recap</Kicker>
          <Huge>{trip.name}</Huge>
          <Big>{plural(days, 'day')} · {plural(r.total, 'memory', 'memories')}</Big>
          <Small>Here’s how it went.</Small>
        </Center>
      ),
    },
  ];

  const top = r.contributors[0];
  if (top) {
    const max = top.count;
    slides.push({
      key: 'top',
      background: r.last,
      body: (
        <Center>
          <Kicker>Top contributor</Kicker>
          <Avatar id={top.userId} name={top.name} url={top.member?.avatarUrl} color={top.member?.avatarColor} size={96} />
          <Huge>{top.name}</Huge>
          <Big>captured {plural(top.count, 'memory', 'memories')}</Big>
          <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.lg }}>
            {r.contributors.slice(0, 6).map((p) => (
              <View key={p.userId} style={styles.rankRow}>
                <Txt variant="subhead" numberOfLines={1} style={{ color: '#fff', width: 90 }}>
                  {p.name}
                </Txt>
                <View style={styles.rankTrack}>
                  <View style={[styles.rankFill, { width: `${(p.count / max) * 100}%` }]} />
                </View>
                <Txt variant="subhead" style={{ color: '#fff', width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                  {p.count}
                </Txt>
              </View>
            ))}
          </View>
        </Center>
      ),
    });
  }

  slides.push({
    key: 'mix',
    background: r.busiestDay?.items[0] ?? null,
    body: (
      <Center>
        <Kicker>What you captured</Kicker>
        <View style={{ flexDirection: 'row', gap: space.xxl }}>
          <Stat value={r.photos} label={r.photos === 1 ? 'photo' : 'photos'} />
          <Stat value={r.videos} label={r.videos === 1 ? 'video' : 'videos'} />
        </View>
        {r.videoSeconds > 0 ? <Big>{formatVideoTime(r.videoSeconds)} of video</Big> : null}
      </Center>
    ),
  });

  if (r.busiestDay && r.busiestDay.count > 1) {
    const day = r.busiestDay;
    slides.push({
      key: 'busiest',
      background: day.items[0],
      body: (
        <Center>
          <Kicker>Busiest day</Kicker>
          <Huge>{day.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Huge>
          <Big>{plural(day.count, 'memory', 'memories')} in one day</Big>
          <Collage items={day.items} />
        </Center>
      ),
    });
  }

  if (r.nightOwl && r.earlyBird && r.nightOwl.id !== r.earlyBird.id) {
    slides.push({
      key: 'owl',
      background: r.nightOwl,
      body: (
        <Center>
          <Kicker>Night owl & early bird</Kicker>
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <Moment item={r.nightOwl} title="🦉 Latest" />
            <Moment item={r.earlyBird} title="🐦 Earliest" />
          </View>
        </Center>
      ),
    });
  }

  if (r.first && r.last && r.first.id !== r.last.id) {
    slides.push({
      key: 'bookends',
      background: r.last,
      body: (
        <Center>
          <Kicker>From first to last</Kicker>
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <Moment item={r.first} title="First" withDate />
            <Moment item={r.last} title="Last" withDate />
          </View>
        </Center>
      ),
    });
  }

  slides.push({
    key: 'outro',
    background: r.first,
    body: (
      <Center>
        <Huge>That was {trip.name}.</Huge>
        <Big>{plural(r.total, 'memory', 'memories')} from {plural(r.contributors.length, 'person', 'people')}.</Big>
        <Button title="See all memories" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: space.xl, backgroundColor: '#fff' }} />
      </Center>
    ),
  });
  return slides;
}

function formatVideoTime(seconds: number) {
  if (seconds < 60) return plural(seconds, 'second');
  const m = Math.floor(seconds / 60);
  return plural(m, 'minute');
}

function Center({ children }: { children: ReactNode }) {
  return (
    <View style={styles.center} pointerEvents="box-none">
      {children}
    </View>
  );
}
function Kicker({ children }: { children: ReactNode }) {
  return <Txt style={styles.kicker}>{String(children).toUpperCase()}</Txt>;
}
function Huge({ children }: { children: ReactNode }) {
  return (
    <Txt style={styles.huge} numberOfLines={3} adjustsFontSizeToFit>
      {children}
    </Txt>
  );
}
function Big({ children }: { children: ReactNode }) {
  return <Txt style={styles.big}>{children}</Txt>;
}
function Small({ children }: { children: ReactNode }) {
  return <Txt variant="callout" style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>{children}</Txt>;
}
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt style={styles.stat}>{value}</Txt>
      <Txt variant="headline" style={{ color: 'rgba(255,255,255,0.8)' }}>
        {label}
      </Txt>
    </View>
  );
}

function Thumb({ item, style }: { item: MediaItem; style: object }) {
  return item.kind === 'photo' && item.url ? (
    <Image source={{ uri: item.url }} style={style} contentFit="cover" />
  ) : (
    <View style={[style, { backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }]}>
      <Icon name="play.fill" size={26} color="#fff" />
    </View>
  );
}

function Collage({ items }: { items: MediaItem[] }) {
  const shown = items.slice(0, 4);
  return (
    <View style={styles.collage}>
      {shown.map((m, i) => (
        <Thumb key={m.id} item={m} style={[styles.collageTile, { transform: [{ rotate: `${(i % 2 ? 1 : -1) * (3 + i)}deg` }] }]} />
      ))}
    </View>
  );
}

function Moment({ item, title, withDate = false }: { item: MediaItem; title: string; withDate?: boolean }) {
  const time = item.takenAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const when = withDate ? `${item.takenAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}` : time;
  return (
    <View style={{ alignItems: 'center', gap: space.sm, width: 140 }}>
      <Txt variant="headline" style={{ color: '#fff' }}>
        {title}
      </Txt>
      <Thumb item={item} style={styles.moment} />
      <Txt variant="subhead" style={{ color: '#fff', fontWeight: '600' }} numberOfLines={1}>
        {item.isMine ? 'You' : item.uploaderName}
      </Txt>
      <Txt variant="footnote" style={{ color: 'rgba(255,255,255,0.75)' }}>
        {item.kind === 'video' ? `${when} · ${formatDuration(item.durationMs)}` : when}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: space.lg, right: space.lg, gap: space.md },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#fff' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  kicker: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  huge: { color: '#fff', fontSize: 40, lineHeight: 46, fontWeight: '800', textAlign: 'center' },
  big: { color: '#fff', fontSize: 22, fontWeight: '600', textAlign: 'center' },
  stat: { color: '#fff', fontSize: 64, lineHeight: 70, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rankTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  rankFill: { height: 10, borderRadius: 5, backgroundColor: '#fff' },
  collage: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.lg, width: 260 },
  collageTile: { width: 120, height: 150, borderRadius: radius.md },
  moment: { width: 140, height: 180, borderRadius: radius.md },
});
