# Relive security model

The delayed reveal is a **server-enforced security property**. The app's countdown and hidden buttons are presentation only.

## Rules and where they are enforced

| Rule | Enforced by |
| --- | --- |
| Only members can see a trip, its members and its counts | RLS on `trips`, `trip_members`, `profiles`; membership checks in every RPC |
| Nobody (uploader included) can read, list, download or sign a URL for trip media before `unlocks_at` | Storage `SELECT` policy `trip-media: read after reveal` → `can_view_media()` compares `unlocks_at <= now()` using the **database clock** |
| After reveal, only members can read media | Same policy plus the membership join |
| Uploads only to a server-reserved path, by a member, before the reveal | `reserve_media_upload()` creates the path; Storage `INSERT` policy `trip-media: insert reserved path` |
| No overwriting or deleting objects from the client | No Storage `UPDATE`/`DELETE` policies; no upsert |
| File type and size | Bucket `allowed_mime_types` and `file_size_limit` (50 MB); `media` check constraints; `complete_media_upload()` re-checks the stored object's size, MIME type and creation time |
| Reveal time can't be changed | No `UPDATE` grant on `trips`; dates are fixed at creation |
| Membership changes only via invites / owner actions | No client `INSERT/UPDATE/DELETE` on `trip_members`; `accept_invite()`, `leave_trip()`, `remove_member()` |
| Invite tokens can't be guessed | 192-bit random tokens; only SHA-256 hashes stored; 10 failed attempts per user per hour, then lockout; links expire at reveal; owner can revoke all |
| Removed members can't rejoin | `trip_bans` |
| Blocking and reporting | `user_blocks` and own reports are applied inside `can_view_media()`, so blocked or reported media is hidden server-side, including from signed URLs |
| Service key never on device | Only `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ships; the secret key is used only in Edge Functions |

Signed URLs are minted with `createSignedUrls`, which is itself subject to the Storage `SELECT` policy, so a URL can't exist before the reveal. URLs live 10 minutes (`limits.signedUrlSeconds`). A URL minted after the reveal is a bearer link until it expires. Once members can view a memory, they can also save or share it by design.

### Known limits (accepted for the MVP)

- `complete_media_upload` trusts the `Content-Type` that Storage recorded. It does not sniff file contents. Video duration is client-reported (bounded to ≤ 31 s by a constraint) and not verified server-side.
- **Video location metadata.** Photos are re-encoded on device, which strips EXIF including GPS. Camera videos carry no location, because the app has no location permission. Videos **picked from the library** may still contain the location the Camera app recorded. Removing it needs a native remux or server-side processing; this is tracked in `APP_STORE.md`.
- Pending reservations count toward `memory_count` only once they are `ready`.
- The `delete-account` function authenticates with `auth.getUser(jwt)`, which makes a round trip to the Auth server.

## Data retention and deletion policy

| Event | What happens |
| --- | --- |
| Member deletes a memory (after reveal) | Row deleted immediately; file purged by `purge-media` |
| Organizer removes a memory | Same |
| Member **leaves** a trip | Their uploads in that trip are deleted. If they were the organizer, the longest-standing member takes over; a trip with nobody left is deleted |
| Organizer **removes** a member | The member's uploads in that trip are deleted, links they created are revoked, and they're banned from rejoining |
| Organizer **deletes** a trip | All memories, the cover and the memberships are deleted |
| **Account deletion** (in app → `delete-account`) | Organizer roles are transferred, every upload is deleted, then the auth user is deleted (cascading profile, memberships and blocks). Reports keep their text with the reporter set to `NULL`. Files are purged immediately where possible and otherwise within the purge interval. The Apple token is revoked if Apple credentials are configured |
| Upload reservation never completed | Removed after 2 days by `expire_stale_uploads()` |
| Unsent uploads on device | Kept in the app's Documents folder until uploaded; deleted on success, on discard, on sign-out and on account deletion |

Backups: Supabase's database backups and point-in-time recovery may retain deleted rows for the plan's retention window. State this in the privacy policy.

## Logging

Edge Functions log only fixed error strings. The app never logs tokens, signed URLs, storage paths or user data. Keep it that way: don't add `console.log` of API responses.

## Verifying with separate accounts

### Offline (no Supabase needed)

```bash
npm run test:policies
```

This runs the real migration in PGlite (Postgres compiled to WASM) and checks the rules as four users: the reveal lock (uploader included), membership, invite hashing and rate limits, upload reservations, blocking, reporting, removal bans, deletion queueing, account deletion and anonymous access. It stubs Supabase's `auth`/`storage` schemas, so it validates the SQL. It does **not** exercise the Storage server.

### Against a real project (required before release)

**Automated (test project only):** enable anonymous sign-ins temporarily (Authentication → Sign In / Providers), then run

```bash
npm run test:live
```

This signs in three throwaway users and runs 25 checks against the real Storage server: invites, reserved uploads, no overwrite or delete, nothing listable, signable or downloadable before the reveal (uploader included), member-only access after the reveal, blocking, and the `delete-account` function. It then deletes what it created. Turn anonymous sign-ins off afterwards.

**Manual:** create two test users A and B (e.g. two Apple IDs, or temporarily enable email auth in a staging project). Then:

1. A creates a trip whose reveal is ~10 minutes away, creates an invite, and B joins.
2. A captures a photo. Confirm the app shows "Memory saved…".
3. As A and as B, using each user's access token (`supabase.auth.getSession()` in a debug build, or the SQL editor's "Run as user" option):
   ```bash
   curl -s "$URL/storage/v1/object/list/trip-media" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN_A" \
     -H 'content-type: application/json' -d '{"prefix":"<trip-id>"}'           # expect []
   curl -s -X POST "$URL/storage/v1/object/sign/trip-media/<path>" -H "apikey: $ANON" \
     -H "Authorization: Bearer $TOKEN_A" -H 'content-type: application/json' -d '{"expiresIn":60}'  # expect an error, not a URL
   curl -s "$URL/storage/v1/object/authenticated/trip-media/<path>" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN_B"   # expect 400/404
   curl -s "$URL/rest/v1/media?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN_A"   # expect []
   ```
   Get `<path>` from the SQL editor (`select storage_path from media`).
4. Change the device clock forward past the reveal. Pull to refresh: the trip must stay locked.
5. Try to overwrite: `POST` the same path again with `x-upsert: true`. Expect a rejection.
6. After the real reveal time, repeat step 3. A and B now get URLs; user C (not a member) still gets nothing.
7. B blocks A: A's memories disappear for B, including signing.
8. A removes B: B loses access and the old invite link shows "You can't join this trip".
9. Delete B's account in the app. Confirm B's rows are gone from `auth.users`, `media` and `trip_members`, and the files are gone from the bucket after `purge-media` runs.
