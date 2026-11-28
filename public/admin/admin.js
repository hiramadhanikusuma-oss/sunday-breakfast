/* ===== SUNDAY ADMIN — logika dashboard ===== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
let DB = null;

/* Mode online (Google Apps Script) atau server lokal */
const AS_MODE = !!(window.CONFIG && window.CONFIG.appsScript);
const PUBLIC_BASE = (window.CONFIG && window.CONFIG.publicBase) || 'https://sunday-breakfast.vercel.app';
function apiUrl(url) {
  if (!AS_MODE) return url;
  const base = (window.CONFIG && window.CONFIG.apiBase) || (location.origin + location.pathname);
  const token = localStorage.getItem('sunday_token') || '';
  return base + '?r=' + encodeURIComponent(url) + (token ? '&token=' + encodeURIComponent(token) : '');
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('buka');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('buka'), 2400);
}
const absolutUrl = u => (AS_MODE && u && String(u).charAt(0) === '/') ? PUBLIC_BASE + String(u) : u;
function normalisasiData(d) {
  if (!AS_MODE || !d || !d.menu) return d;
  (d.menu || []).forEach(m => { if (m.foto) m.foto = absolutUrl(m.foto); });
  if (d.settings) {
    if (d.settings.logo) d.settings.logo = absolutUrl(d.settings.logo);
    if (d.settings.printer && d.settings.printer.logo) d.settings.printer.logo = absolutUrl(d.settings.printer.logo);
  }
  return d;
}
function keUrlRelatif(v) {
  if (Array.isArray(v)) return v.map(keUrlRelatif);
  if (v && typeof v === 'object') {
    Object.keys(v).forEach(k => { v[k] = keUrlRelatif(v[k]); });
    return v;
  }
  if (typeof v === 'string' && v.indexOf(PUBLIC_BASE + '/') === 0) return v.slice(PUBLIC_BASE.length);
  return v;
}
async function api(url, opts) {
  if (AS_MODE && !opts) return postRaw(url, {});
  const r = await fetch(apiUrl(url), opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
  if (AS_MODE && d.token) { localStorage.setItem('sunday_token', d.token); simpanTokenNative(); }
  return normalisasiData(d);
}
/* Apps Script Web App selalu meng-redirect POST; kirim lewat POST lalu ambil hasil via GET /api/result */
async function postRaw(url, data) {
  const base = window.CONFIG.apiBase;
  const rid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const kirim = AS_MODE ? keUrlRelatif(JSON.parse(JSON.stringify(data || {}))) : (data || {});
  await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, kirim, {
      r: url, rid: rid, token: localStorage.getItem('sunday_token') || ''
    }))
  });
  const res = await fetch(base + '?r=' + encodeURIComponent('/api/result?rid=' + rid));
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw new Error(d.error || ('HTTP ' + res.status));
  if (d.token) { localStorage.setItem('sunday_token', d.token); simpanTokenNative(); }
  return normalisasiData(d);
}
const post = (url, data) => {
  if (AS_MODE) return postRaw(url, data);
  return api(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
};

/* ---------- AUTH ---------- */
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    await post('/api/admin/login', { pin: $('#pinInput').value });
    await masuk();
  } catch (err) { $('#loginErr').textContent = err.message; }
};
async function logout() {
  await post('/api/admin/logout', {});
  if (AS_MODE) localStorage.removeItem('sunday_token');
  simpanTokenNative();
  DB = null;
  updatePesananBadge([]);
  $('#appView').style.display = 'none';
  $('#loginView').style.display = 'grid';
  $('#pinInput').value = '';
}
$('#btnLogout').onclick = logout;
$('#btnLogout2').onclick = logout;

async function masuk() {
  try {
    simpanTokenNative();
    DB = await api('/api/admin/data');
    if (AS_MODE) {
      const absolut = u => (u && String(u).charAt(0) === '/') ? PUBLIC_BASE + String(u) : u;
      (DB.menu || []).forEach(m => { if (m.foto) m.foto = absolut(m.foto); });
      if (DB.settings) {
        if (DB.settings.logo) DB.settings.logo = absolut(DB.settings.logo);
        if (DB.settings.printer && DB.settings.printer.logo) DB.settings.printer.logo = absolut(DB.settings.printer.logo);
      }
    }
  } catch (e) { toast('Gagal memuat data: ' + e.message); return; }
  $('#loginView').style.display = 'none';
  $('#appView').style.display = 'block';
  seedPesananAwal();
  renderAll();
  bukaView('kasir');
  if (localStorage.getItem('sunday_pesanan_seed')) setTimeout(() => cekPesananBaru(false), 1200);
}

/* ---------- NAV ---------- */
const JUDUL = { dashboard:'Dashboard', kasir:'Kasir', menu:'Menu', hpp:'HPP',
  simulasi:'Simulasi Laba', laporan:'Insight', receipt:'History', pesanan:'Pesanan Masuk',
  toko:'Toko & Branding', upload:'Aset Foto', pengaturan:'Pengaturan' };
const navEl = $('#sbNav');
const navIndicator = $('#navIndicator');
function posisiIndikator() {
  if (!navEl || !navIndicator) return;
  const aktif = navEl.querySelector('button.aktif');
  if (!aktif) { navIndicator.style.opacity = '0'; return; }
  navIndicator.style.transform = 'translateY(' + (aktif.offsetTop + 5) + 'px)';
  navIndicator.style.height = Math.max(aktif.offsetHeight - 10, 16) + 'px';
  navIndicator.style.opacity = '1';
}
$$('.sb-nav button').forEach(b => b.onclick = () => bukaView(b.dataset.view));
$$('[data-goto]').forEach(b => b.onclick = () => bukaView(b.dataset.goto));
function bukaView(nama) {
  $$('.sb-nav button').forEach(b => b.classList.toggle('aktif', b.dataset.view === nama));
  $$('.view').forEach(v => v.classList.toggle('aktif', v.id === 'view-' + nama));
  $('#pageTitle').textContent = JUDUL[nama] || nama;
  posisiIndikator();
  if (document.body.classList.contains('drawer-buka')) tutupDrawer();
}
window.addEventListener('resize', posisiIndikator);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(posisiIndikator);

/* ---------- DRAWER SIDEBAR (mobile) ---------- */
const drawerToggle = $('#drawerToggle');
const drawerClose = $('#drawerClose');
const drawerOverlay = $('#drawerOverlay');
const sidebarEl = $('#sidebar');
function bukaDrawer() {
  document.body.classList.add('drawer-buka');
  drawerToggle.setAttribute('aria-expanded', 'true');
  const pertama = sidebarEl?.querySelector('.sb-nav button');
  if (pertama) pertama.focus();
  posisiIndikator();
}
function tutupDrawer() {
  document.body.classList.remove('drawer-buka');
  drawerToggle.setAttribute('aria-expanded', 'false');
  drawerToggle.focus();
}
if (drawerToggle) drawerToggle.onclick = bukaDrawer;
if (drawerClose) drawerClose.onclick = tutupDrawer;
if (drawerOverlay) drawerOverlay.onclick = tutupDrawer;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('drawer-buka')) tutupDrawer();
});

function renderAll() {
  renderDashboard(); renderMenu(); renderKasir(); renderHpp();
  renderBiaya(); renderKaryawan(); renderTarget();
  renderLaporan(); renderReceipt(); renderPesanan(); renderToko(); renderPrinter(); renderDrive(); renderPin();
}
function hppOf(m) {
  const resep = Array.isArray(m.resep) ? m.resep : [];
  if (resep.length) return resep.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0);
  return Number(m.hpp) || 0;
}
function stokHabis(m) {
  return !!m.habis || (m.stok !== null && m.stok !== undefined && Number(m.stok) <= 0);
}

