package com.koruk.iptv;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Google Play sürümü: yıllık abonelikler (Standart, Pro). Sunucu yoktur; üyelik hakkını Play'in verdiği etkin abonelik listesi belirler.
 * Arayüz hangi ürünün hangi katman olduğunu bilir (billing.js); burada yalnız Play ile konuşulur ve ürün kimlikleri aktarılır.
 * (Doğrudan dağıtılan APK sürümünde bu sınıfın yerinde src/direct altındaki boş uygulama vardır.)
 */
final class PlayBilling implements PurchasesUpdatedListener {
    private final Context app;
    private final Handler main;
    private BillingClient client;
    private PluginCall buyCall;

    PlayBilling(Context ctx, Handler main) {
        this.app = ctx.getApplicationContext();
        this.main = main;
    }

    private interface Ready {
        void run();
    }

    // Bağlantıyı kurar (varsa yeniden kullanır), hazır olunca run çalışır; kurulamazsa çağrı reddedilir. Play geri çağrıları ana iş parçacığındadır.
    private void ready(final PluginCall call, final Ready run) {
        if (client == null) {
            client = BillingClient.newBuilder(app)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
        }
        if (client.isReady()) {
            run.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) run.run();
                else call.reject(message(r));
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Kitaplık kendiliğinden yeniden bağlanır (enableAutoServiceReconnection).
            }
        });
    }

    private static String message(BillingResult r) {
        switch (r.getResponseCode()) {
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
                return "Google Play satın alma şu an kullanılamıyor";
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
                return "Google Play'e ulaşılamadı: bağlantınızı kontrol edin";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
                return "Bu üyelik şu an satışta değil";
            case BillingClient.BillingResponseCode.DEVELOPER_ERROR:
                return "Üyelik ürünü Google Play'de tanımlı değil";
            default:
                String d = r.getDebugMessage();
                return "Google Play hatası" + (d == null || d.isEmpty() ? "" : ": " + d);
        }
    }

    private static List<QueryProductDetailsParams.Product> products(List<String> ids) {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : ids) {
            list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.SUBS).build());
        }
        return list;
    }

    // Satın alınacak teklif: önce ücretsiz deneme evresi olan (Play uygun olmayan kullanıcıya göstermez), yoksa temel plan, yoksa ilk teklif.
    private static ProductDetails.SubscriptionOfferDetails pickOffer(ProductDetails d) {
        List<ProductDetails.SubscriptionOfferDetails> offers = d.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        for (ProductDetails.SubscriptionOfferDetails o : offers) {
            for (ProductDetails.PricingPhase ph : o.getPricingPhases().getPricingPhaseList()) {
                if (ph.getPriceAmountMicros() == 0) return o;
            }
        }
        for (ProductDetails.SubscriptionOfferDetails o : offers) {
            if (o.getOfferId() == null) return o;
        }
        return offers.get(0);
    }

    private static List<String> ids(PluginCall call) {
        List<String> out = new ArrayList<>();
        JSArray arr = call.getArray("ids");
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            try {
                String s = arr.getString(i);
                if (s != null && !s.isEmpty()) out.add(s);
            } catch (JSONException ignored) {
            }
        }
        return out;
    }

    /** Ürünlerin fiyatı: { products: [{ id, price, period, trial }] }. price/period yinelenen evrenin; trial ücretsiz evrenin süresi (yoksa ''). */
    void products(final PluginCall call) {
        final List<String> want = ids(call);
        if (want.isEmpty()) {
            call.reject("Ürün kimliği yok");
            return;
        }
        ready(call, () -> client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products(want)).build(), (r, res) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(message(r));
                return;
            }
            JSArray out = new JSArray();
            for (ProductDetails d : res.getProductDetailsList()) {
                ProductDetails.SubscriptionOfferDetails o = pickOffer(d);
                if (o == null) continue;
                List<ProductDetails.PricingPhase> phases = o.getPricingPhases().getPricingPhaseList();
                if (phases.isEmpty()) continue;
                ProductDetails.PricingPhase last = phases.get(phases.size() - 1);
                String trial = "";
                for (ProductDetails.PricingPhase ph : phases) {
                    if (ph.getPriceAmountMicros() == 0) trial = ph.getBillingPeriod();
                }
                JSObject p = new JSObject();
                p.put("id", d.getProductId());
                p.put("price", last.getFormattedPrice());
                p.put("period", last.getBillingPeriod());
                p.put("trial", trial);
                out.put(p);
            }
            JSObject o = new JSObject();
            o.put("products", out);
            call.resolve(o);
        }));
    }

    /** Etkin abonelikler: { active: [ürün kimlikleri], pending: [...] }. Onaylanmamış ödenmiş abonelikleri onaylar (3 gün içinde onaylanmazsa Play iade eder). */
    void state(final PluginCall call) {
        ready(call, () -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (r, list) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(message(r));
                return;
            }
            JSArray active = new JSArray();
            JSArray pending = new JSArray();
            JSObject tokens = new JSObject(); // ürün kimliği → satın alma jetonu (tek cihaz kuralı: yalnız tek yönlü özeti sunucuya gider)
            for (Purchase p : list) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    acknowledge(p);
                    for (String id : p.getProducts()) {
                        active.put(id);
                        tokens.put(id, p.getPurchaseToken());
                    }
                } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    for (String id : p.getProducts()) pending.put(id);
                }
            }
            JSObject o = new JSObject();
            o.put("active", active);
            o.put("pending", pending);
            o.put("tokens", tokens);
            call.resolve(o);
        }));
    }

    private void acknowledge(Purchase p) {
        if (p.isAcknowledged()) return;
        client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> {});
    }

    /** Satın alma ekranını açar; kullanıcı bitirince { result: 'purchased' | 'pending' | 'canceled' | 'owned' } ile döner. */
    void buy(final PluginCall call, final Activity activity) {
        final String id = call.getString("id", "");
        if (id.isEmpty() || activity == null) {
            call.reject("Satın alma başlatılamadı");
            return;
        }
        if (buyCall != null) {
            call.reject("Başka bir satın alma sürüyor");
            return;
        }
        ready(call, () -> client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products(Collections.singletonList(id))).build(), (r, res) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(message(r));
                return;
            }
            List<ProductDetails> found = res.getProductDetailsList();
            ProductDetails d = found.isEmpty() ? null : found.get(0);
            ProductDetails.SubscriptionOfferDetails offer = d == null ? null : pickOffer(d);
            if (offer == null) {
                call.reject("Üyelik ürünü Google Play'de bulunamadı");
                return;
            }
            BillingFlowParams.ProductDetailsParams one = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(d)
                .setOfferToken(offer.getOfferToken())
                .build();
            BillingFlowParams flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(one)).build();
            buyCall = call;
            BillingResult lr = client.launchBillingFlow(activity, flow);
            if (lr.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                buyCall = null;
                call.reject(message(lr));
            }
        }));
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        final PluginCall call = buyCall;
        buyCall = null;
        if (call == null) return; // dışarıdan gelen güncelleme: arayüz öne gelince listeyi yeniler
        JSObject o = new JSObject();
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            String result = "pending";
            for (Purchase p : purchases) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    acknowledge(p);
                    result = "purchased";
                }
            }
            o.put("result", result);
            call.resolve(o);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            o.put("result", "canceled");
            call.resolve(o);
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            o.put("result", "owned");
            call.resolve(o);
        } else {
            call.reject(message(r));
        }
    }

    /** Play'in abonelik yönetim sayfasını açar (iptal, ödeme yöntemi). */
    void manage(final PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/account/subscriptions?package=" + app.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            app.startActivity(i);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Abonelik sayfası açılamadı");
        }
    }
}
