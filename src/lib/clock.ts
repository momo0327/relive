/**
 * Server-anchored clock for countdowns. We record the server's time and a
 * monotonic timestamp together; later readings advance with the monotonic
 * clock, so changing the device clock doesn't move the countdown.
 *
 * This is presentation only: the database decides whether a trip is revealed.
 */
let anchor: { serverMs: number; monoMs: number } | null = null;

export function syncServerTime(serverNow: Date | string, requestStartedMono: number) {
  const mono = performance.now();
  // Assume the server stamped the response halfway through the round trip.
  const midpoint = (requestStartedMono + mono) / 2;
  anchor = { serverMs: new Date(serverNow).getTime() + (mono - midpoint), monoMs: mono };
}

export function serverNowMs(): number {
  if (!anchor) return Date.now();
  return anchor.serverMs + (performance.now() - anchor.monoMs);
}

export function monoNow(): number {
  return performance.now();
}
