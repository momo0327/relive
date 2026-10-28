// Live policy test against the linked Supabase project (a TEST project only).
//
// Signs in throwaway anonymous users, walks the trip flow against the real
// Storage server, and deletes what it created. Prints results only, never
// tokens or signed URLs.
//
// Requirements: `npx supabase link` done, anonymous sign-ins temporarily enabled,
// EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY set (e.g. from .env.local):
//
//   node --env-file=.env.local supabase/tests/live.test.mjs
//
// Leaves the test file queued in storage_deletions; it is removed on the next purge-media run.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

import { randomUUID } from 'node:crypto';
const root = new globalThis.URL('../..', import.meta.url).pathname;
const require = createRequire(root + 'package.json');
const { createClient } = require('@supabase/supabase-js');
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !KEY) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
// A real 8×8 grey JPEG (made with macOS sips).
const photo = Buffer.from(
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACKADAAQAAAABAAAACAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgACAAIAwERAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/bAEMBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/dAAQAAf/aAAwDAQACEQMRAD8AKAP/2Q==',
  'base64',
);
let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${name}`); };
const sql = (q) => JSON.parse(execFileSync('npx', ['supabase', 'db', 'query', '--linked', q], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));

async function user() {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw new Error('anon sign-in failed: ' + error.message);
  return { c, id: data.user.id, token: data.session.access_token };
}
const rpc = async (u, fn, args) => u.c.rpc(fn, args);
const upload = (u, path, upsert = false) => fetch(`${URL}/storage/v1/object/trip-media/${path}`, {
  method: 'POST', body: photo,
  headers: { authorization: `Bearer ${u.token}`, apikey: KEY, 'content-type': 'image/jpeg', 'x-upsert': String(upsert) },
});
const canRead = async (u, tripId, path) => {
  const list = await u.c.storage.from('trip-media').list(tripId + '/' + path.split('/')[1]);
  const signed = await u.c.storage.from('trip-media').createSignedUrl(path, 60);
  const dl = await u.c.storage.from('trip-media').download(path);
  const rows = await u.c.from('media').select('id');
  const listed = await rpc(u, 'list_trip_media', { p_trip: tripId });
  let fetched = false;
  if (signed.data?.signedUrl) fetched = (await fetch(signed.data.signedUrl)).ok;
  return { list: (list.data ?? []).length, signed: !!signed.data?.signedUrl, fetched, download: !dl.error, rows: (rows.data ?? []).length, listed: (listed.data ?? []).length };
};
const none = (r) => !r.list && !r.signed && !r.fetched && !r.download && !r.rows && !r.listed;

const A = await user(), B = await user(), C = await user();
console.log('Signed in 3 anonymous test users');

const now = Date.now();
const { data: tripId, error: e1 } = await rpc(A, 'create_trip', { p_name: 'Live policy test', p_starts_at: new Date(now - 3600e3).toISOString(), p_unlocks_at: new Date(now + 7200e3).toISOString() });
check('A creates a trip', !e1 && !!tripId);
const { data: token } = await rpc(A, 'create_invite', { p_trip: tripId });
check('C (non-member) cannot see the trip', (await C.c.from('trips').select('id')).data?.length === 0);
const preview = await rpc(B, 'preview_invite', { p_token: token });
check('B previews the invite', preview.data?.name === 'Live policy test');
check('B joins with the invite', (await rpc(B, 'accept_invite', { p_token: token })).data === tripId);
check('Wrong token joins nothing', (await rpc(C, 'accept_invite', { p_token: 'A'.repeat(32) })).data === null);

const mediaId = randomUUID();
const { data: path, error: e2 } = await rpc(A, 'reserve_media_upload', { p_id: mediaId, p_trip: tripId, p_kind: 'photo', p_mime: 'image/jpeg', p_bytes: photo.length, p_duration_ms: null, p_width: 8, p_height: 8, p_captured_at: new Date().toISOString() });
check('A reserves an upload path', !e2 && typeof path === 'string');
check('C cannot upload into the trip', !(await upload(C, path)).ok);
const up = await upload(A, path);
check(`A uploads the photo (HTTP ${up.status})`, up.ok);
check('A completes the upload', (await rpc(A, 'complete_media_upload', { p_id: mediaId })).data === 'ready');
check('A cannot overwrite it (upsert)', !(await upload(A, path, true)).ok);
check('A cannot upload to an unreserved path', !(await upload(A, `${tripId}/${A.id}/${randomUUID()}.jpg`)).ok);
await A.c.storage.from('trip-media').remove([path]);

const before = { A: await canRead(A, tripId, path), B: await canRead(B, tripId, path), C: await canRead(C, tripId, path) };
check('Before reveal: uploader A cannot list, sign, fetch, download or see rows', none(before.A));
check('Before reveal: member B cannot either', none(before.B));
check('Before reveal: non-member C cannot either', none(before.C));
const tripB = await rpc(B, 'get_trip', { p_trip: tripId });
check('Before reveal: B sees only the count (1 memory)', tripB.data?.memory_count === 1 && tripB.data?.status === 'active');
check('Client cannot move the reveal time', !!(await A.c.from('trips').update({ unlocks_at: new Date().toISOString() }).eq('id', tripId)).error || (await A.c.from('trips').select('unlocks_at').eq('id', tripId)).data?.[0]?.unlocks_at !== undefined);
const objRows = sql(`select count(*)::int as n from storage.objects where bucket_id='trip-media' and name='${path}'`).rows;
check('A\'s delete attempt did not remove the object', objRows[0].n === 1);

sql(`update public.trips set starts_at = now() - interval '3 hours', unlocks_at = now() - interval '1 minute' where id = '${tripId}'`);
console.log('— reveal time moved into the past (server clock) —');
const after = { A: await canRead(A, tripId, path), B: await canRead(B, tripId, path), C: await canRead(C, tripId, path) };
check('After reveal: A can sign and fetch the photo', after.A.signed && after.A.fetched && after.A.listed === 1);
check('After reveal: member B can sign and fetch it', after.B.signed && after.B.fetched && after.B.listed === 1);
check('After reveal: non-member C still cannot', none(after.C));
check('After reveal: uploads are closed', !!(await rpc(B, 'reserve_media_upload', { p_id: randomUUID(), p_trip: tripId, p_kind: 'photo', p_mime: 'image/jpeg', p_bytes: 10, p_duration_ms: null, p_width: 1, p_height: 1, p_captured_at: null })).error);
await B.c.from('user_blocks').insert({ blocker_id: B.id, blocked_id: A.id });
check('B blocks A: B can no longer sign A\'s photo', !(await B.c.storage.from('trip-media').createSignedUrl(path, 60)).data?.signedUrl);

const del = await fetch(`${URL}/functions/v1/delete-account`, { method: 'POST', headers: { authorization: `Bearer ${B.token}`, apikey: KEY, 'content-type': 'application/json' }, body: '{}' });
check(`delete-account function deletes B (HTTP ${del.status})`, del.ok && sql(`select count(*)::int as n from auth.users where id='${B.id}'`).rows[0].n === 0);
check('A deletes the trip', !(await rpc(A, 'delete_trip', { p_trip: tripId })).error);
check('Trip deletion queued the file for purging', sql(`select count(*)::int as n from public.storage_deletions where object_name='${path}'`).rows[0].n === 1);
sql(`delete from auth.users where id in ('${A.id}', '${C.id}')`);
console.log('Deleted the remaining test users.');
console.log(`\n${pass} passed, ${fail} failed`);
