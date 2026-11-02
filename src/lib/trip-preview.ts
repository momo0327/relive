import type { TripDetail, TripSummary } from './types';

/**
 * The home card hands its trip to the trip page, so the page can draw the
 * cover and title the instant it opens (no loading screen in the middle of the
 * zoom transition) while the full details load.
 */
const previews = new Map<string, TripSummary>();

export function setTripPreview(trip: TripSummary) {
  previews.set(trip.id, trip);
}

export function getTripPreview(id: string): TripDetail | null {
  const trip = previews.get(id);
  return trip ? { ...trip, members: [] } : null;
}
