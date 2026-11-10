// Yönetici paneli arayüzü: kullanıcılar (davet kodları), engelli cihazlar, gelen sorun raporları.
// Mantık admin.js / vault.js / report.js’te; burada yalnızca ekranlar var. Her değişiklik GitHub’a otomatik yayınlanır.
import { esc } from './util.js';
import { $, $$, icon, toast, openPage, openSheet, fmtAgo } from './ui.js';
import { createGithub, loadVault, publish, sealToken, openToken } from './admin.js';
import { newUser, userStatus, extendUser, addBlocked, inviteText, cleanSourceInput, expiryFrom } from './vault.js';
import { decodeAll, describeReport, summarize } from './report.js';
import { fmtDeviceId } from './managed.js';

const MIN_PASS = 8;
const MAX_REPORTS = 300;
const REPORTS_KEY = 'adm:reports';
const STATUS_TEXT = { active: 'Aktif', expired: 'Süresi doldu', off: 'Kapalı' };

const fmtDate = (ms) => new Date(ms).toLocaleDateString('tr-TR');
const expText = (u) => (u.x > 0 ? `Bitiş: ${fmtDate(u.x)}` : 'Süresiz');
function srcText(s) {
  try {
    return s.type === 'xtream' ? `Xtream · ${new URL(/^https?:\/\//i.test(s.server) ? s.server : 'http://' + s.server).host}` : `M3U · ${new URL(s.url).host}`;
  } catch {
    return s.type === 'xtream' ? 'Xtream' : 'M3U';
  }
}

