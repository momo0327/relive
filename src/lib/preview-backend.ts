import * as Crypto from 'expo-crypto';

import type { Backend } from './backend';
import { measureTone } from './image-tone';
import type { MediaItem, Member, Profile, TripDetail } from './types';

/**
 * Preview mode: an in-memory sample that never contacts a server. It exists
 * so people (and App Review) can tour the app without an account, and so the
 * app runs without Supabase credentials during development. The UI shows a
 * persistent "Preview" banner whenever this backend is active.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const noAvatar = { avatarUrl: null, avatarColor: null };
const me: Member = { userId: 'preview-me', displayName: 'You', role: 'owner', isMe: true, blocked: false, ...noAvatar };
const friends: Member[] = [
  { userId: 'preview-maya', displayName: 'Maya', role: 'member', isMe: false, blocked: false, ...noAvatar },
  { userId: 'preview-leo', displayName: 'Leo', role: 'member', isMe: false, blocked: false, ...noAvatar },
  { userId: 'preview-sam', displayName: 'Sam', role: 'member', isMe: false, blocked: false, ...noAvatar },
];

const palettes: [string, string][] = [
  ['#F59E8B', '#7C3AED'], ['#FCD34D', '#F97316'], ['#67E8F9', '#1D4ED8'], ['#F9A8D4', '#BE185D'],
  ['#A7F3D0', '#047857'], ['#FDE68A', '#B45309'], ['#C4B5FD', '#4338CA'], ['#FCA5A5', '#991B1B'],
];

type Store = { trips: TripDetail[]; media: Map<string, MediaItem[]>; profile: Profile };

function seed(): Store {
  const now = Date.now();
  const revealedId = 'preview-kyoto';
  const kyotoMedia: MediaItem[] = Array.from({ length: 14 }, (_, i) => {
    const uploader = [me, ...friends][i % 4];
    const video = i % 5 === 2;
    return {
      id: `preview-media-${i}`,
      kind: video ? 'video' : 'photo',
      durationMs: video ? 8000 + i * 1000 : null,
      width: 3000,
      height: i % 3 === 0 ? 4000 : 2250,
      takenAt: new Date(now - 20 * DAY + i * 5 * HOUR),
      uploaderId: uploader.userId,
      uploaderName: uploader.displayName,
      isMine: uploader.isMe,
      url: null,
      sampleColors: palettes[i % palettes.length],
    };
  });
  return {
    profile: { displayName: 'You', avatarUrl: null, avatarColor: null },
    media: new Map([[revealedId, kyotoMedia]]),
    trips: [
      {
        id: 'preview-amalfi', name: 'Amalfi Coast', coverUrl: null, coverKey: null, coverTone: 'dark',
        startsAt: new Date(now - 3 * DAY), unlocksAt: new Date(now + 2 * DAY + 5 * HOUR),
        status: 'active', isOwner: true, memberCount: 4, memoryCount: 23, myMemoryCount: 6,
        members: [me, ...friends],
      },
      {
        id: 'preview-iceland', name: 'Iceland Ring Road', coverUrl: null, coverKey: null, coverTone: 'dark',
        startsAt: new Date(now + 20 * DAY), unlocksAt: new Date(now + 30 * DAY),
        status: 'upcoming', isOwner: false, memberCount: 2, memoryCount: 0, myMemoryCount: 0,
        members: [{ ...friends[0], role: 'owner' }, { ...me, role: 'member' }],
      },
      {
        id: revealedId, name: 'Kyoto in Bloom', coverUrl: null, coverKey: null, coverTone: 'dark',
        startsAt: new Date(now - 21 * DAY), unlocksAt: new Date(now - 14 * DAY),
        status: 'revealed', isOwner: true, memberCount: 4, memoryCount: kyotoMedia.length,
        myMemoryCount: kyotoMedia.filter((m) => m.isMine).length,
        members: [me, ...friends],
      },
    ],
  };
}

let store = seed();

export function resetPreview() {
  store = seed();
}

/** Mirrors the preview profile onto "me" in every sample trip. */
function syncMe() {
  for (const trip of store.trips) {
    trip.members = trip.members.map((m) =>
      m.isMe
        ? { ...m, displayName: store.profile.displayName, avatarUrl: store.profile.avatarUrl, avatarColor: store.profile.avatarColor }
        : m,
    );
  }
}

