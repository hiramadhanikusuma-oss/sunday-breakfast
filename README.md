# Sunday Breakfast

Website pemesanan + admin panel untuk Sunday Breakfast, Mataram.

## Menjalankan lokal

```bash
npm start
```

- Website pelanggan: http://localhost:3000
- Admin: http://localhost:3000/admin
- PIN admin default: `sunday123`
- Tema brand biru/kuning dipakai sebagai tampilan utama. Tambahkan `?brand=0` untuk melihat tema lama.

## Build website pelanggan (statis)

```bash
npm run build
```

Hasil ada di folder `dist/`. Folder ini berisi HTML, CSS, JS, aset, dan `data/public.json` (berisi settings + menu dari `data/db.json`).

Versi statis cocok untuk GitHub Pages, Vercel, atau Netlify. Admin panel tetap dijalankan lewat Node server lokal.

## Deploy ke Vercel

Dari folder `dist/`:

```bash
vercel --prod --yes --name sunday-breakfast
```

## Catatan

- Perubahan menu/harga dari admin tersimpan di `data/db.json`.
- Jalankan `npm run build` ulang setelah mengubah menu agar deployment publik ikut terbarui.
- Google Drive otomatis memerlukan URL Apps Script Web App; panduan ada di `PANDUAN_GDRIVE.txt`.
