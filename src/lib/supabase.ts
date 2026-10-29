import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { config } from './config';

// Sessions can exceed the comfortable size of a single Keychain item, so the
// value is split into chunks. Tokens never touch plain files or logs.
const CHUNK = 1800;

const keychainStorage = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p == null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    await keychainStorage.removeItem(key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    }
    await SecureStore.setItemAsync(`${key}.n`, String(count));
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    await SecureStore.deleteItemAsync(`${key}.n`);
    for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
};

export const supabase: SupabaseClient | null = config.hasBackend
  ? createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        storage: keychainStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}
