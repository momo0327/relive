-- offline-test: skip (needs pg_cron, pg_net and Vault, which the PGlite harness doesn't have)
--
-- Runs the purge-media Edge Function every 30 minutes. It deletes files queued
-- in public.storage_deletions (removed memories, trips, members, accounts) and
-- drops upload reservations that never completed.
--
-- The function URL and shared secret live in Vault, not here. Create them once:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/purge-media', 'purge_url');
--   select vault.create_secret('<same value as the PURGE_SECRET function secret>', 'purge_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('l8r-purge-media')
where exists (select 1 from cron.job where jobname = 'l8r-purge-media');

select cron.schedule(
  'l8r-purge-media',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'purge_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
