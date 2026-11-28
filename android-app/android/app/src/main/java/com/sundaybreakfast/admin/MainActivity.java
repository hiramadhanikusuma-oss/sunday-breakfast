package com.sundaybreakfast.admin;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {
    private static final int REQ_BT = 71;
    private static final int REQ_NOTIF = 72;
    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BroadcastReceiver penerimaScan = null;
    private BroadcastReceiver penerimaHubungkan = null;
    private String macHubungkanDitunggu = "";
    private BondListener bondListener = null;
    private final Object kunciBond = new Object();

    private interface BondListener {
        void selesai(boolean ok, String pesan, int state);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = getBridge().getWebView();
        web.addJavascriptInterface(new PrinterBridge(), "SundayPrinter");
        web.addJavascriptInterface(new NotifBridge(), "SundayNotify");
        mintaIzinBluetoothJikaPerlu();
        mintaIzinNotifikasiJikaPerlu();
        PesananNotif.jadwalkan(this);
    }

    @Override
    public void onDestroy() {
        hentikanScan();
        hentikanReceiverHubungkan();
        super.onDestroy();
    }

    private void mintaIzinNotifikasiJikaPerlu() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
    }

    private String[] daftarIzinBluetooth() {
        List<String> izin = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            izin.add(Manifest.permission.BLUETOOTH_CONNECT);
            izin.add(Manifest.permission.BLUETOOTH_SCAN);
        } else if (Build.VERSION.SDK_INT >= 23) {
            izin.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        return izin.toArray(new String[0]);
    }

    private void mintaIzinBluetoothJikaPerlu() {
        runOnUiThread(() -> {
            List<String> belum = new ArrayList<>();
            for (String izin : daftarIzinBluetooth()) {
                if (checkSelfPermission(izin) != PackageManager.PERMISSION_GRANTED) belum.add(izin);
            }
            if (!belum.isEmpty()) {
                requestPermissions(belum.toArray(new String[0]), REQ_BT);
            }
        });
    }

    /* Bridge hanya dipakai oleh halaman admin yang kita kontrol. */
    private boolean originDiizinkan() {
        WebView web = getBridge().getWebView();
        String url = web.getUrl() == null ? "" : web.getUrl();
        return url.startsWith("https://script.google.com/macros/s/")
                || url.startsWith("http://localhost:3000/admin");
    }

    private boolean izinBluetooth() {
        if (Build.VERSION.SDK_INT >= 31 &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                        != PackageManager.PERMISSION_GRANTED) return false;
        if (Build.VERSION.SDK_INT < 31 && Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                        != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    private boolean izinScan() {
        if (Build.VERSION.SDK_INT >= 31 &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)
                        != PackageManager.PERMISSION_GRANTED) return false;
        return izinBluetooth();
    }

    private void kirimKeJS(String callback, JSONObject isi) {
        if (callback == null || callback.isEmpty()) return;
        try {
            getBridge().getWebView().evaluateJavascript(
                    "try{window." + callback + "(" + isi.toString() + ")}catch(e){}", null);
        } catch (Exception ignored) {}
    }

    private String namaCallback(String callback) {
        if (callback == null || !callback.matches("[A-Za-z_$][A-Za-z0-9_$]*")) return "";
        return callback;
    }

    private String statusBond(int state) {
        if (state == BluetoothDevice.BOND_BONDED) return "BONDED";
        if (state == BluetoothDevice.BOND_BONDING) return "BONDING";
        return "NONE";
    }

    private JSONObject hasilHubungkan(boolean ok, String pesan, String mac, String nama,
                                      int state, String metode) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            o.put("pesan", pesan == null ? "" : pesan);
            o.put("mac", mac == null ? "" : mac);
            o.put("nama", nama == null ? "" : nama);
            o.put("state", statusBond(state));
            o.put("metode", metode == null ? "" : metode);
        } catch (Exception ignored) {}
        return o;
    }

    private void hentikanReceiverHubungkan() {
        if (penerimaHubungkan != null) {
            try { unregisterReceiver(penerimaHubungkan); } catch (Exception ignored) {}
            penerimaHubungkan = null;
        }
        synchronized (kunciBond) {
            bondListener = null;
            macHubungkanDitunggu = "";
        }
    }

    private void tungguBond(final String mac, final BondListener listener) {
        hentikanReceiverHubungkan();
        synchronized (kunciBond) {
            macHubungkanDitunggu = mac == null ? "" : mac;
            bondListener = listener;
        }
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        penerimaHubungkan = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(intent.getAction())) return;
                BluetoothDevice d;
                if (Build.VERSION.SDK_INT >= 33) {
                    d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
                } else {
                    d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                }
                if (d == null || d.getAddress() == null) return;
                BondListener l;
                String macDitunggu;
                synchronized (kunciBond) {
                    l = bondListener;
                    macDitunggu = macHubungkanDitunggu;
                }
                if (l == null || !d.getAddress().equalsIgnoreCase(macDitunggu)) return;
                int state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE);
                int prev = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.BOND_NONE);
                if (state == BluetoothDevice.BOND_BONDED) {
                    String nama = d.getName() == null ? d.getAddress() : d.getName();
                    l.selesai(true, "OK: printer " + nama + " berhasil dipasangkan.", state);
                    hentikanReceiverHubungkan();
                } else if (state == BluetoothDevice.BOND_NONE && prev == BluetoothDevice.BOND_BONDING) {
                    l.selesai(false, "ERROR: pairing gagal/dibatalkan. PIN RPP02N biasanya 0000 atau 1234.", state);
                    hentikanReceiverHubungkan();
                }
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(penerimaHubungkan, f, Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(penerimaHubungkan, f);
            }
        } catch (SecurityException e) {
            hentikanReceiverHubungkan();
            if (listener != null) {
                listener.selesai(false, "ERROR: izin Bluetooth belum diberikan saat pairing",
                        BluetoothDevice.BOND_NONE);
            }
        }
    }

    private boolean buatBond(BluetoothDevice device) {
        if (device.getBondState() == BluetoothDevice.BOND_BONDED) return true;
        try {
            return device.createBond();
        } catch (Exception e) {
            try {
                Method m = device.getClass().getMethod("createBond");
                Object hasil = m.invoke(device);
                return hasil instanceof Boolean && (Boolean) hasil;
            } catch (Exception ignored) {
                return false;
            }
        }
    }

    private JSONArray daftarPerangkat(BluetoothAdapter adapter) {
        JSONArray hasil = new JSONArray();
        try {
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            for (BluetoothDevice d : devices) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("nama", d.getName() == null ? d.getAddress() : d.getName());
                    o.put("mac", d.getAddress());
                    o.put("terpasang", true);
                    o.put("bond", statusBond(d.getBondState()));
                    hasil.put(o);
                } catch (Exception ignored) {}
            }
        } catch (SecurityException e) {
            // diabaikan; izin sudah dicek sebelum pemanggilan
        }
        return hasil;
    }

    private void hentikanScan() {
        if (penerimaScan != null) {
            try { unregisterReceiver(penerimaScan); } catch (Exception ignored) {}
            penerimaScan = null;
        }
    }

    private JSONObject cobaKoneksi(String mac, String teks) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        String alamat = mac == null ? "" : mac.trim();
        if (adapter == null) return hasilHubungkan(false, "ERROR: Bluetooth tidak tersedia di HP ini", alamat, "", BluetoothDevice.BOND_NONE, null);
        if (!adapter.isEnabled()) return hasilHubungkan(false, "ERROR: Bluetooth masih mati. Nyalakan dulu ya", alamat, "", BluetoothDevice.BOND_NONE, null);
        if (Build.VERSION.SDK_INT >= 31 &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                        != PackageManager.PERMISSION_GRANTED) {
            return hasilHubungkan(false, "ERROR: izin Nearby devices/Bluetooth belum diberikan. Tekan Izinkan BT dulu ya", alamat, "", BluetoothDevice.BOND_NONE, null);
        }

        BluetoothDevice device;
        try {
            device = adapter.getRemoteDevice(alamat);
        } catch (Exception e) {
            return hasilHubungkan(false, "ERROR: MAC printer tidak valid (" + alamat + ")", alamat, "", BluetoothDevice.BOND_NONE, null);
        }
        int state = device.getBondState();
        String nama = device.getName() == null ? alamat : device.getName();
        StringBuilder riwayat = new StringBuilder();
        String[] metode = {"SPP aman", "SPP tanpa otorisasi", "RFCOMM port 1",
                "RFCOMM port 2", "RFCOMM insecure port 1"};
        for (int percobaan = 0; percobaan < metode.length; percobaan++) {
            BluetoothSocket socket = null;
            OutputStream out = null;
            try {
                if (adapter.isDiscovering()) adapter.cancelDiscovery();
                switch (percobaan) {
                    case 0:
                        socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                        break;
                    case 1:
                        socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                        break;
                    case 2:
                    case 3: {
                        Method m = device.getClass().getMethod("createRfcommSocket", int.class);
                        socket = (BluetoothSocket) m.invoke(device, percobaan == 2 ? 1 : 2);
                        break;
                    }
                    default: {
                        Method m = device.getClass().getMethod("createInsecureRfcommSocket", int.class);
                        socket = (BluetoothSocket) m.invoke(device, 1);
                        break;
                    }
                }
                socket.connect();
                out = socket.getOutputStream();
                out.write(new byte[]{0x1B, 0x40}); // reset printer
                out.write((teks == null ? "" : teks).getBytes("UTF-8"));
                out.write(new byte[]{0x0A, 0x0A, 0x0A});
                out.flush();
                try { Thread.sleep(120); } catch (InterruptedException ignored) {}
                return hasilHubungkan(true,
                        "OK: " + (teks == null || teks.isEmpty() ? "terhubung" : "struk terkirim") +
                                " via " + metode[percobaan] + " (bond: " + statusBond(state) + ")",
                        alamat, nama, state, metode[percobaan]);
            } catch (SecurityException e) {
                return hasilHubungkan(false,
                        "ERROR: izin Bluetooth belum diberikan. Tekan Izinkan BT dulu ya",
                        alamat, nama, state, null);
            } catch (Exception e) {
                String pesan = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                riwayat.append(metode[percobaan]).append(": ").append(pesan).append(" | ");
            } finally {
                try { if (out != null) out.close(); } catch (Exception ignored) {}
                try { if (socket != null) socket.close(); } catch (Exception ignored) {}
            }
        }
        return hasilHubungkan(false, "ERROR: gagal konek ke printer. " + riwayat.toString(),
                alamat, nama, state, null);
    }

    private String kirimKePrinter(String mac, String teks) {
        return cobaKoneksi(mac, teks).optString("pesan");
    }

    /* Satu tombol: mulai pairing bila perlu, lalu buka socket SPP untuk membuktikan koneksi. */
    private void hubungkanProses(final BluetoothAdapter adapter, final String alamat, final String cb) {
        BluetoothDevice device;
        try {
            device = adapter.getRemoteDevice(alamat);
        } catch (Exception e) {
            runOnUiThread(() -> kirimKeJS(cb,
                    hasilHubungkan(false, "ERROR: MAC printer tidak valid", alamat, "",
                            BluetoothDevice.BOND_NONE, null)));
            return;
        }
        final String nama = device.getName() == null ? alamat : device.getName();
        final CountDownLatch latch = new CountDownLatch(1);
        final boolean[] bondOk = { device.getBondState() == BluetoothDevice.BOND_BONDED };
        final int[] bondState = { device.getBondState() };
        final String[] bondPesan = { bondOk[0] ? "OK: printer sudah terpasang" : "" };

        if (!bondOk[0]) {
            runOnUiThread(() -> {
                tungguBond(alamat, (ok, pesan, state) -> {
                    bondOk[0] = ok;
                    bondState[0] = state;
                    bondPesan[0] = pesan;
                    latch.countDown();
                });
                boolean mulai;
                try { mulai = buatBond(device); }
                catch (Exception e) { mulai = false; }
                if (!mulai) {
                    hentikanReceiverHubungkan();
                    bondOk[0] = false;
                    bondPesan[0] = "WARN: pairing tidak bisa dimulai, mencoba koneksi langsung";
                    latch.countDown();
                }
            });
            try {
                if (!latch.await(15, TimeUnit.SECONDS)) {
                    hentikanReceiverHubungkan();
                    bondOk[0] = false;
                    bondPesan[0] = "WARN: pairing timeout, mencoba koneksi langsung";
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                hentikanReceiverHubungkan();
                bondOk[0] = false;
                bondPesan[0] = "WARN: pairing terhenti, mencoba koneksi langsung";
            }
        }

        if (adapter.isDiscovering()) adapter.cancelDiscovery();
        JSONObject hasil = cobaKoneksi(alamat,
                "\nSUNDAY BREAKFAST\nTEST KONEKSI\n" + nama + "\n" + alamat + "\n");
        try {
            boolean ok = hasil.optBoolean("ok", false);
            String pesan = hasil.optString("pesan", "");
            if (!bondPesan[0].isEmpty() && (!ok || bondPesan[0].startsWith("WARN"))) {
                hasil.put("pesan", pesan + " | " + bondPesan[0]);
            }
            hasil.put("bond", statusBond(bondState[0]));
        } catch (Exception ignored) {}
        final JSONObject akhir = hasil;
        runOnUiThread(() -> kirimKeJS(cb, akhir));
    }

    public class NotifBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public void simpanToken(String token) {
            if (!originDiizinkan()) return;
            PesananNotif.simpanToken(getApplicationContext(), token);
        }

        @JavascriptInterface
        public void notifikasi(String judul, String isi) {
            if (!originDiizinkan()) return;
            try {
                if (Build.VERSION.SDK_INT < 26) return;
                android.app.NotificationManager nm =
                        (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        "pesanan_masuk", "Pesanan Masuk", android.app.NotificationManager.IMPORTANCE_HIGH);
                nm.createNotificationChannel(ch);
                android.app.PendingIntent pi = android.app.PendingIntent.getActivity(
                        getApplicationContext(), 0, new Intent(getApplicationContext(), MainActivity.class),
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT |
                                (Build.VERSION.SDK_INT >= 23 ? android.app.PendingIntent.FLAG_IMMUTABLE : 0));
                android.app.Notification.Builder b =
                        new android.app.Notification.Builder(getApplicationContext(), "pesanan_masuk")
                                .setSmallIcon(R.mipmap.ic_launcher)
                                .setContentTitle(judul == null ? "Pesanan baru" : judul)
                                .setContentText(isi == null ? "" : isi)
                                .setContentIntent(pi)
                                .setAutoCancel(true);
                nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
            } catch (Exception ignored) {}
        }
    }

    public class PrinterBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public String diagnosa() {
            JSONObject o = new JSONObject();
            if (!originDiizinkan()) {
                try { o.put("error", "halaman tidak diizinkan"); } catch (Exception ignored) {}
                return o.toString();
            }
            try {
                WebView web = getBridge().getWebView();
                o.put("android", Build.VERSION.SDK_INT);
                o.put("url", web.getUrl() == null ? "" : web.getUrl());
                o.put("izinBluetooth", izinBluetooth());
                o.put("izinScan", izinScan());
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                o.put("adapter", adapter != null);
                o.put("aktif", adapter != null && adapter.isEnabled());
                o.put("scanAktif", adapter != null && izinScan() && adapter.isDiscovering());
                o.put("terpasang", adapter != null && izinBluetooth()
                        ? daftarPerangkat(adapter) : new JSONArray());
            } catch (Exception e) {
                try { o.put("error", e.getMessage()); } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public String mintaIzinBluetooth() {
            try {
                if (!originDiizinkan()) return "ERROR: halaman tidak diizinkan";
                boolean sudah = izinBluetooth();
                if (!sudah) mintaIzinBluetoothJikaPerlu();
                return sudah ? "OK: izin Bluetooth sudah diberikan"
                        : "OK: permintaan izin ditampilkan. Izinkan di HP, lalu tekan Cari & Hubungkan lagi.";
            } catch (Throwable e) {
                String pesan = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                return "ERROR: gagal meminta izin Bluetooth (" + pesan + ")";
            }
        }

        @JavascriptInterface
        public String getPaired() {
            if (!originDiizinkan()) return "ERROR: halaman tidak diizinkan";
            if (!izinBluetooth()) return "ERROR: izin Bluetooth belum diberikan";
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) return "ERROR: Bluetooth tidak tersedia";
                if (!adapter.isEnabled()) return "ERROR: Bluetooth masih mati";
                return daftarPerangkat(adapter).toString();
            } catch (SecurityException e) {
                return "ERROR: izin Bluetooth belum diberikan";
            } catch (Exception e) {
                return "ERROR: " + e.getMessage();
            }
        }

        /* Satu tombol POS: cari → pasangkan → buka socket → cetak uji. */
        @JavascriptInterface
        public void hubungkanPerangkat(String mac, String callback) {
            final String cb = namaCallback(callback);
            final String alamat = mac == null ? "" : mac.trim();
            try {
                runOnUiThread(() -> {
                    if (!originDiizinkan()) {
                        kirimKeJS(cb, hasilHubungkan(false, "ERROR: halaman tidak diizinkan",
                                alamat, "", BluetoothDevice.BOND_NONE, null));
                        return;
                    }
                    if (!izinBluetooth()) {
                        mintaIzinBluetoothJikaPerlu();
                        kirimKeJS(cb, hasilHubungkan(false,
                                "ERROR: izin Nearby devices/Bluetooth belum diberikan. Izinkan lalu tekan lagi.",
                                alamat, "", BluetoothDevice.BOND_NONE, null));
                        return;
                    }
                    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                    if (adapter == null || !adapter.isEnabled()) {
                        kirimKeJS(cb, hasilHubungkan(false, "ERROR: Bluetooth masih mati. Nyalakan dulu ya",
                                alamat, "", BluetoothDevice.BOND_NONE, null));
                        return;
                    }
                    if (alamat.isEmpty()) {
                        kirimKeJS(cb, hasilHubungkan(false, "ERROR: pilih printer dulu ya",
                                alamat, "", BluetoothDevice.BOND_NONE, null));
                        return;
                    }
                    new Thread(() -> hubungkanProses(adapter, alamat, cb)).start();
                });
            } catch (Throwable e) {
                String pesan = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                kirimKeJS(cb, hasilHubungkan(false, "ERROR: gagal menghubungkan (" + pesan + ")",
                        alamat, "", BluetoothDevice.BOND_NONE, null));
            }
        }

        /* Kompatibilitas dengan tombol lama: sekarang ikut menghubungkan & test print. */
        @JavascriptInterface
        public void pasangkanPerangkat(String mac, String callback) {
            hubungkanPerangkat(mac, callback);
        }

        /* Cari perangkat Bluetooth Classic. Callback dipanggil bertahap; selesai=true menandai akhir. */
        @JavascriptInterface
        public void cariPerangkat(String callback) {
            final String cb = namaCallback(callback);
            if (!originDiizinkan()) {
                kirimScan(cb, false, "ERROR: halaman tidak diizinkan", new JSONArray(), true);
                return;
            }
            if (!izinScan()) {
                mintaIzinBluetoothJikaPerlu();
                kirimScan(cb, false,
                        "ERROR: izin Bluetooth/lokasi belum diberikan. Izinkan lalu tekan lagi.",
                        new JSONArray(), true);
                return;
            }
            final BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                kirimScan(cb, false, "ERROR: Bluetooth masih mati", new JSONArray(), true);
                return;
            }
            if (adapter.isDiscovering()) adapter.cancelDiscovery();
            hentikanScan();

            final JSONArray perangkat = daftarPerangkat(adapter);
            final Map<String, Boolean> dilihat = new HashMap<>();
            for (int i = 0; i < perangkat.length(); i++) {
                try { dilihat.put(perangkat.getJSONObject(i).getString("mac"), true); }
                catch (Exception ignored) {}
            }
            final boolean[] selesaiDikirim = {false};
            kirimScan(cb, true, "Mencari printer...", perangkat, false);

            final IntentFilter filter = new IntentFilter();
            filter.addAction(BluetoothDevice.ACTION_FOUND);
            filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);

            penerimaScan = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String aksi = intent.getAction();
                    if (BluetoothDevice.ACTION_FOUND.equals(aksi)) {
                        BluetoothDevice d;
                        if (Build.VERSION.SDK_INT >= 33) {
                            d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
                        } else {
                            d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                        }
                        if (d == null || d.getAddress() == null || dilihat.containsKey(d.getAddress())) return;
                        dilihat.put(d.getAddress(), true);
                        String nama = d.getName() == null ? d.getAddress() : d.getName();
                        JSONObject o = new JSONObject();
                        try {
                            o.put("nama", nama);
                            o.put("mac", d.getAddress());
                            o.put("terpasang", d.getBondState() == BluetoothDevice.BOND_BONDED);
                            o.put("bond", statusBond(d.getBondState()));
                            perangkat.put(o);
                        } catch (Exception ignored) {}
                        kirimScan(cb, true, "Ditemukan: " + nama, perangkat, false);
                    } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(aksi)) {
                        if (selesaiDikirim[0]) return;
                        selesaiDikirim[0] = true;
                        hentikanScan();
                        kirimScan(cb, true, "OK: pencarian selesai", perangkat, true);
                    }
                }
            };
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    registerReceiver(penerimaScan, filter, Context.RECEIVER_EXPORTED);
                } else {
                    registerReceiver(penerimaScan, filter);
                }
                if (!adapter.startDiscovery()) {
                    selesaiDikirim[0] = true;
                    hentikanScan();
                    kirimScan(cb, false, "ERROR: Bluetooth discovery gagal dimulai", perangkat, true);
                }
            } catch (SecurityException e) {
                selesaiDikirim[0] = true;
                hentikanScan();
                kirimScan(cb, false, "ERROR: izin Bluetooth belum diberikan", perangkat, true);
            }
            new Handler(getMainLooper()).postDelayed(() -> {
                if (selesaiDikirim[0]) return;
                selesaiDikirim[0] = true;
                try { if (adapter.isDiscovering()) adapter.cancelDiscovery(); }
                catch (Exception ignored) {}
                hentikanScan();
                kirimScan(cb, true, "OK: pencarian dihentikan otomatis", perangkat, true);
            }, 20000);
        }

        private void kirimScan(String cb, boolean ok, String pesan, JSONArray perangkat, boolean selesai) {
            JSONObject o = hasilScan(ok, pesan, perangkat);
            try { o.put("selesai", selesai); } catch (Exception ignored) {}
            kirimKeJS(cb, o);
        }

        private JSONObject hasilScan(boolean ok, String pesan, JSONArray perangkat) {
            JSONObject o = new JSONObject();
            try {
                o.put("ok", ok);
                o.put("pesan", pesan);
                o.put("perangkat", perangkat == null ? new JSONArray() : perangkat);
            } catch (Exception ignored) {}
            return o;
        }

        @JavascriptInterface
        public void bukaSetelanBluetooth() {
            if (!originDiizinkan()) return;
            try {
                Intent i = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        }

        /* Async supaya WebView tidak macet saat socket connect. */
        @JavascriptInterface
        public void printText(String mac, String teks, String callback) {
            final String cb = namaCallback(callback);
            final String alamat = mac == null ? "" : mac;
            final String isi = teks == null ? "" : teks;
            new Thread(() -> {
                final String hasil = originDiizinkan() && izinBluetooth()
                        ? kirimKePrinter(alamat, isi)
                        : "ERROR: izin/halaman Bluetooth belum siap";
                runOnUiThread(() -> {
                    if (cb.isEmpty()) return;
                    JSONObject o = new JSONObject();
                    try {
                        o.put("ok", hasil.startsWith("OK"));
                        o.put("pesan", hasil);
                    } catch (Exception ignored) {}
                    kirimKeJS(cb, o);
                });
            }).start();
        }
    }
}
