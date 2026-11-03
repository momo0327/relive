// Unsplash proxy for cover photos, so the access key never ships in the app.
// Signed-in users only (JWT verified by the platform).
//   POST { query?: string, page?: number }       → list of photos
//   POST { download: "<download_location url>" } → registers a download (required by Unsplash)
// Secret: UNSPLASH_ACCESS_KEY (supabase secrets set UNSPLASH_ACCESS_KEY=…)
import { json } from '../_shared/admin.ts';

type Photo = {
  id: string;
  width: number;
  height: number;
  color: string | null;
  urls: { small: string; regular: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
};

Deno.serve(async (req) => {
  const key = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);
  let body: { query?: string; page?: number; download?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = featured photos
  }
  const headers = { authorization: `Client-ID ${key}`, 'accept-version': 'v1' };

  if (body.download) {
    // Only Unsplash's own tracking endpoints may be called.
    if (!/^https:\/\/api\.unsplash\.com\/photos\/[\w-]+\/download/.test(body.download)) return json({ error: 'invalid' }, 400);
    await fetch(body.download, { headers });
    return json({ ok: true });
  }

  const page = Math.max(1, Math.min(20, Number(body.page) || 1));
  const query = (body.query ?? '').trim().slice(0, 80);
  const url = query
    ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=30&page=${page}&orientation=portrait&content_filter=high`
    : `https://api.unsplash.com/photos?per_page=30&page=${page}&order_by=popular`;
  const res = await fetch(url, { headers });
  if (!res.ok) return json({ error: 'unsplash_failed' }, 502);
  const data = await res.json();
  const photos: Photo[] = query ? data.results : data;
  return json({
    photos: photos.map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      color: p.color,
      thumb: p.urls.small,
      regular: p.urls.regular,
      downloadLocation: p.links.download_location,
      author: p.user.name,
      authorUrl: `${p.user.links.html}?utm_source=relive&utm_medium=referral`,
    })),
  });
});
