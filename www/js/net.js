// Ağ katmanı. Android'de büyük yanıtlar yerel eklenti ile dosyaya indirilir, sonra
// WebView içinden akış olarak okunur (CORS ve köprü boyut sınırı yok). Tarayıcıda doğrudan fetch.

async function* chunksOf(body) {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* okuyucu zaten bırakılmış */
    }
  }
}

// Gövdeyi metin parçaları olarak verir; gzip (1f 8b) otomatik açılır.
export async function readBody(body, onText, onProgress) {
  const it = chunksOf(body)[Symbol.asyncIterator]();
  const first = await it.next();
  if (first.done) return 0;
  const dec = new TextDecoder('utf-8');
  let total = 0;
  const isGz = first.value.length > 1 && first.value[0] === 0x1f && first.value[1] === 0x8b;

  if (!isGz) {
    let cur = first;
    while (!cur.done) {
      total += cur.value.length;
      const t = dec.decode(cur.value, { stream: true });
      if (t) onText(t);
      if (onProgress) onProgress(total);
      cur = await it.next();
    }
  } else {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    let pumpErr = null;
    const pump = (async () => {
      let cur = first;
      while (!cur.done) {
        total += cur.value.length;
        if (onProgress) onProgress(total);
        await writer.write(cur.value);
        cur = await it.next();
      }
      await writer.close();
    })().catch(async (e) => {
      pumpErr = e;
      await writer.abort(e).catch(() => {});
    });
    const reader = ds.readable.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const t = dec.decode(value, { stream: true });
        if (t) onText(t);
      }
    } catch (e) {
      await pump;
      throw pumpErr || e;
    }
    await pump;
    if (pumpErr) throw pumpErr;
  }
  const rest = dec.decode();
  if (rest) onText(rest);
  return total;
}

export function createNet({ native = null, convertFileSrc = null, fetchImpl = (...a) => globalThis.fetch(...a), timeoutMs = 90000 } = {}) {
  async function open(url, headers) {
    if (native && convertFileSrc) {
      const r = await native.download({ url, headers: headers || {} });
      const res = await fetchImpl(convertFileSrc('file://' + r.path));
      if (!res.ok) throw new Error('Geçici dosya okunamadı');
      return { res, cleanup: () => native.deleteFile({ path: r.path }).catch(() => {}) };
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { headers: headers || undefined, signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { res, cleanup: () => {} };
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Sunucu zamanında yanıt vermedi');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function read(url, { headers, onText, onProgress } = {}) {
    const { res, cleanup } = await open(url, headers);
    try {
      return await readBody(res.body, onText || (() => {}), onProgress);
    } finally {
      cleanup();
    }
  }

  async function text(url, opts = {}) {
    const parts = [];
    await read(url, { ...opts, onText: (t) => parts.push(t) });
    return parts.join('');
  }

  async function json(url, opts = {}) {
    const t = await text(url, opts);
    try {
      return JSON.parse(t.replace(/^﻿/, ''));
    } catch {
      throw new Error('Sunucu JSON yerine başka bir yanıt verdi');
    }
  }

  return { read, text, json };
}
