import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTRO_MIN_MS, INTRO_FADE_MS, introWait, finishIntro } from '../www/js/intro.js';

const oku = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('introWait: açılıştan beri geçen süre en az INTRO_MIN_MS olana dek bekler, geç hazırsa beklemez', () => {
  assert.equal(introWait(0), INTRO_MIN_MS);
  assert.equal(introWait(400), INTRO_MIN_MS - 400);
  assert.equal(introWait(INTRO_MIN_MS), 0);
  assert.equal(introWait(9000), 0, 'arayüz geç hazırsa ek gecikme yok');
  assert.equal(introWait(-5), INTRO_MIN_MS);
  assert.equal(introWait(NaN), INTRO_MIN_MS);
});

test('finishIntro: öğe yoksa sessiz; varsa bir kez solar ve kalkar', async () => {
  finishIntro({ getElementById: () => null }, 0); // öğe zaten kalkmış
  const cls = new Set();
  let removed = 0;
  const el = { dataset: {}, classList: { add: (c) => cls.add(c) }, remove: () => { removed++; } };
  const doc = { getElementById: () => el };
  finishIntro(doc, INTRO_MIN_MS); // bekleme yok
  finishIntro(doc, INTRO_MIN_MS); // ikinci çağrı etkisiz
  assert.equal(el.dataset.ending, '1');
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(cls.has('out'));
  assert.equal(removed, 0, 'solma bitmeden kaldırılmaz');
  await new Promise((r) => setTimeout(r, INTRO_FADE_MS + 120));
  assert.equal(removed, 1);
});

test('açılış animasyonu: işaretleme, CSS, yenileme atlama ve boot çağrıları yerinde', () => {
  const html = oku('www/index.html');
  assert.match(html, /<body>\s*<div id="intro"/, 'animasyon gövdenin en başında: ilk çizimde görünür');
  assert.match(html, /nv\.type !== 'navigate'[\s\S]*intro-skip/, 'yenilemede atlanır');
  assert.ok(html.indexOf('intro-skip') < html.indexOf('css/app.css'), 'atlama işareti stilden önce konur');
  const css = oku('www/css/app.css');
  assert.match(css, /html\.intro-skip #intro \{ display: none/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ #intro \{ display: none/);
  assert.match(css, /#intro \{[^}]*animation: intro-fail 0\.4s ease 5s forwards/, 'betik çalışmazsa 5 sn sonra kendiliğinden kalkar');
  assert.match(css, /#intro\.out \{[^}]*animation: none/);
  assert.ok(Number.parseInt(css.match(/#intro \{[^}]*z-index: (\d+)/)[1], 10) < 99999, 'hata kutusu (#diag) animasyonun üstünde kalır');
  const app = oku('www/js/app.js');
  assert.match(app, /renderTab\(\);\n  finishIntro\(\);/, 'activate ilk çizimden sonra bildirir (ağ yenilemesini beklemez)');
  assert.match(app, /renderTab\(\);\n    finishIntro\(\);\n    return sourceForm\(\);/, 'ilk açılışta kaynak formundan önce bildirir');
});
