import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';

import { limits } from './config';
import { plural } from './format';
import { PrepError, preparePhoto, prepareVideo } from './media-prep';
import type { NewMedia } from './types';
import { useUploads } from './uploads';

/** Opens the system photo picker (no broad library access) and queues the picks. */
export function useLibraryPicker(tripId: string) {
  const { enqueue } = useUploads();
  const [picking, setPicking] = useState(false);

  async function pick(): Promise<number> {
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: limits.pickerSelectionLimit,
        exif: true,
        quality: 1,
        videoMaxDuration: limits.maxVideoSeconds,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });
      if (result.canceled) return 0;
      const prepared: NewMedia[] = [];
      const skipped: string[] = [];
      for (const asset of result.assets) {
        try {
          prepared.push(
            asset.type === 'video'
              ? await prepareVideo({
                  tripId,
                  uri: asset.uri,
                  durationMs: asset.duration ?? null,
                  width: asset.width,
                  height: asset.height,
                  fromCamera: false,
                })
              : await preparePhoto({ tripId, uri: asset.uri, width: asset.width, height: asset.height, exif: asset.exif ?? {} }),
          );
        } catch (error) {
          skipped.push(error instanceof PrepError ? error.message : 'One item couldn’t be read.');
        }
      }
      if (prepared.length) enqueue(prepared);
      if (skipped.length) Alert.alert(`${plural(skipped.length, 'item')} skipped`, [...new Set(skipped)].join('\n'));
      return prepared.length;
    } catch {
      Alert.alert('Couldn’t open your library', 'Check Photos access for Relive in Settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return 0;
    } finally {
      setPicking(false);
    }
  }

  return { pick, picking };
}
