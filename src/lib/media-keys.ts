import type { MediaItem } from './types';

/**
 * Image cache keys. Signed URLs change on every fetch, so images are cached by
 * memory ID and size instead. Every screen must use these, so the gallery,
 * filmstrip, viewer and recap share the same cached copies, and a small
 * preview is never mistaken for the full-size photo.
 */

/** Full-size photo. ("full-": older builds cached previews under "media-".) */
export function fullKey(item: Pick<MediaItem, 'id'>) {
  return `full-${item.id}`;
}

/** The small preview, or the full photo when a memory has no preview yet. */
export function previewSource(item: Pick<MediaItem, 'id' | 'kind' | 'url' | 'thumbUrl'>, localFrame?: string | null) {
  if (item.thumbUrl) return { uri: item.thumbUrl, cacheKey: `thumb-${item.id}` };
  if (item.kind === 'photo' && item.url) return { uri: item.url, cacheKey: fullKey(item) };
  if (localFrame) return { uri: localFrame };
  return null;
}
