# App Store readiness

Nothing here guarantees approval. Apple's documents are the source of truth and they change. Re-check the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), the [HIG](https://developer.apple.com/design/human-interface-guidelines/) and [Submitting](https://developer.apple.com/app-store/submitting/) right before you submit.

Status key: ✅ done in code · 🔧 needs your account, content or decision · ⚠️ known risk

## Guideline-driven requirements

| Item | Status | Notes |
| --- | --- | --- |
| Sign in with Apple offered alongside Google (4.8) | ✅ | Native button; Google uses the Supabase OAuth web flow |
| In-app account deletion (5.1.1(v)) | ✅ | Account → Delete account → `delete-account` function. Explains what is deleted |
| Apple token revocation on deletion | 🔧 | Implemented; set the `APPLE_*` function secrets (SETUP §2) |
| Report content (1.2) | ✅ | ••• on a memory and on a member. The memory is hidden for the reporter immediately. Reports land in `public.reports` |
| Timely response to reports (1.2) | 🔧 | Someone must review `reports` (status `open`) within 24 hours, which is what the app promises. Consider a database webhook that emails you on insert |
| Block abusive users (1.2) | ✅ | Hides their memories server-side, across all trips |
| Remove content / members | ✅ | Uploader or organizer can delete a memory; organizer can remove and ban members |
| Filtering objectionable material (1.2) | ⚠️ | Trips are private and invite-only. Media is unseen until reveal, then reportable and blockable. There's no automated filter. Consider Apple's Sensitive Content Analysis framework (needs a native module and entitlement) or server-side moderation if Review asks. Explain the private-group model in Review Notes |
| Published contact info (1.2) | 🔧 | Set `EXPO_PUBLIC_SUPPORT_EMAIL`; also put it on the support URL |
| Privacy policy in app and in App Store Connect (5.1.1(i)) | 🔧 | Set `EXPO_PUBLIC_PRIVACY_URL`. Ready-to-host pages are in `website/` (privacy, terms, support); fill the placeholders and have them reviewed |
| Permission purpose strings | ✅ | Camera, microphone, photo library (read for picked videos, add for Save) in `app.config.ts`. Each is requested only when needed |
| Privacy manifest | ✅ | `ios.privacyManifests` in `app.config.ts`; Expo modules ship their own required-reason entries. Verify the generated `PrivacyInfo.xcprivacy` after `npx expo prebuild` |
| Encryption export compliance | ✅ | `usesNonExemptEncryption: false` (HTTPS only). Confirm for your situation |

## Current platform requirements (checked October 2026)

