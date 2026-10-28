-- Organizers can rename a trip after creating it. Dates stay fixed (the reveal
-- time is part of the trip's promise to members); the cover already has
-- set_trip_cover.

create function public.rename_trip(p_trip uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_uid();
  if not public.is_trip_owner(p_trip) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  update public.trips set name = btrim(p_name) where id = p_trip;
end $$;

revoke execute on function public.rename_trip(uuid, text) from public, anon;
grant execute on function public.rename_trip(uuid, text) to authenticated;
