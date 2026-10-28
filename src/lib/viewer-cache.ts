import type { MediaItem } from './types';

/** Hands the gallery's already-signed list to the viewer without refetching. */
type Entry = { items: MediaItem[]; isOwner: boolean };
const cache = new Map<string, Entry>();

export function setViewerItems(tripId: string, items: MediaItem[], isOwner?: boolean) {
  cache.set(tripId, { items, isOwner: isOwner ?? cache.get(tripId)?.isOwner ?? false });
}

export function getViewerEntry(tripId: string): Entry {
  return cache.get(tripId) ?? { items: [], isOwner: false };
}
