// Magic Remote imleci üzerine gelince odaklanabilir öğe, tuşla odaklanmış gibi vurgulanır (css'te .hv, .on ile aynı görünüm).
// Tuşa basılınca ya da imleç öğeden çıkınca vurgu kalkar; böylece tuş ve imleç aynı anda iki öğeyi vurgulamaz.
import { enYakin } from './ui.js';

export const HOVER_SECICI = '.top-back, .top-ara, .top-kum, .tile, .pr, .vl-it, .sp-d, .f-btn, .s-tab, .p-b, .pk-r, .mn-r';

export function hoverBagla(doc) {
  let acik = null;
  const koy = (e) => {
    if (e === acik) return;
    if (acik && acik.classList) acik.classList.remove('hv');
    acik = e;
    if (e) e.classList.add('hv');
  };
  doc.addEventListener('mousemove', (ev) => koy(enYakin(ev.target, HOVER_SECICI, doc.body)), true);
  doc.addEventListener('mouseout', (ev) => { if (!ev.relatedTarget) koy(null); }, true); // imleç sayfadan çıktı
  doc.addEventListener('keydown', () => koy(null), true);
  doc.addEventListener('wheel', () => koy(null), true); // liste kayınca satırlar yer değiştirir
  return () => koy(null);
}
