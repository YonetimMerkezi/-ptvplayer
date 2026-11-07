// Ortak arayüz yardımcıları: simge, bildirim, alt sayfa, logo.
import { esc } from './util.js';
import { pushLayer, popLayer } from './nav.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const icon = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;

let toastTimer = 0;
export function toast(msg, ms = 2800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}

export function logo(url, name) {
  const ch = esc((String(name || '?').trim()[0] || '?').toUpperCase());
  const img = url
    ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">`
    : '';
  return `<div class="logo">${img}${ch}</div>`;
}

let seq = 0;
// html: gövde; mount(bodyEl, api): içerik bağlama. Döndürür { el, body, close, setTitle }.
export function openSheet({ title, html = '', mount }) {
  const id = 'sheet' + ++seq;
  const back = document.createElement('div');
  back.className = 'sheet-back' + (document.body.classList.contains('player-open') ? ' over-player' : '');
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-h"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Kapat">${icon('close')}</button></div><div class="sheet-b">${html}</div></div>`;
  $('#sheets').append(back);
  pushLayer(id, () => back.remove());
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) popLayer(id);
  });
  const body = $('.sheet-b', back);
  const api = {
    el: back,
    body,
    close: () => popLayer(id),
    setTitle: (t) => {
      $('h3', back).textContent = t;
    },
  };
  if (mount) mount(body, api);
  return api;
}

export function fmtAgo(ts) {
  if (!ts) return 'hiç';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}
