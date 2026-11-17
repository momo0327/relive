/**
 * Soft click for scrubbing through photos. Loaded lazily and fully optional:
 * if the audio module isn't in this build, scrubbing just stays silent.
 * Follows the ringer switch (silent mode = no sound) and mixes with music.
 */
import { requireOptionalNativeModule } from 'expo';

type Player = { seekTo: (s: number) => Promise<void>; play: () => void; volume: number };

// A few players taking turns, so a click never waits for (or cuts off) the
// previous one when photos fly past quickly.
const POOL = 4;
let players: Player[] = [];
let next = 0;
let ready = false;
let lastPlayed = 0;

function load() {
  if (ready) return;
  ready = true;
  try {
    // Builds without the native audio module (e.g. TestFlight build 5) must
    // never load expo-audio at all: skip quietly.
    if (!requireOptionalNativeModule('ExpoAudio')) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio');
    audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
    const source = require('@/assets/sounds/tick.wav');
    players = Array.from({ length: POOL }, () => {
      const p = audio.createAudioPlayer(source) as Player;
      p.volume = 0.35;
      return p;
    });
  } catch {
    players = [];
  }
}

/** Load the sound ahead of time, so the very first click isn't late. */
export function warmTick() {
  load();
}

export function playTick() {
  load();
  const now = Date.now();
  // One click per photo, up to ~40 a second.
  if (players.length === 0 || now - lastPlayed < 25) return;
  lastPlayed = now;
  const player = players[next];
  next = (next + 1) % players.length;
  player.seekTo(0).catch(() => undefined);
  player.play();
}
