// Fetches team members + portrait images from https://vitamin2.ch/agentur
// Output: public/team/<slug>.jpg (portrait) and src/data/team.raw.json
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BASE = 'https://vitamin2.ch';
const html = await (await fetch(`${BASE}/agentur`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();

const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');

// Each card: first <figure class="m-team-image__outer is-active"> holds the portrait,
// followed later by <h3 class="m-team-card__name"> + function. Pair by document order.
const people = [];
const nameRe = /<h3 class="m-team-card__name">([^<]+)<\/h3>\s*<p class="m-team-card__function"[^>]*>([^<]*)<\/p>/g;
let prev = 0;
for (const m of html.matchAll(nameRe)) {
  const chunk = html.slice(prev, m.index);
  prev = m.index;
  const figStart = chunk.lastIndexOf('<figure class="m-team-image__outer is-active">');
  const img = figStart >= 0 ? chunk.slice(figStart).match(/<img class="m-team-image" src="([^"]+)"/) : null;
  const full = decode(m[1]).trim();
  people.push({ name: full, first: full.split(' ')[0], role: decode(m[2]).trim(), src: img?.[1] });
}

await mkdir('public/team', { recursive: true });
const out = [];
for (const p of people) {
  const slug = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (!p.src) {
    console.warn('no portrait for', p.name);
    out.push({ id: slug, name: p.name, role: p.role, portrait: null });
    continue;
  }
  const res = await fetch(new URL(p.src, BASE));
  if (!res.ok) {
    console.warn('download failed', p.name, res.status);
    out.push({ id: slug, name: p.name, role: p.role, portrait: null });
    continue;
  }
  // downscale: portraits are only used for small tooltips
  await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 480 }).jpeg({ quality: 82, mozjpeg: true }).toFile(`public/team/${slug}.jpg`);
  out.push({ id: slug, name: p.name, role: p.role, portrait: `team/${slug}.jpg` });
  console.log('ok', slug);
}
await writeFile('src/data/team.raw.json', JSON.stringify(out, null, 2));
console.log(`${out.length} people`);
