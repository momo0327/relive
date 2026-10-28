# L8R website

Static pages for the App Store listing and invite links. Host on any static host
(Netlify, Vercel, Cloudflare Pages, GitHub Pages) at your domain.

1. Replace every `[placeholder]` (name/company, address, support email, region, dates, App Store link).
2. Serve `.html` files without the extension (`/privacy` → `privacy.html`). Most hosts do this by default ("clean URLs").
3. Route every `/join/<token>` path to `join/index.html` (a rewrite rule), so invite links work when the app isn't installed.
4. `/.well-known/apple-app-site-association`: fill in `TEAM_ID.BUNDLE_ID`, serve it with
   `Content-Type: application/json`, no redirects, over HTTPS.
5. In the app's env: `EXPO_PUBLIC_PRIVACY_URL=https://<domain>/privacy`, `EXPO_PUBLIC_TERMS_URL=https://<domain>/terms`,
   `EXPO_PUBLIC_HELP_URL=https://<domain>/support`, `EXPO_PUBLIC_SUPPORT_EMAIL=<email>`,
   `EXPO_PUBLIC_INVITE_BASE_URL=https://<domain>`.
6. In App Store Connect use `https://<domain>/privacy` as the Privacy Policy URL and `https://<domain>/support` as the Support URL.