/* ---------- DASHBOARD ---------- */
function renderDashboard() {
  const m = DB.menu || [];
  const kats = [...new Set(m.map(x => x.kategori))];
  $('#stMenu').textContent = m.length;
  $('#stKat').textContent = kats.length;
  $('#stHabis').textContent = m.filter(stokHabis).length;
  $('#stFoto').textContent = m.filter(x => x.foto).length;
  $('#dashMenu').innerHTML = m.slice(0,6).map(x =>
    '<tr><td><b>' + esc(x.nama) + '</b></td><td>' + esc(x.kategori) + '</td><td>' + rp(x.harga) + '</td>' +
    '<td><span class="chip ' + (stokHabis(x) ? 'habis' : 'aktif') + '">' + (stokHabis(x) ? 'SOLD OUT' : 'Tersedia') + '</span></td></tr>'
  ).join('');
  const unggul = m.filter(x => x.unggulan && x.aktif !== false).slice(0,8);
  $('#dashUnggulan').innerHTML = unggul.map(x =>
    '<div class="unggulan-card">' +
      (x.foto ? '<img src="' + esc(x.foto) + '" alt="">' : '<div class="ph">' + (x.ikon || '🍽️') + '</div>') +
      '<b>' + esc(x.nama) + '</b><span>' + rp(x.harga) + '</span>' +
      (stokHabis(x) ? '<em>SOLD OUT</em>' : '<em>Unggulan</em>') +
    '</div>'
  ).join('') || '<p style="color:var(--muted);font-size:.8rem">Belum ada produk unggulan. Centang di Menu → Edit Menu.</p>';
  const s = DB.settings;
  const info = [
    ['Nama toko', s.nama_toko], ['Tagline', s.tagline], ['WhatsApp', '+' + s.wa],
    ['Instagram', s.instagram], ['Alamat', s.alamat], ['Warna', s.warna_utama + ' / ' + s.warna_aksen]
  ];
  $('#ringkasanToko').innerHTML = info.map(([k,v]) =>
    '<div><span style="font-size:.65rem;color:var(--muted);font-weight:800;letter-spacing:.1em;text-transform:uppercase">' + k + '</span>' +
    '<div style="font-weight:700;margin-top:4px">' + esc(v || '-') + '</div></div>'
  ).join('');
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- MENU ---------- */
let menuDraft = [];
$('#filterKat').onchange = renderMenu;
$('#cariMenu').oninput = renderMenu;

function renderMenu() {
  menuDraft = JSON.parse(JSON.stringify(DB.menu || []));
  const kats = [...new Set(menuDraft.map(x => x.kategori))];
  const fk = $('#filterKat').value;
  $('#filterKat').innerHTML = '<option value="">Semua kategori</option>' + kats.map(k => '<option>' + esc(k) + '</option>').join('');
  if (fk) $('#filterKat').value = fk;
  const q = ($('#cariMenu').value || '').toLowerCase();
  const items = menuDraft.filter(x => (!fk || x.kategori === fk) && (!q || x.nama.toLowerCase().includes(q)));
  $('#menuBody').innerHTML = items.map((x) => {
    const i = menuDraft.indexOf(x);
    const thumb = x.foto
      ? '<img src="' + esc(x.foto) + '" alt="">'
      : '<div class="ph">' + (x.ikon || '🍽️') + '</div>';
    return '<tr>' +
      '<td><div class="cell-prod">' + thumb + '<div><b>' + esc(x.nama) + '</b><small>' + esc((x.deskripsi || '').slice(0,48)) + '</small></div></div></td>' +
      '<td><span class="chip">' + esc(x.kategori) + '</span></td>' +
      '<td><b>' + rp(x.harga) + '</b></td>' +
      '<td><b>' + (x.stok === null || x.stok === undefined ? '∞' : (stokHabis(x) ? '<span style="color:#C62828">SOLD OUT</span>' : Number(x.stok) + ' pcs')) + '</b></td>' +
      '<td><span class="chip ' + (stokHabis(x) ? 'habis' : 'aktif') + '">' + (stokHabis(x) ? 'SOLD OUT' : 'Tersedia') + '</span></td>' +
      '<td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="' + i + '">Edit</button>' +
      '<button class="btn btn-danger btn-sm" data-del="' + i + '">Hapus</button></div></td></tr>';
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted)">Tidak ada menu</td></tr>';
  $$('[data-edit]').forEach(b => b.onclick = () => bukaEditor(+b.dataset.edit));
  $$('[data-del]').forEach(b => b.onclick = () => {
    const i = +b.dataset.del;
    if (!confirm('Hapus menu "' + menuDraft[i].nama + '"?')) return;
    menuDraft.splice(i,1); DB.menu = menuDraft; renderMenu(); renderDashboard(); toast('Menu dihapus (belum disimpan)');
  });
}
$('#btnTambahMenu').onclick = () => bukaEditor(-1);
$('#simpanMenu').onclick = async () => {
  try { await post('/api/admin/save', { menu: DB.menu }); toast('✓ Menu tersimpan'); renderAll(); }
  catch (e) { toast(e.message); }
};

function bukaEditor(i) {
  const baru = i < 0;
  const m = baru
    ? { id: 'm_' + Math.random().toString(16).slice(2,10), nama:'', kategori:'Lumpia', harga:5000, deskripsi:'', foto:'', ikon:'🍽️', habis:false, stok:10, hpp:0, aktif:true, unggulan:false, resep:[], is_mix:false }
    : menuDraft[i];
  const kats = [...new Set((DB.menu||[]).map(x => x.kategori))];
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal-box"><h3>' + (baru ? 'Tambah Menu' : 'Edit Menu') + '</h3>' +
    '<div class="form-grid">' +
    field('Nama menu', '<input class="input" id="fNama" value="' + esc(m.nama) + '">') +
    field('Kategori', '<input class="input" id="fKat" list="katList" value="' + esc(m.kategori) + '"><datalist id="katList">' + kats.map(k=>'<option value="'+esc(k)+'">').join('') + '</datalist>') +
    field('Harga (Rp)', '<input class="input" id="fHarga" type="number" min="0" value="' +Number(m.harga||0)+ '">') +
    field('Stok', '<input class="input" id="fStok" type="number" min="0" value="' +Number(m.stok || 0)+ '">') +
    field('Ikon (kalau tanpa foto)', '<input class="input" id="fIkon" value="' + esc(m.ikon||'') + '">') +
    field('Foto Produk', '<div class="foto-row"><input class="input" id="fFoto" value="' + esc(m.foto||'') + '" placeholder="/assets/produk/...">' +
      '<button class="btn btn-ghost btn-sm" id="fUploadBtn" type="button">↑ Upload</button>' +
      '<input type="file" id="fUploadFile" accept="image/png,image/jpeg,image/webp" hidden></div>' +
      (m.foto ? '<img class="foto-mini" id="fFotoPreview" src="' + esc(m.foto) + '" alt="">' : '<img class="foto-mini" id="fFotoPreview" alt="" style="display:none">'), true) +
    field('Deskripsi', '<textarea class="textarea" id="fDesc">' + esc(m.deskripsi||'') + '</textarea>', true) +
    '</div>' +
    '<label class="check-row"><input type="checkbox" id="fHabis" ' + (m.habis?'checked':'') + '> Tandai habis</label>' +
    '<label class="check-row"><input type="checkbox" id="fAktif" ' + (m.aktif!==false?'checked':'') + '> Aktif ditampilkan</label>' +
    '<label class="check-row"><input type="checkbox" id="fUnggulan" ' + (m.unggulan?'checked':'') + '> Produk unggulan (tampil di dashboard &amp; website)</label>' +
    '<label class="check-row"><input type="checkbox" id="fMix" ' + (m.is_mix?'checked':'') + '> Frozen Mix (pilih 6 rasa)</label>' +
    '<div class="modal-foot"><button class="btn btn-ghost" id="fBatal">Batal</button><button class="btn btn-dark" id="fSimpan">Simpan</button></div></div>';
  document.body.appendChild(bg);
  $('#fBatal').onclick = () => bg.remove();
  $('#fUploadBtn').onclick = () => $('#fUploadFile').click();
  $('#fUploadFile').onchange = async () => {
    const file = $('#fUploadFile').files[0];
    if (!file) return;
    const nama = ($('#fNama').value || file.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    try {
      const url = await uploadGambar(file, nama, 'produk');
      $('#fFoto').value = url;
      $('#fFotoPreview').src = url;
      $('#fFotoPreview').style.display = 'block';
      toast('✓ Foto produk berhasil diupload');
    } catch (e) { toast(e.message); }
  };
  $('#fSimpan').onclick = () => {
    const data = {
      ...m,
      nama: $('#fNama').value.trim(), kategori: $('#fKat').value.trim() || 'Lainnya',
      harga: Number($('#fHarga').value) || 0, stok: Math.max(0, Number($('#fStok').value) || 0), ikon: $('#fIkon').value.trim(),
      foto: $('#fFoto').value.trim(), deskripsi: $('#fDesc').value.trim(),
      habis: $('#fHabis').checked, aktif: $('#fAktif').checked, unggulan: $('#fUnggulan').checked, is_mix: $('#fMix').checked
    };
    if (!data.nama) return toast('Nama menu wajib diisi');
    if (baru) menuDraft.push(data); else menuDraft[i] = data;
    DB.menu = menuDraft;
    bg.remove(); renderMenu(); renderDashboard(); toast(baru ? 'Menu ditambahkan' : 'Menu diperbarui');
  };
  bg.onclick = e => { if (e.target === bg) bg.remove(); };
}
function field(label, input, full) {
  return '<label class="field' + (full ? ' full' : '') + '"><span>' + label + '</span>' + input + '</label>';
}

/* ---------- TOKO & BRANDING ---------- */
const TOKO_FIELDS = [
  ['nama_toko','Nama Toko'], ['tagline','Tagline'], ['wa','Nomor WhatsApp (628...)'],
  ['instagram','Instagram (@...)'], ['alamat','Alamat'], ['maps_url','Link Google Maps'],
  ['logo','URL Logo'], ['kertas_nota','Kertas nota (mm)'], ['ongkos_kurir','Ongkos Kurir (Rp)']
];
function renderToko() {
  const s = DB.settings;
  $('#formToko').innerHTML = TOKO_FIELDS.map(([k,label]) =>
    field(label, '<input class="input" id="set_' + k + '" value="' + esc(s[k] || '') + '">', k === 'alamat' || k === 'logo')
  ).join('');
  $('#warnaUtama').value = s.warna_utama || '#0533A8';
  $('#warnaUtamaHex').value = s.warna_utama || '#0533A8';
  $('#warnaAksen').value = s.warna_aksen || '#F7E018';
  $('#warnaAksenHex').value = s.warna_aksen || '#F7E018';
  applyPreview();
}
const SWATCH_UTAMA = ['#0533A8','#0B1C50','#141414','#1D4ED8','#0F766E'];
const SWATCH_AKSEN = ['#F7E018','#CBE84A','#FF8A3D','#FF5C8A','#FFFFFF'];
$('#swatchUtama').innerHTML = SWATCH_UTAMA.map(c => '<button data-w="utama" data-c="'+c+'" style="background:'+c+'"></button>').join('');
$('#swatchAksen').innerHTML = SWATCH_AKSEN.map(c => '<button data-w="aksen" data-c="'+c+'" style="background:'+c+'"></button>').join('');
$$('[data-w]').forEach(b => b.onclick = () => {
  const v = b.dataset.c;
  $(b.dataset.w === 'utama' ? '#warnaUtama' : '#warnaAksen').value = v;
  $(b.dataset.w === 'utama' ? '#warnaUtamaHex' : '#warnaAksenHex').value = v;
  applyPreview();
});
['#warnaUtama','#warnaAksen','#warnaUtamaHex','#warnaAksenHex'].forEach(id =>
  $(id).addEventListener('input', () => {
    const u = $('#warnaUtamaHex').value || $('#warnaUtama').value;
    const a = $('#warnaAksenHex').value || $('#warnaAksen').value;
    if (id.endsWith('Hex')) {
      if (id === '#warnaUtamaHex') $('#warnaUtama').value = u;
      else $('#warnaAksen').value = a;
    } else {
      if (id === '#warnaUtama') $('#warnaUtamaHex').value = $('#warnaUtama').value;
      else $('#warnaAksenHex').value = $('#warnaAksen').value;
    }
    applyPreview();
  })
);
function applyPreview() {
  const u = $('#warnaUtamaHex').value || '#0533A8';
  const a = $('#warnaAksenHex').value || '#F7E018';
  document.documentElement.style.setProperty('--brand', u);
  document.documentElement.style.setProperty('--accent', a);
  $('#chipPreview').style.background = a;
  $('#chipPreview').style.color = '#141414';
  $('#btnPreview').style.background = u;
}
$('#simpanToko').onclick = async () => {
  const s = { ...DB.settings };
  TOKO_FIELDS.forEach(([k]) => s[k] = $('#set_' + k).value.trim());
  s.ongkos_kurir = Math.max(0, Number(String(s.ongkos_kurir || '').replace(/[^\d]/g, '')) || 0);
  s.warna_utama = $('#warnaUtamaHex').value.trim() || s.warna_utama;
  s.warna_aksen = $('#warnaAksenHex').value.trim() || s.warna_aksen;
  try { await post('/api/admin/save', { settings: s }); DB.settings = s; renderAll(); toast('✓ Toko & warna tersimpan. Muat ulang website untuk melihat perubahan.'); }
  catch (e) { toast(e.message); }
};

/* ---------- UPLOAD ---------- */
const drop = $('#dropArea'), fileInput = $('#fileInput');
drop.onclick = () => fileInput.click();
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };
function uploadGambar(file, name, folder) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Pilih file gambar'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Ukuran maksimal 8 MB'));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const r = await post('/api/admin/upload', { data: reader.result, name, folder });
        resolve(r.url);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}
function handleFile(file) {
  if (!$('#uploadName').value) $('#uploadName').value = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  uploadGambar(file, $('#uploadName').value, $('#uploadFolder').value).then(url => {
    $('#uploadUrl').value = url;
    $('#previewImg').src = url;
    $('#previewWrap').style.display = 'flex';
    toast('✓ Foto berhasil diupload');
  }).catch(e => toast(e.message));
}
$('#btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('#uploadUrl').value); toast('URL disalin'); }
  catch (e) { $('#uploadUrl').select(); document.execCommand('copy'); toast('URL disalin'); }
};

/* ---------- PIN ---------- */
function renderPin() {
  const el = $('#pinTersimpan');
  if (el) el.value = (DB.settings && DB.settings.pin_admin) || '800008';
}
$('#simpanPin').onclick = async () => {
  const p = $('#pinBaru').value.trim();
  if (!p) return toast('Isi PIN baru dulu');
  try {
    await post('/api/admin/save', { pin_baru: p });
    DB.settings.pin_admin = p;
    $('#pinBaru').value = '';
    renderPin();
    toast('✓ PIN berhasil diganti & tersimpan di Sheet');
  } catch (e) { toast(e.message); }
};

/* =========================================================
   KASIR
   ========================================================= */
