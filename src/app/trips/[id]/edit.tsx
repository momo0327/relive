import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { friendlyError } from '@/lib/errors';
import { formatTripDates } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { TripDetail } from '@/lib/types';
import { PosterEditor, type PosterCover } from '@/ui/poster-editor';
import { Button, Txt } from '@/ui/primitives';
import { SheetLayout } from '@/ui/sheet-layout';
import { LoadingState } from '@/ui/states';

/** Organizer edits the trip's name and cover. Dates are fixed once created. */
export default function EditTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { backend } = useSession();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [name, setName] = useState('');
  const [cover, setCover] = useState<PosterCover>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    backend
      .getTrip(id)
      .then((t) => {
        setTrip(t);
        setName(t.name);
        setCover(t.coverUrl ? { uri: t.coverUrl, tone: t.coverTone, isNew: false } : null);
      })
      .catch((e) => {
        Alert.alert('Couldn’t load trip', friendlyError(e));
        router.back();
      });
  }, [backend, id, router]);

  if (!trip) return <LoadingState label="Loading trip" />;

  const trimmed = name.trim();
  const changed = trimmed !== trip.name || !!cover?.isNew;

  async function save() {
    if (!trimmed || !changed) return;
    setSaving(true);
    try {
      await backend.updateTrip(id, {
        name: trimmed !== trip!.name ? trimmed : undefined,
        coverUri: cover?.isNew ? cover.uri : undefined,
      });
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t save changes', friendlyError(e));
      setSaving(false);
    }
  }

  return (
    <SheetLayout footer={<Button title="Save" onPress={save} loading={saving} disabled={!trimmed || !changed} />}>
      <PosterEditor name={name} onNameChange={setName} cover={cover} onCoverChange={setCover} seed={trip.id} />
      <Txt variant="footnote" tone="tertiary">
        {formatTripDates(trip.startsAt, trip.unlocksAt)}. Dates can’t be changed after a trip is created, so the reveal
        time stays the same for everyone.
      </Txt>
    </SheetLayout>
  );
}
