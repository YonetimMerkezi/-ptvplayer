/* IPTV Player Pro webOS 3.0 test client.
 * ES5 only: the 2016 UH650V uses the webOS 3.x Chromium 38 web engine.
 * This first milestone validates remote input, M3U loading and native HTML5 playback.
 */
(function () {
  'use strict';
  var channels = [];
  var current = -1;
  var focusIndex = 0;
  var focusables = [];
  var video = document.getElementById('video');
  var player = document.getElementById('player');
  var dialog = document.getElementById('source-dialog');
  var urlInput = document.getElementById('playlist-url');
  var status = document.getElementById('status');

  function byId(id) { return document.getElementById(id); }
  function setStatus(text) { status.innerHTML = text; }
  function visible(el) { return el && !el.classList.contains('hidden') && el.offsetWidth > 0; }
  function refreshFocus() {
    var root = visible(dialog) ? dialog : (visible(player) ? player : byId('app'));
    focusables = root.querySelectorAll('button:not([disabled]),input:not([disabled]),.channel');
    focusIndex = 0;
    focusCurrent();
  }
  function focusCurrent() {
    var i;
    for (i = 0; i < focusables.length; i++) { focusables[i].classList.remove('focused'); }
    if (focusables.length && focusIndex >= 0 && focusIndex < focusables.length) {
      focusables[focusIndex].classList.add('focused');
      try { focusables[focusIndex].focus(); } catch (e) {}
    }
  }
  function moveFocus(delta) {
    if (!focusables.length) refreshFocus();
    if (!focusables.length) return;
    focusIndex = (focusIndex + delta + focusables.length) % focusables.length;
    focusCurrent();
  }
  function parseM3U(text) {
    var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    var out = [];
    var meta = null;
    var i, line, name, logo, group, match;
    for (i = 0; i < lines.length; i++) {
      line = lines[i].replace(/^\s+|\s+$/g, '');
      if (!line) continue;
      if (line.indexOf('#EXTINF:') === 0) {
        match = line.match(/tvg-logo="([^"]*)"/i);
        logo = match ? match[1] : '';
        match = line.match(/group-title="([^"]*)"/i);
        group = match ? match[1] : 'Diğer';
        name = line.substring(line.lastIndexOf(',') + 1).replace(/^\s+|\s+$/g, '');
        meta = { name: name || 'İsimsiz kanal', logo: logo, group: group };
      } else if (line.charAt(0) !== '#' && meta) {
        meta.url = line;
        out.push(meta);
        meta = null;
      }
    }
    return out;
  }
  function renderChannels() {
    var host = byId('channels');
    var html = '';
    var i, c;
    if (!channels.length) {
      host.innerHTML = '<div class="empty">Başlamak için “Kaynak ekle” seçeneğini kullanın.</div>';
      byId('channel-count').innerHTML = 'Henüz kaynak eklenmedi';
    } else {
      for (i = 0; i < channels.length && i < 8; i++) {
        c = channels[i];
        html += '<button class="channel" data-index="' + i + '"><strong>' + escapeHtml(c.name) + '</strong><small>' + escapeHtml(c.group) + '</small></button>';
      }
      host.innerHTML = html;
      byId('channel-count').innerHTML = channels.length + ' kanal';
      var nodes = host.querySelectorAll('.channel');
      for (i = 0; i < nodes.length; i++) {
        nodes[i].addEventListener('click', function () { play(parseInt(this.getAttribute('data-index'), 10)); });
      }
    }
    refreshFocus();
  }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function loadPlaylist(url) {
    var xhr = new XMLHttpRequest();
    setStatus('Liste yükleniyor…');
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        channels = parseM3U(xhr.responseText || '');
        try { localStorage.setItem('iptv.webos.playlist', url); } catch (e) {}
        byId('source-error').innerHTML = channels.length ? '' : 'Listede kanal bulunamadı.';
        if (channels.length) {
          dialog.classList.add('hidden');
          renderChannels();
          setStatus('Liste yüklendi');
        } else setStatus('Liste boş');
      } else {
        byId('source-error').innerHTML = 'Liste alınamadı. URL ve sunucu erişimini kontrol edin (HTTP ' + xhr.status + ').';
        setStatus('Liste yüklenemedi');
      }
    };
    xhr.onerror = function () {
      byId('source-error').innerHTML = 'Bağlantı kurulamadı. Sunucunun TV üzerinden erişilebilir ve CORS uyumlu olduğundan emin olun.';
      setStatus('Bağlantı hatası');
    };
    xhr.send(null);
  }
  function play(index) {
    if (!channels.length || index < 0 || index >= channels.length) return;
    current = index;
    var item = channels[current];
    byId('playing-name').innerHTML = escapeHtml(item.name);
    byId('player-message').innerHTML = 'Yayın yükleniyor…';
    player.classList.remove('hidden');
    video.pause();
    video.removeAttribute('src');
    video.src = item.url;
    video.load();
    var result = video.play();
    if (result && result.catch) result.catch(function () {
      byId('player-message').innerHTML = 'Yayın başlatılamadı. Bu akış biçimi webOS 3.0 tarafından desteklenmiyor olabilir.';
    });
    refreshFocus();
  }
  function closePlayer() {
    video.pause();
    video.removeAttribute('src');
    video.load();
    player.classList.add('hidden');
    refreshFocus();
  }
  function changeChannel(delta) {
    if (!channels.length) return;
    var next = current + delta;
    if (next < 0) next = channels.length - 1;
    if (next >= channels.length) next = 0;
    play(next);
  }
  byId('open-playlist').addEventListener('click', function () {
    dialog.classList.remove('hidden');
    byId('source-error').innerHTML = '';
    refreshFocus();
    urlInput.focus();
  });
  byId('cancel-source').addEventListener('click', function () { dialog.classList.add('hidden'); refreshFocus(); });
  byId('save-source').addEventListener('click', function () {
    var url = urlInput.value.replace(/^\s+|\s+$/g, '');
    if (!/^https?:\/\//i.test(url)) { byId('source-error').innerHTML = 'Geçerli bir http veya https M3U adresi girin.'; return; }
    loadPlaylist(url);
  });
  byId('demo-play').addEventListener('click', function () {
    channels = [{ name: 'Test yayını (örnek)', group: 'Test', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }];
    renderChannels();
    setStatus('Test kanalı hazır');
    play(0);
  });
  byId('prev-channel').addEventListener('click', function () { changeChannel(-1); });
  byId('next-channel').addEventListener('click', function () { changeChannel(1); });
  byId('close-player').addEventListener('click', closePlayer);
  byId('toggle-play').addEventListener('click', function () {
    if (video.paused) { video.play(); this.innerHTML = 'Ⅱ Duraklat'; }
    else { video.pause(); this.innerHTML = '▶ Oynat'; }
  });
  video.addEventListener('playing', function () { byId('player-message').innerHTML = ''; });
  video.addEventListener('waiting', function () { byId('player-message').innerHTML = 'Tamponlanıyor…'; });
  video.addEventListener('error', function () { byId('player-message').innerHTML = 'Bu yayın biçimi veya adresi TV tarafından oynatılamadı.'; });
  document.addEventListener('keydown', function (e) {
    var key = e.key || '';
    var code = e.keyCode || e.which;
    if (key === 'ArrowDown' || code === 40) { e.preventDefault(); moveFocus(1); }
    else if (key === 'ArrowUp' || code === 38) { e.preventDefault(); moveFocus(-1); }
    else if (key === 'ArrowRight' || code === 39) { e.preventDefault(); moveFocus(1); }
    else if (key === 'ArrowLeft' || code === 37) { e.preventDefault(); moveFocus(-1); }
    else if (key === 'Enter' || code === 13) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      e.preventDefault();
      if (focusables[focusIndex]) focusables[focusIndex].click();
    } else if (key === 'Escape' || key === 'Backspace' || code === 461 || code === 27 || code === 8) {
      e.preventDefault();
      if (visible(dialog)) { dialog.classList.add('hidden'); refreshFocus(); }
      else if (visible(player)) closePlayer();
    } else if (code === 403) { /* kırmızı tuş: kaynak ekranına dön */ if (visible(player)) closePlayer(); }
  });
  try {
    var saved = localStorage.getItem('iptv.webos.playlist');
    if (saved) { urlInput.value = saved; loadPlaylist(saved); }
  } catch (e) {}
  renderChannels();
  setStatus('Hazır · Kaynak ekleyin');
})();
