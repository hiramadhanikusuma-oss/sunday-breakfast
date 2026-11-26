package com.sundaybreakfast.admin;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

public class MainActivity extends BridgeActivity {
    private static final int REQ_BT = 71;
    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = getBridge().getWebView();
        web.addJavascriptInterface(new PrinterBridge(), "SundayPrinter");

        if (Build.VERSION.SDK_INT >= 31 &&
                checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT);
        }
    }

    /* Bridge hanya dipakai oleh halaman admin yang kita kontrol. */
    private boolean originDiizinkan() {
        WebView web = getBridge().getWebView();
        String url = web.getUrl() == null ? "" : web.getUrl();
        return url.startsWith("https://script.google.com/macros/s/")
                || url.startsWith("http://localhost:3000/admin");
    }

    private boolean izinBluetooth() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED;
    }

    private String kirimKePrinter(String mac, String teks) {
        BluetoothSocket socket = null;
        OutputStream out = null;
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) return "ERROR: Bluetooth tidak tersedia";
            if (!adapter.isEnabled()) return "ERROR: Bluetooth masih mati";
            if (adapter.isDiscovering()) adapter.cancelDiscovery();

            BluetoothDevice device = adapter.getRemoteDevice(mac.trim());
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket.connect();
            out = socket.getOutputStream();
            out.write(new byte[]{0x1B, 0x40}); // reset printer
            out.write((teks == null ? "" : teks).getBytes("UTF-8"));
            out.write(new byte[]{0x0A, 0x0A, 0x0A});
            out.flush();
            return "OK: struk terkirim";
        } catch (SecurityException e) {
            return "ERROR: izin Bluetooth belum diberikan";
        } catch (Exception e) {
            return "ERROR: " + e.getMessage();
        } finally {
            try { if (out != null) out.close(); } catch (Exception ignored) {}
            try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        }
    }

    public class PrinterBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public String getPaired() {
            if (!originDiizinkan()) return "ERROR: halaman tidak diizinkan";
            if (!izinBluetooth()) return "ERROR: izin Bluetooth belum diberikan";
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) return "ERROR: Bluetooth tidak tersedia";
                if (!adapter.isEnabled()) return "ERROR: Bluetooth masih mati";
                JSONArray hasil = new JSONArray();
                Set<BluetoothDevice> devices = adapter.getBondedDevices();
                for (BluetoothDevice d : devices) {
                    JSONObject o = new JSONObject();
                    o.put("nama", d.getName() == null ? d.getAddress() : d.getName());
                    o.put("mac", d.getAddress());
                    hasil.put(o);
                }
                return hasil.toString();
            } catch (SecurityException e) {
                return "ERROR: izin Bluetooth belum diberikan";
            } catch (Exception e) {
                return "ERROR: " + e.getMessage();
            }
        }

        /* Async supaya WebView tidak macet saat socket connect. */
        @JavascriptInterface
        public void printText(String mac, String teks, String callback) {
            final String cb = (callback == null || !callback.matches("[A-Za-z_$][A-Za-z0-9_$]*"))
                    ? "" : callback;
            final String alamat = mac == null ? "" : mac;
            final String isi = teks == null ? "" : teks;
            new Thread(() -> {
                final String hasil = originDiizinkan() && izinBluetooth()
                        ? kirimKePrinter(alamat, isi)
                        : "ERROR: izin/halaman Bluetooth belum siap";
                runOnUiThread(() -> {
                    if (cb.isEmpty()) return;
                    try {
                        JSONObject o = new JSONObject();
                        o.put("ok", hasil.startsWith("OK"));
                        o.put("pesan", hasil);
                        getBridge().getWebView().evaluateJavascript(
                                "try{window." + cb + "(" + o.toString() + ")}catch(e){}", null);
                    } catch (Exception ignored) {}
                });
            }).start();
        }
    }
}
