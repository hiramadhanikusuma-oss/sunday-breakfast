/* Bangun versi statis website pelanggan untuk deploy (GitHub Pages / Vercel / Netlify) */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const PUBLIC_API = 'https://script.google.com/macros/s/AKfycbwqZBsA7u2c7oJMCWarZ1Vwf1NiIr8ev_1OXTQQityQP3bdcUYvyB4HyDoOxseEm9pb/exec?r=%2Fapi%2Fpublic';

fs.mkdirSync(DIST, { recursive: true });
if (fs.existsSync(DIST)) {
  for (const name of fs.readdirSync(DIST)) {
    if (name === '.vercel') continue;
    fs.rmSync(path.join(DIST, name), { recursive: true, force: true });
  }
}

fs.cpSync(PUBLIC, DIST, {
  recursive: true,
  filter: src => {
    const rel = path.relative(PUBLIC, src);
    return !rel.split(path.sep)[0].startsWith('admin');
  }
});

fs.writeFileSync(
  path.join(DIST, 'config.js'),
  'window.CONFIG = { apiBase: "", dataUrl: ' + JSON.stringify(PUBLIC_API) + ',' +
  ' orderUrl: ' + JSON.stringify(PUBLIC_API.split('?')[0]) + ', dataJsonp: true };\n'
);

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
const settingsPublik = { ...db.settings };
['pin_hash', 'pin_salt', 'pin_admin'].forEach(k => delete settingsPublik[k]);
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(DIST, 'data', 'public.json'),
  JSON.stringify({ settings: settingsPublik, menu: db.menu }, null, 2)
);

console.log('Static site dibuat di dist/');
console.log('Menu:', (db.menu || []).length, 'item');
