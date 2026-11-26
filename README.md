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

Versi statis cocok untuk GitHub Pages, Vercel, atau Netlify. Website pelanggan produksi: https://sunday-breakfast.vercel.app

Website pelanggan mengambil settings + menu **langsung dari Google Sheet** lewat endpoint `/api/public` (JSONP), dengan fallback ke `data/public.json` bila online gagal.

## Deploy ke Vercel

Dari folder `dist/`:

```bash
vercel --prod --yes --name sunday-breakfast
```

## Admin online (gratis) — Google Apps Script + Google Sheet

Admin yang bisa dibuka dari mana saja memakai Google Apps Script Web App dengan database Google Sheet bernama `db` (kolom `collection`, `id`, `json`). Tidak perlu hosting berbayar.

URL Web App produksi:

```
https://script.google.com/macros/s/AKfycbwkjr5W3iJ61Am_FV0vuAfECrdQCKuaP2HZtWeJz-WCMEfTkgHw5ToWT5RbHkgQu-0/exec
```

- Login dengan PIN `sunday123` (bisa diganti di Pengaturan).
- Data tersimpan di Spreadsheet "Sunday Breakfast — Database" di akun Google `hi.ramadhanikusuma@gmail.com`. ID spreadsheet disimpan di Script Properties `sunday_sheet_id`.
- Laporan CSV bisa diekspor dan/atau disimpan otomatis ke Google Drive folder "Sunday Breakfast — Laporan".

### Regenerate & deploy ulang admin online

```bash
node build-apps-script.js
cd apps-script
npx clasp push -f
npx clasp deploy --description "Admin online"
```

File `apps-script/Code.gs` dan `appsscript.json` dibuat otomatis — jangan diedit manual. Setiap deploy menghasilkan URL `/exec` baru; perbarui URL di `android-app/capacitor.config.json` bila URL berubah.

## APK Android (WebView, gratis)

Folder `android-app/` berisi project Capacitor yang membuka URL Web App admin di atas di dalam WebView Android.

```bash
cd android-app
npm install
npx cap sync android
cd android
gradlew.bat assembleDebug
```

APK debug ada di `android-app/android/app/build/outputs/apk/debug/app-debug.apk`. Install di HP Android dengan `adb install app-debug.apk` atau copy file lalu buka (izinkan install dari sumber tidak dikenal).

Build memerlukan **JDK 21** (Capacitor/AGP saat ini), Android SDK platform 34 + build-tools 34.0.0. Contoh build di Windows:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.13.10002-hotspot'
cd android-app\android
.\gradlew.bat assembleDebug
```

## Catatan

- Perubahan menu/harga dari admin online tersimpan di Google Sheet. Untuk memperbarui website pelanggan, jalankan `npm run build` ulang lalu deploy ulang `dist/`.
- Server lokal (`node server.js`) memakai `data/db.json`; admin online memakai Google Sheet — keduanya terpisah.
- Google Drive otomatis memerlukan URL Apps Script Web App; panduan ada di `PANDUAN_GDRIVE.txt`.
