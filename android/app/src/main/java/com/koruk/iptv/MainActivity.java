package com.koruk.iptv;

import android.os.Build;
import android.os.Bundle;
import android.content.Intent;
import android.content.res.Configuration;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.lifecycle.Lifecycle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private long lastBackAt = 0;

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        IptvPlayerPlugin.handlePipAction(intent);
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < 31) IptvPlayerPlugin.enterPipFromUserLeave();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        IptvPlayerPlugin.onPipModeChanged(isInPictureInPictureMode);
        if (!isInPictureInPictureMode) {
            hideSystemBars();
            // Pencere X ile kapatıldıysa etkinlik görünür duruma dönmez; yayın duraklatılır.
            if (!getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED)) IptvPlayerPlugin.onPipDismissed();
        }
    }

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
                } else if (IptvPlayerPlugin.tvMode && System.currentTimeMillis() - lastBackAt > 2500) {
                    // TV'de kumandayla yanlışlıkla çıkmamak için ana ekranda ikinci basış gerekir
                    lastBackAt = System.currentTimeMillis();
                    Toast.makeText(MainActivity.this, "Çıkmak için Geri tuşuna tekrar basın", Toast.LENGTH_SHORT).show();
                } else if (!IptvPlayerPlugin.tvMode && IptvPlayerPlugin.enterPipFromUserLeave()) {
                    // Yayın sürerken ana ekranda Geri: uygulama kapanmaz, yayın küçük pencerede (PiP) devam eder
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        setupFullscreen();
        focusWebView();
    }

    // TV kumandasının yön/Tamam tuşları WebView'e ulaşsın: WebView ilk açılışta odakta olmalı.
    private void focusWebView() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.requestFocus();
    }

    // Kanal +/-, medya, menü ve renkli tuşlar sayfaya olay olarak iletilir (WebView bunları klavye olayına çevirmez).
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            String name = RemoteKeys.nameOf(e.getKeyCode());
            if (name != null && RemoteKeys.send(name)) return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // Uygulamanın tamamı tam ekran: durum/gezinme çubukları gizli, pencere kamera çentiğinin altına da çizilir.
    // Çentik payı CSS'e gerçek ölçüyle verilir (WebView'in env(safe-area-inset-*) değeri dönüşte bayat kalabiliyor).
    private void setupFullscreen() {
        Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        hideSystemBars();

        View content = findViewById(android.R.id.content);
        if (content == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            // Ekran klavyesi açılınca içerik klavyenin üstüne oturur (sistem çubukları gizli olduğundan kendimiz yaparız).
            v.setPadding(0, 0, 0, Build.VERSION.SDK_INT >= 30 ? ime.bottom : 0); // eski sürümlerde klavye payı güvenilir ölçülemez
            SafeArea.set(cut.left, cut.top, cut.right, cut.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }

    private void hideSystemBars() {
        Window w = getWindow();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        if (c == null) return;
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !isInPictureInPictureMode()) {
            hideSystemBars(); // klavye/iletişim kutusundan dönünce çubuklar yeniden gizlenir
            focusWebView();
        }
    }
}
