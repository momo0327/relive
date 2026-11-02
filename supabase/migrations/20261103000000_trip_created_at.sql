-- The home cards show when each trip was created ("NOVEMBER", "NOVEMBER 2025"),
-- so list_my_trips also returns created_at. The return type changes, so the
-- function is dropped and recreated with the same body and grant.

drop function public.list_my_trips();

create function public.list_my_trips()
returns table (
  id uuid, name text, cover_path text, cover_tone text, starts_at timestamptz, unlocks_at timestamptz,
  status text, role text, member_count integer, memory_count integer, my_memory_count integer,
  server_now timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    t.id, t.name, t.cover_path, t.cover_tone, t.starts_at, t.unlocks_at,
    public.trip_status(t.starts_at, t.unlocks_at),
    me.role,
    (select count(*)::int from public.trip_members x where x.trip_id = t.id),
    (select count(*)::int from public.media m where m.trip_id = t.id and m.status = 'ready'),
    (select count(*)::int from public.media m where m.trip_id = t.id and m.status = 'ready' and m.uploader_id = me.user_id),
    now(),
    t.created_at
  from public.trip_members me
  join public.trips t on t.id = me.trip_id
  where me.user_id = (select auth.uid())
  order by t.unlocks_at desc;
$$;

revoke execute on function public.list_my_trips() from public, anon;
grant execute on function public.list_my_trips() to authenticated;
