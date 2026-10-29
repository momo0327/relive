-- L8R core schema, row-level security, storage policies and RPCs.
--
-- Security model (see docs/SECURITY.md):
--   * Trip media lives in the private `trip-media` bucket. A storage object is
--     readable only when its `media` row is ready, the trip's reveal time has
--     passed according to the database clock, and the caller is a trip member.
--     Signed URLs can only be minted when that read policy passes, so nobody,
--     including the uploader, can obtain a usable URL before the reveal.
--   * All writes that need validation go through SECURITY DEFINER functions
--     below. Tables expose no direct insert/update/delete to clients except
--     where noted.
--   * Deleting a `media` row or trip cover enqueues its storage object in
--     `storage_deletions`; the `purge-media` edge function removes the files.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  owner_id uuid references auth.users (id) on delete set null,
  cover_path text,
  -- Brightness of the cover behind the title, measured on the creator's device:
  -- 'light' covers get dark title text, 'dark' covers get light text.
  cover_tone text not null default 'dark' check (cover_tone in ('light', 'dark')),
  starts_at timestamptz not null,
  unlocks_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint trips_dates_order check (unlocks_at > starts_at),
  constraint trips_max_length check (unlocks_at <= starts_at + interval '62 days')
);
create index trips_owner_idx on public.trips (owner_id);

create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id);

-- Users removed by the trip owner cannot rejoin with an old link.
create table public.trip_bans (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Invite tokens are random 192-bit values. Only their SHA-256 hash is stored.
create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index trip_invites_trip_idx on public.trip_invites (trip_id);

create table public.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_time_idx on public.invite_attempts (user_id, attempted_at desc);

create table public.media (
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  kind text not null check (kind in ('photo', 'video')),
  mime_type text not null check (mime_type in ('image/jpeg', 'video/quicktime', 'video/mp4')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  duration_ms integer check (duration_ms between 0 and 31000),
  width integer check (width between 0 and 20000),
  height integer check (height between 0 and 20000),
  captured_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  constraint media_kind_mime check (
    (kind = 'photo' and mime_type = 'image/jpeg' and duration_ms is null)
    or (kind = 'video' and mime_type in ('video/quicktime', 'video/mp4') and duration_ms is not null)
  )
);
create index media_trip_ready_idx on public.media (trip_id, created_at) where status = 'ready';
create index media_uploader_idx on public.media (uploader_id);
create index media_pending_idx on public.media (created_at) where status = 'pending';

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  trip_id uuid references public.trips (id) on delete set null,
  media_id uuid references public.media (id) on delete set null,
  reported_user_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('inappropriate', 'harassment', 'spam', 'privacy', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at);
create index reports_reporter_media_idx on public.reports (reporter_id, media_id);

create table public.storage_deletions (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_name text not null,
  enqueued_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can consult RLS-protected tables)
-- ---------------------------------------------------------------------------

create function public.try_uuid(value text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return value::uuid;
exception when others then
  return null;
end $$;

create function public.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip and user_id = (select auth.uid())
  );
$$;

create function public.is_trip_owner(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create function public.shares_trip_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

-- The single source of truth for "may the caller see this memory right now".
create function public.can_view_media(p_media uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.media m
    join public.trips t on t.id = m.trip_id
    join public.trip_members tm on tm.trip_id = m.trip_id and tm.user_id = (select auth.uid())
    where m.id = p_media
      and m.status = 'ready'
      and t.unlocks_at <= now()
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = (select auth.uid()) and b.blocked_id = m.uploader_id
      )
      and not exists (
        select 1 from public.reports r
        where r.reporter_id = (select auth.uid()) and r.media_id = m.id
      )
  );
$$;

create function public.can_read_media_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_view_media(m.id)
  from public.media m
  where m.storage_path = p_name;
$$;

create function public.can_insert_media_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.media m
    join public.trips t on t.id = m.trip_id
    join public.trip_members tm on tm.trip_id = m.trip_id and tm.user_id = m.uploader_id
    where m.storage_path = p_name
      and m.uploader_id = (select auth.uid())
      and m.status = 'pending'
      and now() < t.unlocks_at
  );
$$;

create function public.can_insert_cover_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/cover-[0-9a-f-]{36}\.jpg$'
    and public.is_trip_owner(public.try_uuid(split_part(p_name, '/', 1)));
$$;

create function public.trip_status(p_starts timestamptz, p_unlocks timestamptz) returns text
language sql stable set search_path = '' as $$
  select case
    when now() >= p_unlocks then 'revealed'
    when now() >= p_starts then 'active'
    else 'upcoming'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), 60)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.enqueue_media_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_deletions (bucket_id, object_name)
  values ('trip-media', old.storage_path);
  return old;
