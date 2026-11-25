/* ===== SUNDAY ADMIN — logika dashboard ===== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
let DB = null;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('buka');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('buka'), 2400);
}
async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
  return d;
}
const post = (url, data) => api(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
});

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
  DB = null;
  $('#appView').style.display = 'none';
  $('#loginView').style.display = 'grid';
  $('#pinInput').value = '';
}
$('#btnLogout').onclick = logout;
$('#btnLogout2').onclick = logout;

async function masuk() {
  try {
    DB = await api('/api/admin/data');
  } catch (e) { toast('Gagal memuat data: ' + e.message); return; }
  $('#loginView').style.display = 'none';
  $('#appView').style.display = 'block';
  renderAll();
  bukaView('kasir');
}

/* ---------- NAV ---------- */
const JUDUL = { dashboard:'Dashboard', kasir:'Kasir', menu:'Menu', hpp:'HPP',
  simulasi:'Simulasi Laba', laporan:'Laporan', receipt:'Receipt',
  toko:'Toko & Branding', upload:'Aset Foto', pengaturan:'Pengaturan' };
$$('.sb-nav button').forEach(b => b.onclick = () => bukaView(b.dataset.view));
$$('[data-goto]').forEach(b => b.onclick = () => bukaView(b.dataset.goto));
function bukaView(nama) {
  $$('.sb-nav button').forEach(b => b.classList.toggle('aktif', b.dataset.view === nama));
  $$('.view').forEach(v => v.classList.toggle('aktif', v.id === 'view-' + nama));
  $('#pageTitle').textContent = JUDUL[nama] || nama;
}

function renderAll() {
  renderDashboard(); renderMenu(); renderKasir(); renderHpp();
  renderBiaya(); renderKaryawan(); renderTarget();
  renderLaporan(); renderReceipt(); renderToko(); renderPrinter(); renderDrive();
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
  ['logo','URL Logo'], ['kertas_nota','Kertas nota (mm)']
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
$('#simpanPin').onclick = async () => {
  const p = $('#pinBaru').value.trim();
  if (!p) return toast('Isi PIN baru dulu');
  try { await post('/api/admin/save', { pin_baru: p }); $('#pinBaru').value = ''; toast('✓ PIN berhasil diganti'); }
  catch (e) { toast(e.message); }
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
}
$('#bayarInput').addEventListener('input', hitungKembalian);
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
    bg.innerHTML = '<div class="modal-box"><h3>Resep — '+esc(m.nama)+'</h3>' +
      '<p style="color:var(--muted);font-size:.76rem;margin:6px 0 16px">Isi bahan, jumlah, dan harga satuan. HPP dihitung otomatis.</p>' +
      '<table class="menu-table resep-table"><thead><tr><th>Bahan</th><th>Qty</th><th>Satuan</th><th>Harga Satuan</th><th>Subtotal</th><th></th></tr></thead><tbody>' +
      resep.map((r,i) => '<tr>' +
        '<td><input class="input" data-r="'+i+'" data-k="nama" value="'+esc(r.nama||'')+'" placeholder="Nama bahan"></td>' +
        '<td><input class="input" style="width:70px" type="number" min="0" step="any" data-r="'+i+'" data-k="qty" value="'+Number(r.qty||0)+'"></td>' +
        '<td><input class="input" style="width:80px" data-r="'+i+'" data-k="satuan" value="'+esc(r.satuan||'pcs')+'"></td>' +
        '<td><input class="input" style="width:110px" type="number" min="0" data-r="'+i+'" data-k="harga" value="'+Number(r.harga||0)+'"></td>' +
        '<td><b>'+rp(Number(r.qty||0)*Number(r.harga||0))+'</b></td>' +
        '<td><button class="btn btn-danger btn-sm" data-rd="'+i+'">✕</button></td></tr>').join('') +
      '</tbody></table>' +
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
    '<tr><td><input class="input" data-b="'+i+'" data-k="nama" value="'+esc(b.nama||'')+'"></td>' +
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
      (x.refunded ? '' : '<button class="btn btn-ghost btn-sm" data-refund="'+esc(x.id)+'">Refund</button>') +
      '<button class="btn btn-danger btn-sm" data-hapus="'+esc(x.id)+'">Hapus</button></div></td></tr>';
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Belum ada receipt</td></tr>';
  $$('[data-lihat]').forEach(b => b.onclick = () => lihatStruk(b.dataset.lihat));
  $$('[data-cetak]').forEach(b => b.onclick = () => {
    const trx = semua.find(x => x.id === b.dataset.cetak);
    if (trx) cetakStruk(trx, false);
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
    '<button class="btn btn-dark" id="strukCetak">🖨 Cetak</button></div></div>';
  document.body.appendChild(bg);
  $('#strukTutup').onclick = () => bg.remove();
  $('#strukCetak').onclick = () => cetakStruk(trx, false);
  bg.onclick = e => { if (e.target === bg) bg.remove(); };
}
$('#refreshReceipt').onclick = async () => { DB = await api('/api/admin/data'); renderAll(); toast('Receipt dimuat ulang'); };
$('#receiptCari').oninput = renderReceipt;
$('#receiptFilter').onchange = renderReceipt;
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
  $('#driveUrl').value = p.drive_url || '';
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
$('#refreshLaporan').onclick = async () => { DB = await api('/api/admin/data'); renderAll(); toast('Laporan dimuat ulang'); };
$('#lapHariIni').onclick = () => { const h=new Date().toISOString().slice(0,10); $('#lapDari').value=h; $('#lapSampai').value=h; renderLaporan(); };
$('#lapBulanIni').onclick = () => { const d=new Date(); $('#lapDari').value=new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); $('#lapSampai').value=d.toISOString().slice(0,10); renderLaporan(); };
$('#lapTahunIni').onclick = () => { const d=new Date(); $('#lapDari').value=new Date(d.getFullYear(),0,1).toISOString().slice(0,10); $('#lapSampai').value=d.toISOString().slice(0,10); renderLaporan(); };
$$('#grafikTabs button').forEach(b => b.onclick = () => { grafikMode = b.dataset.grafik; renderGrafik(); });
$('#lapDari').onchange = renderLaporan;
$('#lapSampai').onchange = renderLaporan;
$$('[data-export]').forEach(b => b.onclick = () => {
  const q = new URLSearchParams({ jenis:b.dataset.export, dari:$('#lapDari').value, sampai:$('#lapSampai').value });
  window.location.href = '/api/export?' + q;
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
      const r = await fetch('/api/export?'+q);
      const csvText = await r.text();
      await fetch(url, {
        method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({ email:$('#driveEmail').value.trim(), name:'Sunday Breakfast - '+j, csv:csvText })
      });
      sukses++;
    } catch(e) { /* no-cors tidak bisa dibaca */ }
  }
  $('#driveStatus').textContent = sukses+' file dikirim. Cek Google Drive akun kamu, lalu buka Panduan jika belum muncul.';
  toast('✓ '+sukses+' laporan dikirim');
};

