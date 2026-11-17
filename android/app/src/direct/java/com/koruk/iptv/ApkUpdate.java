package com.koruk.iptv;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.util.concurrent.Executor;

/**
 * Uygulama içi güncelleme (yalnız doğrudan dağıtılan APK sürümü): yeni APK'yı önbelleğe indirir ve Android kurulum ekranını açar.
 * Google Play sürümünde bu sınıfın yerini, hiçbir şey indirmeyen ve kurmayan bir karşılığı alır (src/play).
 */
final class ApkUpdate {
    interface Net {
        HttpURLConnection open(String url) throws IOException;
    }

    interface Emit {
        void emit(String event, JSObject data);
    }

    private ApkUpdate() {}

    // Yeni sürümün APK'sını önbelleğe indirir; ilerleme "apkProgress" olayıyla bildirilir.
    static void download(final Context ctx, final PluginCall call, Executor io, final File dir, final Net net, final Emit emit) {
        final String url = call.getData().optString("url", "");
        if (url.isEmpty()) {
            call.reject("url gerekli");
            return;
        }
        io.execute(() -> {
            HttpURLConnection conn = null;
            File part = new File(dir, "iptv-update.part");
            File out = new File(dir, "iptv-update.apk");
            try {
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                conn = net.open(url);
                long total = conn.getContentLengthLong();
                try (InputStream src = conn.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    long lastEmit = 0;
                    int n;
                    while ((n = src.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 250) {
                            lastEmit = now;
                            JSObject p = new JSObject();
                            p.put("loaded", done);
                            p.put("total", total);
                            emit.emit("apkProgress", p);
                        }
                    }
                }
                if (total > 0 && part.length() != total) throw new IOException("İndirme yarım kaldı");
                if (out.exists() && !out.delete()) throw new IOException("Eski güncelleme dosyası silinemedi");
                if (!part.renameTo(out)) throw new IOException("Güncelleme dosyası yazılamadı");
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("size", out.length());
                call.resolve(r);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    // İndirilen APK için Android kurulum ekranını açar. "Bilinmeyen uygulamaları yükle" izni yoksa izin ekranını açar.
    static void install(final Context ctx, final PluginCall call, Handler main, final File updateDir) {
        final String path = call.getData().optString("path", "");
        main.post(() -> {
            try {
                File f = new File(path);
                String dirPath = updateDir.getCanonicalPath() + File.separator;
                if (!f.isFile() || !f.getCanonicalPath().startsWith(dirPath)) {
                    call.reject("Güncelleme dosyası bulunamadı");
                    return;
                }
                JSObject r = new JSObject();
                if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
                    Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
                    s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(s);
                    r.put("needsPermission", true);
                    call.resolve(r);
                    return;
                }
                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                r.put("needsPermission", false);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
        });
    }
}
