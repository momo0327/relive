import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useRouter } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatBytes, formatDuration, formatRevealMoment, plural, splitDuration, spokenDuration } from '@/lib/format';
import type { TripDetail } from '@/lib/types';
import { useTripUploads, type QueueItem } from '@/lib/uploads';
import { useA11yPrefs } from '@/ui/a11y';
import { useLayout } from '@/ui/layout';
import { MembersRow } from '@/ui/members-row';
import { Button, Card, Icon, Row, Txt } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { useCountdown } from '@/ui/trip-visuals';

export function LockedTripView({
  trip,
  onReload,
  onCountdownElapsed,
}: {
  trip: TripDetail;
  onReload: () => Promise<void>;
  onCountdownElapsed: () => void;
}) {
  const router = useRouter();
  const c = useTheme();
  const { gutter, readableWidth } = useLayout();
  const { reduceTransparency } = useA11yPrefs();
  const { items, online, retry, discard, clearDone } = useTripUploads(trip.id);
  const [refreshing, setRefreshing] = useState(false);
  const focused = useIsFocused();

  // When a batch of uploads finishes cleanly, confirm with the "saved" sheet.
  const active = items.filter((i) => i.status === 'queued' || i.status === 'uploading').length;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  useEffect(() => {
    if (active === 0 && done > 0 && failed === 0 && focused) {
      clearDone(trip.id);
      onReload();
      router.push(`/trips/${trip.id}/saved?count=${done}`);
    }
  }, [active, done, failed, focused, clearDone, onReload, router, trip.id]);

  return (
    <View style={{ flex: 1 }}>
      {/* Decorative stand-in for the gallery. The real memories are never sent to
          the device before the reveal, so these tiles are abstract placeholders. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <GhostGrid seed={trip.id} />
        {reduceTransparency ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background, opacity: 0.94 }]} />
        ) : (
          <>
            <BlurView
              intensity={60}
              tint={c.scheme === 'dark' ? 'systemThickMaterialDark' : 'systemThickMaterialLight'}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background, opacity: 0.45 }]} />
          </>
        )}
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await onReload();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: gutter, paddingBottom: 140 }}>
        <View style={{ width: readableWidth, gap: space.lg, paddingTop: space.sm }}>
          <View style={{ alignItems: 'center', marginBottom: space.sm }}>
            <MembersRow members={trip.members} onInvite={() => router.push(`/trips/${trip.id}/invite`)} />
          </View>

          <View style={[styles.panel, { backgroundColor: c.frost, borderColor: c.border }]}>
            <View style={[styles.lockBadge, { backgroundColor: c.frostStrong }]}>
              <Icon name="lock.fill" size={30} color={c.text} />
            </View>
            <View style={{ gap: space.sm, alignItems: 'center' }}>
              <Txt variant="title2" style={{ fontWeight: '700', textAlign: 'center' }} accessibilityRole="header">
                Memories locked
              </Txt>
              <Txt variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
                All photos and videos will be revealed after the trip ends, on {formatRevealMoment(trip.unlocksAt)}.
              </Txt>
            </View>
            <CountdownBoxes unlocksAt={trip.unlocksAt} onElapsed={onCountdownElapsed} />
          </View>

          <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
            <StatPill icon="photo.stack" value={trip.memoryCount} label={trip.memoryCount === 1 ? 'Memory' : 'Memories'} />
            <StatPill icon="person.2.fill" value={trip.members.length} label={trip.members.length === 1 ? 'Member' : 'Members'} />
          </Row>

          {items.length > 0 ? <UploadPanel items={items} online={online} onRetry={retry} onDiscard={discard} /> : null}
        </View>
      </ScrollView>

      <CaptureButton onPress={() => router.push(`/trips/${trip.id}/capture`)} />
    </View>
  );
}

const glassSupported = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

/**
 * Large floating "+" that opens the camera: Liquid Glass on iOS 26, solid
 * elsewhere. Black in light mode and white in dark mode, for contrast.
 */
function CaptureButton({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  const dark = c.scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const { reduceTransparency } = useA11yPrefs();
  const glass = glassSupported && !reduceTransparency;
  const icon = <Icon name="plus" size={30} color={dark ? '#0E0F10' : '#FFFFFF'} weight="semibold" />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Capture a memory"
      accessibilityHint="Opens the camera. You can also add from your library there."
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.captureButton,
        { right: gutter, bottom: Math.max(insets.bottom, space.lg) + space.sm, transform: [{ scale: pressed ? 0.94 : 1 }] },
        !glass && [styles.captureFallback, { backgroundColor: dark ? '#FFFFFF' : '#0E0F10' }],
      ]}>
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor={dark ? 'rgba(255,255,255,0.92)' : 'rgba(14,15,16,0.92)'}
          isInteractive
          style={styles.captureInner}>
          {icon}
        </GlassView>
      ) : (
        icon
      )}
    </Pressable>
  );
}

