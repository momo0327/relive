import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

/** Server-side client that bypasses RLS. Never expose this key to the app. */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = secretKey();
  if (!url || !key) throw new Error('Missing SUPABASE_URL or secret key');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function secretKey(): string | undefined {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    const value = parsed.default ?? Object.values(parsed)[0];
    if (value) return value;
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

/** Deletes queued storage objects in batches. Returns the number removed. */
export async function purgeQueuedObjects(admin: SupabaseClient, limit = 1000): Promise<number> {
  const { data: rows, error } = await admin
    .from('storage_deletions')
    .select('id, bucket_id, object_name')
    .order('id')
    .limit(limit);
  if (error) throw error;
  if (!rows?.length) return 0;

  const byBucket = new Map<string, { ids: number[]; names: string[] }>();
  for (const row of rows) {
    const entry = byBucket.get(row.bucket_id) ?? { ids: [], names: [] };
    entry.ids.push(row.id);
    entry.names.push(row.object_name);
    byBucket.set(row.bucket_id, entry);
  }

  let removed = 0;
  for (const [bucket, { ids, names }] of byBucket) {
    // remove() ignores names that no longer exist, so retries are safe.
    const { error: removeError } = await admin.storage.from(bucket).remove(names);
    if (removeError) throw removeError;
    const { error: deleteError } = await admin.from('storage_deletions').delete().in('id', ids);
    if (deleteError) throw deleteError;
    removed += names.length;
  }
  return removed;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
