# L8R — Capture now. Relive later.

A private, invitation-only travel memory app. Friends create a trip, invite each other, and add photos and short videos during the trip. **Nobody, the uploader included, can view or download anything until the trip's server-verified reveal time.** Then everything unlocks together in a shared gallery.

Built with Expo SDK 58 (React Native 0.88, Expo Router), TypeScript, and Supabase (Auth, Postgres + RLS, private Storage, Edge Functions).

## Quick start

```bash
npm install
npx expo run:ios                 # dev build in the iOS Simulator; preview mode works with no backend
```

Connect a real backend with [docs/SETUP.md](docs/SETUP.md).

## Project layout

```
src/app/                 Routes (Expo Router)
  welcome, onboarding    Sign in (Apple / Google / preview), 3-step intro
  index                  My Trips (active / upcoming / revealed)
  trips/new              Create trip (sheet)
  trips/[id]/index       Locked trip home or revealed gallery, decided by server status
  trips/[id]/capture     Camera (photo + ≤30 s video)
  trips/[id]/invite      Invite link: copy + share sheet
  trips/[id]/options     Members, block/report/remove, leave/delete
  trips/[id]/saved       Upload-complete confirmation
  trips/[id]/viewer      Fullscreen viewer: save, share, report, delete
  join/[token]           Invite deep link → sign in → confirm → join
  account                Name, privacy, support, sign out, delete account
src/lib/                 Data access and device logic (no UI)
  backend.ts             Backend interface; live-backend.ts (Supabase) and preview-backend.ts (on-device sample)
  uploads.tsx            Persistent upload queue: progress, retry, offline, background URLSession
  media-prep.ts          Photo re-encode (strips EXIF/GPS), video limits
  session.tsx            Auth, preview mode, onboarding, pending invite, account deletion
src/screens/             Larger non-route views (locked trip, gallery)
src/ui/                  Theme, layout/size classes, accessibility prefs, primitives, Liquid Glass wrapper
supabase/migrations/     Schema, RLS, Storage policies, RPCs
supabase/functions/      delete-account, purge-media (Deno)
supabase/tests/          Offline policy tests (PGlite)
docs/                    SETUP, SECURITY, APP_STORE checklist, privacy policy draft
```

## Checks

```bash
npm run check    # typecheck + lint + policy tests
```
