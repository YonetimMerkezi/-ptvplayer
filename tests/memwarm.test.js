// Belleğe alma: aşama sırası, genel yüzde, hatalı aşamanın atlanması, ara sıra tazeleme zamanı, gösterim ve uygulamaya bağlantı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overall, runWarm, duePeriodic, progressHtml, NOTE, PERIOD_MS } from '../www/js/memwarm.js';

const kaynak = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('genel yüzde: biten aşamaların ağırlığı + sürenin payı; sınırlar 0-100', () => {
  const steps = [{ weight: 1 }, { weight: 3 }];
  assert.equal(overall(steps, 0, 0), 0);
  assert.equal(overall(steps, 0, 1), 25);
  assert.equal(overall(steps, 1, 0), 25);
  assert.equal(overall(steps, 1, 0.5), 63);
  assert.equal(overall(steps, 1, 1), 100);
  assert.equal(overall(steps, 1, 9), 100, 'aşırı pay kırpılır');
  assert.equal(overall(steps, 0, -3), 0);
  assert.equal(overall([], 0, 0.5), 0);
});

test('aşamalar sırayla çalışır, ilerleme artar ve sonda 100 + boş ad (kapat) gelir; hatalı aşama atlanır, diğerleri sürer', async () => {
  const sira = [];
  const prog = [];
  const r = await runWarm([
    { label: 'A', weight: 1, run: async (rep) => { sira.push('A'); rep(0.5); } },
    false, // koşullu aşama (ilk açılış değilse yok)
    { label: 'B', weight: 1, run: async () => { sira.push('B'); throw new Error('bozuk'); } },
    { label: 'C', weight: 2, run: async (rep) => { sira.push('C'); rep(1); } },
  ], { onProgress: (p) => prog.push(p) });
  assert.deepEqual(sira, ['A', 'B', 'C']);
  assert.deepEqual(r.failed, ['B']);
  const pcts = prog.filter((p) => p.label).map((p) => p.pct);
  assert.ok(pcts.every((p, i) => i === 0 || p >= pcts[i - 1]), 'yüzde geriye gitmez');
  assert.equal(prog.at(-1).label, '', 'bitince boş ad: ilerleme kapanır');
  assert.equal(prog.at(-1).pct, 100);
  assert.ok(prog.some((p) => p.label === 'C'));
});

test('ara sıra tazeleme: süre dolmadıkça, uygulama görünmezken ya da meşgulken çalışmaz', () => {
  const now = 10 * PERIOD_MS;
  assert.equal(duePeriodic({ now, last: now - PERIOD_MS + 1 }), false);
  assert.equal(duePeriodic({ now, last: now - PERIOD_MS }), true);
  assert.equal(duePeriodic({ now, last: 0 }), true);
  assert.equal(duePeriodic({ now, last: 0, visible: false }), false);
  assert.equal(duePeriodic({ now, last: 0, busy: true }), false, 'oynatıcı açık / liste yükleniyor');
});

test('gösterim: aşama adı, yüzde, çubuk ve kasma notu; metin kaçırılır; yüzde sınırlanır', () => {
  const h = progressHtml('Liste <b>', 42.4, (s) => String(s).replace(/</g, '&lt;'));
  assert.match(h, /<b>Liste &lt;b><\/b><em>%42<\/em>/);
  assert.match(h, /<i style="width:42%"><\/i>/);
  assert.ok(h.includes(NOTE) && NOTE === 'Bu sırada biraz kasma olabilir');
  assert.match(progressHtml('x', 250), /%100/);
  assert.match(progressHtml('x', -5), /%0/);
  assert.ok(!progressHtml('x', 10, (s) => s, '').includes('<small>'), 'not boşsa yazılmaz');
});

test('bağlantı: açılışta ve liste güncellenirken ilerleme gösterilir; ara sıra tazelenir; rehber ilk çizimi bekletmez; eski katalog bir kez geri yazılır', () => {
  const app = kaynak('www/js/app.js');
  assert.match(app, /await runWarm\(\[\n\s+!S\.memWarm && \{ label: 'Ayarlar ve kayıtlar belleğe alınıyor…'/, 'oturumda ilk açılışta tüm kayıtlar belleğe alınır');
  assert.match(app, /label: 'Liste belleğe alınıyor…'/);
  assert.match(app, /catalogFromStorableAsync\(raw, \{ onProgress/, 'dizin eksikse ilerlemeli tamamlanır');
  assert.match(app, /S\.epg = new EpgView\(null\); \/\/ rehber ilk çizimi bekletmesin/);
  assert.match(app, /memProgress\(\{ label: 'Rehber belleğe alınıyor…', pct: 30 \}\);/);
  assert.match(app, /if \(computed > 0 && cached\) setTimeout\(\(\) => store\.cache\.set\('cat:' \+ id, catalogToStorable\(cached\)\)/, 'dizin bir kez geri yazılır');
  assert.match(app, /memProgress\(\{ label: 'Liste belleğe kaydediliyor…', pct: 25 \}\);/, 'liste güncellenirken de gösterilir');
  assert.match(app, /store\.preload\(\{ reload: true,/, 'ara sıra tazeleme');
  assert.match(app, /\}, MEM_CHECK_MS\);/);
  assert.match(app, /const intro = document\.getElementById\('intro'\);\n  if \(intro && !intro\.dataset\.ending\)/, 'açılış animasyonu sürerken ilerleme onun içinde');
  assert.match(app, /if \(b\.dataset\.mem \|\| !b\.hidden\) paint\(\);\n  else if \(!memShowT\) memShowT = setTimeout\(paint, 200\);/, 'çubuk kapalıyken 200 ms sonra, açıksa hemen');
  const css = kaynak('www/css/app.css');
  assert.match(css, /\.mw-bar i \{/);
  assert.match(css, /#intro \.in-prog \{/);
  const en = kaynak('www/js/i18n-en-b.js');
  for (const t of ['Ayarlar ve kayıtlar belleğe alınıyor…', 'Liste belleğe alınıyor…', 'Liste belleğe kaydediliyor…', 'Rehber belleğe alınıyor…', 'Veriler belleğe alınıyor…', 'Bu sırada biraz kasma olabilir']) assert.ok(en.includes(`["${t}"`), t + ' çevrildi');
});