export function openAdmin(env) {
  const { store, apkUrl, shareOrCopy, readClipboard } = env;
  let pass = '';
  let gh = null;
  let st = null; // { vault, sha, cfgSha }
  let tab = 'users';
  let busy = false;
  let reports = [];
  let statusMsg = '';
  let statusErr = false;

  const page = openPage({
    title: 'Yönetici',
    html: '<div class="page" id="adm"></div>',
    mount: (body) => {
      const root = $('#adm', body);
      const setStatus = (m, err = false) => {
        statusMsg = m;
        statusErr = err;
        const el = $('#adm-status', root);
        if (el) {
          el.textContent = m;
          el.classList.toggle('err-text', err);
        }
      };
      const showErr = (m) => {
        const e = $('#adm-err', root);
        if (!e) return toast(m);
        e.hidden = !m;
        e.textContent = m || '';
      };

      // ---- giriş / kurulum ----------------------------------------------------------------------------------
      const setupHtml = () => `<p>Yönetici paneli, kullanıcılara davet kodu verip liste dağıtmanızı sağlar. Veriler GitHub’da şifreli tutulur; yalnız parolanızla açılır.</p>
<label class="field"><span>GitHub token</span><input id="adm-tok" type="password" autocomplete="off" autocapitalize="none" placeholder="github_pat_…"><small>GitHub › Settings › Developer settings › Fine-grained tokens: yalnız bu depo, izin “Contents: Read and write”.</small></label>
<label class="field"><span>Panel parolası (en az ${MIN_PASS} karakter)</span><input id="adm-p1" type="password" autocomplete="new-password"></label>
<label class="field"><span>Parola (tekrar)</span><input id="adm-p2" type="password" autocomplete="new-password"></label>
<p class="err-text" id="adm-err" hidden></p>
<button class="btn" id="adm-setup" style="width:100%">Kur ve bağlan</button>`;
      const unlockHtml = () => `<p>Yönetici paneli kilitli.</p>
<label class="field"><span>Panel parolası</span><input id="adm-p1" type="password" autocomplete="current-password"></label>
<p class="err-text" id="adm-err" hidden></p>
<button class="btn" id="adm-unlock" style="width:100%">Aç</button>
<button class="btn ghost sm" id="adm-reset" style="margin-top:14px">Token’ı sil / yeniden kur</button>`;

      async function enter(token, p, fresh) {
        const g = createGithub({ token });
        await g.check();
        const loaded = await loadVault(g, p);
        if (fresh) store.setPref('adm.tok', await sealToken(token, p));
        gh = g;
        pass = p;
        st = { vault: loaded.vault, sha: loaded.sha, cfgSha: undefined };
        reports = (await store.cache.get(REPORTS_KEY)) || [];
        render();
      }

      // ---- ana ekran ------------------------------------------------------------------------------------------
      function render() {
        if (!st) {
          root.innerHTML = store.pref('adm.tok', null) ? unlockHtml() : setupHtml();
          return;
        }
        root.innerHTML = `<div class="seg" id="adm-tabs" style="padding:0 0 12px"><button data-t="users">Kullanıcılar</button><button data-t="blocked">Engelli</button><button data-t="reports">Raporlar</button></div><div id="adm-view"></div><p class="hint" id="adm-status" style="color:var(--muted);font-size:.75rem;margin-top:16px"></p><button class="btn ghost sm" id="adm-out" style="margin-top:10px">Çıkış (token’ı bu cihazdan sil)</button>`;
        $$('#adm-tabs button', root).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
        renderView();
        setStatus(statusMsg || (st.sha ? 'Yayında. Değişiklikler cihazlara birkaç dakikada ulaşır.' : 'Henüz yayınlanmadı.'), statusErr);
      }

      function renderView() {
        const v = $('#adm-view', root);
        if (!v) return;
        v.innerHTML = tab === 'users' ? usersHtml() : tab === 'blocked' ? blockedHtml() : reportsHtml();
      }

      const usersHtml = () => {
        const now = Date.now();
        const cards = st.vault.users
          .map((u) => {
            const s = userStatus(u, now);
            return `<div class="src ${s === 'active' ? 'active' : ''}"><h4>${esc(u.name)}<span class="badge">${STATUS_TEXT[s]}</span></h4><p>Kod: <b>${esc(u.code)}</b></p><p>${expText(u)} · ${u.sources.map(srcText).map(esc).join(', ')}</p>${u.note ? `<p>Not: ${esc(u.note)}</p>` : ''}<div class="btns"><button class="btn sm" data-a="invite" data-c="${esc(u.code)}">Davet gönder</button><button class="btn sm ghost" data-a="copy" data-c="${esc(u.code)}">Kodu kopyala</button><button class="btn sm ghost" data-a="edit" data-c="${esc(u.code)}">Düzenle</button><button class="btn sm ghost" data-a="toggle" data-c="${esc(u.code)}">${u.off ? 'Aç' : 'Kapat'}</button><button class="btn sm danger" data-a="del" data-c="${esc(u.code)}">Sil</button></div></div>`;
          })
          .join('');
        return `<button class="btn" id="adm-new" style="width:100%;margin-bottom:12px">${icon('plus')}Yeni kullanıcı</button>${cards || '<p style="color:var(--muted)">Henüz kullanıcı yok. “Yeni kullanıcı” ile bir davet kodu oluşturun.</p>'}`;
      };

      const blockedHtml = () => `<p style="color:var(--muted);font-size:.8rem">Kullanıcı “Genel ayarlar › Cihaz kimliği” ile kimliğini size gönderir. Engellenen cihazdaki davet kodlu listeler bir sonraki denetimde kaldırılır.</p>
<label class="field"><span>Cihaz kimliği</span><input id="bl-id" autocapitalize="characters" placeholder="A1B2-C3D4-E5F6"></label>
<label class="field"><span>Not (isteğe bağlı)</span><input id="bl-note" maxlength="100"></label>
<p class="err-text" id="adm-err" hidden></p>
<button class="btn" id="bl-add" style="width:100%;margin-bottom:12px">Engelle</button>
${st.vault.blocked.map((b) => `<div class="list-item"><span class="t">${esc(fmtDeviceId(b.id))}<small>${esc(b.note || '')}</small></span><button class="btn sm ghost" data-a="unblock" data-id="${esc(b.id)}">Kaldır</button></div>`).join('') || '<p style="color:var(--muted)">Engelli cihaz yok.</p>'}`;

      const reportsHtml = () => {
        const sum = summarize(reports);
        const latest = new Map();
        for (const r of reports) if (!latest.has(r.id) || latest.get(r.id).at < r.at) latest.set(r.id, r);
        const devs = [...latest.values()].sort((a, b) => b.at - a.at);
        return `<label class="field"><span>Gelen raporu yapıştırın</span><textarea id="rp-in" rows="4" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--line);border-radius:10px" placeholder="IPTVRAPOR1:…"></textarea></label>
<p class="err-text" id="adm-err" hidden></p>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button class="btn" id="rp-add">İçe aktar</button><button class="btn ghost" id="rp-paste">Panodan yapıştır</button></div>
<div class="sect">Özet</div>
<p>${sum.devices} cihaz (${sum.tvs} TV) · ${Object.entries(sum.versions).map(([k, n]) => `${esc(k)}: ${n}`).join(', ') || 'rapor yok'}</p>
${sum.top.length ? `<div class="sect">En çok hata veren kanallar</div>${sum.top.map((t) => `<p>${esc(t.name)} <small style="color:var(--muted)">${t.devices} cihaz</small></p>`).join('')}` : ''}
<div class="sect">Cihazlar</div>
${devs.map((r) => `<button class="list-item" data-a="rview" data-id="${esc(r.id)}"><span class="t">${esc(fmtDeviceId(r.id))}<small>${esc(r.v || '?')} · ${r.tv ? 'TV' : 'Telefon'} · ${fmtAgo(r.at)} · çalışmıyor: ${r.bad.length}</small></span></button>`).join('') || '<p style="color:var(--muted)">Henüz rapor yok.</p>'}
${reports.length ? '<button class="btn ghost sm" id="rp-clear" style="margin-top:12px">Raporları temizle</button>' : ''}`;
      };

      // ---- yayınlama ------------------------------------------------------------------------------------------
      async function commit(nextVault, okMsg) {
        if (busy) return false;
        busy = true;
        setStatus('Yayınlanıyor…');
        try {
          st = await publish(gh, { vault: nextVault, sha: st.sha, cfgSha: st.cfgSha }, pass);
          setStatus('Yayında · ' + new Date().toLocaleTimeString('tr-TR') + '. Değişiklikler cihazlara birkaç dakikada ulaşır.');
          if (okMsg) toast(okMsg);
          return true;
        } catch (e) {
          setStatus(e.conflict ? 'Kasa başka bir yerden değişmiş. Paneli kapatıp yeniden açın.' : e.message || 'Yayınlanamadı', true);
          toast('Yayınlanamadı: ' + (e.message || e));
          return false;
        } finally {
          busy = false;
          renderView();
        }
      }
      const byCode = (c) => st.vault.users.find((u) => u.code === c);
      const putUser = (u) => ({ ...st.vault, users: st.vault.users.map((x) => (x.code === u.code ? u : x)) });

      // ---- kullanıcı formu ------------------------------------------------------------------------------------
      function srcBlock(i, s = {}) {
        const t = s.type === 'm3u' ? 'm3u' : 'xtream';
        return `<div class="sect" data-blk="${i}">Liste ${i + 1}${i ? ' (isteğe bağlı)' : ''}</div><div data-blk="${i}">
<label class="field"><span>Tür</span><select name="type${i}"><option value="xtream"${t === 'xtream' ? ' selected' : ''}>Xtream</option><option value="m3u"${t === 'm3u' ? ' selected' : ''}>M3U bağlantısı</option></select></label>
<label class="field"><span>Liste adı (isteğe bağlı)</span><input name="name${i}" value="${esc(s.name || '')}"></label>
<div data-x="xtream"><label class="field"><span>Sunucu adresi</span><input name="server${i}" inputmode="url" autocapitalize="none" value="${esc(s.server || '')}" placeholder="http://sunucu.com:8080"></label>
<label class="field"><span>Kullanıcı adı</span><input name="user${i}" autocapitalize="none" value="${esc(s.user || '')}"></label>
<label class="field"><span>Şifre</span><input name="pass${i}" autocapitalize="none" value="${esc(s.pass || '')}"></label></div>
<div data-x="m3u"><label class="field"><span>M3U adresi</span><input name="url${i}" inputmode="url" autocapitalize="none" value="${esc(s.url || '')}" placeholder="http://…/liste.m3u"></label></div></div>`;
      }

      function userForm(u) {
        const edit = !!u;
        const days = edit
          ? [['keep', 'Süreyi değiştirme'], ['+30', '30 gün uzat'], ['+90', '90 gün uzat'], ['+365', '1 yıl uzat'], ['0', 'Süresiz yap']]
          : [['30', '30 gün'], ['90', '90 gün'], ['365', '1 yıl'], ['0', 'Süresiz']];
        const srcs = edit ? u.sources : [];
        const sh = openSheet({
          title: edit ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı',
          html: `<form id="uf" autocomplete="off"><label class="field"><span>Ad</span><input name="name" value="${esc(edit ? u.name : '')}" maxlength="80"></label>
<label class="field"><span>Süre</span><select name="days">${days.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>${edit ? `<small>${expText(u)}</small>` : ''}</label>
<label class="field"><span>Not (isteğe bağlı)</span><input name="note" value="${esc(edit ? u.note : '')}" maxlength="300"></label>
${[0, 1, 2].map((i) => srcBlock(i, srcs[i])).join('')}
<p class="err-text" id="uf-err" hidden></p><button class="btn" type="submit" style="width:100%">${edit ? 'Kaydet ve yayınla' : 'Oluştur ve yayınla'}</button></form>`,
          mount: (b2) => {
            const form = $('#uf', b2);
            const sync = () => {
              [0, 1, 2].forEach((i) => {
                const t = form.elements['type' + i].value;
                $$(`[data-blk="${i}"] [data-x]`, form).forEach((d) => (d.hidden = d.dataset.x !== t));
              });
            };
            sync();
            form.addEventListener('change', sync);
            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              const f = form.elements;
              const err = $('#uf-err', b2);
              const sources = [0, 1, 2]
                .map((i) => cleanSourceInput({ type: f['type' + i].value, name: f['name' + i].value, server: f['server' + i].value, user: f['user' + i].value, pass: f['pass' + i].value, url: f['url' + i].value }))
                .filter(Boolean);
              try {
                const d = f.days.value;
                let next;
                if (edit) {
                  if (!f.name.value.trim()) throw new Error('Kullanıcı adı gerekli.');
                  if (!sources.length) throw new Error('En az bir geçerli liste gerekli.');
                  let nu = { ...u, name: f.name.value.trim().slice(0, 80), note: f.note.value.trim().slice(0, 300), sources };
                  if (d === '0') nu.x = 0;
                  else if (d.startsWith('+')) nu = nu.x > 0 ? extendUser(nu, Number(d.slice(1))) : { ...nu, x: expiryFrom(Number(d.slice(1))) };
                  next = putUser(nu);
                } else {
                  const nu = newUser({ name: f.name.value, days: Number(d), note: f.note.value, sources });
                  next = { ...st.vault, users: [...st.vault.users, nu] };
                }
                sh.close();
                const ok = await commit(next, edit ? 'Kaydedildi' : 'Kullanıcı oluşturuldu');
                if (ok && !edit) toast('Kod: ' + next.users[next.users.length - 1].code, 6000);
              } catch (ex) {
                err.hidden = false;
                err.textContent = ex.message;
              }
            });
          },
        });
      }

      function confirmSheet(title, text, label, onOk) {
        const sh = openSheet({
          title,
          html: `<p>${esc(text)}</p><div style="display:flex;gap:8px"><button class="btn danger" id="cf-ok">${esc(label)}</button><button class="btn ghost" id="cf-no">Vazgeç</button></div>`,
          mount: (b2) => {
            $('#cf-no', b2).addEventListener('click', () => sh.close());
            $('#cf-ok', b2).addEventListener('click', () => {
              sh.close();
              onOk();
            });
          },
        });
      }

      function reportSheet(id) {
        const mine = reports.filter((r) => r.id === id).sort((a, b) => b.at - a.at);
        const r = mine[0];
        if (!r) return;
        openSheet({
          title: fmtDeviceId(r.id),
          html: `<pre style="white-space:pre-wrap;font:inherit;font-size:.85rem">${esc(describeReport(r))}</pre>${r.bad.length ? `<div class="sect">Çalışmıyor işaretli kanallar</div><p>${r.bad.map((b) => esc(b.n)).join(', ')}</p>` : ''}${r.e.length ? `<div class="sect">Son hatalar</div>${r.e.slice().reverse().map((x) => `<p style="font-size:.8rem">${esc(new Date(x.at).toLocaleString('tr-TR'))} · ${esc(x.n)}<br><small style="color:var(--muted)">${esc(x.m)}</small></p>`).join('')}` : ''}<p style="color:var(--muted);font-size:.75rem">Rapor zamanı: ${esc(new Date(r.at).toLocaleString('tr-TR'))} · bu cihazdan ${mine.length} rapor</p>`,
        });
      }

      async function importReports(text) {
        const found = decodeAll(text);
        if (!found.length) return showErr('Metinde rapor bulunamadı. “IPTVRAPOR1:” ile başlayan metni yapıştırın.');
        let n = 0;
        for (const r of found) if (!reports.some((x) => x.id === r.id && x.at === r.at)) {
          reports.push(r);
          n++;
        }
        reports.sort((a, b) => b.at - a.at);
        reports = reports.slice(0, MAX_REPORTS);
        await store.cache.set(REPORTS_KEY, reports);
        toast(n ? `${n} rapor eklendi` : 'Bu raporlar zaten ekli');
        renderView();
      }

      // ---- olaylar --------------------------------------------------------------------------------------------
      root.addEventListener('click', async (e) => {
        const t = e.target;
        const id = t.id || (t.closest('button') && t.closest('button').id);
        if (t.closest('#adm-tabs [data-t]')) {
          tab = t.closest('[data-t]').dataset.t;
          $$('#adm-tabs button', root).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
          return renderView();
        }
        if (id === 'adm-setup') {
          const tok = $('#adm-tok', root).value.trim();
          const p1 = $('#adm-p1', root).value;
          if (!tok) return showErr('GitHub token’ını yapıştırın.');
          if (p1.length < MIN_PASS) return showErr(`Parola en az ${MIN_PASS} karakter olmalı.`);
          if (p1 !== $('#adm-p2', root).value) return showErr('Parolalar aynı değil.');
          showErr('');
          t.disabled = true;
          t.textContent = 'Bağlanıyor…';
          try {
            await enter(tok, p1, true);
          } catch (ex) {
            showErr(ex.message);
            t.disabled = false;
            t.textContent = 'Kur ve bağlan';
          }
          return;
        }
        if (id === 'adm-unlock') {
          showErr('');
          t.disabled = true;
          t.textContent = 'Açılıyor…';
          try {
            const p = $('#adm-p1', root).value;
            await enter(await openToken(store.pref('adm.tok', null), p), p, false);
          } catch (ex) {
            showErr(ex.message);
            t.disabled = false;
            t.textContent = 'Aç';
          }
          return;
        }
        if (id === 'adm-reset' || id === 'adm-out') {
          return confirmSheet('Token’ı sil', 'GitHub token’ı bu cihazdan silinecek. Yayındaki veriler ve kullanıcılar etkilenmez; yeniden bağlanmak için token’ı tekrar girmeniz gerekir.', 'Sil', () => {
            store.setPref('adm.tok', null);
            st = null;
            gh = null;
            pass = '';
            render();
          });
        }
        if (id === 'adm-new') return userForm(null);
        if (id === 'bl-add') {
          try {
            const next = addBlocked(st.vault, $('#bl-id', root).value, $('#bl-note', root).value);
            if (next === st.vault) return showErr('Bu cihaz zaten engelli.');
            showErr('');
            return commit(next, 'Cihaz engellendi');
          } catch (ex) {
            return showErr(ex.message);
          }
        }
        if (id === 'rp-add') return importReports($('#rp-in', root).value);
        if (id === 'rp-paste') {
          const txt = await readClipboard();
          if (!txt) return showErr('Pano boş ya da okunamadı. Metni kutuya yapıştırın.');
          return importReports(txt);
        }
        if (id === 'rp-clear') {
          return confirmSheet('Raporları temizle', 'Bu cihazdaki tüm içe aktarılmış raporlar silinecek.', 'Temizle', async () => {
            reports = [];
            await store.cache.set(REPORTS_KEY, reports);
            renderView();
          });
        }
        const b = t.closest('[data-a]');
        if (!b) return;
        const a = b.dataset.a;
        if (a === 'rview') return reportSheet(b.dataset.id);
        if (a === 'unblock') return commit({ ...st.vault, blocked: st.vault.blocked.filter((x) => x.id !== b.dataset.id) }, 'Engel kaldırıldı');
        const u = byCode(b.dataset.c);
        if (!u) return;
        if (a === 'copy') {
          try {
            await navigator.clipboard.writeText(u.code);
            toast('Kod kopyalandı');
          } catch {
            toast('Kod: ' + u.code, 6000);
          }
        } else if (a === 'invite') shareOrCopy(inviteText(u, apkUrl), 'Davet gönder');
        else if (a === 'edit') userForm(u);
        else if (a === 'toggle') commit(putUser({ ...u, off: !u.off }), u.off ? 'Kullanıcı açıldı' : 'Kullanıcı kapatıldı');
        else if (a === 'del') confirmSheet('Kullanıcıyı sil', `“${u.name}” silinecek. Kodu kullanan cihazlarda liste bir sonraki denetimde kaldırılır.`, 'Sil', () => commit({ ...st.vault, users: st.vault.users.filter((x) => x.code !== u.code) }, 'Kullanıcı silindi'));
      });

      render();
    },
  });
  return page;
}

