package com.koruk.iptv;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IptvPlayerPlugin.class);
        super.onCreate(savedInstanceState);

        // Capacitor çekirdeği geri tuşunu işlemez (bunu @capacitor/app eklentisi yapar); işlenmezse uygulama
        // doğrudan kapanır. Sayfadaki katmanlar (oynatıcı, alt sayfalar, kategori içi) WebView geçmişine
        // eklenir; geri tuşu geçmişte bir adım geri gider, geçmiş bitince uygulamadan çıkılır.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }
}
