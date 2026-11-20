// Belleğe alma: açılışta ve ara sıra veriler (depo kayıtları, katalog arama dizini, rehber) bellekte hazırlanır.
// Bu sırada biraz kasma olabileceğinden ilerleme (aşama adı + yüzde + çubuk) ve bir bilgi notu gösterilir.
// Burada yalnız saf mantık var (aşamaları sırayla çalıştırma, genel yüzde, ara sıra yenileme zamanı, gösterim HTML'i); DOM işi app.js'tedir.

export const NOTE = 'Bu sırada biraz kasma olabilir';
export const PERIOD_MS = 30 * 60 * 1000; // bellek bu aralıkla (uygulama açık, boşta) yeniden tazelenir
export const MEM_CHECK_MS = 5 * 60 * 1000; // zamanı gelip gelmediğine bu aralıkla bakılır

// Genel yüzde (0-100): biten aşamaların ağırlığı + sürmekte olan aşamanın payı.
export function overall(steps, index, frac = 0) {
  const total = steps.reduce((a, s) => a + (s.weight || 1), 0) || 1;
  let done = 0;
  for (let i = 0; i < index; i++) done += steps[i].weight || 1;
  const f = Math.min(1, Math.max(0, Number(frac) || 0));
  return Math.min(100, Math.max(0, Math.round(((done + (steps[index] ? (steps[index].weight || 1) * f : 0)) / total) * 100)));
}

// Aşamaları sırayla çalıştırır. step = { label, weight, run(report) }; report(0..1) aşama içi ilerlemedir.
// onProgress({ label, pct }) her değişimde çağrılır. Bir aşama hata verirse atlanır, diğerleri sürer; dönen: { failed: [etiketler] }.
export async function runWarm(steps, { onProgress = () => {} } = {}) {
  const list = steps.filter(Boolean);
  const failed = [];
  let last = -1;
  let lastLabel = '';
  for (let i = 0; i < list.length; i++) {
    const label = list[i].label;
    const report = (frac) => {
      const pct = overall(list, i, frac);
      if (pct !== last || label !== lastLabel) onProgress({ label, pct }); // aynı yüzde tekrar çizilmez
      last = pct;
      lastLabel = label;
    };
    report(0);
    try {
      await list[i].run(report);
    } catch (e) {
      failed.push(label);
    }
    report(1);
  }
  onProgress({ label: '', pct: 100 });
  return { failed };
}

// Ara sıra yenileme: son tazelemeden PERIOD_MS geçtiyse, uygulama görünürse ve meşgul değilse (oynatıcı açık, liste yükleniyor) zamanı gelmiştir.
export function duePeriodic({ now = Date.now(), last = 0, visible = true, busy = false, period = PERIOD_MS } = {}) {
  return !!visible && !busy && now - (Number(last) || 0) >= period;
}

// Gösterim: aşama adı, yüzde, çubuk ve kasma notu (açılış ekranında ve uyarı çubuğunda aynı işaretleme).
export function progressHtml(label, pct, esc = (s) => s, note = NOTE) {
  const p = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  return `<span class="mw"><span class="mw-h"><b>${esc(label)}</b><em>%${p}</em></span><span class="mw-bar"><i style="width:${p}%"></i></span>${note ? `<small>${esc(note)}</small>` : ''}</span>`;
}
