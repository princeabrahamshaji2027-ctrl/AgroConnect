// The demo feed content: right size and district split, real authors living in the post's district, no duplicates or
// placeholder words, valid categories, and every photo/video present, within the upload limits, openly licensed and
// credited in the caption.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { FEED, VIDEO_POSTS, captionWithCredit } from '../../scripts/production/feed-content.mjs';
import { accounts } from '../../scripts/production/seed-lib.mjs';

const ROOT = new URL('../../', import.meta.url);
const byName = new Map(accounts().map((a) => [a.name, a]));
const media = JSON.parse(readFileSync(new URL('seed/media/manifest.json', ROOT), 'utf8'));
const mediaBySlug = new Map(media.map((m) => [m.slug, m]));
const CATEGORIES = ['General', 'Organic Farming', 'Pest Control', 'Agri Tech', 'Market Prices'];   // CreatePost.jsx options
const TARGET = { Kannur: 16, Pathanamthitta: 16, Idukki: 8, Kottayam: 8 };
const videosPending = VIDEO_POSTS.length === 0;   // until the clips pass review, 6 video slots are still open

test('district split and authors', () => {
  const count = {};
  const perAuthor = {};
  for (const p of FEED) {
    const a = byName.get(p.author);
    assert.ok(a, `unknown author ${p.author}`);
    count[a.district] = (count[a.district] || 0) + 1;
    perAuthor[p.author] = (perAuthor[p.author] || 0) + 1;
    for (const c of p.comments) assert.ok(byName.get(c.author), `unknown commenter ${c.author}`);
    // the author may answer a question, but a thread never starts with the author talking to themselves
    if (p.comments.length) assert.notEqual(p.comments[0].author, p.author, `${p.title}: first comment by the author`);
  }
  const expected = videosPending ? { Kannur: 14, Pathanamthitta: 14, Idukki: 7, Kottayam: 7 } : TARGET;
  assert.deepEqual(count, expected);
  assert.ok(Math.max(...Object.values(perAuthor)) <= 3, 'more than 3 posts by one author');
});

test('natural, varied text with no placeholder words', () => {
  const titles = new Set(); const openings = new Set();
  for (const p of FEED) {
    assert.ok(CATEGORIES.includes(p.category), `${p.title}: category ${p.category}`);
    assert.ok(!titles.has(p.title), `duplicate title ${p.title}`); titles.add(p.title);
    const open = p.text.split(/\s+/).slice(0, 5).join(' ').toLowerCase();
    assert.ok(!openings.has(open), `repeated opening "${open}"`); openings.add(open);
    for (const t of [p.title, p.text, ...p.comments.map((c) => c.text)]) {
      assert.doesNotMatch(t, /\b(test|demo|lorem|placeholder|dummy|e2e)\b|user \d|farmer \d/i, t.slice(0, 60));
      assert.doesNotMatch(t, /\b\d+\s?(ml|g|kg)\s*(per|\/)\s*(litre|liter|l|plant|tree|acre)/i, `${p.title}: dosage`);
    }
    assert.ok(`${p.title}\n\n${p.text}`.length <= 2000, `${p.title}: too long`);
  }
});

test('media: present, within limits, openly licensed and credited', () => {
  const used = new Set();
  for (const p of FEED.filter((x) => x.media)) {
    const m = mediaBySlug.get(p.media);
    assert.ok(m, `${p.title}: media ${p.media} not in manifest`);
    assert.equal(m.district, byName.get(p.author).district, `${p.title}: media from another district folder`);
    used.add(p.media);
    const caption = captionWithCredit(p, mediaBySlug);
    assert.match(caption, new RegExp(`(Photo|Video): .+, ${m.license.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, Wikimedia Commons$`));
    assert.doesNotMatch(p.text, /\bmy (field|farm|garden|plot|trees?)\b.*this photo|this photo.*\bmy (field|farm)\b/i, `${p.title}: claims the photo`);
  }
  for (const m of media) {
    assert.ok(existsSync(new URL(m.file, ROOT)), `missing ${m.file}`);
    const bytes = statSync(new URL(m.file, ROOT)).size;
    assert.ok(bytes <= (m.kind === 'video' ? 20e6 : 10e6), `${m.file}: ${bytes} bytes`);
    assert.match(m.license, /^(CC0|Public domain|CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0))$/, `${m.file}: licence ${m.license}`);
    assert.match(m.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    if (m.kind === 'video') assert.ok(m.duration > 0 && m.duration <= 60, `${m.file}: ${m.duration} s`);
  }
  const credits = readFileSync(new URL('seed/media/CREDITS.md', ROOT), 'utf8');
  for (const m of media) assert.ok(credits.includes(m.file.replace('seed/media/', '')), `${m.file} missing in CREDITS.md`);
  assert.ok(used.size >= 20, 'fewer than 20 media files used');
});
