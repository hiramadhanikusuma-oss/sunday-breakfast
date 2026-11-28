const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(salt + ':' + pin).digest('hex');
}

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function hppAwal(m) {
  if (m.is_mix) return 13200;
  const n = (m.nama || '').toLowerCase();
  if (m.kategori === 'Lumpia') return 2200;
  if (m.kategori === 'Batagor') return n.includes('keju') ? 9000 : 8000;
  if (m.kategori === 'Balls') return n.includes('bomb') ? 2500 : 6000;
  if (n.includes('dirty') || n.includes('manuka')) return 5000;
  if (n.includes('mineral')) return 2000;
  if (n.includes('coca')) return 3500;
  if (n.includes('teh')) return 2500;
  return Math.round(Number(m.harga || 0) * 0.45);
}

function stokAwal(m) {
  if (m.kategori === 'Drinks') return 24;
  if (m.kategori === 'Batagor' || m.kategori === 'Balls') return 16;
  if (m.is_mix) return 12;
  return 30;
}

function resepAwal(m) {
  const R = (nama, qty, satuan, harga) => ({ nama, qty, satuan, harga });
  const n = (m.nama || '').toLowerCase();
  if (m.is_mix) return [R('Lumpia ready (1 pcs)', 6, 'pcs', 2200)];
  if (m.kategori === 'Lumpia') {
    const isi = n.includes('bigmac') ? 'Isian BigMac' : n.includes('tuna') ? 'Isian tuna mayo'
      : n.includes('cheezy') ? 'Ayam + cream cheese' : n.includes('spicy') ? 'Ayam pedas'
      : n.includes('choco') ? 'Pisang + coklat' : 'Pisang + matcha';
    return [R('Kulit lumpia', 1, 'lembar', 1200), R(isi, 1, 'porsi', 800), R('Minyak & bumbu', 1, 'porsi', 200)];
  }
  if (m.kategori === 'Batagor') {
    const kuah = n.includes('kuah') ? R(n.includes('keju') ? 'Kuah keju' : 'Kuah bening', 1, 'porsi', 1000) : R('Bumbu kacang', 1, 'porsi', 1000);
    return [R('Ikan/ayam giling', 1, 'porsi', 5000), R('Tepung & bumbu', 1, 'porsi', 2000), kuah,
      ...(n.includes('keju') ? [R('Keju', 1, 'porsi', 1000)] : [])];
  }
  if (m.kategori === 'Balls') {
    return n.includes('bomb')
      ? [R('Ayam giling', 1, 'porsi', 1200), R('Quick melt cheese', 1, 'porsi', 800), R('Tepung & minyak', 1, 'porsi', 500)]
      : [R('Keju mozzarella', 1, 'porsi', 3000), R('Adonan & tepung', 1, 'porsi', 2000), R('Minyak', 1, 'porsi', 1000)];
  }
  if (n.includes('dirty') || n.includes('manuka')) return [R('Cola / berry', 1, 'gelas', 3500), R('Susu kental / madu', 1, 'porsi', 1000), R('Es & gelas', 1, 'porsi', 500)];
  if (n.includes('mineral')) return [R('Air mineral', 1, 'botol', 1800), R('Es & gelas', 1, 'porsi', 200)];
  if (n.includes('coca')) return [R('Coca Cola', 1, 'kaleng', 3000), R('Es & gelas', 1, 'porsi', 500)];
  if (n.includes('teh')) return [R('Teh pucuk', 1, 'botol', 2200), R('Es & gelas', 1, 'porsi', 300)];
  return [R('Bahan utama', 1, 'porsi', hppAwal(m))];
}

function normalisasiMenu(m) {
  m.nama = String(m.nama || '').replace(/\s*\(Ready\)\s*/gi, '').trim();
  if (m.unggulan === undefined) m.unggulan = false;
  if (m.stok === undefined || m.stok === null) m.stok = stokAwal(m);
  m.stok = Math.max(0, Number(m.stok) || 0);
  if (!Array.isArray(m.resep)) m.resep = resepAwal(m);
  m.resep.forEach(r => { r.harga = Number(r.harga) || 0; r.qty = Number(r.qty) || 0; });
  m.hpp = m.resep.length ? m.resep.reduce((a, r) => a + r.qty * r.harga, 0) : (Number(m.hpp) || 0);
}