/** Deterministic 0–1 value from a string (FNV-1a), so the layout is stable per trip. */
function seededRandom(key: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 0xffffffff;
}

/** Masonry of abstract tiles that suggests a gallery without showing anything. */
function GhostGrid({ seed }: { seed: string }) {
  const { width, height, gutter } = useLayout();
  const columns = width >= 600 ? 4 : 2;
  const gap = 10;
  const colWidth = (width - gutter * 2 - gap * (columns - 1)) / columns;
  const palette: [string, string][] = [
    ['#E9B9A6', '#7D5BA6'], ['#F3CF7A', '#D9773B'], ['#9ED8E6', '#3D63B8'], ['#E7A6C4', '#9C2F67'],
    ['#A8DCC3', '#2F7A5B'], ['#D8C3A0', '#8A5A2B'], ['#B8B3E8', '#4B46A8'], ['#E6A9A0', '#8E3A32'],
  ];
  const cols = Array.from({ length: columns }, (_, ci) => {
    const tiles: { h: number; colors: [string, string] }[] = [];
    let total = ci % 2 === 1 ? -40 : 0;
    for (let ti = 0; total < height; ti += 1) {
      const tileHeight = colWidth * (0.8 + seededRandom(`${seed}:${ci}:${ti}:h`) * 0.7);
      tiles.push({ h: tileHeight, colors: palette[Math.floor(seededRandom(`${seed}:${ci}:${ti}:c`) * palette.length)] });
      total += tileHeight + gap;
    }
    return tiles;
  });

  return (
    <View style={{ flexDirection: 'row', gap, paddingHorizontal: gutter, paddingTop: 140 }}>
      {cols.map((tiles, ci) => (
        <View key={ci} style={{ width: colWidth, gap }}>
          {tiles.map((t, ti) => (
            <LinearGradient key={ti} colors={t.colors} style={{ height: t.h, borderRadius: 14 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

function CountdownBoxes({ unlocksAt, onElapsed }: { unlocksAt: Date; onElapsed: () => void }) {
  const c = useTheme();
  const remaining = useCountdown(unlocksAt, onElapsed);
  const parts = splitDuration(remaining);
  const units: [number, string][] = [
    [parts.days, 'Days'],
    [parts.hours, 'Hours'],
    [parts.minutes, 'Minutes'],
    [parts.seconds, 'Seconds'],
  ];
  if (remaining <= 0) {
    return (
      <Txt variant="title2" tone="accent" accessibilityLiveRegion="polite">
        Unlocking…
      </Txt>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }} accessible accessibilityRole="timer" accessibilityLabel={`Unlocks in ${spokenDuration(parts)}`}>
      {units.map(([value, unit]) => (
        <View key={unit} style={[styles.countBox, { backgroundColor: c.frostStrong }]}>
          <Txt variant="title" maxFontSizeMultiplier={1.3} style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Txt>
          <Txt variant="footnote" tone="secondary" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>
            {unit}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function StatPill({ icon, value, label }: { icon: SymbolViewProps['name']; value: number; label: string }) {
  const c = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={[styles.statPill, { backgroundColor: c.frost, borderColor: c.border }]}>
      <View style={[styles.statIcon, { backgroundColor: c.frostStrong }]}>
        <Icon name={icon} size={18} color={c.text} />
      </View>
      <View>
        <Txt variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Txt>
        <Txt variant="subhead" tone="secondary">
          {label}
        </Txt>
      </View>
    </View>
  );
}

function UploadPanel({
  items,
  online,
  onRetry,
  onDiscard,
}: {
  items: QueueItem[];
  online: boolean;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const c = useTheme();
  const pending = items.filter((i) => i.status !== 'done').length;
  return (
    <Card style={{ gap: space.md }}>
      <Txt variant="headline">{pending ? `Uploading ${plural(pending, 'memory', 'memories')}` : 'Uploads finished'}</Txt>
      {!online && pending ? (
        <Txt variant="footnote" tone="secondary">
          You’re offline. These are kept on this device and will upload when you reconnect. Keep the app installed
          until they finish.
        </Txt>
      ) : null}
      {items.map((item) => {
        const label = item.kind === 'video' ? `Video · ${formatDuration(item.durationMs)}` : 'Photo';
        const status =
          item.status === 'done'
            ? 'Saved'
            : item.status === 'uploading'
              ? `Uploading ${Math.round(item.progress * 100)}%`
              : item.status === 'failed'
                ? 'Not uploaded'
                : online
                  ? 'Waiting to upload'
                  : 'Waiting for connection';
        return (
          <View key={item.id} style={{ gap: space.xs }} accessible={item.status !== 'failed'} accessibilityLabel={`${label}, ${formatBytes(item.bytes)}, ${status}`}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row>
                <Icon name={item.kind === 'video' ? 'video.fill' : 'photo.fill'} size={16} color={c.textSecondary} />
                <Txt variant="subhead">{label}</Txt>
                <Txt variant="footnote" tone="tertiary">
                  {formatBytes(item.bytes)}
                </Txt>
              </Row>
              <Txt variant="footnote" tone={item.status === 'failed' ? 'danger' : item.status === 'done' ? 'success' : 'secondary'}>
                {status}
              </Txt>
            </Row>
            {item.status === 'uploading' || item.status === 'queued' ? (
              <View style={[styles.track, { backgroundColor: c.background }]}>
                <View style={[styles.fill, { width: `${Math.round(item.progress * 100)}%`, backgroundColor: c.accent }]} />
              </View>
            ) : null}
            {item.status === 'failed' ? (
              <View style={{ gap: space.sm }}>
                <Txt variant="footnote" tone="secondary">
                  {item.error}
                </Txt>
                <Row>
                  {!item.permanent ? (
                    <Button title="Retry" kind="secondary" style={{ minHeight: 40, backgroundColor: c.background }} onPress={() => onRetry(item.id)} />
                  ) : null}
                  <Button
                    title="Discard"
                    kind="destructive"
                    style={{ minHeight: 40 }}
                    onPress={() =>
                      Alert.alert('Discard this memory?', 'It hasn’t been uploaded, so it will be gone for good.', [
                        { text: 'Keep', style: 'cancel' },
                        { text: 'Discard', style: 'destructive', onPress: () => onDiscard(item.id) },
                      ])
                    }
                  />
                </Row>
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  captureButton: { position: 'absolute', width: 68, height: 68, borderRadius: 34 },
  captureInner: { flex: 1, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  captureFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  panel: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.xl,
    paddingTop: space.xxl,
    gap: space.xl,
    alignItems: 'center',
  },
  lockBadge: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  countBox: { flex: 1, alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.md, gap: 2 },
  statPill: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
