/*
 * Starts the app from the newest code available, so TVs update over the internet
 * without reinstalling:
 *   - a newer bundle downloaded earlier (stored on the TV) is used when present,
 *     otherwise the code packaged in the app;
 *   - after start-up it checks UPDATE_URL and stores a newer bundle for next launch.
 * If a downloaded version fails to start, it is marked bad and the packaged code
 * is used from then on, so a broken update cannot lock the TV out of the app.
 */
(function () {
  'use strict';

  var UPDATE_URL = 'https://raw.githubusercontent.com/KamalAdel91/nexlify-app/main/bundle.json';
  var LOCAL_FILES = ['js/util.js', 'js/i18n.js', 'js/xtream.js', 'js/vlist.js', 'js/player.js', 'js/app.js'];

  // Same storage prefix as Util.store, which is not loaded yet
  function get(key) {
    try { return JSON.parse(localStorage.getItem('iptv.' + key)); } catch (e) { return null; }
  }
  function set(key, value) {
    try {
      if (value === null) localStorage.removeItem('iptv.' + key);
      else localStorage.setItem('iptv.' + key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }

  // true when version a is higher than version b ("1.10.0" > "1.9.2")
  function newer(a, b) {
    var x = String(a || '0').split('.'), y = String(b || '0').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d > 0;
    }
    return false;
  }

  var bad = get('bundle.bad');
  var pending = get('boot.pending');
  if (pending) {
    // The last launch of a downloaded version never finished starting
    bad = pending;
    set('bundle.bad', bad);
    set('boot.pending', null);
  }

  var cached = get('bundle');
  var useBundle = !!(cached && cached.version !== bad && newer(cached.version, APP_VERSION) && cached.html && cached.js);

  var Boot = window.Boot = {
    version: useBundle ? cached.version : APP_VERSION,
    fromUpdate: useBundle,
    // Called by the app once it has started
    started: function () { set('boot.pending', null); },
    // Resolves true when a newer version was downloaded (it applies on next launch)
    check: function () {
      return fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (b) {
          if (!b || !b.version || !b.html || !b.js || b.version === bad) return false;
          if (!newer(b.version, Boot.version)) return false;
          if (cached && cached.version === b.version) return true;
          return set('bundle', b);
        });
    },
    restart: function () { location.reload(); }
  };

  function runBundle(b) {
    set('boot.pending', b.version);
    document.body.innerHTML = b.html;
    var link = document.getElementById('app-css');
    if (link) link.parentNode.removeChild(link);
    var style = document.createElement('style');
    style.textContent = b.css || '';
    document.head.appendChild(style);
    b.js.forEach(function (f) {
      var s = document.createElement('script');
      s.text = f.code + '\n//# sourceURL=' + f.name;
      document.body.appendChild(s);
    });
  }

  function loadLocal(i) {
    if (i >= LOCAL_FILES.length) return;
    var s = document.createElement('script');
    s.src = LOCAL_FILES[i];
    s.onload = function () { loadLocal(i + 1); };
    document.body.appendChild(s);
  }

  if (useBundle) {
    try { runBundle(cached); } catch (e) { /* handled below */ }
    // Inline scripts run synchronously, so a working bundle has already called started()
    if (get('boot.pending')) {
      set('bundle.bad', cached.version);
      set('boot.pending', null);
      location.reload();
    }
  } else {
    loadLocal(0);
  }

  // Look for a newer version once the app is up; it is used from the next launch
  setTimeout(function () { Boot.check().catch(function () {}); }, 15000);
})();
