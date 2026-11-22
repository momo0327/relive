/** Trip end date as the user thinks of it: the day before the midnight reveal. */
function lastTripDay(unlocksAt: Date): Date {
  return new Date(unlocksAt.getTime() - 1);
}

export function formatTripDates(startsAt: Date, unlocksAt: Date): string {
  const end = lastTripDay(unlocksAt);
  const sameYear = startsAt.getFullYear() === end.getFullYear();
  const start = startsAt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const finish = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${finish}`;
}

export function formatRevealMoment(unlocksAt: Date): string {
  return unlocksAt.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number | null, padMinutes = false): string {
  const total = Math.round((ms ?? 0) / 1000);
  const minutes = Math.floor(total / 60);
  return `${padMinutes ? String(minutes).padStart(2, '0') : minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

type CountdownParts = { days: number; hours: number; minutes: number; seconds: number };

export function splitDuration(ms: number): CountdownParts {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export function spokenDuration({ days, hours, minutes }: CountdownParts): string {
  const parts = [];
  if (days) parts.push(plural(days, 'day'));
  if (hours) parts.push(plural(hours, 'hour'));
  if (!days) parts.push(plural(minutes, 'minute'));
  return parts.join(', ');
}

/** "NOVEMBER" for this year, "NOVEMBER 2025" for earlier years (device locale). */
export function formatCreatedMonth(date: Date, now = new Date()): string {
  const sameYear = date.getFullYear() === now.getFullYear();
  return date
    .toLocaleDateString(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' })
    .toLocaleUpperCase();
}
