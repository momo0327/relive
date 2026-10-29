import { File, Paths } from 'expo-file-system';

/**
 * Tiny JSON store for non-secret app state (onboarding flag, upload queue,
 * pending invite). Lives in the document directory so iOS doesn't purge it.
 * Auth tokens are kept in the Keychain instead (see supabase.ts).
 */
export function readJson<T>(name: string, fallback: T): T {
  try {
    const file = new File(Paths.document, `${name}.json`);
    if (!file.exists) return fallback;
    return JSON.parse(file.textSync()) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(name: string, value: unknown): void {
  const file = new File(Paths.document, `${name}.json`);
  if (!file.exists) file.create({ intermediates: true });
  file.write(JSON.stringify(value));
}

export function removeJson(name: string): void {
  const file = new File(Paths.document, `${name}.json`);
  if (file.exists) file.delete();
}
