import test from 'node:test';
import assert from 'node:assert/strict';
import { nationCode, nationFlags, flagUrl, badgeSearchUrl, badgeQuery, pickBadge, initialOf, BADGE_HOST } from '../www/js/sports-logos.js';

test('nationCode: Türkçe ve İngilizce adlar, yaş/cinsiyet ekleri', () => {
  for (const [n, c] of [['Türkiye', 'tr'], ['Turkey', 'tr'], ['Belçika', 'be'], ['Belgium', 'be'], ['Çekya', 'cz'], ['Czechia', 'cz'], ['İngiltere', 'gb-eng'], ['Wales', 'gb-wls'], ['Scotland', 'gb-sct'], ['İskoçya', 'gb-sct'],
    ['Faroe Adaları', 'fo'], ['Moldovya', 'md'], ['Moldova', 'md'], ['Lihtenştayn', 'li'], ['Cebelitarık', 'gi'], ['Güney Kıbrıs', 'cy'], ['Kore Cumhuriyeti', 'kr'], ['South Korea', 'kr'], ['Çin Taipei', 'tw'], ['Chinese Taipei', 'tw'],
    ['ABD', 'us'], ['USA', 'us'], ['Bosnia-Herzegovina', 'ba'], ['Bosna-Hersek', 'ba'], ['Kosova', 'xk'], ['St. Kitts and Nevis', 'kn'], ['Guetemala', 'gt'], ['Türkiye U17', 'tr'], ['Türkiye U-21', 'tr'], ['Almanya (K)', 'de'], ['Germany Women', 'de'], ['Polonya U-21', 'pl']]) {
    assert.equal(nationCode(n), c, n);
  }
  for (const n of ['Galatasaray', 'Hamburger SV', 'Real Madrid', '', null, undefined, 'U21']) assert.equal(nationCode(n), '', String(n));
});

test('nationFlags: iki takım da milli takımsa; kulüp adı ülkeyle aynıysa bayrak yok', () => {
  assert.deepEqual(nationFlags('Türkiye', 'Belçika'), { home: flagUrl('tr'), away: flagUrl('be') });
  assert.equal(flagUrl('tr'), 'https://flagcdn.com/w80/tr.png');
  assert.equal(nationFlags('Monaco', 'Lille'), null);
  assert.equal(nationFlags('Galatasaray', 'Türkiye'), null);
});

test('pickBadge: futbol takımı ve birebir ad; yoksa boş', () => {
  const json = { teams: [
    { strTeam: 'Arsenal Women', strSport: 'Soccer', strBadge: 'https://x.test/aw.png' },
    { strTeam: 'Arsenal', strTeamShort: 'ARS', strAlternate: 'Arsenal FC, The Gunners', strSport: 'Soccer', strBadge: 'https://x.test/a.png' },
    { strTeam: 'Arsenal Basket', strSport: 'Basketball', strBadge: 'https://x.test/b.png' },
  ] };
  assert.equal(pickBadge(json, 'Arsenal'), 'https://x.test/a.png');
  assert.equal(pickBadge(json, 'arsenal fc'), 'https://x.test/a.png', 'yan ad');
  assert.equal(pickBadge(json, 'Arsenal Basket'), '', 'futbol olmayan');
  assert.equal(pickBadge(json, 'Chelsea'), '');
  assert.equal(pickBadge({ teams: null }, 'Arsenal'), '');
  assert.equal(pickBadge(null, 'Arsenal'), '');
  assert.equal(pickBadge({ teams: [{ strTeam: 'Arsenal', strSport: 'Soccer', strBadge: 'javascript:x' }] }, 'Arsenal'), '', 'yalnız http(s) adresi');
});

test('badgeQuery / badgeSearchUrl / initialOf', () => {
  assert.equal(badgeQuery('Fenerbahçe (K)'), 'Fenerbahçe');
  assert.equal(badgeQuery('Karadağ U-21'), 'Karadağ');
  assert.equal(badgeSearchUrl('Fenerbahçe (K)'), `${BADGE_HOST}/searchteams.php?t=${encodeURIComponent('Fenerbahçe')}`);
  assert.equal(initialOf('Ümraniyespor'), 'Ü');
  assert.equal(initialOf('ızmir'), 'I');
  assert.equal(initialOf(''), '?');
});
