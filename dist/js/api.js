async function apiJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* JSONP untuk Web App Google Apps Script (cross-origin, tanpa CORS) */
function apiJsonp(url, param) {
  param = param || 'callback';
  const nama = 'sundayCb' + Math.random().toString(36).slice(2);
  const sep = String(url).indexOf('?') >= 0 ? '&' : '?';
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const to = setTimeout(() => { bersihkan(); reject(new Error('Timeout memuat data')); }, 12000);
    function bersihkan() {
      clearTimeout(to);
      try { delete window[nama]; } catch (e) { window[nama] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    window[nama] = d => { bersihkan(); resolve(d); };
    s.onerror = () => { bersihkan(); reject(new Error('Gagal memuat data online')); };
    s.src = url + sep + param + '=' + encodeURIComponent(nama);
    document.head.appendChild(s);
  });
}

window.apiJson = apiJson;
window.apiJsonp = apiJsonp;
