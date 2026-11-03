import { File, Paths } from 'expo-file-system';

import { requireSupabase } from './supabase';

export type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  color: string | null;
  thumb: string;
  regular: string;
  downloadLocation: string;
  author: string;
  authorUrl: string;
};

/** Featured photos (no query) or search results, via the `unsplash` Edge Function. */
export async function searchUnsplash(query = '', page = 1): Promise<UnsplashPhoto[]> {
  const { data, error } = await requireSupabase().functions.invoke('unsplash', { body: { query, page } });
  if (error) throw error;
  return (data?.photos ?? []) as UnsplashPhoto[];
}

/** Registers the download with Unsplash (required) and saves the photo locally for upload. */
export async function downloadUnsplash(photo: UnsplashPhoto): Promise<string> {
  requireSupabase()
    .functions.invoke('unsplash', { body: { download: photo.downloadLocation } })
    .catch(() => undefined);
  const target = new File(Paths.cache, `unsplash-${photo.id}.jpg`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(photo.regular, target);
  return file.uri;
}

/** One-shot hand-off from the Unsplash search screen back to New Trip. */
let listener: ((photo: UnsplashPhoto) => void) | null = null;
export function onUnsplashPick(fn: ((photo: UnsplashPhoto) => void) | null) {
  listener = fn;
}
export function pickUnsplash(photo: UnsplashPhoto) {
  listener?.(photo);
}
