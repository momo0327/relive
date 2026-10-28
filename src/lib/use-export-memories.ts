import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';

import { friendlyError } from './errors';
import { exportToPhotos } from './export-memories';
import { plural } from './format';
import { useSession } from './session';

export type ExportProgress = { done: number; total: number } | null;

/** Saves memories to Photos: all (ids = null) or a chosen set. Resolves true when it ran. */
export function useExportMemories(tripId: string) {
  const { backend, mode } = useSession();
  const [progress, setProgress] = useState<ExportProgress>(null);

  async function run(ids: Set<string> | null): Promise<boolean> {
    if (mode === 'preview') {
      Alert.alert('Sample memories', 'Preview mode only has placeholder artwork, so there’s nothing to export.');
      return false;
    }
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert('Allow adding to Photos', 'L8R needs permission to add memories to your photo library.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
    setProgress({ done: 0, total: 0 });
    try {
      // Fresh signed URLs: the gallery's may have expired.
      const fresh = await backend.listMedia(tripId);
      const items = ids ? fresh.filter((m) => ids.has(m.id)) : fresh;
      setProgress({ done: 0, total: items.length });
      const { saved, failed } = await exportToPhotos(items, (done, total) => setProgress({ done, total }));
      Haptics.notificationAsync(
        failed ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      Alert.alert(
        failed ? 'Export finished with problems' : 'Saved to Photos',
        failed
          ? `${plural(saved, 'memory', 'memories')} saved, ${failed} couldn’t be saved. Try again to retry them.`
          : `${plural(saved, 'memory', 'memories')} added to your photo library.`,
      );
      return true;
    } catch (e) {
      Alert.alert('Couldn’t export', friendlyError(e));
      return false;
    } finally {
      setProgress(null);
    }
  }

  return { progress, run };
}