function findTrip(tripId: string): TripDetail {
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error('not_found');
  return trip;
}

function refreshStatus(trip: TripDetail) {
  const now = Date.now();
  trip.status = now >= trip.unlocksAt.getTime() ? 'revealed' : now >= trip.startsAt.getTime() ? 'active' : 'upcoming';
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const previewBackend: Backend = {
  kind: 'preview',

  async listTrips() {
    await wait(250);
    store.trips.forEach(refreshStatus);
    return store.trips.map(({ members: _members, ...t }) => ({ ...t, memberCount: _members.length }));
  },

  async getTrip(tripId) {
    await wait(150);
    const trip = findTrip(tripId);
    refreshStatus(trip);
    return { ...trip, memberCount: trip.members.length, members: [...trip.members] };
  },

  async createTrip({ name, startsAt, unlocksAt, coverUri }) {
    await wait(300);
    const id = `preview-${Crypto.randomUUID()}`;
    const coverTone = coverUri ? await measureTone(coverUri) : 'dark';
    store.trips.unshift({
      id, name, coverUrl: coverUri, coverKey: coverUri, coverTone, startsAt, unlocksAt,
      status: 'upcoming', isOwner: true, memberCount: 1, memoryCount: 0, myMemoryCount: 0,
      members: [me],
    });
    refreshStatus(store.trips[0]);
    return id;
  },

  async createInvite() {
    return `preview${Crypto.randomUUID().replace(/-/g, '').slice(0, 25)}`;
  },
  async revokeInvites() {},

  async previewInvite() {
    return null;
  },
  async acceptInvite() {
    return null;
  },

  async listMedia(tripId) {
    await wait(200);
    const trip = findTrip(tripId);
    refreshStatus(trip);
    if (trip.status !== 'revealed') return [];
    return (store.media.get(tripId) ?? []).filter(
      (m) => !trip.members.find((x) => x.userId === m.uploaderId)?.blocked,
    );
  },

  async mediaUrl() {
    return null;
  },

  async uploadMedia(media, onProgress, signal) {
    const trip = findTrip(media.tripId);
    for (let step = 1; step <= 10; step += 1) {
      if (signal.aborted) throw new Error('aborted');
      await wait(120);
      onProgress((media.bytes * step) / 10, media.bytes);
    }
    refreshStatus(trip);
    if (trip.status === 'revealed') throw new Error('upload_window_closed');
    trip.memoryCount += 1;
    trip.myMemoryCount += 1;
    return 'ready';
  },

  async deleteMedia(mediaId) {
    for (const [tripId, items] of store.media) {
      store.media.set(tripId, items.filter((m) => m.id !== mediaId));
    }
  },

  async leaveTrip(tripId) {
    store.trips = store.trips.filter((t) => t.id !== tripId);
  },
  async removeMember(tripId, userId) {
    const trip = findTrip(tripId);
    trip.members = trip.members.filter((m) => m.userId !== userId);
    store.media.set(tripId, (store.media.get(tripId) ?? []).filter((m) => m.uploaderId !== userId));
  },
  async deleteTrip(tripId) {
    store.trips = store.trips.filter((t) => t.id !== tripId);
  },
  async report() {
    await wait(300);
  },
  async setBlocked(userId, blocked) {
    for (const trip of store.trips) {
      trip.members = trip.members.map((m) => (m.userId === userId ? { ...m, blocked } : m));
    }
  },
  async getProfile() {
    return { ...store.profile };
  },
  async updateProfile({ displayName, avatarColor }) {
    if (displayName !== undefined) store.profile.displayName = displayName.trim().slice(0, 60);
    if (avatarColor !== undefined) store.profile.avatarColor = avatarColor;
    syncMe();
  },
  async setAvatar(localUri) {
    store.profile.avatarUrl = localUri;
    syncMe();
  },
};
