// Prepares the App Review demo account with two demo trips:
//   • "Amalfi Weekend (Demo)": already revealed, with photos (gallery, viewer, export)
//   • "Kyoto Spring (Demo)": locked, with sealed memories (countdown state)
// Photos are illustrations in supabase/seed/review-photos (no real people).
//
// Prerequisites:
//   1. Supabase → Authentication → Sign In / Providers → Email: enabled,
//      "Allow new users to sign up" OFF.
//   2. Authentication → Users → Add user → create the review account (auto-confirm).
//   3. The project is linked (`npx supabase link`), since the reveal step uses SQL.
//
// Run (credentials only live in this shell command, nothing is saved):
//   REVIEW_EMAIL=review@example.com REVIEW_PASSWORD='…' \
//     node --env-file=.env.local scripts/seed-review-account.mjs
//
// Re-running replaces the demo trips.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const require = createRequire(root + 'package.json');
const { createClient } = require('@supabase/supabase-js');

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const { REVIEW_EMAIL, REVIEW_PASSWORD } = process.env;
if (!URL_ || !KEY || !REVIEW_EMAIL || !REVIEW_PASSWORD) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, REVIEW_EMAIL and REVIEW_PASSWORD');
}

const sql = (q) =>
  execFileSync('npx', ['supabase', 'db', 'query', '--linked', q], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });

const client = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: signInError } = await client.auth.signInWithPassword({ email: REVIEW_EMAIL, password: REVIEW_PASSWORD });
if (signInError) throw new Error(`Review account sign-in failed: ${signInError.message}`);
const token = auth.session.access_token;
const userId = auth.user.id;
console.log('Signed in as the review account');

const rpc = async (fn, args) => {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

await client.from('profiles').update({ display_name: 'Alex', avatar_color: '#5B7FD6' }).eq('id', userId);

// Remove previous demo trips (cascades their memories and queues files for purge).
for (const trip of await rpc('list_my_trips')) {
  if (trip.name.endsWith('(Demo)')) await rpc('delete_trip', { p_trip: trip.id });
}

const photosDir = `${root}supabase/seed/review-photos`;
const photos = readdirSync(photosDir).filter((f) => f.endsWith('.jpg')).sort().map((f) => readFileSync(`${photosDir}/${f}`));

async function uploadMemory(tripId, bytes) {
  const id = randomUUID();
  const path = await rpc('reserve_media_upload', {
    p_id: id, p_trip: tripId, p_kind: 'photo', p_mime: 'image/jpeg', p_bytes: bytes.length,
    p_duration_ms: null, p_width: 1200, p_height: 1500, p_captured_at: new Date().toISOString(),
  });
  const res = await fetch(`${URL_}/storage/v1/object/trip-media/${path}`, {
    method: 'POST',
    body: bytes,
    headers: { authorization: `Bearer ${token}`, apikey: KEY, 'content-type': 'image/jpeg', 'x-upsert': 'false' },
  });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  const status = await rpc('complete_media_upload', { p_id: id });
  if (status !== 'ready') throw new Error('upload rejected');
}

async function createTrip(name, startsAt, unlocksAt, cover, tone) {
  const tripId = await rpc('create_trip', { p_name: name, p_starts_at: startsAt.toISOString(), p_unlocks_at: unlocksAt.toISOString() });
  const coverPath = `${tripId}/cover-${randomUUID()}.jpg`;
  const { error } = await client.storage.from('trip-covers').upload(coverPath, cover, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`cover upload: ${error.message}`);
  await rpc('set_trip_cover', { p_trip: tripId, p_path: coverPath, p_tone: tone });
  return tripId;
}

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

// Revealed trip: created with future dates (the server requires that), then moved into the past.
const revealed = await createTrip('Amalfi Weekend (Demo)', new Date(now - day), new Date(now + day), photos[0], 'light');
for (const bytes of photos) await uploadMemory(revealed, bytes);
sql(`update public.trips set starts_at = now() - interval '4 days', unlocks_at = now() - interval '1 day' where id = '${revealed}'`);
console.log(`✓ Revealed demo trip with ${photos.length} memories`);

// Locked trip with a few sealed memories.
const locked = await createTrip('Kyoto Spring (Demo)', new Date(now - day), new Date(now + 30 * day), photos[4], 'dark');
for (const bytes of photos.slice(1, 4)) await uploadMemory(locked, bytes);
console.log('✓ Locked demo trip with 3 sealed memories');

await client.auth.signOut();
console.log('Done. Put the review account email and password in App Store Connect → App Review Information.');
