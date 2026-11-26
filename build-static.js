/* Bangun versi statis website pelanggan untuk deploy (GitHub Pages / Vercel / Netlify) */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const PUBLIC_API = 'https://script.google.com/macros/s/AKfycbxd54YdFNgvLHtSVnnyndmm00m6Sphnp0Mg_KoffeKYQIlX5e-clbxQwdSExNxgSlmA/exec?r=%2Fapi%2Fpublic';

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
  'window.CONFIG = { apiBase: "", dataUrl: ' + JSON.stringify(PUBLIC_API) + ', dataJsonp: true };\n'
);

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(DIST, 'data', 'public.json'),
  JSON.stringify({ settings: db.settings, menu: db.menu }, null, 2)
);

console.log('Static site dibuat di dist/');
console.log('Menu:', (db.menu || []).length, 'item');
