import type { MediaItem, Member } from './types';

/** Hands the gallery's already-signed list (and trip context) to the viewer without refetching. */
type Entry = { items: MediaItem[]; isOwner: boolean; tripName: string; members: Member[] };
const cache = new Map<string, Entry>();

export function setViewerItems(
  tripId: string,
  items: MediaItem[],
  isOwner?: boolean,
  context?: { tripName: string; members: Member[] },
) {
  const prev = cache.get(tripId);
  cache.set(tripId, {
    items,
    isOwner: isOwner ?? prev?.isOwner ?? false,
    tripName: context?.tripName ?? prev?.tripName ?? '',
    members: context?.members ?? prev?.members ?? [],
  });
}

export function getViewerEntry(tripId: string): Entry {
  return cache.get(tripId) ?? { items: [], isOwner: false, tripName: '', members: [] };
}
