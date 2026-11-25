// Uygulama dili (Türkçe / İngilizce). Metinler kodda Türkçe yazılıdır ve Türkçe anahtardır; İngilizce seçiliyken ekrana basılan her metin
// (düz metin, bildirim, placeholder / title / aria-label) sözlükten çevrilir. Sözlükte olmayan metin Türkçe kalır. Kullanıcının kendi içeriği
// (kanal, film, takım adı) çevrilmez: yalnız sözlükteki sabit metinle birebir eşleşen metin değişir.
// Sözlük: i18n-en.js ([Türkçe, İngilizce] çiftleri). Değişen kısımlar {0}, {1} ile yazılır: "{0} dk" → "{0} min".
import { EN_PAIRS } from './i18n-en.js';

export const LANG_CHOICES = [['auto', 'Otomatik (cihaz dili)'], ['tr', 'Türkçe'], ['en', 'English']];
export const normalizeLang = (v) => (LANG_CHOICES.some(([k]) => k === v) ? v : 'auto');
// Otomatik: cihaz dili Türkçeyse Türkçe, değilse İngilizce.
export const resolveLang = (pref, device = '') => {
  const p = normalizeLang(pref);
  if (p !== 'auto') return p;
  return /^tr\b/i.test(String(device || '')) ? 'tr' : 'en';
};

let cur = 'tr';
export const lang = () => cur;
export const setLang = (v) => {
  cur = v === 'en' ? 'en' : 'tr';
  cache.clear();
};
// Tarih ve saat biçimi için yerel ayar: İngilizce'de gün-ay sırası ve 24 saat (TV rehberi 24 saatlik).
export const loc = () => (cur === 'en' ? 'en-GB' : 'tr-TR');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const cache = new Map();
let exact = null;
let pats = null;

// Ek sözlükler (ör. webOS'a özgü metinler): ana sözlüğün üstüne eklenir, aynı anahtar varsa ek sözlük kazanır.
const extra = [];
export function addPairs(pairs) {
  extra.push(pairs);
  exact = null;
  pats = null;
  memo.clear();
  cache.clear();
}

