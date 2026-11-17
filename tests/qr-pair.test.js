import test from 'node:test';
import assert from 'node:assert/strict';
import { pairLink, parsePairLink, pickLanIp, PAIR_SCHEME } from '../www/js/cast.js';
import { qrSvg, qrSize } from '../www/js/qr.js';

const ok = { ip: '192.168.1.20', port: 8765, id: 'a1b2c3d4e5f6a7b8', name: 'Salon TV', code: '123456' };

test('eşleştirme bağlantısı: üret → ayrıştır aynı bilgiyi verir', () => {
  const link = pairLink(ok);
  assert.ok(link.startsWith(PAIR_SCHEME + '?'));
  assert.deepEqual(parsePairLink(link), { host: '192.168.1.20', port: 8765, code: '123456', id: 'a1b2c3d4e5f6a7b8', name: 'Salon TV' });
  assert.equal(parsePairLink('  ' + link + '\n').code, '123456', 'tarayıcıdan gelen boşluklar atılır');
});

test('Türkçe cihaz adı yüzde-kodlanır, QR için ASCII kalır; ad kısaltılır', () => {
  const link = pairLink({ ...ok, name: 'Oturma Odası ğüşiöç TV 4K Ultra' });
  assert.ok(/^[\x20-\x7e]+$/.test(link), 'yalnız ASCII');
  const p = parsePairLink(link);
  assert.ok(p.name.length <= 24);
  assert.ok(p.name.startsWith('Oturma Odası'));
});

test('yerel olmayan adres, geçersiz kapı ya da kod reddedilir (üretimde de ayrıştırmada da)', () => {
  assert.equal(pairLink({ ...ok, ip: '8.8.8.8' }), '');
  assert.equal(pairLink({ ...ok, ip: '192.168.1.300' }), '');
  assert.equal(pairLink({ ...ok, port: 80 }), '');
  assert.equal(pairLink({ ...ok, code: '12345' }), '');
  assert.equal(pairLink({ ...ok, code: '12a456' }), '');
  const base = 'iptvpro://pair?';
  assert.equal(parsePairLink(base + 'h=8.8.8.8&p=8765&c=123456'), null, 'internet adresi');
  assert.equal(parsePairLink(base + 'h=example.com&p=8765&c=123456'), null, 'alan adı');
  assert.equal(parsePairLink(base + 'h=192.168.1.20&p=22&c=123456'), null, 'ayrıcalıklı kapı');
  assert.equal(parsePairLink(base + 'h=192.168.1.20&p=8765&c=1234'), null, 'kısa kod');
  assert.equal(parsePairLink('https://evil.example/pair?h=192.168.1.20&p=8765&c=123456'), null, 'başka şema');
  assert.equal(parsePairLink(''), null);
  assert.equal(parsePairLink(null), null);
});

test('yerel adres seçimi: ilk özel (RFC1918) adres; yoksa boş', () => {
  assert.equal(pickLanIp(['100.64.1.2', '172.20.5.9', '192.168.0.5']), '172.20.5.9');
  assert.equal(pickLanIp(['10.0.0.7']), '10.0.0.7');
  assert.equal(pickLanIp(['172.32.0.1', '8.8.8.8']), '');
  assert.equal(pickLanIp(null), '');
});

test('QR: tipik eşleştirme bağlantısı küçük kalır (TV ekranından telefonla kolay okunur) ve SVG güvenli, ölçeklenir', () => {
  const link = pairLink({ ...ok, name: 'Oturma Odası TV' });
  const n = qrSize(link);
  assert.ok(n >= 21 && n <= 45, `kare sayısı ${n}`);
  const svg = qrSvg(link);
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  const root = svg.match(/^<svg[^>]*>/)[0];
  assert.ok(/viewBox="0 0 \d+ \d+"/.test(root) && !/ width=/.test(root), 'kapsayıcıya göre ölçeklenir (kök etikette sabit boyut yok)');
  assert.ok(!/<script|onload|href=/i.test(svg), 'SVG yalnız çizim içerir');
  assert.ok(/fill="white"/.test(svg) && /fill="black"/.test(svg), 'beyaz zemin, koyu kareler (koyu temada da okunur)');
  assert.equal(qrSvg(link), qrSvg(link), 'aynı metin aynı çizim (yeniden çizimde titremez)');
});

test('Pro özelliği: "Listeyi TV’ye aktar" Pro listesinde; telefondaki QR düğmesi ve TV’nin ilk ekrandaki sekmesi Pro kapısından geçer', async () => {
  const { readFileSync } = await import('node:fs');
  const { isProFeature, setProGate, needPro, canUse } = await import('../www/js/membership.js');
  assert.ok(isProFeature('tvlink'));
  assert.ok(canUse('tvlink', { tier: 'pro' }) && !canUse('tvlink', { tier: 'standard' }), 'yalnız Pro (ve denemede) açık');
  const ui = readFileSync(new URL('../www/js/cast-ui.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.ok(/#cs-qr'\)\) \{\s*if \(!needPro\('tvlink'\)\) return;/.test(ui), 'QR tara düğmesi kapıdan geçmeli');
  assert.ok(/needPro\('tvlink'\) && castUi\.receiverSheet\(\)/.test(app), '"Telefondan al" sekmesi kapıdan geçmeli');
  const asked = [];
  setProGate((f) => { asked.push(f); return f !== 'tvlink'; });
  assert.equal(needPro('tvlink'), false, 'Pro olmayan için kapı kapalı');
  assert.deepEqual(asked, ['tvlink']);
  setProGate(null);
});
