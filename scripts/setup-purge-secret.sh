#!/usr/bin/env bash
# One-time setup for the scheduled purge job (see the migration
# supabase/migrations/20261027000000_purge_schedule.sql).
#
# Generates a fresh shared secret and stores it as
#   1. the PURGE_SECRET Edge Function secret, and
#   2. the `purge_secret` Vault secret the cron job reads,
# plus the function URL as the `purge_url` Vault secret. Never prints the secret.
#
# Usage (project must be linked with `npx supabase link`):
#   bash scripts/setup-purge-secret.sh
set -euo pipefail

ref="$(cat supabase/.temp/project-ref)"
url="https://${ref}.supabase.co/functions/v1/purge-media"
secret="$(openssl rand -hex 32)"

npx supabase secrets set PURGE_SECRET="${secret}" >/dev/null
echo "✓ Edge Function secret PURGE_SECRET set"

npx supabase db query --linked "
do \$\$
begin
  if exists (select 1 from vault.secrets where name = 'purge_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'purge_url'), '${url}');
  else
    perform vault.create_secret('${url}', 'purge_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'purge_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'purge_secret'), '${secret}');
  else
    perform vault.create_secret('${secret}', 'purge_secret');
  end if;
end \$\$;" >/dev/null
echo "✓ Vault secrets purge_url and purge_secret stored"
