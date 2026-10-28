// Scheduled job: drops stale upload reservations and deletes queued storage
// objects (from deleted memories, trips, members and accounts).
// Invoke with header `x-purge-secret: <PURGE_SECRET>` (see docs/SETUP.md).
import { adminClient, json, purgeQueuedObjects } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('PURGE_SECRET');
  if (!secret || req.headers.get('x-purge-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  try {
    const admin = adminClient();
    const { data: expired, error } = await admin.rpc('expire_stale_uploads');
    if (error) throw error;
    let purged = 0;
    for (let batch = await purgeQueuedObjects(admin); batch > 0; batch = await purgeQueuedObjects(admin)) {
      purged += batch;
    }
    return json({ expired, purged });
  } catch (err) {
    console.error('purge-media failed', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'purge_failed' }, 500);
  }
});
