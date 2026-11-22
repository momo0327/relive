-- The join page shows the same trip card as the home page (cover, name,
-- month). Someone holding a valid invite may see that trip's COVER (the poster
-- the organizer chose, never a memory) for an hour after previewing it.
-- Memories stay sealed and member-only exactly as before.

create table public.invite_previews (
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  previewed_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);
-- Only the security-definer functions below read or write it.
alter table public.invite_previews enable row level security;
revoke all on public.invite_previews from anon, authenticated;

create or replace function public.preview_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_uid();
  v_trip uuid := public.resolve_invite(p_token);
  v_banned boolean;
begin
  if v_trip is null then
    return null;
  end if;
  v_banned := exists (select 1 from public.trip_bans b where b.trip_id = v_trip and b.user_id = v_uid);
  if not v_banned then
    insert into public.invite_previews (user_id, trip_id) values (v_uid, v_trip)
    on conflict (user_id, trip_id) do update set previewed_at = now();
  end if;
  return (
    select jsonb_build_object(
      'trip_id', t.id,
      'name', t.name,
      'starts_at', t.starts_at,
      'unlocks_at', t.unlocks_at,
      'created_at', t.created_at,
      'cover_path', case when v_banned then null else t.cover_path end,
      'cover_tone', t.cover_tone,
      'member_count', (select count(*) from public.trip_members x where x.trip_id = t.id),
      'owner_name', coalesce(nullif(p.display_name, ''), 'A friend'),
      'already_member', exists (select 1 from public.trip_members x where x.trip_id = t.id and x.user_id = v_uid),
      'banned', v_banned
    )
    from public.trips t
    left join public.profiles p on p.id = t.owner_id
    where t.id = v_trip
  );
end $$;

-- True while the user has recently previewed a valid invite to this cover's trip.
create function public.can_read_cover_via_invite(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.invite_previews ip
    join public.trips t on t.id = ip.trip_id
    where ip.user_id = auth.uid()
      and ip.trip_id = public.try_uuid(split_part(p_name, '/', 1))
      and ip.previewed_at > now() - interval '1 hour'
      and t.cover_path = p_name
  );
$$;
revoke all on function public.can_read_cover_via_invite(text) from public, anon;
grant execute on function public.can_read_cover_via_invite(text) to authenticated;

create policy "trip-covers: invitee read"
  on storage.objects for select to authenticated
  using (bucket_id = 'trip-covers' and public.can_read_cover_via_invite(name));
