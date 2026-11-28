/* Bangun backend admin online: Google Apps Script + Google Sheet sebagai database.
   Hasil: folder apps-script/ (Code.gs + appsscript.json) untuk di-deploy sebagai Web App. */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'apps-script');
const PUBLIC_BASE = 'https://sunday-breakfast.vercel.app';

const index = fs.readFileSync(path.join(ROOT, 'public', 'admin', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'admin', 'admin.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'admin', 'admin.js'), 'utf8');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));

if (js.includes('</script>') || css.includes('</style>')) {
  throw new Error('Aset admin mengandung tag penutup yang tidak boleh di-inline');
}

let html = index
  .replace('<link rel="stylesheet" href="/admin/admin.css">', () => '<style>\n' + css + '\n</style>')
  .replace(/<script src="\/admin\/admin\.js"><\/script>/g, '')
  .replace(/href="\/assets\//g, 'href="' + PUBLIC_BASE + '/assets/')
  .replace(/src="\/assets\//g, 'src="' + PUBLIC_BASE + '/assets/')
  .replace('</body>', () =>
    '<script>window.CONFIG = { appsScript:true, publicBase:' + JSON.stringify(PUBLIC_BASE) + ',' +
    ' apiBase:"__SCRIPT_URL__", driveUrl:"__SCRIPT_URL__" };</script>\n' +
    '<script>(function(){\n' + js + '\n})();</script>\n</body>');

const source = `/* =========================================================
   SUNDAY BREAKFAST — ADMIN ONLINE
   Database: Google Sheet "Sunday Breakfast — Database"
   Deploy: Web app, Execute as Me, Who has access Anyone
   Dibuat otomatis oleh build-apps-script.js — jangan edit manual.
   ========================================================= */

var ADMIN_HTML = __ADMIN_HTML__;
var SEED_JSON = __SEED_JSON__;
var NAMA_SHEET = 'db';
var NAMA_FOLDER = 'Sunday Breakfast — Laporan';

function doGet(e) {
  var p = (e && e.parameter) || {};
  var r = p.r || '';
  if (r === '/api/admin/session') return json_({ auth: cekToken_(p.token) });
  if (r === '/api/public') {
    var pub = bacaDB_();
    var dataPub = { settings: settingsPublik_(pub.settings), menu: pub.menu };
    var cb = String(p.callback || '');
    if (cb && /^[A-Za-z_$][\\w$]*$/.test(cb)) return teks_(cb + '(' + JSON.stringify(dataPub) + ');');
    return json_(dataPub);
  }
  if (r.indexOf('/api/export') === 0) {
    if (!cekToken_(p.token)) return json_({ error: 'Belum login' });
    var q = parseQuery_(r.split('?')[1] || '');
    return teks_(eksporCSV_(bacaDB_(), q.jenis || 'transaksi', q.dari || '', q.sampai || ''));
  }
  if (r.indexOf('/api/result') === 0) {
    var rid = parseQuery_(r.split('?')[1] || '').rid || p.rid || '';
    var prop = PropertiesService.getScriptProperties();
    var val = prop.getProperty('res_' + rid);
    if (!val) return json_({ error: 'Hasil tidak ditemukan' });
    prop.deleteProperty('res_' + rid);
    return teks_(val);
  }
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (err) {}
  return HtmlService.createHtmlOutput(ADMIN_HTML.replace(/__SCRIPT_URL__/g, url))
    .setTitle('Sunday Breakfast — Admin')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var rid = '', out = {};
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var p = (e && e.parameter) || {};
    rid = b.rid || p.rid || '';
    out = prosesPost_(b, p);
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  if (rid) {
    try { PropertiesService.getScriptProperties().setProperty('res_' + rid, JSON.stringify(out)); } catch (e) {}
  }
  /* Web app selalu meng-redirect POST; hasil diambil lewat GET /api/result?rid=... */
  return json_({ ok: true });
}
function prosesPost_(b, p) {
  var r = b.r || p.r || '';
  var token = b.token || p.token || '';
  if (r === '/api/admin/session') return { auth: cekToken_(token) };
  if (r === '/api/admin/login') return login_(b.pin);
  if (r === 'drive') return simpanDrive_(b);
  if (!cekToken_(token)) return { error: 'Belum login' };
  if (r === '/api/admin/logout') return { ok: true };
  if (r === '/api/admin/data') return bacaDB_();
  if (r === '/api/admin/save') return simpan_(b);
  if (r === '/api/admin/upload') return unggah_(b);
  if (r === '/api/admin/transaksi') return transaksi_(b);
  if (r === '/api/admin/transaksi/refund') return refund_(b);
  if (r === '/api/admin/transaksi/hapus') return hapusReceipt_(b);
  return { error: 'Rute tidak dikenal: ' + r };
}

/* ---------- UTIL ---------- */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function teks_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}
function parseQuery_(q) {
  var out = {};
  String(q || '').split('&').forEach(function (bag) {
    if (!bag) return;
    var pas = bag.split('=');
    try { out[decodeURIComponent(pas[0])] = decodeURIComponent((pas[1] || '').replace(/\\+/g, ' ')); } catch (e) {}
  });
  return out;
}
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))
    .map(function (x) { return ('0' + ((x & 0xFF).toString(16))).slice(-2); }).join('');
}
/* Data untuk website pelanggan: jangan pernah kirim kredensial admin. */
function settingsPublik_(s) {
  var out = Object.assign({}, s || {});
  ['pin_hash', 'pin_salt', 'pin_admin'].forEach(function (k) { delete out[k]; });
  return out;
}
function cekToken_(token) {
  if (!token) return false;
  var p = PropertiesService.getScriptProperties();
  return token === p.getProperty('sunday_token') && Date.now() < Number(p.getProperty('sunday_exp') || 0);
}
function login_(pin) {
  var s = bacaDB_().settings || {};
  var pinBenar = s.pin_hash
    ? sha256_((s.pin_salt || '') + ':' + String(pin || '')) === s.pin_hash
    : String(s.pin_admin || '') === String(pin || '');
  if (!pinBenar) return { ok: false, error: 'PIN salah' };
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    sunday_token: token,
    sunday_exp: String(Date.now() + 12 * 60 * 60 * 1000)
  });
  return { ok: true, token: token };
}
function csv_(rows) {
  return '\\uFEFF' + rows.map(function (row) {
    return row.map(function (v) {
      var s = String(v === null || v === undefined ? '' : v);
      return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\\r\\n');
}
function hppOf_(m) {
  var resep = Array.isArray(m.resep) ? m.resep : [];
  if (resep.length) return resep.reduce(function (a, r) {
    return a + (Number(r.qty) || 0) * (Number(r.harga) || 0);
  }, 0);
  return Number(m.hpp) || 0;
}
function kembalikanStok_(d, trx) {
  function tambah(id, jumlah) {
    var m = (d.menu || []).find(function (x) { return x.id === id; });
    if (!m || m.stok === null || m.stok === undefined) return;
    m.stok = Number(m.stok) + Number(jumlah);
    if (m.stok > 0) m.habis = false;
  }
  (trx.items || []).forEach(function (it) {
    tambah(it.menu_id, it.qty);
    if (it.pilihan && typeof it.pilihan === 'object') {
      Object.keys(it.pilihan).forEach(function (id) {
        tambah(id, Number(it.pilihan[id]) * Number(it.qty));
      });
    }
  });
}

/* ---------- DATABASE DI GOOGLE SHEET ---------- */
function initDb_() {
  var sh = sheetDB_();
  var id = PropertiesService.getScriptProperties().getProperty('sunday_sheet_id');
  return { ok: true, spreadsheet_id: id, url: 'https://docs.google.com/spreadsheets/d/' + id + '/edit', sheet: sh.getName() };
}
function sheetDB_() {
  var prop = PropertiesService.getScriptProperties();
  var id = prop.getProperty('sunday_sheet_id');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('Sunday Breakfast — Database');
  if (!id) prop.setProperty('sunday_sheet_id', ss.getId());
  var sh = ss.getSheetByName(NAMA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(NAMA_SHEET);
    var seed = JSON.parse(SEED_JSON);
    var baris = [['collection', 'id', 'json']];
    baris.push(['meta', 'counter_nota', String(seed.counter_nota || 0)]);
    baris.push(['settings', 'all', JSON.stringify(seed.settings || {})]);
    baris.push(['settings', 'pin_admin', String(seed.settings && seed.settings.pin_admin || 'sunday123')]);
    (seed.bahan || []).forEach(function (x, i) { baris.push(['bahan', x.id || ('bahan_' + i), JSON.stringify(x)]); });
    (seed.menu || []).forEach(function (x, i) { baris.push(['menu', x.id || ('menu_' + i), JSON.stringify(x)]); });
    (seed.transaksi || []).forEach(function (x, i) { baris.push(['transaksi', x.id || ('trx_' + i), JSON.stringify(x)]); });
    sh.getRange(1, 1, baris.length, 3).setValues(baris);
  }
  return sh;
}
function bacaDB_() {
  var values = sheetDB_().getDataRange().getValues();
  var out = { settings: {}, menu: [], bahan: [], transaksi: [], counter_nota: 0 };
  for (var i = 1; i < values.length; i++) {
    var col = values[i][0], id = values[i][1], teks = values[i][2];
    if (!col) continue;
    if (col === 'meta') {
      if (id === 'counter_nota') out.counter_nota = Number(teks) || 0;
      continue;
    }
    if (col === 'settings' && id === 'pin_admin') {
      out.settings.pin_admin = String(teks || '');
      continue;
    }
    try {
      var v = JSON.parse(teks);
      if (col === 'settings') out.settings = Object.assign(out.settings, v);
      else if (col === 'bahan') out.bahan.push(v);
      else if (col === 'menu') out.menu.push(v);
      else if (col === 'transaksi') out.transaksi.push(v);
    } catch (e) {}
  }
  /* Sheet lama belum punya baris pin_admin: tambahkan sekali saat dibaca. */
  if (!out.settings.pin_admin) {
    out.settings.pin_admin = 'sunday123';
    try {
      var propPin = PropertiesService.getScriptProperties();
      if (!propPin.getProperty('pin_admin_tersimpan')) {
        tulisDB_(out);
        propPin.setProperty('pin_admin_tersimpan', '1');
      }
    } catch (e) {}
  }
  return out;
}
function tulisDB_(d) {
  var baris = [['collection', 'id', 'json']];
  baris.push(['meta', 'counter_nota', String(d.counter_nota || 0)]);
  baris.push(['settings', 'all', JSON.stringify(d.settings || {})]);
  baris.push(['settings', 'pin_admin', String(d.settings && d.settings.pin_admin || 'sunday123')]);
  (d.bahan || []).forEach(function (x, i) { baris.push(['bahan', x.id || ('bahan_' + i), JSON.stringify(x)]); });
  (d.menu || []).forEach(function (x, i) { baris.push(['menu', x.id || ('menu_' + i), JSON.stringify(x)]); });
  (d.transaksi || []).forEach(function (x, i) { baris.push(['transaksi', x.id || ('trx_' + i), JSON.stringify(x)]); });
  var sh = sheetDB_();
  sh.clearContents();
  sh.getRange(1, 1, baris.length, 3).setValues(baris);
  return true;
}

/* ---------- API ADMIN ---------- */
function simpan_(b) {
  var d = bacaDB_();
  if (b.settings && typeof b.settings === 'object') {
    var boleh = ['nama_toko', 'tagline', 'alamat', 'maps_url', 'instagram', 'wa', 'logo',
      'warna_utama', 'warna_aksen', 'kertas_nota', 'hari_buka', 'printer',
      'biaya_bulanan', 'karyawan', 'target_laba', 'target_biaya', 'target_hpp', 'susut', 'pajak'];
    boleh.forEach(function (k) {
      if (b.settings[k] !== undefined) d.settings[k] = b.settings[k];
    });
  }
  if (b.pin_baru) {
    if (String(b.pin_baru).length < 4) return { error: 'PIN minimal 4 karakter' };
    d.settings.pin_hash = sha256_((d.settings.pin_salt || '') + ':' + String(b.pin_baru));
    d.settings.pin_admin = String(b.pin_baru); // terlihat di Sheet db → settings → pin_admin
  }
  if (Array.isArray(b.menu)) d.menu = b.menu;
  if (Array.isArray(b.bahan)) d.bahan = b.bahan;
  if (Array.isArray(b.transaksi)) d.transaksi = b.transaksi;
  if (typeof b.counter_nota === 'number') d.counter_nota = b.counter_nota;
  tulisDB_(d);
  return { ok: true };
}
function unggah_(b) {
  var m = /^data:image\\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(b.data || '');
  if (!m) return { error: 'Format gambar tidak didukung' };
  var ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 8 * 1024 * 1024) return { error: 'Gambar maksimal 8 MB' };
  var nama = String(b.name || 'gambar').toLowerCase()
    .replace(/\\.(png|jpe?g|webp)$/i, '').replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'gambar';
  var file = DriveApp.createFile(Utilities.newBlob(bytes, 'image/' + ext, nama + '-' + Date.now() + '.' + ext));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { ok: true, url: 'https://drive.google.com/uc?export=view&id=' + file.getId() };
}
function transaksi_(b) {
  var d = bacaDB_();
  if (!Array.isArray(b.items) || !b.items.length) return { error: 'Keranjang kosong' };
  d.counter_nota = (d.counter_nota || 0) + 1;
  var trx = {
    id: 'trx_' + Date.now().toString(36) + '_' + Utilities.getUuid().slice(0, 5),
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
  function kurangi(id, jumlah) {
    var m = (d.menu || []).find(function (x) { return x.id === id; });
    if (!m || m.stok === null || m.stok === undefined) return;
    m.stok = Math.max(0, Number(m.stok) - Number(jumlah));
    if (m.stok === 0) m.habis = true;
  }
  trx.items.forEach(function (it) {
    kurangi(it.menu_id, it.qty);
    if (it.pilihan && typeof it.pilihan === 'object') {
      Object.keys(it.pilihan).forEach(function (id) {
        kurangi(id, Number(it.pilihan[id]) * Number(it.qty));
      });
    }
  });
  tulisDB_(d);
  return { ok: true, transaksi: trx };
}
function refund_(b) {
  var d = bacaDB_();
  var trx = (d.transaksi || []).find(function (x) { return x.id === b.id; });
  if (!trx) return { error: 'Receipt tidak ditemukan' };
  if (trx.refunded) return { error: 'Receipt ini sudah direfund' };
  kembalikanStok_(d, trx);
  trx.refunded = true;
  trx.refund_at = new Date().toISOString();
  trx.refund_alasan = String(b.alasan || '').slice(0, 200);
  tulisDB_(d);
  return { ok: true, transaksi: trx };
}
function hapusReceipt_(b) {
  var d = bacaDB_();
  var i = (d.transaksi || []).findIndex(function (x) { return x.id === b.id; });
  if (i < 0) return { error: 'Receipt tidak ditemukan' };
  var trx = d.transaksi[i];
  if (!trx.refunded) kembalikanStok_(d, trx);
  d.transaksi.splice(i, 1);
  tulisDB_(d);
  return { ok: true };
}

/* ---------- EKSPOR CSV ---------- */
function eksporCSV_(d, jenis, dari, sampai) {
  var rows = [];
  if (jenis === 'transaksi') {
    rows = [['No Nota', 'Waktu', 'Kasir', 'Metode', 'Status', 'Menu', 'Isi Mix', 'Qty', 'Harga', 'HPP', 'Subtotal', 'Laba', 'Total', 'Bayar', 'Kembalian']];
    (d.transaksi || []).forEach(function (t) {
      var tgl = new Date(t.waktu);
      if (dari && tgl < new Date(dari)) return;
      if (sampai && tgl > new Date(sampai + 'T23:59:59')) return;
      (t.items || []).forEach(function (it) {
        rows.push([t.no_nota, t.waktu, t.kasir, t.metode, t.refunded ? 'Refund' : 'Lancar',
          it.nama, it.mix || '', it.qty, it.harga, it.hpp || 0, it.harga * it.qty,
          (it.harga - (it.hpp || 0)) * it.qty, t.total, t.bayar, t.kembalian]);
      });
    });
  } else if (jenis === 'ringkasan') {
    rows = [['Menu', 'Kategori', 'Terjual', 'Omzet', 'HPPtotal', 'Laba Kotor', 'Margin %', 'Stok']];
    (d.menu || []).forEach(function (m) {
      var qty = 0;
      (d.transaksi || []).forEach(function (t) {
        if (t.refunded) return;
        (t.items || []).forEach(function (it) { if (it.menu_id === m.id) qty += Number(it.qty); });
      });
      var hpp = hppOf_(m), omzet = qty * Number(m.harga), laba = omzet - qty * hpp;
      rows.push([m.nama, m.kategori, qty, omzet, qty * hpp, laba,
        omzet ? Math.round(laba / omzet * 100) : 0, m.stok === undefined ? '' : m.stok]);
    });
  } else if (jenis === 'menu') {
    rows = [['Nama', 'Kategori', 'Harga Jual', 'HPP', 'Laba', 'Margin %', 'Status', 'Stok', 'Foto']];
    (d.menu || []).forEach(function (m) {
      var hpp = hppOf_(m);
      rows.push([m.nama, m.kategori, m.harga, hpp, Number(m.harga) - hpp,
        m.harga ? Math.round((Number(m.harga) - hpp) / Number(m.harga) * 100) : 0,
        m.habis ? 'Habis' : 'Tersedia', m.stok === undefined ? '' : m.stok, m.foto || '']);
    });
  } else if (jenis === 'resep') {
    rows = [['Menu', 'Bahan', 'Qty', 'Satuan', 'Harga Satuan', 'Subtotal HPP']];
    (d.menu || []).forEach(function (m) {
      (m.resep || []).forEach(function (r) {
        rows.push([m.nama, r.nama || '', r.qty, r.satuan || '', Number(r.harga) || 0,
          Number(r.qty) * (Number(r.harga) || 0)]);
      });
    });
  } else if (jenis === 'biaya') {
    rows = [['Jenis', 'Nama', 'Jumlah', 'Periode', 'Per Bulan']];
    ((d.settings || {}).biaya_bulanan || []).forEach(function (x) {
      rows.push(['Biaya', x.nama || '', Number(x.jumlah) || 0, x.periode || 'bulanan',
        (Number(x.jumlah) || 0) / (x.periode === 'tahunan' ? 12 : 1)]);
    });
    ((d.settings || {}).karyawan || []).forEach(function (x) {
      rows.push(['Karyawan', x.nama || '', Number(x.gaji) || 0, 'bulanan', Number(x.gaji) || 0]);
    });
  } else if (jenis === 'target') {
    var s = d.settings || {};
    var bulanan = (s.biaya_bulanan || []).reduce(function (a, x) {
      return a + (Number(x.jumlah) || 0) / (x.periode === 'tahunan' ? 12 : 1);
    }, 0);
    var gaji = (s.karyawan || []).reduce(function (a, x) { return a + (Number(x.gaji) || 0); }, 0);
    var biaya = bulanan + gaji || Number(s.target_biaya || 0);
    var laba = Number(s.target_laba || 0), pajak = Number(s.pajak || 0);
    var aktif = (d.menu || []).filter(function (m) { return m.aktif !== false && Number(m.harga) > 0; });
    var margin = aktif.length ? aktif.reduce(function (a, m) {
      return a + (Number(m.harga) - hppOf_(m)) / Number(m.harga);
    }, 0) / aktif.length : 0.4;
    var omzet = (laba + biaya) / Math.max(0.01, margin - pajak / 100);
    var rata = aktif.length ? aktif.reduce(function (a, m) { return a + Number(m.harga); }, 0) / aktif.length : 1;
    var pcs = omzet / rata, hari = Math.max(1, Number(s.hari_buka || 30));
    rows = [
      ['Keterangan', 'Nilai'],
      ['Target laba bersih / bulan', laba],
      ['Biaya tetap / bulan', biaya],
      ['Margin rata-rata (%)', Math.round(margin * 100)],
      ['Pajak UMKM (%)', pajak],
      ['Omzet target / bulan', Math.round(omzet)],
      ['Omzet target / hari', Math.round(omzet / hari)],
      ['Estimasi penjualan / bulan (pcs)', Math.round(pcs)],
      ['Estimasi penjualan / hari (pcs)', Math.round(pcs / hari)],
      ['Laba per pcs rata-rata', Math.round(omzet * margin / Math.max(1, pcs))]
    ];
  }
  return csv_(rows);
}

/* ---------- LAPORAN KE DRIVE ---------- */
function simpanDrive_(b) {
  var email = String(b.email || '').trim();
  var nama = String(b.name || 'Laporan').replace(/[^\\w\\s\\-—]/g, '').trim() || 'Laporan';
  var isi = '\\uFEFF' + String(b.csv || '');
  var root = DriveApp.getRootFolder();
  var cari = root.getFoldersByName(NAMA_FOLDER);
  var folder = cari.hasNext() ? cari.next() : root.createFolder(NAMA_FOLDER);
  var namaFile = nama + '.csv';
  var cariFile = folder.getFilesByName(namaFile);
  var file;
  if (cariFile.hasNext()) { file = cariFile.next(); file.setContent(isi); }
  else { file = folder.createFile(namaFile, isi, MimeType.CSV); }
  if (email) { try { folder.addEditor(email); } catch (e) {} }
  return { ok: true, url: file.getUrl(), nama: namaFile };
}
`;

const code = source
  .replace('__ADMIN_HTML__', () => JSON.stringify(html))
  .replace('__SEED_JSON__', () => JSON.stringify(JSON.stringify(seed)));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'Code.gs'), code);
fs.writeFileSync(path.join(OUT, 'appsscript.json'), JSON.stringify({
  timeZone: 'Asia/Makassar',
  dependencies: {},
  exceptionLogging: 'STACKDRIVER',
  runtimeVersion: 'V8',
  oauthScopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ],
  webapp: {
    executeAs: 'USER_DEPLOYING',
    access: 'ANYONE_ANONYMOUS'
  }
}, null, 2));

console.log('Backend online dibuat di apps-script/');
console.log('Admin HTML:', Math.round(html.length / 1024) + ' KB, seed menu:', (seed.menu || []).length);
