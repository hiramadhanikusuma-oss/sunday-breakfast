/**
 * SUNDAY BREAKFAST — Google Apps Script
 * Cara pakai:
 * 1. Buka https://script.google.com → New Project
 * 2. Tempel seluruh kode ini, Simpan
 * 3. Deploy → New deployment → Web app
 *    Execute as: Me
 *    Who has access: Anyone
 * 4. Salin URL Web App (.../exec), tempel di Admin → Laporan → URL Apps Script
 * 5. Klik "Kirim Semua Laporan ke Drive"
 */

const NAMA_FOLDER = 'Sunday Breakfast — Laporan';

function doGet() {
  return ContentService
    .createTextOutput('Apps Script Sunday Breakfast sudah aktif. Gunakan URL ini di admin.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const email = (d.email || '').trim();
    const nama = (d.name || 'Laporan').replace(/[^\w\s\-]/g, '').trim() || 'Laporan';
    const isi = '\uFEFF' + (d.csv || '');

    const folder = getFolder_(email);
    const namaFile = nama + '.csv';
    const cari = folder.getFilesByName(namaFile);
    let file;
    if (cari.hasNext()) {
      file = cari.next();
      file.setContent(isi);
    } else {
      file = folder.createFile(namaFile, isi, MimeType.CSV);
    }

    if (email) {
      try { folder.addEditor(email); } catch (err) { /* akun tidak boleh di-share, abaikan */ }
    }

    return json_({ ok: true, url: file.getUrl(), nama: namaFile });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getFolder_(email) {
  const root = DriveApp.getRootFolder();
  const cari = root.getFoldersByName(NAMA_FOLDER);
  if (cari.hasNext()) return cari.next();
  const folder = root.createFolder(NAMA_FOLDER);
  if (email) {
    try { folder.addEditor(email); } catch (err) { /* abaikan */ }
  }
  return folder;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