let cart = [];
function renderKasir() {
  const items = (DB.menu || []).filter(m => m.aktif !== false);
  const kats = [...new Set(items.map(m => m.kategori))];
  const kat = $('#kasirKat').value;
  $('#kasirKat').innerHTML = '<option value="">Semua kategori</option>' + kats.map(k => '<option>'+esc(k)+'</option>').join('');
  if (kat) $('#kasirKat').value = kat;
  const q = ($('#kasirCari').value || '').toLowerCase();
  const tampil = items.filter(m => (!kat || m.kategori === kat) && m.nama.toLowerCase().includes(q));
  $('#kasirProduk').innerHTML = tampil.map(m => {
    const i = items.indexOf(m);
    const habis = stokHabis(m);
    const thumb = m.foto ? '<img src="'+esc(m.foto)+'" alt="">' : '<div class="ph">'+(m.ikon||'🍽️')+'</div>';
    return '<button class="produk-item' + (m.is_mix ? ' mix' : '') + (habis ? ' sold' : '') + '" data-prod="'+i+'" '+(habis?'disabled':'')+'>'+thumb+'<b>'+esc(m.nama)+'</b><span>'+rp(m.harga)+(m.is_mix?' / 6 pcs':'')+'</span>' +
      (habis ? '<em class="sold">SOLD OUT</em>' : '<em>Sisa '+(m.stok ?? '∞')+'</em>') + '</button>';
  }).join('') || '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px">Menu tidak ditemukan</div>';
  $$('[data-prod]:not([disabled])').forEach(b => b.onclick = () => {
    const m = items[+b.dataset.prod];
    if (m.is_mix) return bukaMixKasir(m);
    tambahCart(m);
  });
  renderCart();
}
function tambahCart(m, mix, pilihan) {
  if (stokHabis(m)) return toast('Stok ' + m.nama + ' habis');
  const kunci = JSON.stringify(pilihan || {});
  const ada = cart.find(c => c.menu_id === m.id && (c.mix || '') === (mix || '') &&
    JSON.stringify(c.pilihan || {}) === kunci);
  if (ada) ada.qty++;
  else cart.push({ menu_id:m.id, nama:m.nama, mix:mix || '', pilihan:pilihan || null,
    harga:Number(m.harga), qty:1, hpp:hppOf(m) });
  renderCart();
}
function bukaMixKasir(mixItem) {
  const rasaList = (DB.menu||[]).filter(x => x.kategori === 'Lumpia' && x.aktif !== false && !stokHabis(x));
  if (!rasaList.length) return toast('Belum ada rasa lumpia ready');
  const dipilih = {};
  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.id = 'modalMixKasir';
  function draw() {
    const total = Object.values(dipilih).reduce((a,b) => a+b, 0);
    modal.innerHTML = '<div class="modal-box mix-box"><h3>🧊 Pilih 6 Rasa Lumpia</h3>' +
      '<p style="color:var(--muted);font-size:.78rem;margin:6px 0 16px">Pilih <b>'+total+'/6</b> — campur boleh, rasa sama juga boleh.</p>' +
      '<div class="mix-grid">' + rasaList.map(r => {
        const q = dipilih[r.id] || 0;
        return '<div class="mix-item' + (q ? ' aktif' : '') + '">' +
          (r.foto ? '<img src="'+esc(r.foto)+'" alt="">' : '<div class="ph">'+(r.ikon||'🥟')+'</div>') +
          '<b>' + esc(r.nama) + '</b>' +
          '<div class="mix-qty"><button class="mq" data-id="'+esc(r.id)+'" data-a="min" '+(q?'':'disabled')+'>−</button><span>'+q+'</span>' +
          '<button class="mq plus" data-id="'+esc(r.id)+'" data-a="plus" '+(total>=6?'disabled':'')+'>＋</button></div></div>';
      }).join('') + '</div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" id="mixBatal">Batal</button>' +
      '<button class="btn btn-accent" id="mixOk" '+(total!==6?'disabled':'')+'>✔ Tambah ('+total+'/6)</button></div></div>';
    $('#mixBatal').onclick = () => modal.remove();
    $$('#modalMixKasir .mq').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      if (b.dataset.a === 'plus') {
        if (total >= 6) return toast('Sudah 6 pcs ya!');
        const r = rasaList.find(x => x.id === id);
        if (r && (dipilih[id] || 0) >= Number(r.stok)) return toast('Stok ' + r.nama + ' tinggal ' + r.stok);
        dipilih[id] = (dipilih[id] || 0) + 1;
      } else if (dipilih[id]) { dipilih[id]--; if (!dipilih[id]) delete dipilih[id]; }
      draw();
    });
    if (total === 6) $('#mixOk').onclick = () => {
      const detail = rasaList.filter(r => dipilih[r.id]).map(r => dipilih[r.id] + '× ' + r.nama).join(', ');
      const pilihan = {};
      rasaList.forEach(r => { if (dipilih[r.id]) pilihan[r.id] = dipilih[r.id]; });
      tambahCart(mixItem, detail, pilihan);
      modal.remove();
      toast('✔ Frozen Mix 6 pcs ditambah');
    };
  }
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  draw();
}
function renderCart() {
  const box = $('#cartItems');
  if (!cart.length) {
    box.innerHTML = '<div class="cart-empty">Belum ada pesanan. Pilih menu di samping ←</div>';
  } else {
    box.innerHTML = cart.map((c,i) =>
      '<div class="cart-row"><div class="ci"><b>'+esc(c.nama)+'</b>' + (c.mix ? '<small style="color:#4B7A05">🧊 '+esc(c.mix)+'</small>' : '') + '<small>'+rp(c.harga)+' × '+c.qty+'</small></div>' +
      '<div class="qty"><button data-cart="min" data-i="'+i+'">−</button><b>'+c.qty+'</b>' +
      '<button data-cart="plus" data-i="'+i+'">+</button></div>' +
      '<button class="btn btn-danger btn-sm" data-cart="del" data-i="'+i+'">✕</button></div>'
    ).join('');
    $$('[data-cart]').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, a = b.dataset.cart;
      if (a === 'plus') {
        const m = (DB.menu||[]).find(x => x.id === cart[i].menu_id);
        if (m && m.stok !== null && m.stok !== undefined && cart[i].qty >= Number(m.stok)) {
          return toast('Stok ' + m.nama + ' tinggal ' + m.stok);
        }
        cart[i].qty++;
      }
      else if (a === 'min') { cart[i].qty--; if (cart[i].qty <= 0) cart.splice(i,1); }
      else cart.splice(i,1);
      renderCart();
    });
  }
  const total = cart.reduce((a,c) => a + c.harga * c.qty, 0);
  $('#cartTotal').textContent = rp(total);
  $('#kasirInfo').textContent = cart.reduce((a,c) => a + c.qty, 0) + ' pcs';
  hitungKembalian();
}
function hitungKembalian() {
  const total = cart.reduce((a,c) => a + c.harga*c.qty, 0);
  const bayar = Number($('#bayarInput').value) || 0;
  $('#kembalian').textContent = rp(Math.max(0, bayar - total));
  $$('#uangCepat button').forEach(b => {
    const n = b.dataset.nominal;
    const nilai = n === 'pas' ? total : Number(n);
    b.classList.toggle('aktif', n !== '0' && bayar === nilai && (n !== 'pas' || total > 0));
  });
}
$('#bayarInput').addEventListener('input', hitungKembalian);
$$('#uangCepat button').forEach(b => b.onclick = () => {
  const n = b.dataset.nominal;
  const total = cart.reduce((a,c) => a + c.harga*c.qty, 0);
  $('#bayarInput').value = n === 'pas' ? total : (n === '0' ? '' : Number(n));
  hitungKembalian();
});
$('#kasirCari').addEventListener('input', renderKasir);
$('#kasirKat').addEventListener('change', renderKasir);
$('#cartClear').onclick = () => { cart = []; $('#bayarInput').value=''; renderCart(); };
$('#btnBayar').onclick = async () => {
  if (!cart.length) return toast('Keranjang masih kosong');
  const total = cart.reduce((a,c) => a + c.harga*c.qty, 0);
  const bayar = Number($('#bayarInput').value) || 0;
  if (bayar < total) return toast('Uang bayar kurang');
  try {
    const r = await post('/api/admin/transaksi', {
      items: cart.map(c => ({ menu_id:c.menu_id, nama:c.nama, mix:c.mix || '', pilihan:c.pilihan || null, harga:c.harga, qty:c.qty, hpp:c.hpp })),
      total, hpp: cart.reduce((a,c)=>a+c.hpp*c.qty,0), bayar, kembalian: bayar-total,
      metode: $('#metodeBayar').value, kasir: 'Admin'
    });
    const trx = r.transaksi;
    await cetakStruk(trx, true);
    cart = []; $('#bayarInput').value = '';
    DB = await api('/api/admin/data');
    renderAll();
    toast('✓ ' + trx.no_nota + ' berhasil');
  } catch (e) { toast(e.message); }
};
/* =========================================================
   BAHAN & HPP
   ========================================================= */
function renderHpp() {
  const s = DB.settings;
  $('#aturTarget').value = s.target_hpp ?? 60;
  $('#aturSusut').value = s.susut ?? 5;
  $('#aturPajak').value = s.pajak ?? 0.5;
  $('#aturHari').value = s.hari_buka ?? 30;
  let totalMargin = 0;
  $('#hppBody').innerHTML = (DB.menu||[]).map(m => {
    const hpp = hppOf(m);
    const laba = Number(m.harga) - hpp;
    const margin = m.harga ? Math.round(laba / m.harga * 100) : 0;
    totalMargin += margin;
    const saran = Math.ceil(hpp / Math.max(1, (s.target_hpp||60)/100) / 500) * 500;
    return '<tr><td><b>'+esc(m.nama)+'</b><br><small style="color:var(--muted)">'+(m.resep||[]).length+' bahan</small></td>' +
      '<td>'+rp(m.harga)+'</td><td><b>'+rp(hpp)+'</b></td>' +
      '<td><b style="color:'+(laba>=0?'#2E8B23':'#C62828')+'">'+rp(laba)+'</b></td>' +
      '<td>'+margin+'%</td><td>'+rp(saran)+'</td>' +
      '<td><button class="btn btn-ghost btn-sm" data-resep="'+esc(m.id)+'">Atur Resep</button></td></tr>';
  }).join('');
  const rata = (DB.menu||[]).length ? Math.round(totalMargin/(DB.menu||[]).length) : 0;
  $('#hppRata').textContent = 'Rata-rata margin ' + rata + '%';
  $$('[data-resep]').forEach(b => b.onclick = () => editorResep(b.dataset.resep));
}
function editorResep(id) {
  const m = DB.menu.find(x => x.id === id);
  if (!m) return;
  const resep = JSON.parse(JSON.stringify(m.resep || []));
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  function draw() {
    const total = resep.reduce((a,r) => a + Number(r.qty||0) * Number(r.harga||0), 0);
    bg.innerHTML = '<div class="modal-box resep-modal"><h3>Resep — '+esc(m.nama)+'</h3>' +
      '<p style="color:var(--muted);font-size:.76rem;margin:6px 0 16px">Isi bahan, jumlah, dan harga satuan. HPP dihitung otomatis.</p>' +
      '<div class="table-scroll resep-scroll"><table class="menu-table resep-table"><thead><tr><th>Bahan</th><th>Qty</th><th>Satuan</th><th>Harga Satuan</th><th>Subtotal</th><th></th></tr></thead><tbody>' +
      resep.map((r,i) => '<tr>' +
        '<td><input class="input" data-r="'+i+'" data-k="nama" value="'+esc(r.nama||'')+'" placeholder="Nama bahan"></td>' +
        '<td><input class="input" style="width:70px" type="number" min="0" step="any" data-r="'+i+'" data-k="qty" value="'+Number(r.qty||0)+'"></td>' +
        '<td><input class="input" style="width:80px" data-r="'+i+'" data-k="satuan" value="'+esc(r.satuan||'pcs')+'"></td>' +
        '<td><input class="input" style="width:110px" type="number" min="0" data-r="'+i+'" data-k="harga" value="'+Number(r.harga||0)+'"></td>' +
        '<td><b>'+rp(Number(r.qty||0)*Number(r.harga||0))+'</b></td>' +
        '<td><button class="btn btn-danger btn-sm" data-rd="'+i+'">✕</button></td></tr>').join('') +
      '</tbody></table></div>' +
      '<button class="btn btn-ghost btn-sm" id="rTambah" style="margin-top:12px">+ Tambah Bahan</button>' +
      '<div class="resep-total">HPP per porsi: <b>'+rp(total)+'</b></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" id="rBatal">Batal</button><button class="btn btn-dark" id="rOk">Simpan Resep</button></div></div>';
    $$('[data-r]').forEach(inp => inp.onchange = () => {
      const r = resep[+inp.dataset.r], k = inp.dataset.k;
      r[k] = (k === 'qty' || k === 'harga') ? (Number(inp.value)||0) : inp.value;
      updateTotal();
    });
    function updateTotal() {
      const baris = bg.querySelectorAll('.resep-table tbody tr');
      baris.forEach((tr,i) => {
        const sub = tr.querySelector('td:nth-child(5) b');
        if (sub) sub.textContent = rp(Number(resep[i].qty||0)*Number(resep[i].harga||0));
      });
      bg.querySelector('.resep-total b').textContent = rp(resep.reduce((a,r) => a + Number(r.qty||0)*Number(r.harga||0), 0));
    }
    $$('[data-rd]').forEach(b => b.onclick = () => { resep.splice(+b.dataset.rd,1); bg.innerHTML=''; draw(); });
    $('#rTambah').onclick = () => { resep.push({ nama:'', qty:1, satuan:'pcs', harga:0 }); bg.innerHTML=''; draw(); };
    $('#rBatal').onclick = () => bg.remove();
    $('#rOk').onclick = async () => {
      resep.forEach(r => { r.nama = String(r.nama||'').trim() || 'Bahan'; });
      m.resep = resep;
      m.hpp = resep.reduce((a,r) => a + Number(r.qty||0)*Number(r.harga||0), 0);
      try { await post('/api/admin/save', { menu:DB.menu }); bg.remove(); renderAll(); toast('✓ Resep & HPP tersimpan'); }
      catch(e) { toast(e.message); }
    };
  }
  document.body.appendChild(bg);
  draw();
}
$('#simpanAturan').onclick = async () => {
  const s = {
    target_hpp:Number($('#aturTarget').value)||60,
    susut:Number($('#aturSusut').value)||0,
    pajak:Number($('#aturPajak').value)||0,
    hari_buka:Math.max(1,Number($('#aturHari').value)||30)
  };
  try { await post('/api/admin/save', { settings:s }); Object.assign(DB.settings,s); toast('✓ Aturan tersimpan'); renderAll(); }
  catch(e){ toast(e.message); }
};