/* =========================================================
   CETAK STRUK (LANGSUNG KE PRINTER / PRINT DIALOG)
   ========================================================= */
function renderPrinter() {
  const p = DB.settings.printer || {};
  $('#printerLebar').value = p.lebar || 58;
  $('#printerAuto').checked = p.autoprint !== false;
  $('#printerLogo').value = p.logo || '/assets/logo-icon.png';
  $('#printerHeader').value = p.header || '';
  $('#printerFooter').value = p.footer || '';
  updatePreviewStruk();
}
function updatePreviewStruk() {
  $('#previewLogo').src = $('#printerLogo').value || '/assets/logo-icon.png';
  $('#previewHeader').textContent = $('#printerHeader').value || DB.settings.nama_toko || 'SUNDAY BREAKFAST';
  $('#previewFooter').textContent = $('#printerFooter').value || '';
}
['#printerLogo','#printerHeader','#printerFooter'].forEach(id => $(id).addEventListener('input', updatePreviewStruk));
$('#simpanPrinter').onclick = async () => {
  const p = { ...(DB.settings.printer||{}), lebar:Number($('#printerLebar').value),
    autoprint:$('#printerAuto').checked, logo:$('#printerLogo').value.trim(),
    header:$('#printerHeader').value.trim(), footer:$('#printerFooter').value.trim() };
  try { await post('/api/admin/save',{settings:{printer:p}}); DB.settings.printer=p; toast('✓ Pengaturan struk tersimpan'); renderPrinter(); }
  catch(e){ toast(e.message); }
};
function strukLines(trx) {
  const p = DB.settings.printer || {}, s = DB.settings;
  const w = Number(p.lebar) === 80 ? 42 : 32;
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
  return '<div class="receipt' + (Number(p.lebar) === 80 ? ' lebar-80' : '') + '">' +
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
})();
