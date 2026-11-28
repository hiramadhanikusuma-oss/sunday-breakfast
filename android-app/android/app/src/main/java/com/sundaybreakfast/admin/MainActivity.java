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

public class MainActivity extends BridgeActivity {
    private static final int REQ_BT = 71;
    private static final int REQ_NOTIF = 72;
    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BroadcastReceiver penerimaScan = null;
    private BroadcastReceiver penerimaBond = null;
    private String callbackBond = "";
    private String macBondDitunggu = "";

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
        hentikanBondReceiver();
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

    private void kirimBond(String cb, boolean ok, String pesan, String mac, int state) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            o.put("pesan", pesan);
            o.put("mac", mac == null ? "" : mac);
            o.put("state", statusBond(state));
        } catch (Exception ignored) {}
        kirimKeJS(cb, o);
    }

    private void hentikanBondReceiver() {
        if (penerimaBond != null) {
            try { unregisterReceiver(penerimaBond); } catch (Exception ignored) {}
            penerimaBond = null;
        }
        callbackBond = "";
        macBondDitunggu = "";
    }

    private void tungguBond(final String mac, final String cb) {
        hentikanBondReceiver();
        callbackBond = cb;
        macBondDitunggu = mac;
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        penerimaBond = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(intent.getAction())) return;
                BluetoothDevice d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d == null || d.getAddress() == null) return;
                if (!d.getAddress().equalsIgnoreCase(macBondDitunggu)) return;
                int state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE);
                int prev = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.BOND_NONE);
                if (state == BluetoothDevice.BOND_BONDED) {
                    String nama = d.getName() == null ? d.getAddress() : d.getName();
                    kirimBond(callbackBond, true,
                            "OK: printer " + nama + " berhasil dipasangkan. PIN 0000/1234 sudah tersimpan.",
                            d.getAddress(), state);
                    hentikanBondReceiver();
                } else if (state == BluetoothDevice.BOND_NONE && prev == BluetoothDevice.BOND_BONDING) {
                    kirimBond(callbackBond, false,
                            "ERROR: pairing gagal/dibatalkan. Coba lagi, PIN RPP02N biasanya 0000 atau 1234.",
                            d.getAddress(), state);
                    hentikanBondReceiver();
                }
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(penerimaBond, f, Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(penerimaBond, f);
            }
        } catch (SecurityException e) {
            hentikanBondReceiver();
            kirimBond(cb, false, "ERROR: izin Bluetooth belum diberikan saat pairing", mac, BluetoothDevice.BOND_NONE);
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

    private String kirimKePrinter(String mac, String teks) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) return "ERROR: Bluetooth tidak tersedia di HP ini";
        if (!adapter.isEnabled()) return "ERROR: Bluetooth masih mati. Nyalakan dulu ya";
        if (Build.VERSION.SDK_INT >= 31 &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                        != PackageManager.PERMISSION_GRANTED) {
            return "ERROR: izin Nearby devices/Bluetooth belum diberikan. Tekan Izinkan BT dulu ya";
        }

        BluetoothDevice device;
        try {
            device = adapter.getRemoteDevice(mac.trim());
        } catch (Exception e) {
            return "ERROR: MAC printer tidak valid (" + mac + ")";
        }
        if (device.getBondState() != BluetoothDevice.BOND_BONDED) {
            return "ERROR: printer belum dipasangkan (bond). Pilih printer, tekan Pasangkan Printer, " +
                    "lalu konfirmasi PIN 0000/1234 di HP";
        }

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
                return "OK: struk terkirim via " + metode[percobaan];
            } catch (SecurityException e) {
                return "ERROR: izin Bluetooth belum diberikan. Tekan Izinkan BT dulu ya";
            } catch (Exception e) {
                String pesan = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                riwayat.append(metode[percobaan]).append(": ").append(pesan).append(" | ");
            } finally {
                try { if (out != null) out.close(); } catch (Exception ignored) {}
                try { if (socket != null) socket.close(); } catch (Exception ignored) {}
            }
        }
        return "ERROR: gagal konek ke printer. " + riwayat.toString();
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
            if (!originDiizinkan()) return "ERROR: halaman tidak diizinkan";
            mintaIzinBluetoothJikaPerlu();
            return izinBluetooth() ? "OK: izin Bluetooth sudah diberikan"
                    : "OK: permintaan izin ditampilkan, izinkan lalu coba lagi";
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

        /* Pasangkan (bond) printer seperti aplikasi POS: createBond + pantau ACTION_BOND_STATE_CHANGED. */
        @JavascriptInterface
        public void pasangkanPerangkat(String mac, String callback) {
            final String cb = namaCallback(callback);
            final String alamat = mac == null ? "" : mac.trim();
            runOnUiThread(() -> {
                if (!originDiizinkan()) {
                    kirimBond(cb, false, "ERROR: halaman tidak diizinkan", alamat, BluetoothDevice.BOND_NONE);
                    return;
                }
                if (!izinBluetooth()) {
                    mintaIzinBluetoothJikaPerlu();
                    kirimBond(cb, false,
                            "ERROR: izin Nearby devices/Bluetooth belum diberikan. Tekan Izinkan BT lalu coba lagi.",
                            alamat, BluetoothDevice.BOND_NONE);
                    return;
                }
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    kirimBond(cb, false, "ERROR: Bluetooth masih mati. Nyalakan dulu ya",
                            alamat, BluetoothDevice.BOND_NONE);
                    return;
                }
                if (alamat.isEmpty()) {
                    kirimBond(cb, false, "ERROR: pilih printer dulu ya", alamat, BluetoothDevice.BOND_NONE);
                    return;
                }
                try {
                    BluetoothDevice device = adapter.getRemoteDevice(alamat);
                    if (device.getBondState() == BluetoothDevice.BOND_BONDED) {
                        kirimBond(cb, true, "OK: printer sudah terpasang", alamat, BluetoothDevice.BOND_BONDED);
                        return;
                    }
                    if (adapter.isDiscovering()) adapter.cancelDiscovery();
                    tungguBond(alamat, cb);
                    if (!buatBond(device)) {
                        hentikanBondReceiver();
                        kirimBond(cb, false,
                                "ERROR: gagal memulai pairing. Buka Setelan BT lalu pasangkan manual.",
                                alamat, device.getBondState());
                    }
                } catch (SecurityException e) {
                    hentikanBondReceiver();
                    kirimBond(cb, false, "ERROR: izin Bluetooth belum diberikan", alamat,
                            BluetoothDevice.BOND_NONE);
                } catch (Exception e) {
                    hentikanBondReceiver();
                    kirimBond(cb, false, "ERROR: " + e.getMessage(), alamat, BluetoothDevice.BOND_NONE);
                }
            });
        }

        /* Cari perangkat Bluetooth Classic di sekitar (butuh izin SCAN/lokasi). */
        @JavascriptInterface
        public void cariPerangkat(String callback) {
            final String cb = namaCallback(callback);
            if (!originDiizinkan()) {
                kirimKeJS(cb, hasilScan(false, "ERROR: halaman tidak diizinkan", new JSONArray()));
                return;
            }
            if (!izinScan()) {
                mintaIzinBluetoothJikaPerlu();
                kirimKeJS(cb, hasilScan(false,
                        "ERROR: izin Bluetooth/lokasi belum diberikan. Izinkan lalu tekan Cari lagi.",
                        new JSONArray()));
                return;
            }
            final BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                kirimKeJS(cb, hasilScan(false, "ERROR: Bluetooth masih mati", new JSONArray()));
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
            final IntentFilter filter = new IntentFilter();
            filter.addAction(BluetoothDevice.ACTION_FOUND);
            filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);

            penerimaScan = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String aksi = intent.getAction();
                    if (BluetoothDevice.ACTION_FOUND.equals(aksi)) {
                        BluetoothDevice d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                        if (d == null || d.getAddress() == null || dilihat.containsKey(d.getAddress())) return;
                        dilihat.put(d.getAddress(), true);
                        JSONObject o = new JSONObject();
                        try {
                            o.put("nama", d.getName() == null ? d.getAddress() : d.getName());
                            o.put("mac", d.getAddress());
                            o.put("terpasang", d.getBondState() == BluetoothDevice.BOND_BONDED);
                            o.put("bond", statusBond(d.getBondState()));
                            perangkat.put(o);
                        } catch (Exception ignored) {}
                    } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(aksi)) {
                        hentikanScan();
                        kirimKeJS(cb, hasilScan(true, "OK: pencarian selesai", perangkat));
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
                    hentikanScan();
                    kirimKeJS(cb, hasilScan(false, "ERROR: Bluetooth discovery gagal dimulai", perangkat));
                }
            } catch (SecurityException e) {
                hentikanScan();
                kirimKeJS(cb, hasilScan(false, "ERROR: izin Bluetooth belum diberikan", perangkat));
            }
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