/* ---------- BIAYA BULANAN & KARYAWAN ---------- */
let biayaDraft = [], karyawanDraft = [];
function biayaPerBulan() {
  return (DB.settings.biaya_bulanan || []).reduce((a,b) =>
    a + (Number(b.jumlah)||0) / (b.periode === 'tahunan' ? 12 : 1), 0);
}
function gajiPerBulan() {
  return (DB.settings.karyawan || []).reduce((a,k) => a + (Number(k.gaji)||0), 0);
}
function totalBiayaBulanan() { return biayaPerBulan() + gajiPerBulan(); }
function renderBiaya() {
  biayaDraft = JSON.parse(JSON.stringify(DB.settings.biaya_bulanan || []));
  $('#biayaBody').innerHTML = biayaDraft.map((b,i) =>
    '<tr><td><input class="input" data-b="'+i+'" data-k="nama" placeholder="Nama biaya" value="'+esc(b.nama||'')+'"></td>' +
    '<td><input class="input" style="width:130px" type="number" min="0" data-b="'+i+'" data-k="jumlah" value="'+Number(b.jumlah||0)+'"></td>' +
    '<td><select class="select" style="width:120px" data-b="'+i+'" data-k="periode"><option '+(b.periode!=='tahunan'?'selected':'')+' value="bulanan">Bulanan</option><option '+(b.periode==='tahunan'?'selected':'')+' value="tahunan">Tahunan</option></select></td>' +
    '<td><b>'+rp(Number(b.jumlah||0)/(b.periode==='tahunan'?12:1))+'</b></td>' +
    '<td><button class="btn btn-danger btn-sm" data-bd="'+i+'">✕</button></td></tr>'
  ).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted)">Belum ada biaya. Klik Tambah Biaya.</td></tr>';
  $('#biayaTotal').textContent = rp(biayaPerBulan()) + ' / bulan';
  $$('[data-b]').forEach(el => el.onchange = () => {
    const b = biayaDraft[+el.dataset.b], k = el.dataset.k;
    b[k] = (k === 'jumlah') ? (Number(el.value)||0) : el.value;
    DB.settings.biaya_bulanan = biayaDraft;
    renderBiaya(); updateTargetOutput();
  });
  $$('[data-bd]').forEach(btn => btn.onclick = () => {
    biayaDraft.splice(+btn.dataset.bd,1); DB.settings.biaya_bulanan=biayaDraft;
    renderBiaya(); updateTargetOutput();
  });
}
$('#tambahBiaya').onclick = () => {
  biayaDraft.push({ nama:'', jumlah:0, periode:'bulanan' }); DB.settings.biaya_bulanan=biayaDraft;
  renderBiaya(); updateTargetOutput();
};
$('#simpanBiaya').onclick = async () => {
  try { await post('/api/admin/save',{settings:{biaya_bulanan:biayaDraft}}); DB.settings.biaya_bulanan=biayaDraft; renderAll(); toast('✓ Biaya bulanan tersimpan'); }
  catch(e){ toast(e.message); }
};
function renderKaryawan() {
  karyawanDraft = JSON.parse(JSON.stringify(DB.settings.karyawan || []));
  $('#karyawanBody').innerHTML = karyawanDraft.map((k,i) =>
    '<tr><td><input class="input" data-kary="'+i+'" data-k="nama" value="'+esc(k.nama||'')+'" placeholder="Nama karyawan"></td>' +
    '<td><input class="input" style="width:150px" type="number" min="0" data-kary="'+i+'" data-k="gaji" value="'+Number(k.gaji||0)+'"></td>' +
    '<td><button class="btn btn-danger btn-sm" data-kd="'+i+'">✕</button></td></tr>'
  ).join('') || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--muted)">Belum ada karyawan.</td></tr>';
  $('#gajiTotal').textContent = rp(gajiPerBulan()) + ' / bulan';
  $$('[data-kary]').forEach(el => el.onchange = () => {
    const k = karyawanDraft[+el.dataset.kary], field = el.dataset.k;
    k[field] = field === 'gaji' ? (Number(el.value)||0) : el.value;
    DB.settings.karyawan = karyawanDraft;
    renderKaryawan(); updateTargetOutput();
  });
  $$('[data-kd]').forEach(btn => btn.onclick = () => {
    karyawanDraft.splice(+btn.dataset.kd,1); DB.settings.karyawan=karyawanDraft;
    renderKaryawan(); updateTargetOutput();
  });
}
$('#tambahKaryawan').onclick = () => {
  karyawanDraft.push({ nama:'', gaji:0 }); DB.settings.karyawan=karyawanDraft;
  renderKaryawan(); updateTargetOutput();
};
$('#simpanKaryawan').onclick = async () => {
  try { await post('/api/admin/save',{settings:{karyawan:karyawanDraft}}); DB.settings.karyawan=karyawanDraft; renderAll(); toast('✓ Karyawan tersimpan'); }
  catch(e){ toast(e.message); }
};

/* =========================================================
   LAPORAN
   ========================================================= */
