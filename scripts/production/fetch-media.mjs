#!/usr/bin/env node
// Openly licensed photos/videos for the demo feed, from Wikimedia Commons (decision D2, 2026-10-28).
//   node scripts/production/fetch-media.mjs search <out.json> "<query>" [--video]   candidates with allowed licences
//   node scripts/production/fetch-media.mjs fetch                                   download + convert the files chosen
//                                                                                    in seed/media/selection.json
// Only CC0 / public domain / CC BY / CC BY-SA are accepted (never NC or ND). Every chosen file is looked at by a person
// before it is listed in selection.json. Converted files: seed/media/<district>/<slug>.jpg|mp4; credits in
// seed/media/CREDITS.md and seed/media/manifest.json (read by the feed seed and the unit test).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = new URL('../../', import.meta.url);
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'AgroConnect-demo-feed/1.0 (student project; seed media with credits)';
export const ALLOWED = /^(CC0|Public domain|CC BY(-SA)? [1-4]\.0|CC BY(-SA)? 2\.5)$/i;
const strip = (h) => String(h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', origin: '*', ...params })) u.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    if (r.status !== 429 || attempt >= 5) throw new Error(`Commons API ${r.status}`);
    await sleep(Number(r.headers.get('retry-after')) * 1000 || 5000 * (attempt + 1));   // rate limited: back off
  }
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const info = (p) => {
  const ii = p.imageinfo[0]; const m = ii.extmetadata || {};
  return {
    title: p.title, page: ii.descriptionurl, url: ii.url, thumb: ii.thumburl, mime: ii.mime, width: ii.width, height: ii.height,
    bytes: ii.size, duration: ii.duration ? Math.round(ii.duration) : undefined,
    license: strip(m.LicenseShortName?.value), licenseUrl: strip(m.LicenseUrl?.value), author: strip(m.Artist?.value).slice(0, 80),
    description: strip(m.ImageDescription?.value).slice(0, 160),
  };
};

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'search') {
  const [out, query] = rest; const video = rest.includes('--video');
  const d = await api({ action: 'query', generator: 'search', gsrsearch: `${query} filetype:${video ? 'video' : 'bitmap'}`, gsrnamespace: '6',
    gsrlimit: '12', prop: 'imageinfo', iiprop: 'extmetadata|size|mime|url', iiurlwidth: video ? '640' : '400',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription' });
  const found = Object.values(d.query?.pages || {}).map(info).filter((x) => ALLOWED.test(x.license))
    .filter((x) => video ? x.duration > 3 && x.bytes < 250e6 : x.width >= 800);
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
  prev[query] = found;
  writeFileSync(out, JSON.stringify(prev, null, 1));
  console.log(`${query}: ${found.length} candidates`);
} else if (cmd === 'fetch') {
  const sel = JSON.parse(readFileSync(new URL('seed/media/selection.json', ROOT), 'utf8'));
  const manifest = [];
  for (const s of sel) {
    await sleep(1000);
    const d = await api({ action: 'query', titles: s.title, prop: 'imageinfo', iiprop: 'extmetadata|size|mime|url',
      iiurlwidth: '1600', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription' });
    const f = info(Object.values(d.query.pages)[0]);
    if (!ALLOWED.test(f.license)) throw new Error(`${s.title}: licence ${f.license} not allowed`);
    const dir = new URL(`seed/media/${s.district}/`, ROOT); mkdirSync(dir, { recursive: true });
    const orig = new URL(`seed/media/originals/${s.slug}${s.kind === 'video' ? '.mov' : '.jpg'}`, ROOT);
    mkdirSync(new URL('seed/media/originals/', ROOT), { recursive: true });
    if (!existsSync(orig)) {
      await sleep(1500);   // be polite to Wikimedia between downloads
      // videos: Wikimedia's own 360p MPEG-4 transcode (macOS AVFoundation cannot read WebM/VP9); photos: 1600 px thumbnail
      const name = f.title.replace(/^File:/, '').replace(/ /g, '_');
      const h = createHash('md5').update(name).digest('hex');
      const src = s.kind === 'video'
        ? `https://upload.wikimedia.org/wikipedia/commons/transcoded/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(name)}/${encodeURIComponent(name)}.360p.mpeg4.mov`
        : (f.thumb || f.url);
      const r = await fetch(src, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`${s.title}: download ${r.status}`);
      writeFileSync(orig, Buffer.from(await r.arrayBuffer()));
    }
    const out = new URL(`${s.slug}.${s.kind === 'video' ? 'mp4' : 'jpg'}`, dir);
    let duration;
    if (s.kind === 'video') {
      // video track only (no sound), trimmed, H.264 MP4 ≤ 640x480 via macOS AVFoundation (ffmpeg cannot be built on this Mac)
      const len = Math.min(s.maxSeconds || 30, 60);
      duration = Number(execFileSync('swift', [new URL('scripts/production/video-export.swift', ROOT).pathname, orig.pathname, out.pathname,
        String(s.start || 0), String(len)], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
    } else {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '1600', orig.pathname, '--out', out.pathname], { stdio: 'ignore' });
    }
    const bytes = statSync(out).size;
    if (bytes > (s.kind === 'video' ? 20e6 : 10e6)) throw new Error(`${s.slug}: ${bytes} bytes is over the limit`);
    manifest.push({ slug: s.slug, district: s.district, kind: s.kind, file: `seed/media/${s.district}/${s.slug}.${s.kind === 'video' ? 'mp4' : 'jpg'}`,
      bytes, duration, shows: s.shows, title: f.title.replace(/^File:/, ''), author: f.author, license: f.license, licenseUrl: f.licenseUrl,
      source: f.page, changes: s.kind === 'video' ? `360p version re-encoded to H.264 MP4, ${s.start ? `from ${s.start} s, ` : ''}${duration} s, sound removed` : 'resized to max 1600 px, JPEG' });
    console.log(`${s.slug}: ${(bytes / 1e6).toFixed(2)} MB ${f.license}`);
  }
  writeFileSync(new URL('seed/media/manifest.json', ROOT), `${JSON.stringify(manifest, null, 1)}\n`);
  const credits = ['# Credits for the demo feed media', '',
    'All files are from Wikimedia Commons under the licence shown. They were resized or re-encoded as noted; under CC BY-SA the',
    'changed files keep the same licence. Each post that uses a file ends with a credit line.', '',
    '| File | Shows | Author | Licence | Source | Changes |', '|---|---|---|---|---|---|',
    ...manifest.map((m) => `| \`${m.file.replace('seed/media/', '')}\` | ${m.shows} | ${m.author || 'unknown'} | [${m.license}](${m.licenseUrl || m.source}) | [${m.title}](${m.source}) | ${m.changes} |`)];
  writeFileSync(new URL('seed/media/CREDITS.md', ROOT), `${credits.join('\n')}\n`);
  console.log(`${manifest.length} files; manifest + CREDITS written`);
} else {
  console.log('usage: search <out.json> "<query>" [--video] | fetch');
}
