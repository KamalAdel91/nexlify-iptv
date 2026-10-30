/* App controller: screens, remote-control navigation, sections. */
(function () {
  'use strict';

  var K = Util.KEY, $ = Util.$, el = Util.el, show = Util.show, store = Util.store, t = I18n.t;

  // "Next" is the arrow that moves deeper into the layout: left in Arabic (RTL), right in English.
  var NEXT, PREV;
  function applyDir() {
    NEXT = I18n.rtl() ? K.LEFT : K.RIGHT;
    PREV = I18n.rtl() ? K.RIGHT : K.LEFT;
  }

  var ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    live: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/>',
    vod: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5"/>',
    series: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    fav: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'
  };
  var MENU = ['home', 'live', 'vod', 'series', 'fav', 'search', 'settings'];

  var api = null, account = null;
  var screen = 'login';
  var zone = 'menu';           // browse: menu | cats | items | search ; series: seasons | episodes ; details: actions
  var menuIndex = 0, section = null;
  var data = {};               // kind -> { cats, byCat, all }
  var catList, rowList, gridList, itemList;  // itemList is whichever of rowList/gridList is showing
  var seasonList, episodeList, zapList;
  var seriesCtx = null;        // { item, eps }
  var detailsCtx = null;       // { item, actions, index }
  var play = null;             // current playback context
  var returnScreen = 'browse';
  var exitArmed = 0;

  /* ---------------- Saved state: favorites, recents, positions ---------------- */

  function itemId(it) { return it.t === 'series' ? it.s.series_id : it.s.stream_id; }

  function snapshot(s) {
    return {
      name: s.name, num: s.num, stream_id: s.stream_id, series_id: s.series_id,
      stream_icon: s.stream_icon, cover: s.cover, container_extension: s.container_extension,
      rating: s.rating, category_id: s.category_id
    };
  }

  function findIn(list, kind, id) {
    for (var i = 0; i < list.length; i++) if (list[i].t === kind && String(list[i].id) === String(id)) return i;
    return -1;
  }

  // Keeps a most-recent-first list of { t, id, s } in storage
  function touch(key, kind, s, extra, max) {
    var list = store.get(key, []);
    var id = kind === 'series' ? s.series_id : s.stream_id;
    var i = findIn(list, kind, id);
    if (i >= 0) list.splice(i, 1);
    var entry = { t: kind, id: id, s: snapshot(s) };
    if (extra) Object.keys(extra).forEach(function (k) { entry[k] = extra[k]; });
    list.unshift(entry);
    store.set(key, list.slice(0, max || 30));
  }

  function drop(key, kind, id) {
    var list = store.get(key, []);
    var i = findIn(list, kind, id);
    if (i >= 0) { list.splice(i, 1); store.set(key, list); }
  }

  var favs = store.get('favs', []);
  function isFav(it) { return findIn(favs, it.t, itemId(it)) >= 0; }

  function toggleFav(it) {
    if (!it || ['live', 'vod', 'series'].indexOf(it.t) < 0) return;
    var i = findIn(favs, it.t, itemId(it));
    if (i >= 0) {
      favs.splice(i, 1);
      Util.toast('☆  ' + t('fav_removed', { name: it.s.name }));
    } else {
      favs.push({ t: it.t, id: itemId(it), s: snapshot(it.s) });
      Util.toast('★  ' + t('fav_added', { name: it.s.name }));
    }
    store.set('favs', favs);
    if (screen === 'browse' && section === 'fav') openSection('fav', true);
    else if (screen === 'browse' && section === 'home') buildHome();
    else if (itemList) itemList.refresh();
    if (screen === 'details') renderActions();
  }

  function posKey(kind, id) { return 'pos.' + kind + '.' + id; }

  function continuePct(kind, id) {
    var list = store.get('continue', []), i = findIn(list, kind, id);
    return i >= 0 ? (list[i].pct || 0) : 0;
  }

  /* ---------------- Rendering ---------------- */

  function initials(name) {
    return String(name || '?').replace(/^[^0-9A-Za-z؀-ۿ]+/, '').slice(0, 2).toUpperCase() || '?';
  }

  function logoBox(src, name, cls) {
    var box = el('div', cls);
    if (src) {
      var img = el('img');
      img.onerror = function () { box.innerHTML = ''; box.appendChild(el('span', 'ph', initials(name))); };
      img.src = src;
      box.appendChild(img);
    } else {
      box.appendChild(el('span', 'ph', initials(name)));
    }
    return box;
  }

  function renderRow(it) {
    var row = el('div', 'row');
    if (it.t === 'setting') {
      row.appendChild(el('span', 'name', it.label));
      if (it.value) row.appendChild(el('span', 'count', it.value));
      return row;
    }
    if (it.t === 'cat') {
      row.appendChild(el('span', 'name', it.key ? t(it.key) : it.name));
      row.appendChild(el('span', 'count', String(it.count)));
      return row;
    }
    if (it.t === 'season') {
      row.appendChild(el('span', 'name', t('season', { n: it.season })));
      row.appendChild(el('span', 'count', String(it.count)));
      return row;
    }
    if (it.t === 'episode') {
      var ep = it.s;
      row.appendChild(el('span', 'num', String(ep.episode_num || '')));
      row.appendChild(el('span', 'name', ep.title || t('episode', { n: ep.episode_num })));
      if (store.get(posKey('episode', ep.id), 0)) row.appendChild(el('span', 'tag', t('resume_badge')));
      return row;
    }
    var s = it.s;
    if (it.t === 'live') row.appendChild(el('span', 'num', s.num ? String(s.num) : ''));
    row.appendChild(logoBox(s.stream_icon || s.cover, s.name, 'logo'));
    row.appendChild(el('span', 'name', s.name));
    if (section === 'fav' || section === 'search') row.appendChild(el('span', 'tag', t('kind_' + it.t)));
    if (isFav(it)) row.appendChild(el('span', 'fav-star', '★'));
    if (play && play.kind === 'live' && it.t === 'live' && String(it.s.stream_id) === String(play.item.s.stream_id)) {
      row.classList.add('current');
    }
    return row;
  }

  function cssUrl(u) { return 'url("' + String(u).replace(/"/g, '%22') + '")'; }

  function renderCard(it) {
    var s = it.s, card = el('div', 'card'), poster = el('div', 'poster');
    var icon = s.stream_icon || s.cover;
    if (icon) poster.style.backgroundImage = cssUrl(icon);
    else {
      var ph = el('div', 'ph');
      ph.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[it.t === 'series' ? 'series' : 'vod'] + '</svg>';
      poster.appendChild(ph);
    }
    var rating = parseFloat(s.rating);
    if (rating > 0) poster.appendChild(el('div', 'rating', '★ ' + (Math.round(rating * 10) / 10)));
    if (isFav(it)) poster.appendChild(el('div', 'fav', '★'));
    var shade = el('div', 'shade');
    shade.appendChild(el('div', 'title', s.name));
    poster.appendChild(shade);
    var pct = continuePct(it.t, itemId(it));
    if (pct) {
      var line = el('div', 'progress-line'), fill = el('div');
      fill.style.width = Math.round(pct * 100) + '%';
      line.appendChild(fill);
      poster.appendChild(line);
    }
    card.appendChild(poster);
    return card;
  }

  /* ---------------- Clock & EPG ---------------- */

  function tick() {
    var now = new Date(), m = now.getMinutes();
    var hhmm = now.getHours() + ':' + (m < 10 ? '0' : '') + m;
    $('clock').textContent = hhmm;
    $('osd-clock').textContent = hhmm;
    $('date').textContent = now.toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function fmtDate(ts) {
    return new Date(parseInt(ts, 10) * 1000).toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  var epgCache = {};
  function getEpg(id) {
    var c = epgCache[id];
    if (c && Date.now() - c.at < 300000) return Promise.resolve(c.list);
    return api.shortEpg(id).then(function (list) {
      epgCache[id] = { at: Date.now(), list: list };
      return list;
    });
  }

  // Fills a now/next block: { now, bar, next } element ids
  function fillEpg(ids, list) {
    var now = list[0], next = list[1];
    if (!now) {
      $(ids.now).textContent = t('no_epg');
      $(ids.bar).style.width = '0';
      $(ids.next).textContent = '';
      return;
    }
    var start = parseInt(now.start_timestamp, 10), stop = parseInt(now.stop_timestamp, 10);
    var pct = stop > start ? (Date.now() / 1000 - start) / (stop - start) : 0;
    // Programme titles can be in either language, so isolate them from the times around them
    var nowBox = $(ids.now);
    nowBox.innerHTML = '';
    nowBox.appendChild(el('bdi', '', Util.b64(now.title)));
    nowBox.appendChild(el('span', 'time', Util.clock(start) + ' – ' + Util.clock(stop)));
    $(ids.bar).style.width = Math.max(0, Math.min(1, pct)) * 100 + '%';
    var nextBox = $(ids.next);
    nextBox.innerHTML = '';
    if (next) {
      nextBox.appendChild(el('span', '', t('next') + ': '));
      nextBox.appendChild(el('bdi', '', Util.b64(next.title)));
      nextBox.appendChild(el('span', 'time', Util.clock(next.start_timestamp)));
    }
  }

  var PV = { now: 'pv-now', bar: 'pv-bar', next: 'pv-next' };
  var OSD = { now: 'osd-now', bar: 'osd-now-bar', next: 'osd-next' };

  var previewFor = null;
  var updatePreview = Util.debounce(function () {
    var it = itemList && itemList.current();
    if (section !== 'live' || !it || it.t !== 'live') { show($('preview'), false); return; }
    show($('preview'), true);
    var box = $('pv-logo').parentNode;
    var fresh = logoBox(it.s.stream_icon, it.s.name, 'pv-logo');
    fresh.firstChild.id = 'pv-logo';
    box.parentNode.replaceChild(fresh, box);
    $('pv-name').textContent = it.s.name;
    fillEpg(PV, []);
    $('pv-now').textContent = '…';
    var id = it.s.stream_id;
    previewFor = id;
    getEpg(id).then(function (list) { if (previewFor === id) fillEpg(PV, list); }, function () {
      if (previewFor === id) fillEpg(PV, []);
    });
  }, 300);

  /* ---------------- Data ---------------- */

  var pending = {};
  function loadKind(kind, quiet) {
    if (data[kind]) return Promise.resolve(data[kind]);
    if (!quiet) Util.loading(true, t('loading_' + kind));
    if (pending[kind]) {
      // Already loading in the background: just wait for it
      if (!quiet) pending[kind].then(function () { Util.loading(false); }, function () { Util.loading(false); });
      return pending[kind];
    }
    pending[kind] = fetchKind(kind, quiet);
    return pending[kind];
  }

  function fetchKind(kind, quiet) {
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
      var catItems = [];
      cats.forEach(function (c) {
        var list = byCat[String(c.category_id)];
        if (list && list.length) catItems.push({ t: 'cat', id: String(c.category_id), name: c.category_name, count: list.length });
      });
      data[kind] = { cats: catItems, byCat: byCat, all: all };
      pending[kind] = null;
      Util.loading(false);
      return data[kind];
    }, function (err) {
      pending[kind] = null;
      Util.loading(false);
      if (!quiet) Util.toast(t('err_load'), 4000);
      throw err;
    });
  }

  function savedItems(key, kind) {
    return store.get(key, []).filter(function (e) { return e.t === kind; })
      .map(function (e) { return { t: e.t, s: e.s }; });
  }

  // Built-in categories shown above the provider's own
  function specialItems(kind, id) {
    if (id === 'recent') return savedItems('recentLive', 'live');
    if (id === 'continue') return savedItems('continue', kind);
    return [];
  }

  /* ---------------- Browse screen ---------------- */

  function buildMenu() {
    var nav = $('menu');
    nav.innerHTML = '';
    MENU.forEach(function (id, i) {
      var n = el('div', 'menu-item');
      n.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[id] + '</svg>';
      n.appendChild(el('span', '', t('menu_' + id)));
      n.addEventListener('click', function () { menuIndex = i; renderMenu(); enterSection(); });
      n.addEventListener('mouseover', function () { setZone('menu'); menuIndex = i; renderMenu(); });
      nav.appendChild(n);
    });
    renderMenu();
  }

  function renderMenu() {
    var nodes = $('menu').children;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('zone-on', zone === 'menu' && i === menuIndex);
      nodes[i].classList.toggle('selected', MENU[i] === section);
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
    $('sidebar').classList.toggle('compact', z !== 'menu');
    $('home').classList.toggle('active', z === 'home');
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
    updatePreview();
  }

  function showCategory(cat) {
    var d = data[section];
    if (!d || !cat) return;
    var items;
    if (cat.id === '*') items = d.all;
    else if (cat.key) items = specialItems(section, cat.id);
    else items = d.byCat[cat.id] || [];
    setItems(items, (cat.key ? t(cat.key) : cat.name) + '  ·  ' + items.length, t('empty'));
    store.set('cat.' + section, cat.id);
  }

  function enterSection() {
    var id = MENU[menuIndex];
    openSection(id).then(function () {
      if (id === 'home') setZone(home.rows.length ? 'home' : 'menu');
      else if (id === 'search') setZone('search');
      else if (id === 'live' || id === 'vod' || id === 'series') setZone('cats');
      else if (itemList.items.length) setZone('items');
    });
  }

  function openSection(id, keepIndex) {
    section = id;
    renderMenu();
    $('section-title').textContent = t('menu_' + id);
    show($('home'), id === 'home');
    $('browse').classList.toggle('home-mode', id === 'home');
    show(document.querySelector('.main-body'), id !== 'home');
    $('items-title').textContent = '';
    if (id === 'home') { buildHome(); return Promise.resolve(); }
    var columns = id === 'live' || id === 'vod' || id === 'series';
    show($('cats'), columns);
    show($('search-input'), id === 'search');
    show($('preview'), false);
    useGrid(id === 'vod' || id === 'series');

    if (columns) {
      catList.setItems([], 0);
      setItems([], '');
      return loadKind(id).then(function (d) {
        if (section !== id) return;
        var cats = [{ t: 'cat', id: '*', key: 'all', count: d.all.length }];
        var specialId = id === 'live' ? 'recent' : 'continue';
        var special = specialItems(id, specialId);
        if (special.length) cats.push({ t: 'cat', id: specialId, key: specialId, count: special.length });
        cats = cats.concat(d.cats);
        var saved = store.get('cat.' + id, '*'), idx = 0;
        cats.forEach(function (c, i) { if (c.id === saved) idx = i; });
        catList.setItems(cats, idx);
        showCategory(cats[idx]);
      }, function () {});
    }
    if (id === 'fav') {
      var prev = keepIndex ? itemList.index : 0;
      var items = favs.map(function (f) { return { t: f.t, s: f.s }; });
      setItems(items, items.length ? String(items.length) : '', t('fav_empty'));
      if (keepIndex) itemList.setIndex(prev, true);
      return Promise.resolve();
    }
    if (id === 'search') {
      setItems([], '', t('search_hint'));
      return loadKind('live').then(function () { return loadKind('vod'); })
        .then(function () { return loadKind('series'); })
        .then(function () { runSearch(); }, function () {});
    }
    if (id === 'settings') {
      setItems(settingsItems(), '');
      if (keepIndex) itemList.setIndex(keepIndex, true);
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  function runSearch() {
    var q = $('search-input').value.trim().toLowerCase();
    if (q.length < 2) { setItems([], '', t('search_min')); return; }
    var out = [];
    ['live', 'vod', 'series'].forEach(function (kind) {
      var d = data[kind];
      if (!d) return;
      for (var i = 0; i < d.all.length && out.length < 400; i++) {
        var name = d.all[i].s.name;
        if (name && String(name).toLowerCase().indexOf(q) !== -1) out.push(d.all[i]);
      }
    });
    setItems(out, t('search_results', { n: out.length }), t('search_none'));
  }

  function settingsItems() {
    var fmt = store.get('liveFormat', 'm3u8');
    var u = (account && account.user_info) || {};
    return [
      { t: 'setting', id: 'lang', label: t('set_lang'), value: t('set_lang_value') },
      { t: 'setting', id: 'format', label: t('set_format'), value: fmt === 'ts' ? 'TS' : 'HLS (m3u8)' },
      { t: 'setting', id: 'reload', label: t('set_reload') },
      { t: 'setting', id: 'info', label: t('set_exp'), value: u.exp_date ? fmtDate(u.exp_date) : t('unknown') },
      { t: 'setting', id: 'info', label: t('set_conn'), value: String(u.max_connections || '-') },
      { t: 'setting', id: 'info', label: t('set_server'), value: api ? api.server : '' },
      { t: 'setting', id: 'update', label: t('set_update'), value: t('set_version', { v: window.Boot ? Boot.version : '' }) },
      { t: 'setting', id: 'logout', label: t('set_logout') }
    ];
  }

  function switchLang() {
    I18n.set(I18n.lang() === 'ar' ? 'en' : 'ar');
    applyDir();
    buildMenu();
    tick();
    showExpiry();
    [catList, rowList, gridList, seasonList, episodeList, zapList].forEach(function (l) { l.refresh(); });
    if (section) $('section-title').textContent = t('menu_' + section);
    if (section === 'home') buildHome();
  }

  function runSetting(it) {
    var i = itemList.index;
    if (it.id === 'lang') {
      switchLang();
      openSection('settings', i);
    } else if (it.id === 'format') {
      store.set('liveFormat', store.get('liveFormat', 'm3u8') === 'ts' ? 'm3u8' : 'ts');
      openSection('settings', i);
    } else if (it.id === 'reload') {
      data = {};
      epgCache = {};
      Util.toast(t('set_reload_done'));
    } else if (it.id === 'update') {
      checkUpdate();
    } else if (it.id === 'logout') {
      store.remove('creds');
      data = {};
      api = null;
      showLogin('');
    }
  }

  function checkUpdate() {
    if (!window.Boot) return;
    Util.loading(true, t('update_checking'));
    Boot.check().then(function (found) {
      Util.loading(false);
      if (!found) { Util.toast(t('update_none')); return; }
      Util.toast(t('update_ready'));
      setTimeout(Boot.restart, 1500);
    }, function () {
      Util.loading(false);
      Util.toast(t('update_fail'));
    });
  }

  function activate(it, list, index) {
    if (!it) return;
    if (it.t === 'live') {
      var lives = [], at = 0;
      list.forEach(function (x, i) { if (x.t === 'live') { if (i === index) at = lives.length; lives.push(x); } });
      playLive(lives, at);
    } else if (it.t === 'vod') {
      openDetails(it);
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
    if (zone === 'home') { homeKey(k); return; }
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
    if (zone === 'home') homeKey(K.ENTER);
    else if (zone === 'items') activate(itemList.current(), itemList.items, itemList.index);
    else browseKey(K.ENTER);
  }

  function tryExit() {
    var now = Date.now();
    if (now - exitArmed < 2500) { window.close(); return; }
    exitArmed = now;
    Util.toast(t('exit_confirm'));
  }

  /* ---------------- Home ---------------- */

  // Row item sizes in rem
  var SIZES = { poster: { w: 10.5, h: 15.75 }, tile: { w: 15, h: 8.6 } };
  var GAP = 1.2;
  var home = { rows: [], r: 0 };

  function newest(kind, field) {
    var d = data[kind];
    if (!d) return [];
    return d.all.slice().sort(function (a, b) {
      return (parseInt(b.s[field], 10) || 0) - (parseInt(a.s[field], 10) || 0);
    }).slice(0, 20);
  }

  function buildHome() {
    var rows = [];
    function add(key, type, items) { if (items.length) rows.push({ key: key, type: type, items: items, i: 0, scroll: 0 }); }
    var prev = home.rows[home.r], prevKey = prev && prev.key, prevI = prev ? prev.i : 0;

    add('row_continue', 'poster', store.get('continue', []).map(function (e) { return { t: e.t, s: e.s }; }));
    add('row_recent', 'tile', savedItems('recentLive', 'live'));
    add('row_fav_live', 'tile', favs.filter(function (f) { return f.t === 'live'; }).map(function (f) { return { t: f.t, s: f.s }; }));
    add('row_fav', 'poster', favs.filter(function (f) { return f.t !== 'live'; }).map(function (f) { return { t: f.t, s: f.s }; }));
    add('row_new_vod', 'poster', newest('vod', 'added'));
    add('row_new_series', 'poster', newest('series', 'last_modified'));

    home.rows = rows;
    home.r = 0;
    rows.forEach(function (row, r) {
      if (row.key === prevKey) { home.r = r; row.i = Math.min(prevI, row.items.length - 1); }
    });
    renderHome();
  }

  var homeStartup = false;
  function refreshHome() {
    if (screen !== 'browse' || section !== 'home') return;
    buildHome();
    // On first launch the rows may arrive after the screen is shown
    if (homeStartup && zone === 'menu' && home.rows.length) setZone('home');
    homeStartup = false;
  }

  function homeCurrent() {
    var row = home.rows[home.r];
    return row ? row.items[row.i] : null;
  }

  function renderTile(it) {
    var box = el('div', 'h-box'), wrap = logoBox(it.s.stream_icon, it.s.name, 'logo-wrap');
    box.appendChild(wrap);
    box.appendChild(el('div', 't-name', it.s.name));
    return box;
  }

  function renderHome() {
    var box = $('home-rows');
    box.innerHTML = '';
    if (!home.rows.length) {
      box.appendChild(el('div', 'home-empty', t('home_loading')));
      updateHero(null);
      return;
    }
    var side = I18n.rtl() ? 'right' : 'left';
    home.rows.forEach(function (row, r) {
      var size = SIZES[row.type];
      var rowEl = el('div', 'h-row'), wrap = el('div', 'h-track-wrap'), track = el('div', 'h-track');
      rowEl.appendChild(el('div', 'h-row-title', t(row.key)));
      wrap.style.height = (size.h + 1.2) + 'rem';
      row.items.forEach(function (it, i) {
        var item = el('div', 'h-item ' + row.type);
        item.style.width = size.w + 'rem';
        item.style.height = size.h + 'rem';
        item.style[side] = i * (size.w + GAP) + 'rem';
        item.appendChild(row.type === 'tile' ? renderTile(it) : renderCard(it));
        item.addEventListener('mouseover', function () {
          if (home.r === r && row.i === i && zone === 'home') return;
          home.r = r; row.i = i; setZone('home'); focusHome();
        });
        item.addEventListener('click', function () { home.r = r; row.i = i; setZone('home'); activate(it, row.items, i); });
        track.appendChild(item);
      });
      wrap.appendChild(track);
      rowEl.appendChild(wrap);
      row.el = rowEl;
      row.track = track;
      box.appendChild(rowEl);
    });
    focusHome();
  }

  function focusHome() {
    var row = home.rows[home.r];
    if (!row) return;
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    home.rows.forEach(function (rw, r) {
      var size = SIZES[rw.type], step = size.w + GAP;
      var visible = Math.max(1, Math.floor((rw.track.parentNode.clientWidth / rem - 4 + GAP) / step));
      if (rw.i < rw.scroll) rw.scroll = rw.i;
      else if (rw.i >= rw.scroll + visible) rw.scroll = rw.i - visible + 1;
      rw.track.style.transform = 'translateX(' + (I18n.rtl() ? 1 : -1) * rw.scroll * step + 'rem)';
      var nodes = rw.track.children;
      for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('focused', r === home.r && i === rw.i);
    });
    $('home-rows').style.transform = 'translateY(' + (-row.el.offsetTop) + 'px)';
    updateHero(row.items[row.i]);
  }

  function updateHero(it) {
    var bg = $('hh-bg');
    if (!it) {
      $('hh-kind').textContent = '';
      $('hh-title').textContent = t('menu_home');
      $('hh-meta').innerHTML = '';
      bg.style.backgroundImage = 'none';
      return;
    }
    $('hh-kind').textContent = t('kind_' + it.t);
    $('hh-title').textContent = it.s.name;
    var pct = continuePct(it.t, itemId(it));
    metaLine($('hh-meta'), [
      ratingPart(it.s.rating),
      it.t === 'live' && it.s.num ? '#' + it.s.num : '',
      pct ? Math.round(pct * 100) + '%' : ''
    ]);
    var img = it.t === 'live' ? '' : (it.s.cover || it.s.stream_icon);
    bg.style.backgroundImage = img ? cssUrl(img) : 'none';
  }

  function homeKey(k) {
    var row = home.rows[home.r];
    if (!row) { if (k === PREV || k === K.BACK || k === K.ESC) setZone('menu'); return; }
    if (k === K.UP && home.r > 0) { home.r--; focusHome(); }
    else if (k === K.DOWN && home.r < home.rows.length - 1) { home.r++; focusHome(); }
    else if (k === NEXT && row.i < row.items.length - 1) { row.i++; focusHome(); }
    else if (k === PREV) { if (row.i > 0) { row.i--; focusHome(); } else setZone('menu'); }
    else if (k === K.ENTER) activate(row.items[row.i], row.items, row.i);
    else if (k === K.YELLOW) toggleFav(row.items[row.i]);
    else if (k === K.BACK || k === K.ESC) setZone('menu');
  }

  /* ---------------- Details (movies) ---------------- */

  function metaLine(node, parts) {
    node.innerHTML = '';
    parts.forEach(function (p) {
      if (!p) return;
      var span = el('span', p.cls || '', p.text || p);
      node.appendChild(span);
    });
  }

  function yearOf(s) { var m = String(s || '').match(/\d{4}/); return m ? m[0] : ''; }

  function durationText(info) {
    var secs = parseInt(info.duration_secs, 10);
    if (!secs && info.duration) {
      var p = String(info.duration).split(':');
      if (p.length === 3) secs = (+p[0]) * 3600 + (+p[1]) * 60 + (+p[2]);
    }
    if (!secs) return '';
    var h = Math.floor(secs / 3600), m = Math.round(secs % 3600 / 60);
    return h ? h + 'h ' + m + 'm' : t('minutes', { n: m });
  }

  function ratingPart(r) {
    r = parseFloat(r);
    return r > 0 ? { cls: 'star', text: '★ ' + (Math.round(r * 10) / 10) } : null;
  }

  function setHero(prefix, poster, backdrop) {
    $(prefix + '-poster').style.backgroundImage = poster ? cssUrl(poster) : 'none';
    $(prefix + '-bg').style.backgroundImage = (backdrop || poster) ? cssUrl(backdrop || poster) : 'none';
  }

  function firstBackdrop(info) {
    var b = info.backdrop_path;
    if (Array.isArray(b)) return b[0];
    return b || '';
  }

  function openDetails(it) {
    var s = it.s;
    detailsCtx = { item: it, index: 0 };
    $('d-title').textContent = s.name;
    metaLine($('d-meta'), [ratingPart(s.rating)]);
    $('d-plot').textContent = '';
    $('d-credits').textContent = '';
    setHero('d', s.stream_icon, '');
    showScreen('details');
    zone = 'actions';
    renderActions();

    var id = s.stream_id;
    api.vodInfo(id).then(function (res) {
      if (!detailsCtx || detailsCtx.item !== it) return;
      var info = (res && res.info) || {};
      if (res && res.movie_data && res.movie_data.container_extension) {
        detailsCtx.ext = res.movie_data.container_extension;
      }
      metaLine($('d-meta'), [
        yearOf(info.releasedate || info.release_date), durationText(info),
        ratingPart(info.rating || s.rating), info.genre
      ]);
      $('d-plot').textContent = info.plot || info.description || '';
      var credits = [];
      if (info.director) credits.push(info.director);
      if (info.cast || info.actors) credits.push(info.cast || info.actors);
      $('d-credits').textContent = credits.join('  •  ');
      setHero('d', info.movie_image || info.cover_big || s.stream_icon, firstBackdrop(info));
    }, function () {});
  }

  function renderActions() {
    if (!detailsCtx) return;
    var it = detailsCtx.item, pos = store.get(posKey('vod', it.s.stream_id), 0);
    var actions = pos
      ? [{ id: 'resume', ic: '▶', label: t('resume', { time: Util.fmtTime(pos) }) }, { id: 'start', ic: '↺', label: t('start_over') }]
      : [{ id: 'play', ic: '▶', label: t('play') }];
    actions.push(isFav(it) ? { id: 'fav', ic: '★', label: t('remove_fav') } : { id: 'fav', ic: '☆', label: t('add_fav') });
    detailsCtx.actions = actions;
    detailsCtx.index = Math.min(detailsCtx.index, actions.length - 1);

    var box = $('d-actions');
    box.innerHTML = '';
    actions.forEach(function (a, i) {
      var b = el('div', 'action' + (i === detailsCtx.index ? ' focused' : ''));
      b.appendChild(el('span', 'ic', a.ic));
      b.appendChild(el('span', '', a.label));
      b.addEventListener('click', function () { detailsCtx.index = i; runAction(); });
      box.appendChild(b);
    });
  }

  function runAction() {
    var a = detailsCtx.actions[detailsCtx.index], s = detailsCtx.item.s;
    if (a.id === 'fav') { toggleFav(detailsCtx.item); return; }
    playVod({
      kind: 'vod', item: detailsCtx.item, id: s.stream_id, title: s.name,
      url: api.movieUrl(s.stream_id, detailsCtx.ext || s.container_extension),
      fromStart: a.id === 'start'
    });
  }

  function detailsKey(k) {
    var n = detailsCtx.actions.length;
    if (k === NEXT && detailsCtx.index < n - 1) { detailsCtx.index++; renderActions(); }
    else if (k === PREV && detailsCtx.index > 0) { detailsCtx.index--; renderActions(); }
    else if (k === K.ENTER) runAction();
    else if (k === K.YELLOW) toggleFav(detailsCtx.item);
    else if (k === K.BACK || k === K.ESC) { detailsCtx = null; backToBrowse(); }
  }

  /* ---------------- Series screen ---------------- */

  function openSeries(it) {
    Util.loading(true, t('loading_info'));
    api.seriesInfo(it.s.series_id).then(function (res) {
      Util.loading(false);
      var eps = (res && res.episodes) || {};
      var seasons = Object.keys(eps).sort(function (a, b) { return a - b; }).map(function (n) {
        return { t: 'season', season: n, count: (eps[n] || []).length };
      });
      if (!seasons.length) { Util.toast(t('no_episodes')); return; }
      var info = (res && res.info) || {};
      seriesCtx = { item: it, eps: eps };
      $('s-title').textContent = it.s.name;
      metaLine($('s-meta'), [
        yearOf(info.releaseDate || info.release_date), ratingPart(info.rating || it.s.rating), info.genre
      ]);
      $('s-plot').textContent = info.plot || '';
      setHero('s', info.cover || it.s.cover, firstBackdrop(info));
      showScreen('series');
      seasonList.setItems(seasons, store.get('season.' + it.s.series_id, 0));
      showSeason(seasonList.current());
      setZone('episodes');
    }, function () {
      Util.loading(false);
      Util.toast(t('err_series'));
    });
  }

  function showSeason(season) {
    if (!season || !seriesCtx) return;
    store.set('season.' + seriesCtx.item.s.series_id, seasonList.index);
    var list = (seriesCtx.eps[season.season] || []).map(function (ep) { return { t: 'episode', s: ep }; });
    var last = store.get('lastEp.' + seriesCtx.item.s.series_id, null), at = 0;
    list.forEach(function (x, i) { if (String(x.s.id) === String(last)) at = i; });
    episodeList.setItems(list, at);
  }

  function playEpisode(index) {
    var it = episodeList.items[index];
    if (!it) return;
    var ep = it.s, series = seriesCtx.item;
    store.set('lastEp.' + series.s.series_id, ep.id);
    touch('continue', 'series', series.s);
    playVod({
      kind: 'episode', item: series, url: api.episodeUrl(ep.id, ep.container_extension), id: ep.id,
      title: series.s.name + '  ·  ' + (ep.title || t('episode', { n: ep.episode_num })),
      episodeIndex: index
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

  function closeSeries() { backToBrowse(); }

  function backToBrowse() {
    showScreen('browse');
    if (section === 'home') { buildHome(); setZone('home'); }
    else { itemList.refresh(); setZone('items'); }
  }

  /* ---------------- Player ---------------- */

  var osdTimer = null, overSeek = false, dragging = false;
  function showOsd(ms) {
    show($('osd'), true);
    clearTimeout(osdTimer);
    // Stay visible while paused or while the pointer is on the seek bar
    if (ms !== 0 && !overSeek && !dragging) osdTimer = setTimeout(function () { show($('osd'), false); }, ms || 5000);
  }

  /* Pointer (Magic Remote) seeking. The bar always runs left-to-right. */
  function seekFraction(e) {
    var r = $('osd-seek').getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }

  function previewSeek(e, withBar) {
    var dur = Player.duration();
    if (!dur) return;
    var f = seekFraction(e), tip = $('osd-tip');
    tip.textContent = Util.fmtTime(f * dur);
    tip.style.left = f * 100 + '%';
    show(tip, true);
    if (withBar) {
      $('osd-bar').style.width = f * 100 + '%';
      $('osd-knob').style.left = f * 100 + '%';
    }
  }

  function initPointer() {
    var seek = $('osd-seek');
    seek.addEventListener('mousedown', function (e) {
      if (!play || play.kind === 'live' || !Player.duration()) return;
      e.preventDefault();
      dragging = true;
      seek.classList.add('dragging');
      previewSeek(e, true);
      showOsd();
    });
    seek.addEventListener('mousemove', function (e) { if (!dragging) previewSeek(e, false); });
    seek.addEventListener('mouseenter', function () { overSeek = true; showOsd(); });
    seek.addEventListener('mouseleave', function () {
      overSeek = false;
      if (!dragging) { show($('osd-tip'), false); showOsd(); }
    });
    document.addEventListener('mousemove', function (e) {
      if (screen !== 'player') return;
      if (dragging) previewSeek(e, true);
      else if ($('zap-list').classList.contains('hidden')) showOsd(Player.paused() ? 0 : 4000);
    });
    document.addEventListener('mouseup', function (e) {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove('dragging');
      Player.seekTo(seekFraction(e) * Player.duration());
      if (!overSeek) show($('osd-tip'), false);
      updateProgress();
      showOsd();
    });
    // Clicking the picture pauses or resumes a movie
    $('video').addEventListener('click', function () {
      if (!play || play.kind === 'live') return;
      var paused = Player.togglePause();
      show($('pause-icon'), paused);
      showOsd(paused ? 0 : 4000);
    });
  }

  function setOsdLogo(src, name) {
    var box = $('osd-logo').parentNode;
    var fresh = logoBox(src, name, 'osd-logo');
    fresh.firstChild.id = 'osd-logo';
    box.parentNode.replaceChild(fresh, box);
    show(fresh, !!(src || name));
  }

  function enterPlayer() {
    if (screen !== 'player') returnScreen = screen;
    showScreen('player');
    show($('pause-icon'), false);
  }

  function playLive(list, index) {
    var it = list[index];
    if (!it) return;
    enterPlayer();
    play = { kind: 'live', list: list, index: index, item: it, triedTs: false };
    show($('osd-progress'), false);
    show($('osd-live'), true);
    var useTs = store.get('liveFormat', 'm3u8') === 'ts';
    play.ts = useTs;
    Player.play(api.liveUrl(it.s.stream_id, useTs ? 'ts' : 'm3u8'), { live: true, ts: useTs });
    touch('recentLive', 'live', it.s, null, 20);

    $('osd-num').textContent = it.s.num || (index + 1);
    show($('osd-num'), true);
    $('osd-title').textContent = it.s.name;
    setOsdLogo(it.s.stream_icon, it.s.name);
    fillEpg(OSD, []);
    $('osd-now').textContent = '…';
    showOsd();
    var id = it.s.stream_id;
    getEpg(id).then(function (l) { if (play && play.item === it) fillEpg(OSD, l); }, function () {
      if (play && play.item === it) fillEpg(OSD, []);
    });
  }

  function zap(delta) {
    if (!play || play.kind !== 'live') return;
    var n = play.list.length;
    playLive(play.list, (play.index + delta + n) % n);
  }

  function playVod(ctx) {
    enterPlayer();
    play = ctx;
    var startAt = ctx.fromStart ? 0 : store.get(posKey(ctx.kind, ctx.id), 0);
    Player.play(ctx.url, { startAt: startAt });
    if (startAt) Util.toast(t('resume_from', { time: Util.fmtTime(startAt) }));
    show($('osd-num'), false);
    $('osd-title').textContent = ctx.title;
    setOsdLogo(null, null);
    show($('osd-live'), false);
    show($('osd-progress'), true);
    updateProgress();
    showOsd();
  }

  var lastSave = 0;
  function updateProgress() {
    if (!play || play.kind === 'live') return;
    var cur = Player.time(), dur = Player.duration();
    $('osd-cur').textContent = Util.fmtTime(cur);
    $('osd-dur').textContent = dur ? '-' + Util.fmtTime(dur - cur) : '0:00';
    if (!dragging) {
      $('osd-bar').style.width = dur ? (cur / dur * 100) + '%' : '0';
      $('osd-knob').style.left = dur ? (cur / dur * 100) + '%' : '0';
    }
    if (Date.now() - lastSave > 10000) { lastSave = Date.now(); savePosition(); }
  }

  function savePosition() {
    if (!play || play.kind === 'live') return;
    var cur = Player.time(), dur = Player.duration(), key = posKey(play.kind, play.id);
    if (!dur) return;
    if (cur > 60 && cur < dur * 0.95) {
      store.set(key, Math.floor(cur));
      if (play.kind === 'vod') touch('continue', 'vod', play.item.s, { pct: cur / dur });
    } else if (cur >= dur * 0.95) {
      store.remove(key);
      if (play.kind === 'vod') drop('continue', 'vod', play.id);
    }
  }

  function onPlayerError() {
    if (!play) return;
    if (play.kind === 'live' && !play.ts && !play.triedTs) {
      // Some providers only serve MPEG-TS: retry the same channel once that way
      play.triedTs = true;
      play.ts = true;
      Util.toast(t('retry_format'));
      Player.play(api.liveUrl(play.item.s.stream_id, 'ts'), { live: true, ts: true });
      return;
    }
    Util.toast(play.kind === 'live' ? t('ch_down') : t('play_err'), 4000);
  }

  function onEnded() {
    if (!play || play.kind === 'live') return;
    store.remove(posKey(play.kind, play.id));
    if (play.kind === 'vod') drop('continue', 'vod', play.id);
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
    showScreen(returnScreen);
    if (returnScreen === 'series') {
      episodeList.refresh();
      setZone('episodes');
    } else if (returnScreen === 'details') {
      renderActions();
    } else {
      backToBrowse();
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
      if (idx >= 0) playLive(play.list, idx); else Util.toast(t('no_channel', { n: n }));
    }, 1500);
  }

  function openZap() {
    $('zap-title').textContent = t('channels_n', { n: play.list.length });
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
        else if (k === K.YELLOW) { toggleFav(zapList.current()); zapList.refresh(); }
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
      show($('pause-icon'), paused);
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

  var loginFields = ['in-server', 'in-user', 'in-pass', 'btn-login', 'btn-lang'];
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
      $('login-error').textContent = t('err_fields');
      return;
    }
    $('btn-login').blur();
    connect(creds, true);
  }

  function connect(creds, fromForm) {
    var client = new Xtream(creds);
    if (fromForm) Util.loading(true, t('connecting'));
    else showScreen('splash');
    client.login().then(function (info) {
      Util.loading(false);
      api = client;
      account = info;
      store.set('creds', { server: client.server, username: client.username, password: client.password });
      data = {};
      showExpiry();
      showScreen('browse');
      menuIndex = 0;
      openSection('home');
      setZone(home.rows.length ? 'home' : 'menu');
      homeStartup = !home.rows.length;
      // Fill the "recently added" rows in the background
      loadKind('vod', true).then(refreshHome, function () {});
      loadKind('series', true).then(refreshHome, function () {});
    }, function (err) {
      Util.loading(false);
      var msg = err && err.message === 'auth' ? t('err_auth') : t('err_connect');
      if (fromForm) $('login-error').textContent = msg;
      else showLogin(msg);
    });
  }

  function showExpiry() {
    var u = (account && account.user_info) || {};
    $('exp').textContent = u.exp_date ? t('expires', { date: fmtDate(u.exp_date) }) : '';
  }

  function loginKey(k, e) {
    if (k === K.UP && loginIndex > 0) { loginIndex--; focusLogin(); e.preventDefault(); }
    else if (k === K.DOWN && loginIndex < loginFields.length - 1) { loginIndex++; focusLogin(); e.preventDefault(); }
    else if (k === K.ENTER) {
      e.preventDefault();
      if (loginFields[loginIndex] === 'btn-login') doLogin();
      else if (loginFields[loginIndex] === 'btn-lang') { switchLang(); focusLogin(); }
      else { loginIndex++; focusLogin(); }
    } else if (k === K.BACK) tryExit();
  }

  /* ---------------- Screens & keys ---------------- */

  function showScreen(name) {
    screen = name;
    ['splash', 'login', 'browse', 'details', 'series', 'player'].forEach(function (s) { show($(s), s === name); });
    // Lists measure themselves, so redraw once their screen is visible
    if (name === 'browse') { catList.setIndex(catList.index, true); itemList.setIndex(itemList.index, true); }
    if (name === 'series') { seasonList.setIndex(seasonList.index, true); episodeList.setIndex(episodeList.index, true); }
  }

  // OK pressed and held = favorite; short press = select
  var enterTimer = null, enterLong = false;
  function holdable() { return screen === 'browse' || screen === 'series'; }

  function onKeyDown(e) {
    var k = e.keyCode;
    if (!$('loading').classList.contains('hidden')) {
      if (k === K.BACK) e.preventDefault();
      return;
    }
    if (screen === 'login') { loginKey(k, e); return; }
    if (screen === 'browse' && zone === 'search' && k !== K.DOWN && k !== K.UP && k !== K.BACK && k !== K.ESC) return;
    e.preventDefault();

    if (k === K.ENTER && holdable()) {
      if (e.repeat || enterTimer) return;
      enterLong = false;
      enterTimer = setTimeout(function () {
        enterTimer = null;
        enterLong = true;
        if (screen === 'browse' && zone === 'items') toggleFav(itemList.current());
        else if (screen === 'browse' && zone === 'home') toggleFav(homeCurrent());
        else if (screen === 'series') toggleFav(seriesCtx.item);
      }, 700);
      return;
    }
    dispatch(k);
  }

  function onKeyUp(e) {
    if (e.keyCode !== K.ENTER || !holdable() || zone === 'search') return;
    if (enterTimer) {
      clearTimeout(enterTimer);
      enterTimer = null;
      if (!enterLong) dispatch(K.ENTER);
    }
  }

  function dispatch(k) {
    if (screen === 'browse') { if (k === K.ENTER) browseSelect(); else browseKey(k); }
    else if (screen === 'details') detailsKey(k);
    else if (screen === 'series') seriesKey(k);
    else if (screen === 'player') playerKey(k);
  }

  /* ---------------- Init ---------------- */

  function init() {
    applyDir();
    I18n.apply();

    catList = new VList($('cats-list'), {
      rowHeight: 3.4,
      render: renderRow,
      onFocus: Util.debounce(function (c) { showCategory(c); }, 250),
      onSelect: function (c) { showCategory(c); setZone('items'); },
      onHover: function () { setZone('cats'); }
    });
    rowList = new VList($('items-list'), {
      rowHeight: 3.8,
      render: renderRow,
      onFocus: updatePreview,
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
      rowHeight: 3.8,
      render: renderRow,
      onSelect: function (it, i) { show($('zap-list'), false); playLive(play.list, i); }
    });

    Player.init({ onError: onPlayerError, onEnded: onEnded, onTime: updateProgress });
    initPointer();

    buildMenu();
    tick();
    setInterval(tick, 15000);
    $('search-input').addEventListener('input', Util.debounce(runSearch, 400));
    $('btn-login').addEventListener('click', doLogin);
    $('btn-lang').addEventListener('click', function () { switchLang(); });
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
    if (window.Boot) Boot.started();
  }

  init();
})();
