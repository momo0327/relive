import * as Crypto from 'expo-crypto';
import { File, UploadType } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Backend } from './backend';
import { measureTone } from './image-tone';
import { monoNow, syncServerTime } from './clock';
import { config, limits } from './config';
import { requireSupabase } from './supabase';
import type { MediaItem, TripDetail, TripStatus, TripSummary } from './types';

type TripRow = {
  id: string;
  name: string;
  cover_path: string | null;
  cover_tone?: 'light' | 'dark';
  created_at?: string;
  starts_at: string;
  unlocks_at: string;
  status: TripStatus;
  role?: 'owner' | 'member';
  is_owner?: boolean;
  member_count?: number;
  memory_count: number;
  my_memory_count: number;
  server_now: string;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function signCovers(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (!unique.length) return new Map();
  const { data, error } = await requireSupabase()
    .storage.from('trip-covers')
    .createSignedUrls(unique, 60 * 60);
  if (error) return new Map();
  return new Map(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
}

function toSummary(row: TripRow, covers: Map<string, string>): TripSummary {
  return {
    id: row.id,
    name: row.name,
    coverKey: row.cover_path,
    coverUrl: row.cover_path ? covers.get(row.cover_path) ?? null : null,
    coverTone: row.cover_path && row.cover_tone === 'light' ? 'light' : 'dark',
    startsAt: new Date(row.starts_at),
    unlocksAt: new Date(row.unlocks_at),
    status: row.status,
    isOwner: row.is_owner ?? row.role === 'owner',
    memberCount: row.member_count ?? 0,
    memoryCount: Number(row.memory_count),
    myMemoryCount: Number(row.my_memory_count),
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

async function signAvatars(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (!unique.length) return new Map();
  const { data, error } = await requireSupabase().storage.from('avatars').createSignedUrls(unique, 60 * 60);
  if (error) return new Map();
  return new Map(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
}

async function currentUserId(): Promise<string> {
  const { data } = await requireSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('not_authenticated');
  return id;
}

async function uploadCover(tripId: string, uri: string): Promise<void> {
  const client = requireSupabase();
  const tone = await measureTone(uri);
  const context = ImageManipulator.manipulate(uri).resize({ width: 1600 });
  const image = await context.renderAsync();
  // Re-encoding drops EXIF metadata such as GPS location.
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const path = `${tripId}/cover-${Crypto.randomUUID()}.jpg`;
  const bytes = await new File(result.uri).bytes();
  const { error } = await client.storage
    .from('trip-covers')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  await rpc('set_trip_cover', { p_trip: tripId, p_path: path, p_tone: tone });
}

export const liveBackend: Backend = {
  kind: 'live',

  async listTrips() {
    const started = monoNow();
    const rows = await rpc<TripRow[]>('list_my_trips');
    if (rows[0]) syncServerTime(rows[0].server_now, started);
    const covers = await signCovers(rows.flatMap((r) => (r.cover_path ? [r.cover_path] : [])));
    return rows.map((r) => toSummary(r, covers));
  },

  async getTrip(tripId) {
    const started = monoNow();
    const row = await rpc<TripRow & {
      members: {
        user_id: string;
        display_name: string;
        role: 'owner' | 'member';
        is_me: boolean;
        blocked: boolean;
        avatar_path: string | null;
        avatar_color: string | null;
      }[];
    }>(
      'get_trip',
      { p_trip: tripId },
    );
    syncServerTime(row.server_now, started);
    const [covers, avatars] = await Promise.all([
      signCovers(row.cover_path ? [row.cover_path] : []),
      signAvatars(row.members.flatMap((m) => (m.avatar_path ? [m.avatar_path] : []))),
    ]);
    const detail: TripDetail = {
      ...toSummary({ ...row, member_count: row.members.length }, covers),
      members: row.members.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        isMe: m.is_me,
        blocked: m.blocked,
        avatarUrl: m.avatar_path ? avatars.get(m.avatar_path) ?? null : null,
        avatarColor: m.avatar_color,
      })),
    };
    return detail;
  },

  async createTrip({ name, startsAt, unlocksAt, coverUri }) {
    const id = await rpc<string>('create_trip', {
      p_name: name,
      p_starts_at: startsAt.toISOString(),
      p_unlocks_at: unlocksAt.toISOString(),
    });
    if (coverUri) {
      // The trip exists either way; a failed cover shouldn't lose it.
      await uploadCover(id, coverUri).catch(() => undefined);
    }
    return id;
  },

  async updateTrip(tripId, { name, coverUri }) {
    if (name !== undefined) await rpc('rename_trip', { p_trip: tripId, p_name: name });
    if (coverUri) await uploadCover(tripId, coverUri);
  },

  createInvite: (tripId) => rpc<string>('create_invite', { p_trip: tripId }),
  revokeInvites: (tripId) => rpc('revoke_trip_invites', { p_trip: tripId }),

  async previewInvite(token) {
    const data = await rpc<null | {
      trip_id: string; name: string; starts_at: string; unlocks_at: string;
      member_count: number; owner_name: string; already_member: boolean; banned: boolean;
    }>('preview_invite', { p_token: token });
    if (!data) return null;
    return {
      tripId: data.trip_id,
      name: data.name,
      startsAt: new Date(data.starts_at),
      unlocksAt: new Date(data.unlocks_at),
      memberCount: data.member_count,
      ownerName: data.owner_name,
      alreadyMember: data.already_member,
      banned: data.banned,
    };
  },

  acceptInvite: (token) => rpc<string | null>('accept_invite', { p_token: token }),

  async listMedia(tripId) {
    const rows = await rpc<{
      id: string; storage_path: string; kind: 'photo' | 'video'; duration_ms: number | null;
      width: number | null; height: number | null; captured_at: string | null; created_at: string;
      uploader_id: string; uploader_name: string; is_mine: boolean; liked?: boolean;
    }[]>('list_trip_media', { p_trip: tripId });
    if (!rows.length) return [];
    // Signing goes through the storage read policy, which re-checks the reveal.
    const { data: signed } = await requireSupabase()
      .storage.from('trip-media')
      .createSignedUrls(rows.map((r) => r.storage_path), limits.signedUrlSeconds);
    const urls = new Map((signed ?? []).flatMap((s) => (s.signedUrl && s.path ? [[s.path, s.signedUrl] as const] : [])));
    return rows.map<MediaItem>((r) => ({
      id: r.id,
      kind: r.kind,
      durationMs: r.duration_ms,
      width: r.width,
      height: r.height,
      takenAt: new Date(r.captured_at ?? r.created_at),
      uploaderId: r.uploader_id,
      uploaderName: r.uploader_name,
      isMine: r.is_mine,
      liked: !!r.liked,
      url: urls.get(r.storage_path) ?? null,
    }));
  },

  async mediaUrl(tripId, mediaId) {
    const items = await this.listMedia(tripId);
    return items.find((i) => i.id === mediaId)?.url ?? null;
  },

  async uploadMedia(media, onProgress, signal, attempt) {
    const client = requireSupabase();
    // Declare the size actually on disk now (queued metadata may be stale).
    const info = new File(media.fileUri).info();
    if (!info.exists) throw new Error('local_file_missing');
    const bytes = Number(info.size ?? 0) || media.bytes;
    const path = await rpc<string>('reserve_media_upload', {
      p_id: media.id,
      p_trip: media.tripId,
      p_kind: media.kind,
      p_mime: media.mimeType,
      p_bytes: bytes,
      p_duration_ms: media.durationMs,
      p_width: media.width,
      p_height: media.height,
      p_captured_at: media.capturedAt,
    });

    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('not_authenticated');

    // Native upload task: streams from disk with progress, and on iOS keeps
    // going in a background URLSession if the app is suspended.
    const task = new File(media.fileUri).createUploadTask(
      `${config.supabaseUrl}/storage/v1/object/trip-media/${path}`,
      {
        httpMethod: 'POST',
        uploadType: UploadType.BINARY_CONTENT,
        headers: {
          authorization: `Bearer ${token}`,
          apikey: config.supabaseKey,
          'content-type': media.mimeType,
          'x-upsert': 'false',
          'cache-control': 'max-age=3600',
        },
        // Native progress can arrive as BigInt; convert, and never let a UI
        // callback error abort the transfer itself.
        // First try in a background URLSession (survives suspension); if that
        // fails, retry as a plain foreground upload, which is more reliable.
        sessionType: attempt <= 1 ? 'background' : 'foreground',
        onProgress: ({ bytesSent, totalBytes }) => {
          try {
            onProgress(Number(bytesSent), Number(totalBytes) || bytes);
          } catch {
            // Progress is cosmetic.
          }
        },
        signal,
      },
    );
    try {
      const result = await task.uploadAsync();
      const duplicate = result.status === 409 || /Duplicate|already exists/i.test(result.body ?? '');
      if ((result.status < 200 || result.status >= 300) && !duplicate) {
        throw new Error(result.status === 413 ? 'too_large' : `upload_failed_${result.status}`);
      }
    } finally {
      task.release();
    }
    return rpc<'ready' | 'rejected'>('complete_media_upload', { p_id: media.id });
  },

  deleteMedia: (mediaId) => rpc('delete_media', { p_id: mediaId }),

  setLiked: (mediaId, liked) => rpc('set_media_like', { p_media: mediaId, p_liked: liked }),
  leaveTrip: (tripId) => rpc('leave_trip', { p_trip: tripId }),
  removeMember: (tripId, userId) => rpc('remove_member', { p_trip: tripId, p_user: userId }),
  deleteTrip: (tripId) => rpc('delete_trip', { p_trip: tripId }),

  report: ({ tripId, mediaId, userId, reason, details }) =>
    rpc('report_content', {
      p_trip: tripId,
      p_media: mediaId ?? null,
      p_user: userId ?? null,
      p_reason: reason,
      p_details: details ?? null,
    }),

  async setBlocked(userId, blocked) {
    const client = requireSupabase();
    const { data } = await client.auth.getUser();
    const me = data.user?.id;
    if (!me) throw new Error('not_authenticated');
    const { error } = blocked
      ? await client.from('user_blocks').upsert({ blocker_id: me, blocked_id: userId }, { ignoreDuplicates: true })
      : await client.from('user_blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
    if (error) throw new Error(error.message);
  },

  async getProfile() {
    const me = await currentUserId();
    const { data, error } = await requireSupabase()
      .from('profiles')
      .select('display_name, avatar_path, avatar_color')
      .eq('id', me)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const avatars = await signAvatars(data?.avatar_path ? [data.avatar_path] : []);
    return {
      displayName: data?.display_name ?? '',
      avatarUrl: data?.avatar_path ? avatars.get(data.avatar_path) ?? null : null,
      avatarColor: data?.avatar_color ?? null,
    };
  },

  async updateProfile({ displayName, avatarColor }) {
    const me = await currentUserId();
    const patch: Record<string, string | null> = {};
    if (displayName !== undefined) patch.display_name = displayName.trim().slice(0, 60);
    if (avatarColor !== undefined) patch.avatar_color = avatarColor;
    if (!Object.keys(patch).length) return;
    const { error } = await requireSupabase().from('profiles').update(patch).eq('id', me);
    if (error) throw new Error(error.message);
  },

  async setAvatar(localUri) {
    if (!localUri) {
      await rpc('set_avatar', { p_path: null });
      return;
    }
    const me = await currentUserId();
    // Square, 512 px JPEG; re-encoding drops EXIF metadata such as GPS.
    const context = ImageManipulator.manipulate(localUri).resize({ width: 512, height: 512 });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    context.release();
    image.release();
    const file = new File(saved.uri);
    const bytes = await file.bytes();
    file.delete();
    const path = `${me}/avatar-${Crypto.randomUUID()}.jpg`;
    const { error } = await requireSupabase()
      .storage.from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    await rpc('set_avatar', { p_path: path });
  },
};
