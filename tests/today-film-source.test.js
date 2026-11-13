import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilmSchedule } from '../www/js/today-film-source.js';

test('film yayın akışı HTML kayıtlarını saat, ad ve kanal olarak ayrıştırır', () => {
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

test('bozuk ve eksik film satırlarını atlar, tekrarları tekilleştirir', () => {
  const row = '<li class="channel-flow-list__item"><div class="time">19:30</div><div class="title">Rocky Balboa</div><div class="channel-name">TLC</div></li>';
  assert.equal(parseFilmSchedule(row + row + '<li class="channel-flow-list__item"><div class="title">Eksik</div></li>').length, 1);
});