function transaksiAktif() { return (DB.transaksi||[]).filter(x => !x.refunded); }
function trxDipilih() {
  const dari = $('#lapDari').value, sampai = $('#lapSampai').value;
  return transaksiAktif().filter(t => {
    const d = new Date(t.waktu);
    if (dari && d < new Date(dari)) return false;
    if (sampai && d > new Date(sampai+'T23:59:59')) return false;
    return true;
  });
}
function metodeNama(m) { return String(m || 'Cash') === 'Tunai' ? 'Cash' : String(m || 'Cash'); }
function transaksiGrafik(periode) {
  const now = new Date();
  return transaksiAktif().filter(x => {
    const d = new Date(x.waktu);
    if (periode === 'hari') return d.toDateString() === now.toDateString();
    if (periode === 'bulan') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return d.getFullYear() === now.getFullYear();
  });
}
function renderSalesItem(t) {
  const peta = {};
  for (const tr of t) for (const it of (tr.items || [])) {
    const k = it.nama || '-';
    peta[k] = peta[k] || { qty:0, omzet:0, hpp:0 };
    const qty = Number(it.qty) || 0, harga = Number(it.harga) || 0;
    const menu = (DB.menu || []).find(m => m.id === it.menu_id);
    const satuan = it.hpp !== undefined && it.hpp !== null ? Number(it.hpp) : hppOf(menu || {});
    peta[k].qty += qty;
    peta[k].omzet += harga * qty;
    peta[k].hpp += satuan * qty;
  }
  const baris = Object.entries(peta).sort((a,b) => b[1].qty - a[1].qty);
  $('#salesItemBody').innerHTML = baris.map(([nama,v]) => {
    const laba = v.omzet - v.hpp;
    return '<tr><td><b>'+esc(nama)+'</b><br><small style="color:var(--muted)">HPP '+rp(v.hpp)+'</small></td>' +
      '<td>'+v.qty+' pcs</td><td><b>'+rp(v.omzet)+'</b></td>' +
      '<td style="color:'+(laba>=0?'#2E8B23':'#C62828')+';font-weight:800">'+rp(laba)+'</td></tr>';
  }).join('') || '<tr><td colspan="4" style="text-align:center;padding:22px;color:var(--muted)">Belum ada penjualan</td></tr>';
}
function renderSalesPayment(t) {
  const peta = {};
  for (const tr of t) {
    const k = metodeNama(tr.metode);
    peta[k] = peta[k] || { jumlah:0, omzet:0 };
    peta[k].jumlah++;
    peta[k].omzet += Number(tr.total) || 0;
  }
  const methods = ['Cash','QRIS', ...Object.keys(peta).filter(k => k !== 'Cash' && k !== 'QRIS')];
  $('#salesPaymentBody').innerHTML = methods.map(k => {
    const v = peta[k] || { jumlah:0, omzet:0 };
    return '<tr><td><span class="chip '+(k==='QRIS'?'aktif':'')+'">'+esc(k)+'</span></td>' +
      '<td>'+v.jumlah+' transaksi</td><td><b>'+rp(v.omzet)+'</b></td></tr>';
  }).join('');
}
let grafikMode = 'hari';
function bucketGrafik(periode) {
  const now = new Date(), t = transaksiGrafik(periode), out = [];
  if (periode === 'hari') {
    for (let h = 0; h < 24; h++) out.push({ label: String(h).padStart(2,'0')+'.00', value:0 });
    for (const tr of t) out[new Date(tr.waktu).getHours()].value += Number(tr.total) || 0;
  } else if (periode === 'bulan') {
    const jumlah = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    for (let d = 1; d <= jumlah; d++) out.push({ label:String(d), value:0 });
    for (const tr of t) out[new Date(tr.waktu).getDate()-1].value += Number(tr.total) || 0;
  } else {
    const nama = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    for (let i = 0; i < 12; i++) out.push({ label:nama[i], value:0 });
    for (const tr of t) out[new Date(tr.waktu).getMonth()].value += Number(tr.total) || 0;
  }
  return { buckets:out, transaksi:t };
}
function gambarBars(el, buckets) {
  const max = Math.max(1, ...buckets.map(b => b.value));
  el.innerHTML = buckets.map(b =>
    '<div class="bar-col" title="'+esc(b.label)+': '+rp(b.value)+'"><div class="bar-track"><i style="height:'+Math.round(b.value/max*100)+'%"></i></div>' +
    '<span>'+esc(b.label)+'</span><b>'+(b.value ? rp(b.value) : '')+'</b></div>'
  ).join('');
}
function renderGrafik() {
  const { buckets, transaksi } = bucketGrafik(grafikMode);
  const total = transaksi.reduce((a,x) => a + Number(x.total||0), 0);
  const ket = grafikMode === 'hari' ? 'Hari ini — per jam' : grafikMode === 'bulan' ? 'Bulan ini — per tanggal' : 'Tahun ini — per bulan';
  $('#grafikKeterangan').textContent = ket;
  $('#grafikInfo').innerHTML = '<span>'+transaksi.length+' transaksi</span><b>'+rp(total)+'</b><span>Rata-rata '+rp(transaksi.length?total/transaksi.length:0)+'</span>';
  gambarBars($('#grafikBars'), buckets);
  $$('#grafikTabs button').forEach(b => b.classList.toggle('aktif', b.dataset.grafik === grafikMode));
  const jam = bucketGrafik('hari').buckets;
  gambarBars($('#jamBars'), jam);
}
function renderReceipt() {
  const semua = DB.transaksi || [];
  const aktif = transaksiAktif();
  const refund = semua.filter(x => x.refunded);
  $('#receiptStats').innerHTML =
    '<div class="stat-box"><b>'+semua.length+'</b><span>Total struk</span></div>' +
    '<div class="stat-box"><b>'+rp(aktif.reduce((a,x)=>a+Number(x.total||0),0))+'</b><span>Omzet lancar</span></div>' +
    '<div class="stat-box"><b>'+refund.length+'</b><span>Struk refund</span></div>' +
    '<div class="stat-box"><b>'+rp(refund.reduce((a,x)=>a+Number(x.total||0),0))+'</b><span>Nominal refund</span></div>';
  const q = ($('#receiptCari').value || '').toLowerCase();
  const f = $('#receiptFilter').value;
  const tampil = semua.filter(x =>
    (!f || (f === 'refund' ? x.refunded : !x.refunded)) &&
    (!q || String(x.no_nota).toLowerCase().includes(q) || metodeNama(x.metode).toLowerCase().includes(q))
  );
  $('#receiptBody').innerHTML = tampil.map(x => {
    const jumlah = (x.items||[]).reduce((a,i)=>a+Number(i.qty||0),0);
    return '<tr><td><b>'+esc(x.no_nota)+'</b></td><td>'+new Date(x.waktu).toLocaleString('id-ID')+'</td>' +
      '<td>'+jumlah+' item</td><td><b>'+rp(x.total)+'</b></td>' +
      '<td><span class="chip '+(x.refunded?'habis':'aktif')+'">'+(x.refunded?'Refund':'Lancar')+'</span></td>' +
      '<td><div class="row-actions">' +
      '<button class="btn btn-ghost btn-sm" data-lihat="'+esc(x.id)+'">Lihat</button>' +
      '<button class="btn btn-ghost btn-sm" data-cetak="'+esc(x.id)+'">Cetak</button>' +
      '<button class="btn btn-accent btn-sm" data-cetak-bt="'+esc(x.id)+'">BT</button>' +
      (x.refunded ? '' : '<button class="btn btn-ghost btn-sm" data-refund="'+esc(x.id)+'">Refund</button>') +
      '<button class="btn btn-danger btn-sm" data-hapus="'+esc(x.id)+'">Hapus</button></div></td></tr>';
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Belum ada transaksi</td></tr>';
  $$('[data-lihat]').forEach(b => b.onclick = () => lihatStruk(b.dataset.lihat));
  $$('[data-cetak]').forEach(b => b.onclick = () => {
    const trx = semua.find(x => x.id === b.dataset.cetak);
    if (trx) cetakStruk(trx, false);
  });
  $$('[data-cetak-bt]').forEach(b => b.onclick = () => {
    const trx = semua.find(x => x.id === b.dataset.cetakBt);
    if (trx) cetakBluetooth(trx);
  });
  $$('[data-refund]').forEach(b => b.onclick = () => prosesRefund(b.dataset.refund));
  $$('[data-hapus]').forEach(b => b.onclick = () => prosesHapusReceipt(b.dataset.hapus));
}
async function prosesRefund(id) {
  const trx = (DB.transaksi||[]).find(x => x.id === id);
  if (!trx || trx.refunded) return;
  const alasan = prompt('Alasan refund (boleh kosong):', '') || '';
  if (!confirm('Refund '+trx.no_nota+' ('+rp(trx.total)+')? Stok akan dikembalikan dan struk tetap tersimpan.')) return;
  try {
    await post('/api/admin/transaksi/refund', { id, alasan });
    DB = await api('/api/admin/data');
    renderAll(); toast('✓ '+trx.no_nota+' direfund, stok dikembalikan');
  } catch (e) { toast(e.message); }
}
async function prosesHapusReceipt(id) {
  const trx = (DB.transaksi||[]).find(x => x.id === id);
  if (!trx) return;
  const pesan = trx.refunded
    ? 'Hapus struk '+trx.no_nota+' dari daftar?'
    : 'Hapus struk '+trx.no_nota+'? Stok akan dikembalikan.';
  if (!confirm(pesan)) return;
  try {
    await post('/api/admin/transaksi/hapus', { id });
    DB = await api('/api/admin/data');
    renderAll(); toast('✓ '+trx.no_nota+' dihapus');
  } catch (e) { toast(e.message); }
}
function lihatStruk(id) {
  const trx = (DB.transaksi||[]).find(x => x.id === id);
  if (!trx) return;
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal-box struk-modal"><h3>Struk '+esc(trx.no_nota)+'</h3>' +
    '<p class="struk-catatan">Tampilan ini sama dengan struk yang keluar di printer.</p>' +
    '<div class="receipt-sheet">'+receiptHtml(trx)+'</div>' +
    (trx.refund_at ? '<p class="struk-catatan">Direfund: '+new Date(trx.refund_at).toLocaleString('id-ID')+
      (trx.refund_alasan ? ' — '+esc(trx.refund_alasan) : '')+'</p>' : '') +
    '<div class="modal-foot"><button class="btn btn-ghost" id="strukTutup">Tutup</button>' +
    '<button class="btn btn-ghost" id="strukCetakDialog">Cetak Dialog</button>' +
    '<button class="btn btn-dark" id="strukCetak">🖨 Cetak Bluetooth</button></div></div>';
  document.body.appendChild(bg);
  $('#strukTutup').onclick = () => bg.remove();
  $('#strukCetakDialog').onclick = () => cetakStruk(trx, false);
  $('#strukCetak').onclick = () => cetakBluetooth(trx);
  bg.onclick = e => { if (e.target === bg) bg.remove(); };
}
$('#refreshReceipt').onclick = async () => { DB = await api('/api/admin/data'); renderAll(); toast('History dimuat ulang'); };
$('#receiptCari').oninput = renderReceipt;
$('#receiptFilter').onchange = renderReceipt;

/* =========================================================
   PESANAN DARI WEBSITE PELANGGAN
   ========================================================= */
const KNOWN_KEY = 'sunday_pesanan_dikenal';
let skipPesananPollingHingga = 0;
let pesananPollGen = 0;
function seedPesananAwal() {
  if (localStorage.getItem('sunday_pesanan_seed')) return;
  const dikenal = knownPesanan();
  ((DB && DB.pesanan) || []).forEach(p => dikenal.add(p.id));
  simpanKnownPesanan(dikenal);
  localStorage.setItem('sunday_pesanan_seed', '1');
}
function knownPesanan() {
  try { return new Set(JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function simpanKnownPesanan(set) {
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify(Array.from(set).slice(-300))); } catch (e) {}
}
function simpanTokenNative() {
  const token = localStorage.getItem('sunday_token') || '';
  if (window.SundayNotify && window.SundayNotify.simpanToken) {
    try { window.SundayNotify.simpanToken(token); } catch (e) {}
  }
}
function notifikasiPesanan(p) {
  const judul = 'Pesanan baru ' + (p.no_pesanan || '');
  const isi = (p.nama || 'Pelanggan') + ' — ' + rp(p.total || 0) + ' — ' +
    (p.metode === 'kurir' ? 'Kurir ke rumah' : 'Ambil sendiri' + (p.jam_ambil ? ' jam ' + p.jam_ambil : ''));
  if (window.SundayNotify && window.SundayNotify.notifikasi) {
    try { window.SundayNotify.notifikasi(judul, isi); } catch (e) {}
  }
  if (window.top === window.self && navigator.vibrate) {
    try { navigator.vibrate([180, 90, 180]); } catch (e) {}
  }
  toast('🔔 ' + judul);
}
function updatePesananBadge(items) {
  const badge = $('#navPesananBadge');
  if (!badge) return;
  const n = (items || []).filter(p => p.status !== 'selesai').length;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n === 0;
  document.title = n ? '(' + n + ') Sunday Admin' : 'Sunday Breakfast — Admin';
}
function renderPesanan() {
  const semua = Array.isArray(DB && DB.pesanan) ? DB.pesanan : [];
  updatePesananBadge(semua);
  const cari = ($('#pesananCari').value || '').trim().toLowerCase();
  const filter = $('#pesananFilter').value;
  const items = semua.filter(p => {
    if (filter && (p.status || 'baru') !== filter) return false;
    if (!cari) return true;
    return [p.no_pesanan, p.nama, p.hp, p.alamat, p.jam_ambil].join(' ').toLowerCase().includes(cari);
  });
  const baru = semua.filter(p => p.status !== 'selesai').length;
  $('#pesananStats').innerHTML =
    '<div class="stat-box"><b>' + baru + '</b><span>Belum selesai</span></div>' +
    '<div class="stat-box"><b>' + semua.filter(p=>p.status==='siap').length + '</b><span>Siap diambil</span></div>' +
    '<div class="stat-box"><b>' + semua.length + '</b><span>Total pesanan</span></div>' +
    '<div class="stat-box"><b>' + rp(semua.reduce((a,p)=>a+Number(p.total||0),0)) + '</b><span>Nilai pesanan</span></div>' +
    '<div class="stat-box"><b>' + semua.filter(p=>p.metode==='kurir').length + '</b><span>Dikirim</span></div>';
  $('#pesananBody').innerHTML = items.length ? items.map(p => {
    const selesai = p.status === 'selesai';
    const siap = p.status === 'siap';
    const kirim = p.metode === 'kurir';
    const jam = p.jam_ambil ? '<br><small>🕒 Jam ambil: <b>' + esc(p.jam_ambil) + '</b></small>' : '';
    const itemHtml = (p.items || []).map(it =>
      esc(it.nama) + ' ×' + Number(it.qty||1) + (it.mix ? '<small>🧊 ' + esc(it.mix) + '</small>' : '')
    ).join('<br>');
    const hp = String(p.hp || '').replace(/[^0-9]/g, '');
    const wa = hp ? 'https://wa.me/' + (hp.startsWith('0') ? '62' + hp.slice(1) : hp) : '';
    const trxHistory = p.trx_id && (DB.transaksi || []).find(x => x.id === p.trx_id);
    const ongkir = Number(p.ongkos_kurir) || 0;
    const statusLabel = selesai ? 'Selesai' : siap ? (kirim ? 'Siap dikirim' : 'Siap diambil') : 'Baru';
    const statusKelas = selesai ? 'pesanan-selesai' : siap ? 'pesanan-siap' : 'pesanan-baru';
    const kirimCell = kirim
      ? '🚚 Kurir<br><small>' + esc(p.alamat || '-') + (p.catatan ? '<br>📝 ' + esc(p.catatan) : '') +
        '</small><br><small>💵 Ongkir: <b>' + rp(ongkir) + '</b></small>'
      : '🏍️ Ambil sendiri' + jam;
    const konfirmBtn = selesai ? '' :
      (kirim
        ? '<input class="input ongkir-admin" type="number" min="0" step="1000" value="' + ongkir + '" data-ongkir="' + esc(p.id) + '" aria-label="Ongkos kurir" title="Ongkos kurir">' +
          '<button class="btn btn-accent btn-sm" data-konfirm-ps="' + esc(p.id) + '">💬 Konfirmasi total</button> '
        : '<button class="btn btn-accent btn-sm" data-konfirm-ps="' + esc(p.id) + '">💬 Konfirmasi WA</button> ');
    return '<tr><td><b>' + esc(p.no_pesanan) + '</b></td>' +
      '<td>' + new Date(p.waktu).toLocaleString('id-ID', {dateStyle:'short', timeStyle:'short'}) + '</td>' +
      '<td><b>' + esc(p.nama || '-') + '</b><br><small>' + esc(p.hp || '-') + '</small></td>' +
      '<td>' + kirimCell + '</td>' +
      '<td class="pesanan-item">' + itemHtml + '</td>' +
      '<td><b>' + rp(p.total) + '</b>' + (kirim ? '<br><small>termasuk ongkir</small>' : '') + '</td>' +
      '<td><span class="' + statusKelas + '">' + statusLabel + '</span>' +
      (p.dikonfirmasi ? '<br><small>✓ Total dikonfirmasi</small>' : '') +
      (trxHistory ? '<br><small>History: <b>' + esc(trxHistory.no_nota) + '</b></small>' : '') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" data-lihat-ps="' + esc(p.id) + '">Lihat</button> ' +
      (wa ? '<a class="btn btn-ghost btn-sm" href="' + wa + '" target="_blank" rel="noopener">WA</a> ' : '') +
      konfirmBtn +
      (!selesai ? '<button class="btn btn-accent btn-sm" data-siap-ps="' + esc(p.id) + '">' +
        (siap ? '📣 Ready lagi' : (kirim ? '🚚 Ready dikirim' : '📦 Ready diambil')) + '</button> ' : '') +
      (siap ? '<button class="btn btn-ghost btn-sm" data-status-ps="' + esc(p.id) + '" data-status="baru">↩️ Batal siap</button> ' : '') +
      '<button class="btn btn-sm" data-status-ps="' + esc(p.id) + '" data-status="' + (selesai ? 'baru' : 'selesai') + '">' +
      (selesai ? 'Buka lagi' : (kirim ? '✓ Sudah sampai' : '✓ Sudah diambil')) + '</button> ' +
      '<button class="btn btn-danger btn-sm" data-hapus-ps="' + esc(p.id) + '">Hapus</button></td></tr>';
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">Belum ada pesanan masuk.</td></tr>';
  $$('[data-status-ps]').forEach(b => b.onclick = () => ubahStatusPesanan(b.dataset.statusPs, b.dataset.status));
  $$('[data-siap-ps]').forEach(b => b.onclick = () => tandaiSiapDiambil(b.dataset.siapPs));
  $$('[data-konfirm-ps]').forEach(b => b.onclick = () => konfirmasiPesananWA(b.dataset.konfirmPs));
  $$('[data-lihat-ps]').forEach(b => b.onclick = () => lihatPesanan(b.dataset.lihatPs));
  $$('[data-hapus-ps]').forEach(b => b.onclick = () => hapusPesananAdmin(b.dataset.hapusPs));
}
async function cekPesananBaru(awal) {
  if (!DB || !$('#appView') || $('#appView').style.display === 'none') return;
  if (!awal && Date.now() < skipPesananPollingHingga) return;
  const gen = pesananPollGen;
  try {
    const r = await post('/api/admin/pesanan', {});
    if (gen !== pesananPollGen) return;
    const items = Array.isArray(r.pesanan) ? r.pesanan : [];
    DB.pesanan = items;
    renderPesanan();
    const dikenal = knownPesanan();
    const baru = items.filter(p => !dikenal.has(p.id));
    items.forEach(p => dikenal.add(p.id));
    simpanKnownPesanan(dikenal);
    if (!awal && baru.length) {
      baru.slice(0, 3).forEach(notifikasiPesanan);
      if (baru.length > 3) notifikasiPesanan({ no_pesanan: '+' + (baru.length - 3) + ' pesanan', nama: 'Pesanan lainnya', total: 0 });
    }
  } catch (e) { /* polling diam-diam, tidak mengganggu kasir */ }
}
function bukaWaKe(pelanggan, teks) {
  const hp = String(pelanggan || '').replace(/[^0-9]/g, '');
  if (!hp) return false;
  const tujuan = hp.startsWith('0') ? '62' + hp.slice(1) : hp;
  window.open('https://wa.me/' + tujuan + '?text=' + encodeURIComponent(teks), '_blank');
  return true;
}
async function konfirmasiPesananWA(id) {
  const p = (DB.pesanan || []).find(x => x.id === id);
  if (!p) return;
  const kirim = p.metode === 'kurir';
  const inputOngkir = document.querySelector('[data-ongkir="' + CSS.escape(id) + '"]');
  const ongkir = kirim ? Math.max(0, Number(inputOngkir && inputOngkir.value) || 0) : 0;
  try {
    const r = await post('/api/admin/pesanan/konfirmasi', { id, ongkos_kurir: ongkir });
    if (r.error) throw new Error(r.error);
    Object.assign(p, {
      subtotal: (p.items || []).reduce((a, it) => a + (Number(it.harga) || 0) * (Number(it.qty) || 1), 0),
      ongkos_kurir: r.ongkos_kurir,
      total: r.total,
      dikonfirmasi: true
    });
    if ($('#pesananBody')) renderPesanan();
    const s = DB.settings || {};
    const sapa = 'Halo kak ' + (p.nama || 'Pelanggan') + '! 👋';
    const rincian = kirim
      ? 'Untuk pesanan *' + p.no_pesanan + '*:\n' +
        '🧾 Subtotal makanan: ' + rp(p.subtotal) + '\n' +
        '🚚 Ongkos kurir: ' + rp(p.ongkos_kurir) + '\n' +
        '💰 *Total jadi ' + rp(p.total) + '* ya kak.\n' +
        '📍 Alamat: ' + (p.alamat || '-') + (p.catatan ? '\n📝 Catatan: ' + p.catatan : '') + '\n'
      : 'Untuk pesanan *' + p.no_pesanan + '*, total jadi *' + rp(p.total) + '* ya kak.\n';
    const jam = !kirim && p.jam_ambil ? '🕒 Jam ambil: ' + p.jam_ambil + '\n' : '';
    const teks = sapa + '\n' + rincian + jam +
      '📍 ' + (s.nama_toko || 'SUNDAY BREAKFAST') + ' — ' + (s.alamat || '') +
      (s.maps_url ? '\n' + s.maps_url : '') +
      '\n\nKonfirmasi dulu ya kak, nanti kami kabarin kalau pesanan sudah ready 😊';
    if (!bukaWaKe(p.hp, teks)) return toast('No WhatsApp pelanggan belum ada, isi dulu ya');
    toast('✓ Total dikonfirmasi & WA dibuka');
    skipPesananPollingHingga = Date.now() + 12000;
    pesananPollGen++;
  } catch (e) { toast(e.message || String(e)); }
}
function bukaWaSiapDiambil(p) {
  const s = DB.settings || {};
  const kirim = p.metode === 'kurir';
  const teks = kirim
    ? 'Halo kak ' + (p.nama || 'Pelanggan') + '! 👋\n' +
      'Pesanan *' + p.no_pesanan + '* sudah *ready untuk dikirim* kak 🚚\n' +
      '💰 Total: ' + rp(p.total) + ' (ongkir ' + rp(p.ongkos_kurir || 0) + ')\n' +
      '📍 Alamat: ' + (p.alamat || '-') + '\n' +
      'Kurir kami segera berangkat ya kak, ditunggu kedatangannya 🙏'
    : 'Halo kak ' + (p.nama || 'Pelanggan') + '! 👋\n' +
      'Pesanan *' + p.no_pesanan + '* sudah *ready* kak, silakan diambil di ' +
      (s.nama_toko || 'SUNDAY BREAKFAST') + ' 🙌\n' +
      '💰 Total: ' + rp(p.total) + '\n' +
      (p.jam_ambil ? '🕒 Jam ambil: ' + p.jam_ambil + '\n' : '') +
      '📍 ' + (s.alamat || '') + (s.maps_url ? '\n' + s.maps_url : '') +
      '\n\nSampai jumpa ya kak! 😊';
  return bukaWaKe(p.hp, teks);
}
async function tandaiSiapDiambil(id) {
  const p = (DB.pesanan || []).find(x => x.id === id);
  if (!p) return;
  if (!bukaWaSiapDiambil(p)) return toast('No WhatsApp pelanggan belum ada, isi dulu ya');
  const lama = p.status;
  p.status = 'siap';
  if ($('#pesananBody')) renderPesanan();
  toast('✓ WA ready terkirim ke pelanggan');
  skipPesananPollingHingga = Date.now() + 12000;
  pesananPollGen++;
  try {
    await post('/api/admin/pesanan/status', { id, status: 'siap' });
    DB = await api('/api/admin/data');
    renderAll();
  } catch (e) { p.status = lama; renderPesanan(); toast(e.message); }
}
async function ubahStatusPesanan(id, status) {
  const p = (DB.pesanan || []).find(x => x.id === id);
  const dari = p ? p.status : '';
  if (p) { p.status = status; if ($('#pesananBody')) renderPesanan(); }
  toast(status === 'selesai' ? '✓ Memproses pesanan selesai...' : '✓ Membuka pesanan...');
  skipPesananPollingHingga = Date.now() + 12000;
  pesananPollGen++;
  try {
    const r = await post('/api/admin/pesanan/status', { id, status });
    DB = await api('/api/admin/data');
    renderAll();
    toast(status === 'selesai'
      ? (r.masuk_history ? '✓ Pesanan selesai & masuk History' : '✓ Pesanan selesai')
      : status === 'siap' ? '✓ Pesanan siap diambil'
      : dari === 'selesai' ? 'Pesanan dibuka lagi, struk dihapus dari History'
      : 'Pesanan dibuka lagi');
  } catch (e) { if (p) p.status = dari; renderPesanan(); toast(e.message); }
}
async function hapusPesananAdmin(id) {
  if (!confirm('Hapus pesanan ini dari daftar?')) return;
  try {
    await post('/api/admin/pesanan/hapus', { id });
    await cekPesananBaru(true);
    toast('Pesanan dihapus');
  } catch (e) { toast(e.message); }
}
function lihatPesanan(id) {
  const p = (DB.pesanan || []).find(x => x.id === id);
  if (!p) return;
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = '<div class="modal-box resep-modal"><h3>' + esc(p.no_pesanan) + '</h3>' +
    '<p class="struk-catatan">' + new Date(p.waktu).toLocaleString('id-ID') + ' · ' + esc(p.nama || '-') + ' · ' + esc(p.hp || '-') + '</p>' +
    '<div class="table-scroll"><table class="menu-table resep-table"><thead><tr><th>Item</th><th>Qty</th><th>Harga</th></tr></thead><tbody>' +
    (p.items || []).map(it => '<tr><td>' + esc(it.nama) + (it.mix ? '<br><small>🧊 ' + esc(it.mix) + '</small>' : '') + '</td><td>' + Number(it.qty||1) + '</td><td>' + rp(it.harga) + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="resep-total">' + (p.metode === 'kurir' ? '🚚 Alamat: ' + esc(p.alamat || '-') + (p.catatan ? '<br>📝 ' + esc(p.catatan) : '') + '<br>🧾 Subtotal: ' + rp(p.subtotal) + '<br>🚚 Ongkos kurir: ' + rp(p.ongkos_kurir || 0) : '🏍️ Ambil sendiri' + (p.jam_ambil ? '<br>🕒 Jam ambil: <b>' + esc(p.jam_ambil) + '</b>' : '')) + '<br>Total: <b>' + rp(p.total) + '</b>' + (p.dikonfirmasi ? '<br>✓ Sudah dikonfirmasi via WA' : '') + '</div>' +
    '<div class="modal-foot"><button class="btn btn-dark" id="psTutup">Tutup</button></div></div>';
  document.body.appendChild(bg);
  $('#psTutup').onclick = () => bg.remove();
  bg.onclick = e => { if (e.target === bg) bg.remove(); };
}
$('#refreshPesanan').onclick = async () => { await cekPesananBaru(true); toast('Pesanan dimuat ulang'); };
$('#pesananCari').oninput = renderPesanan;
$('#pesananFilter').onchange = renderPesanan;

function renderLaporan() {
  const t = trxDipilih();
  const omzet = t.reduce((a,x)=>a+Number(x.total),0);
  const hpp = t.reduce((a,x)=>a+Number(x.hpp||0),0);
  const laba = omzet - hpp;
  $('#lapStats').innerHTML =
    '<div class="stat-box"><b>'+t.length+'</b><span>Transaksi</span></div>' +
    '<div class="stat-box"><b>'+rp(omzet)+'</b><span>Omzet</span></div>' +
    '<div class="stat-box"><b style="color:'+(laba>=0?'#2E8B23':'#C62828')+'">'+rp(laba)+'</b><span>Laba Kotor</span></div>' +
    '<div class="stat-box"><b>'+rp(t.length?omzet/t.length:0)+'</b><span>Rata-rata / transaksi</span></div>';
  $('#lapJumlah').textContent = t.length+' transaksi';
  renderSalesItem(t); renderSalesPayment(t); renderGrafik();
  $('#lapBody').innerHTML = t.map(x =>
    '<tr><td><b>'+esc(x.no_nota)+'</b></td><td>'+new Date(x.waktu).toLocaleString('id-ID')+'</td>' +
    '<td>'+esc(x.metode)+'</td><td>'+x.items.reduce((a,i)=>a+i.qty,0)+' item</td>' +
    '<td><b>'+rp(x.total)+'</b></td><td style="color:#2E8B23">'+rp(x.total-Number(x.hpp||0))+'</td></tr>'
  ).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Belum ada transaksi pada periode ini</td></tr>';
  const peta = {};
  for (const tr of t) for (const it of tr.items) {
    peta[it.nama] = peta[it.nama] || { qty:0, omzet:0 };
    peta[it.nama].qty += Number(it.qty);
    peta[it.nama].omzet += Number(it.harga)*Number(it.qty);
  }
  const top = Object.entries(peta).sort((a,b)=>b[1].qty-a[1].qty).slice(0,8);
  const max = Math.max(1, ...top.map(x=>x[1].qty));
  $('#chartTop').innerHTML = top.map(([nama,v]) =>
    '<div class="chart-row"><span>'+esc(nama)+'</span><div class="chart-bar"><i style="width:'+Math.round(v.qty/max*100)+'%"></i></div><b>'+v.qty+' pcs</b></div>'
  ).join('') || '<p style="color:var(--muted)">Belum ada data</p>';
}
function renderDrive() {
  const p = DB.settings.printer || {};
  $('#driveEmail').value = p.drive_email || 'hi.ramadhanikusuma@gmail.com';
  $('#driveUrl').value = p.drive_url || (window.CONFIG && window.CONFIG.driveUrl) || '';
}
function infoTarget() {
  const s = DB.settings;
  const biaya = totalBiayaBulanan() || Number(s.target_biaya || 0);
  const laba = Number(s.target_laba || 0);
  const pajak = Number(s.pajak || 0);
  const hari = Math.max(1, Number(s.hari_buka || 30));
  const aktif = (DB.menu||[]).filter(m => m.aktif !== false && Number(m.harga) > 0);
  const margin = aktif.length
    ? aktif.reduce((a,m) => a + (Number(m.harga) - hppOf(m)) / Number(m.harga), 0) / aktif.length
    : 0.4;
  const omzet = (laba + biaya) / Math.max(0.01, margin - pajak/100);
  const hargaRata = aktif.length ? aktif.reduce((a,m) => a + Number(m.harga), 0) / aktif.length : 1;
  const pcs = omzet / hargaRata;
  return { biaya, laba, margin, omzet, pcs, perHari:pcs/hari, labaPerPcs:margin*hargaRata };
}
function renderTarget() {
  const s = DB.settings;
  if (document.activeElement !== $('#targetLaba')) $('#targetLaba').value = s.target_laba ?? 3500000;
  updateTargetOutput();
}
function updateTargetOutput() {
  const s = DB.settings, i = infoTarget();
  $('#targetBiaya').value = totalBiayaBulanan() || s.target_biaya || 0;
  $('#simOmzetBesar').textContent = rp(i.omzet);
  $('#simRingkas').textContent = rp(i.biaya) + ' biaya + ' + rp(i.laba) +
    ' target · margin ' + Math.round(i.margin * 100) + '%';
  $('#targetGrid').innerHTML =
    '<div class="highlight"><span>Omzet target / bulan</span><b>'+rp(i.omzet)+'</b></div>' +
    '<div><span>Omzet / hari</span><b>'+rp(i.omzet/Math.max(1,s.hari_buka||30))+'</b></div>' +
    '<div><span>Penjualan / hari</span><b>'+Math.ceil(i.perHari)+' pcs</b></div>' +
    '<div><span>Laba / pcs</span><b>'+rp(i.labaPerPcs)+'</b></div>';
  const omzetBulan = transaksiAktif().filter(t => {
    const d = new Date(t.waktu), now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((a,t) => a + Number(t.total||0), 0);
  const persen = i.omzet ? Math.min(100, Math.round(omzetBulan / i.omzet * 100)) : 0;
  $('#targetProgress').style.width = persen + '%';
  $('#targetProgressTeks').textContent = persen + '% dari ' + rp(i.omzet);
}
$('#targetLaba').addEventListener('input', () => {
  DB.settings.target_laba = Number($('#targetLaba').value) || 0;
  updateTargetOutput();
});
['#aturPajak','#aturHari'].forEach(id => $(id).addEventListener('input', () => {
  DB.settings[id === '#aturPajak' ? 'pajak' : 'hari_buka'] = Number($(id).value) || 0;
  updateTargetOutput();
}));
$('#simpanTarget').onclick = async () => {
  const s = { target_laba:Number($('#targetLaba').value)||0 };
  try { await post('/api/admin/save', { settings:s }); Object.assign(DB.settings,s); renderTarget(); toast('✓ Target tersimpan'); }
  catch(e){ toast(e.message); }
};
$('#refreshLaporan').onclick = async () => { DB = await api('/api/admin/data'); renderAll(); toast('Insight dimuat ulang'); };
$('#lapHariIni').onclick = () => { const h=new Date().toISOString().slice(0,10); $('#lapDari').value=h; $('#lapSampai').value=h; renderLaporan(); };
$('#lapBulanIni').onclick = () => { const d=new Date(); $('#lapDari').value=new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); $('#lapSampai').value=d.toISOString().slice(0,10); renderLaporan(); };
$('#lapTahunIni').onclick = () => { const d=new Date(); $('#lapDari').value=new Date(d.getFullYear(),0,1).toISOString().slice(0,10); $('#lapSampai').value=d.toISOString().slice(0,10); renderLaporan(); };
$$('#grafikTabs button').forEach(b => b.onclick = () => { grafikMode = b.dataset.grafik; renderGrafik(); });
$('#lapDari').onchange = renderLaporan;
$('#lapSampai').onchange = renderLaporan;
$$('[data-export]').forEach(b => b.onclick = () => {
  const q = new URLSearchParams({ jenis:b.dataset.export, dari:$('#lapDari').value, sampai:$('#lapSampai').value });
  window.location.href = apiUrl('/api/export?' + q);
});
$('#simpanDrive').onclick = async () => {
  const p = { ...(DB.settings.printer||{}), drive_email:$('#driveEmail').value.trim(), drive_url:$('#driveUrl').value.trim() };
  try { await post('/api/admin/save',{settings:{printer:p}}); DB.settings.printer=p; toast('✓ Pengaturan Drive tersimpan'); }
  catch(e){ toast(e.message); }
};
$('#kirimDrive').onclick = async () => {
  const url = $('#driveUrl').value.trim();
  if (!url) return toast('Isi URL Apps Script dulu (lihat panduan)');
  const jenis = ['transaksi','ringkasan','menu','resep','biaya','target'];
  $('#driveStatus').textContent = 'Mengirim '+jenis.length+' file...';
  let sukses = 0;
  for (const j of jenis) {
    try {
      const q = new URLSearchParams({ jenis:j, dari:$('#lapDari').value, sampai:$('#lapSampai').value });
      const r = await fetch(apiUrl('/api/export?'+q));
      const csvText = await r.text();
      const payload = { email:$('#driveEmail').value.trim(), name:'Sunday Breakfast - '+j, csv:csvText };
      if (AS_MODE) {
        payload.r = 'drive';
        payload.token = localStorage.getItem('sunday_token') || '';
      }
      await fetch(url, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(payload)
      });
      sukses++;
    } catch(e) { /* no-cors tidak bisa dibaca */ }
  }
  $('#driveStatus').textContent = sukses+' file dikirim. Cek Google Drive akun kamu, lalu buka Panduan jika belum muncul.';
  toast('✓ '+sukses+' insight dikirim');
};

/* =========================================================
   CETAK STRUK (LANGSUNG KE PRINTER / PRINT DIALOG)
   ========================================================= */
function btBridge() {
  try {
    return (window.SundayPrinter && window.SundayPrinter.isAvailable &&
      window.SundayPrinter.isAvailable()) ? window.SundayPrinter : null;
  } catch (e) { return null; }
}
function macPrinter() {
  const manual = $('#printerMacManual') ? $('#printerMacManual').value.trim() : '';
  const pilih = $('#printerMac') ? $('#printerMac').value.trim() : '';
  const tersimpan = ((DB.settings.printer || {}).mac || '').trim();
  return manual || pilih || tersimpan;
}
function bluetoothSiap() { return !!btBridge() && !!macPrinter(); }
function setBtStatus(pesan, gagal) {
  const el = $('#btStatus');
  if (!el) return;
  el.hidden = false;
  el.className = 'bt-status' + (gagal ? ' gagal' : '');
  el.textContent = pesan;
}
function kirimBluetooth(teks, base64) {
  return new Promise((resolve, reject) => {
    const bridge = btBridge();
    if (!bridge) return reject(new Error('Cetak Bluetooth hanya tersedia di APK Sunday Admin'));
    const mac = macPrinter();
    if (!mac) return reject(new Error('Pilih printer Bluetooth di Pengaturan dulu'));
    try { if (bridge.mintaIzinBluetooth) bridge.mintaIzinBluetooth(); } catch (e) {}
    const cb = 'sundayBtCb' + Math.random().toString(36).slice(2);
    const to = setTimeout(() => { bersihkan(); reject(new Error('Printer tidak merespons')); }, 20000);
    function bersihkan() { clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } }
    window[cb] = res => { bersihkan(); resolve(res || { ok:false, pesan:'Tidak ada respons printer' }); };
    try {
      if (base64 && bridge.printBase64) bridge.printBase64(mac, base64, cb);
      else bridge.printText(mac, teks, cb);
    } catch (e) { bersihkan(); reject(e); }
  });
}
async function cetakBluetooth(trx) {
  setBtStatus('Menyiapkan struk + logo...', false);
  try {
    const base64 = await strukEscPosBase64(trx);
    const r = await kirimBluetooth(strukLines(trx).join('\n') + '\n', base64);
    setBtStatus(r.pesan, !r.ok);
    toast(r.ok ? '✓ ' + r.pesan : r.pesan);
  } catch (e) {
    setBtStatus(e.message || String(e), true);
    toast(e.message || String(e));
  }
}
let daftarPrinterBT = [];
function macTersimpan() { return ((DB.settings.printer || {}).mac || '').trim(); }
function isiSelectPrinter(daftar) {
  const select = $('#printerMac');
  const tersimpan = macTersimpan();
  const peta = {};
  (daftar || []).forEach(d => { if (d && d.mac) peta[d.mac] = d; });
  if (tersimpan && !peta[tersimpan]) {
    peta[tersimpan] = { nama: ((DB.settings.printer || {}).nama || 'Printer tersimpan'), mac: tersimpan };
  }
  daftarPrinterBT = Object.keys(peta).map(mac => peta[mac]);
  select.innerHTML = '<option value="">Printer tersimpan / pilih manual</option>' +
    daftarPrinterBT.map(d => '<option value="'+esc(d.mac)+'">'+esc(d.nama||d.mac)+' — '+esc(d.mac)+
      (d.bond ? ' ('+(d.bond==='BONDED'?'terpasang':d.bond==='BONDING'?'menyambung':'belum dipasang')+')' : '')+'</option>').join('');
  select.value = tersimpan;
  $('#printerMacManual').value = tersimpan;
  renderDaftarPrinterBT(daftarPrinterBT);
}
function renderDaftarPrinterBT(daftar) {
  const box = $('#btDeviceList');
  if (!box) return;
  const aktif = macTersimpan();
  if (!daftar || !daftar.length) {
    box.innerHTML = '<div class="bt-device kosong">Belum ada printer. Nyalakan printer lalu tekan “Cari & Hubungkan Printer”.</div>';
    return;
  }
  box.innerHTML = daftar.map(d => {
    const mac = ((d && d.mac) || '').trim();
    if (!mac) return '';
    const nama = d.nama || mac;
    const bond = d.bond === 'BONDED' ? 'terpasang' : d.bond === 'BONDING' ? 'menyambung' : 'belum dipasang';
    return '<div class="bt-device"><div><b>'+esc(nama)+(mac === aktif ? ' • aktif' : '')+'</b>'+
      '<small>'+esc(mac)+' • '+bond+'</small></div>'+
      '<button type="button" class="btn btn-accent btn-sm" data-hubungkan="'+esc(mac)+'">Hubungkan</button></div>';
  }).join('');
}
function teksTestBT() {
  return 'SUNDAY BREAKFAST\nTEST KONEKSI\n' + new Date().toLocaleString('id-ID') + '\n';
}

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function muatGambarStruk(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 3500);
  });
}

async function logoRasterEscPos(src, lebarKertas) {
  const img = await muatGambarStruk(src);
  if (!img) return new Uint8Array(0);
  const maxDot = lebarKertas === 80 ? 576 : lebarKertas === 48 ? 384 : 384;
  const targetW = Math.min(maxDot, Math.max(120, Math.round(maxDot * 0.62)));
  const scale = targetW / (img.naturalWidth || img.width || targetW);
  const w = Math.max(8, Math.floor(targetW / 8) * 8);
  const h = Math.max(1, Math.round((img.naturalHeight || img.height || w) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const xBytes = Math.ceil(w / 8);
  const raster = new Uint8Array(xBytes * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
      const alpha = data[i + 3];
      if (alpha > 20 && lum < 160) raster[(y * xBytes) + Math.floor(x / 8)] |= (0x80 >> (x % 8));
    }
  }
  const header = [0x1D, 0x76, 0x30, 0x00, xBytes & 0xFF, (xBytes >> 8) & 0xFF, h & 0xFF, (h >> 8) & 0xFF];
  const out = new Uint8Array(header.length + raster.length + 3);
  out.set(header, 0);
  out.set(raster, header.length);
  out.set([0x1B, 0x61, 0x00], header.length + raster.length); // left align after logo
  return out;
}

async function strukEscPosBase64(trx) {
  const p = DB.settings.printer || {};
  const teks = strukLines(trx).join('\n') + '\n';
  const enc = new TextEncoder();
  const textBytes = enc.encode(teks);
  const logo = await logoRasterEscPos(p.logo || '/assets/logo-icon.png', lebarKertas());
  const init = [0x1B, 0x40, 0x1B, 0x61, 0x01]; // init + center
  const afterLogo = logo.length ? [0x0A] : [];
  const feed = [0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]; // feed + full cut/partial
  const out = new Uint8Array(init.length + logo.length + afterLogo.length + textBytes.length + feed.length);
  let o = 0;
  out.set(init, o); o += init.length;
  if (logo.length) { out.set(logo, o); o += logo.length; out.set(afterLogo, o); o += afterLogo.length; }
  out.set(textBytes, o); o += textBytes.length;
  out.set(feed, o);
  return bytesToBase64(out);
}
function hubungkanPrinterBT(mac) {
  return new Promise((resolve, reject) => {
    const bridge = btBridge();
    if (!bridge) return reject(new Error('Hubungkan printer hanya tersedia di APK Sunday Admin'));
    if (!mac) return reject(new Error('Pilih printer dulu ya'));
    const cb = 'sundayBtHub' + Math.random().toString(36).slice(2);
    const to = setTimeout(() => { bersihkan(); reject(new Error('Printer tidak merespons. Konfirmasi PIN 0000/1234 di HP.')); }, 45000);
    function bersihkan() { clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } }
    window[cb] = res => { bersihkan(); resolve(res || { ok:false, pesan:'Tidak ada respons printer' }); };
    try {
      if (typeof bridge.hubungkanPerangkat === 'function') bridge.hubungkanPerangkat(mac, cb);
      else bridge.pasangkanPerangkat(mac, cb);
    } catch (e) { bersihkan(); reject(e); }
  });
}
async function sambungkanPrinterBT(mac, nama) {
  if (!mac) return toast('Pilih printer dulu ya');
  setBtStatus('Menghubungkan ' + mac + '… Kalau muncul PIN, masukkan 0000 (atau 1234).', false);
  toast('Menyambungkan printer…');
  try {
    const r = await hubungkanPrinterBT(mac);
    if (!r.ok) { setBtStatus(r.pesan || 'Gagal menghubungkan printer', true); toast(r.pesan); return; }
    const p = { ...(DB.settings.printer || {}), mac,
      nama: nama || r.nama || ((DB.settings.printer || {}).nama) || 'Printer Bluetooth' };
    DB.settings.printer = p;
    $('#printerMac').value = mac;
    $('#printerMacManual').value = mac;
    try { await post('/api/admin/save', { settings: { printer: p } }); } catch (e) {}
    setBtStatus((r.pesan || 'Printer tersambung') + ' | pengaturan tersimpan. Mencoba cetak uji…', false);
    let uji = '';
    try { const t = await kirimBluetooth(teksTestBT()); uji = t.pesan || ''; }
    catch (e) { uji = 'Uji cetak: ' + (e.message || e); }
    setBtStatus((r.pesan || 'Printer tersambung') + ' | ' + uji, false);
    toast('✓ Printer tersambung & tersimpan');
    renderPrinter();
  } catch (e) { setBtStatus(e.message || String(e), true); toast(e.message); }
}
function cariPrinterBT(onUpdate) {
  return new Promise((resolve, reject) => {
    const bridge = btBridge();
    if (!bridge) return reject(new Error('Cari printer hanya tersedia di APK Sunday Admin'));
    const cb = 'sundayBtScan' + Math.random().toString(36).slice(2);
    let terakhir = { ok: true, pesan: 'Mencari printer...', perangkat: [], selesai: false };
    const to = setTimeout(() => {
      bersihkan();
      // Jangan gagal total: kembalikan hasil terakhir (mis. perangkat terpasang).
      terakhir.selesai = true;
      terakhir.pesan = terakhir.pesan || 'Pencarian selesai (timeout)';
      resolve(terakhir);
    }, 15000);
    function bersihkan() { clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } }
    window[cb] = res => {
      const data = res || {};
      terakhir = data;
      if (typeof onUpdate === 'function') onUpdate(data);
      if (data.selesai) { bersihkan(); resolve(data); }
    };
    try { bridge.cariPerangkat(cb); }
    catch (e) { bersihkan(); reject(e); }
  });
}
function renderPrinter() {
  const p = DB.settings.printer || {};
  $('#printerLebar').value = p.lebar || 58;
  $('#printerAuto').checked = p.autoprint !== false;
  $('#printerLogo').value = p.logo || '/assets/logo-icon.png';
  $('#printerHeader').value = p.header || '';
  $('#printerFooter').value = p.footer || '';
  const hint = $('#btPrinterHint');
  const bridge = btBridge();
  const tombol = ['#printerMac','#btnHubungkanBT','#btnCariPrinter','#btnIzinBT','#btnPairBT',
    '#btnBukaBluetooth','#btnDiagnosaBT','#btnTestBluetooth'];
  if (bridge) {
    let daftar = [], pesan = '';
    try {
      const raw = bridge.getPaired();
      const o = JSON.parse(raw);
      daftar = Array.isArray(o) ? o : (o.perangkat || []);
    } catch (e) { pesan = String(e.message || e); }
    isiSelectPrinter(daftar);
    if (!macPrinter() && daftar.length === 1 && daftar[0] && daftar[0].mac) {
      $('#printerMac').value = daftar[0].mac;
      $('#printerMacManual').value = daftar[0].mac;
    }
    tombol.forEach(s => { const el = $(s); if (el) el.disabled = false; });
    if (pesan.indexOf('ERROR') === 0) {
      hint.textContent = pesan + '. Tekan “Izinkan BT”, nyalakan Bluetooth, lalu cari lagi.';
    } else if (macPrinter()) {
      hint.textContent = 'Printer aktif: ' + ((DB.settings.printer || {}).nama || macPrinter()) +
        ' (' + macPrinter() + '). Tekan “Cari & Hubungkan Printer” untuk mengganti, atau “Test Print BT”.';
    } else {
      hint.innerHTML = 'Nyalakan printer → tekan <b>Cari &amp; Hubungkan Printer</b> → pilih printer. ' +
        'Aplikasi akan memasangkan dan menguji koneksi otomatis. PIN RPP02N biasanya <code>0000</code> atau <code>1234</code>.';
    }
  } else {
    isiSelectPrinter([]);
    tombol.forEach(s => { const el = $(s); if (el) el.disabled = true; });
    hint.textContent = 'Fitur cari & cetak Bluetooth aktif di APK Android Sunday Admin.';
  }
  updatePreviewStruk();
}
if ($('#printerMac')) $('#printerMac').onchange = e => { $('#printerMacManual').value = e.target.value; };
if ($('#btDeviceList')) $('#btDeviceList').onclick = e => {
  const b = e.target && e.target.closest ? e.target.closest('[data-hubungkan]') : null;
  if (!b) return;
  const d = daftarPrinterBT.find(x => x.mac === b.dataset.hubungkan) || {};
  sambungkanPrinterBT(b.dataset.hubungkan, d.nama);
};
function mulaiCariPrinter(autoHubungkan) {
  setBtStatus('Mencari printer Bluetooth…', false);
  return cariPrinterBT(data => {
    const d = data.perangkat || [];
    if (d.length) {
      isiSelectPrinter(daftarPrinterBT.concat(d));
      $('#btPrinterHint').textContent = data.pesan || ('Mencari… ' + d.length + ' perangkat ditemukan');
    }
  }).then(async r => {
    const d = r.perangkat || [];
    if (!r.ok) {
      setBtStatus((r.pesan || 'Gagal mencari printer') + ' Coba Izinkan BT, atau isi MAC manual lalu tekan “Hubungkan / Pasang manual”.', true);
      return;
    }
    isiSelectPrinter(daftarPrinterBT.concat(d));
    if (!d.length) {
      setBtStatus('Tidak ada perangkat terdeteksi. Jika printer sudah dipasangkan di Setelan HP, isi MAC di kolom manual lalu tekan “Hubungkan / Pasang manual”. ' + (r.pesan || ''), true);
      return;
    }
    $('#btPrinterHint').textContent = d.length + ' perangkat ditemukan. Tekan “Hubungkan” pada printer yang benar.';
    if (autoHubungkan && !macTersimpan() && d.length === 1) {
      await sambungkanPrinterBT(d[0].mac, d[0].nama);
    } else {
      setBtStatus(d.length + ' perangkat ditemukan. Pilih “Hubungkan” pada printer yang benar.', false);
      toast('✓ ' + d.length + ' perangkat ditemukan');
    }
  }).catch(e => { setBtStatus(e.message || String(e), true); toast(e.message); });
}
if ($('#btnHubungkanBT')) $('#btnHubungkanBT').onclick = () => mulaiCariPrinter(true);
if ($('#btnCariPrinter')) $('#btnCariPrinter').onclick = () => mulaiCariPrinter(false);
if ($('#btnIzinBT')) $('#btnIzinBT').onclick = () => {
  const bridge = btBridge();
  if (!bridge) return setBtStatus('Izinkan Bluetooth hanya tersedia di APK Sunday Admin.', true);
  try {
    const r = bridge.mintaIzinBluetooth ? bridge.mintaIzinBluetooth() : 'OK: izin Bluetooth sudah diberikan';
    setBtStatus(String(r), String(r).indexOf('ERROR') === 0);
    toast(String(r));
    renderPrinter();
  } catch (e) { setBtStatus('Gagal minta izin Bluetooth: ' + (e.message || e), true); }
};
if ($('#btnNyalakanBT')) $('#btnNyalakanBT').onclick = () => {
  const bridge = btBridge();
  if (!bridge) return setBtStatus('Nyalakan Bluetooth hanya tersedia di APK Sunday Admin.', true);
  try {
    const r = bridge.nyalakanBluetooth ? bridge.nyalakanBluetooth() : 'Buka Setelan Bluetooth';
    setBtStatus(String(r), String(r).indexOf('ERROR') === 0);
    toast(String(r));
  } catch (e) { setBtStatus(e.message || String(e), true); }
};
if ($('#btnPairBT')) $('#btnPairBT').onclick = async () => {
  const mac = macPrinter();
  if (!mac) return toast('Pilih printer dulu ya (Cari Printer Baru)');
  try { await sambungkanPrinterBT(mac); }
  catch (e) { setBtStatus(e.message || String(e), true); toast(e.message); }
};
if ($('#btnBukaBluetooth')) $('#btnBukaBluetooth').onclick = () => {
  const bridge = btBridge();
  if (!bridge) return toast('Buka halaman ini dari APK Sunday Admin');
  try { bridge.bukaSetelanBluetooth(); toast('Membuka Setelan Bluetooth'); }
  catch (e) { toast(e.message); }
};
if ($('#btnBukaSetelanApp')) $('#btnBukaSetelanApp').onclick = () => {
  const bridge = btBridge();
  if (!bridge) return toast('Buka halaman ini dari APK Sunday Admin');
  try { bridge.bukaSetelanAplikasi(); toast('Membuka Setelan Aplikasi'); }
  catch (e) { toast(e.message); }
};
if ($('#btnDiagnosaBT')) $('#btnDiagnosaBT').onclick = () => {
  const bridge = btBridge();
  if (!bridge) return setBtStatus('Bridge Bluetooth tidak tersedia. Buka halaman ini dari APK Sunday Admin.', true);
  try {
    const d = JSON.parse(bridge.diagnosa());
    const perangkat = (d.terpasang || []).map(x => x.nama + ' (' + x.mac + ')').join(', ') || '-';
    const msg =
      'Android ' + d.android + ' · WebView: ' + (d.url || '-') + '\n' +
      'Bluetooth: ' + (d.aktif ? 'aktif' : 'MATI') +
      ' · CONNECT: ' + (d.izinConnectAndroid ? 'OK' : 'BELUM') +
      ' · SCAN: ' + (d.izinScanAndroid ? 'OK' : 'BELUM') + '\n' +
      'Pencarian: ' + (d.scanAktif ? 'berjalan' : 'tidak berjalan') +
      ' · BLE scanner: ' + (d.bleScanner ? 'OK' : 'tidak ada') + '\n' +
      'GATT: ' + (d.gattInfo || '-') + '\n' +
      'Perangkat terpasang/terdeteksi: ' + perangkat;
    setBtStatus(msg, !d.aktif || !d.izinBluetooth);
    try { navigator.clipboard.writeText(msg); } catch (e) {}
    toast('Diagnosa Bluetooth ditampilkan');
  } catch (e) { setBtStatus('Gagal diagnosa: ' + (e.message || e), true); }
};
if ($('#btnTestBluetooth')) $('#btnTestBluetooth').onclick = () => {
  cetakBluetooth({ no_nota:'TEST-BT', waktu:new Date().toISOString(), kasir:'Admin',
    items:[{nama:'Lumpia BigMac',harga:5000,qty:1}], total:5000, bayar:5000, kembalian:0, metode:'Cash' });
};
function updatePreviewStruk() {
  $('#previewLogo').src = $('#printerLogo').value || '/assets/logo-icon.png';
  $('#previewHeader').textContent = $('#printerHeader').value || DB.settings.nama_toko || 'SUNDAY BREAKFAST';
  $('#previewFooter').textContent = $('#printerFooter').value || '';
}
['#printerLogo','#printerHeader','#printerFooter'].forEach(id => $(id).addEventListener('input', updatePreviewStruk));
$('#simpanPrinter').onclick = async () => {
  const p = { ...(DB.settings.printer||{}), lebar:Number($('#printerLebar').value),
    autoprint:$('#printerAuto').checked, logo:$('#printerLogo').value.trim(),
    header:$('#printerHeader').value.trim(), footer:$('#printerFooter').value.trim(),
    mac:macPrinter() };
  try { await post('/api/admin/save',{settings:{printer:p}}); DB.settings.printer=p; toast('✓ Pengaturan struk tersimpan'); renderPrinter(); }
  catch(e){ toast(e.message); }
};
function lebarKertas() {
  const v = Number((DB.settings.printer || {}).lebar || 58);
  return [48, 58, 80].indexOf(v) >= 0 ? v : 58;
}
function lebarChar() { return lebarKertas() === 80 ? 42 : lebarKertas() === 48 ? 24 : 32; }
function strukLines(trx) {
  const p = DB.settings.printer || {}, s = DB.settings;
  const w = lebarChar();
  const L = [];
  const tengah = t => L.push(t.padStart(Math.floor((w-t.length)/2)+t.length).slice(0,w));
  const garis = c => L.push(String(c).repeat(w));
  tengah(s.nama_toko || 'SUNDAY BREAKFAST');
  tengah(s.tagline || '');
  garis('-');
  L.push('No : '+(trx.no_nota||'-'));
  L.push('Tgl: '+new Date(trx.waktu).toLocaleString('id-ID'));
  L.push('Kasir: '+(trx.kasir||'Admin'));
  garis('-');
  for (const it of trx.items) {
    L.push(String(it.nama).slice(0,w-7)+'  '+it.qty+'x');
    if (it.mix) {
      const potong = String(it.mix);
      for (let i=0;i<potong.length;i+=w-2) L.push('  '+potong.slice(i,i+w-2));
    }
    L.push('   '+rp(it.harga)+'   = '+rp(it.harga*it.qty));
  }
  garis('-');
  L.push('TOTAL'.padEnd(w-12)+rp(trx.total));
  L.push('BAYAR'.padEnd(w-12)+rp(trx.bayar));
  L.push('KEMBALI'.padEnd(w-12)+rp(trx.kembalian));
  garis('=');
  tengah(p.footer || 'Terima kasih!');
  L.push('');
  return L;
}
function receiptHtml(trx) {
  const p = DB.settings.printer || {}, s = DB.settings;
  const logo = p.logo || '/assets/logo-icon.png';
  const header = p.header || s.nama_toko || 'SUNDAY BREAKFAST';
  const footer = p.footer || 'Terima kasih!';
  const cls = lebarKertas() === 80 ? ' lebar-80' : lebarKertas() === 48 ? ' lebar-48' : '';
  return '<div class="receipt' + cls + '">' +
    '<div class="receipt-head"><img src="'+esc(logo)+'" alt="Sunday"><b>'+esc(header)+'</b>' +
    '<small>'+esc(s.tagline||'')+'</small><small>'+esc(s.alamat||'')+'</small></div>' +
    '<div class="receipt-line"></div>' +
    '<div class="receipt-row"><span>No</span><span>'+esc(trx.no_nota||'-')+'</span></div>' +
    '<div class="receipt-row"><span>Tgl</span><span>'+new Date(trx.waktu).toLocaleString('id-ID')+'</span></div>' +
    '<div class="receipt-row"><span>Kasir</span><span>'+esc(trx.kasir||'Admin')+'</span></div>' +
    '<div class="receipt-row"><span>Metode</span><span>'+esc(trx.metode||'Cash')+'</span></div>' +
    '<div class="receipt-line"></div>' +
    trx.items.map(it => '<div class="receipt-item"><div class="receipt-row"><span>'+esc(it.nama)+' ×'+it.qty+'</span><span>'+rp(it.harga*it.qty)+'</span></div>' +
      (it.mix ? '<div class="mix">🧊 '+esc(it.mix)+'</div>' : '') + '</div>').join('') +
    '<div class="receipt-line"></div>' +
    '<div class="receipt-row receipt-total"><span>TOTAL</span><span>'+rp(trx.total)+'</span></div>' +
    '<div class="receipt-row"><span>BAYAR</span><span>'+rp(trx.bayar)+'</span></div>' +
    '<div class="receipt-row"><span>KEMBALI</span><span>'+rp(trx.kembalian)+'</span></div>' +
    '<div class="receipt-line"></div>' +
    '<div class="receipt-foot">'+esc(footer)+'</div></div>';
}
function cetakStruk(trx, otomatis) {
  const p = DB.settings.printer || {};
  if (otomatis && p.autoprint === false) return;
  if (otomatis && bluetoothSiap()) { cetakBluetooth(trx); return; }
  $('#receiptPrint').innerHTML = receiptHtml(trx);
  window.print();
}
$('#btnTestPrint').onclick = () => {
  const contoh = { no_nota:'TEST-001', waktu:new Date().toISOString(), kasir:'Admin',
    items:[{nama:'Lumpia BigMac',harga:5000,qty:2}], total:10000, bayar:20000, kembalian:10000, metode:'Cash' };
  cetakStruk(contoh, false);
};
$('#btnPrintFallback').onclick = () => {
  const contoh = { no_nota:'TEST-002', waktu:new Date().toISOString(), kasir:'Admin',
    items:[{nama:'Lumpia BigMac',harga:5000,qty:1}], total:5000, bayar:5000, kembalian:0, metode:'Cash' };
  $('#receiptPrint').innerHTML = receiptHtml(contoh); window.print();
};

/* ---------- START ---------- */
(async function init() {
  try {
    const r = await api('/api/admin/session');
    if (r.auth) await masuk();
  } catch (e) { /* biarkan login */ }
  setInterval(() => cekPesananBaru(false), 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) cekPesananBaru(false);
  });
})();
