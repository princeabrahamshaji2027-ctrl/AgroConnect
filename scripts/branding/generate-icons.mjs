#!/usr/bin/env node
// Renders logo.svg (project root, never modified) into the Android launcher icons, the app/admin logo PNGs and the
// favicons, using the locally installed Chrome through Playwright (no extra dependency).
//   node scripts/branding/generate-icons.mjs
// The artwork is cropped to its visible pixels first, so the logo fills the icon instead of the SVG's empty margin.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const svg = readFileSync(new URL('logo.svg', ROOT), 'utf8');
const BACKGROUND = '#FFFFFF';   // logo.svg is transparent; white keeps the grey "Agro" lettering readable
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const res = (d, f) => new URL(`android/app/src/main/res/mipmap-${d}/${f}`, ROOT);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);

// visible bounding box of the artwork (alpha > 8) on a 1000 px render
const box = await page.evaluate(async () => {
  const el = document.querySelector('svg');
  const w = Number(el.getAttribute('width')), h = Number(el.getAttribute('height'));
  if (!el.getAttribute('viewBox')) el.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(el))}`;
  await img.decode();
  const S = 1000, c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data;
  let x0 = S, y0 = S, x1 = 0, y1 = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (px[(y * S + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { w, h, x: (x0 / S) * w, y: (y0 / S) * h, bw: ((x1 - x0 + 1) / S) * w, bh: ((y1 - y0 + 1) / S) * h };
});

// PNG of `size` px: logo scaled to `scale` of the canvas (longest side), centred; optional background and circle mask
async function render(size, { scale, background = 'transparent', circle = false }) {
  return page.evaluate(async ({ size, scale, background, circle, box }) => {
    const el = document.querySelector('svg');
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(el))}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (circle) { g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip(); }
    if (background !== 'transparent') { g.fillStyle = background; g.fillRect(0, 0, size, size); }
    const k = (size * scale) / Math.max(box.bw, box.bh);
    const dw = box.bw * k, dh = box.bh * k;
    // draw only the visible part of the SVG (source rect in SVG units, scaled to the 1:1 image)
    const sx = img.width / box.w;
    g.drawImage(img, box.x * sx, box.y * sx, box.bw * sx, box.bh * sx, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return c.toDataURL('image/png').split(',')[1];
  }, { size, scale, background, circle, box });
}
const save = async (url, size, opts) => writeFileSync(url, Buffer.from(await render(size, opts), 'base64'));

const written = [];
for (const [d, m] of Object.entries(DENSITIES)) {
  await save(res(d, 'ic_launcher.png'), Math.round(48 * m), { scale: 0.8, background: BACKGROUND });
  await save(res(d, 'ic_launcher_round.png'), Math.round(48 * m), { scale: 0.72, background: BACKGROUND, circle: true });
  // adaptive foreground: 108 dp canvas, only the inner 72 dp (66.7 %) is guaranteed visible → 61 %
  await save(res(d, 'ic_launcher_foreground.png'), Math.round(108 * m), { scale: 0.61 });
  written.push(`mipmap-${d}/ic_launcher.png`, `mipmap-${d}/ic_launcher_round.png`, `mipmap-${d}/ic_launcher_foreground.png`);
}
await save(new URL('public/logo.png', ROOT), 512, { scale: 1 });
await save(new URL('admin-dashboard/src/assets/logo.png', ROOT), 512, { scale: 1 });
written.push('public/logo.png', 'admin-dashboard/src/assets/logo.png');
await browser.close();

writeFileSync(new URL('android/app/src/main/res/values/ic_launcher_background.xml', ROOT),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BACKGROUND}</color>\n</resources>\n`);
copyFileSync(new URL('logo.svg', ROOT), new URL('public/favicon.svg', ROOT));
copyFileSync(new URL('logo.svg', ROOT), new URL('admin-dashboard/public/favicon.svg', ROOT));
written.push('values/ic_launcher_background.xml', 'public/favicon.svg', 'admin-dashboard/public/favicon.svg');
console.log(`logo.svg ${box.w}×${box.h}; visible artwork ${Math.round(box.bw)}×${Math.round(box.bh)} at (${Math.round(box.x)}, ${Math.round(box.y)})`);
console.log(written.join('\n'));
