// Rakam tuşlarıyla kanal numarası girişi (kumanda): rakamlar birikir, kısa bir bekleme sonrası ya da Tamam ile atlanır.
export const NUM_COMMIT_MS = 1600;
export const NUM_MAX_DIGITS = 4;

// Kanalın numarası: listede açıkça yazılmışsa (tvg-chno) o, yoksa listedeki sırası (1'den başlar).
export function channelNumber(item, index) {
  return item && item.chno > 0 ? item.chno : index + 1;
}

// Numaradan listedeki sırayı bulur; yoksa -1. Açık numara olan kanallar önceliklidir.
export function resolveChannel(items, n) {
  if (!Array.isArray(items) || !(n > 0)) return -1;
  const i = items.findIndex((it) => it && it.chno === n);
  if (i >= 0) return i;
  return n <= items.length && !(items[n - 1] && items[n - 1].chno > 0) ? n - 1 : -1;
}

// onChange(buf): ekranda gösterilecek rakamlar ('' ise gizle). onCommit(n): numara onaylandı.
// onLast(): arabellek boşken "0" basıldı → son izlenen kanal.
export function createChannelNumber({ timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }, ms = NUM_COMMIT_MS, onChange, onCommit, onLast }) {
  let buf = '';
  let timer = null;
  const stop = () => {
    if (timer) timers.clear(timer);
    timer = null;
  };
  const commit = () => {
    stop();
    if (!buf) return false;
    const n = parseInt(buf, 10);
    buf = '';
    onCommit(n);
    return true;
  };
  return {
    active: () => buf !== '',
    value: () => buf,
    digit(d) {
      if (buf === '' && d === '0') {
        if (onLast) onLast();
        return;
      }
      if (buf.length >= NUM_MAX_DIGITS) buf = ''; // dolunca yeni numara başlar
      buf += d;
      onChange(buf);
      stop();
      timer = timers.set(commit, ms);
    },
    commit,
    cancel() {
      stop();
      buf = '';
      onChange('');
    },
  };
}
