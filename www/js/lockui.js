// Şifre tuş takımı: tam ekran örtü. Dokunma, kumanda (yön tuşları + Tamam) ve klavye/kumanda rakam tuşlarıyla kullanılır.
import { esc } from './util.js';
import { MAX_LEN, MIN_LEN } from './lock.js';

// prompt({ title, hint, len, cancelable, check }) → girilen şifre (string) ya da iptalde null.
//   len: > 0 ise o kadar rakam girilince otomatik gönderilir; 0 ise ✓ ile (en az 4 rakam).
//   check(pin) → { ok, msg? } ya da Promise; ok değilse alan sıfırlanır ve msg gösterilir.
export function createPinPad(doc = document) {
  let current = null; // { el, close }

  function prompt({ title, hint = '', len = 0, cancelable = true, check = null }) {
    if (current) current.close(null);
    return new Promise((resolve) => {
      const el = doc.createElement('div');
      el.id = 'lock';
      el.className = 'lock';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', title);
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => `<button type="button" class="lk-k" data-k="${k}">${k}</button>`).join('');
      el.innerHTML =
        `<div class="lk-box"><div class="lk-t">${esc(title)}</div><div class="lk-h" id="lk-h" aria-live="polite">${esc(hint)}</div>` +
        `<div class="lk-dots" id="lk-dots" aria-hidden="true"></div>` +
        `<div class="lk-pad">${keys}<button type="button" class="lk-k fn" data-k="bs" aria-label="Sil">⌫</button><button type="button" class="lk-k" data-k="0">0</button>` +
        `${len > 0 ? '<span></span>' : '<button type="button" class="lk-k fn ok" data-k="ok" aria-label="Tamam">✓</button>'}</div>` +
        `${cancelable ? '<button type="button" class="lk-x" data-k="x">İptal</button>' : ''}</div>`;
      doc.body.appendChild(el);
      const hintEl = el.querySelector('#lk-h');
      const dotsEl = el.querySelector('#lk-dots');
      let pin = '';
      let busy = false;
      const max = len > 0 ? len : MAX_LEN;
      const draw = () => {
        dotsEl.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('');
      };
      const close = (v) => {
        if (current && current.el === el) current = null;
        el.remove();
        resolve(v);
      };
      current = { el, close };
      const reject = (msg) => {
        pin = '';
        draw();
        hintEl.textContent = msg;
        el.classList.remove('shake');
        void el.offsetWidth; // animasyonu yeniden başlat
        el.classList.add('shake');
      };
      const submit = async () => {
        if (busy || !pin) return;
        if (len === 0 && pin.length < MIN_LEN) return reject(`En az ${MIN_LEN} rakam girin`);
        busy = true;
        const r = check ? await check(pin) : { ok: true };
        busy = false;
        if (r && r.ok) return close(pin);
        reject((r && r.msg) || 'Yanlış şifre');
      };
      const press = (k) => {
        if (busy) return;
        if (/^[0-9]$/.test(k)) {
          if (pin.length >= max) return;
          pin += k;
          draw();
          if (len > 0 && pin.length === len) submit();
        } else if (k === 'bs') {
          pin = pin.slice(0, -1);
          draw();
        } else if (k === 'ok') submit();
        else if (k === 'x' && cancelable) close(null);
      };
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (b) press(b.dataset.k);
      });
      el.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          press(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          press('bs');
        } else if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack') {
          e.preventDefault(); // arkadaki sayfa/katman kapanmasın
          if (cancelable) close(null);
        } else if (e.key === 'Enter' && len === 0 && !e.target.closest('button')) {
          e.preventDefault();
          press('ok');
        }
      });
      draw();
      const first = el.querySelector('[data-k="5"]');
      first.setAttribute('data-autofocus', '');
      first.focus({ preventScroll: true });
    });
  }

  return { prompt, isOpen: () => !!current, cancel: () => current && current.close(null) };
}