end $$;

create trigger media_enqueue_deletion
  after delete on public.media
  for each row execute function public.enqueue_media_deletion();

create function public.enqueue_cover_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.cover_path is not null
     and (tg_op = 'DELETE' or new.cover_path is distinct from old.cover_path) then
    insert into public.storage_deletions (bucket_id, object_name)
    values ('trip-covers', old.cover_path);
  end if;
  return coalesce(new, old);
end $$;

create trigger trips_enqueue_cover_deletion
  after update of cover_path or delete on public.trips
  for each row execute function public.enqueue_cover_deletion();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_bans enable row level security;
alter table public.trip_invites enable row level security;
alter table public.invite_attempts enable row level security;
alter table public.media enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;
alter table public.storage_deletions enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles, public.trips, public.trip_members, public.media to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

create policy "profiles: self and trip-mates"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_trip_with(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "trips: members"
  on public.trips for select to authenticated
  using (public.is_trip_member(id));

create policy "trip_members: co-members"
  on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "media: members after reveal"
  on public.media for select to authenticated
  using (public.can_view_media(id));

create policy "user_blocks: own"
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "user_blocks: insert own"
  on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "user_blocks: delete own"
  on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- trip_bans, trip_invites, invite_attempts, reports and storage_deletions have
-- no client policies: they are reachable only through the functions below.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('trip-media', 'trip-media', false, 52428800, array['image/jpeg', 'video/quicktime', 'video/mp4']),
  ('trip-covers', 'trip-covers', false, 10485760, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No UPDATE or DELETE policies: clients can neither overwrite (upsert) nor
-- delete objects. Deletion happens server-side via `purge-media`.
create policy "trip-media: insert reserved path"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-media' and public.can_insert_media_object(name));

create policy "trip-media: read after reveal"
  on storage.objects for select to authenticated
  using (bucket_id = 'trip-media' and public.can_read_media_object(name));

create policy "trip-covers: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-covers' and public.can_insert_cover_object(name));

create policy "trip-covers: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-covers'
    and public.is_trip_member(public.try_uuid(split_part(name, '/', 1)))
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.server_now() returns timestamptz
language sql stable set search_path = '' as $$ select now(); $$;

create function public.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v_uid;
end $$;

create function public.create_trip(p_name text, p_starts_at timestamptz, p_unlocks_at timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_trip uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_starts_at is null or p_unlocks_at is null
     or p_unlocks_at <= now()
     or p_unlocks_at <= p_starts_at
     or p_starts_at < now() - interval '30 days'
     or p_starts_at > now() + interval '2 years'
     or p_unlocks_at > p_starts_at + interval '62 days' then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;
  if (select count(*) from public.trips where owner_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.trips (name, owner_id, starts_at, unlocks_at)
  values (btrim(p_name), v_uid, p_starts_at, p_unlocks_at)
  returning id into v_trip;

  insert into public.trip_members (trip_id, user_id, role) values (v_trip, v_uid, 'owner');
  return v_trip;
end $$;

create function public.set_trip_cover(p_trip uuid, p_path text, p_tone text default 'dark') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_uid();
  if not public.is_trip_owner(p_trip) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if split_part(p_path, '/', 1) <> p_trip::text
     or not exists (select 1 from storage.objects where bucket_id = 'trip-covers' and name = p_path) then
    raise exception 'invalid_cover' using errcode = '22023';
  end if;
  update public.trips
  set cover_path = p_path,
      cover_tone = case when p_tone = 'light' then 'light' else 'dark' end
  where id = p_trip;
end $$;

create function public.list_my_trips()
returns table (
  id uuid, name text, cover_path text, cover_tone text, starts_at timestamptz, unlocks_at timestamptz,
  status text, role text, member_count integer, memory_count integer, my_memory_count integer,
  server_now timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    t.id, t.name, t.cover_path, t.cover_tone, t.starts_at, t.unlocks_at,
    public.trip_status(t.starts_at, t.unlocks_at),
    me.role,
    (select count(*)::int from public.trip_members x where x.trip_id = t.id),
    (select count(*)::int from public.media m where m.trip_id = t.id and m.status = 'ready'),
    (select count(*)::int from public.media m where m.trip_id = t.id and m.status = 'ready' and m.uploader_id = me.user_id),
    now()
  from public.trip_members me
  join public.trips t on t.id = me.trip_id
  where me.user_id = (select auth.uid())
  order by t.unlocks_at desc;
$$;

create function public.get_trip(p_trip uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_result jsonb;
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'cover_path', t.cover_path,
    'cover_tone', t.cover_tone,
    'starts_at', t.starts_at,
    'unlocks_at', t.unlocks_at,
    'status', public.trip_status(t.starts_at, t.unlocks_at),
    'is_owner', t.owner_id = v_uid,
    'memory_count', (select count(*) from public.media m where m.trip_id = t.id and m.status = 'ready'),
    'my_memory_count', (select count(*) from public.media m where m.trip_id = t.id and m.status = 'ready' and m.uploader_id = v_uid),
    'server_now', now(),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', tm.user_id,
        'display_name', coalesce(nullif(p.display_name, ''), 'Traveler'),
        'role', tm.role,
        'is_me', tm.user_id = v_uid,
        'blocked', exists (select 1 from public.user_blocks b where b.blocker_id = v_uid and b.blocked_id = tm.user_id)
      ) order by tm.joined_at)
      from public.trip_members tm
      left join public.profiles p on p.id = tm.user_id
      where tm.trip_id = t.id
    ), '[]'::jsonb)
  ) into v_result
  from public.trips t where t.id = p_trip;
  return v_result;
end $$;

create function public.create_invite(p_trip uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_token text;
  v_unlocks timestamptz;
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select unlocks_at into v_unlocks from public.trips where id = p_trip;
  if v_unlocks <= now() then
    raise exception 'trip_revealed' using errcode = '22023';
  end if;

  -- Keep at most 20 live links per trip; the oldest are revoked first.
  update public.trip_invites set revoked_at = now()
  where id in (
    select id from public.trip_invites
    where trip_id = p_trip and revoked_at is null and expires_at > now()
    order by created_at desc offset 19
  );

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.trip_invites (trip_id, token_hash, created_by, expires_at)
  values (p_trip, extensions.digest(v_token, 'sha256'), v_uid, v_unlocks);
  return v_token;
end $$;

create function public.revoke_trip_invites(p_trip uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_uid();
  if not public.is_trip_owner(p_trip) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.trip_invites set revoked_at = now() where trip_id = p_trip and revoked_at is null;
end $$;

-- Shared by preview_invite / accept_invite. Returns the trip id for a valid,
-- live token and records the attempt for rate limiting.
create function public.resolve_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_trip uuid;
begin
  if (select count(*) from public.invite_attempts
      where user_id = v_uid and not succeeded and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  if p_token ~ '^[A-Za-z0-9_-]{32}$' then
    select i.trip_id into v_trip
    from public.trip_invites i
    join public.trips t on t.id = i.trip_id
    where i.token_hash = extensions.digest(p_token, 'sha256')
      and i.revoked_at is null
      and i.expires_at > now()
      and t.unlocks_at > now();
  end if;

  insert into public.invite_attempts (user_id, succeeded) values (v_uid, v_trip is not null);
  return v_trip;
end $$;

-- Returns null for unknown/expired links (no detail that helps guessing).
create function public.preview_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_trip uuid := public.resolve_invite(p_token);
begin
  if v_trip is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'trip_id', t.id,
      'name', t.name,
      'starts_at', t.starts_at,
      'unlocks_at', t.unlocks_at,
      'member_count', (select count(*) from public.trip_members x where x.trip_id = t.id),
      'owner_name', coalesce(nullif(p.display_name, ''), 'A friend'),
      'already_member', exists (select 1 from public.trip_members x where x.trip_id = t.id and x.user_id = v_uid),
      'banned', exists (select 1 from public.trip_bans b where b.trip_id = t.id and b.user_id = v_uid)
    )
    from public.trips t
    left join public.profiles p on p.id = t.owner_id
    where t.id = v_trip
  );
end $$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_trip uuid := public.resolve_invite(p_token);
begin
  -- Return (not raise) so the failed attempt recorded above is committed.
  if v_trip is null then
    return null;
  end if;
  if exists (select 1 from public.trip_bans where trip_id = v_trip and user_id = v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.trip_members where trip_id = v_trip and user_id = v_uid) then
    return v_trip;
  end if;
  if (select count(*) from public.trip_members where trip_id = v_trip) >= 50 then
    raise exception 'trip_full' using errcode = '54000';
  end if;
  insert into public.trip_members (trip_id, user_id, role) values (v_trip, v_uid, 'member');
  return v_trip;
end $$;

-- Reserve a storage path for an upload. Idempotent per client-generated id so
-- the device can retry safely after a crash or network loss.
create function public.reserve_media_upload(
  p_id uuid, p_trip uuid, p_kind text, p_mime text, p_bytes bigint,
  p_duration_ms integer, p_width integer, p_height integer, p_captured_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_existing public.media;
  v_unlocks timestamptz;
  v_ext text;
  v_path text;
begin
  select * into v_existing from public.media where id = p_id;
  if found then
    if v_existing.uploader_id <> v_uid or v_existing.trip_id <> p_trip then
      raise exception 'conflict' using errcode = '23505';
    end if;
    return v_existing.storage_path;
  end if;

  if not public.is_trip_member(p_trip) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select unlocks_at into v_unlocks from public.trips where id = p_trip;
  if now() >= v_unlocks then
    raise exception 'upload_window_closed' using errcode = '22023';
  end if;
  if (select count(*) from public.media where trip_id = p_trip and uploader_id = v_uid) >= 1000 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  v_ext := case p_mime
    when 'image/jpeg' then 'jpg'
    when 'video/quicktime' then 'mov'
    when 'video/mp4' then 'mp4'
  end;
  if v_ext is null then
    raise exception 'invalid_media_type' using errcode = '22023';
  end if;

  v_path := p_trip::text || '/' || v_uid::text || '/' || p_id::text || '.' || v_ext;
  -- Table constraints validate kind/mime/size/duration/dimensions.
  insert into public.media (
    id, trip_id, uploader_id, storage_path, kind, mime_type, byte_size,
    duration_ms, width, height, captured_at
  ) values (
    p_id, p_trip, v_uid, v_path, p_kind, p_mime, p_bytes,
    p_duration_ms, nullif(p_width, 0), nullif(p_height, 0),
    case when p_captured_at between now() - interval '5 years' and now() + interval '1 day' then p_captured_at end
  );
  return v_path;
end $$;

-- Mark an upload complete after verifying the stored object.
-- Returns 'ready', or 'rejected' if the stored object failed validation (the
-- reservation is then deleted, which queues the object for purging).
create function public.complete_media_upload(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_media public.media;
  v_object storage.objects;
  v_unlocks timestamptz;
  v_size bigint;
begin
  select * into v_media from public.media where id = p_id and uploader_id = v_uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_media.status = 'ready' then
    return 'ready';
  end if;

  select * into v_object from storage.objects where bucket_id = 'trip-media' and name = v_media.storage_path;
  if not found then
    raise exception 'object_missing' using errcode = 'P0002';
  end if;

  select unlocks_at into v_unlocks from public.trips where id = v_media.trip_id;
  v_size := (v_object.metadata ->> 'size')::bigint;
  if v_object.created_at >= v_unlocks
     or (v_object.metadata ->> 'mimetype') is distinct from v_media.mime_type
     or v_size is null or v_size <= 0 or v_size > 52428800 then
    delete from public.media where id = p_id;
    return 'rejected';
  end if;

  update public.media set status = 'ready', byte_size = v_size, uploaded_at = now() where id = p_id;
  return 'ready';
end $$;

-- After reveal: list memories with uploader names. RLS on media still applies
-- through can_view_media, so this returns nothing before the reveal.
create function public.list_trip_media(p_trip uuid)
returns table (
  id uuid, storage_path text, kind text, duration_ms integer, width integer, height integer,
  captured_at timestamptz, created_at timestamptz, uploader_id uuid, uploader_name text, is_mine boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.storage_path, m.kind, m.duration_ms, m.width, m.height,
         m.captured_at, m.created_at, m.uploader_id,
         coalesce(nullif(p.display_name, ''), 'Traveler'),
         m.uploader_id = (select auth.uid())
  from public.media m
  left join public.profiles p on p.id = m.uploader_id
  where m.trip_id = p_trip and public.can_view_media(m.id)
  order by coalesce(m.captured_at, m.created_at), m.id;
$$;

create function public.delete_media(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
begin
  delete from public.media m
  where m.id = p_id
    and (m.uploader_id = v_uid or public.is_trip_owner(m.trip_id));
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

create function public.transfer_or_delete_trip(p_trip uuid, p_leaving uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_next uuid;
begin
  select user_id into v_next from public.trip_members
  where trip_id = p_trip and user_id <> p_leaving
  order by joined_at limit 1;
  if v_next is null then
    delete from public.trips where id = p_trip;
  else
    update public.trip_members set role = 'owner' where trip_id = p_trip and user_id = v_next;
    update public.trips set owner_id = v_next where id = p_trip;
  end if;
end $$;

-- Leaving removes your membership and permanently deletes your own uploads in
-- that trip. If you own the trip, ownership passes to the longest-standing
-- member; a trip with no remaining members is deleted.
create function public.leave_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  delete from public.media where trip_id = p_trip and uploader_id = v_uid;
  if public.is_trip_owner(p_trip) then
    perform public.transfer_or_delete_trip(p_trip, v_uid);
  end if;
  delete from public.trip_members where trip_id = p_trip and user_id = v_uid;
end $$;

-- Owner removes a member: their uploads in this trip are deleted, links they
-- created are revoked, and they cannot rejoin.
create function public.remove_member(p_trip uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
begin
  if not public.is_trip_owner(p_trip) or p_user = v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.trip_members where trip_id = p_trip and user_id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  delete from public.media where trip_id = p_trip and uploader_id = p_user;
  update public.trip_invites set revoked_at = now()
  where trip_id = p_trip and created_by = p_user and revoked_at is null;
  insert into public.trip_bans (trip_id, user_id) values (p_trip, p_user) on conflict do nothing;
end $$;

create function public.delete_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_uid();
  if not public.is_trip_owner(p_trip) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.trips where id = p_trip;
end $$;

create function public.report_content(
  p_trip uuid, p_media uuid, p_user uuid, p_reason text, p_details text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_media is null and p_user is null then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  if p_media is not null and not exists (select 1 from public.media where id = p_media and trip_id = p_trip) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_user is not null and not exists (select 1 from public.trip_members where trip_id = p_trip and user_id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 50 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.reports (reporter_id, trip_id, media_id, reported_user_id, reason, details)
  values (
    v_uid, p_trip, p_media,
    coalesce(p_user, (select uploader_id from public.media where id = p_media)),
    p_reason, nullif(left(btrim(coalesce(p_details, '')), 1000), '')
  );
end $$;

-- Service-role only: called by the delete-account edge function before the
-- auth user is deleted (which cascades memberships, uploads and profile).
create function public.prepare_account_deletion(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
begin
  for v_trip in select trip_id from public.trip_members where user_id = p_user and role = 'owner' loop
    perform public.transfer_or_delete_trip(v_trip, p_user);
  end loop;
  delete from public.media where uploader_id = p_user;
end $$;

-- Service-role only: drop reservations that never finished uploading.
create function public.expire_stale_uploads() returns integer
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.media where status = 'pending' and created_at < now() - interval '2 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.server_now(),
  public.create_trip(text, timestamptz, timestamptz),
  public.set_trip_cover(uuid, text, text),
  public.list_my_trips(),
  public.get_trip(uuid),
  public.create_invite(uuid),
  public.revoke_trip_invites(uuid),
  public.preview_invite(text),
  public.accept_invite(text),
  public.reserve_media_upload(uuid, uuid, text, text, bigint, integer, integer, integer, timestamptz),
  public.complete_media_upload(uuid),
  public.list_trip_media(uuid),
  public.delete_media(uuid),
  public.leave_trip(uuid),
  public.remove_member(uuid, uuid),
  public.delete_trip(uuid),
  public.report_content(uuid, uuid, uuid, text, text)
to authenticated;

-- Used inside RLS / storage policies evaluated as the authenticated role.
grant execute on function
  public.try_uuid(text),
  public.is_trip_member(uuid),
  public.is_trip_owner(uuid),
  public.shares_trip_with(uuid),
  public.can_view_media(uuid),
  public.can_read_media_object(text),
  public.can_insert_media_object(text),
  public.can_insert_cover_object(text),
  public.trip_status(timestamptz, timestamptz),
  public.require_uid()
to authenticated;

grant execute on function
  public.prepare_account_deletion(uuid),
  public.expire_stale_uploads()
to service_role;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