- **Build toolchain:** since 28 April 2026, uploads must be built with **Xcode 26+ and the iOS 26 SDK** ([Apple](https://developer.apple.com/news/upcoming-requirements/)). Expo SDK 58 on EAS's default image meets this. Re-check the page before each release.
- **Age rating:** the questionnaire with 13+/16+/18+ tiers must be answered for every new submission. Relive has no public feed, but it does let users share unmoderated photos and videos, so answer the user-generated content questions honestly. Expect at least 13+.
- **Demo access (2.1):** apps with login must give App Review a working **demo account**. A built-in demo mode is only allowed *with prior approval from Apple*, so "Look around first" alone isn't enough (see below).

## App Review access

- **Demo account (required, 2.1):** the app only offers Apple and Google sign-in, and reviewers can't use your Google account. Plan: enable Supabase **Email** sign-in with **new sign-ups disabled**, create one review account in the dashboard, and add a low-key "Sign in with email" option in the app for pre-created accounts only. Put the credentials in Review Notes. Reviewers can also use Sign in with Apple with their own Apple ID.
- **Preview mode** ("Look around first") shows sample trips (locked, upcoming and revealed) with placeholder artwork and no real data. Mention it in Review Notes as an extra, not instead of the demo account.
- **Real flow:** reviewers can use Sign in with Apple with their own Apple ID. Because memories unlock only after a trip ends, give Review a **pre-revealed demo trip** to join:
  1. Sign in with a dedicated demo Apple ID and create a trip in a staging project. Add stock or self-shot photos (no real users' content).
  2. In the SQL editor, move the trip's dates into the past (`update trips set starts_at = now() - interval '3 days', unlocks_at = now() - interval '1 hour' where id = '…';`). Do this only for the demo trip.
  3. Invites close at reveal, so create the invite **before** step 2 and have the reviewer join from that link while the trip is still open. Alternatively, add the reviewer's account as a member by SQL after they sign in. Write these steps in Review Notes.
- Never use real users' trips for review.

## Privacy nutrition label (App Store Connect)

Collected and **linked to the user**, used for **App Functionality**, **not** used for tracking:

- Contact Info → Name, Email Address
- User Content → Photos or Videos, Other User Content (trip names, reports)
- Identifiers → User ID

Not collected: location, contacts, browsing history, diagnostics or analytics (unless you add a crash reporter later). Update this if you add analytics.

## Age rating

Fill in the current questionnaire honestly. Users can share unmoderated photos and videos with other users, which typically raises the rating. Expect a mature rating; don't guess.

## Metadata and assets

- 🔧 App name, subtitle ("Capture now. Relive later."), description, keywords, support URL, marketing URL, privacy policy URL.
- 🔧 **App icon:** replace `assets/expo.icon` and `assets/images/icon.png` with Relive artwork. The template icon is still in place.
- 🔧 **iPad:** `supportsTablet` is true, so App Review tests on iPad and iPad screenshots are required. Either test the layouts on an iPad (and iPhone Duo) simulator or set `supportsTablet: false` for v1.
- 🔧 **App name:** check that "Relive" is available in App Store Connect and keep a fallback ready (e.g. "Relive: Trip Memories").
- 🔧 **Screenshots:** capture on the device sizes App Store Connect currently requires (check the [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)). Use preview mode or the demo trip, never real users' media. iPad screenshots are needed because `supportsTablet` is true.
- 🔧 Splash image: `assets/images/splash-icon.png` is still the template's.
- 🔧 Google sign-in button: follow Google's branding guidelines (official "G" mark) before release, or turn it off.

## Remaining product and technical work before submission

- ⚠️ Strip location metadata from library-picked **videos** (native remux or server-side processing), or document it in the privacy policy.
- 🔧 Universal links domain for invites (SETUP §5).
- 🔧 iPhone Duo: verify in Xcode Device Hub (Xcode 27+) that the outer and inner displays, folded poses and Split View work. Layouts are width-driven (`src/ui/layout.ts`) and use even gallery columns on regular widths, but React Native can't read `ReservedRegion` yet, so check that nothing important sits on the fold.
- 🔧 Test on real devices: capture in portrait and landscape, a 30 s video, airplane mode mid-upload, backgrounding mid-upload, force-quit mid-upload, Reduce Transparency, Increase Contrast, Reduce Motion, the largest Dynamic Type sizes, and VoiceOver through the main flows.
- 🔧 Verify the current minimum Xcode/iOS SDK required for uploads (App Store Connect announces these). EAS uses its default image for the SDK. Check `npx eas-cli build:version` and EAS image docs near release.

## Release checklist

1. `IOS_BUNDLE_ID` set to your real identifier; App ID created with Sign in with Apple (plus Associated Domains if you use universal links).
2. Supabase → Auth → Apple provider: **remove the Expo Go test Client ID `host.exp.Exponent`** and add your real bundle ID. Remove `exp://**` from Auth → URL Configuration → Redirect URLs. Make sure anonymous sign-ins are off.
3. Supabase production project: migration applied, buckets private, Apple and Google providers set, redirect URL added, functions deployed, secrets set, purge cron scheduled.
4. Policies verified with separate accounts (`docs/SECURITY.md`).
5. EAS env vars set for `production`. Confirm no secret key is in any `EXPO_PUBLIC_*` value.
6. `npm run check` passes.
7. `npx eas-cli@latest build --profile production --platform ios`.
8. Install through TestFlight and run the device test list above on at least one small iPhone, one large iPhone, and an iPad (plus iPhone Duo if available).
9. App Store Connect: metadata, screenshots, privacy label, age rating, review notes (preview mode + demo trip steps), contact info.
10. Submit **only after explicit go-ahead**: `npx eas-cli@latest submit --platform ios --profile production`.
