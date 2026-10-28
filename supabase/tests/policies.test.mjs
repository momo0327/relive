// Offline security test for the L8R migration.
//
// Runs the real migration inside PGlite (Postgres compiled to WASM) with
// minimal stand-ins for Supabase's `auth` and `storage` schemas, then checks
// the reveal, membership, invite and moderation rules as separate users.
//
//   npm run test:policies
//
// This verifies SQL logic and policies. It does not exercise the Supabase
// Storage server itself; docs/SECURITY.md describes the live-project checks.

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema extensions;
  create schema auth;
  create schema storage;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null, name text not null, owner uuid,
    metadata jsonb, created_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(SUPABASE_STUBS);
for (const file of readdirSync(join(root, 'migrations')).sort()) {
  const sql = readFileSync(join(root, 'migrations', file), 'utf8');
  // Infrastructure-only migrations (cron, network) can't run in PGlite.
  if (sql.startsWith('-- offline-test: skip')) continue;
  await db.exec(sql);
}

const users = {
  alice: '00000000-0000-4000-8000-00000000000a',
  bob: '00000000-0000-4000-8000-00000000000b',
  carol: '00000000-0000-4000-8000-00000000000c',
  mallory: '00000000-0000-4000-8000-00000000000d',
};
for (const [name, id] of Object.entries(users)) {
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [id, { full_name: name }]);
}

/** Run a query as a signed-in user, inside a transaction so role settings don't leak. */
async function as(user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [users[user]]);
    return tx.query(sql, params);
  });
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => pattern.test(String(err.message)));
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const day = 24 * 60 * 60 * 1000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();

let tripId;
let token;
const photoId = '11111111-1111-4111-8111-111111111111';
let photoPath;

console.log('L8R policy tests');

await test('creator becomes owner of a new trip', async () => {
  const { rows } = await as('alice', `select public.create_trip('Lisbon', $1, $2) as id`, [iso(-day), iso(3 * day)]);
  tripId = rows[0].id;
  const trips = await as('alice', `select * from public.list_my_trips()`);
  assert.equal(trips.rows.length, 1);
  assert.equal(trips.rows[0].role, 'owner');
  assert.equal(trips.rows[0].status, 'active');
});

await test('rejects invalid trip input', async () => {
  await rejects(as('alice', `select public.create_trip('', $1, $2)`, [iso(0), iso(day)]), /invalid_name/);
  await rejects(as('alice', `select public.create_trip('x', $1, $2)`, [iso(-3 * day), iso(-day)]), /invalid_dates/);
  await rejects(as('alice', `select public.create_trip('x', $1, $2)`, [iso(0), iso(90 * day)]), /invalid_dates/);
});

await test('non-members cannot see the trip', async () => {
  const { rows } = await as('bob', `select * from public.trips`);
  assert.equal(rows.length, 0);
  await rejects(as('bob', `select public.get_trip($1)`, [tripId]), /not_found/);
});

await test('invite tokens are stored hashed and join requires the token', async () => {
  token = (await as('alice', `select public.create_invite($1) as t`, [tripId])).rows[0].t;
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  const raw = await db.query(`select count(*)::int as n from public.trip_invites where token_hash = convert_to($1, 'utf8')`, [token]);
  assert.equal(raw.rows[0].n, 0);
  await rejects(as('bob', `select * from public.trip_invites`), /permission denied/);

  const preview = (await as('bob', `select public.preview_invite($1) as p`, [token])).rows[0].p;
  assert.equal(preview.name, 'Lisbon');
  assert.equal(preview.already_member, false);
  const joined = (await as('bob', `select public.accept_invite($1) as id`, [token])).rows[0].id;
  assert.equal(joined, tripId);
});

await test('invite guessing is rate limited', async () => {
  for (let i = 0; i < 10; i += 1) {
    const r = await as('mallory', `select public.accept_invite($1) as id`, ['A'.repeat(31) + i]);
    assert.equal(r.rows[0].id, null);
  }
  await rejects(as('mallory', `select public.preview_invite($1)`, [token]), /rate_limited/);
});

