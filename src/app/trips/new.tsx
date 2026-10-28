import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { friendlyError } from '@/lib/errors';
import { formatRevealMoment, plural } from '@/lib/format';
import { ensureNotificationPermission } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { Button, Card, Icon, Row, Txt } from '@/ui/primitives';
import { PosterEditor, type PosterCover } from '@/ui/poster-editor';
import { SheetLayout } from '@/ui/sheet-layout';
import { space, useTheme } from '@/ui/theme';

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 62;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export default function NewTrip() {
  const router = useRouter();
  const c = useTheme();
  const { backend } = useSession();
  const today = startOfDay(new Date());
  const [name, setName] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 3));
  const [cover, setCover] = useState<PosterCover>(null);
  // Stable gradient seed, so the preview's colours don't change while typing.
  const [seed] = useState(() => `new-${Date.now()}`);
  const [saving, setSaving] = useState(false);

  // The reveal is midnight (device time zone) at the end of the last day.
  const unlocksAt = addDays(end, 1);
  const days = Math.round((unlocksAt.getTime() - start.getTime()) / DAY);
  const problem =
    name.trim().length === 0
      ? 'Give your trip a name.'
      : end < start
        ? 'The trip can’t end before it starts.'
        : days > MAX_DAYS
          ? `Trips can last up to ${MAX_DAYS} days.`
          : null;

  async function create() {
    if (problem) return;
    setSaving(true);
    try {
      const id = await backend.createTrip({ name: name.trim(), startsAt: start, unlocksAt, coverUri: cover?.uri ?? null });
      ensureNotificationPermission().catch(() => undefined);
      router.dismissTo(`/trips/${id}`);
      router.push(`/trips/${id}/invite`);
    } catch (error) {
      Alert.alert('Couldn’t create trip', friendlyError(error));
      setSaving(false);
    }
  }

  return (
    <SheetLayout footer={<Button title="Create trip" onPress={create} loading={saving} disabled={!!problem} />}>
        <PosterEditor name={name} onNameChange={setName} cover={cover} onCoverChange={setCover} seed={seed} />

        <Card style={{ gap: space.md, backgroundColor: c.surfaceRaised }}>
          <DateRow label="Starts" value={start} minimumDate={addDays(today, -30)} onChange={(d) => {
            setStart(d);
            if (end < d) setEnd(d);
          }} />
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
          <DateRow label="Ends" value={end} minimumDate={start < today ? today : start} onChange={setEnd} />
        </Card>

        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Icon name="lock.fill" size={16} color={c.locked} />
          <Txt variant="subhead" tone="secondary" style={{ flex: 1 }}>
            {plural(days, 'day')}. Memories stay sealed until{' '}
            <Txt variant="subhead" style={{ fontWeight: '600' }}>
              {formatRevealMoment(unlocksAt)}
            </Txt>
            , then unlock for everyone at once. Dates can’t be changed after the trip is created.
          </Txt>
        </Row>

        {problem && name.length > 0 ? (
          <Txt variant="footnote" tone="danger" accessibilityLiveRegion="polite">
            {problem}
          </Txt>
        ) : null}
    </SheetLayout>
  );
}

function DateRow({ label, value, minimumDate, onChange }: { label: string; value: Date; minimumDate: Date; onChange: (d: Date) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', minHeight: 44 }}>
      <Txt variant="body">{label}</Txt>
      <DateTimePicker
        value={value}
        mode="date"
        display={Platform.OS === 'ios' ? 'compact' : 'default'}
        minimumDate={minimumDate}
        onValueChange={(_e, d) => onChange(startOfDay(d))}
        accessibilityLabel={`${label} date`}
      />
    </Row>
  );
}
