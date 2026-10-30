/* App controller: screens, remote-control navigation, sections. */
(function () {
  'use strict';

  var K = Util.KEY, $ = Util.$, el = Util.el, show = Util.show, store = Util.store;

  // The UI is right-to-left: the "deeper" column is to the left.
  var NEXT = K.LEFT, PREV = K.RIGHT;

  var MENU = [
    { id: 'live', label: 'القنوات' },
    { id: 'vod', label: 'الأفلام' },
    { id: 'series', label: 'المسلسلات' },
    { id: 'fav', label: 'المفضلة' },
    { id: 'search', label: 'بحث' },
    { id: 'settings', label: 'الإعدادات' }
  ];
  var KIND_LABEL = { live: 'قناة', vod: 'فيلم', series: 'مسلسل' };

  var api = null, account = null;
  var screen = 'login';
  var zone = 'menu';           // browse: menu | cats | items | search ; series: seasons | episodes
  var menuIndex = 0, section = null;
  var data = {};               // kind -> { cats, byCat, all }
  var catList, rowList, gridList, itemList;  // itemList is whichever of rowList/gridList is showing
  var seasonList, episodeList, zapList;
  var seriesCtx = null;        // { series, seasons, episodes }
  var play = null;             // { kind, list, index, item, triedTs, episodes }
  var returnScreen = 'browse';
  var exitArmed = 0;

  /* ---------------- Favorites & positions ---------------- */

  function itemId(it) { return it.t === 'series' ? it.s.series_id : it.s.stream_id; }
  function favKey(it) { return it.t + ':' + itemId(it); }

  var favs = store.get('favs', []);
  function isFav(it) {
    var k = favKey(it);
    for (var i = 0; i < favs.length; i++) if (favs[i].t + ':' + favs[i].id === k) return true;
    return false;
  }
  function toggleFav(it) {
    if (!it || !KIND_LABEL[it.t]) return;
    var k = favKey(it);
    var before = favs.length;
    favs = favs.filter(function (f) { return f.t + ':' + f.id !== k; });
    if (favs.length === before) {
      favs.push({ t: it.t, id: itemId(it), s: snapshot(it) });
      Util.toast('⭐ اتضافت للمفضلة: ' + it.s.name);
    } else {
      Util.toast('اتشالت من المفضلة: ' + it.s.name);
    }
    store.set('favs', favs);
    if (itemList) itemList.refresh();
    if (section === 'fav' && screen === 'browse') openSection('fav', true);
  }
  function snapshot(it) {
    var s = it.s;
    return {
      name: s.name, num: s.num, stream_id: s.stream_id, series_id: s.series_id,
      stream_icon: s.stream_icon, cover: s.cover, container_extension: s.container_extension,
      epg_channel_id: s.epg_channel_id
    };
  }

  function posKey(kind, id) { return 'pos.' + kind + '.' + id; }

  /* ---------------- Rendering ---------------- */

  function renderRow(it) {
    var row = el('div', 'row');
    if (it.t === 'setting') {
      row.appendChild(el('span', 'name', it.label));
      if (it.value) row.appendChild(el('span', 'count', it.value));
      return row;
    }
    if (it.t === 'cat') {
      row.appendChild(el('span', 'name', it.name));
      row.appendChild(el('span', 'count', String(it.count)));
      return row;
    }
    if (it.t === 'season') {
      row.appendChild(el('span', 'name', 'الموسم ' + it.season));
      row.appendChild(el('span', 'count', String(it.count)));
      return row;
    }
    if (it.t === 'episode') {
      var ep = it.s;
      row.appendChild(el('span', 'num', String(ep.episode_num || '')));
      row.appendChild(el('span', 'name', ep.title || ('الحلقة ' + ep.episode_num)));
      if (store.get(posKey('episode', ep.id), 0)) row.appendChild(el('span', 'count', '▶ مكمّل'));
      return row;
    }
    var s = it.s;
    if (it.t === 'live') row.appendChild(el('span', 'num', s.num ? String(s.num) : ''));
    var icon = s.stream_icon || s.cover;
    if (icon) {
      var img = el('img', 'logo');
      img.onerror = function () { img.style.visibility = 'hidden'; };
      img.src = icon;
      row.appendChild(img);
    }
    row.appendChild(el('span', 'name', s.name));
    if (section === 'fav' || section === 'search') row.appendChild(el('span', 'tag', KIND_LABEL[it.t]));
    if (isFav(it)) row.appendChild(el('span', 'fav-star', '★'));
    if (play && play.item && play.kind === 'live' && it.t === 'live' && it.s.stream_id === play.item.s.stream_id) {
      row.classList.add('current');
    }
    return row;
  }

  function renderCard(it) {
    var card = el('div', 'card');
    var poster = el('div', 'poster');
    var icon = it.s.stream_icon || it.s.cover;
    if (icon) poster.style.backgroundImage = 'url("' + String(icon).replace(/"/g, '%22') + '")';
    else poster.textContent = '🎬';
    card.appendChild(poster);
    card.appendChild(el('div', 'title', (isFav(it) ? '★ ' : '') + it.s.name));
    return card;
  }

  /* ---------------- Data ---------------- */

  function loadKind(kind) {
    if (data[kind]) return Promise.resolve(data[kind]);
    Util.loading(true, { live: 'بنحمّل القنوات...', vod: 'بنحمّل الأفلام...', series: 'بنحمّل المسلسلات...' }[kind]);
    return Promise.all([api.categories(kind), api.streams(kind)]).then(function (r) {
      var cats = r[0], streams = r[1];
      var byCat = {}, all = [];
      if (kind === 'live') {
        streams.sort(function (a, b) { return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0); });
      }
      streams.forEach(function (s) {
        var it = { t: kind, s: s };
        all.push(it);
        var c = String(s.category_id);
        (byCat[c] = byCat[c] || []).push(it);
      });
      var catItems = [{ t: 'cat', id: '*', name: 'الكل', count: all.length }];
      cats.forEach(function (c) {
        var list = byCat[String(c.category_id)];
        if (list && list.length) catItems.push({ t: 'cat', id: String(c.category_id), name: c.category_name, count: list.length });
      });
      data[kind] = { cats: catItems, byCat: byCat, all: all };
      Util.loading(false);
      return data[kind];
    }, function (err) {
      Util.loading(false);
      Util.toast('تعذّر تحميل البيانات من السيرفر. جرّب تاني.', 4000);
      throw err;
    });
  }

  /* ---------------- Browse screen ---------------- */

  function buildMenu() {
    var nav = $('menu');
    nav.innerHTML = '';
    MENU.forEach(function (m, i) {
      var n = el('div', 'menu-item', m.label);
      n.addEventListener('click', function () { menuIndex = i; renderMenu(); enterSection(); });
      n.addEventListener('mouseover', function () { setZone('menu'); menuIndex = i; renderMenu(); });
      nav.appendChild(n);
    });
  }

  function renderMenu() {
    var nodes = $('menu').children;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('focused', i === menuIndex);
      nodes[i].classList.toggle('zone-on', zone === 'menu' && i === menuIndex);
      nodes[i].classList.toggle('selected', MENU[i].id === section);
    }
  }

  function setZone(z) {
    zone = z;
    catList.setActive(z === 'cats');
    rowList.setActive(z === 'items');
    gridList.setActive(z === 'items');
    seasonList.setActive(z === 'seasons');
    episodeList.setActive(z === 'episodes');
    var input = $('search-input');
    if (z === 'search') input.focus(); else if (document.activeElement === input) input.blur();
    renderMenu();
  }

  function useGrid(on) {
    show($('items-grid'), on);
    show($('items-list'), !on);
    itemList = on ? gridList : rowList;
  }

  function setItems(items, title, emptyText) {
    $('items-title').textContent = title || '';
    show($('items-empty'), !items.length && !!emptyText);
    $('items-empty').textContent = emptyText || '';
    itemList.setItems(items, 0);
  }

  function showCategory(cat) {
    var d = data[section];
    if (!d || !cat) return;
    var items = cat.id === '*' ? d.all : (d.byCat[cat.id] || []);
    setItems(items, cat.name + ' (' + items.length + ')', 'مفيش حاجة هنا');
    store.set('cat.' + section, cat.id);
  }

  function enterSection() {
    var id = MENU[menuIndex].id;
    openSection(id).then(function () {
      if (id === 'search') setZone('search');
      else if (id === 'live' || id === 'vod' || id === 'series') setZone('cats');
      else if (itemList.items.length) setZone('items');
    });
  }

  function openSection(id, keepIndex) {
    section = id;
    renderMenu();
    var columns = id === 'live' || id === 'vod' || id === 'series';
    show($('cats'), columns);
    show($('search-input'), id === 'search');
    useGrid(id === 'vod' || id === 'series');

    if (columns) {
      $('cats-title').textContent = MENU[menuIndex].label;
      catList.setItems([], 0);
      setItems([], '');
      return loadKind(id).then(function (d) {
        if (section !== id) return;
        var saved = store.get('cat.' + id, '*'), idx = 0;
        d.cats.forEach(function (c, i) { if (c.id === saved) idx = i; });
        catList.setItems(d.cats, idx);
        showCategory(d.cats[idx]);
      }, function () {});
    }
    if (id === 'fav') {
      var prev = keepIndex ? itemList.index : 0;
      var items = favs.map(function (f) { return { t: f.t, s: f.s }; });
      setItems(items, 'المفضلة', 'لسه مفيش حاجة في المفضلة. اضغط OK مطوّل (أو الزرار الأصفر) على أي قناة أو فيلم أو مسلسل عشان تضيفه.');
      if (keepIndex) itemList.setIndex(prev, true);
      return Promise.resolve();
    }
    if (id === 'search') {
      setItems([], 'بحث', 'اكتب في الخانة اللي فوق');
      return loadKind('live').then(function () { return loadKind('vod'); })
        .then(function () { return loadKind('series'); })
        .then(function () { runSearch(); }, function () {});
    }
    if (id === 'settings') {
      setItems(settingsItems(), 'الإعدادات');
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  function runSearch() {
    var q = $('search-input').value.trim().toLowerCase();
    if (q.length < 2) { setItems([], 'بحث', 'اكتب حرفين على الأقل'); return; }
    var out = [];
    ['live', 'vod', 'series'].forEach(function (kind) {
      var d = data[kind];
      if (!d) return;
      for (var i = 0; i < d.all.length && out.length < 400; i++) {
        var name = d.all[i].s.name;
        if (name && String(name).toLowerCase().indexOf(q) !== -1) out.push(d.all[i]);
      }
    });
    setItems(out, 'نتايج البحث (' + out.length + ')', 'مالقيناش حاجة بالاسم ده');
  }

  function settingsItems() {
    var fmt = store.get('liveFormat', 'm3u8');
    var u = (account && account.user_info) || {};
    var exp = u.exp_date ? new Date(parseInt(u.exp_date, 10) * 1000).toLocaleDateString('ar-EG') : 'غير محدد';
    return [
      { t: 'setting', id: 'format', label: 'صيغة البث المباشر', value: fmt === 'ts' ? 'TS' : 'HLS (m3u8)' },
      { t: 'setting', id: 'reload', label: 'تحديث القوائم من السيرفر' },
      { t: 'setting', id: 'info', label: 'الاشتراك ينتهي', value: exp },
      { t: 'setting', id: 'info', label: 'عدد الأجهزة المسموح', value: String(u.max_connections || '-') },
      { t: 'setting', id: 'info', label: 'السيرفر', value: api ? api.server : '' },
      { t: 'setting', id: 'logout', label: 'تسجيل الخروج' }
    ];
  }

  function runSetting(it) {
    if (it.id === 'format') {
      store.set('liveFormat', store.get('liveFormat', 'm3u8') === 'ts' ? 'm3u8' : 'ts');
      var i = itemList.index;
      setItems(settingsItems(), 'الإعدادات');
      itemList.setIndex(i, true);
    } else if (it.id === 'reload') {
      data = {};
      Util.toast('هيتم تحميل القوائم من جديد لما تفتحها');
    } else if (it.id === 'logout') {
      store.remove('creds');
      data = {};
      api = null;
      showLogin('');
    }
  }

  function activate(it, list, index) {
    if (!it) return;
    if (it.t === 'live') {
      var lives = [], at = 0;
      list.forEach(function (x, i) { if (x.t === 'live') { if (i === index) at = lives.length; lives.push(x); } });
      playLive(lives, at);
    } else if (it.t === 'vod') {
      playVod({ kind: 'vod', item: it, url: api.movieUrl(it.s.stream_id, it.s.container_extension), id: it.s.stream_id, title: it.s.name, icon: it.s.stream_icon });
    } else if (it.t === 'series') {
      openSeries(it);
    } else if (it.t === 'setting') {
      runSetting(it);
    }
  }

  function browseKey(k) {
    if (zone === 'menu') {
      if (k === K.UP && menuIndex > 0) { menuIndex--; renderMenu(); }
      else if (k === K.DOWN && menuIndex < MENU.length - 1) { menuIndex++; renderMenu(); }
      else if (k === NEXT || k === K.ENTER) enterSection();
      else if (k === K.BACK || k === K.ESC) tryExit();
      return;
    }
    if (zone === 'search') {
      if (k === K.DOWN && itemList.items.length) setZone('items');
      else if (k === K.BACK || k === K.ESC || k === K.UP) setZone('menu');
      return;
    }
    if (zone === 'cats') {
      if (k === K.UP) catList.move(-1, 0);
      else if (k === K.DOWN) catList.move(1, 0);
      else if (k === K.CH_UP) catList.page(-1);
      else if (k === K.CH_DOWN) catList.page(1);
      else if ((k === NEXT || k === K.ENTER) && itemList.items.length) setZone('items');
      else if (k === PREV || k === K.BACK || k === K.ESC) setZone('menu');
      return;
    }
    if (zone === 'items') {
      var moved = true;
      if (k === K.UP) moved = itemList.move(-1, 0);
      else if (k === K.DOWN) itemList.move(1, 0);
      else if (k === K.CH_UP) itemList.page(-1);
      else if (k === K.CH_DOWN) itemList.page(1);
      else if (k === NEXT) itemList.move(0, 1);
      else if (k === PREV) moved = itemList.move(0, -1);
      else if (k === K.YELLOW) toggleFav(itemList.current());
      else if (k === K.BACK || k === K.ESC) moved = false;

      if (!moved) {
        if (k === K.UP && section === 'search') setZone('search');
        else if (k !== K.UP) setZone($('cats').classList.contains('hidden') ? 'menu' : 'cats');
      }
    }
  }

  function browseSelect() {
    if (zone === 'items') activate(itemList.current(), itemList.items, itemList.index);
    else browseKey(K.ENTER);
  }

  function tryExit() {
    var now = Date.now();
    if (now - exitArmed < 2500) { window.close(); return; }
    exitArmed = now;
    Util.toast('اضغط رجوع تاني عشان تخرج من التطبيق');
  }

  /* ---------------- Series screen ---------------- */

  function openSeries(it) {
    Util.loading(true, 'بنحمّل الحلقات...');
    api.seriesInfo(it.s.series_id).then(function (info) {
      Util.loading(false);
      var eps = (info && info.episodes) || {};
      var seasons = Object.keys(eps).sort(function (a, b) { return a - b; }).map(function (n) {
        return { t: 'season', season: n, count: (eps[n] || []).length };
      });
      if (!seasons.length) { Util.toast('مفيش حلقات متاحة للمسلسل ده'); return; }
      var meta = (info && info.info) || {};
      seriesCtx = { item: it, eps: eps };
      $('series-name').textContent = it.s.name;
      $('series-plot').textContent = meta.plot || '';
      var cover = $('series-cover'), src = meta.cover || it.s.cover;
      cover.style.visibility = src ? 'visible' : 'hidden';
      cover.onerror = function () { cover.style.visibility = 'hidden'; };
      if (src) cover.src = src; else cover.removeAttribute('src');
      showScreen('series');
      seasonList.setItems(seasons, store.get('season.' + it.s.series_id, 0));
      showSeason(seasonList.current());
      setZone('episodes');
    }, function () {
      Util.loading(false);
      Util.toast('تعذّر تحميل بيانات المسلسل');
    });
  }

  function showSeason(season) {
    if (!season || !seriesCtx) return;
    store.set('season.' + seriesCtx.item.s.series_id, seasonList.index);
    var list = (seriesCtx.eps[season.season] || []).map(function (ep) { return { t: 'episode', s: ep }; });
    episodeList.setItems(list, 0);
  }

  function playEpisode(index) {
    var it = episodeList.items[index];
    if (!it) return;
    var ep = it.s;
    playVod({
      kind: 'episode', item: seriesCtx.item, url: api.episodeUrl(ep.id, ep.container_extension), id: ep.id,
      title: seriesCtx.item.s.name + ' • ' + (ep.title || ('الحلقة ' + ep.episode_num)),
      icon: seriesCtx.item.s.cover, episodeIndex: index
    });
  }

  function seriesKey(k) {
    if (zone === 'seasons') {
      if (k === K.UP) seasonList.move(-1, 0);
      else if (k === K.DOWN) seasonList.move(1, 0);
      else if (k === NEXT || k === K.ENTER) setZone('episodes');
      else if (k === K.BACK || k === K.ESC || k === PREV) closeSeries();
    } else {
      if (k === K.UP) episodeList.move(-1, 0);
      else if (k === K.DOWN) episodeList.move(1, 0);
      else if (k === K.CH_UP) episodeList.page(-1);
      else if (k === K.CH_DOWN) episodeList.page(1);
      else if (k === K.ENTER) playEpisode(episodeList.index);
      else if (k === PREV) setZone('seasons');
      else if (k === K.YELLOW) toggleFav(seriesCtx.item);
      else if (k === K.BACK || k === K.ESC) closeSeries();
    }
  }

  function closeSeries() {
    showScreen('browse');
    setZone('items');
  }

  /* ---------------- Player ---------------- */

  var osdTimer = null;
  function showOsd(ms) {
    show($('osd'), true);
    clearTimeout(osdTimer);
    if (ms !== 0) osdTimer = setTimeout(function () { show($('osd'), false); }, ms || 5000);
  }

  function playLive(list, index) {
    var it = list[index];
    if (!it) return;
    returnScreen = screen === 'player' ? returnScreen : screen;
    play = { kind: 'live', list: list, index: index, item: it, triedTs: false };
    showScreen('player');
    show($('osd-progress'), false);
    var useTs = store.get('liveFormat', 'm3u8') === 'ts';
    play.ts = useTs;
    Player.play(api.liveUrl(it.s.stream_id, useTs ? 'ts' : 'm3u8'), { live: true, ts: useTs });
    store.set('lastLive', it.s.stream_id);

    $('osd-num').textContent = it.s.num || (index + 1);
    $('osd-title').textContent = it.s.name;
    $('osd-epg').textContent = '';
    setLogo(it.s.stream_icon);
    showOsd();
    loadEpg(it);
  }

  function setLogo(src) {
    var logo = $('osd-logo');
    logo.style.visibility = src ? 'visible' : 'hidden';
    logo.onerror = function () { logo.style.visibility = 'hidden'; };
    if (src) logo.src = src; else logo.removeAttribute('src');
  }

  var epgFor = null;
  function loadEpg(it) {
    var id = it.s.stream_id;
    epgFor = id;
    api.shortEpg(id).then(function (list) {
      if (epgFor !== id || !list.length) return;
      var now = list[0], next = list[1];
      var txt = 'دلوقتي: ' + Util.b64(now.title) + ' (' + Util.clock(now.start_timestamp) + ' - ' + Util.clock(now.stop_timestamp) + ')';
      if (next) txt += '   •   بعدها: ' + Util.b64(next.title);
      $('osd-epg').textContent = txt;
    }, function () {});
  }

  function zap(delta) {
    if (!play || play.kind !== 'live') return;
    var n = play.list.length;
    playLive(play.list, (play.index + delta + n) % n);
  }

  function playVod(ctx) {
    returnScreen = screen === 'player' ? returnScreen : screen;
    play = ctx;
    showScreen('player');
    var startAt = store.get(posKey(ctx.kind, ctx.id), 0);
    Player.play(ctx.url, { startAt: startAt });
    if (startAt) Util.toast('هنكمّل من ' + Util.fmtTime(startAt));
    $('osd-num').textContent = '';
    $('osd-title').textContent = ctx.title;
    $('osd-epg').textContent = '';
    setLogo(null);
    show($('osd-progress'), true);
    updateProgress();
    showOsd();
  }

  var lastSave = 0;
  function updateProgress() {
    if (!play || play.kind === 'live') return;
    var cur = Player.time(), dur = Player.duration();
    $('osd-cur').textContent = Util.fmtTime(cur);
    $('osd-dur').textContent = Util.fmtTime(dur);
    $('osd-bar').style.width = dur ? (cur / dur * 100) + '%' : '0';
    if (Date.now() - lastSave > 10000) { lastSave = Date.now(); savePosition(); }
  }

  function savePosition() {
    if (!play || play.kind === 'live') return;
    var cur = Player.time(), dur = Player.duration(), key = posKey(play.kind, play.id);
    if (dur && cur > 60 && cur < dur * 0.95) store.set(key, Math.floor(cur));
    else if (dur && cur >= dur * 0.95) store.remove(key);
  }

  function onPlayerError() {
    if (!play) return;
    if (play.kind === 'live' && !play.ts && !play.triedTs) {
      // Some providers only serve MPEG-TS: retry the same channel once that way
      play.triedTs = true;
      play.ts = true;
      Util.toast('بنجرّب صيغة تانية للقناة...');
      Player.play(api.liveUrl(play.item.s.stream_id, 'ts'), { live: true, ts: true });
      return;
    }
    Util.toast(play.kind === 'live' ? 'القناة دي مش شغالة دلوقتي' : 'تعذّر تشغيل الفيديو', 4000);
  }

  function onEnded() {
    if (!play || play.kind === 'live') return;
    store.remove(posKey(play.kind, play.id));
    if (play.kind === 'episode' && play.episodeIndex + 1 < episodeList.items.length) {
      episodeList.setIndex(play.episodeIndex + 1, true);
      playEpisode(play.episodeIndex + 1);
      return;
    }
    closePlayer();
  }

  function closePlayer() {
    savePosition();
    Player.stop();
    show($('zap-list'), false);
    show($('osd'), false);
    var wasEpisode = play && play.kind === 'episode';
    showScreen(returnScreen);
    if (returnScreen === 'series') {
      if (wasEpisode) episodeList.refresh();
      setZone('episodes');
    } else {
      itemList.refresh();
      setZone('items');
    }
  }

  var numBuf = '', numTimer = null;
  function numberKey(d) {
    numBuf = (numBuf + d).slice(-4);
    var box = $('num-input');
    box.textContent = numBuf;
    show(box, true);
    clearTimeout(numTimer);
    numTimer = setTimeout(function () {
      show(box, false);
      var n = parseInt(numBuf, 10);
      numBuf = '';
      var idx = -1;
      play.list.forEach(function (it, i) { if (idx < 0 && parseInt(it.s.num, 10) === n) idx = i; });
      if (idx < 0 && n >= 1 && n <= play.list.length) idx = n - 1;
      if (idx >= 0) playLive(play.list, idx); else Util.toast('مفيش قناة رقم ' + n);
    }, 1500);
  }

  function openZap() {
    $('zap-title').textContent = 'القنوات (' + play.list.length + ')';
    show($('zap-list'), true);
    zapList.setItems(play.list, play.index);
    zapList.setActive(true);
    show($('osd'), false);
  }

  function playerKey(k) {
    if (!play) return;
    var zapOpen = !$('zap-list').classList.contains('hidden');

    if (play.kind === 'live') {
      if (zapOpen) {
        if (k === K.UP) zapList.move(-1, 0);
        else if (k === K.DOWN) zapList.move(1, 0);
        else if (k === K.CH_UP) zapList.page(-1);
        else if (k === K.CH_DOWN) zapList.page(1);
        else if (k === K.ENTER) { show($('zap-list'), false); playLive(play.list, zapList.index); }
        else if (k === K.YELLOW) toggleFav(zapList.current());
        else if (k === K.BACK || k === K.ESC || k === PREV) show($('zap-list'), false);
        return;
      }
      if (k === K.UP || k === K.CH_DOWN) zap(-1);
      else if (k === K.DOWN || k === K.CH_UP) zap(1);
      else if (k === K.ENTER || k === NEXT) openZap();
      else if (k === PREV) showOsd();
      else if (k === K.YELLOW) toggleFav(play.item);
      else if (k >= 48 && k <= 57) numberKey(String(k - 48));
      else if (k === K.BACK || k === K.ESC || k === K.STOP) closePlayer();
      return;
    }

    // Movies and episodes: the timeline runs left-to-right, so RIGHT always means forward
    if (k === K.ENTER || k === K.PLAY_PAUSE || k === K.PLAY || k === K.PAUSE) {
      var paused = Player.togglePause();
      showOsd(paused ? 0 : 4000);
    } else if (k === K.RIGHT) { Player.seek(10); showOsd(); }
    else if (k === K.LEFT) { Player.seek(-10); showOsd(); }
    else if (k === K.FF) { Player.seek(60); showOsd(); }
    else if (k === K.RW) { Player.seek(-60); showOsd(); }
    else if (k === K.UP || k === K.DOWN) showOsd();
    else if (k === K.YELLOW) toggleFav(play.item);
    else if (k === K.BACK || k === K.ESC || k === K.STOP) closePlayer();
    updateProgress();
  }

  /* ---------------- Login ---------------- */

  var loginFields = ['in-server', 'in-user', 'in-pass', 'btn-login'];
  var loginIndex = 0;

  function showLogin(error) {
    var c = store.get('creds', {});
    $('in-server').value = c.server || '';
    $('in-user').value = c.username || '';
    $('in-pass').value = c.password || '';
    $('login-error').textContent = error || '';
    showScreen('login');
    loginIndex = c.server ? 3 : 0;
    focusLogin();
  }

  function focusLogin() {
    loginFields.forEach(function (id, i) { $(id).classList.toggle('focused', i === loginIndex); });
    $(loginFields[loginIndex]).focus();
  }

  function doLogin() {
    var creds = { server: $('in-server').value, username: $('in-user').value, password: $('in-pass').value };
    if (!creds.server.trim() || !creds.username.trim() || !creds.password.trim()) {
      $('login-error').textContent = 'كمّل كل الخانات الأول';
      return;
    }
    $('btn-login').blur();
    connect(creds, true);
  }

  function connect(creds, fromForm) {
    var client = new Xtream(creds);
    Util.loading(true, 'بنتصل بالسيرفر...');
    client.login().then(function (info) {
      Util.loading(false);
      api = client;
      account = info;
      store.set('creds', { server: client.server, username: client.username, password: client.password });
      data = {};
      showScreen('browse');
      menuIndex = 0;
      openSection('live').then(function () { setZone('cats'); });
    }, function (err) {
      Util.loading(false);
      var msg = err && err.message === 'auth'
        ? 'اسم المستخدم أو كلمة السر غلط، أو الاشتراك منتهي'
        : 'تعذّر الاتصال بالسيرفر. اتأكد من العنوان والنت.';
      if (fromForm) $('login-error').textContent = msg;
      else showLogin(msg);
    });
  }

  function loginKey(k, e) {
    if (k === K.UP && loginIndex > 0) { loginIndex--; focusLogin(); e.preventDefault(); }
    else if (k === K.DOWN && loginIndex < loginFields.length - 1) { loginIndex++; focusLogin(); e.preventDefault(); }
    else if (k === K.ENTER) {
      e.preventDefault();
      if (loginIndex === loginFields.length - 1) doLogin();
      else { loginIndex++; focusLogin(); }
    } else if (k === K.BACK) tryExit();
  }

  /* ---------------- Screens & keys ---------------- */

  function showScreen(name) {
    screen = name;
    ['login', 'browse', 'series', 'player'].forEach(function (s) { show($(s), s === name); });
    // Lists measure themselves, so redraw once their screen is visible
    if (name === 'browse') { catList.setIndex(catList.index, true); itemList.setIndex(itemList.index, true); }
    if (name === 'series') { seasonList.setIndex(seasonList.index, true); episodeList.setIndex(episodeList.index, true); }
  }

  // OK pressed and held = favorite; short press = select
  var enterTimer = null, enterLong = false;

  function onKeyDown(e) {
    var k = e.keyCode;
    if (!$('loading').classList.contains('hidden')) {
      if (k === K.BACK) e.preventDefault();
      return;
    }
    if (screen === 'login') { loginKey(k, e); return; }
    if (screen === 'browse' && zone === 'search' && k !== K.DOWN && k !== K.UP && k !== K.BACK && k !== K.ESC) return;
    e.preventDefault();

    if (k === K.ENTER && (screen === 'browse' || screen === 'series')) {
      if (e.repeat || enterTimer) return;
      enterLong = false;
      enterTimer = setTimeout(function () {
        enterTimer = null;
        enterLong = true;
        if (screen === 'browse' && zone === 'items') toggleFav(itemList.current());
        else if (screen === 'series') toggleFav(seriesCtx.item);
      }, 700);
      return;
    }
    dispatch(k);
  }

  function onKeyUp(e) {
    if (e.keyCode !== K.ENTER || !(screen === 'browse' || screen === 'series')) return;
    if (zone === 'search') return;
    if (enterTimer) {
      clearTimeout(enterTimer);
      enterTimer = null;
      if (!enterLong) dispatch(K.ENTER);
    }
  }

  function dispatch(k) {
    if (screen === 'browse') { if (k === K.ENTER) browseSelect(); else browseKey(k); }
    else if (screen === 'series') seriesKey(k);
    else if (screen === 'player') playerKey(k);
  }

  /* ---------------- Init ---------------- */

  function init() {
    catList = new VList($('cats-list'), {
      rowHeight: 3.4,
      render: renderRow,
      onFocus: Util.debounce(function (c) { showCategory(c); }, 250),
      onSelect: function (c) { showCategory(c); setZone('items'); },
      onHover: function () { setZone('cats'); }
    });
    rowList = new VList($('items-list'), {
      rowHeight: 3.6,
      render: renderRow,
      onSelect: function (it, i) { setZone('items'); activate(it, rowList.items, i); },
      onHover: function () { setZone('items'); }
    });
    gridList = new VList($('items-grid'), {
      rowHeight: 17,
      columns: 6,
      render: renderCard,
      onSelect: function (it, i) { setZone('items'); activate(it, gridList.items, i); },
      onHover: function () { setZone('items'); }
    });
    itemList = rowList;
    seasonList = new VList($('seasons-list'), {
      rowHeight: 3.4,
      render: renderRow,
      onFocus: function (s) { showSeason(s); },
      onSelect: function () { setZone('episodes'); },
      onHover: function () { setZone('seasons'); }
    });
    episodeList = new VList($('episodes-list'), {
      rowHeight: 3.6,
      render: renderRow,
      onSelect: function (it, i) { playEpisode(i); },
      onHover: function () { setZone('episodes'); }
    });
    zapList = new VList($('zap-items'), {
      rowHeight: 3.6,
      render: renderRow,
      onSelect: function (it, i) { show($('zap-list'), false); playLive(play.list, i); }
    });

    Player.init({ onError: onPlayerError, onEnded: onEnded, onTime: updateProgress });

    buildMenu();
    $('search-input').addEventListener('input', Util.debounce(runSearch, 400));
    $('btn-login').addEventListener('click', doLogin);
    loginFields.forEach(function (id, i) {
      $(id).addEventListener('focus', function () {
        loginIndex = i;
        loginFields.forEach(function (f, j) { $(f).classList.toggle('focused', j === i); });
      });
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Free the stream (and the provider's connection slot) while the app is in the background
    document.addEventListener('visibilitychange', function () {
      if (screen !== 'player' || !play) return;
      if (document.hidden) { savePosition(); Player.stop(); }
      else if (play.kind === 'live') playLive(play.list, play.index);
      else playVod(play);
    });

    var creds = store.get('creds', null);
    if (creds && creds.server) connect(creds, false);
    else showLogin('');
  }

  init();
})();
