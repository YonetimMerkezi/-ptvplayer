package com.koruk.iptv;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

// Capacitor'un WebView istemcisi aynen kalır; yalnız dış adreslerden gelen görsel istekleri önce cihazdaki görsel önbelleğine (ImageCache) sorulur.
final class ImageWebViewClient extends BridgeWebViewClient {
    ImageWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse cached = ImageCache.serve(request);
        return cached != null ? cached : super.shouldInterceptRequest(view, request);
    }
}
