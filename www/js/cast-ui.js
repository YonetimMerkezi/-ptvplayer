// Telefondan TV'ye oynatma: ekranlar. Telefonda "TV'de oynat" seçici + uzaktan kumanda sayfası,
// TV'de Ayarlar › Telefondan oynat (eşleştirme kodu) ve gelen oynatma isteğinin karşılanması.
import { CAST_PORT, CODE_LEN, buildCast, parseCast, createDevices, mergeDevices, pairResult, sendResult, createRemote } from './cast.js';

// deps: { plugin, store, pad, toast, icon, esc, openSheet, openPage, fmtDuration, isTv(), playCast({item,targets,startAt}), stopCast() }
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
  function chooseTv() {
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
        title: 'TV’de oynat',
        html: '<div id="cs-list"></div><div class="cast-add"><input id="cs-ip" inputmode="decimal" placeholder="TV’nin IP adresi (örn. 192.168.1.20)" autocomplete="off"><button class="btn" id="cs-ipgo">Ekle</button></div><p class="hint">Telefon ve TV aynı Wi‑Fi ağında olmalı; TV’de uygulama açık olmalı. TV’de Ayarlar › Telefondan oynat ekranı eşleştirme kodunu gösterir.</p>',
        mount: (body, api) => {
          const box = body.querySelector('#cs-list');
          const draw = () => {
            list = mergeDevices(devices.list(), found);
            const rows = list
              .map(
                (d, i) =>
                  `<div class="cast-row-d"><button class="rec-play" data-i="${i}">${icon('tv')}<span class="t">${esc(d.name)}</span><small>${d.saved ? (d.online ? 'Eşleşmiş · bağlanabilir' : 'Eşleşmiş · bulunamadı') : 'Yeni · kod gerekir'} · ${esc(d.host)}${now[d.id] ? ` · Şu an: ${esc(now[d.id].title || 'oynatılıyor')}` : ''}</small></button>${now[d.id] ? `<button class="icon-btn" data-remote="${i}" aria-label="Kumandayı aç">${icon('play')}</button>` : ''}${d.saved ? `<button class="icon-btn" data-forget="${i}" aria-label="Eşleşmeyi kaldır">${icon('trash')}</button>` : ''}</div>`,
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
              if (!full || !now[d.id]) return;
              api.close();
              finish({ ...full, host: d.host, port: d.port || full.port, remoteOnly: now[d.id] });
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
    if (dev.remoteOnly) return remoteScreen(dev, { kind: dev.remoteOnly.kind, title: dev.remoteOnly.title }, {}); // TV zaten oynatıyor: yalnız kumanda
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

  function remoteScreen(dev, sent, args) {
    let cur = sent;
    let seeking = false;
    let lastView = null;
    let lastSave = 0;
    const hasStep = !!args.step;
    const page = openPage({
      cls: 'cast-pg',
      title: dev.name,
      html:
        `<div class="cast"><div class="cast-now"><div class="cast-ic">${icon('tv')}</div><b id="cs-title"></b><span id="cs-state">Gönderildi…</span><small>${esc(dev.name)} üzerinde oynuyor</small></div>` +
        `<div class="cast-prog" id="cs-prog"><span id="cs-pos">0:00</span><input id="cs-seek" type="range" min="0" max="1000" value="0" aria-label="Konum"><span id="cs-dur">0:00</span></div>` +
        `<div class="cast-btns">${hasStep ? `<button class="big-btn" id="cs-prev" aria-label="Önceki kanal">${icon('prev')}</button>` : ''}<button class="big-btn sm" id="cs-rew" aria-label="10 sn geri">${icon('rew')}<i>10</i></button><button class="big-btn lg" id="cs-play" aria-label="Oynat/Duraklat">${icon('pause')}</button><button class="big-btn sm" id="cs-fwd" aria-label="10 sn ileri">${icon('fwd')}<i>10</i></button>${hasStep ? `<button class="big-btn" id="cs-next" aria-label="Sonraki kanal">${icon('next')}</button>` : ''}</div>` +
        `<div class="cast-vol" id="cs-volrow"><button class="tool" id="cs-vdn">${icon('audio')}<span>Ses −</span></button><button class="tool" id="cs-vup">${icon('audio')}<span>Ses +</span></button></div>` +
        `<button class="btn g cast-stop" id="cs-stop">${icon('close')}TV’de durdur</button></div>`,
      mount: (body) => {
        const $ = (s) => body.querySelector(s);
        const setTitle = () => ($('#cs-title').textContent = (lastView && lastView.title) || cur.title);
        setTitle();
        const remote = createRemote({
          request: (path, method, b) => request(dev, path, method, b || ''),
          sent: cur,
          onView: (v) => {
            if (!page.el.isConnected) return remote.stop();
            lastView = v;
            setTitle();
            $('#cs-state').textContent = v.text;
            $('#cs-play').innerHTML = icon(v.paused ? 'play' : 'pause');
            $('#cs-prog').hidden = cur.kind === 'live';
            $('#cs-rew').hidden = $('#cs-fwd').hidden = !v.canSeek;
            $('#cs-volrow').hidden = !v.canVol;
            if (!seeking && v.canSeek) {
              $('#cs-pos').textContent = fmtDuration(v.pos);
              $('#cs-dur').textContent = fmtDuration(v.dur);
              $('#cs-seek').value = String(Math.round(v.pct * 1000));
            }
            if (cur.kind !== 'live' && v.active && v.canSeek && args.onProgress && Date.now() - lastSave > 5000) {
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
        const play = $('#cs-play');
        play.addEventListener('click', () => cmd({ a: 'toggle' }));
        $('#cs-rew').addEventListener('click', () => cmd({ a: 'seekBy', v: -10000 }));
        $('#cs-fwd').addEventListener('click', () => cmd({ a: 'seekBy', v: 10000 }));
        $('#cs-vup').addEventListener('click', () => cmd({ a: 'volUp' }));
        $('#cs-vdn').addEventListener('click', () => cmd({ a: 'volDown' }));
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
        if (hasStep) {
          const go = async (d) => {
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
        }
        remote.start();
      },
    });
  }

  // ------------------------------------------------------------------ TV: alıcı

  const wantReceiver = () => !!store.pref('cast.on', deps.isTv());

  async function startReceiver() {
    if (!plugin || !wantReceiver()) return;
    try {
      receiver = await plugin.castStart({ name: store.pref('cast.name', '') });
    } catch {
      receiver = null;
    }
  }

  async function stopReceiver() {
    if (!plugin) return;
    try {
      await plugin.castStop();
    } catch {
      /* zaten kapalı */
    }
    receiver = null;
  }

  function listen() {
    if (!plugin) return;
    plugin.addListener('castPlay', (e) => {
      const r = parseCast(e);
      if (r) deps.playCast(r);
    }).catch(() => {});
    plugin.addListener('castStop', () => deps.stopCast()).catch(() => {});
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
    openSheet({
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

  return { sendToTv, receiverSheet, startReceiver, listen, nowPlaying, devices };
}
