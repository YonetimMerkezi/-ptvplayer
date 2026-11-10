package com.koruk.iptv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** Alarm zamanı gelen planı çalıştırır (hatırlatıcı bildirimi / kayıt hizmeti); yeniden başlatmada alarmları geri kurar. */
public class PlanReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        try {
            if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
                PlanStore.rescheduleAll(c);
                PlanStore.log(c, Intent.ACTION_BOOT_COMPLETED.equals(a) ? "telefon açıldı: alarmlar yeniden kuruldu" : "uygulama güncellendi: alarmlar yeniden kuruldu");
                return;
            }
            if (!PlanStore.ACTION_FIRE.equals(a)) return;
            String id = intent.getStringExtra("id");
            if (id == null) return;
            JSONObject plan = PlanStore.find(c, id);
            if (plan == null) {
                PlanStore.log(c, "alarm geldi ama plan bulunamadı");
                return;
            }
            PlanStore.remove(c, id); // tek seferlik: yeniden başlatmada tekrar kurulmasın
            if ("rec".equals(plan.optString("kind"))) {
                PlanStore.log(c, "alarm geldi: zamanlı kayıt başlatılıyor (" + plan.optString("title") + ")");
                RecordService.start(c, plan);
            } else {
                String r = Notifier.reminder(c, plan);
                PlanStore.log(c, "alarm geldi (" + plan.optString("title") + "): " + r);
            }
        } catch (RuntimeException e) {
            PlanStore.log(c, "alarm işlenirken hata: " + e.getClass().getSimpleName());
        }
    }
}
