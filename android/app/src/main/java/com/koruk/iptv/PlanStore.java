package com.koruk.iptv;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Planlananlar (program hatırlatıcıları ve zamanlı kayıtlar). Liste SharedPreferences'ta JSON dizisi olarak durur,
 * her plan için AlarmManager alarmı kurulur; telefon yeniden başlayınca ya da uygulama güncellenince geri kurulur.
 * Plan: {id, kind: "rem"|"rec", at, e, until, src, chId, chName, title, url, headers}
 */
final class PlanStore {
    static final String ACTION_FIRE = "com.koruk.iptv.PLAN_FIRE";
    private static final String PREFS = "iptv_plans";
    private static final String KEY = "list";
    private static final Object LOCK = new Object();

    private PlanStore() {}

    static JSONArray read(Context c) {
        synchronized (LOCK) {
            return readLocked(c);
        }
    }

    private static JSONArray readLocked(Context c) {
        String raw = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void write(Context c, JSONArray list) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, list.toString()).apply();
    }

    static JSONObject find(Context c, String id) {
        synchronized (LOCK) {
            JSONArray list = readLocked(c);
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o != null && id.equals(o.optString("id"))) return o;
            }
            return null;
        }
    }

    /** Listeyi verilenle değiştirir: eski alarmlar iptal edilir, yenileri kurulur. */
    static void replaceAll(Context c, JSONArray plans) {
        synchronized (LOCK) {
            JSONArray old = readLocked(c);
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.optJSONObject(i);
                if (o != null) cancelAlarm(c, o.optString("id"));
            }
            write(c, plans);
            for (int i = 0; i < plans.length(); i++) {
                JSONObject o = plans.optJSONObject(i);
                if (o != null) scheduleAlarm(c, o);
            }
        }
    }

    /** Tetiklenen ya da silinen plan listeden çıkar (yeniden başlatmada tekrar kurulmasın). */
    static void remove(Context c, String id) {
        synchronized (LOCK) {
            JSONArray list = readLocked(c);
            JSONArray keep = new JSONArray();
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o != null && !id.equals(o.optString("id"))) keep.put(o);
            }
            write(c, keep);
            cancelAlarm(c, id);
        }
    }

    /** Yeniden başlatma / güncelleme sonrası alarmları geri kurar; süresi dolanlar atılır. */
    static void rescheduleAll(Context c) {
        synchronized (LOCK) {
            JSONArray list = readLocked(c);
            JSONArray keep = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o == null || endOf(o) <= now) continue;
                keep.put(o);
                scheduleAlarm(c, o);
            }
            write(c, keep);
        }
    }

    static long endOf(JSONObject plan) {
        return plan.optLong("until", plan.optLong("e", 0L));
    }

    private static PendingIntent pending(Context c, String id) {
        Intent i = new Intent(c, PlanReceiver.class).setAction(ACTION_FIRE).putExtra("id", id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancelAlarm(Context c, String id) {
        if (id == null || id.isEmpty()) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(c, id));
    }

    private static void scheduleAlarm(Context c, JSONObject plan) {
        String id = plan.optString("id", "");
        if (id.isEmpty()) return;
        long now = System.currentTimeMillis();
        if (endOf(plan) <= now) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long when = Math.max(plan.optLong("at", now), now + 1500L); // kaçırılan ama süren plan hemen çalışır
        PendingIntent pi = pending(c, id);
        try {
            if (Build.VERSION.SDK_INT < 23) am.setExact(AlarmManager.RTC_WAKEUP, when, pi);
            else if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC_WAKEUP, when, pi); // tam zamanlı alarm izni yok: birkaç dakika kayabilir
        }
    }

    /** Tam zamanlı alarm izni var mı (Android 12+ ayarlarda kapalı olabilir). */
    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }
}
