// Telefondan TV'ye oynatma: ekranlar. Telefonda "TV'de oynat" seçici + uzaktan kumanda sayfası,
// TV'de Ayarlar › Telefondan oynat (eşleştirme kodu) ve gelen oynatma isteğinin karşılanması.
import { CAST_PORT, CODE_LEN, buildCast, parseCast, parseRemoteCmd, createDevices, mergeDevices, pairResult, sendResult, syncResult, createRemote } from './cast.js';
import { SLEEP_OPTIONS, fmtRemaining } from './sleep.js';
import { NIGHT_LEVELS, nightLabel } from './night.js';
import { makeSnapshot, parseSnapshot, applySnapshot, emptyAdded, addedTotal, describeAdded, syncMessage } from './sync.js';

const AUTO_SYNC_MS = 3 * 60 * 1000; // kendiliğinden eşitleme denemeleri arası

// deps: { plugin, store, pad, toast, icon, esc, openSheet, openPage, fmtDuration, isTv(), playCast({item,targets,startAt}), stopCast(), remoteExt()?, remoteCmd(cmd)?, guard()?, busy()?, onSynced() }
export function createCastUI(deps) {
  const { plugin, store, pad, toast, icon, esc, openSheet, openPage, fmtDuration } = deps;
  const devices = createDevices(store);
  let receiver = null; // { port, id, name, ips, paired } — alıcı açıkken
  let nowKey = '';

  const request = (dev, path, method = 'GET', body = '', extra = {}) =>
    plugin.castRequest({ host: dev.host, port: dev.port || CAST_PORT, method, path, token: dev.token || '', body, ...extra }).catch((e) => ({ status: 0, body: '', error: String((e && e.message) || e) }));

  // ------------------------------------------------------------------ telefon: TV seçimi ve eşleştirme

  async function ensurePaired(d) {
    if (d.token) return d;
    let got = null;
    const code = await pad.prompt({
      title: 'TV’deki kodu girin',
      hint: 'TV’de Ayarlar › Telefondan oynat ekranında 6 haneli kod görünür',
      len: CODE_LEN,
      check: async (c) => {
        const r = pairResult(await request(d, '/pair', 'POST', '', { code: c, name: store.pref('cast.name', '') }));
        if (!r.ok) return { ok: false, msg: r.msg };
        got = r;
        return { ok: true };
      },
    });
    if (code == null || !got) return null;
    const dev = { id: got.id || d.id, name: got.name || d.name, host: d.host, port: d.port || CAST_PORT, token: got.token };
    devices.save(dev);
    return dev;
  }

  // TV seçtirir: kayıtlı TV'ler hemen, ağdakiler arama bitince listelenir. Seçilen eşleşmemişse kod istenir. → cihaz | null
  // manage=true (Ayarlar › Telefondan oynat): yalnız eşleştirme/kaldırma; seçim bir şey göndermez, ekran açık kalır.
  function chooseTv(title = 'TV’de oynat', manage = false) {
    return new Promise((resolve) => {
      let done = false;
      let list = [];
      let found = [];
      let searching = true;
      const now = {}; // TV kimliği → şu an oynayan { title, kind } (eşleşmiş ve bulunan TV'ler)
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      const sh = openSheet({
        title,
        html: '<div id="cs-list"></div><div class="cast-add"><input id="cs-ip" inputmode="decimal" placeholder="TV’nin IP adresi (örn. 192.168.1.20)" autocomplete="off"><button class="btn" id="cs-ipgo">Ekle</button></div><p class="hint">' + (manage ? 'Önce TV’de Ayarlar › Telefondan oynat ekranını açın; 6 haneli kod orada görünür. Sonra buradan TV’ye dokunup kodu girin. ' : '') + 'Telefon ve TV aynı Wi‑Fi ağında olmalı; TV’de uygulama açık olmalı. TV’de Ayarlar › Telefondan oynat ekranı eşleştirme kodunu gösterir.</p>',
        mount: (body, api) => {
          const box = body.querySelector('#cs-list');
          const draw = () => {
            list = mergeDevices(devices.list(), found);
            const rows = list
              .map(
                (d, i) =>
                  `<div class="cast-row-d"><button class="rec-play" data-i="${i}">${icon('tv')}<span class="t">${esc(d.name)}</span><small>${d.saved ? (d.online ? 'Eşleşmiş · bağlanabilir' : 'Eşleşmiş · bulunamadı') : manage ? 'Eşleşmemiş · dokunup TV’deki kodu girin' : 'Yeni · kod gerekir'} · ${esc(d.host)}${now[d.id] && !manage ? ` · Şu an: ${esc(now[d.id].title || 'oynatılıyor')}` : ''}</small></button>${manage && d.saved && d.online ? `<button class="btn sm" data-remote="${i}">Kumanda</button>` : now[d.id] && !manage ? `<button class="icon-btn" data-remote="${i}" aria-label="Kumandayı aç">${icon('play')}</button>` : ''}${d.saved ? `<button class="icon-btn" data-forget="${i}" aria-label="Eşleşmeyi kaldır">${icon('trash')}</button>` : ''}</div>`,
              )
              .join('');
            box.innerHTML = (rows || `<p class="hint">${searching ? 'TV aranıyor…' : 'TV bulunamadı. TV’de uygulamanın açık olduğundan ve aynı Wi‑Fi’ye bağlı olduğundan emin olun, ya da IP adresini yazın.'}</p>`) + (rows && searching ? '<p class="hint">Aranıyor…</p>' : '') + (!searching ? '<button class="btn g" id="cs-again">Yeniden ara</button>' : '');
          };
          const search = async () => {
            searching = true;
            draw();
            try {
              const r = await plugin.castDiscover({ timeoutMs: 1800 });
              found = (r && r.devices) || [];
            } catch {
              found = [];
            }
            searching = false;
            if (box.isConnected) draw();
            // TV zaten bir şey oynatıyorsa (örn. kumanda sayfasından geri çıkıldı) kumandaya dönülebilsin
            await Promise.all(
              mergeDevices(devices.list(), found)
                .filter((d) => d.saved && d.online)
                .map(async (d) => {
                  const r = await request(devices.get(d.id) || d, '/state');
                  let st = null;
                  try {
                    st = JSON.parse(r.body);
                  } catch {
                    st = null;
                  }
                  if (r.status === 200 && st && st.active) now[d.id] = { title: st.title || '', kind: st.kind === 'live' ? 'live' : 'vod' };
                }),
            );
            if (box.isConnected) draw();
          };
          body.addEventListener('click', async (e) => {
            if (e.target.closest('#cs-again')) return search();
            const fg = e.target.closest('[data-forget]');
            if (fg) {
              const d = list[Number(fg.dataset.forget)];
              if (d) {
                const full = devices.get(d.id);
                if (full && full.token) request(full, '/unpair', 'POST').catch(() => {});
                devices.forget(d.id);
                draw();
              }
              return;
            }
            const rm = e.target.closest('[data-remote]');
            if (rm) {
              const d = list[Number(rm.dataset.remote)];
              const full = d && devices.get(d.id);
              if (!full || !(manage || now[d.id])) return;
              const live = { ...full, host: d.host, port: d.port || full.port };
              api.close();
              if (manage) {
                // Ayarlar › Telefondan oynat: TV'de ne oynuyorsa (ya da hiçbir şey) uygulamadan görülüp yönetilir
                finish(null);
                remoteScreen(live, now[d.id] || {}, { keep: true });
                return;
              }
              finish({ ...live, remoteOnly: now[d.id] });
              return;
            }
            const pick = e.target.closest('[data-i]');
            if (pick) {
              const d = list[Number(pick.dataset.i)];
              if (!d) return;
              if (d.saved && !d.online) {
                // bulunamadı; kayıtlı adresi dene
                const hello = await request(d, '/hello');
                if (hello.status !== 200) return toast('TV’ye ulaşılamadı. TV açık ve uygulama çalışıyor mu?');
              }
              const dev = await ensurePaired(d);
              if (!dev) return;
              if (manage) {
                toast(`${dev.name} ile eşleşti`);
                draw();
                return;
              }
              api.close();
              finish(dev);
              return;
            }
            if (e.target.closest('#cs-ipgo')) {
              const ip = body.querySelector('#cs-ip').value.trim();
              if (!ip) return;
              const hello = await request({ host: ip, port: CAST_PORT }, '/hello');
              let j = null;
              try {
                j = JSON.parse(hello.body);
              } catch {
                j = null;
              }
              if (hello.status !== 200 || !j || j.app !== 'iptvpro') return toast(hello.error && /yerel/i.test(hello.error) ? 'Yalnızca yerel ağ adresleri (192.168… / 10…) kullanılabilir' : 'Bu adreste alıcı bulunamadı');
              found = found.concat([{ id: j.id, name: j.name, host: ip, port: j.port || CAST_PORT }]);
              draw();
            }
          });
          search();
        },
      });
      // sheet kapanınca (seçim yapılmadan) söz çözülür
      const watch = setInterval(() => {
        if (!sh.el.isConnected) {
          clearInterval(watch);
          finish(null);
        }
      }, 400);
    });
  }

  // ------------------------------------------------------------------ telefon: gönder + kumanda

  // args: { item, ep, targets, startMs, step?(delta) → {item, ep, targets, startMs}|null, onSent?, onProgress?(pos, dur) }
  async function sendToTv(args) {
    if (!plugin) return toast('TV’ye oynatma yalnız Android uygulamasında çalışır');
    const dev = await chooseTv();
    if (!dev) return;
    if (dev.remoteOnly) return remoteScreen(dev, { kind: dev.remoteOnly.kind, title: dev.remoteOnly.title }, {}); // TV zaten oynatıyor: yalnız kumanda (oynatma bitince kumanda da kapanır)
    const payload = buildCast(args);
    const res = sendResult(await request(dev, '/play', 'POST', JSON.stringify(payload)));
    if (res.unpaired) {
      devices.forget(dev.id);
      return toast(res.msg, 4000);
    }
    if (!res.ok) return toast(res.msg, 4000);
    if (args.onSent) await args.onSent();
    remoteScreen(dev, payload, args);
  }

  // Veri eşitleme (telefon başlatır): kaynaklar, favoriler, son izlenenler, ilerleme, kategori düzeni karşılıklı birleştirilir.
  // Kaynak, son izlenen ve kategori düzeni yalnız eklenir; favori ve ilerlemede en yeni karar kazanır (silmeler de taşınır).
  // → { ok, msg?, unpaired?, tv: TV'ye eklenenler, phone: telefona eklenenler }
  async function runSync(dev) {
    const res = syncResult(await request(dev, '/sync', 'POST', JSON.stringify(makeSnapshot(store)), { timeoutMs: 30000 }));
    if (res.unpaired) devices.forget(dev.id);
    if (!res.ok) return res;
    const parsed = parseSnapshot(res.snapshot);
    const mine = parsed.ok ? applySnapshot(store, parsed.snap) : emptyAdded();
    if (addedTotal(mine) && deps.onSynced) deps.onSynced();
    return { ok: true, tv: { ...emptyAdded(), ...res.added }, phone: mine };
  }

  async function syncWithTv() {
    if (!plugin) return toast('TV ile eşitleme yalnız Android uygulamasında çalışır');
    if (deps.guard && !(await deps.guard())) return; // veriler kullanıcı adı/parola içerir
    const dev = await chooseTv('TV ile eşitle');
    if (!dev) return;
    toast('Eşitleniyor…', 15000);
    const r = await runSync(dev);
    if (!r.ok) return toast(r.msg, 4000);
    store.setPref('sync.last', Date.now());
    toast(syncMessage(r.tv, r.phone), 7000);
  }

  // Kendiliğinden eşitleme (telefon): eşleşmiş TV aynı ağda bulunursa sessizce eşitler; yalnız bir şey değiştiyse haber verir.
  // Eşleşme zaten kullanıcının izniyle yapıldığı için parola sorulmaz. Sık denemeyi throttle önler.
  let autoBusy = false;
  async function autoSync({ force = false } = {}) {
    if (!plugin || deps.isTv() || autoBusy) return false;
    if (store.pref('sync.auto', true) === false) return false;
    const saved = devices.list();
    if (!saved.length) return false;
    if (deps.busy && deps.busy()) return false; // oynatıcı açıkken ekran yenilenmesin
    const nowMs = Date.now();
    if (!force && nowMs - Number(store.pref('sync.try', 0)) < AUTO_SYNC_MS) return false;
    autoBusy = true;
    store.setPref('sync.try', nowMs);
    try {
      let found = [];
      try {
        const r = await plugin.castDiscover({ timeoutMs: 1500 });
        found = (r && r.devices) || [];
      } catch {
        found = [];
      }
      const online = mergeDevices(saved, found).filter((d) => d.saved && d.online);
      let changed = emptyAdded();
      let any = false;
      for (const d of online) {
        const r = await runSync(devices.get(d.id) || d);
        if (!r.ok) continue;
        any = true;
        for (const k of Object.keys(changed)) changed[k] += (r.phone[k] || 0) + (r.tv[k] || 0);
      }
      if (any) store.setPref('sync.last', Date.now());
      if (addedTotal(changed)) toast('TV ile eşitlendi: ' + describeAdded(changed), 4000);
      return any;
    } finally {
      autoBusy = false;
    }
  }

  // Uzaktan kumanda sayfası. args: { step?, onProgress?, keep? } — keep: yalnız kumanda (TV'de bir şey oynamasa da açık kalır).
  function remoteScreen(dev, sent, args) {
    let cur = sent;
    let seeking = false;
    let dragVol = false;
    let padOn = false;
    let lastView = null;
    let lastSave = 0;
    const keep = !!args.keep;
    const hasStep = !!args.step;
    const btn = (id, ic, label, cls = 'tool') => `<button class="${cls}" id="${id}" aria-label="${label}">${icon(ic)}<span>${label}</span></button>`;
    const dkey = (k, label, inner) => `<button class="big-btn sm" data-k="${k}" aria-label="${label}">${inner}</button>`;
    const page = openPage({
      cls: 'cast-pg',
      title: dev.name,
      html:
        `<div class="cast"><div class="cast-now"><div class="cast-ic">${icon('tv')}</div><b id="cs-title"></b><span id="cs-state">Gönderildi…</span><small id="cs-epg" hidden></small><small>${esc(dev.name)} üzerinde</small></div>` +
        `<div class="cast-media" id="cs-media">` +
        `<div class="cast-prog" id="cs-prog"><span id="cs-pos">0:00</span><input id="cs-seek" type="range" min="0" max="1000" value="0" aria-label="Konum"><span id="cs-dur">0:00</span></div>` +
        `<div class="cast-btns"><button class="big-btn" id="cs-prev" aria-label="Önceki" hidden>${icon('prev')}</button><button class="big-btn sm" id="cs-rew" aria-label="10 sn geri">${icon('rew10')}</button><button class="big-btn lg" id="cs-play" aria-label="Oynat/Duraklat">${icon('pause')}</button><button class="big-btn sm" id="cs-fwd" aria-label="10 sn ileri">${icon('fwd10')}</button><button class="big-btn" id="cs-next" aria-label="Sonraki" hidden>${icon('next')}</button></div>` +
        `</div>` +
        `<div class="cast-vol" id="cs-volrow"><button class="tool" id="cs-vdn" aria-label="Sesi kıs">${icon('audio')}<span>−</span></button><button class="tool" id="cs-mute" aria-label="Sessiz" aria-pressed="false">${icon('mute')}</button><input id="cs-vol" type="range" min="0" max="100" value="0" aria-label="Ses"><button class="tool" id="cs-vup" aria-label="Sesi aç">${icon('audio')}<span>+</span></button></div>` +
        `<div class="cast-tools" id="cs-tools">${btn('cs-audio', 'audio', 'Ses dili')}${btn('cs-text', 'cc', 'Altyazı')}${btn('cs-night', 'moon', 'Gece modu')}${btn('cs-sleep', 'timer', 'Uyku')}${btn('cs-aspect', 'aspect', 'Sığdır')}${btn('cs-stats', 'activity', 'Bilgi')}${btn('cs-fav', 'star', 'Favori')}${btn('cs-last', 'swap', 'Son kanal')}${btn('cs-golive', 'tv', 'Canlıya dön')}</div>` +
        `<button class="tool cast-padt" id="cs-padt" aria-pressed="false">${icon('grid')}<span>Yön tuşları</span></button>` +
        `<div class="cast-pad" id="cs-pad" hidden><span></span>${dkey('up', 'Yukarı', icon('up'))}<span></span>${dkey('left', 'Sol', icon('chev-l'))}${dkey('ok', 'Tamam', '<b>OK</b>')}${dkey('right', 'Sağ', icon('chev-r'))}<span></span>${dkey('down', 'Aşağı', icon('down'))}${dkey('back', 'Geri', icon('back'))}</div>` +
        `<button class="btn g cast-stop" id="cs-stop">${icon('close')}TV’de durdur</button></div>`,
      mount: (body) => {
        const $ = (sel) => body.querySelector(sel);
        const setTitle = () => ($('#cs-title').textContent = (lastView && lastView.title) || cur.title || '');
        // etiket + (varsa) açık durumu
        const setTool = (id, { show, label, on }) => {
          const b = $(id);
          b.hidden = !show;
          if (label != null) b.querySelector('span').textContent = label;
          if (on != null) {
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
          }
        };
        setTitle();
        const remote = createRemote({
          request: (path, method, b) => request(dev, path, method, b || ''),
          sent: keep ? null : cur, // yalnız kumandada canlı/film bilgisi TV'den okunur (TV kendi kendine kanal değiştirebilir)
          keep,
          onView: (v) => {
            if (!page.el.isConnected) return remote.stop();
            lastView = v;
            const x = v.ext;
            setTitle();
            $('#cs-state').textContent = v.text;
            $('#cs-epg').textContent = x.epg;
            $('#cs-epg').hidden = !x.epg || !v.active;
            $('#cs-media').hidden = !v.active;
            $('#cs-play').innerHTML = icon(v.paused ? 'play' : 'pause');
            $('#cs-prog').hidden = v.live || !v.canSeek;
            $('#cs-rew').hidden = $('#cs-fwd').hidden = !v.canSeek;
            $('#cs-prev').hidden = !(hasStep || x.can.prev);
            $('#cs-next').hidden = !(hasStep || x.can.next);
            $('#cs-volrow').hidden = !v.canVol;
            $('#cs-mute').classList.toggle('on', v.muted);
            $('#cs-mute').setAttribute('aria-pressed', String(v.muted));
            if (!dragVol) $('#cs-vol').value = String(v.vol);
            if (!seeking && v.canSeek) {
              $('#cs-pos').textContent = fmtDuration(v.pos);
              $('#cs-dur').textContent = fmtDuration(v.dur);
              $('#cs-seek').value = String(Math.round(v.pct * 1000));
            }
            const live = v.live;
            $('#cs-tools').hidden = !v.active;
            setTool('#cs-audio', { show: x.can.audio });
            setTool('#cs-text', { show: x.can.text, on: x.textOn });
            setTool('#cs-night', { show: x.can.night, label: x.night === 'off' ? 'Gece modu' : 'Gece: ' + nightLabel(x.night), on: x.night !== 'off' });
            setTool('#cs-sleep', { show: x.can.sleep, label: x.sleepMin ? 'Uyku: ' + fmtRemaining(x.sleepLeft) : 'Uyku', on: x.sleepMin > 0 });
            setTool('#cs-aspect', { show: x.can.aspect, label: x.aspect || 'Sığdır' });
            setTool('#cs-stats', { show: x.can.stats, on: x.stats });
            setTool('#cs-fav', { show: x.can.fav, label: x.fav ? 'Favoride' : 'Favori', on: x.fav });
            if ($('#cs-fav').dataset.fav !== String(x.fav)) {
              $('#cs-fav').dataset.fav = String(x.fav);
              $('#cs-fav').querySelector('svg').outerHTML = icon(x.fav ? 'star-on' : 'star');
            }
            setTool('#cs-last', { show: x.can.last && live });
            setTool('#cs-golive', { show: x.can.golive });
            // TV'de oynayan yokken (yalnız kumanda) yön tuşları hep açık; kapatma düğmesi de gerekmez
            const idle = keep && !v.active;
            $('#cs-pad').hidden = !(padOn || idle);
            $('#cs-padt').hidden = idle;
            $('#cs-stop').hidden = !v.active;
            if (v.active && args.onProgress && !v.live && v.canSeek && Date.now() - lastSave > 5000) {
              lastSave = Date.now();
              args.onProgress(v.pos, v.dur);
            }
          },
          onEnd: (why) => {
            toast(why === 'never' ? 'TV videoyu açamadı. Adresi veya TV bağlantısını kontrol edin.' : 'TV’de oynatma bitti', 3500);
            page.close();
          },
          onLost: () => {
            toast('TV’ye ulaşılamıyor', 3500);
            page.close();
          },
          onUnpaired: () => {
            devices.forget(dev.id);
            toast('TV bu telefonun eşleşmesini kaldırmış. Yeniden eşleştirin.', 4000);
            page.close();
          },
        });
        const cmd = async (c) => {
          const r = await remote.send(c);
          if (!r.ok) toast(r.msg);
          return r;
        };
        // TV'deki listeyi (ses dili, altyazı, gece modu, uyku) telefonda seçtirir; seçilen kimlik komutla gider
        const choose = (title, rows, pick, hint = '') => {
          const sh = openSheet({
            title,
            html: hint + rows.map((r) => `<button class="list-item" data-id="${esc(r.id)}"><span class="t">${esc(r.label)}</span>${r.on ? icon('check').replace('class="ic"', 'class="ic ok"') : ''}</button>`).join(''),
            mount: (sbody) =>
              sbody.addEventListener('click', (e) => {
                const b = e.target.closest('[data-id]');
                if (!b) return;
                sh.close();
                pick(b.dataset.id);
              }),
          });
        };
        const ext = () => (lastView ? lastView.ext : null);
        $('#cs-play').addEventListener('click', () => cmd({ a: 'toggle' }));
        $('#cs-rew').addEventListener('click', () => cmd({ a: 'seekBy', v: -10000 }));
        $('#cs-fwd').addEventListener('click', () => cmd({ a: 'seekBy', v: 10000 }));
        $('#cs-vup').addEventListener('click', () => cmd({ a: 'volUp' }));
        $('#cs-vdn').addEventListener('click', () => cmd({ a: 'volDown' }));
        $('#cs-mute').addEventListener('click', () => cmd({ a: 'mute' }));
        const vol = $('#cs-vol');
        vol.addEventListener('input', () => (dragVol = true));
        vol.addEventListener('change', async () => {
          if (lastView && lastView.volMax > 0) await cmd({ a: 'setVol', v: Math.round((Number(vol.value) / 100) * lastView.volMax) });
          dragVol = false;
        });
        $('#cs-audio').addEventListener('click', () => {
          const x = ext();
          if (x) choose('Ses dili', x.audio.map((t) => ({ id: t.id, label: t.label, on: t.selected })), (id) => cmd({ a: 'audio', v: id }));
        });
        $('#cs-text').addEventListener('click', () => {
          const x = ext();
          if (x) choose('Altyazı', [{ id: '', label: 'Kapalı', on: !x.textOn }, ...x.text.map((t) => ({ id: t.id, label: t.label, on: x.textOn && t.selected }))], (id) => cmd({ a: 'text', v: id }));
        });
        $('#cs-night').addEventListener('click', () => {
          const x = ext();
          if (x) choose('Gece modu', NIGHT_LEVELS.map(([id, label]) => ({ id, label, on: id === x.night })), (id) => cmd({ a: 'night', v: id }));
        });
        $('#cs-sleep').addEventListener('click', () => {
          const x = ext();
          if (x) choose('Uyku zamanlayıcısı', SLEEP_OPTIONS.map(([m, label]) => ({ id: String(m), label, on: m === x.sleepMin })), (id) => cmd({ a: 'sleep', v: Number(id) }), x.sleepMin ? `<p class="hint">Kalan süre: ${fmtRemaining(x.sleepLeft)}. Süre dolunca TV’de oynatma durur.</p>` : '');
        });
        $('#cs-aspect').addEventListener('click', () => cmd({ a: 'aspect' }));
        $('#cs-stats').addEventListener('click', () => cmd({ a: 'stats' }));
        $('#cs-fav').addEventListener('click', () => cmd({ a: 'fav' }));
        $('#cs-last').addEventListener('click', () => cmd({ a: 'last' }));
        $('#cs-golive').addEventListener('click', () => cmd({ a: 'golive' }));
        $('#cs-padt').addEventListener('click', () => {
          padOn = !padOn;
          $('#cs-pad').hidden = !padOn;
          $('#cs-padt').classList.toggle('on', padOn);
          $('#cs-padt').setAttribute('aria-pressed', String(padOn));
        });
        $('#cs-pad').addEventListener('click', (e) => {
          const k = e.target.closest('[data-k]');
          if (k) cmd({ a: 'key', v: k.dataset.k });
        });
        $('#cs-stop').addEventListener('click', async () => {
          await cmd({ a: 'stop' });
          remote.stop();
          page.close();
        });
        const seek = $('#cs-seek');
        seek.addEventListener('input', () => {
          seeking = true;
          if (lastView && lastView.dur > 0) $('#cs-pos').textContent = fmtDuration((Number(seek.value) / 1000) * lastView.dur);
        });
        seek.addEventListener('change', async () => {
          if (lastView && lastView.dur > 0) await cmd({ a: 'seekTo', v: Math.round((Number(seek.value) / 1000) * lastView.dur) });
          seeking = false;
        });
        const go = async (d) => {
          if (!hasStep) return cmd({ a: d < 0 ? 'prev' : 'next' }); // TV'nin kendi listesinde (kanal/bölüm) gezer
          const n = args.step(d);
          if (!n) return toast(d < 0 ? 'Bu ilk kanal' : 'Bu son kanal');
          const p = buildCast(n);
          const r = sendResult(await request(dev, '/play', 'POST', JSON.stringify(p)));
          if (!r.ok) return toast(r.msg);
          cur = p;
          lastView = null;
          setTitle();
        };
        $('#cs-prev').addEventListener('click', () => go(-1));
        $('#cs-next').addEventListener('click', () => go(1));
        remote.start();
      },
    });
  }

  // ------------------------------------------------------------------ TV: alıcı

  // Alıcı (eşleştirme kodunu üreten taraf) yalnız TV'dir; telefon kodu TV'den alıp girer.
  const wantReceiver = () => !!deps.isTv() && !!store.pref('cast.on', true);

  // Oynatıcının denetim durumunu (ses/altyazı izleri, uyku, gece modu…) telefon kumandası okusun diye eklentiye bildirir.
  // Yalnız değişince gider; oynatıcı kapalıysa boş bildirilir.
  let extTimer = 0;
  let extSent = '';
  function pushExt() {
    if (!receiver) return;
    let json = '';
    try {
      const e = deps.remoteExt ? deps.remoteExt() : null;
      json = e ? JSON.stringify(e) : '';
    } catch {
      json = '';
    }
    if (json === extSent) return;
    extSent = json;
    plugin.castExt({ json }).catch(() => {});
  }

  async function startReceiver() {
    if (!plugin || !wantReceiver()) return;
    try {
      receiver = await plugin.castStart({ name: store.pref('cast.name', '') });
    } catch {
      receiver = null;
    }
    if (receiver && !extTimer) extTimer = setInterval(pushExt, 1000);
  }

  async function stopReceiver() {
    if (!plugin) return;
    try {
      await plugin.castStop();
    } catch {
      /* zaten kapalı */
    }
    receiver = null;
    clearInterval(extTimer);
    extTimer = 0;
    extSent = '';
  }

  function listen() {
    if (!plugin) return;
    plugin.addListener('castPlay', (e) => {
      const r = parseCast(e);
      if (r) deps.playCast(r);
    }).catch(() => {});
    plugin.addListener('castStop', () => deps.stopCast()).catch(() => {});
    // Telefon kumandasından gelen oynatıcı komutları (sonraki/önceki, ses dili, altyazı, uyku, yön tuşları…)
    plugin.addListener('castCmd', (e) => {
      const c = parseRemoteCmd(e);
      if (c && deps.remoteCmd) deps.remoteCmd(c);
    }).catch(() => {});
    // Telefondan veri eşitleme: gelen veri bu TV'nin verisiyle birleştirilir, birleşmiş veri telefona yanıt olur.
    plugin.addListener('castSync', (e) => {
      let reply;
      try {
        const parsed = parseSnapshot(e && e.body);
        if (!parsed.ok) reply = { ok: false, body: JSON.stringify({ error: parsed.error }) };
        else {
          const added = applySnapshot(store, parsed.snap);
          if (addedTotal(added)) {
            if (deps.onSynced) deps.onSynced();
            toast('Telefonla eşitlendi: ' + describeAdded(added), 5000);
          }
          reply = { ok: true, body: JSON.stringify({ ok: true, added, snapshot: makeSnapshot(store) }) };
        }
      } catch {
        reply = { ok: false, body: JSON.stringify({ error: 'TV eşitlemeyi uygulayamadı' }) };
      }
      plugin.castSyncReply({ id: e && e.id, ok: reply.ok, body: reply.body }).catch(() => {});
    }).catch(() => {});
  }

  // Oynatıcıdan gelen durumla "şu an çalan"ı eklentiye bildirir (telefon kumandası başlığı gösterir).
  function nowPlaying(st) {
    if (!receiver || !st || !st.item) return;
    const title = st.ep ? `${st.item.name} · ${st.ep.label || ''}` : st.item.name;
    const key = `${st.item.id}|${st.ep ? st.ep.id : ''}`;
    if (key === nowKey) return;
    nowKey = key;
    plugin.castNow({ title, kind: st.item.kind === 'live' ? 'live' : 'vod' }).catch(() => {});
  }

  function receiverSheet() {
    if (!plugin) return toast('Bu özellik yalnız Android uygulamasında çalışır');
    if (!deps.isTv()) {
      chooseTv('Telefondan oynat', true); // telefon: TV'yi seç, TV'nin gösterdiği kodu gir
      return;
    }
    openSheet({
      full: true, // TV'de tam sayfa
      title: 'Telefondan oynat',
      html: '<div id="rc-body"><p class="hint">Yükleniyor…</p></div>',
      mount: (body, api) => {
        const box = body.querySelector('#rc-body');
        let code = '';
        let codeAt = 0;
        const fmtCode = (c) => (c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c);
        let lastHtml = '';
        const leftSec = () => (code ? Math.max(0, 5 * 60 - Math.floor((Date.now() - codeAt) / 1000)) : 0);
        const updateLeft = () => {
          const el = box.querySelector('#rc-left');
          if (el) {
            const l = leftSec();
            el.textContent = `${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}`;
          }
        };
        const draw = (info) => {
          const on = wantReceiver();
          let h = `<button class="chk${on ? ' on' : ''}" id="rc-on" role="switch" aria-checked="${on}"><i>${icon('check')}</i><span class="t">Bu cihaz telefondan oynatmayı kabul etsin<small>Telefondaki uygulamadan film ve kanal gönderilir, buradan kumanda edilir. Telefon ve cihaz aynı Wi‑Fi ağında olmalı.</small></span></button>`;
          if (on && info && info.running) {
            h += `<div class="sect">Eşleştirme</div>`;
            h += leftSec() > 0
              ? `<div class="cast-code" aria-live="polite">${fmtCode(code)}</div><p class="hint">Telefonda bir filmi açıp “TV’de oynat”a dokunun, bu cihazı seçin ve kodu girin. Kod <b id="rc-left"></b> süreyle geçerli, tek kullanımlık.</p><button class="btn g" id="rc-new">Yeni kod</button>`
              : `<p class="hint">Yeni bir telefon eşleştirmek için kod üretin.</p><button class="btn" id="rc-new">Kod göster</button>`;
            const paired = info.paired || [];
            h += `<div class="sect">Eşleşmiş telefonlar</div>`;
            h += paired.length ? paired.map((p) => `<div class="rec-row"><span class="rec-play"><span class="t">${esc(p.name)}</span></span><button class="icon-btn" data-un="${esc(p.id)}" aria-label="Kaldır">${icon('trash')}</button></div>`).join('') : '<p class="hint">Henüz eşleşmiş telefon yok.</p>';
            h += `<div class="sect">Cihaz</div><p class="hint">Ad: <b>${esc(info.name || '')}</b>${info.ips && info.ips.length ? ` · Elle bağlanmak için adres: <b>${info.ips.map(esc).join(', ')}</b>` : ''}</p>`;
          } else if (on) {
            h += '<p class="err-text">Alıcı açılamadı. Ağ bağlantısını kontrol edin.</p>';
          }
          if (h !== lastHtml) {
            lastHtml = h;
            box.innerHTML = h;
          }
          updateLeft();
        };
        const refresh = async () => {
          if (!box.isConnected) return;
          let info = null;
          try {
            info = await plugin.castInfo();
          } catch {
            info = null;
          }
          receiver = info && info.running ? info : null;
          draw(info);
        };
        const newCode = async () => {
          try {
            const r = await plugin.castPairOpen();
            code = r.code || '';
            codeAt = Date.now();
          } catch {
            code = '';
          }
          refresh();
        };
        body.addEventListener('click', async (e) => {
          if (e.target.closest('#rc-on')) {
            const on = !wantReceiver();
            store.setPref('cast.on', on);
            if (on) {
              await startReceiver();
              await newCode();
            } else {
              code = '';
              await stopReceiver();
              refresh();
            }
            return;
          }
          if (e.target.closest('#rc-new')) return newCode();
          const un = e.target.closest('[data-un]');
          if (un) {
            await plugin.castUnpair({ id: un.dataset.un }).catch(() => {});
            refresh();
          }
        });
        // açıkken kod üret; kapanınca eşleştirme kapatılır; liste/süre düzenli yenilenir
        (async () => {
          if (wantReceiver() && !receiver) await startReceiver();
          if (wantReceiver() && receiver) await newCode();
          else refresh();
        })();
        const tick = setInterval(() => {
          if (!api.el.isConnected) {
            clearInterval(tick);
            if (plugin) plugin.castPairClose().catch(() => {});
            return;
          }
          refresh();
        }, 2000);
      },
    });
  }

  return { sendToTv, syncWithTv, autoSync, receiverSheet, startReceiver, listen, nowPlaying, pushExt, devices };
}
