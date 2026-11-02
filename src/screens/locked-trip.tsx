import { useIsFocused, useRouter } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { formatBytes, formatDuration, formatRevealMoment, plural, splitDuration, spokenDuration } from '@/lib/format';
import type { TripDetail } from '@/lib/types';
import { useTripUploads, type QueueItem } from '@/lib/uploads';
import { useLayout } from '@/ui/layout';
import { FloatingButton } from '@/ui/floating-button';
import { HERO_OVERLAP, TripHero } from '@/ui/trip-hero';
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
  const { readableWidth } = useLayout();
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
      <ScrollView
        // The banner runs under the status bar and header.
        contentInsetAdjustmentBehavior="never"
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
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 140 }}>
        <TripHero trip={trip} onInvite={() => router.push(`/trips/${trip.id}/invite`)} />
        <View style={{ width: readableWidth, gap: space.lg, marginTop: -HERO_OVERLAP, paddingHorizontal: 0 }}>
          <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.lockBadge, { backgroundColor: c.background }]}>
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

      <FloatingButton
        icon="camera.fill"
        label="Capture a memory"
        hint="Opens the camera. You can also add from your library there."
        onPress={() => router.push(`/trips/${trip.id}/capture`)}
      />
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
        <View key={unit} style={[styles.countBox, { backgroundColor: c.background }]}>
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
      style={[styles.statPill, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.statIcon, { backgroundColor: c.background }]}>
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