await test('clients cannot insert membership rows directly', async () => {
  await rejects(
    as('carol', `insert into public.trip_members (trip_id, user_id) values ($1, $2)`, [tripId, users.carol]),
    /permission denied/,
  );
});

await test('uploads require a reservation and membership', async () => {
  await rejects(
    as('carol', `select public.reserve_media_upload($1, $2, 'photo', 'image/jpeg', 1000, null, 10, 10, null)`, [photoId, tripId]),
    /not_found/,
  );
  await rejects(
    as('alice', `insert into storage.objects (bucket_id, name, metadata) values ('trip-media', $1, '{}')`, [`${tripId}/${users.alice}/rogue.jpg`]),
    /row-level security/,
  );
  await rejects(
    as('alice', `select public.reserve_media_upload($1, $2, 'video', 'video/mp4', 1000, 120000, 10, 10, null)`, ['22222222-2222-4222-8222-222222222222', tripId]),
    /violates check constraint/,
  );
  await rejects(
    as('alice', `select public.reserve_media_upload($1, $2, 'photo', 'image/png', 1000, null, 10, 10, null)`, ['22222222-2222-4222-8222-222222222223', tripId]),
    /invalid_media_type/,
  );
});

await test('member uploads into the reserved path and completes', async () => {
  photoPath = (await as('alice', `select public.reserve_media_upload($1, $2, 'photo', 'image/jpeg', 2048, null, 4000, 3000, now()) as p`, [photoId, tripId])).rows[0].p;
  assert.equal(photoPath, `${tripId}/${users.alice}/${photoId}.jpg`);
  const again = (await as('alice', `select public.reserve_media_upload($1, $2, 'photo', 'image/jpeg', 2048, null, 4000, 3000, now()) as p`, [photoId, tripId])).rows[0].p;
  assert.equal(again, photoPath, 'reservation is idempotent');
  await rejects(
    as('bob', `insert into storage.objects (bucket_id, name, metadata) values ('trip-media', $1, '{}')`, [photoPath]),
    /row-level security/,
  );
  await as('alice', `insert into storage.objects (bucket_id, name, metadata) values ('trip-media', $1, $2)`, [
    photoPath,
    { size: 2048, mimetype: 'image/jpeg' },
  ]);
  const status = (await as('alice', `select public.complete_media_upload($1) as s`, [photoId])).rows[0].s;
  assert.equal(status, 'ready');
});

await test('nobody, including the uploader, can read media before reveal', async () => {
  for (const user of ['alice', 'bob', 'carol']) {
    assert.equal((await as(user, `select * from storage.objects where bucket_id = 'trip-media'`)).rows.length, 0, user);
    assert.equal((await as(user, `select * from public.media`)).rows.length, 0, user);
  }
  assert.equal((await as('alice', `select * from public.list_trip_media($1)`, [tripId])).rows.length, 0);
  const trip = (await as('bob', `select public.get_trip($1) as t`, [tripId])).rows[0].t;
  assert.equal(trip.memory_count, 1, 'locked trips still show a count');
  assert.equal(trip.status, 'active');
});

await test('objects that fail validation are rejected and queued for purge', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const path = (await as('bob', `select public.reserve_media_upload($1, $2, 'photo', 'image/jpeg', 100, null, 1, 1, null) as p`, [id, tripId])).rows[0].p;
  await as('bob', `insert into storage.objects (bucket_id, name, metadata) values ('trip-media', $1, $2)`, [path, { size: 100, mimetype: 'text/html' }]);
  assert.equal((await as('bob', `select public.complete_media_upload($1) as s`, [id])).rows[0].s, 'rejected');
  const queued = await db.query(`select 1 from public.storage_deletions where object_name = $1`, [path]);
  assert.equal(queued.rows.length, 1);
});

await test('changing the reveal time is not possible from the client', async () => {
  await rejects(as('alice', `update public.trips set unlocks_at = now() where id = $1`, [tripId]), /permission denied/);
});

