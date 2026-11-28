# Sunday Breakfast

Website pemesanan + admin panel untuk Sunday Breakfast, Mataram.

## Menjalankan lokal

```bash
npm start
```

- Website pelanggan: http://localhost:3000
- Admin: http://localhost:3000/admin
- PIN admin default: `800008`
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
https://script.google.com/macros/s/AKfycbw3KAYec7esRiP7_cudEjBCRWd73j3Guvi0jHeuj0VQQJYLpalPc6e8Uoa_LQACC316/exec
```

- Login dengan PIN `800008` (bisa diganti di Pengaturan). Input PIN memakai keyboard teks/angka, jadi PIN apa pun bisa diketik di HP.
- PIN yang aktif terlihat di Spreadsheet → sheet `db` → baris `settings` / `pin_admin` (nilainya `800008`). Login tetap memakai hash PIN; website pelanggan tidak menerima data PIN.
- Data tersimpan di Spreadsheet "Sunday Breakfast — Database" di akun Google `hi.ramadhanikusuma@gmail.com`. ID spreadsheet disimpan di Script Properties `sunday_sheet_id`.
- Laporan CSV bisa diekspor dan/atau disimpan otomatis ke Google Drive folder "Sunday Breakfast — Laporan".
- Website pelanggan memakai form besar: tombol **🍳 Pesan Sekarang** / **Pilih Menu & Pesan**, panel pesanan otomatis terbuka saat menu pertama dipilih. **Nama** dan **No. WhatsApp** wajib; **Alamat** wajib kalau pilih kurir; **Catatan untuk kurir** opsional. Untuk **Ambil sendiri**, jam ambil bisa dipilih (07.00–21.00 atau “kapan saja”). Tombol hijau **📲 KIRIM PESANAN VIA WHATSAPP** selalu membuka WA setelah validasi, dan pesanan juga masuk ke menu **Pesanan Masuk** di admin/APK.
- Ongkos kurir diatur di **Toko & Branding → Ongkos Kurir (Rp)** (bawaan `10000`). Form menampilkan ongkir, WA pelanggan merincikan subtotal + ongkir + total, dan kakak admin bisa mengubah ongkir lalu menekan **💬 Konfirmasi total** untuk mengirim WA berisi "total jadi segini" beserta alamat/jam ambil dan Maps.
- Di **Pesanan Masuk**, tekan **📦 Ready diambil** / **🚚 Ready dikirim** untuk mengirim WA "pesanan ready kak" ke pelanggan. Status berubah jadi **Siap**; tombol **📣 Ready lagi** mengirim ulang notifikasi dan **↩️ Batal siap** membatalkannya.
- Tekan **✓ Sudah diambil** / **✓ Sudah sampai** hanya setelah barang diterima. Saat itu struk otomatis dibuat di **History** dengan nomor pesanan yang sama, stok berkurang, dan HPP item (tanpa ongkir) tercatat di **Insight**. Membuka lagi pesanan akan menghapus struk itu dan mengembalikan stok bila belum refund. Ongkos kurir ikut tersimpan di struk sebagai informasi, bukan HPP.
- Admin/APK mendapat notifikasi Android + badge untuk pesanan baru. APK melakukan polling tiap 5 menit walau aplikasi tertutup (izinkan **Notifikasi** saat diminta).
- Menu **Receipt** diganti **History**, menu **Laporan** diganti **Insight**.

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

### Cetak struk ke printer Bluetooth (RPP02N / 58 mm)
APK sekarang bisa mencari **dan memasangkan** printer seperti aplikasi POS — tidak perlu pairing manual dari Setelan HP.

1. Nyalakan printer RPP02N (LED menyala/berkedip sesuai mode pairing).
2. Buka APK Sunday Admin, izinkan **Nearby devices / Bluetooth** (Android 12+) atau **Lokasi** (Android 11 ke bawah) saat diminta. Bila terlewat, masuk **Pengaturan → Printer Bluetooth** dan tekan **1. Izinkan BT**, lalu **Diagnosa BT** sekali lagi.
3. Tekan **2. Cari Printer Baru**, pilih printer dari daftar (atau isi MAC manual).
4. Tekan **3. Pasangkan Printer**. Saat popup PIN muncul, masukkan `0000` (atau `1234` jika ditolak). Status pairing muncul di kotak status. **Buka Setelan BT** tetap tersedia sebagai cadangan.
5. Tekan **Simpan Pengaturan Struk**, lalu **Test Print BT**. Jika gagal, pesan error lengkap tampil di kotak status; aplikasi mencoba 5 metode koneksi (SPP aman, SPP tanpa otorisasi, RFCOMM port 1/2, RFCOMM insecure port 1).
6. Setelah itu, pembayaran otomatis cetak ke printer Bluetooth. Tombol **BT** di History dan **Cetak Bluetooth** di modal struk juga tersedia.

Bridge native `SundayPrinter` hanya diizinkan untuk URL Web App admin dan `localhost:3000/admin`. Fallback tetap memakai dialog print browser bila Bluetooth belum disiapkan.

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
