import type {
  InvitePreview,
  MediaItem,
  NewMedia,
  Profile,
  ReportReason,
  TripDetail,
  TripSummary,
  UploadOutcome,
} from './types';

export type UploadProgress = (sent: number, total: number) => void;

/**
 * Everything the UI needs from the server. `liveBackend` talks to Supabase;
 * `previewBackend` is an explicit on-device sample used when exploring the app
 * without an account (and when Supabase isn't configured in development).
 */
export interface Backend {
  readonly kind: 'live' | 'preview';
  listTrips(): Promise<TripSummary[]>;
  getTrip(tripId: string): Promise<TripDetail>;
  createTrip(input: { name: string; startsAt: Date; unlocksAt: Date; coverUri: string | null }): Promise<string>;
  /** Organizer only. Dates can't change; a new cover replaces the old one. */
  updateTrip(tripId: string, patch: { name?: string; coverUri?: string }): Promise<void>;
  createInvite(tripId: string): Promise<string>;
  revokeInvites(tripId: string): Promise<void>;
  previewInvite(token: string): Promise<InvitePreview | null>;
  acceptInvite(token: string): Promise<string | null>;
  /** Returns nothing before the server-side reveal. */
  listMedia(tripId: string): Promise<MediaItem[]>;
  /** Fresh signed URL for one memory; fails unless the caller may view it now. */
  mediaUrl(tripId: string, mediaId: string): Promise<string | null>;
  /** `attempt` starts at 1; later attempts may use a more conservative transport. */
  uploadMedia(media: NewMedia, onProgress: UploadProgress, signal: AbortSignal, attempt: number): Promise<UploadOutcome>;
  deleteMedia(mediaId: string): Promise<void>;
  /** Add to / remove from the caller's Favourites (revealed memories only). */
  setLiked(mediaId: string, liked: boolean): Promise<void>;
  leaveTrip(tripId: string): Promise<void>;
  removeMember(tripId: string, userId: string): Promise<void>;
  deleteTrip(tripId: string): Promise<void>;
  report(input: { tripId: string; mediaId?: string; userId?: string; reason: ReportReason; details?: string }): Promise<void>;
  setBlocked(userId: string, blocked: boolean): Promise<void>;
  getProfile(): Promise<Profile>;
  updateProfile(patch: { displayName?: string; avatarColor?: string | null }): Promise<void>;
  /** Uploads a new profile photo from a local file, or removes it with null. */
  setAvatar(localUri: string | null): Promise<void>;
}