// Simulate the server clock passing the reveal time.
await db.query(`update public.trips set starts_at = now() - interval '5 days', unlocks_at = now() - interval '1 minute' where id = $1`, [tripId]);

await test('after reveal, members (and only members) can read media', async () => {
  for (const user of ['alice', 'bob']) {
    const objects = await as(user, `select name from storage.objects where bucket_id = 'trip-media'`);
    assert.deepEqual(objects.rows.map((r) => r.name), [photoPath], user);
    assert.equal((await as(user, `select * from public.list_trip_media($1)`, [tripId])).rows.length, 1, user);
  }
  assert.equal((await as('carol', `select * from storage.objects where bucket_id = 'trip-media'`)).rows.length, 0);
  assert.equal((await as('carol', `select * from public.list_trip_media($1)`, [tripId])).rows.length, 0);
});

await test('uploads and invites close at reveal', async () => {
  await rejects(
    as('bob', `select public.reserve_media_upload($1, $2, 'photo', 'image/jpeg', 100, null, 1, 1, null)`, ['44444444-4444-4444-8444-444444444444', tripId]),
    /upload_window_closed/,
  );
  await rejects(as('bob', `select public.create_invite($1)`, [tripId]), /trip_revealed/);
  assert.equal((await as('carol', `select public.accept_invite($1) as id`, [token])).rows[0].id, null);
});

await test('blocking a member hides their memories from the blocker', async () => {
  await as('bob', `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [users.bob, users.alice]);
  assert.equal((await as('bob', `select * from storage.objects where bucket_id = 'trip-media'`)).rows.length, 0);
  assert.equal((await as('bob', `select * from public.list_trip_media($1)`, [tripId])).rows.length, 0);
  await as('bob', `delete from public.user_blocks where blocked_id = $1`, [users.alice]);
  assert.equal((await as('bob', `select * from public.list_trip_media($1)`, [tripId])).rows.length, 1);
});

await test('reporting a memory hides it from the reporter', async () => {
  await as('bob', `select public.report_content($1, $2, null, 'inappropriate', 'test')`, [tripId, photoId]);
  assert.equal((await as('bob', `select * from public.list_trip_media($1)`, [tripId])).rows.length, 0);
  assert.equal((await as('alice', `select * from public.list_trip_media($1)`, [tripId])).rows.length, 1);
  await rejects(as('bob', `select * from public.reports`), /permission denied/);
});

await test('only the owner can remove members; removed members cannot rejoin', async () => {
  await rejects(as('bob', `select public.remove_member($1, $2)`, [tripId, users.alice]), /forbidden/);
  // A fresh trip so the invite is still live.
  const t2 = (await as('alice', `select public.create_trip('Tokyo', $1, $2) as id`, [iso(0), iso(5 * day)])).rows[0].id;
  const tok = (await as('alice', `select public.create_invite($1) as t`, [t2])).rows[0].t;
  await as('carol', `select public.accept_invite($1)`, [tok]);
  await as('alice', `select public.remove_member($1, $2)`, [t2, users.carol]);
  await rejects(as('carol', `select public.accept_invite($1)`, [tok]), /forbidden/);
});

await test('only uploader or owner can delete a memory; deletion queues the file', async () => {
  await rejects(as('carol', `select public.delete_media($1)`, [photoId]), /not_found/);
  await as('alice', `select public.delete_media($1)`, [photoId]);
  const queued = await db.query(`select 1 from public.storage_deletions where object_name = $1`, [photoPath]);
  assert.equal(queued.rows.length, 1);
});

await test('account deletion transfers ownership and removes uploads', async () => {
  await db.exec(`set role service_role`);
  await db.query(`select public.prepare_account_deletion($1)`, [users.alice]);
  await db.exec(`reset role`);
  await db.query(`delete from auth.users where id = $1`, [users.alice]);
  const owner = await db.query(`select owner_id from public.trips where id = $1`, [tripId]);
  assert.equal(owner.rows[0].owner_id, users.bob);
  const tokyo = await db.query(`select 1 from public.trips where name = 'Tokyo'`);
  assert.equal(tokyo.rows.length, 0, 'trip with no remaining members is deleted');
});

await test('profiles get a first name from the provider, including on later linking', async () => {
  const dave = '00000000-0000-4000-8000-0000000000e1';
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{}')`, [dave]);
  let name = (await db.query(`select display_name from public.profiles where id = $1`, [dave])).rows[0].display_name;
  assert.equal(name, '', 'no name shared at sign-up');
  await db.query(`update auth.users set raw_user_meta_data = $2 where id = $1`, [dave, { full_name: 'Dave Lindqvist', given_name: 'Dave' }]);
  name = (await db.query(`select display_name from public.profiles where id = $1`, [dave])).rows[0].display_name;
  assert.equal(name, 'Dave', 'linked identity fills the first name');
  await db.query(`update public.profiles set display_name = 'DJ' where id = $1`, [dave]);
  await db.query(`update auth.users set raw_user_meta_data = $2 where id = $1`, [dave, { full_name: 'David L' }]);
  name = (await db.query(`select display_name from public.profiles where id = $1`, [dave])).rows[0].display_name;
  assert.equal(name, 'DJ', 'a name the user chose is never overwritten');
  const erin = '00000000-0000-4000-8000-0000000000e2';
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [erin, { name: 'Erin Moss' }]);
  assert.equal((await db.query(`select display_name from public.profiles where id = $1`, [erin])).rows[0].display_name, 'Erin');
});

