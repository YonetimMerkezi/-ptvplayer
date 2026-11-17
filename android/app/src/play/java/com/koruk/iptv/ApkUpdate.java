package com.koruk.iptv;

import android.content.Context;
import android.os.Handler;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.util.concurrent.Executor;

/**
 * Google Play sürümü: güncellemeyi Play yapar, uygulama kendini indirip kurmaz. Arayüz bu sürümde güncelleme denetimini hiç başlatmaz;
 * yine de çağrılırsa istek reddedilir. (Doğrudan dağıtılan APK sürümünün gerçek uygulaması src/direct altındadır.)
 */
final class ApkUpdate {
    interface Net {
        HttpURLConnection open(String url) throws IOException;
    }

    interface Emit {
        void emit(String event, JSObject data);
    }

    private ApkUpdate() {}

    static void download(Context ctx, PluginCall call, Executor io, File dir, Net net, Emit emit) {
        call.reject("Bu sürümde güncellemeyi Google Play yapar");
    }

    static void install(Context ctx, PluginCall call, Handler main, File updateDir) {
        call.reject("Bu sürümde güncellemeyi Google Play yapar");
    }
}
