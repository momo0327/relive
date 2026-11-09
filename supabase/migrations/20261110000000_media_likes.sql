-- Favourites: each member can like memories they're allowed to see (after the
-- reveal). Likes are private to the person who made them.

create table public.media_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

alter table public.media_likes enable row level security;

create policy "likes: own rows only" on public.media_likes
  for select to authenticated using (user_id = (select auth.uid()));

-- Like / unlike. Only memories the caller can currently view.
create function public.set_media_like(p_media uuid, p_liked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
begin
  if not public.can_view_media(p_media) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_liked then
    insert into public.media_likes (user_id, media_id) values (v_uid, p_media) on conflict do nothing;
  else
    delete from public.media_likes where user_id = v_uid and media_id = p_media;
  end if;
end $$;

-- Same list as before plus whether the caller liked each memory.
drop function public.list_trip_media(uuid);

create function public.list_trip_media(p_trip uuid)
returns table (
  id uuid, storage_path text, kind text, duration_ms integer, width integer, height integer,
  captured_at timestamptz, created_at timestamptz, uploader_id uuid, uploader_name text, is_mine boolean,
  liked boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.storage_path, m.kind, m.duration_ms, m.width, m.height,
         m.captured_at, m.created_at, m.uploader_id,
         coalesce(nullif(p.display_name, ''), 'Traveler'),
         m.uploader_id = (select auth.uid()),
         exists (select 1 from public.media_likes l where l.media_id = m.id and l.user_id = (select auth.uid()))
  from public.media m
  left join public.profiles p on p.id = m.uploader_id
  where m.trip_id = p_trip and public.can_view_media(m.id)
  order by coalesce(m.captured_at, m.created_at), m.id;
$$;

revoke all on public.media_likes from anon;
grant select on public.media_likes to authenticated;
revoke execute on function public.set_media_like(uuid, boolean), public.list_trip_media(uuid) from public, anon;
grant execute on function public.set_media_like(uuid, boolean), public.list_trip_media(uuid) to authenticated;
