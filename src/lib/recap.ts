import { readJson, writeJson } from './kv';
import type { MediaItem, Member } from './types';

export type Contributor = { userId: string; name: string; member: Member | null; count: number };

export type Recap = {
  total: number;
  photos: number;
  videos: number;
  videoSeconds: number;
  contributors: Contributor[];
  busiestDay: { date: Date; count: number; items: MediaItem[] } | null;
  nightOwl: MediaItem | null;
  earlyBird: MediaItem | null;
  first: MediaItem | null;
  last: MediaItem | null;
};

/** Minutes since 04:00 local time, so "late night" sorts after the evening. */
function dayClock(d: Date) {
  return (d.getHours() * 60 + d.getMinutes() - 240 + 1440) % 1440;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Trip statistics computed on the device from the revealed memories the user
 * can see (the same list the gallery loads), so nothing new is exposed.
 */
export function computeRecap(items: MediaItem[], members: Member[]): Recap {
  const sorted = [...items].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const photos = sorted.filter((m) => m.kind === 'photo').length;
  const videoSeconds = Math.round(sorted.reduce((sum, m) => sum + (m.kind === 'video' ? (m.durationMs ?? 0) : 0), 0) / 1000);

  const byUser = new Map<string, Contributor>();
  for (const m of sorted) {
    const entry = byUser.get(m.uploaderId) ?? {
      userId: m.uploaderId,
      name: m.isMine ? 'You' : m.uploaderName,
      member: members.find((x) => x.userId === m.uploaderId) ?? null,
      count: 0,
    };
    entry.count += 1;
    byUser.set(m.uploaderId, entry);
  }
  const contributors = [...byUser.values()].sort((a, b) => b.count - a.count);

  const byDay = new Map<string, MediaItem[]>();
  for (const m of sorted) {
    const key = dayKey(m.takenAt);
    byDay.set(key, [...(byDay.get(key) ?? []), m]);
  }
  let busiest: MediaItem[] | null = null;
  for (const list of byDay.values()) if (!busiest || list.length > busiest.length) busiest = list;

  let nightOwl: MediaItem | null = null;
  let earlyBird: MediaItem | null = null;
  for (const m of sorted) {
    if (!nightOwl || dayClock(m.takenAt) > dayClock(nightOwl.takenAt)) nightOwl = m;
    if (!earlyBird || dayClock(m.takenAt) < dayClock(earlyBird.takenAt)) earlyBird = m;
  }

  return {
    total: sorted.length,
    photos,
    videos: sorted.length - photos,
    videoSeconds,
    contributors,
    busiestDay: busiest ? { date: busiest[0].takenAt, count: busiest.length, items: busiest } : null,
    nightOwl,
    earlyBird,
    first: sorted[0] ?? null,
    last: sorted[sorted.length - 1] ?? null,
  };
}

const SEEN_KEY = 'recap-seen';

/** Whether this device has already shown the trip's recap automatically. */
export function recapSeen(tripId: string): boolean {
  return !!readJson<Record<string, boolean>>(SEEN_KEY, {})[tripId];
}

export function markRecapSeen(tripId: string) {
  writeJson(SEEN_KEY, { ...readJson<Record<string, boolean>>(SEEN_KEY, {}), [tripId]: true });
}
