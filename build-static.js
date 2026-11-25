/* Bangun versi statis website pelanggan untuk deploy (GitHub Pages / Vercel / Netlify) */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

fs.cpSync(PUBLIC, DIST, {
  recursive: true,
  filter: src => {
    const rel = path.relative(PUBLIC, src);
    return !rel.split(path.sep)[0].startsWith('admin');
  }
});

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(DIST, 'data', 'public.json'),
  JSON.stringify({ settings: db.settings, menu: db.menu }, null, 2)
);

console.log('Static site dibuat di dist/');
console.log('Menu:', (db.menu || []).length, 'item');
