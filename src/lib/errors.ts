const messages: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  not_found: "This trip isn't available. You may have left or been removed.",
  forbidden: "You don't have permission to do that.",
  invalid_name: 'Give your trip a name (up to 80 characters).',
  invalid_dates: 'Check the dates: the trip must end in the future and last at most 62 days.',
  rate_limited: 'Too many attempts. Please wait a while and try again.',
  trip_revealed: 'This trip has ended, so new invites are closed.',
  trip_full: 'This trip already has the maximum of 50 members.',
  upload_window_closed: 'This trip has ended, so new memories can no longer be added.',
  invalid_media_type: "This file type isn't supported.",
  object_missing: 'The upload did not finish. It will be retried.',
  invalid_cover: "The cover image couldn't be saved.",
  invalid_report: 'Choose what you want to report.',
};

/** Turns backend/network errors into short, user-facing text without leaking details. */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  for (const [code, text] of Object.entries(messages)) {
    if (raw.includes(code)) return text;
  }
  if (/network|fetch|offline|timed out/i.test(raw)) return "You're offline or the connection dropped. Try again when you're back online.";
  // Development builds show the underlying reason to speed up debugging.
  if (__DEV__ && raw) return `${fallback}\n\n[dev] ${raw.slice(0, 200)}`;
  return fallback;
}

export function errorCode(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  return Object.keys(messages).find((code) => raw.includes(code)) ?? null;
}
