import * as Notifications from 'expo-notifications';

import { readJson, writeJson } from './kv';
import type { TripSummary } from './types';

/**
 * Local (on-device) notifications, no server push:
 *  - one reminder a day at 19:00 while a trip is locked and in progress
 *  - one alert at the trip's reveal time
 * Rescheduled from scratch whenever the trip list loads, so leaving, deleting
 * or joining a trip is reflected the next time Memories is opened.
 */
const PREF_KEY = 'notifications';
const DAILY_HOUR = 19;
const DAILY_PER_TRIP = 7; // iOS keeps at most 64 pending notifications per app
const MAX_PENDING = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function notificationsEnabled(): boolean {
  return readJson<{ enabled: boolean }>(PREF_KEY, { enabled: true }).enabled;
}

export function setNotificationsEnabled(enabled: boolean) {
  writeJson(PREF_KEY, { enabled });
  if (!enabled) Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

/** Asks once, at a moment that makes sense (after creating or joining a trip). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsEnabled()) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

export async function cancelAllTripNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

function atLocalHour(day: Date, hour: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0);
}

export async function syncTripNotifications(trips: TripSummary[]) {
  if (!notificationsEnabled()) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  const requests: Notifications.NotificationRequestInput[] = [];
  const locked = trips.filter((t) => t.status !== 'revealed' && t.unlocksAt.getTime() > now);

  // Reveal alerts first, so they're never squeezed out by daily reminders.
  for (const trip of locked) {
    requests.push({
      identifier: `reveal-${trip.id}`,
      content: {
        title: `${trip.name} is unlocked ✨`,
        body: 'Every memory from the trip is ready. See what everyone captured.',
        data: { tripId: trip.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trip.unlocksAt },
    });
  }

  for (const trip of locked) {
    const first = new Date(Math.max(trip.startsAt.getTime(), now));
    for (let i = 0, added = 0; added < DAILY_PER_TRIP; i += 1) {
      const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      const when = atLocalHour(day, DAILY_HOUR);
      if (when.getTime() >= trip.unlocksAt.getTime()) break;
      if (when.getTime() <= now) continue;
      const dayNumber = Math.floor((when.getTime() - trip.startsAt.getTime()) / 86_400_000) + 1;
      requests.push({
        identifier: `daily-${trip.id}-${dayNumber}`,
        content: {
          title: trip.name,
          body: `Day ${dayNumber}. Capture something today 📸 It stays hidden until the trip ends.`,
          data: { tripId: trip.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
      added += 1;
    }
  }

  for (const request of requests.slice(0, MAX_PENDING)) {
    await Notifications.scheduleNotificationAsync(request).catch(() => undefined);
  }
}

export function tripIdFromResponse(response: Notifications.NotificationResponse | null | undefined): string | null {
  const id = response?.notification.request.content.data?.tripId;
  return typeof id === 'string' ? id : null;
}
