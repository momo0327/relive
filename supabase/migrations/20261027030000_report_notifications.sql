-- offline-test: skip (needs pg_net and Vault, which the PGlite harness doesn't have)
--
-- Calls the notify-report Edge Function whenever a report is filed. Reuses the
-- purge job's Vault secrets: the URL is derived from `purge_url` and the shared
-- secret is `purge_secret`, so no new secrets are needed.

create function public.notify_new_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_purge_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'purge_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'purge_secret');
begin
  if v_purge_url is not null and v_secret is not null then
    perform net.http_post(
      url := replace(v_purge_url, '/purge-media', '/notify-report'),
      headers := jsonb_build_object('content-type', 'application/json', 'x-purge-secret', v_secret),
      body := jsonb_build_object('report_id', new.id),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end $$;

create trigger reports_notify
  after insert on public.reports
  for each row execute function public.notify_new_report();

revoke execute on function public.notify_new_report() from public, anon, authenticated;
