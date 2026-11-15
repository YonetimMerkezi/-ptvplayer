package com.koruk.iptv;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Point;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.util.ArrayDeque;
import java.util.Locale;

/**
 * Cihaz kütüphanesi: kullanıcının seçtiği klasör ağacını (SAF) tarar, küçük resim ve fotoğraf üretir, harici altyazıyı hazırlar.
 * Depolama izni gerekmez; harici kart ve USB bellekler de klasör seçicide görünür. Tüm yöntemler arka plan iş parçacığından çağrılır.
 */
final class MediaLibrary {
    private static final int MAX_FILES = 30000;
    private static final int MAX_DEPTH = 14;

    private MediaLibrary() {}

    /** Dosya türü: video, audio, image, sub (altyazı) ya da null (ilgisiz dosya). */
    static String kindOf(String mime, String name) {
        String m = mime == null ? "" : mime.toLowerCase(Locale.ROOT);
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".srt") || n.endsWith(".vtt")) return "sub";
        if (m.startsWith("video/")) return "video";
        if (m.startsWith("audio/")) return "audio";
        if (m.startsWith("image/")) return "image";
        // Bazı sağlayıcılar application/octet-stream verir: uzantıdan anlaşılır.
        if (n.matches(".*\\.(mp4|m4v|mkv|webm|avi|mov|wmv|flv|ts|m2ts|3gp|mpg|mpeg)$")) return "video";
        if (n.matches(".*\\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$")) return "audio";
        if (n.matches(".*\\.(jpg|jpeg|png|gif|webp|bmp|heic)$")) return "image";
        return null;
    }

    /** Ağaç kökünün görünen adı (ör. "Download", "SD kart"). */
    static String rootName(Context c, Uri tree) {
        try {
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Cursor cur = c.getContentResolver().query(doc, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null);
            if (cur != null) {
                try {
                    if (cur.moveToFirst() && cur.getString(0) != null) return cur.getString(0);
                } finally {
                    cur.close();
                }
            }
        } catch (Exception ignored) {
            // ad okunamazsa varsayılan
        }
        return "Klasör";
    }

    /** Ağacı gezer; medya ve altyazı dosyalarını {uri, name, kind, mime, size, mod, dir} olarak döndürür. */
    static JSONObject scan(Context c, Uri tree) throws Exception {
        ContentResolver cr = c.getContentResolver();
        JSONArray out = new JSONArray();
        boolean truncated = false;
        String rootId = DocumentsContract.getTreeDocumentId(tree);
        ArrayDeque<String[]> stack = new ArrayDeque<>(); // {belgeKimliği, göreli yol, derinlik}
        stack.push(new String[] { rootId, "", "0" });
        String[] cols = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        };
        while (!stack.isEmpty() && !truncated) {
            String[] cur = stack.pop();
            int depth = Integer.parseInt(cur[2]);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, cur[0]);
            Cursor q = null;
            try {
                q = cr.query(children, cols, null, null, null);
                while (q != null && q.moveToNext()) {
                    String id = q.getString(0);
                    String name = q.getString(1);
                    String mime = q.getString(2);
                    if (id == null || name == null || name.startsWith(".")) continue;
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                        if (depth < MAX_DEPTH) stack.push(new String[] { id, cur[1].isEmpty() ? name : cur[1] + "/" + name, String.valueOf(depth + 1) });
                        continue;
                    }
                    String kind = kindOf(mime, name);
                    if (kind == null) continue;
                    JSONObject o = new JSONObject();
                    o.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                    o.put("name", name);
                    o.put("kind", kind);
                    o.put("mime", mime == null ? "" : mime);
                    o.put("size", q.isNull(3) ? 0L : q.getLong(3));
                    o.put("mod", q.isNull(4) ? 0L : q.getLong(4));
                    o.put("dir", cur[1]);
                    out.put(o);
                    if (out.length() >= MAX_FILES) {
                        truncated = true;
                        break;
                    }
                }
            } catch (Exception ignored) {
                // okunamayan klasör atlanır, tarama sürer
            } finally {
                if (q != null) q.close();
            }
        }
        JSONObject r = new JSONObject();
        r.put("files", out);
        r.put("truncated", truncated);
        return r;
    }

    private static String dataUrl(Bitmap bmp, int quality) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, quality, bos);
        return "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
    }

    private static Bitmap decodeScaled(ContentResolver cr, Uri uri, int max) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        InputStream in = cr.openInputStream(uri);
        if (in == null) return null;
        try {
            BitmapFactory.decodeStream(in, null, o);
        } finally {
            in.close();
        }
        if (o.outWidth <= 0 || o.outHeight <= 0) return null;
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= max) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        in = cr.openInputStream(uri);
        if (in == null) return null;
        Bitmap bmp;
        try {
            bmp = BitmapFactory.decodeStream(in, null, d);
        } finally {
            in.close();
        }
        if (bmp == null) return null;
        int big = Math.max(bmp.getWidth(), bmp.getHeight());
        if (big > max) {
            float f = (float) max / big;
            bmp = Bitmap.createScaledBitmap(bmp, Math.max(1, Math.round(bmp.getWidth() * f)), Math.max(1, Math.round(bmp.getHeight() * f)), true);
        }
        return rotateByExif(cr, uri, bmp);
    }

    // EXIF yönü: yalnız Android 7+ (InputStream kurucusu); eski sürümlerde fotoğraf olduğu gibi kalır.
    private static Bitmap rotateByExif(ContentResolver cr, Uri uri, Bitmap bmp) {
        if (Build.VERSION.SDK_INT < 24) return bmp;
        InputStream in = null;
        try {
            in = cr.openInputStream(uri);
            if (in == null) return bmp;
            int ori = new android.media.ExifInterface(in).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
            int deg = ori == 6 ? 90 : ori == 3 ? 180 : ori == 8 ? 270 : 0;
            if (deg == 0) return bmp;
            Matrix m = new Matrix();
            m.postRotate(deg);
            return Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
        } catch (Exception e) {
            return bmp;
        } finally {
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {
                // kapanış hatası önemsiz
            }
        }
    }

    /** Küçük resim: fotoğraf için ölçeklenmiş kopya, video/ses için sağlayıcı kapağı ya da bir kare. Yoksa null. */
    static String thumb(Context c, Uri uri, String kind, int size) {
        ContentResolver cr = c.getContentResolver();
        int px = Math.max(64, Math.min(512, size));
        try {
            if ("image".equals(kind)) {
                Bitmap b = decodeScaled(cr, uri, px);
                return b == null ? null : dataUrl(b, 80);
            }
            Bitmap b = null;
            try {
                if (Build.VERSION.SDK_INT >= 21) b = DocumentsContract.getDocumentThumbnail(cr, uri, new Point(px, px), null);
            } catch (Exception ignored) {
                // sağlayıcı küçük resim vermiyor: kare alınacak
            }
            if (b == null && "video".equals(kind)) b = frameOf(c, uri, px);
            return b == null ? null : dataUrl(b, 78);
        } catch (Throwable e) {
            return null;
        }
    }

    private static Bitmap frameOf(Context c, Uri uri, int px) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(c, uri);
            Bitmap f = r.getFrameAtTime(1000000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            if (f == null) f = r.getFrameAtTime();
            if (f == null) return null;
            float k = (float) px / Math.max(f.getWidth(), f.getHeight());
            if (k < 1f) f = Bitmap.createScaledBitmap(f, Math.max(1, Math.round(f.getWidth() * k)), Math.max(1, Math.round(f.getHeight() * k)), true);
            return f;
        } catch (Exception e) {
            return null;
        } finally {
            try {
                r.release();
            } catch (Exception ignored) {
                // serbest bırakma hatası önemsiz
            }
        }
    }

    /** Galeri için büyük fotoğraf (en uzun kenar max piksel). */
    static String image(Context c, Uri uri, int max) throws Exception {
        Bitmap b = decodeScaled(c.getContentResolver(), uri, Math.max(480, Math.min(2560, max)));
        if (b == null) throw new Exception("Fotoğraf okunamadı");
        return dataUrl(b, 88);
    }

    /**
     * Harici altyazıyı oynatıcıya uygun UTF-8 dosyaya çevirir. Türkçe altyazılar çoğunlukla Windows-1254'tedir;
     * oynatıcı UTF-8 bekler, bu yüzden geçerli UTF-8 değilse 1254 (olmazsa 8859-9) olarak okunup yeniden yazılır.
     * Dönüş: önbellekteki dosyanın file:// adresi.
     */
    static String prepareSubtitle(Context c, Uri uri) throws Exception {
        InputStream in = c.getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("Altyazı açılamadı");
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0 && bos.size() < 4 * 1024 * 1024) bos.write(buf, 0, n);
        } finally {
            in.close();
        }
        byte[] raw = bos.toByteArray();
        int off = (raw.length >= 3 && (raw[0] & 0xFF) == 0xEF && (raw[1] & 0xFF) == 0xBB && (raw[2] & 0xFF) == 0xBF) ? 3 : 0;
        String text;
        try {
            text = Charset.forName("UTF-8").newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(raw, off, raw.length - off)).toString();
        } catch (CharacterCodingException e) {
            Charset cs;
            try {
                cs = Charset.forName("windows-1254");
            } catch (Exception e2) {
                cs = Charset.forName("ISO-8859-9");
            }
            text = new String(raw, off, raw.length - off, cs);
        }
        String ext = uri.toString().toLowerCase(Locale.ROOT).contains(".vtt") ? ".vtt" : ".srt";
        File dir = new File(c.getCacheDir(), "subs");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Altyazı klasörü oluşturulamadı");
        File f = new File(dir, "sub-" + Integer.toHexString(uri.toString().hashCode()) + ext);
        FileOutputStream fo = new FileOutputStream(f);
        try {
            fo.write(text.getBytes("UTF-8"));
        } finally {
            fo.close();
        }
        return Uri.fromFile(f).toString();
    }
}