function compile(pairs) {
  exact = new Map();
  pats = [];
  for (const [tr, en] of pairs) {
    const k = norm(tr);
    if (!/\{\d+\}/.test(k)) {
      exact.set(k, en);
      continue;
    }
    const idx = [];
    let anchor = '';
    const src = k
      .split(/(\{\d+\})/)
      .map((part) => {
        const m = /^\{(\d+)\}$/.exec(part);
        if (m) {
          idx.push(Number(m[1]));
          return '([\\s\\S]+?)';
        }
        if (part.length > anchor.length) anchor = part;
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    pats.push({ re: new RegExp('^' + src + '$'), idx, en, anchor, len: k.length });
  }
  pats.sort((a, b) => b.len - a.len); // uzun kalıp önce
}

// Sonuç (bulunamayan dahil) metne göre saklanır: film adı gibi sözlükte olmayan metinler her seferinde tüm kalıpları gezmesin.
const memo = new Map();
function lookup(k, depth = 0) {
  if (depth > 0) return lookupRaw(k, depth);
  const m = memo.get(k);
  if (m !== undefined) return m;
  const r = lookupRaw(k, 0);
  if (memo.size >= 6000) memo.clear();
  memo.set(k, r);
  return r;
}
function lookupRaw(k, depth) {
  if (!exact) compile(extra.length ? EN_PAIRS.concat(...extra) : EN_PAIRS);
  const hit = exact.get(k);
  if (hit !== undefined) return hit;
  if (depth > 1) return null;
  for (const p of pats) {
    if (p.anchor && !k.includes(p.anchor)) continue;
    const m = p.re.exec(k);
    if (!m) continue;
    return p.en.replace(/\{(\d+)\}/g, (_, n) => {
      const g = m[p.idx.indexOf(Number(n)) + 1];
      if (g === undefined) return '';
      const sub = lookup(norm(g), depth + 1); // yakalanan parça da sözlükte olabilir ("Bugün", "Film" …)
      return sub === null ? g : sub;
    });
  }
  return null;
}

// Birleştirilerek yazılmış metinler ("Cümle. Cümle." ya da "A · B · C") bütün olarak sözlükte yoksa parça parça çevrilir:
// en uzun eşleşen ardışık parça seçilir, eşleşmeyen parça olduğu gibi kalır.
function piece(s) {
  let r = lookup(s);
  if (r !== null) return r;
  const m = /^([\s\S]*?)([.!?…:]+)$/.exec(s); // sondaki noktalama olmadan da dene
  if (m && m[1]) {
    r = lookup(m[1]);
    if (r !== null) return r + m[2];
  }
  return null;
}
function spans(parts, glue, deep) {
  const n = parts.length;
  if (n < 1 || n > 12) return null;
  const out = [];
  let hit = false;
  let i = 0;
  while (i < n) {
    let took = false;
    for (let j = n; j > i; j--) {
      const r = piece(parts.slice(i, j).join(glue));
      if (r !== null) {
        out.push(r);
        i = j;
        hit = took = true;
        break;
      }
    }
    if (took) continue;
    const d = deep && parts[i].includes(' · ') ? spans(parts[i].split(' · '), ' · ', false) : null;
    if (d !== null) hit = true;
    out.push(d === null ? parts[i] : d);
    i++;
  }
  return hit ? out.join(glue) : null;
}
function lookupDeep(k) {
  const r = piece(k);
  if (r !== null) return r;
  const bits = k.split(/([.!?…]+)\s+/); // [metin, noktalama, metin, …]
  const sentences = [];
  for (let i = 0; i < bits.length; i += 2) sentences.push(bits[i] + (bits[i + 1] || ''));
  return spans(sentences, ' ', true);
}

// Metni çevirir; baştaki/sondaki boşluk korunur, eşleşme yoksa metin aynen döner. Türkçe seçiliyken hiçbir şey yapmaz.
export function translate(text) {
  if (cur !== 'en' || typeof text !== 'string' || !text) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  const core = m[2];
  if (!core || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(core)) return text; // harf yoksa (saat, sayı, simge) çevrilecek bir şey de yok
  let out = cache.get(core);
  if (out === undefined) {
    out = lookupDeep(norm(core));
    if (cache.size > 6000) cache.clear();
    cache.set(core, out);
  }
  return out === null ? text : m[1] + out + m[3];
}
export const t = translate;

// ---- ekrandaki metinleri çeviren gözlemci (yalnız İngilizce'de çalışır) ----
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|SVG)$/i;
function fixText(node) {
  const v = node.nodeValue;
  const out = translate(v);
  if (out !== v) node.nodeValue = out;
}
function fixAttr(el, a) {
  const v = el.getAttribute(a);
  if (!v) return;
  const out = translate(v);
  if (out !== v) el.setAttribute(a, out);
}
export function translateTree(root) {
  if (!root || cur !== 'en') return;
  if (root.nodeType === 3) return fixText(root);
  if (root.nodeType !== 1 || SKIP.test(root.tagName)) return;
  if (root.getAttribute('translate') === 'no') return; // kullanıcı içeriği olarak işaretlenen alan
  for (const a of ATTRS) if (root.hasAttribute(a)) fixAttr(root, a);
  for (let n = root.firstChild; n; n = n.nextSibling) translateTree(n);
}

let observer = null;
// Dili ayarlar, <html lang> yazar; İngilizce ise sayfayı çevirir ve sonraki değişiklikleri izler. Dönen: seçilen dil.
export function startI18n({ pref = 'auto', device = '', doc = typeof document !== 'undefined' ? document : null } = {}) {
  setLang(resolveLang(pref, device));
  if (!doc) return cur;
  doc.documentElement.lang = cur;
  if (cur !== 'en' || typeof MutationObserver === 'undefined') return cur;
  translateTree(doc.documentElement);
  if (observer) observer.disconnect();
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => translateTree(n));
      else if (r.type === 'characterData') {
        const par = r.target.parentNode;
        if (!par || !SKIP.test(par.tagName)) fixText(r.target);
      }
      else if (r.type === 'attributes' && r.target.nodeType === 1) fixAttr(r.target, r.attributeName);
    }
    observer.takeRecords(); // kendi yazdıklarımız yeniden işlenmesin
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return cur;
}
