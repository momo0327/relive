# Setup

## 1. Run locally without a backend (preview mode)

```bash
npm install
npx expo run:ios            # builds a development client into the iOS Simulator and starts Metro
```

With no Supabase variables set, the welcome screen offers **Explore with sample trips**. Preview mode keeps everything in memory, shows a persistent "Preview mode" banner, and never contacts a server.

Expo Go can open most of the app (`npx expo start`), but use a development build for Sign in with Apple, the camera and anything else that depends on config plugins.

## 2. Supabase project

1. Create a project at supabase.com. Note the **Project URL**, the **publishable key**, and (for server use only) the **secret key**.
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations/*.sql
   ```
   Or paste `supabase/migrations/20261026000000_l8r_core.sql` into the SQL editor.
3. Check that the buckets `trip-media` and `trip-covers` exist and are **private** (Storage → Buckets).
4. Auth → URL Configuration → add redirect URL `l8r://auth-callback`. For Expo Go, also add `exp://**`.

### Sign in with Apple (required, Guideline 4.8)

1. In the Apple Developer portal, enable **Sign in with Apple** for the App ID (the bundle identifier in `IOS_BUNDLE_ID`).
2. Supabase → Auth → Providers → Apple: enable it and add the bundle identifier to **Client IDs**. The native flow uses the ID token, so no secret is needed for sign-in.
3. Optional, recommended for account deletion: create a **Sign in with Apple key** (.p8) and set these function secrets so `delete-account` can revoke the user's Apple token:
   ```bash
   npx supabase secrets set APPLE_TEAM_ID=XXXXXXXXXX APPLE_KEY_ID=XXXXXXXXXX \
     APPLE_CLIENT_ID=<bundle id> APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
   ```

### Google sign-in

The app uses Supabase's OAuth flow (PKCE) in an in-app browser session, so it needs no native Google SDK.

1. Google Cloud Console → Credentials → **OAuth client ID (Web application)**. Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
2. Supabase → Auth → Providers → Google: paste the client ID and secret.
3. To ship without Google, set `EXPO_PUBLIC_GOOGLE_SIGN_IN=off`.

## 3. Edge Functions

```bash
npx supabase functions deploy delete-account
npx supabase functions deploy purge-media --no-verify-jwt
bash scripts/setup-purge-secret.sh   # shared secret → function secret + Vault (never printed)
npx supabase db push                 # includes the 30-minute cleanup schedule (pg_cron + pg_net)
```

`SUPABASE_URL` and the secret key are injected into functions automatically. `purge-media` is protected by `PURGE_SECRET` instead of a user JWT. The schedule migration (`20261027000000_purge_schedule.sql`) reads the function URL and the secret from Vault, so neither appears in code. Re-run the script any time to rotate the secret.

Check the job: `select jobname, schedule, active from cron.job;`. Recent runs are in `net._http_response`.

## 4. App configuration

```bash
cp .env.example .env.local
# fill EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
# EXPO_PUBLIC_PRIVACY_URL, EXPO_PUBLIC_TERMS_URL, EXPO_PUBLIC_SUPPORT_EMAIL, IOS_BUNDLE_ID
npx expo run:ios
```

For EAS builds, put the same values in EAS environment variables (`npx eas-cli@latest env:create`) for the `development`, `preview` and `production` environments. **Never** put the secret key in any `EXPO_PUBLIC_` variable.

## 5. Invite links (universal links, recommended)

Without a domain, invites use `l8r://join/<token>`. That opens the app, but some messaging apps don't make custom schemes tappable. For production:

1. Set `EXPO_PUBLIC_INVITE_BASE_URL=https://<your-domain>`. `app.config.ts` then adds `applinks:<your-domain>`.
2. Host `https://<your-domain>/.well-known/apple-app-site-association`:
   ```json
   { "applinks": { "details": [{ "appIDs": ["<TEAMID>.<bundle id>"], "components": [{ "/": "/join/*" }] }] } }
   ```
3. Serve a simple web page at `/join/*` that tells people without the app to install it.

## 6. EAS builds

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                   # creates the EAS project; put its id in EAS_PROJECT_ID
npx eas-cli@latest build --profile development-simulator --platform ios
npx eas-cli@latest build --profile development --platform ios   # real device (register it with `eas device:create`)
npx eas-cli@latest build --profile preview --platform ios       # internal TestFlight-style testing
npx eas-cli@latest build --profile production --platform ios    # App Store build
```

Submission (`eas submit`) is a separate, deliberate step. See `docs/APP_STORE.md`.

## 7. Checks

```bash
npm run typecheck
npx eslint src app.config.ts
npm run test:policies
```
