package com.koruk.iptv;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.tvprovider.media.tv.TvContractCompat;
import androidx.tvprovider.media.tv.WatchNextProgram;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Android TV ana ekranı "Sıradakiler" (Watch Next) satırı: yarım kalan film ve dizi bölümleri. Kendi eklediğimiz
 * satırların kimlikleri SharedPreferences'ta tutulur; her eşitlemede eskiler silinip güncel liste eklenir.
 * TV olmayan cihazlarda (içerik sağlayıcı yok) sessizce hiçbir şey yapmaz.
 */
final class TvHome {
    private static final String PREFS = "iptv_tvhome";
    private static final String KEY = "ids";
    private static final int MAX = 12;

    private TvHome() {}

    /** items: [{id, kind: "movie"|"episode", title, poster, pos, dur, at, uri}] */
    static synchronized int sync(Context c, JSONArray items) {
        try {
            ContentResolver cr = c.getContentResolver();
            clear(c, cr);
            JSONArray ids = new JSONArray();
            int n = Math.min(items.length(), MAX);
            for (int i = 0; i < n; i++) {
                JSONObject o = items.optJSONObject(i);
                if (o == null) continue;
                String uri = o.optString("uri", "");
                String title = o.optString("title", "");
                if (uri.isEmpty() || title.isEmpty()) continue;
                Intent launch = new Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(c.getPackageName());
                boolean episode = "episode".equals(o.optString("kind"));
                WatchNextProgram.Builder b = new WatchNextProgram.Builder();
                b.setType(episode ? TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE : TvContractCompat.WatchNextPrograms.TYPE_MOVIE)
                        .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                        .setLastEngagementTimeUtcMillis(o.optLong("at", System.currentTimeMillis()))
                        .setTitle(title)
                        .setLastPlaybackPositionMillis((int) Math.min(Integer.MAX_VALUE, o.optLong("pos", 0L)))
                        .setDurationMillis((int) Math.min(Integer.MAX_VALUE, o.optLong("dur", 0L)))
                        .setInternalProviderId(o.optString("id", ""))
                        .setIntentUri(Uri.parse(launch.toUri(Intent.URI_INTENT_SCHEME)));
                String poster = o.optString("poster", "");
                if (poster.startsWith("http")) {
                    b.setPosterArtUri(Uri.parse(poster)).setPosterArtAspectRatio(TvContractCompat.WatchNextPrograms.ASPECT_RATIO_2_3);
                }
                Uri row = cr.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, b.build().toContentValues());
                if (row != null) ids.put(ContentUris.parseId(row));
            }
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, ids.toString()).apply();
            return ids.length();
        } catch (Exception e) {
            return -1; // TV içerik sağlayıcısı yok / izin yok: ana ekran satırı olmadan devam
        }
    }

    private static void clear(Context c, ContentResolver cr) {
        String raw = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]");
        try {
            JSONArray old = new JSONArray(raw);
            for (int i = 0; i < old.length(); i++) {
                long id = old.optLong(i, -1L);
                if (id >= 0) cr.delete(TvContractCompat.buildWatchNextProgramUri(id), null, null);
            }
        } catch (Exception ignored) {
            // bozuk kayıt: yeni listeyle üzerine yazılır
        }
    }
}
