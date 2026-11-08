// Satıra sığmayan adlar kesilmez: kayarak gösterilir. İçerik <span class="mq-i"> içinde olmalı;
// kapsayıcı (ör. .nm, .sub) taşan kısım kadar kaydırma ölçüsü (--mq) ve süresi (--mqd) alır.
export const MQ_SPEED = 38; // piksel/sn

// Saf hesap: taşma varsa { over, dur } (px, sn), yoksa null.
export function marqueeFor(contentW, boxW) {
  const over = Math.ceil(contentW - boxW);
  if (!(over > 2)) return null;
  return { over, dur: Math.max(3, +(over / MQ_SPEED + 2).toFixed(1)) };
}

export function marquee(root) {
  for (const inner of root.querySelectorAll('.mq-i')) {
    const box = inner.parentElement;
    const m = marqueeFor(inner.offsetWidth, box.clientWidth);
    box.classList.toggle('mq', !!m);
    if (m) {
      box.style.setProperty('--mq', m.over + 'px');
      box.style.setProperty('--mqd', m.dur + 's');
    } else {
      box.style.removeProperty('--mq');
    }
  }
}
