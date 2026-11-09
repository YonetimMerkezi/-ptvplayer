package com.koruk.iptv;

import android.content.Context;
import android.os.Environment;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Oynatılan canlı yayını cihaza MPEG-TS dosyası olarak kaydeder.
 * Veri oynatıcının kendi okumasından (TapDataSource) alınır: sağlayıcıya ikinci bağlantı açılmaz.
 * TS paketleri 188 bayttır ve 0x47 ile başlar; kayıt paket sınırında başlar, TS olmayan istekler (liste, anahtar vb.) yazılmaz.
 */
final class StreamRecorder {
    interface Listener {
        /** reason: null → kullanıcı durdurdu / bitti, "limit" → süre doldu, "disk" → depolama doldu, "error" → yazma hatası. */
        void onStopped(Info info, String reason);
    }

    static final class Info {
        String name;
        File file;
        long startedAt;
        long durationMs;
        long bytes;
    }

    private static final int PACKET = 188;
    private static final int SYNC = 0x47;
    static final long MIN_FREE_BYTES = 300L * 1024L * 1024L;
    private static final long STOP_FREE_BYTES = 50L * 1024L * 1024L;

    private static final Object LOCK = new Object();
    private static OutputStream out;
    private static File file;
    private static String name = "";
    private static long startedAt;
    private static long bytes;
    private static long maxMs;
    private static long lastSpaceCheck;
    private static boolean needSync;
    private static Object owner;
    private static Listener listener;

    private StreamRecorder() {}

    /** Kayıt klasörü (uygulamaya özel Filmler/Kayitlar); yoksa oluşturulur. */
    static File dirOf(Context c) {
        File base = c.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        File dir = new File(base != null ? base : c.getFilesDir(), "Kayitlar");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    static String safeName(String name) {
        String s = String.valueOf(name).replaceAll("[^\\p{L}\\p{N}]+", "-").replaceAll("^-+|-+$", "");
        if (s.length() > 40) s = s.substring(0, 40);
        return s.isEmpty() ? "kanal" : s;
    }

    static boolean active() {
        synchronized (LOCK) {
            return out != null;
        }
    }

    static File currentFile() {
        synchronized (LOCK) {
            return out != null ? file : null;
        }
    }

    /** Etkin kaydın durumu: {başlangıç ms, bayt}; kayıt yoksa null. */
    static long[] snapshot() {
        synchronized (LOCK) {
            if (out == null) return null;
            return new long[] {startedAt, bytes};
        }
    }

    static void start(File f, String channelName, long maxDurationMs, Listener l) throws IOException {
        Info prev;
        synchronized (LOCK) {
            prev = finishLocked();
        }
        if (prev != null && listener != null) listener.onStopped(prev, null);
        synchronized (LOCK) {
            out = new BufferedOutputStream(new FileOutputStream(f), 128 * 1024);
            file = f;
            name = channelName == null ? "" : channelName;
            startedAt = System.currentTimeMillis();
            bytes = 0;
            maxMs = Math.max(0, maxDurationMs);
            lastSpaceCheck = 0;
            needSync = true;
            owner = null;
            listener = l;
        }
    }

    /** Kaydı bitirir; kayıt yoksa null döner. */
    static Info stop(String reason) {
        Info info;
        Listener l;
        synchronized (LOCK) {
            info = finishLocked();
            l = listener;
        }
        if (info != null && l != null) l.onStopped(info, reason);
        return info;
    }

    /**
     * Oynatıcının okuduğu bir parçayı yazar (yükleme iş parçacığından çağrılır).
     * requestStart: parça bir isteğin ilk baytlarını içeriyor. Dönüş false ise bu isteğin kalanı yazılmaz (TS değil).
     */
    static boolean write(Object requester, byte[] b, int off, int len, boolean requestStart) {
        String stopReason = null;
        boolean keep = true;
        synchronized (LOCK) {
            if (out == null || len <= 0) return true;
            if (owner != null && owner != requester) return true; // aynı anda başka bir istek yazıyor (ör. ayrı ses akışı): karışmasın
            int start = off;
            if (needSync) {
                if (requestStart) {
                    if ((b[off] & 0xFF) != SYNC) return false;
                } else {
                    start = findSync(b, off, len);
                    if (start < 0) return true;
                }
            } else if (requestStart && (b[off] & 0xFF) != SYNC) {
                return false;
            }
            owner = requester;
            try {
                out.write(b, start, off + len - start);
                bytes += off + len - start;
                needSync = false;
            } catch (IOException e) {
                stopReason = "error";
            }
            if (stopReason == null) {
                long now = System.currentTimeMillis();
                if (maxMs > 0 && now - startedAt >= maxMs) stopReason = "limit";
                else if (now - lastSpaceCheck > 5000) {
                    lastSpaceCheck = now;
                    File dir = file.getParentFile();
                    if (dir != null && dir.getUsableSpace() < STOP_FREE_BYTES) stopReason = "disk";
                }
            }
        }
        if (stopReason != null) stop(stopReason);
        return keep;
    }

    /** İstek bitti: bu isteğin yazma sahipliği bırakılır. */
    static void release(Object requester) {
        synchronized (LOCK) {
            if (owner == requester) owner = null;
        }
    }

    // Ortadan başlayan akışta paket sınırını bulur: art arda üç paketin ilk baytı 0x47 olmalı.
    static int findSync(byte[] b, int off, int len) {
        int end = off + len;
        int last = Math.min(off + PACKET, end);
        for (int i = off; i < last; i++) {
            if ((b[i] & 0xFF) == SYNC && i + 2 * PACKET < end && (b[i + PACKET] & 0xFF) == SYNC && (b[i + 2 * PACKET] & 0xFF) == SYNC) return i;
        }
        return -1;
    }

    private static Info finishLocked() {
        if (out == null) return null;
        Info info = new Info();
        info.name = name;
        info.file = file;
        info.startedAt = startedAt;
        info.bytes = bytes;
        info.durationMs = Math.max(0, System.currentTimeMillis() - startedAt);
        try {
            out.flush();
            out.close();
        } catch (IOException ignored) {
            // kapatılamadıysa dosya olduğu kadarıyla kalır
        }
        out = null;
        owner = null;
        writeMeta(info);
        return info;
    }

    // Kaydın adı ve süresi yan dosyada saklanır: ad\nbaşlangıç\nsüre
    static void writeMeta(Info info) {
        try (FileWriter w = new FileWriter(metaOf(info.file))) {
            w.write(info.name.replace('\n', ' ') + "\n" + info.startedAt + "\n" + info.durationMs + "\n");
        } catch (IOException ignored) {
            // yan dosya yazılamadıysa liste dosya adından türetilir
        }
    }

    static File metaOf(File ts) {
        return new File(ts.getPath() + ".meta");
    }
}
