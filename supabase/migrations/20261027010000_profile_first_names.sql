-- Profiles show the person's first name, taken from whatever identity
-- provider shared it. Previously the name was only read when the auth user was
-- created, so linking Google to an existing (nameless) Apple account never
-- filled it in. Names the user has set themselves are never overwritten.

create function public.first_name_from_metadata(meta jsonb) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(coalesce(
    nullif(btrim(meta ->> 'given_name'), ''),
    split_part(btrim(coalesce(nullif(btrim(meta ->> 'full_name'), ''), meta ->> 'name', '')), ' ', 1)
  )), 60);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(public.first_name_from_metadata(new.raw_user_meta_data), ''))
  on conflict (id) do nothing;
  return new;
end $$;

-- Fill an empty profile name when a later sign-in (e.g. a linked identity)
-- brings one.
create function public.handle_user_metadata_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := public.first_name_from_metadata(new.raw_user_meta_data);
begin
  if coalesce(v_name, '') <> '' then
    update public.profiles set display_name = v_name where id = new.id and display_name = '';
  end if;
  return new;
end $$;

create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_metadata_update();

-- Backfill existing nameless profiles.
update public.profiles p
set display_name = public.first_name_from_metadata(u.raw_user_meta_data)
from auth.users u
where u.id = p.id
  and p.display_name = ''
  and coalesce(public.first_name_from_metadata(u.raw_user_meta_data), '') <> '';

revoke execute on function public.first_name_from_metadata(jsonb) from public, anon, authenticated;
revoke execute on function public.handle_user_metadata_update() from public, anon, authenticated;
