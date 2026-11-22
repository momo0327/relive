import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

import type { MediaItem } from './types';

type ExportResult = { saved: number; failed: number };

/** Local temp copy of one memory, named by id so the extension is right for Photos. */
async function downloadToCache(item: MediaItem): Promise<File> {
  if (!item.url) throw new Error('unavailable');
  const ext = item.kind === 'photo' ? 'jpg' : /\.mp4(\?|$)/.test(item.url) ? 'mp4' : 'mov';
  const target = new File(Paths.cache, `relive-export-${item.id}.${ext}`);
  if (target.exists) target.delete();
  return File.downloadFileAsync(item.url, target);
}

/**
 * Saves memories to the Photos library, a few at a time. Callers should pass
 * freshly signed items (URLs expire). Sample items without a URL are skipped.
 */
export async function exportToPhotos(
  items: MediaItem[],
  onProgress: (done: number, total: number) => void,
): Promise<ExportResult> {
  const queue = items.filter((i) => i.url);
  const total = queue.length;
  let done = 0;
  let saved = 0;
  let failed = 0;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const file = await downloadToCache(item);
        await MediaLibrary.Asset.create(file.uri);
        file.delete();
        saved += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress(done, total);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { saved, failed };
}
