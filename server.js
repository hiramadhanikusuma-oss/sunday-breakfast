const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ASSETS = path.join(PUBLIC, 'assets');

db.load();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/* ===== session admin (in-memory) ===== */
const sessions = new Map();
const SESSION_MS = 12 * 60 * 60 * 1000;
function cookie(req) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(s => s.trim()).find(s => s.startsWith('sunday_admin='));
  return found ? found.split('=').slice(1).join('=') : '';
}
function isAuth(req) {
  const t = cookie(req);
  const exp = sessions.get(t);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(t); return false; }
  return true;
}
function json(res, obj, status = 200, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 16 * 1024 * 1024) { reject(new Error('Body terlalu besar')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('JSON tidak valid')); }
    });
    req.on('error', reject);
  });
}
function csv(rows) {
  return '\uFEFF' + rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}
function hppOf(menu) {
  const resep = Array.isArray(menu.resep) ? menu.resep : [];
  if (resep.length) return resep.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0);
  return Number(menu.hpp) || 0;
}
function kembalikanStok(d, trx) {
  const tambah = (menuId, jumlah) => {
    const m = d.menu.find(x => x.id === menuId);
    if (!m || m.stok === null || m.stok === undefined) return;
    m.stok = Number(m.stok) + Number(jumlah);
    if (m.stok > 0) m.habis = false;
  };
  for (const it of (trx.items || [])) {
    tambah(it.menu_id, it.qty);
    if (it.pilihan && typeof it.pilihan === 'object') {
      for (const [id, jumlah] of Object.entries(it.pilihan)) tambah(id, Number(jumlah) * Number(it.qty));
    }
  }
}
function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  /* ---------- PUBLIC API ---------- */
  if (url === '/api/public') {
    const d = db.get();
    const settings = { ...d.settings };
    ['pin_hash', 'pin_salt', 'pin_admin'].forEach(k => delete settings[k]);
    return json(res, { settings, menu: d.menu });
  }

  /* ---------- ADMIN AUTH ---------- */
  if (url === '/api/admin/login' && req.method === 'POST') {
    try {
      const b = await body(req);
      const s = db.get().settings;
      if (db.hashPin(String(b.pin || ''), s.pin_salt) !== s.pin_hash) {
        return json(res, { ok: false, error: 'PIN salah' }, 401);
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      return json(res, { ok: true }, 200, {
        'Set-Cookie': `sunday_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`
      });
    } catch (e) { return json(res, { ok: false, error: e.message }, 400); }
  }
  if (url === '/api/admin/logout' && req.method === 'POST') {
    sessions.delete(cookie(req));
    return json(res, { ok: true }, 200, {
      'Set-Cookie': 'sunday_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
    });
  }
  if (url === '/api/admin/session') {
    return json(res, { auth: isAuth(req) });
  }

  /* ---------- ADMIN DATA ---------- */
  if (url === '/api/admin/data') {
    if (!isAuth(req)) return json(res, { error: 'Belum login' }, 401);
    return json(res, db.get());
  }
  if (url === '/api/admin/save' && req.method === 'POST') {
    if (!isAuth(req)) return json(res, { error: 'Belum login' }, 401);
    try {
      const b = await body(req);
      const d = db.get();
      if (b.settings && typeof b.settings === 'object') {
        for (const key of ['nama_toko', 'tagline', 'alamat', 'maps_url', 'instagram', 'wa', 'logo',
          'warna_utama', 'warna_aksen', 'kertas_nota', 'hari_buka', 'printer',
          'biaya_bulanan', 'karyawan', 'target_laba', 'target_biaya', 'target_hpp', 'susut', 'pajak']) {
          if (b.settings[key] !== undefined) d.settings[key] = b.settings[key];
        }
      }
      if (b.pin_baru) {
        if (String(b.pin_baru).length < 4) return json(res, { error: 'PIN minimal 4 karakter' }, 400);
        d.settings.pin_hash = db.hashPin(String(b.pin_baru), d.settings.pin_salt);
        d.settings.pin_admin = String(b.pin_baru); // tersimpan & terlihat di data/settings
      }
      if (Array.isArray(b.menu)) d.menu = b.menu;
      if (Array.isArray(b.bahan)) d.bahan = b.bahan;
      if (Array.isArray(b.transaksi)) d.transaksi = b.transaksi;
      if (typeof b.counter_nota === 'number') d.counter_nota = b.counter_nota;
      db.save();
      return json(res, { ok: true });
    } catch (e) { return json(res, { error: e.message }, 400); }
  }

  /* ---------- ADMIN UPLOAD GAMBAR ---------- */
  if (url === '/api/admin/upload' && req.method === 'POST') {
    if (!isAuth(req)) return json(res, { error: 'Belum login' }, 401);
    try {
      const b = await body(req);
      const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(b.data || '');
      if (!m) return json(res, { error: 'Format gambar tidak didukung' }, 400);
      const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 8 * 1024 * 1024) return json(res, { error: 'Gambar maksimal 8 MB' }, 400);
      const folder = b.folder === 'hero' ? path.join(ASSETS, 'hero') : path.join(ASSETS, 'produk');
      fs.mkdirSync(folder, { recursive: true });
      const safe = String(b.name || 'gambar').toLowerCase()
        .replace(/\.(png|jpe?g|webp)$/i, '')
        .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'gambar';
      const file = `${safe}-${Date.now().toString(36)}.${ext}`;
      fs.writeFileSync(path.join(folder, file), buf);
      return json(res, { ok: true, url: `/assets/${b.folder === 'hero' ? 'hero' : 'produk'}/${file}` });
    } catch (e) { return json(res, { error: e.message }, 400); }
  }

  /* ---------- TRANSAKSI KASIR ---------- */
  if (url === '/api/admin/transaksi' && req.method === 'POST') {
    if (!isAuth(req)) return json(res, { error: 'Belum login' }, 401);
    try {
      const b = await body(req);
      const d = db.get();
      if (!Array.isArray(b.items) || !b.items.length) return json(res, { error: 'Keranjang kosong' }, 400);
      d.counter_nota = (d.counter_nota || 0) + 1;
      const trx = {
        id: 'trx_' + Date.now().toString(36),
        no_nota: 'SB-' + String(d.counter_nota).padStart(5, '0'),
        waktu: new Date().toISOString(),
        items: b.items,
        total: Number(b.total) || 0,
        hpp: Number(b.hpp) || 0,
        bayar: Number(b.bayar) || 0,
        kembalian: Number(b.kembalian) || 0,
        metode: b.metode || 'Cash',
        kasir: b.kasir || 'Admin',
        refunded: false
      };
      d.transaksi.unshift(trx);
      // kurangi stok kalau stok memang dipantau
      const kurangi = (menuId, jumlah) => {
        const m = d.menu.find(x => x.id === menuId);
        if (!m || m.stok === null || m.stok === undefined) return;
        m.stok = Math.max(0, Number(m.stok) - Number(jumlah));
        if (m.stok === 0) m.habis = true;
      };
      for (const it of trx.items) {
        kurangi(it.menu_id, it.qty);
        if (it.pilihan && typeof it.pilihan === 'object') {
          for (const [id, jumlah] of Object.entries(it.pilihan)) {
            kurangi(id, Number(jumlah) * Number(it.qty));
          }
        }
      }
      db.save();
      return json(res, { ok: true, transaksi: trx });
    } catch (e) { return json(res, { error: e.message }, 400); }
  }

  /* ---------- REFUND / HAPUS RECEIPT ---------- */
  if (url === '/api/admin/transaksi/refund' && req.method === 'POST') {
    if (!isAuth(req)) return json(res, { error: 'Belum login' }, 401);
    try {
      const b = await body(req);
      const d = db.get();
      const trx = d.transaksi.find(x => x.id === b.id);
      if (!trx) return json(res, { error: 'Receipt tidak ditemukan' }, 404);
      if (trx.refunded) return json(res, { error: 'Receipt ini sudah direfund' }, 400);
      kembalikanStok(d, trx);
      trx.refunded = true;
      trx.refund_at = new Date().toISOString();
      trx.refund_alasan = String(b.alasan || '').slice(0, 200);
      db.save();
      return json(res, { ok: true, transaksi: trx });
    } catch (e) { return json(res, { error: e.message }, 400); }
  }
  if (url === '/api/admin/transaksi/hapus' && req.method === 'POST') {
    if (!isAuth(req)) return json(res, { error: 'Belum login' }, 401);
    try {
      const b = await body(req);
      const d = db.get();
      const i = d.transaksi.findIndex(x => x.id === b.id);
      if (i < 0) return json(res, { error: 'Receipt tidak ditemukan' }, 404);
      const trx = d.transaksi[i];
      if (!trx.refunded) kembalikanStok(d, trx);
      d.transaksi.splice(i, 1);
      db.save();
      return json(res, { ok: true });
    } catch (e) { return json(res, { error: e.message }, 400); }
  }

  /* ---------- EXPORT CSV UNTUK SPREADSHEET ---------- */
  if (url === '/api/export') {
    if (!isAuth(req)) return json(res, { error: 'Belum login' }, 401);
    const d = db.get();
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const jenis = q.get('jenis') || 'transaksi';
    const dari = q.get('dari') || '';
    const sampai = q.get('sampai') || '';
    let rows = [];
    let nama = 'laporan';
    if (jenis === 'transaksi') {
      nama = 'transaksi';
      rows = [['No Nota','Waktu','Kasir','Metode','Status','Menu','Isi Mix','Qty','Harga','HPP','Subtotal','Laba','Total','Bayar','Kembalian']];
      for (const t of d.transaksi) {
        const tgl = new Date(t.waktu);
        if (dari && tgl < new Date(dari)) continue;
        if (sampai && tgl > new Date(sampai + 'T23:59:59')) continue;
        for (const it of t.items) {
          rows.push([t.no_nota, t.waktu, t.kasir, t.metode, t.refunded ? 'Refund' : 'Lancar', it.nama, it.mix || '', it.qty, it.harga, it.hpp || 0,
            it.harga * it.qty, (it.harga - (it.hpp || 0)) * it.qty, t.total, t.bayar, t.kembalian]);
        }
      }
    } else if (jenis === 'ringkasan') {
      nama = 'ringkasan-menu';
      rows = [['Menu','Kategori','Terjual','Omzet','HPPtotal','Laba Kotor','Margin %','Stok']];
      for (const m of d.menu) {
        let qty = 0;
        for (const t of d.transaksi) {
          if (t.refunded) continue;
          for (const it of t.items) if (it.menu_id === m.id) qty += Number(it.qty);
        }
        const hpp = hppOf(m);
        const omzet = qty * Number(m.harga);
        const laba = omzet - qty * hpp;
        rows.push([m.nama, m.kategori, qty, omzet, qty * hpp, laba,
          m.harga ? Math.round(laba / omzet * 100) || 0 : 0, m.stok ?? '']);
      }
    } else if (jenis === 'menu') {
      nama = 'master-menu';
      rows = [['Nama','Kategori','Harga Jual','HPP','Laba','Margin %','Status','Stok','Foto']];
      for (const m of d.menu) {
        const hpp = hppOf(m);
        rows.push([m.nama, m.kategori, m.harga, hpp, m.harga - hpp,
          m.harga ? Math.round((m.harga - hpp) / m.harga * 100) : 0,
          m.habis ? 'Habis' : 'Tersedia', m.stok ?? '', m.foto || '']);
      }
    } else if (jenis === 'resep') {
      nama = 'rincian-resep';
      rows = [['Menu','Bahan','Qty','Satuan','Harga Satuan','Subtotal HPP']];
      for (const m of d.menu) for (const r of (m.resep || [])) {
        rows.push([m.nama, r.nama || '', r.qty, r.satuan || '', Number(r.harga) || 0,
          Number(r.qty) * (Number(r.harga) || 0)]);
      }
    } else if (jenis === 'biaya') {
      nama = 'biaya-karyawan';
      rows = [['Jenis','Nama','Jumlah','Periode','Per Bulan']];
      for (const b of (d.settings.biaya_bulanan || [])) {
        rows.push(['Biaya', b.nama || '', Number(b.jumlah) || 0, b.periode || 'bulanan',
          (Number(b.jumlah) || 0) / (b.periode === 'tahunan' ? 12 : 1)]);
      }
      for (const k of (d.settings.karyawan || [])) {
        rows.push(['Karyawan', k.nama || '', Number(k.gaji) || 0, 'bulanan', Number(k.gaji) || 0]);
      }
    } else if (jenis === 'target') {
      nama = 'target-laba';
      const s = d.settings || {};
      const biayaBulanan = (s.biaya_bulanan || []).reduce((a,b) => a + (Number(b.jumlah)||0) / (b.periode === 'tahunan' ? 12 : 1), 0);
      const gaji = (s.karyawan || []).reduce((a,k) => a + (Number(k.gaji)||0), 0);
      const biaya = biayaBulanan + gaji || Number(s.target_biaya || 0);
      const laba = Number(s.target_laba || 0);
      const pajak = Number(s.pajak || 0);
      const aktif = d.menu.filter(m => m.aktif !== false && Number(m.harga) > 0);
      const margin = aktif.length
        ? aktif.reduce((a,m) => a + (Number(m.harga) - hppOf(m)) / Number(m.harga), 0) / aktif.length
        : 0.4;
      const omzet = (laba + biaya) / Math.max(0.01, margin - pajak / 100);
      const hargaRata = aktif.length ? aktif.reduce((a,m) => a + Number(m.harga), 0) / aktif.length : 1;
      const pcs = omzet / hargaRata;
      const hari = Math.max(1, Number(s.hari_buka || 30));
      rows = [
        ['Keterangan','Nilai'],
        ['Target laba bersih / bulan', laba],
        ['Biaya tetap / bulan', biaya],
        ['Margin rata-rata (%)', Math.round(margin * 100)],
        ['Pajak UMKM (%)', pajak],
        ['Omzet target / bulan', Math.round(omzet)],
        ['Omzet target / hari', Math.round(omzet / hari)],
        ['Estimasi penjualan / bulan (pcs)', Math.round(pcs)],
        ['Estimasi penjualan / hari (pcs)', Math.round(pcs / hari)],
        ['Laba per pcs rata-rata', Math.round(omzet * margin / Math.max(1,pcs))]
      ];
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nama}.csv"`);
    return res.end(csv(rows));
  }

  /* ---------- STATIC ---------- */
  let filePath;
  if (url === '/admin' || url === '/admin/') filePath = path.join(PUBLIC, 'admin', 'index.html');
  else filePath = path.join(PUBLIC, url === '/' ? 'index.html' : url);

  if (!filePath.startsWith(PUBLIC)) { res.statusCode = 403; res.end('Forbidden'); return; }
  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('Sunday Breakfast running at http://localhost:' + PORT);
  console.log('Admin panel: http://localhost:' + PORT + '/admin');
});
