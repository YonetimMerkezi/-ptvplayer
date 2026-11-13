import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilmSchedule } from '../www/js/today-film-source.js';

test('film yayın akışı li kayıtlarını saat, ad ve kanal olarak ayrıştırır', () => {
  const html = `<ul>
    <li class="channel-flow-list__item modern"><div class="time"><strong>00:05</strong></div><div class="title">Cinderella Man</div><div class="channel-name"><a href="/tlc-yayin-akisi/">TLC</a></div></li>
    <li class="channel-flow-list__item modern"><div class="time"><strong>00:15</strong></div><div class="title">Turna Misali</div><div class="channel-name"><a href="/sinema-yerli-2-yayin-akisi/">SİNEMA YERLİ 2</a></div></li>
    <li class="channel-flow-list__item modern"><div class="time"><strong>01:00</strong></div><div class="title">Köstebek &amp; Dostları</div><div class="channel-name"><a href="/beyaz-tv-yayin-akisi/">BEYAZ TV</a></div></li>
  </ul>`;
  assert.deepEqual(parseFilmSchedule(html), [
    { time: '00:05', title: 'Cinderella Man', channel: 'TLC', channelUrl: '/tlc-yayin-akisi/' },
    { time: '00:15', title: 'Turna Misali', channel: 'SİNEMA YERLİ 2', channelUrl: '/sinema-yerli-2-yayin-akisi/' },
    { time: '01:00', title: 'Köstebek & Dostları', channel: 'BEYAZ TV', channelUrl: '/beyaz-tv-yayin-akisi/' },
  ]);
});

test('div kapsayıcılı yeni sayfa yapısını ve iç içe etiketleri ayrıştırır', () => {
  const html = `<section><div class="channel-flow-list__item">
    <div class="time"><span>20:45</span></div>
    <div class="title"><a href="/film/">Yeni Film</a></div>
    <div class="channel-name"><a href="/kanal/">Kanal 1</a></div>
  </div></section>`;
  assert.deepEqual(parseFilmSchedule(html), [
    { time: '20:45', title: 'Yeni Film', channel: 'Kanal 1', channelUrl: '/kanal/' },
  ]);
});

test('bozuk ve eksik film satırlarını atlar, tekrarları tekilleştirir', () => {
  const row = '<li class="channel-flow-list__item"><div class="time">19:30</div><div class="title">Rocky Balboa</div><div class="channel-name">TLC</div></li>';
  assert.equal(parseFilmSchedule(row + row + '<li class="channel-flow-list__item"><div class="title">Eksik</div></li>').length, 1);
});

test('CSS sınıfları değiştiğinde saat ve kanal bağlantısından yedek ayrıştırma yapar', () => {
  const html = `<main>
    <div class="row"><span>19:30</span><strong>Rocky Balboa</strong><a href="/tlc-yayin-akisi/">TLC</a></div>
    <div class="row"><span>20:00</span><strong>Buz Devri 4</strong><a href="/atv-yayin-akisi/">ATV</a></div>
  </main>`;
  assert.deepEqual(parseFilmSchedule(html), [
    { time: '19:30', title: 'Rocky Balboa', channel: 'TLC', channelUrl: '/tlc-yayin-akisi/' },
    { time: '20:00', title: 'Buz Devri 4', channel: 'ATV', channelUrl: '/atv-yayin-akisi/' },
  ]);
});
