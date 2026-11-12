// Ücretsiz TV rehberi sunucu işi (GitHub Actions, 3 saatte bir): kaynakları sınar, geçerli olanları birleştirir, JSON üretir.
// Çıktı (epg-out/): epg.json (uygulamanın okuduğu), status.json (kaynak durumları), inceleme.json (kontrol için ayrıntı),
// ornek.json (birkaç kanalın kaynak kaynak ham akışı), tvakisi-kanal.sample.txt (tek kanal sayfası örneği; ayrıştırıcı için).
// Yeni birleşim geçersizse (kaynakların hiçbiri güncel değil) önceki geçerli epg.json korunur.
// Kullanım: node scripts/epg-build.mjs [çıktı-klasörü]
import { mkdir, writeFile } from 'node:fs/promises';
import { createNet } from '../www/js/net.js';
import { FREE_SOURCES, AGG_URLS, fetchSource, buildFreeData, validateFree, chanKey, freeWindow } from '../www/js/epg-free.js';

const OUT = process.argv[2] || 'epg-out';
const UA = 'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const SAMPLE_KEYS = ['trt1', 'kanald', 'atv', 'show', 'star', 'tv8', 'now', 'kanal7', 'ntv', 'cnnturk', 'haberturk', 'trthaber'];

const lastMod = new Map();
const fetchImpl = async (url, init = {}) => {
  const res = await fetch(url, { ...init, redirect: 'follow', headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'tr-TR,tr;q=0.9', ...(init.headers || {}) } });
  lastMod.set(String(url), res.headers.get('last-modified'));
  return res;
};
const net = createNet({ fetchImpl, timeoutMs: 120000 });
const write = (name, v) => writeFile(`${OUT}/${name}`, typeof v === 'string' ? v : JSON.stringify(v));

async function main() {
  await mkdir(OUT, { recursive: true });
  const now = Date.now();
  const results = [];
  for (const src of FREE_SOURCES) {
    let r = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      r = await fetchSource(src, net, now);
      if (r.ok) break;
      console.log(`${src.id} deneme ${attempt}: ${r.error}`);
    }
    const lm = src.url ? lastMod.get(src.url) || lastMod.get(src.url.replace(/^http:/, 'https:')) : null;
    if (lm) r.updated = new Date(lm).toISOString();
    console.log(`${src.id}: ${r.ok ? 'TAMAM' : 'GEÇERSİZ'} ch=${r.ch} pr=${r.pr} onAir=${r.onAir} tomorrow=${r.tomorrow} ep=${r.withEpisode} flag=${r.flagged} ${r.error || ''}`);
    results.push(r);
  }

  const { data, info } = buildFreeData(results, now, { detail: true });
  let verdict = validateFree(data, now);
  let kept = false;
  if (!verdict.ok) {
    // Önceki geçerli birleşik dosya varsa korunur (uygulama 30 saate kadar onu kullanır)
    try {
      const prev = await net.json(`${AGG_URLS[0]}?t=${now}`);
      if (validateFree(prev, now).ok) {
        await write('epg.json', prev);
        kept = true;
        console.log('Yeni birleşim geçersiz; önceki geçerli epg.json korundu:', verdict.error);
      }
    } catch (e) {
      console.log('Önceki epg.json alınamadı:', e.message);
    }
  } else {
    await write('epg.json', data);
  }

  const programmes = Object.values(data.ch).reduce((a, c) => a + c.p.length, 0);
  await write('status.json', {
    at: now,
    ok: verdict.ok,
    kept,
    error: verdict.ok ? '' : verdict.error,
    window: freeWindow(now),
    channels: Object.keys(data.ch).length,
    programmes,
    sources: data.sources,
  });
  await write('inceleme.json', { at: now, window: freeWindow(now), sources: data.sources, channels: info });

  const ornek = {};
  for (const k of SAMPLE_KEYS) {
    ornek[k] = {};
    for (const r of results) {
      if (!r.ok) continue;
      const c = r.channels.find((x) => chanKey(x.name) === k);
      if (c) ornek[k][r.id] = { name: c.name, list: c.list.map((p) => [p.s, p.e, p.t, p.c || '', p.x || '', p.f || '']) };
    }
  }
  await write('ornek.json', ornek);

  // tvakisi.com: ana sayfalarda yalnız "şu an" var; tek kanal sayfasında tam akış olup olmadığı için ham örnek
  try {
    const html = await net.text('https://tvakisi.com/trt-1-yayin-akisi');
    await write('tvakisi-kanal.sample.txt', html.slice(0, 400000));
  } catch (e) {
    await write('tvakisi-kanal.sample.txt', `ALINAMADI: ${e.message}`);
  }

  console.log(`\nSonuç: ${verdict.ok ? 'GEÇERLİ' : 'GEÇERSİZ'} · ${Object.keys(data.ch).length} kanal · ${programmes} program`);
  if (!verdict.ok && !kept) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
