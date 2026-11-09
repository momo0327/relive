export type TripStatus = 'upcoming' | 'active' | 'revealed';

export type TripSummary = {
  id: string;
  name: string;
  coverUrl: string | null;
  coverKey: string | null;
  /** Brightness behind the title: 'light' covers get dark text. */
  coverTone: 'light' | 'dark';
  startsAt: Date;
  unlocksAt: Date;
  status: TripStatus;
  isOwner: boolean;
  memberCount: number;
  memoryCount: number;
  myMemoryCount: number;
  /** When the trip was created (shown on home cards); not loaded on the trip page. */
  createdAt?: Date | null;
};

export type Member = {
  userId: string;
  displayName: string;
  role: 'owner' | 'member';
  isMe: boolean;
  blocked: boolean;
  /** Short-lived signed URL of the member's profile photo, if they set one. */
  avatarUrl: string | null;
  /** Chosen avatar colour (hex), used when there's no photo. */
  avatarColor: string | null;
};

export type Profile = {
  displayName: string;
  avatarUrl: string | null;
  avatarColor: string | null;
};

export type TripDetail = TripSummary & { members: Member[] };

export type MediaItem = {
  id: string;
  kind: 'photo' | 'video';
  durationMs: number | null;
  width: number | null;
  height: number | null;
  takenAt: Date;
  uploaderId: string;
  uploaderName: string;
  isMine: boolean;
  /** The current user added this to their Favourites. */
  liked: boolean;
  /** Short-lived signed URL, minted only after the server confirms the reveal. */
  url: string | null;
  /** Preview mode only: placeholder gradient instead of real media. */
  sampleColors?: [string, string];
};

export type InvitePreview = {
  tripId: string;
  name: string;
  startsAt: Date;
  unlocksAt: Date;
  memberCount: number;
  ownerName: string;
  alreadyMember: boolean;
  banned: boolean;
};

export type ReportReason = 'inappropriate' | 'harassment' | 'spam' | 'privacy' | 'other';

export type NewMedia = {
  id: string;
  tripId: string;
  kind: 'photo' | 'video';
  mimeType: 'image/jpeg' | 'video/quicktime' | 'video/mp4';
  fileUri: string;
  bytes: number;
  durationMs: number | null;
  width: number;
  height: number;
  capturedAt: string | null;
};

export type UploadOutcome = 'ready' | 'rejected';