await test('avatars: own path only, readable by self and trip-mates, colour validated', async () => {
  // Fresh trip with bob and carol so we know who shares a trip.
  const t = (await as('bob', `select public.create_trip('Avatar test', $1, $2) as id`, [iso(0), iso(day)])).rows[0].id;
  const tok = (await as('bob', `select public.create_invite($1) as t`, [t])).rows[0].t;
  await as('carol', `select public.accept_invite($1)`, [tok]);

  const own = `${users.bob}/avatar-55555555-5555-4555-8555-555555555555.jpg`;
  await rejects(
    as('carol', `insert into storage.objects (bucket_id, name, metadata) values ('avatars', $1, '{}')`, [own]),
    /row-level security/,
  );
  await as('bob', `insert into storage.objects (bucket_id, name, metadata) values ('avatars', $1, '{}')`, [own]);
  await rejects(as('bob', `select public.set_avatar($1)`, [`${users.carol}/avatar-55555555-5555-4555-8555-555555555555.jpg`]), /invalid_avatar/);
  await as('bob', `select public.set_avatar($1)`, [own]);

  assert.equal((await as('bob', `select 1 from storage.objects where bucket_id = 'avatars'`)).rows.length, 1, 'self');
  assert.equal((await as('carol', `select 1 from storage.objects where bucket_id = 'avatars'`)).rows.length, 1, 'trip-mate');
  assert.equal((await as('mallory', `select 1 from storage.objects where bucket_id = 'avatars'`)).rows.length, 0, 'stranger');

  const member = (await as('carol', `select public.get_trip($1) as t`, [t])).rows[0].t.members.find((m) => m.user_id === users.bob);
  assert.equal(member.avatar_path, own);

  await rejects(as('bob', `update public.profiles set avatar_color = 'red' where id = $1`, [users.bob]), /check constraint/);
  await as('bob', `update public.profiles set avatar_color = '#7C6FE0' where id = $1`, [users.bob]);
  await rejects(as('bob', `update public.profiles set avatar_path = 'x' where id = $1`, [users.bob]), /permission denied/);

  await as('bob', `select public.set_avatar(null)`);
  const queued = await db.query(`select 1 from public.storage_deletions where bucket_id = 'avatars' and object_name = $1`, [own]);
  assert.equal(queued.rows.length, 1, 'removed photo queued for purge');
});

await test('anon role cannot call RPCs', async () => {
  await rejects(
    db.transaction(async (tx) => {
      await tx.exec(`set local role anon`);
      return tx.query(`select * from public.list_my_trips()`);
    }),
    /permission denied/,
  );
});

console.log(`\n${passed} passed`);
