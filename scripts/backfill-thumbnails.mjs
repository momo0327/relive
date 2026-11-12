// One-time: create the small previews for memories uploaded before previews
// existed. New uploads make their own preview on the phone.
//
// Runs on this Mac (uses macOS `sips` for photos and `qlmanage` for the first
// frame of videos) with the project's SECRET key, which only lives in your
// shell for this command and is never saved:
//
//   SUPABASE_SECRET_KEY='sb_secret_…' node --env-file=.env.local scripts/backfill-thumbnails.mjs
//
// Safe to re-run: it only handles memories that still have no preview.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const require = createRequire(root + 'package.json');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL (from .env.local) and SUPABASE_SECRET_KEY');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: rows, error } = await admin
  .from('media')
  .select('id, trip_id, uploader_id, storage_path, kind')
  .eq('status', 'ready')
  .is('thumb_path', null);
if (error) throw error;
console.log(`${rows.length} memories need a preview`);

const work = mkdtempSync(join(tmpdir(), 'relive-thumbs-'));
let done = 0;
let failed = 0;
try {
  for (const m of rows) {
    const ext = m.storage_path.split('.').pop();
    const original = join(work, `${m.id}.${ext}`);
    const thumb = join(work, `${m.id}.thumb.jpg`);
    try {
      const { data: blob, error: dlError } = await admin.storage.from('trip-media').download(m.storage_path);
      if (dlError) throw dlError;
      writeFileSync(original, Buffer.from(await blob.arrayBuffer()));

      if (m.kind === 'photo') {
        execFileSync('sips', ['-Z', '480', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', original, '--out', thumb], { stdio: 'ignore' });
      } else {
        // Quick Look renders the video's poster frame (its first frame) as a PNG.
        execFileSync('qlmanage', ['-t', '-s', '960', '-o', work, original], { stdio: 'ignore' });
        const png = readdirSync(work).find((f) => f.startsWith(`${m.id}.${ext}`) && f.endsWith('.png'));
        if (!png) throw new Error('no frame');
        execFileSync('sips', ['-Z', '480', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', join(work, png), '--out', thumb], { stdio: 'ignore' });
        rmSync(join(work, png), { force: true });
      }

      const path = `${m.trip_id}/${m.uploader_id}/${m.id}.thumb.jpg`;
      const { error: upError } = await admin.storage
        .from('trip-media')
        .upload(path, readFileSync(thumb), { contentType: 'image/jpeg', upsert: true });
      if (upError) throw upError;
      const { error: setError } = await admin.from('media').update({ thumb_path: path }).eq('id', m.id);
      if (setError) throw setError;
      done += 1;
      if (done % 10 === 0) console.log(`  ${done}/${rows.length}`);
    } catch (e) {
      failed += 1;
      console.log(`  skipped ${m.id} (${m.kind}): ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      rmSync(original, { force: true });
      rmSync(thumb, { force: true });
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`Done: ${done} previews created, ${failed} skipped.`);
