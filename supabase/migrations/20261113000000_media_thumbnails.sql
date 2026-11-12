-- Small previews (~480 px JPEG; the first frame for videos) so the gallery
-- grid never downloads full-size files. Each memory's preview lives next to
-- it at "<trip>/<uploader>/<media id>.thumb.jpg" in the private trip-media
-- bucket and follows exactly the same read rule (members, after the reveal).

alter table public.media add column thumb_path text;

create function public.media_thumb_name(p_media public.media) returns text
language sql immutable set search_path = '' as $$
  select p_media.trip_id::text || '/' || p_media.uploader_id::text || '/' || p_media.id::text || '.thumb.jpg';
$$;

-- Only the uploader can add their memory's preview (insert-only: no overwrite
-- or delete policies exist), once, and only while none is recorded.
create function public.can_insert_media_thumb(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.media m
    where public.media_thumb_name(m) = p_name
      and m.uploader_id = (select auth.uid())
      and m.thumb_path is null
  );
$$;

create policy "trip-media: uploader inserts preview"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-media' and public.can_insert_media_thumb(name));

-- Previews are readable exactly when their memory is.
create or replace function public.can_read_media_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select public.can_view_media(m.id) from public.media m where m.storage_path = p_name or m.thumb_path = p_name limit 1),
    false
  );
$$;

-- Record a preview after uploading it: must exist, be a JPEG and small.
create function public.set_media_thumb(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_media public.media;
  v_name text;
  v_object storage.objects;
  v_size bigint;
begin
  select * into v_media from public.media where id = p_id and uploader_id = v_uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_media.thumb_path is not null then
    return;
  end if;
  v_name := public.media_thumb_name(v_media);
  select * into v_object from storage.objects where bucket_id = 'trip-media' and name = v_name;
  if not found then
    raise exception 'object_missing' using errcode = 'P0002';
  end if;
  v_size := (v_object.metadata ->> 'size')::bigint;
  if (v_object.metadata ->> 'mimetype') is distinct from 'image/jpeg' or v_size is null or v_size <= 0 or v_size > 1048576 then
    insert into public.storage_deletions (bucket_id, object_name) values ('trip-media', v_name);
    raise exception 'invalid_thumbnail' using errcode = '22023';
  end if;
  update public.media set thumb_path = v_name where id = p_id;
end $$;

-- Deleting a memory also purges its preview.
create or replace function public.enqueue_media_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_deletions (bucket_id, object_name)
  values ('trip-media', old.storage_path);
  if old.thumb_path is not null then
    insert into public.storage_deletions (bucket_id, object_name) values ('trip-media', old.thumb_path);
  end if;
  return old;
end $$;

-- Same list as before plus the preview path.
drop function public.list_trip_media(uuid);

create function public.list_trip_media(p_trip uuid)
returns table (
  id uuid, storage_path text, kind text, duration_ms integer, width integer, height integer,
  captured_at timestamptz, created_at timestamptz, uploader_id uuid, uploader_name text, is_mine boolean,
  liked boolean, thumb_path text
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.storage_path, m.kind, m.duration_ms, m.width, m.height,
         m.captured_at, m.created_at, m.uploader_id,
         coalesce(nullif(p.display_name, ''), 'Traveler'),
         m.uploader_id = (select auth.uid()),
         exists (select 1 from public.media_likes l where l.media_id = m.id and l.user_id = (select auth.uid())),
         m.thumb_path
  from public.media m
  left join public.profiles p on p.id = m.uploader_id
  where m.trip_id = p_trip and public.can_view_media(m.id)
  order by coalesce(m.captured_at, m.created_at), m.id;
$$;

-- thumb_path is only set through set_media_thumb.
revoke update (thumb_path) on public.media from authenticated;

revoke execute on function public.media_thumb_name(public.media), public.can_insert_media_thumb(text) from public, anon;
grant execute on function public.can_insert_media_thumb(text) to authenticated;
revoke execute on function public.set_media_thumb(uuid), public.list_trip_media(uuid) from public, anon;
grant execute on function public.set_media_thumb(uuid), public.list_trip_media(uuid) to authenticated;
