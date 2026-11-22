import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { limits } from './config';
import type { NewMedia } from './types';

export class PrepError extends Error {}

/** Local copies live here until the server confirms the upload. */
const uploadsDir = new Directory(Paths.document, 'pending-uploads');

/** Moves files the app owns (camera/picker copies in Caches); copies anything else. */
function adopt(source: File, target: File) {
  if (source.uri.startsWith(Paths.cache.uri)) source.move(target);
  else source.copy(target);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Size of the file at `uri`, read fresh from disk. Re-checks briefly if the
 * file reports 0 right after being written or moved, then falls back to
 * counting its bytes. Native sizes can arrive as BigInt, hence Number().
 */
async function sizeOnDisk(uri: string): Promise<number> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const info = new File(uri).info();
    const size = Number(info.size ?? 0);
    if (__DEV__ && attempt > 0) console.warn(`[prep] size check ${attempt + 1}: exists=${info.exists} size=${size}`);
    if (info.exists && size > 0) return size;
    await pause(60 * (attempt + 1));
  }
  const file = new File(uri);
  if (!file.exists) return 0;
  const counted = (await file.bytes()).byteLength;
  if (__DEV__) console.warn(`[prep] size fallback: counted=${counted}`);
  return counted;
}

/** Final checks before a prepared file may be queued. */
async function checkedSize(uri: string, label: string): Promise<number> {
  const bytes = await sizeOnDisk(uri);
  if (bytes <= 0) throw new PrepError(`This ${label} couldn’t be read. Try choosing it again.`);
  if (bytes > limits.maxUploadBytes) {
    deleteLocalCopy(uri);
    throw new PrepError(`This ${label} is over ${Math.round(limits.maxUploadBytes / 1024 / 1024)} MB.`);
  }
  return bytes;
}

function ensureDir() {
  if (!uploadsDir.exists) uploadsDir.create({ intermediates: true, idempotent: true });
}

/** "2026:10:12 18:40:05" → ISO string (EXIF has no zone; treated as device-local). */
function parseExifDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const THUMB_EDGE = 480;

/** ~480 px JPEG preview of a local image, saved next to the upload. Never throws. */
async function makeThumb(id: string, imageUri: string): Promise<string | null> {
  try {
    const context = ImageManipulator.manipulate(imageUri).resize({ width: THUMB_EDGE });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });
    context.release();
    image.release();
    const target = new File(uploadsDir, `${id}.thumb.jpg`);
    if (target.exists) target.delete();
    new File(saved.uri).move(target);
    return target.uri;
  } catch {
    return null;
  }
}

/**
 * Re-encodes a photo as JPEG, capped at a long edge of `limits.maxPhotoEdge`.
 * Re-encoding drops all EXIF metadata, including GPS location; only the
 * capture time is read beforehand and sent as a separate field.
 */
export async function preparePhoto(input: {
  tripId: string;
  uri: string;
  width: number;
  height: number;
  exif?: Record<string, unknown> | null;
}): Promise<NewMedia> {
  ensureDir();
  const context = ImageManipulator.manipulate(input.uri);
  const longEdge = Math.max(input.width, input.height);
  if (longEdge > limits.maxPhotoEdge) {
    context.resize(input.width >= input.height ? { width: limits.maxPhotoEdge } : { height: limits.maxPhotoEdge });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: limits.photoQuality, format: SaveFormat.JPEG });
  context.release();
  image.release();
  if (input.uri.startsWith(Paths.cache.uri)) {
    // The original still has full EXIF (including GPS); don't leave it around.
    try {
      new File(input.uri).delete();
    } catch {
      // Not ours to delete.
    }
  }

  const id = Crypto.randomUUID();
  const source = new File(saved.uri);
  const target = new File(uploadsDir, `${id}.jpg`);
  source.move(target);
  const bytes = await checkedSize(target.uri, 'photo');
  const thumbUri = await makeThumb(id, target.uri);
  return {
    id,
    tripId: input.tripId,
    kind: 'photo',
    mimeType: 'image/jpeg',
    fileUri: target.uri,
    bytes,
    durationMs: null,
    width: saved.width,
    height: saved.height,
    capturedAt: parseExifDate(input.exif?.DateTimeOriginal) ?? (input.exif ? null : new Date().toISOString()),
    thumbUri,
  };
}

/** Validates a video against the MVP limits and copies it to app storage. */
export async function prepareVideo(input: {
  tripId: string;
  uri: string;
  durationMs: number | null;
  width: number;
  height: number;
  fromCamera: boolean;
}): Promise<NewMedia> {
  ensureDir();
  const durationMs = Math.round(input.durationMs ?? 0);
  if (durationMs > (limits.maxVideoSeconds + 0.5) * 1000) {
    throw new PrepError(`Videos can be up to ${limits.maxVideoSeconds} seconds.`);
  }
  const source = new File(input.uri);
  if (source.size > limits.maxUploadBytes) {
    throw new PrepError(`This video is over ${Math.round(limits.maxUploadBytes / 1024 / 1024)} MB. Try a shorter clip.`);
  }
  const isMp4 = /\.mp4$/i.test(input.uri);
  const id = Crypto.randomUUID();
  const target = new File(uploadsDir, `${id}.${isMp4 ? 'mp4' : 'mov'}`);
  adopt(source, target);
  const bytes = await checkedSize(target.uri, 'video');
  // First frame of the local file as the preview.
  let thumbUri: string | null = null;
  try {
    const frame = await VideoThumbnails.getThumbnailAsync(target.uri, { time: 0, quality: 0.7 });
    thumbUri = await makeThumb(id, frame.uri);
  } catch {
    thumbUri = null;
  }
  return {
    id,
    tripId: input.tripId,
    kind: 'video',
    mimeType: isMp4 ? 'video/mp4' : 'video/quicktime',
    fileUri: target.uri,
    bytes,
    durationMs: Math.min(durationMs, limits.maxVideoSeconds * 1000 + 500),
    thumbUri,
    width: input.width,
    height: input.height,
    capturedAt: input.fromCamera ? new Date().toISOString() : null,
  };
}

export function deleteLocalCopy(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}
