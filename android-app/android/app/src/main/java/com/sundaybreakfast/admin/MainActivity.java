package com.sundaybreakfast.admin;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
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
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
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
    private BluetoothLeScanner pemindaiBle = null;
    private ScanCallback callbackScanBle = null;
    private BluetoothGatt gattAktif = null;
    private JSONArray daftarBleTerakhir = new JSONArray();
    private String infoGattTerakhir = "";
    private String modePrinterTerakhir = "";
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
        try {
            WebSettings st = web.getSettings();
            st.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
            st.setDomStorageEnabled(true);
            st.setDatabaseEnabled(true);
        } catch (Exception ignored) {}
        web.addJavascriptInterface(new PrinterBridge(), "SundayPrinter");
        web.addJavascriptInterface(new NotifBridge(), "SundayNotify");
        mintaIzinBluetoothJikaPerlu();
        mintaIzinNotifikasiJikaPerlu();
        PesananNotif.jadwalkan(this);
    }

    @Override
    public void onDestroy() {
        hentikanScan();
        tutupGatt();
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

    private void kirimScan(String cb, boolean ok, String pesan, JSONArray perangkat, boolean selesai) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            o.put("pesan", pesan);
            o.put("perangkat", perangkat == null ? new JSONArray() : perangkat);
            o.put("selesai", selesai);
        } catch (Exception ignored) {}
        kirimKeJS(cb, o);
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
        if (pemindaiBle != null && callbackScanBle != null) {
            try { pemindaiBle.stopScan(callbackScanBle); } catch (Exception ignored) {}
        }
        pemindaiBle = null;
        callbackScanBle = null;
    }

    private void tutupGatt() {
        BluetoothGatt g = gattAktif;
        gattAktif = null;
        if (g != null) {
            try { g.disconnect(); } catch (Exception ignored) {}
            try { g.close(); } catch (Exception ignored) {}
        }
    }

    private BluetoothAdapter adapterBluetooth() {
        BluetoothManager bm = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter a = bm == null ? null : bm.getAdapter();
        return a == null ? BluetoothAdapter.getDefaultAdapter() : a;
    }

    /* RPP02N sebagian batch dual-mode/BLE: tidak muncul di Setelan Bluetooth HP,
       jadi harus discan dan ditulis lewat GATT tanpa pairing klasik. */
    private void mulaiScanBle(final BluetoothAdapter adapter, final String cb,
                              final JSONArray perangkat, final Map<String, Boolean> dilihat) {
        try {
            pemindaiBle = adapter.getBluetoothLeScanner();
            if (pemindaiBle == null) return;
            callbackScanBle = new ScanCallback() {
                private void terima(final ScanResult r) {
                    if (r == null) return;
                    BluetoothDevice d = r.getDevice();
                    if (d == null || d.getAddress() == null || dilihat.containsKey(d.getAddress())) return;
                    dilihat.put(d.getAddress(), true);
                    String nama = d.getName();
                    if (r.getScanRecord() != null && r.getScanRecord().getDeviceName() != null) {
                        nama = r.getScanRecord().getDeviceName();
                    }
                    if (nama == null || nama.isEmpty()) nama = d.getAddress();
                    JSONObject o = new JSONObject();
                    try {
                        o.put("nama", nama);
                        o.put("mac", d.getAddress());
                        o.put("jenis", "BLE");
                        o.put("terpasang", false);
                        o.put("bond", "NONE");
                        o.put("rssi", r.getRssi());
                        perangkat.put(o);
                        daftarBleTerakhir.put(new JSONObject(o.toString()));
                    } catch (Exception ignored) {}
                    kirimScan(cb, true, "Ditemukan: " + nama + " (BLE)", perangkat, false);
                }

                @Override public void onScanResult(int callbackType, ScanResult result) { terima(result); }

                @Override public void onBatchScanResults(List<ScanResult> hasil) {
                    if (hasil == null) return;
                    for (ScanResult r : hasil) terima(r);
                }

                @Override public void onScanFailed(int errorCode) {
                    infoGattTerakhir = "Scan BLE gagal (kode " + errorCode + ")";
                }
            };
            pemindaiBle.startScan(callbackScanBle);
        } catch (SecurityException e) {
            infoGattTerakhir = "Scan BLE ditolak: izin Nearby devices belum diberikan";
        } catch (Exception e) {
            infoGattTerakhir = "Scan BLE error: " + e.getMessage();
        }
    }

    private BluetoothGattCharacteristic pilihKarakter(BluetoothGatt gatt, StringBuilder info) {
        if (gatt == null) return null;
        String[] utama = {
                "0000ff02-0000-1000-8000-00805f9b34fb",
                "0000ffe1-0000-1000-8000-00805f9b34fb",
                "0000ae01-0000-1000-8000-00805f9b34fb",
                "49535343-8841-43f4-a8d4-ecbe34729bb3",
                "0000ff82-0000-1000-8000-00805f9b34fb",
                "0000fff2-0000-1000-8000-00805f9b34fb",
                "00002af1-0000-1000-8000-00805f9b34fb"
        };
        List<BluetoothGattCharacteristic> writable = new ArrayList<>();
        for (BluetoothGattService s : gatt.getServices()) {
            info.append("[").append(s.getUuid()).append(" ");
            for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                int p = c.getProperties();
                if ((p & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 ||
                        (p & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                    writable.add(c);
                }
                info.append(c.getUuid()).append(p == 0 ? "" : "(w)").append(" ");
            }
            info.append("] ");
        }
        for (String uuid : utama) {
            for (BluetoothGattCharacteristic c : writable) {
                if (c.getUuid() != null && uuid.equalsIgnoreCase(c.getUuid().toString())) return c;
            }
        }
        return writable.isEmpty() ? null : writable.get(0);
    }

    /* Kirim ESC/POS lewat BLE. Mengembalikan hasilHubungkan() agar pola JS tetap sama. */
    private JSONObject kirimBle(final String mac, String teks, int detikTimeout) {
        final String alamat = mac == null ? "" : mac.trim();
        BluetoothAdapter adapter = adapterBluetooth();
        if (adapter == null) return hasilHubungkan(false, "ERROR: Bluetooth tidak tersedia", alamat, "", BluetoothDevice.BOND_NONE, null);
        if (!adapter.isEnabled()) return hasilHubungkan(false, "ERROR: Bluetooth masih mati", alamat, "", BluetoothDevice.BOND_NONE, null);
        if (Build.VERSION.SDK_INT >= 31 &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            return hasilHubungkan(false, "ERROR: izin Bluetooth belum diberikan", alamat, "", BluetoothDevice.BOND_NONE, null);
        }
        final BluetoothDevice device;
        try { device = adapter.getRemoteDevice(alamat); }
        catch (Exception e) {
            return hasilHubungkan(false, "ERROR: MAC tidak valid", alamat, "", BluetoothDevice.BOND_NONE, null);
        }
        final String nama = device.getName() == null ? alamat : device.getName();
        final StringBuilder info = new StringBuilder();
        final CountDownLatch latch = new CountDownLatch(1);
        final boolean[] berhasil = {false};
        final String[] pesan = {"ERROR:BLE"};
        final String[] metode = {""};

        String isi = teks == null ? "" : teks;
        final byte[] data;
        try {
            byte[] awal = new byte[]{(byte) 0x1B, 0x40};
            byte[] isiByte = isi.getBytes("UTF-8");
            byte[] akhir = new byte[]{0x0A, 0x0A, 0x0A};
            data = new byte[awal.length + isiByte.length + akhir.length];
            System.arraycopy(awal, 0, data, 0, awal.length);
            System.arraycopy(isiByte, 0, data, awal.length, isiByte.length);
            System.arraycopy(akhir, 0, data, awal.length + isiByte.length, akhir.length);
        } catch (Exception e) {
            return hasilHubungkan(false, "ERROR: encoding struk gagal", alamat, nama, BluetoothDevice.BOND_NONE, null);
        }

        final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
            private final Runnable[] tulis = new Runnable[1];
            private int offset = 0;
            private int potongan = 20;

            @Override
            public void onConnectionStateChange(final BluetoothGatt gatt, int status, int newState) {
                if (status != BluetoothGatt.GATT_SUCCESS || newState != BluetoothGatt.STATE_CONNECTED) {
                    pesan[0] = "ERROR: BLE connect gagal (status " + status + ", state " + newState + ")";
                    infoGattTerakhir = info.toString();
                    latch.countDown();
                    return;
                }
                try {
                    potongan = 20;
                    gatt.discoverServices();
                } catch (Exception e) {
                    pesan[0] = "ERROR: discoverServices gagal (" + e.getMessage() + ")";
                    latch.countDown();
                }
            }

            @Override
            public void onServicesDiscovered(final BluetoothGatt gatt, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    pesan[0] = "ERROR: GATT services gagal (status " + status + ")";
                    infoGattTerakhir = info.toString();
                    latch.countDown();
                    return;
                }
                BluetoothGattCharacteristic c = pilihKarakter(gatt, info);
                infoGattTerakhir = info.toString();
                if (c == null) {
                    pesan[0] = "ERROR: tidak ada characteristic WRITE. " + info;
                    latch.countDown();
                    return;
                }
                int p = c.getProperties();
                try {
                    c.setWriteType((p & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
                            ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                            : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                } catch (Exception ignored) {}
                metode[0] = "BLE " + c.getUuid();
                offset = 0;
                tulis[0] = () -> {
                    try {
                        if (offset >= data.length) {
                            new Handler(getMainLooper()).postDelayed(() -> {
                                berhasil[0] = true;
                                pesan[0] = "OK: " + (isi.isEmpty() ? "terhubung" : "struk terkirim")
                                        + " via BLE (" + metode[0] + ")";
                                latch.countDown();
                            }, 250);
                            return;
                        }
                        int akhir = Math.min(offset + potongan, data.length);
                        c.setValue(Arrays.copyOfRange(data, offset, akhir));
                        gatt.writeCharacteristic(c);
                    } catch (Exception e) {
                        pesan[0] = "ERROR: BLE write gagal (" + e.getMessage() + ")";
                        latch.countDown();
                    }
                };
                tulis[0].run();
            }

            @Override
            public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic c, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    pesan[0] = "ERROR: BLE write ditolak (status " + status + ")";
                    latch.countDown();
                    return;
                }
                offset += potongan;
                new Handler(getMainLooper()).postDelayed(() -> { if (tulis[0] != null) tulis[0].run(); }, 12);
            }
        };

        try {
            final BluetoothGatt[] gattRef = new BluetoothGatt[1];
            runOnUiThread(() -> {
                try {
                    gattRef[0] = device.connectGatt(getApplicationContext(), false, gattCallback);
                    gattAktif = gattRef[0];
                } catch (Exception e) {
                    pesan[0] = "ERROR: BLE connect exception (" + e.getMessage() + ")";
                    latch.countDown();
                }
            });
            if (!latch.await(detikTimeout, TimeUnit.SECONDS)) {
                pesan[0] = "ERROR: BLE timeout " + detikTimeout + " detik";
                infoGattTerakhir = info.length() > 0 ? info.toString() : "tidak ada respons GATT";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            pesan[0] = "ERROR: BLE terhenti";
        }
        tutupGatt();
        if (berhasil[0]) modePrinterTerakhir = "BLE";
        return hasilHubungkan(berhasil[0], pesan[0], alamat, nama, BluetoothDevice.BOND_NONE,
                berhasil[0] ? metode[0] : null);
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
        if ("SPP".equals(modePrinterTerakhir)) {
            JSONObject spp = cobaKoneksi(mac, teks);
            if (spp.optBoolean("ok", false)) return spp.optString("pesan");
            JSONObject ble = kirimBle(mac, teks, 7);
            if (ble.optBoolean("ok", false)) return ble.optString("pesan");
            return spp.optString("pesan") + " | BLE: " + ble.optString("pesan");
        }
        JSONObject ble = kirimBle(mac, teks, 7);
        if (ble.optBoolean("ok", false)) return ble.optString("pesan");
        JSONObject spp = cobaKoneksi(mac, teks);
        if (spp.optBoolean("ok", false)) {
            modePrinterTerakhir = "SPP";
            return spp.optString("pesan");
        }
        return spp.optString("pesan") + " | BLE: " + ble.optString("pesan");
    }

    private boolean perangkatBleDitemukan(String mac) {
        if (mac == null) return false;
        for (int i = 0; i < daftarBleTerakhir.length(); i++) {
            try {
                if (mac.equalsIgnoreCase(daftarBleTerakhir.getJSONObject(i).optString("mac"))) return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    /* Satu tombol: coba BLE dulu; pairing klasik hanya bila perlu. */
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
        final String uji = "\nSUNDAY BREAKFAST\nTEST KONEKSI\n" + nama + "\n" + alamat + "\n";

        /* Coba BLE dulu: printer dual-mode tidak perlu pairing klasik. */
        final boolean bleTerlihat = perangkatBleDitemukan(alamat);
        JSONObject ble = kirimBle(alamat, uji, bleTerlihat ? 8 : 5);
        if (ble.optBoolean("ok", false)) {
            try {
                ble.put("pesan", ble.optString("pesan") + " (tanpa pairing klasik)");
                ble.put("bond", statusBond(device.getBondState()));
            } catch (Exception ignored) {}
            runOnUiThread(() -> kirimKeJS(cb, ble));
            return;
        }
        final String catatanBle = " | BLE: " + ble.optString("pesan");

        final CountDownLatch latch = new CountDownLatch(1);
        final boolean[] bondOk = { device.getBondState() == BluetoothDevice.BOND_BONDED };
        final int[] bondState = { device.getBondState() };
        final String[] bondPesan = { bondOk[0] ? "OK: printer sudah terpasang" : "" };

        if (!bondOk[0] && bleTerlihat) {
            bondPesan[0] = "WARN: perangkat BLE terdeteksi, pairing klasik dilewati";
        } else if (!bondOk[0]) {
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
                if (!latch.await(10, TimeUnit.SECONDS)) {
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
        JSONObject hasil = cobaKoneksi(alamat, uji);
        try {
            boolean ok = hasil.optBoolean("ok", false);
            String pesan = hasil.optString("pesan", "");
            if (!ok) pesan += catatanBle;
            if (!bondPesan[0].isEmpty() && (!ok || bondPesan[0].startsWith("WARN"))) {
                pesan += " | " + bondPesan[0];
            }
            hasil.put("pesan", pesan);
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
                JSONArray terpasang = adapter != null && izinBluetooth()
                        ? daftarPerangkat(adapter) : new JSONArray();
                o.put("bleScanner", adapter != null && izinScan() && adapter.getBluetoothLeScanner() != null);
                o.put("gattInfo", infoGattTerakhir);
                for (int i = 0; i < daftarBleTerakhir.length(); i++) {
                    JSONObject b = daftarBleTerakhir.getJSONObject(i);
                    JSONObject e = new JSONObject();
                    e.put("nama", "BLE: " + b.optString("nama"));
                    e.put("mac", b.optString("mac"));
                    terpasang.put(e);
                }
                if (!infoGattTerakhir.isEmpty()) {
                    JSONObject info = new JSONObject();
                    info.put("nama", "INFO BLE/GATT: " + infoGattTerakhir.substring(
                            0, Math.min(400, infoGattTerakhir.length())));
                    info.put("mac", "-");
                    terpasang.put(info);
                }
                o.put("terpasang", terpasang);
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
                    try {
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
                        BluetoothAdapter adapter = adapterBluetooth();
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
                    } catch (Throwable e) {
                        String pesan = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                        kirimKeJS(cb, hasilHubungkan(false, "ERROR: gagal memulai koneksi (" + pesan + ")",
                                alamat, "", BluetoothDevice.BOND_NONE, null));
                    }
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

        /* Cari Bluetooth klasik + BLE. Semua exception ditangani supaya WebView tidak
           menampilkan "error invoking" generik. */
        @JavascriptInterface
        public void cariPerangkat(String callback) {
            final String cb = namaCallback(callback);
            try {
                if (!originDiizinkan()) {
                    kirimScan(cb, false, "ERROR: halaman tidak diizinkan", new JSONArray(), true);
                    return;
                }
                if (!izinBluetooth() || !izinScan()) {
                    mintaIzinBluetoothJikaPerlu();
                    kirimScan(cb, false,
                            "ERROR: izin Bluetooth/lokasi belum diberikan. Izinkan lalu tekan lagi.",
                            new JSONArray(), true);
                    return;
                }
                final BluetoothAdapter adapter = adapterBluetooth();
                if (adapter == null) {
                    kirimScan(cb, false, "ERROR: Bluetooth tidak tersedia di HP ini", new JSONArray(), true);
                    return;
                }
                if (!adapter.isEnabled()) {
                    kirimScan(cb, false, "ERROR: Bluetooth masih mati. Nyalakan dulu ya", new JSONArray(), true);
                    return;
                }
                try { if (adapter.isDiscovering()) adapter.cancelDiscovery(); }
                catch (Exception ignored) {}
                hentikanScan();

                final JSONArray perangkat = daftarPerangkat(adapter);
                final Map<String, Boolean> dilihat = new HashMap<>();
                for (int i = 0; i < perangkat.length(); i++) {
                    try { dilihat.put(perangkat.getJSONObject(i).getString("mac"), true); }
                    catch (Exception ignored) {}
                }
                final boolean[] selesaiDikirim = {false};
                kirimScan(cb, true, "Mencari printer Bluetooth & BLE...", perangkat, false);
                daftarBleTerakhir = new JSONArray();
                mulaiScanBle(adapter, cb, perangkat, dilihat);

                final IntentFilter filter = new IntentFilter();
                filter.addAction(BluetoothDevice.ACTION_FOUND);
                filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);

                penerimaScan = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        try {
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
                        } catch (Throwable e) {
                            if (!selesaiDikirim[0]) {
                                selesaiDikirim[0] = true;
                                kirimScan(cb, false, "ERROR: terima hasil scan gagal ("
                                        + e.getClass().getSimpleName() + ")", perangkat, true);
                            }
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
                        kirimScan(cb, true, "Discovery tidak bisa dimulai; memakai hasil BLE/perangkat terpasang",
                                perangkat, true);
                    }
                } catch (Throwable e) {
                    selesaiDikirim[0] = true;
                    hentikanScan();
                    kirimScan(cb, true, "Discovery gagal; memakai hasil BLE/perangkat terpasang ("
                            + e.getClass().getSimpleName() + ")", perangkat, true);
                }
                new Handler(getMainLooper()).postDelayed(() -> {
                    if (selesaiDikirim[0]) return;
                    selesaiDikirim[0] = true;
                    try { if (adapter.isDiscovering()) adapter.cancelDiscovery(); }
                    catch (Exception ignored) {}
                    hentikanScan();
                    kirimScan(cb, true, "OK: pencarian selesai", perangkat, true);
                }, 12000);
            } catch (Throwable e) {
                hentikanScan();
                String pesan = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                kirimScan(cb, false, "ERROR: cari perangkat gagal (" + pesan + ")", new JSONArray(), true);
            }
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
