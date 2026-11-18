import type { TripSummary } from './types';

/**
 * Instant updates for the home trip list. Creating, deleting or leaving a
 * trip edits the list right away (optimistic); the home screen then refreshes
 * from the server on its next focus to confirm.
 *
 * A new trip's cover uploads in the background, so until the server has it,
 * the local copy is shown (on home and on the trip page).
 */
type Edit = (trips: TripSummary[]) => TripSummary[];
type Listener = (edit: Edit | null) => void;

const listeners = new Set<Listener>();
const localCovers = new Map<string, string>();
let stale = false;

/** Change the home list now. */
export function editTripList(edit: Edit) {
  stale = true;
  for (const listener of listeners) listener(edit);
}

/** Ask the home list to refresh from the server now. */
export function refreshTripList() {
  stale = true;
  for (const listener of listeners) listener(null);
}

export function onTripListChange(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once after an edit, so the next focus reloads from the server. */
export function takeTripListStale() {
  const was = stale;
  stale = false;
  return was;
}

export function setLocalCover(tripId: string, uri: string | null) {
  if (uri) localCovers.set(tripId, uri);
  else localCovers.delete(tripId);
}

/** Fills in the local cover while the uploaded one isn't there yet. */
export function withLocalCover<T extends Pick<TripSummary, 'id' | 'coverUrl'>>(trip: T): T {
  if (trip.coverUrl) return trip;
  const local = localCovers.get(trip.id);
  return local ? { ...trip, coverUrl: local } : trip;
}
