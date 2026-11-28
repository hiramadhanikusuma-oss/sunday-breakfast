/* ===== SUNDAY BREAKFAST — sisi pelanggan ===== */
let DATA = null;
let lines = [];
const $ = s => document.querySelector(s);
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('buka');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('buka'), 2400);
}
function isiPilihanJam() {
  const el = $('#opJam');
  if (!el || el.options.length > 1) return;
  for (let h = 7; h <= 21; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 21 && m > 0) continue;
      const v = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      el.add(new Option(v, v));
    }
  }
}
async function load() {
  const sumber = (window.CONFIG && window.CONFIG.dataUrl) || '/api/public';
  try {
    DATA = (window.CONFIG && window.CONFIG.dataJsonp && window.apiJsonp)
      ? await apiJsonp(sumber) : await apiJson(sumber);
  } catch (e) {
    try { DATA = await apiJson('data/public.json'); }
    catch (e2) { toast('Gagal memuat menu: ' + e2.message); return; }
  }
  const s = DATA.settings;
  document.title = s.nama_toko + ' — Pesan Online';
  const maps = s.maps_url || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.alamat || 'Sunday Breakfast Mataram'));
  $('#alamatLokasi').textContent = s.alamat;
  $('#alamatLokasi').href = maps;
  $('#btnMaps').href = maps;
  $('#igLokasi').textContent = s.instagram;
  $('#igLokasi').href = 'https://instagram.com/' + s.instagram.replace('@', '');
  $('#waLokasi').textContent = '+' + s.wa;
  $('#waLokasi').href = 'https://wa.me/' + s.wa;
  $('#btnWaLokasi').href = 'https://wa.me/' + s.wa;
  $('#footerIg').href = 'https://instagram.com/' + s.instagram.replace('@', '');
  $('#footerWa').href = 'https://wa.me/' + s.wa;
  // Warna brand dipakai sebagai tampilan utama. Tambahkan ?brand=0 untuk melihat tema lama.
  const q = new URLSearchParams(location.search);
  if (q.get('brand') === '0') {
    document.documentElement.classList.remove('brand-mode');
    localStorage.setItem('sunday_brand', '0');
  } else {
    if (s.warna_utama) document.documentElement.style.setProperty('--brand', s.warna_utama);
    if (s.warna_aksen) document.documentElement.style.setProperty('--accent', s.warna_aksen);
    document.documentElement.classList.add('brand-mode');
    if (q.get('brand') === '1') localStorage.setItem('sunday_brand', '1');
  }
  if (s.logo) document.querySelectorAll('img.brand-logo, .footer-brand img').forEach(i => i.src = s.logo);
  renderKategori();
  renderMenu('');
  renderBar();
  setupReveal();
}
function kategoriList() {
  const k = []; for (const m of DATA.menu) if (!k.includes(m.kategori)) k.push(m.kategori); return k;
}
function isHabis(m) { return !!m.habis || (m.stok !== null && m.stok !== undefined && Number(m.stok) <= 0); }
const KAT_META = {
  'Lumpia':        { ikon: '🥟', desc: 'Crispy di luar, lumer di dalam' },
  'Lumpia Frozen': { ikon: '🧊', desc: 'Bawa pulang, tinggal goreng' },
  'Batagor':       { ikon: '🍢', desc: 'Gurih & creamy' },
  'Balls':         { ikon: '🧀', desc: 'Keju meleleh tiap gigitan' },
  'Drinks':        { ikon: '🥤', desc: 'Segar & dingin' }
};
function renderKategori() {
  const nav = $('#katNav'); nav.innerHTML = '';
  const semua = document.createElement('button');
  semua.innerHTML = '<span class="kat-ikon">✨</span> Semua';
  semua.className = 'aktif';
  semua.onclick = () => { [...nav.children].forEach(b => b.classList.remove('aktif')); semua.classList.add('aktif'); renderMenu(''); };
  nav.appendChild(semua);
  for (const k of kategoriList()) {
    const meta = KAT_META[k] || { ikon: '🍽️' };
    const b = document.createElement('button');
    b.innerHTML = '<span class="kat-ikon">' + meta.ikon + '</span> ' + k;
    b.onclick = () => { [...nav.children].forEach(x => x.classList.remove('aktif')); b.classList.add('aktif'); renderMenu(k); };
    nav.appendChild(b);
  }
}
function lineOf(menuId, mix) {
  return lines.find(l => l.menu_id === menuId && (l.mix || '') === (mix || ''));
}
function qtyOf(menuId) {
  return lines.filter(l => l.menu_id === menuId).reduce((a, l) => a + l.qty, 0);
}
function miniCard(m) {
  const habis = isHabis(m);
  const card = document.createElement('article');
  card.className = 'mini-card' + (habis ? ' habis' : '') + (m.is_mix ? ' mix' : '');
  const foto = m.foto
    ? '<img class="mc-img" src="' + m.foto + '" alt="' + m.nama + '" loading="lazy">'
    : '<div class="mc-img mc-ikon">' + (m.ikon || '🍽️') + '</div>';
  const q = qtyOf(m.id);
  let ctrl;
  if (habis) {
    ctrl = '<span class="mc-habis">SOLD OUT</span>';
  } else if (m.is_mix) {
    ctrl = '<button class="mc-pick">🧊 Pilih Rasa' + (q ? ' <b class="mc-qty">×' + q + '</b>' : '') + '</button>';
  } else {
    ctrl = '<div class="mc-step">' +
      '<button class="ms-btn" data-a="min" ' + (q === 0 ? 'disabled' : '') + '>−</button>' +
      '<b class="mc-qty">' + q + '</b>' +
      '<button class="ms-btn plus" data-a="plus">＋</button></div>';
  }
  card.innerHTML =
    '<div class="mc-media">' + foto + '<span class="mc-tag">' + (m.kategori || 'Menu') + '</span>' +
      (m.unggulan ? '<span class="mc-unggulan">★ Unggulan</span>' : '') + '</div>' +
    '<div class="mc-body">' +
      '<div class="mc-name">' + m.nama + '</div>' +
      (m.deskripsi ? '<div class="mc-desc">' + m.deskripsi + '</div>' : '') +
      (!habis && m.stok !== null && m.stok !== undefined ? '<div class="mc-stok">Sisa ' + m.stok + ' pcs</div>' : '') +
      '<div class="mc-foot"><div class="mc-price">' + rp(m.harga) +
        (m.is_mix ? '<small>/ pack 6 pcs</small>' : '') + '</div>' + ctrl + '</div>' +
    '</div>';
  if (!habis) {
    if (m.is_mix) {
      card.querySelector('.mc-pick').onclick = () => bukaPilihRasa(m);
    } else {
      card.querySelector('[data-a=plus]').onclick = () => { setQty(m.id, null, qtyOf(m.id) + 1); };
      card.querySelector('[data-a=min]').onclick = () => { setQty(m.id, null, Math.max(0, qtyOf(m.id) - 1)); };
    }
  }
  card.classList.add('reveal');
  return card;
}
function renderMenu(filterKategori = null) {
  const wrap = $('#menuGrid'); wrap.innerHTML = '';
  const kategori = kategoriList().filter(k => !filterKategori || k === filterKategori);
  for (const k of kategori) {
    const items = DATA.menu.filter(x => x.kategori === k);
    if (!items.length) continue;
    const meta = KAT_META[k] || { ikon: '🍽️', desc: '' };
    const group = document.createElement('div');
    group.className = 'cat-row';
    group.innerHTML =
      '<div class="cat-row-head"><span class="cat-row-ikon">' + meta.ikon + '</span>' +
      '<h3 class="cat-row-title">' + k + '</h3>' +
      (meta.desc ? '<span class="cat-row-desc">' + meta.desc + '</span>' : '') + '</div>';
    const scroll = document.createElement('div'); scroll.className = 'cat-scroll';
    for (const m of items) scroll.appendChild(miniCard(m));
    group.appendChild(scroll);
    wrap.appendChild(group);
  }
  setupReveal();
}
function setQty(menuId, mix, qty) {
  const menu = DATA.menu.find(m => m.id === menuId);
  if (!mix && menu && menu.stok !== null && menu.stok !== undefined && qty > Number(menu.stok)) {
    toast('Stok ' + menu.nama + ' tinggal ' + menu.stok);
    return;
  }
  const key = mix || '';
  let l = lineOf(menuId, key);
  if (qty <= 0) { lines = lines.filter(x => !(x.menu_id === menuId && (x.mix || '') === key)); }
  else if (l) l.qty = qty;
  else lines.push({ menu_id: menuId, qty, mix: mix || undefined });
  renderMenu($('#katNav .aktif') && !$('#katNav .aktif').textContent.includes('Semua') ? kategoriAktif() : '');
  renderBar();
}
function kategoriAktif() {
  const a = $('#katNav .aktif');
  if (!a) return '';
  const t = a.textContent.replace('✨', '').replace('Semua', '').trim();
  return t === '' ? '' : t;
}
function lumpiaReadyList() {
  return DATA.menu.filter(m => m.kategori === 'Lumpia' && !isHabis(m));
}
function bukaPilihRasa(mixItem) {
  const rasaList = lumpiaReadyList();
  if (!rasaList.length) { toast('Belum ada rasa lumpia ready'); return; }
  const dipilih = {};
  let total = 0;
  const modal = document.createElement('div');
  modal.className = 'modal-wrap buka';
  modal.id = 'modalMix';
  function draw() {
    total = Object.values(dipilih).reduce((a, b) => a + b, 0);
    modal.innerHTML =
      '<div class="modal modal-mix">' +
      '<button class="modal-close" id="mixTutup">✕</button>' +
      '<h3>🧊 Pilih 6 Rasa Lumpia</h3>' +
      '<p class="mix-sub">Pilih <b>' + total + '/6</b> — campur boleh, rasa sama juga boleh 😋</p>' +
      '<div class="mix-grid">' +
      rasaList.map(r => {
        const q = dipilih[r.id] || 0;
        return '<div class="mix-item' + (q > 0 ? ' aktif' : '') + '">' +
          (r.foto ? '<img src="' + r.foto + '" alt="">' : '<div class="mix-ikon">' + (r.ikon || '🥟') + '</div>') +
          '<div class="mix-nama">' + r.nama + '</div>' +
          '<div class="mix-qty">' + (q > 0
            ? '<button class="mq min" data-id="' + r.id + '">−</button><b>' + q + '</b><button class="mq plus" data-id="' + r.id + '">＋</button>'
            : '<button class="mq plus" data-id="' + r.id + '">＋</button>') + '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<button class="btn-wa" id="mixOk" ' + (total !== 6 ? 'disabled' : '') + '>✔ Tambah (' + total + '/6)</button>' +
      '</div>';
    modal.querySelector('#mixTutup').onclick = () => modal.remove();
    modal.querySelectorAll('.mix-item').forEach(el => {
      el.querySelectorAll('.mq').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const id = b.dataset.id;
        if (b.classList.contains('plus')) {
          if (total >= 6) { toast('Sudah 6 pcs ya! Kurangi dulu kalau mau ganti 😄'); return; }
          const r = rasaList.find(x => x.id === id);
          if (r && (dipilih[id] || 0) >= Number(r.stok)) { toast('Stok ' + r.nama + ' tinggal ' + r.stok); return; }
          dipilih[id] = (dipilih[id] || 0) + 1;
        } else if (dipilih[id]) { dipilih[id]--; if (dipilih[id] <= 0) delete dipilih[id]; }
        draw();
      });
    });
    const ok = modal.querySelector('#mixOk');
    if (total === 6) ok.onclick = () => {
      if (mixItem.stok !== null && mixItem.stok !== undefined && qtyOf(mixItem.id) + 1 > Number(mixItem.stok)) {
        toast('Stok ' + mixItem.nama + ' tinggal ' + mixItem.stok);
        return;
      }
      const detail = rasaList.filter(r => dipilih[r.id]).map(r => dipilih[r.id] + '× ' + r.nama).join(', ');
      const l = lineOf(mixItem.id, detail);
      if (l) l.qty++; else lines.push({ menu_id: mixItem.id, qty: 1, mix: detail });
      renderMenu(kategoriAktif());
      renderBar();
      modal.remove();
      toast('✔ Lumpia Frozen Mix 6 ditambah');
    };
  }
  draw();
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
}
function lineItems() {
  return lines.map(l => {
    const m = DATA.menu.find(x => x.id === l.menu_id);
    return m ? { ...l, nama: m.nama, harga: m.harga } : null;
  }).filter(Boolean);
}
function totalQty() { return lines.reduce((a, l) => a + l.qty, 0); }
function totalRp() { return lineItems().reduce((a, c) => a + c.harga * c.qty, 0); }
function renderBar() {
  const n = totalQty();
  const bar = $('#orderBar');
  bar.style.display = n > 0 ? 'flex' : 'none';
  $('#obCount').textContent = n;
  $('#obTotal').textContent = rp(totalRp());
  document.body.classList.toggle('ada-bar', n > 0);
  renderPanel();
}
function renderPanel() {
  const p = $('#orderPanel');
  if (!p || p.style.display === 'none') return;
  const items = lineItems();
  $('#opList').innerHTML = items.length ? items.map((c, i) =>
    '<div class="op-row"><div class="op-info"><b>' + c.nama + '</b>' +
    (c.mix ? '<small>🧊 ' + c.mix + '</small>' : '') +
    '<small>' + rp(c.harga) + ' × ' + c.qty + ' = ' + rp(c.harga * c.qty) + '</small></div>' +
    '<div class="mc-step"><button class="ms-btn" data-i="' + i + '" data-a="min">−</button><b class="mc-qty">' + c.qty + '</b><button class="ms-btn plus" data-i="' + i + '" data-a="plus">＋</button></div></div>'
  ).join('') : '<div class="kosong">Belum ada pesanan</div>';
  $('#opList').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    const l = lines[+b.dataset.i];
    if (!l) return;
    setQty(l.menu_id, l.mix || null, l.qty + (b.dataset.a === 'plus' ? 1 : -1));
  });
}
function bukaFormPesanan() {
  const p = $('#orderPanel');
  p.style.display = 'block';
  renderPanel();
  $('#menu').scrollIntoView({ behavior:'smooth', block:'start' });
  toast('Isi nama & no HP, pilih pengirimannya ya 🙂');
  setTimeout(() => { const f = $('#opNama'); if (f) f.focus({ preventScroll:true }); }, 450);
}
function dataFormPesanan() {
  const pilih = document.querySelector('input[name=kirim]:checked');
  return {
    metode: pilih && pilih.value === 'kurir' ? 'kurir' : 'ambil',
    nama: ($('#opNama').value || '').trim(),
    hp: ($('#opHp').value || '').trim(),
    alamat: ($('#opAlamat').value || '').trim(),
    catatan: ($('#opCatatan').value || '').trim(),
    jam_ambil: ($('#opJam').value || '').trim()
  };
}
function validasiForm(f) {
  if (!f.nama) { $('#opNama').focus(); return 'Isi nama kamu dulu ya'; }
  if (!f.hp) { $('#opHp').focus(); return 'Isi no HP / WhatsApp dulu ya'; }
  if (f.metode === 'kurir' && !f.alamat) { $('#opAlamat').focus(); return 'Isi alamat tujuan dulu ya'; }
  return '';
}
function infoKirim(f) {
  if (f.metode !== 'kurir') return '🏍️ Ambil sendiri di toko\n   🕒 Jam ambil: ' + (f.jam_ambil || 'kapan saja');
  return '🚚 Kurir ke rumah\n   📍 Alamat: ' + f.alamat +
    (f.catatan ? '\n   📝 Catatan: ' + f.catatan : '');
}
function urlPesanan() {
  const c = window.CONFIG || {};
  if (c.orderUrl) return c.orderUrl;
  if (c.dataUrl) return String(c.dataUrl).split('?')[0];
  if (c.apiBase) return String(c.apiBase).replace(/\/$/, '');
  return '/api/order';
}
async function kirimPesananOnline(payload) {
  try {
    await fetch(urlPesanan(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(Object.assign({ r: '/api/order' }, payload))
    });
    return true;
  } catch (e) { return false; }
}
async function kirimWA() {
  const items = lineItems();
  if (!items.length) { bukaFormPesanan(); return toast('Pilih menu dulu ya'); }
  const f = dataFormPesanan();
  const err = validasiForm(f);
  if (err) { $('#orderPanel').style.display = 'block'; return toast(err); }

  const btn = $('#obWa'), teksAwal = btn.textContent;
  btn.disabled = true; btn.textContent = 'Mengirim...';
  const noPesanan = 'PS-' + Date.now().toString(36).toUpperCase();
  const online = await kirimPesananOnline({
    id: 'ps_' + Date.now().toString(36),
    no_pesanan: noPesanan,
    nama: f.nama, hp: f.hp, metode: f.metode,
    alamat: f.alamat, catatan: f.catatan, jam_ambil: f.jam_ambil,
    total: totalRp(), items: items.map(c => ({
      menu_id: c.menu_id, nama: c.nama, harga: c.harga, qty: c.qty, mix: c.mix || ''
    }))
  });
  btn.disabled = false; btn.textContent = teksAwal;

  const s = DATA.settings;
  const linesTxt = items.map((c, i) =>
    (i + 1) + '. ' + c.nama + ' ×' + c.qty + ' = ' + rp(c.harga * c.qty) + (c.mix ? '\n   └ 🧊 isi: ' + c.mix : '')
  );
  const text =
    'Halo ' + s.nama_toko + '! 👋🍳\n' +
    '📦 *Pesanan ' + noPesanan + '*\n' +
    '👤 Nama: ' + f.nama + '\n' +
    '📱 No. HP: ' + f.hp + '\n' +
    'Saya mau pesan:\n' + linesTxt.join('\n') + '\n' +
    '💰 *Total: ' + rp(totalRp()) + '*\n' +
    infoKirim(f) + '\n' +
    '\nTerima kasih! 🙏';
  const url = 'https://wa.me/' + s.wa + '?text=' + encodeURIComponent(text);
  const w = window.open(url, '_blank');
  if (!w) window.location.href = url;
  toast(online ? 'Pesanan masuk ke WA & aplikasi admin ✔' : 'Pesanan diarahkan ke WhatsApp ✔');
}
$('#obWa').onclick = kirimWA;
$('#btnWaHeader').onclick = bukaFormPesanan;
$('#obInfo').onclick = () => {
  const p = $('#orderPanel');
  const buka = p.style.display === 'none';
  p.style.display = buka ? 'block' : 'none';
  if (buka) renderPanel();
};
$('#opTutup').onclick = () => { $('#orderPanel').style.display = 'none'; };
function updateFormPengiriman() {
  const r = document.querySelector('input[name=kirim]:checked');
  const kurir = !!r && r.value === 'kurir';
  $('#opAlamatWrap').style.display = kurir ? 'block' : 'none';
  $('#opAmbilWrap').style.display = kurir ? 'none' : 'block';
}
Array.from(document.querySelectorAll('input[name=kirim]')).forEach(r => r.onchange = updateFormPengiriman);
updateFormPengiriman();
window.addEventListener('scroll', () => {
  document.getElementById('siteHeader').classList.toggle('scrolled', window.scrollY > 20);
});
let revealTimer = null;
function setupReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .08, rootMargin: '0px 0px 40px 0px' });
  document.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')), 1600);
}
isiPilihanJam();
load();