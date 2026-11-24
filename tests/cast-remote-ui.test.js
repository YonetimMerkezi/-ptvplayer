// Android telefon kumandası ekranı: sekmeler, fare alanı, yazı, kısayollar ve ana sayfadaki kumanda düğmesinin bağlantıları.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRemoteCmd, REMOTE_SCREENS } from '../www/js/cast.js';

const oku = (y) => readFileSync(new URL('../www/' + y, import.meta.url), 'utf8');
const ui = oku('js/cast-ui.js');
const app = oku('js/app.js');
const css = oku('css/app.css');
const html = oku('index.html');

test('kumanda ekranı: dört sekme var, kumanda sekmesinde yön tuşları hep açık; eski "Yön tuşları" gizle/göster düğmesi kalmadı', () => {
  for (const k of ['k', 'f', 'y', 'd']) {
    assert.ok(ui.includes(`['${k}', `), `${k} sekmesi`);
    assert.match(ui, new RegExp(`data-cp="${k}"`), `${k} paneli`);
  }
  assert.ok(!/cs-padt|padOn/.test(ui), 'yön tuşları artık gizlenmiyor');
  assert.match(ui, /id="cs-pad"/);
  for (const t of ['back', 'up', 'left', 'ok', 'right', 'down']) assert.match(ui, new RegExp(`dkey\\('${t}'`), t);
  assert.match(ui, /data-s="home"/, 'Ana düğmesi');
});

test('kumanda ekranı: fare alanı dokunmatik olaylarla mouse/scroll/click gönderir; hareketler toplanıp tek istekte gider', () => {
  assert.match(ui, /id="cs-tp"/);
  assert.match(ui, /addEventListener\(\s*'touchstart'/);
  assert.match(ui, /passive: false/, 'sayfa kaymasın diye preventDefault');
  assert.match(ui, /a: 'mouse', dx: Math\.round\(bx\), dy: Math\.round\(by\)/);
  assert.match(ui, /a: 'scroll', v: Math\.round\(sy\)/);
  assert.match(ui, /cmd\(\{ a: 'click' \}, \{ quiet: true \}\)/);
  assert.match(ui, /remote\.send\(c, \{ quiet: true \}\)/, 'imleç komutları durum yoklamasını sıklaştırmaz');
  assert.match(ui, /if \(flying \|\| /, 'aynı anda tek istek uçuşta');
  assert.match(ui, /clearInterval\(flusher\)/, 'sayfa kapanınca zamanlayıcı durur');
  assert.match(ui, /TV’deki uygulama eski; fare için TV uygulamasını güncelleyin/, 'eski TV uygulaması için açıklama');
  // Gönderilen her komut TV tarafının doğrulayıcısından geçer
  for (const c of [{ a: 'mouse', dx: 22, dy: 11 }, { a: 'scroll', v: 30 }, { a: 'click' }, { a: 'type', v: 'gora', enter: true }]) assert.ok(parseRemoteCmd(c), c.a);
});

test('kumanda ekranı: hızlı geçiş düğmelerinin hepsi TV’nin kabul ettiği bölümlerdir; yazı yazdıkça gönderilir', () => {
  const m = ui.match(/const REMOTE_SHORTCUTS = \[([\s\S]*?)\];/)[1];
  const idler = [...m.matchAll(/\['(\w+)', '/g)].map((x) => x[1]);
  assert.deepEqual(idler.sort(), [...REMOTE_SCREENS].sort(), 'telefon kısayolları ile TV bölümleri birebir');
  assert.match(ui, /a: 'screen', v: sc\.dataset\.s/);
  assert.match(ui, /a: 'type', v: tx0\.value, enter: !!enter/);
  assert.match(ui, /setTimeout\(\(\) => typeNow\(false\), 250\)/, 'yazdıkça kısa bekleyişle');
});

test('TV tarafı: app.js komutları sanal imlece, arama kutusuna ve bölüm geçişine bağlar', () => {
  assert.match(app, /import \{ createPointer, typeInto \} from '\.\/pointer\.js'/);
  assert.match(app, /c\.a === 'mouse'\) return remotePointer\.move\(c\.dx, c\.dy\)/);
  assert.match(app, /c\.a === 'click'\) return remotePointer\.click\(\)/);
  assert.match(app, /c\.a === 'scroll'\) return remotePointer\.scroll\(c\.v\)/);
  assert.match(app, /typeInto\(c\.v, \{ enter: c\.enter, open: \(\) => \$\('#btn-search'\)\.click\(\) \}\)/);
  assert.match(app, /c\.a === 'screen'\) return remoteGo\(c\.v\)/);
  const go = app.slice(app.indexOf('function remoteGo('), app.indexOf('function remoteGo(') + 700);
  assert.match(go, /pui\.isOpen\(\)\) pui\.close\(\)/, 'oynatıcı kapanır');
  assert.match(go, /topLayer\(\) !== 'tab'; n\+\+\) popLayer\(\)/, 'açık sayfa ve alt listeler kapanır');
  assert.match(go, /n < 20/, 'sonsuz döngü yok');
  assert.match(go, /goTo\(where\)/);
  assert.match(css, /\.vptr \{[^}]*pointer-events: none/, 'imleç tıklamayı yakalamaz');
  assert.match(css, /\.cast-tp \{[^}]*touch-action: none/);
});

test('ana sayfa: üst satırda küçük kumanda düğmesi; telefonda kumandayı, TV’de eşleştirme kodunu açar; Pro kapısı var; çocuk modunda yok', () => {
  assert.match(app, /nativePlugin && !kidActive\(\) \? `<button class="icon-btn" id="h-remote" aria-label="TV kumandası">\$\{icon\('remote'\)\}<\/button>`/);
  assert.match(app, /closest\('#h-remote'\)\) return needPro\('cast'\) \? castUi\.remoteEntry\(\) : undefined/);
  assert.match(html, /<symbol id="i-remote"/, 'simge tanımlı');
  assert.match(ui, /const remoteEntry = \(\) => \(deps\.isTv\(\) \? receiverSheet\(\) : openRemote\(\)\)/);
  assert.match(ui, /return \{[^}]*openRemote, remoteEntry/);
  assert.match(ui, /remoteScreen\(dev, dev\.remoteOnly \? \{ kind: dev\.remoteOnly\.kind, title: dev\.remoteOnly\.title \} : \{\}, \{ keep: true \}\)/, 'yalnız kumanda: TV’de bir şey oynamasa da açık kalır');
});
