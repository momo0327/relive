import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

import { config } from './config';

/**
 * Invite links. With EXPO_PUBLIC_INVITE_BASE_URL set (and universal links
 * configured for that domain) links are https; otherwise the app scheme.
 */
export function inviteUrl(token: string): string {
  return config.inviteBaseUrl ? `${config.inviteBaseUrl}/join/${token}` : Linking.createURL(`join/${token}`);
}

/** Pulls a token out of a pasted link or raw code. */
export function parseInviteToken(input: string): string | null {
  const match = input.trim().match(/(?:join\/)?([A-Za-z0-9_-]{32})(?:[/?#].*)?$/);
  return match ? match[1] : null;
}

// The server keeps only a hash of each token, so the device remembers the
// link it created and reuses it instead of minting a new one every time.
const key = (tripId: string) => `invite.${tripId}`;

export async function cachedInvite(tripId: string): Promise<string | null> {
  return SecureStore.getItemAsync(key(tripId)).catch(() => null);
}

export async function cacheInvite(tripId: string, token: string | null) {
  if (token) await SecureStore.setItemAsync(key(tripId), token).catch(() => undefined);
  else await SecureStore.deleteItemAsync(key(tripId)).catch(() => undefined);
}
