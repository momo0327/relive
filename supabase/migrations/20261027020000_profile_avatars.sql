-- Profile photos and avatar colours.
--
-- Photos live in the private `avatars` bucket at {user_id}/avatar-{uuid}.jpg.
-- Only the owner and people who share a trip with them can read one. Replacing
-- or removing a photo (or deleting the account) queues the old file for
-- purge-media. The colour is used whenever there's no photo.

alter table public.profiles
  add column avatar_path text,
  add column avatar_color text check (avatar_color ~ '^#[0-9A-Fa-f]{6}$');

grant update (avatar_color) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.can_insert_avatar_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and p_name ~ ('^' || (select auth.uid())::text || '/avatar-[0-9a-f-]{36}\.jpg$');
$$;

create function public.can_read_avatar_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 1) = (select auth.uid())::text
    or public.shares_trip_with(public.try_uuid(split_part(p_name, '/', 1)));
$$;

create policy "avatars: own insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.can_insert_avatar_object(name));

create policy "avatars: self and trip-mates read"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_read_avatar_object(name));

-- Point the profile at an uploaded photo (or clear it with null).
create function public.set_avatar(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
begin
  if p_path is not null and (
    p_path !~ ('^' || v_uid::text || '/avatar-[0-9a-f-]{36}\.jpg$')
    or not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path)
  ) then
    raise exception 'invalid_avatar' using errcode = '22023';
  end if;
  update public.profiles set avatar_path = p_path where id = v_uid;
end $$;

create function public.enqueue_avatar_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.avatar_path is not null
     and (tg_op = 'DELETE' or new.avatar_path is distinct from old.avatar_path) then
    insert into public.storage_deletions (bucket_id, object_name) values ('avatars', old.avatar_path);
  end if;
  return coalesce(new, old);
end $$;

create trigger profiles_enqueue_avatar_deletion
  after update of avatar_path or delete on public.profiles
  for each row execute function public.enqueue_avatar_deletion();

-- Members now include their avatar.
create or replace function public.get_trip(p_trip uuid) returns jsonb
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
        'avatar_path', p.avatar_path,
        'avatar_color', p.avatar_color,
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

revoke execute on function
  public.can_insert_avatar_object(text),
  public.can_read_avatar_object(text),
  public.set_avatar(text),
  public.enqueue_avatar_deletion()
from public, anon;

grant execute on function
  public.can_insert_avatar_object(text),
  public.can_read_avatar_object(text),
  public.set_avatar(text)
to authenticated;
