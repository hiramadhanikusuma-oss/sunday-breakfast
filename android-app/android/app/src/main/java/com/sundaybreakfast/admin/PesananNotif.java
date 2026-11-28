package com.sundaybreakfast.admin;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashSet;
import java.util.Set;

/** Polling pesanan website + notifikasi Android (tetap jalan walau APK tertutup). */
public class PesananNotif extends BroadcastReceiver {
    private static final String TAG = "SundayNotif";
    private static final String ADMIN_URL =
            "https://script.google.com/macros/s/AKfycbwBObkn5MOOAernCOFiyWnXpMKnRpdz0YfpcdDq4NjRDGA-uoJogihsmOkNEKBKIhxz/exec";
    private static final String PREFS = "sunday_notif";
    private static final String CHANNEL = "pesanan_masuk";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_IDS = "ids";
    private static final String KEY_SEED = "seed";
    private static final int REQ_POLL = 4101;

    public static void simpanToken(Context ctx, String token) {
        try {
            SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            e.putString(KEY_TOKEN, token == null ? "" : token);
            e.apply();
        } catch (Exception ignored) {}
        jadwalkan(ctx);
    }

    public static void jadwalkan(Context ctx) {
        try {
            Intent i = new Intent(ctx, PesananNotif.class);
            int flag = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flag |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_POLL, i, flag);
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            long mulai = SystemClock.elapsedRealtime() + 60_000L;
            long jarak = 5 * 60_000L;
            if (Build.VERSION.SDK_INT >= 23) {
                am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME_WAKEUP, mulai, jarak, pi);
            } else {
                am.setRepeating(AlarmManager.ELAPSED_REALTIME_WAKEUP, mulai, jarak, pi);
            }
        } catch (Exception e) {
            Log.w(TAG, "Gagal jadwalkan polling: " + e.getMessage());
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        new Thread(() -> cek(context.getApplicationContext())).start();
    }

    private static boolean online(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
            return n != null && n.isConnected();
        } catch (Exception e) { return true; }
    }

    private static String baca(InputStreamReader reader) throws Exception {
        StringBuilder sb = new StringBuilder();
        BufferedReader br = new BufferedReader(reader);
        String baris;
        while ((baris = br.readLine()) != null) sb.append(baris);
        br.close();
        return sb.toString();
    }

    private static JSONArray ambilPesanan(String token) throws Exception {
        String rid = "n" + System.currentTimeMillis() + Long.toString(Math.abs(System.nanoTime()), 36);
        JSONObject body = new JSONObject();
        body.put("r", "/api/admin/pesanan");
        body.put("token", token);
        body.put("rid", rid);

        HttpURLConnection post = (HttpURLConnection) new URL(ADMIN_URL).openConnection();
        try {
            post.setRequestMethod("POST");
            post.setDoOutput(true);
            post.setConnectTimeout(20000);
            post.setReadTimeout(20000);
            post.setRequestProperty("Content-Type", "application/json");
            OutputStream os = post.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.close();
            post.getResponseCode();
        } finally {
            post.disconnect();
        }

        String alamat = ADMIN_URL + "?r=" + URLEncoder.encode("/api/result?rid=" + rid, "UTF-8");
        HttpURLConnection get = (HttpURLConnection) new URL(alamat).openConnection();
        try {
            get.setRequestMethod("GET");
            get.setConnectTimeout(20000);
            get.setReadTimeout(20000);
            if (get.getResponseCode() != 200) return new JSONArray();
            JSONObject hasil = new JSONObject(baca(new InputStreamReader(get.getInputStream(), "UTF-8")));
            return hasil.optJSONArray("pesanan");
        } finally {
            get.disconnect();
        }
    }

    private static void cek(Context ctx) {
        if (!online(ctx)) return;
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = sp.getString(KEY_TOKEN, "");
        if (token.isEmpty()) return;

        try {
            JSONArray pesanan = ambilPesanan(token);
            if (pesanan == null || pesanan.length() == 0) return;

            Set<String> lama = new HashSet<>();
            try {
                JSONArray tersimpan = new JSONArray(sp.getString(KEY_IDS, "[]"));
                for (int i = 0; i < tersimpan.length(); i++) lama.add(tersimpan.getString(i));
            } catch (Exception ignored) {}

            boolean pertama = !sp.getBoolean(KEY_SEED, false);
            JSONArray baru = new JSONArray();
            for (int i = 0; i < pesanan.length(); i++) {
                JSONObject p = pesanan.optJSONObject(i);
                if (p == null) continue;
                String id = p.optString("id", "");
                if (id.isEmpty() || lama.contains(id)) continue;
                lama.add(id);
                baru.put(p);
            }

            JSONArray untukDisimpan = new JSONArray();
            int mulai = Math.max(0, lama.size() - 300);
            int indeks = 0;
            for (String id : lama) {
                if (indeks++ >= mulai) untukDisimpan.put(id);
            }
            sp.edit().putString(KEY_IDS, untukDisimpan.toString()).putBoolean(KEY_SEED, true).apply();

            if (pertama) return; // jangan spam notifikasi untuk pesanan lama saat pertama kali aktif
            for (int i = 0; i < Math.min(baru.length(), 5); i++) {
                notifikasi(ctx, baru.getJSONObject(i));
            }
        } catch (Exception e) {
            Log.w(TAG, "Gagal cek pesanan: " + e.getMessage());
        }
    }

    private static void notifikasi(Context ctx, JSONObject p) {
        try {
            String no = p.optString("no_pesanan", "Pesanan baru");
            String nama = p.optString("nama", "Pelanggan");
            String metode = "kurir".equals(p.optString("metode", "")) ? "Kurir ke rumah" : "Ambil sendiri";
            String jam = p.optString("jam_ambil", "");
            String isi = nama + " — " + metode + (jam.isEmpty() ? "" : " · jam " + jam);

            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Pesanan Masuk",
                        NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Pemberitahuan pesanan baru dari website Sunday Breakfast");
                nm.createNotificationChannel(ch);
            }

            Intent buka = new Intent(ctx, MainActivity.class);
            buka.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flag = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flag |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, buka, flag);

            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(ctx, CHANNEL);
            else b = new Notification.Builder(ctx);
            b.setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("Pesanan baru " + no)
                    .setContentText(isi)
                    .setContentIntent(pi)
                    .setAutoCancel(true);
            if (Build.VERSION.SDK_INT >= 16) b.setPriority(Notification.PRIORITY_HIGH);
            nm.notify(Math.abs((no + nama).hashCode()) % 100000, b.build());
        } catch (Exception e) {
            Log.w(TAG, "Gagal notifikasi: " + e.getMessage());
        }
    }
}
