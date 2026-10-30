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

  // Looks the user can pick in Settings; every one has the same features
  var THEMES = ['aurora', 'cinema', 'pulse'];
  var FONTS = {
    aurora: 'Tajawal:wght@400;500;700;800',
    cinema: 'Readex+Pro:wght@300;400;500;600;700',
    pulse: 'IBM+Plex+Sans+Arabic:wght@300;400;500;600;700'
  };
  var theme = 'aurora';

  function applyTheme(name) {
    theme = THEMES.indexOf(name) >= 0 ? name : 'aurora';
    document.documentElement.setAttribute('data-theme', theme);
    store.set('theme', theme);
    // The theme's font comes from Google Fonts; without internet the system font is used
    var link = document.getElementById('theme-font');
    if (!link) {
      link = document.createElement('link');
      link.id = 'theme-font';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[theme] + '&display=swap';
  }

  // Cinema puts the menu in a bar across the top instead of a side column
  function topNav() { return theme === 'cinema'; }

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
    scheduleSave();
    catList.setActive(z === 'cats');
    rowList.setActive(z === 'items');
    gridList.setActive(z === 'items');
    seasonList.setActive(z === 'seasons');
    episodeList.setActive(z === 'episodes');
    var input = $('search-input');
    if (z === 'search') input.focus(); else if (document.activeElement === input) input.blur();
    $('sidebar').classList.toggle('compact', theme === 'aurora' && z !== 'menu');
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
      { t: 'setting', id: 'accounts', label: t('set_accounts'), value: findAccount(activeId) ? findAccount(activeId).name : '' },
      { t: 'setting', id: 'lang', label: t('set_lang'), value: t('set_lang_value') },
      { t: 'setting', id: 'theme', label: t('set_theme'), value: t('theme_' + theme) },
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
    var reopen = function () { openSection('settings', i); setZone('items'); };
    if (it.id === 'accounts') {
      openAccountsDialog(false);
    } else if (it.id === 'lang') {
      pickDialog(t('set_lang'), [{ label: 'العربية', value: 'ar' }, { label: 'English', value: 'en' }], I18n.lang(), function (v) {
        if (v !== I18n.lang()) switchLang();
        reopen();
      });
    } else if (it.id === 'theme') {
      pickDialog(t('set_theme'), THEMES.map(function (n) { return { label: t('theme_' + n), value: n }; }), theme, function (v) {
        applyTheme(v);
        [catList, rowList, gridList, seasonList, episodeList, zapList].forEach(function (l) { l.refresh(); });
        reopen();
      });
    } else if (it.id === 'format') {
      pickDialog(t('set_format'), [{ label: 'HLS (m3u8)', value: 'm3u8' }, { label: 'TS', value: 'ts' }], store.get('liveFormat', 'm3u8'), function (v) {
        store.set('liveFormat', v);
        reopen();
      });
    } else if (it.id === 'reload') {
      data = {};
      epgCache = {};
      Util.toast(t('set_reload_done'));
    } else if (it.id === 'update') {
      checkUpdate();
    } else if (it.id === 'logout') {
      var acc = findAccount(activeId);
      confirmDialog(t('logout_q', { name: acc ? acc.name : '' }), t('logout_msg'), leaveAccount);
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
      var row = section === 'home' && home.rows[home.r];
      playLive(lives, at, { section: section, cat: section === 'live' ? store.get('cat.live', '*') : null, row: row ? row.key : null });
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
      var back = topNav() ? PREV : K.UP, fwd = topNav() ? NEXT : K.DOWN;
      if (k === back && menuIndex > 0) { menuIndex--; renderMenu(); }
      else if (k === fwd && menuIndex < MENU.length - 1) { menuIndex++; renderMenu(); }
      else if (k === (topNav() ? K.DOWN : NEXT) || k === K.ENTER) enterSection();
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
      if (k === K.UP) { if (!catList.move(-1, 0) && topNav()) setZone('menu'); }
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
        else if (k === K.UP && topNav()) setZone('menu');
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
    if (now - exitArmed < 2500) { Util.exitApp(); return; }
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
    else if (k === K.UP && topNav()) setZone('menu');
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
    var ext = detailsCtx.ext || s.container_extension;
    playVod({
      kind: 'vod', item: detailsCtx.item, id: s.stream_id, title: s.name, ext: ext,
      url: api.movieUrl(s.stream_id, ext),
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

  function openSeries(it, at) {
    Util.loading(true, t('loading_info'));
    return api.seriesInfo(it.s.series_id).then(function (res) {
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
      seasonList.setItems(seasons, at && at.season != null ? at.season : store.get('season.' + it.s.series_id, 0));
      showSeason(seasonList.current());
      if (at && at.ep != null) episodeList.setIndex(at.ep, true);
      setZone('episodes');
      return true;
    }, function () {
      Util.loading(false);
      Util.toast(t('err_series'));
      return false;
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

  function playEpisode(index, startAt) {
    var it = episodeList.items[index];
    if (!it) return;
    var ep = it.s, series = seriesCtx.item;
    store.set('lastEp.' + series.s.series_id, ep.id);
    touch('continue', 'series', series.s);
    playVod({
      kind: 'episode', item: series, url: api.episodeUrl(ep.id, ep.container_extension), id: ep.id,
      title: series.s.name + '  ·  ' + t('ep_label', { s: seasonList.current().season, e: ep.episode_num }) +
        (ep.title ? '  ·  ' + ep.title : ''),
      episodeIndex: index, startAt: startAt
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
    if (ms !== 0 && !overSeek && !dragging && ctlFocus < 0) osdTimer = setTimeout(function () { show($('osd'), false); }, ms || 5000);
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
    CTLS.forEach(function (id) {
      $('ctl-' + id).addEventListener('click', function () { runCtl(id); });
    });
    $('upnext').addEventListener('click', function () { goEpisode(1); });
    // Clicking the picture pauses or resumes a movie
    $('video').addEventListener('click', function () {
      if (!play || play.kind === 'live') return;
      togglePlay();
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

  function playLive(list, index, src) {
    var it = list[index];
    if (!it) return;
    // Zapping keeps the list the channel was opened from
    if (!src && play && play.kind === 'live') src = play.src;
    enterPlayer();
    play = { kind: 'live', list: list, index: index, item: it, triedTs: false, src: src || null };
    show($('osd-progress'), false);
    show($('osd-live'), true);
    show($('osd-ctl'), false);
    show($('upnext'), false);
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
    var startAt = ctx.fromStart ? 0 : (ctx.startAt != null ? ctx.startAt : store.get(posKey(ctx.kind, ctx.id), 0));
    Player.play(ctx.url, { startAt: startAt });
    if (startAt) Util.toast(t('resume_from', { time: Util.fmtTime(startAt) }));
    show($('osd-num'), false);
    $('osd-title').textContent = ctx.title;
    setOsdLogo(null, null);
    show($('osd-live'), false);
    show($('osd-progress'), true);
    ctlFocus = -1;
    show($('osd-ctl'), true);
    show($('upnext'), false);
    renderCtl();
    updateProgress();
    showOsd();
    scheduleSave();
  }

  /* ---------------- Previous / next episode ---------------- */

  // Control row, in on-screen order (it runs left to right like the timeline)
  var CTLS = ['prev', 'rw', 'play', 'ff', 'next'];
  var ctlFocus = -1;   // index into CTLS, -1 when the row is not focused

  function ctlEnabled(id) {
    if (id === 'prev') return !!episodeTarget(-1);
    if (id === 'next') return !!episodeTarget(1);
    return true;
  }

  function renderCtl() {
    var episode = play && play.kind === 'episode';
    CTLS.forEach(function (id, i) {
      var b = $('ctl-' + id);
      if (id === 'prev' || id === 'next') show(b, episode);
      b.classList.toggle('disabled', !ctlEnabled(id));
      b.classList.toggle('focused', i === ctlFocus);
    });
    $('ctl-play-icon').setAttribute('d', Player.paused() ? 'M7 4v16l13-8z' : 'M6 4h4v16H6zM14 4h4v16h-4z');
  }

  function togglePlay() {
    var paused = Player.togglePause();
    show($('pause-icon'), paused);
    showOsd(paused ? 0 : 4000);
    renderCtl();
  }

  function runCtl(id) {
    if (!ctlEnabled(id)) return;
    if (id === 'prev') goEpisode(-1);
    else if (id === 'next') goEpisode(1);
    else if (id === 'rw') { Player.seek(-10); updateProgress(); }
    else if (id === 'ff') { Player.seek(10); updateProgress(); }
    else if (id === 'play') togglePlay();
    if (ctlFocus >= 0) showOsd(0);
  }

  // Remote keys for the control row; returns true when the key was used
  function ctlKey(k) {
    if (play.kind === 'episode') {
      if (k === K.CH_UP) { goEpisode(1); return true; }
      if (k === K.CH_DOWN) { goEpisode(-1); return true; }
    }
    if (ctlFocus < 0) {
      if (k === K.ENTER && !$('upnext').classList.contains('hidden')) { goEpisode(1); return true; }
      if (k !== K.DOWN) return false;
      ctlFocus = CTLS.indexOf('play');
      renderCtl();
      showOsd(0);
      return true;
    }
    if (k === K.LEFT || k === K.RIGHT) {
      var step = k === K.RIGHT ? 1 : -1, i = ctlFocus + step;
      while (i >= 0 && i < CTLS.length && (!ctlEnabled(CTLS[i]) || $('ctl-' + CTLS[i]).classList.contains('hidden'))) i += step;
      if (i >= 0 && i < CTLS.length) ctlFocus = i;
      renderCtl();
      showOsd(0);
      return true;
    }
    if (k === K.ENTER) { runCtl(CTLS[ctlFocus]); return true; }
    if (k === K.UP || k === K.BACK || k === K.ESC) {
      ctlFocus = -1;
      renderCtl();
      showOsd();
      return true;
    }
    return false;
  }

  // Where delta (+1/-1) leads from the playing episode, crossing into the next or previous season
  function episodeTarget(delta) {
    if (!play || play.kind !== 'episode') return null;
    var si = seasonList.index, ei = play.episodeIndex;
    if (delta > 0) {
      if (ei + 1 < episodeList.items.length) return { s: si, e: ei + 1 };
      if (si + 1 < seasonList.items.length) return { s: si + 1, e: 0 };
    } else {
      if (ei > 0) return { s: si, e: ei - 1 };
      if (si > 0) return { s: si - 1, e: seasonList.items[si - 1].count - 1 };
    }
    return null;
  }

  function goEpisode(delta) {
    var to = episodeTarget(delta);
    if (!to) return false;
    savePosition();
    if (to.s !== seasonList.index) {
      seasonList.setIndex(to.s, true);
      showSeason(seasonList.current());
    }
    episodeList.setIndex(to.e, true);
    show($('upnext'), false);
    playEpisode(to.e);
    return true;
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
    updateUpNext(cur, dur);
    renderCtl();
    if (Date.now() - lastSave > 3000) { lastSave = Date.now(); savePosition(); saveSession(); }
  }

  // Shown during the last seconds of an episode that has a next one
  function updateUpNext(cur, dur) {
    var to = play.kind === 'episode' && dur ? episodeTarget(1) : null;
    var left = dur - cur, box = $('upnext');
    if (!to || left > 15 || left <= 0 || Player.paused()) { show(box, false); return; }
    var season = seasonList.items[to.s], ep = to.s === seasonList.index ? episodeList.items[to.e] : null;
    $('un-label').textContent = t('upnext_in', { n: Math.ceil(left) });
    $('un-title').textContent = t('ep_label', { s: season ? season.season : '', e: ep ? ep.s.episode_num : 1 });
    show(box, true);
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
    if (play.kind === 'episode' && goEpisode(1)) return;
    closePlayer();
  }

  function closePlayer() {
    savePosition();
    Player.stop();
    show($('zap-list'), false);
    show($('osd'), false);
    show($('upnext'), false);
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

    if (ctlKey(k)) return;

    // Movies and episodes: the timeline runs left-to-right, so RIGHT always means forward
    if (k === K.ENTER || k === K.PLAY_PAUSE || k === K.PLAY || k === K.PAUSE) {
      togglePlay();
    } else if (k === K.RIGHT) { Player.seek(10); showOsd(); }
    else if (k === K.LEFT) { Player.seek(-10); showOsd(); }
    else if (k === K.FF) { Player.seek(60); showOsd(); }
    else if (k === K.RW) { Player.seek(-60); showOsd(); }
    else if (k === K.UP || k === K.DOWN) showOsd();
    else if (k === K.YELLOW) toggleFav(play.item);
    else if (k === K.BACK || k === K.ESC || k === K.STOP) closePlayer();
    updateProgress();
  }

  /* ---------------- Session: reopen exactly where the user left off ---------------- */

  var restoring = false;

  function saveSession() {
    if (!api || restoring || ['browse', 'details', 'series', 'player'].indexOf(screen) < 0) return;
    var s = { at: Date.now(), screen: screen, section: section, zone: zone, item: itemList ? itemList.index : 0, returnScreen: returnScreen };
    if (detailsCtx && (screen === 'details' || returnScreen === 'details')) s.details = { t: 'vod', s: snapshot(detailsCtx.item.s) };
    if (seriesCtx && (screen === 'series' || returnScreen === 'series')) {
      s.series = { item: { t: 'series', s: snapshot(seriesCtx.item.s) }, season: seasonList.index, ep: episodeList.index };
    }
    if (screen === 'player' && play) {
      var p = { kind: play.kind, item: { t: play.item.t, s: snapshot(play.item.s) } };
      if (play.kind === 'live') p.src = play.src || null;
      else {
        p.pos = Math.floor(Player.time()) || store.get(posKey(play.kind, play.id), 0);
        p.ext = play.ext;
      }
      if (play.kind === 'episode') { p.season = seasonList.index; p.ep = play.episodeIndex; }
      s.play = p;
    }
    store.set('session', s);
  }
  var scheduleSave = Util.debounce(saveSession, 400);

  // The channel list a live channel was opened from, so zapping still works after a restart
  function liveListFor(src, item) {
    var d = data.live, list = null;
    if (src && src.section === 'live' && d) {
      if (!src.cat || src.cat === '*') list = d.all;
      else if (src.cat === 'recent') list = savedItems('recentLive', 'live');
      else list = d.byCat[src.cat];
    } else if (src && (src.section === 'fav' || src.row === 'row_fav_live')) {
      list = favs.filter(function (f) { return f.t === 'live'; }).map(function (f) { return { t: 'live', s: f.s }; });
    } else if (src && src.row === 'row_recent') {
      list = savedItems('recentLive', 'live');
    }
    if (!list || !list.length) list = d ? d.all : [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].s.stream_id) === String(item.s.stream_id)) return { list: list, index: i };
    }
    return { list: [item], index: 0 };
  }

  function restoreSession(s) {
    restoring = true;
    var done = function () { restoring = false; scheduleSave(); };
    var sec = MENU.indexOf(s.section) >= 0 ? s.section : 'home';
    menuIndex = MENU.indexOf(sec);
    showScreen('browse');
    openSection(sec).then(function () {
      if (sec !== 'home' && s.item && itemList.items.length) itemList.setIndex(s.item, true);
      var z = s.zone;
      if (sec === 'home') z = home.rows.length ? 'home' : 'menu';
      else if (z === 'cats' && $('cats').classList.contains('hidden')) z = 'menu';
      else if (z === 'items' && !itemList.items.length) z = 'menu';
      else if (['cats', 'items'].indexOf(z) < 0) z = 'menu';
      setZone(z);
      if (sec === 'home') homeStartup = !home.rows.length;

      var p = s.play;
      if (s.screen === 'player' && p) {
        if (p.kind === 'live') {
          return loadKind('live').then(function () {
            var at = liveListFor(p.src, p.item);
            playLive(at.list, at.index, p.src);
          });
        }
        if (p.kind === 'vod') {
          if (s.returnScreen === 'details') openDetails(p.item);
          playVod({
            kind: 'vod', item: p.item, id: p.item.s.stream_id, title: p.item.s.name, ext: p.ext,
            url: api.movieUrl(p.item.s.stream_id, p.ext || p.item.s.container_extension), startAt: p.pos
          });
          return;
        }
        if (p.kind === 'episode') {
          return openSeries(p.item, { season: p.season, ep: p.ep }).then(function (ok) {
            if (ok) playEpisode(episodeList.index, p.pos);
          });
        }
      }
      if (s.screen === 'details' && s.details) { openDetails(s.details); return; }
      if (s.screen === 'series' && s.series) return openSeries(s.series.item, { season: s.series.season, ep: s.series.ep });
    }).then(done, done);
  }

  /* ---------------- Dialog: pick from a list, or answer yes / no ---------------- */

  var dlg = null;   // { options, index, onSelect, onCancel } while open

  function openDialog(o) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    dlg = { options: o.options, index: Math.max(0, o.index || 0), onSelect: o.onSelect, onCancel: o.onCancel };
    $('dlg-title').textContent = o.title || '';
    $('dlg-msg').textContent = o.message || '';
    renderDialog();
    show($('dialog'), true);
  }

  function renderDialog() {
    var list = $('dlg-list');
    list.innerHTML = '';
    dlg.options.forEach(function (op, i) {
      var n = el('div', 'dlg-opt' + (op.danger ? ' danger' : '') + (i === dlg.index ? ' focused' : ''));
      var txt = el('span', 'txt', op.label);
      if (op.sub) txt.appendChild(el('span', 'sub', op.sub));
      n.appendChild(txt);
      if (op.checked) n.appendChild(el('span', 'chk', '✓'));
      n.addEventListener('click', function () { dlg.index = i; chooseDialog(); });
      n.addEventListener('mouseover', function () { if (dlg && dlg.index !== i) { dlg.index = i; renderDialog(); } });
      list.appendChild(n);
      if (i === dlg.index && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' });
    });
  }

  function closeDialog() {
    dlg = null;
    show($('dialog'), false);
  }

  function chooseDialog() {
    var d = dlg, op = d.options[d.index];
    closeDialog();
    if (d.onSelect) d.onSelect(op.value, op);
  }

  function dialogKey(k) {
    if (k === K.UP && dlg.index > 0) { dlg.index--; renderDialog(); }
    else if (k === K.DOWN && dlg.index < dlg.options.length - 1) { dlg.index++; renderDialog(); }
    else if (k === K.ENTER) chooseDialog();
    else if (k === K.BACK || k === K.ESC) {
      var d = dlg;
      closeDialog();
      if (d.onCancel) d.onCancel();
    }
  }

  // A yes / no question; "No" is selected first so OK never does something by accident
  function confirmDialog(title, message, onYes) {
    openDialog({
      title: title, message: message, index: 1,
      options: [{ label: t('yes'), value: true, danger: true }, { label: t('no'), value: false }],
      onSelect: function (yes) { if (yes) onYes(); }
    });
  }

  // Choose one of several values; the current one is ticked and selected
  function pickDialog(title, choices, current, onPick) {
    var index = 0;
    choices.forEach(function (c, i) { if (c.value === current) index = i; });
    openDialog({
      title: title, index: index,
      options: choices.map(function (c) { return { label: c.label, value: c.value, checked: c.value === current }; }),
      onSelect: onPick
    });
  }

  /* ---------------- Subscriptions (several saved accounts) ---------------- */

  var accounts = [], activeId = null;

  function loadAccounts() {
    accounts = store.get('accounts', null);
    if (!accounts) {
      // Move the single login of older versions into the list. It keeps the
      // unscoped storage, so its favorites and progress carry over.
      accounts = [];
      var c = store.get('creds', null);
      if (c && c.server) {
        accounts.push({ id: 'main', name: t('default_acc', { n: 1 }), server: c.server, username: c.username, password: c.password, scope: '' });
        store.set('activeAccount', 'main');
      }
      store.set('accounts', accounts);
      store.remove('creds');
    }
    activeId = store.get('activeAccount', null);
  }

  function saveAccounts() { store.set('accounts', accounts); }

  function findAccount(id) {
    for (var i = 0; i < accounts.length; i++) if (accounts[i].id === id) return accounts[i];
    return null;
  }

  function hostOf(url) { return String(url || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, ''); }

  function openAccountsDialog(fromLogin) {
    var options = accounts.map(function (a) {
      var inUse = a.id === activeId && !!api;
      return { label: a.name, sub: inUse ? t('acc_active') : hostOf(a.server), value: a.id, checked: inUse };
    });
    if (!fromLogin) options.push({ label: t('acc_add'), value: '__add' });
    var current = 0;
    options.forEach(function (o, i) { if (o.checked) current = i; });
    openDialog({
      title: fromLogin ? t('saved_accounts') : t('set_accounts'), options: options, index: current,
      onSelect: function (v) {
        if (v === '__add') showLogin('', 'add');
        else if (fromLogin) connectAccount(findAccount(v));
        else openAccountActions(findAccount(v));
      }
    });
  }

  function openAccountActions(a) {
    var options = [];
    if (a.id !== activeId || !api) options.push({ label: t('acc_use'), value: 'use' });
    options.push({ label: t('acc_edit'), value: 'edit' });
    options.push({ label: t('acc_delete'), value: 'del', danger: true });
    openDialog({
      title: a.name, message: hostOf(a.server) + '  ·  ' + a.username, options: options,
      onCancel: function () { openAccountsDialog(false); },
      onSelect: function (v) {
        if (v === 'use') connectAccount(a);
        else if (v === 'edit') showLogin('', 'edit', a);
        else confirmDialog(t('acc_delete_q', { name: a.name }), t('acc_delete_msg'), function () { deleteAccount(a); });
      }
    });
  }

  function deleteAccount(a) {
    accounts = accounts.filter(function (x) { return x.id !== a.id; });
    saveAccounts();
    if (a.scope) store.clearScope(a.scope);
    if (a.id !== activeId) { openSection('settings', itemList.index); setZone('items'); return; }
    // Its storage is gone: make sure nothing is saved back for it
    Player.stop();
    play = null;
    api = null;
    if (accounts.length) { connectAccount(accounts[0]); return; }
    leaveAccount();
  }

  // Stop using the current subscription (it stays saved) and show the login screen
  function leaveAccount() {
    saveSession();
    Player.stop();
    play = null;
    api = null;
    activeId = null;
    store.remove('activeAccount');
    store.setScope('');
    data = {};
    showLogin('', 'first');
  }

  function backToSettings() {
    showScreen('browse');
    openSection('settings');
    setZone('items');
  }

  /* ---------------- Login form (first login, add or edit a subscription) ---------------- */

  var LOGIN_FIELDS = ['in-name', 'in-server', 'in-user', 'in-pass', 'btn-login', 'btn-accounts', 'btn-lang'];
  var loginIndex = 0, loginMode = 'first', editId = null;

  function loginOrder() {
    return LOGIN_FIELDS.filter(function (id) { return !$(id).classList.contains('hidden'); });
  }

  function loginTexts() {
    $('login-title').textContent = t(loginMode === 'edit' ? 'edit_title' : loginMode === 'add' ? 'add_title' : 'login_title');
    $('btn-login').textContent = t(loginMode === 'first' ? 'login_btn' : 'save');
  }

  function showLogin(error, mode, acc) {
    loginMode = mode || 'first';
    editId = acc ? acc.id : null;
    $('in-name').value = acc ? acc.name : '';
    $('in-server').value = acc ? acc.server : '';
    $('in-user').value = acc ? acc.username : '';
    $('in-pass').value = acc ? acc.password : '';
    $('login-error').textContent = error || '';
    // Saved subscriptions can be picked whenever none is connected
    show($('btn-accounts'), accounts.length > 0 && !api);
    loginTexts();
    showScreen('login');
    loginIndex = 0;
    focusLogin();
  }

  function focusLogin() {
    var order = loginOrder();
    loginIndex = Math.min(loginIndex, order.length - 1);
    LOGIN_FIELDS.forEach(function (id) { $(id).classList.toggle('focused', id === order[loginIndex]); });
    $(order[loginIndex]).focus();
  }

  function doLogin() {
    var old = editId ? findAccount(editId) : null;
    var acc = {
      id: old ? old.id : 'a' + Date.now().toString(36),
      name: $('in-name').value.trim() || t('default_acc', { n: accounts.length + (old ? 0 : 1) }),
      server: $('in-server').value, username: $('in-user').value, password: $('in-pass').value
    };
    acc.scope = old ? old.scope : acc.id;
    if (!acc.server.trim() || !acc.username.trim() || !acc.password.trim()) {
      $('login-error').textContent = t('err_fields');
      return;
    }
    $('btn-login').blur();
    var client = new Xtream(acc);
    Util.loading(true, t('connecting'));
    client.login().then(function (info) {
      Util.loading(false);
      acc.server = client.server;
      acc.username = client.username;
      acc.password = client.password;
      var i = accounts.indexOf(old);
      if (i >= 0) accounts[i] = acc; else accounts.push(acc);
      saveAccounts();
      // Editing a subscription that is not in use just saves it
      if (loginMode === 'edit' && api && acc.id !== activeId) {
        Util.toast(t('saved'));
        backToSettings();
        return;
      }
      activateAccount(acc, client, info);
    }, function (err) {
      Util.loading(false);
      $('login-error').textContent = err && err.message === 'auth' ? t('err_auth') : t('err_connect');
    });
  }

  function connectAccount(acc) {
    if (!acc) return;
    var client = new Xtream(acc);
    if (api) saveSession();
    showScreen('splash');
    client.login().then(function (info) {
      activateAccount(acc, client, info);
    }, function (err) {
      var msg = err && err.message === 'auth' ? t('err_auth') : t('err_connect');
      if (api) {
        // Still connected to the previous subscription: stay there
        backToSettings();
        Util.toast(msg, 4000);
      } else {
        showLogin(msg, 'edit', acc);
      }
    });
  }

  // Switch everything over to a subscription that just logged in
  function activateAccount(acc, client, info) {
    if (api) saveSession();
    Player.stop();
    closeDialog();
    play = null;
    detailsCtx = null;
    seriesCtx = null;
    activeId = acc.id;
    store.set('activeAccount', acc.id);
    store.setScope(acc.scope);
    favs = store.get('favs', []);
    api = client;
    account = info;
    data = {};
    pending = {};
    epgCache = {};
    home.rows = [];
    showExpiry();
    var last = store.get('session', null);
    if (last && last.section) {
      restoreSession(last);
    } else {
      showScreen('browse');
      menuIndex = 0;
      openSection('home');
      setZone(home.rows.length ? 'home' : 'menu');
      homeStartup = !home.rows.length;
    }
    // Fill the "recently added" rows in the background
    loadKind('vod', true).then(refreshHome, function () {});
    loadKind('series', true).then(refreshHome, function () {});
  }

  function showExpiry() {
    var u = (account && account.user_info) || {};
    $('exp').textContent = u.exp_date ? t('expires', { date: fmtDate(u.exp_date) }) : '';
  }

  function loginKey(k, e) {
    var order = loginOrder(), id = order[loginIndex];
    if (k === K.UP && loginIndex > 0) { loginIndex--; focusLogin(); e.preventDefault(); }
    else if (k === K.DOWN && loginIndex < order.length - 1) { loginIndex++; focusLogin(); e.preventDefault(); }
    else if (k === K.ENTER) {
      e.preventDefault();
      if (id === 'btn-login') doLogin();
      else if (id === 'btn-accounts') openAccountsDialog(true);
      else if (id === 'btn-lang') { switchLang(); loginTexts(); focusLogin(); }
      else { loginIndex++; focusLogin(); }
    } else if (k === K.BACK) {
      if (loginMode !== 'first' && api) backToSettings(); else tryExit();
    }
  }

  /* ---------------- Screens & keys ---------------- */

  function showScreen(name) {
    screen = name;
    scheduleSave();
    ['splash', 'login', 'browse', 'details', 'series', 'player'].forEach(function (s) { show($(s), s === name); });
    // Lists measure themselves, so redraw once their screen is visible
    if (name === 'browse') { catList.setIndex(catList.index, true); itemList.setIndex(itemList.index, true); }
    if (name === 'series') { seasonList.setIndex(seasonList.index, true); episodeList.setIndex(episodeList.index, true); }
  }

  // OK pressed and held = favorite; short press = select
  var enterTimer = null, enterLong = false;
  function holdable() { return screen === 'browse' || screen === 'series'; }

  function onKeyDown(e) {
    var k = Util.normalizeKey(e.keyCode);
    if (!$('loading').classList.contains('hidden')) {
      if (k === K.BACK) e.preventDefault();
      return;
    }
    if (dlg) { e.preventDefault(); dialogKey(k); return; }
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
    if (dlg || Util.normalizeKey(e.keyCode) !== K.ENTER || !holdable() || zone === 'search') return;
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
    Util.initPlatform();
    applyTheme(store.get('theme', 'aurora'));
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
    $('btn-accounts').addEventListener('click', function () { openAccountsDialog(true); });
    $('btn-lang').addEventListener('click', function () { switchLang(); loginTexts(); });
    LOGIN_FIELDS.forEach(function (id) {
      $(id).addEventListener('focus', function () {
        var i = loginOrder().indexOf(id);
        if (i >= 0) loginIndex = i;
        LOGIN_FIELDS.forEach(function (f) { $(f).classList.toggle('focused', f === id); });
      });
    });
    // Closing the app, or restarting it for an update, keeps the exact place
    window.addEventListener('beforeunload', function () { saveSession(); });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Free the stream (and the provider's connection slot) while the app is in the background
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveSession();
      if (screen !== 'player' || !play) return;
      if (document.hidden) { savePosition(); Player.stop(); }
      else if (play.kind === 'live') playLive(play.list, play.index);
      else playVod(play);
    });

    loadAccounts();
    var acc = findAccount(activeId);
    if (acc) { store.setScope(acc.scope); connectAccount(acc); }
    else showLogin('', 'first');
    if (window.Boot) Boot.started();
  }

  init();
})();