function seed() {
  const salt = crypto.randomBytes(8).toString('hex');
  const P = '/assets/produk/';
  const data = {
    settings: {
      nama_toko: 'SUNDAY BREAKFAST',
      tagline: 'A Little Taste To Take Home',
      alamat: 'Jl. Cilinaya, Cilinaya, Kec. Cakranegara, Kota Mataram, NTB 83239',
      maps_url: 'https://maps.app.goo.gl/snt9L8pg4YCXPZhb9',
      instagram: '@sundaybreakfast__',
      wa: '6281236677794',
      logo: '/assets/logo-icon.png',
      warna_utama: '#0533A8',
      warna_aksen: '#F7E018',
      printer: {
        nama: '', alamat: '', lebar: 58, autoprint: true,
        logo: '/assets/logo-icon.png',
        header: 'SUNDAY BREAKFAST — Mataram, NTB',
        footer: 'Terima kasih sudah pesan di Sunday Breakfast!',
        drive_url: '', drive_email: 'hi.ramadhanikusuma@gmail.com'
      },
      kertas_nota: '58mm',
      markup_default: 60,
      susut: 5,
      pajak: 0.5,
      target_hpp: 60,
      hari_buka: 30,
      target_laba: 3500000,
      target_biaya: 3000000,
      biaya_bulanan: [
        { nama: 'Air', jumlah: 250000, periode: 'bulanan' },
        { nama: 'Listrik', jumlah: 400000, periode: 'bulanan' },
        { nama: 'Wifi / Internet', jumlah: 150000, periode: 'bulanan' },
        { nama: 'Keamanan & kebersihan', jumlah: 250000, periode: 'bulanan' },
        { nama: 'Sewa ruko', jumlah: 15000000, periode: 'tahunan' },
        { nama: 'Penyusutan peralatan', jumlah: 200000, periode: 'bulanan' },
        { nama: 'Promosi & ongkir', jumlah: 150000, periode: 'bulanan' }
      ],
      karyawan: [
        { nama: 'Karyawan 1', gaji: 1000000 },
        { nama: 'Karyawan 2', gaji: 800000 }
      ],
      fixed_costs: [],
      pin_salt: salt,
      pin_hash: hashPin('800008', salt),
      pin_admin: '800008'
    },
    bahan: [],
    menu: [
      { id: uid('m'), nama: 'Lumpia BigMac', kategori: 'Lumpia', harga: 5000, foto: P + 'BIGMAC.jpg', ikon: '', deskripsi: 'Lumpia dengan isi Daging, Macaroni, Bawang Bombai dan dilumuri saos BigMac', aktif: true, habis: false, stok: 30, resep: [] },
      { id: uid('m'), nama: 'Lumpia TastyTuna', kategori: 'Lumpia', harga: 5000, foto: P + 'TASTY TUNA.jpg', ikon: '', deskripsi: 'Kombinasi tuna, jagung, dan saus mayo yang unik dan creamy banget!', aktif: true, habis: false, stok: 30, resep: [] },
      { id: uid('m'), nama: 'Lumpia CheezyMelt', kategori: 'Lumpia', harga: 5000, foto: P + 'Cheezy melt.jpg', ikon: '', deskripsi: 'Perpaduan ayam dan cream cheese yang gurih dan creamy', aktif: true, habis: false, stok: 30, resep: [] },
      { id: uid('m'), nama: 'Lumpia Spicy ChickenRoll', kategori: 'Lumpia', harga: 5000, foto: P + 'Spicy Chicken Roll.jpg', ikon: '', deskripsi: 'Lumpia renyah berisi ayam suwir pedas khas, dibalut bumbu rempah yang menggigit!', aktif: true, habis: false, stok: 30, resep: [] },
      { id: uid('m'), nama: 'Lumpia Choco Melt', kategori: 'Lumpia', harga: 5000, foto: P + 'ChocoMelt.jpg', ikon: '', deskripsi: 'Lumpia crispy dengan isian pisang lembut dan lelehan coklat lumer melimpah', aktif: true, habis: false, stok: 30, resep: [] },
      { id: uid('m'), nama: 'Lumpia Matcha Lava', kategori: 'Lumpia', harga: 5000, foto: P + 'Matcha Lava.jpg', ikon: '', deskripsi: 'Lumpia crispy dengan isian pisang lembut dan lelehan matcha creamy yang lumer manis', aktif: true, habis: false, stok: 30, resep: [] },
      { id: uid('m'), nama: 'Lumpia Frozen — Mix 6 pcs', kategori: 'Lumpia Frozen', harga: 27000, foto: P + 'frozen-mix.jpg', ikon: '🧊', deskripsi: 'Isi 6 lumpia beku, BEBAS pilih rasa apa aja (campur boleh)! Pilih saat tambah ke keranjang.', aktif: true, habis: false, stok: 12, resep: [], is_mix: true },
      { id: uid('m'), nama: 'Batagor Goreng', kategori: 'Batagor', harga: 20000, foto: P + 'BATAGOR GORENG.png', ikon: '', deskripsi: 'Renyah di luar, gurih & creamy di dalam, lengkap dengan bumbu kacang.', aktif: true, habis: false, stok: 16, resep: [] },
      { id: uid('m'), nama: 'Batagor Kuah', kategori: 'Batagor', harga: 20000, foto: P + 'batagor kuah.png', ikon: '', deskripsi: 'Batagor renyah dengan kuah bening gurih dan isian lembut yang nikmat.', aktif: true, habis: false, stok: 16, resep: [] },
      { id: uid('m'), nama: 'Batagor Kuah Keju', kategori: 'Batagor', harga: 23000, foto: P + 'batahor kuah.jpg', ikon: '', deskripsi: 'Batagor crispy dengan kuah keju creamy, gurih, dan chili oil pedas yang bikin nagih', aktif: true, habis: false, stok: 16, resep: [] },
      { id: uid('m'), nama: 'Cheesy Ball', kategori: 'Balls', harga: 15000, foto: P + 'Cheesy Ball.jpg', ikon: '', deskripsi: 'Camilan bola goreng dengan isian keju lembut dan gurih', aktif: true, habis: false, stok: 16, resep: [] },
      { id: uid('m'), nama: 'Chicken Cheese Bomb', kategori: 'Balls', harga: 5000, foto: P + 'Chicken Cheesy Bomb.jpg', ikon: '', deskripsi: 'Perpaduan ayam juicy dan quick melt cheese dalam balutan crispy renyah', aktif: true, habis: false, stok: 16, resep: [] },
      { id: uid('m'), nama: 'Dirty Cola', kategori: 'Drinks', harga: 15000, foto: '', ikon: '🥤', deskripsi: 'Cola dengan susu kental manis', aktif: true, habis: false, stok: 24, resep: [] },
      { id: uid('m'), nama: 'Berry Manuka', kategori: 'Drinks', harga: 15000, foto: '', ikon: '🫐', deskripsi: 'Minuman berry dengan madu manuka', aktif: true, habis: false, stok: 24, resep: [] },
      { id: uid('m'), nama: 'Air Mineral', kategori: 'Drinks', harga: 5000, foto: '', ikon: '💧', deskripsi: 'Air mineral dingin', aktif: true, habis: false, stok: 24, resep: [] },
      { id: uid('m'), nama: 'Coca Cola', kategori: 'Drinks', harga: 7000, foto: '', ikon: '🥤', deskripsi: 'Coca Cola dingin', aktif: true, habis: false, stok: 24, resep: [] },
      { id: uid('m'), nama: 'Teh Pucuk', kategori: 'Drinks', harga: 6000, foto: '', ikon: '🍵', deskripsi: 'Teh pucuk dingin', aktif: true, habis: false, stok: 24, resep: [] }
    ],
    transaksi: [],
    pesanan: [],
    counter_nota: 0,
    counter_pesanan: 0
  };
  const unggulan = ['Lumpia BigMac','Lumpia Frozen — Mix 6 pcs','Batagor Goreng','Cheesy Ball'];
  data.menu.forEach(m => {
    normalisasiMenu(m);
    m.unggulan = unggulan.includes(m.nama);
    if (!m.resep.length) m.resep = resepAwal(m);
    m.hpp = m.resep.reduce((a,r) => a + r.qty * r.harga, 0);
  });
  return data;
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    let ubah = false;
    if (!db.settings) { db.settings = seed().settings; ubah = true; }
    if (!db.settings.printer) { db.settings.printer = seed().settings.printer; ubah = true; }
    for (const [k, v] of Object.entries(seed().settings.printer)) {
      if (db.settings.printer[k] === undefined) { db.settings.printer[k] = v; ubah = true; }
    }
    if (db.settings.printer.autoprint === false && db.settings.printer.nama === '') {
      db.settings.printer.autoprint = true; ubah = true;
    }
    if (!db.settings.printer.logo) { db.settings.printer.logo = '/assets/logo-icon.png'; ubah = true; }
    if (!db.settings.printer.header) { db.settings.printer.header = 'SUNDAY BREAKFAST — Mataram, NTB'; ubah = true; }
    if (!Array.isArray(db.settings.biaya_bulanan)) { db.settings.biaya_bulanan = seed().settings.biaya_bulanan; ubah = true; }
    if (!Array.isArray(db.settings.karyawan)) { db.settings.karyawan = seed().settings.karyawan; ubah = true; }
    if (!Array.isArray(db.bahan)) { db.bahan = []; ubah = true; }
    if (!Array.isArray(db.transaksi)) { db.transaksi = []; ubah = true; }
    if (!Array.isArray(db.pesanan)) { db.pesanan = []; ubah = true; }
    if (typeof db.counter_pesanan !== 'number') { db.counter_pesanan = 0; ubah = true; }
    if (!Array.isArray(db.menu)) { db.menu = []; ubah = true; }
    for (const m of db.menu) {
      const sebelum = JSON.stringify(m);
      normalisasiMenu(m);
      if (JSON.stringify(m) !== sebelum) ubah = true;
    }
    const dflt = seed().settings;
    for (const k of ['target_hpp','susut','pajak','hari_buka','target_laba','target_biaya']) {
      if (db.settings[k] === undefined) { db.settings[k] = dflt[k]; ubah = true; }
    }
    if (db.settings.target_biaya === undefined || db.settings.target_biaya === null) {
      db.settings.target_biaya = (db.settings.fixed_costs || []).reduce((a,x) => a + Number(x[1]||0), 0);
      ubah = true;
    }
    if (typeof db.counter_nota !== 'number') { db.counter_nota = 0; ubah = true; }
    if (ubah) save();
  } else {
    db = seed();
    save();
  }
  return db;
}

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function get() { return db; }

module.exports = { load, save, get, hashPin, uid, resepAwal, stokAwal, hppAwal, seed };