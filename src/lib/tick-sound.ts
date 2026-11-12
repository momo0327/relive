/**
 * Soft click for scrubbing through photos. Loaded lazily and fully optional:
 * if the audio module isn't in this build, scrubbing just stays silent.
 * Follows the ringer switch (silent mode = no sound) and mixes with music.
 */
import { requireOptionalNativeModule } from 'expo';

type Player = { seekTo: (s: number) => Promise<void>; play: () => void; volume: number };

let player: Player | null = null;
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
    player = audio.createAudioPlayer(require('@/assets/sounds/tick.wav'));
    if (player) player.volume = 0.35;
  } catch {
    player = null;
  }
}

export function playTick() {
  load();
  const now = Date.now();
  // At most ~25 clicks a second, so very fast scrubbing doesn't buzz.
  if (!player || now - lastPlayed < 40) return;
  lastPlayed = now;
  player.seekTo(0).catch(() => undefined);
  player.play();
}
