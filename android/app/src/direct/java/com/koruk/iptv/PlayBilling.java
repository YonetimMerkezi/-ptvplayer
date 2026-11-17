package com.koruk.iptv;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;

import com.getcapacitor.PluginCall;

/**
 * Doğrudan dağıtılan APK: Google Play satın alma yoktur (uygulama bu sürümde tamamen açıktır, üyelik kilidi çalışmaz). Arayüz bu sürümde
 * hiç çağırmaz; çağrılırsa reddedilir. Gerçek uygulama Play sürümündedir (src/play).
 */
final class PlayBilling {
    PlayBilling(Context ctx, Handler main) {}

    private static void no(PluginCall call) {
        call.reject("Bu sürümde Google Play satın alma yok");
    }

    void products(PluginCall call) {
        no(call);
    }

    void state(PluginCall call) {
        no(call);
    }

    void buy(PluginCall call, Activity activity) {
        no(call);
    }

    void manage(PluginCall call) {
        no(call);
    }
}
