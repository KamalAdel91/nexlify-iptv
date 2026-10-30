/* Shared helpers. Plain scripts (no modules) so the app runs from file:// on webOS 6 (Chromium 79). */
var Util = (function () {
  'use strict';

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 461, ESC: 27, BACKSPACE: 8,
    CH_UP: 33, CH_DOWN: 34,
    PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413, FF: 417, RW: 412,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406
  };

  // Each subscription keeps its own favorites, positions and so on under a scope;
  // these keys are shared by all of them.
  var GLOBAL = { lang: 1, theme: 1, accounts: 1, activeAccount: 1, liveFormat: 1, creds: 1 };
  var scope = '';
  function fullKey(key) {
    return 'iptv.' + (scope && !GLOBAL[key] ? scope + '.' : '') + key;
  }

  var store = {
    get: function (key, def) {
      try {
        var v = localStorage.getItem(fullKey(key));
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set: function (key, value) {
      try { localStorage.setItem(fullKey(key), JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
    },
    remove: function (key) {
      try { localStorage.removeItem(fullKey(key)); } catch (e) { /* ignore */ }
    },
    setScope: function (s) { scope = s || ''; },
    // Removes everything a subscription stored under its scope
    clearScope: function (s) {
      if (!s) return;
      try {
        var prefix = 'iptv.' + s + '.', keys = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) keys.push(k);
        }
        keys.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) { /* ignore */ }
    }
  };

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function show(node, on) { node.classList.toggle('hidden', !on); }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    show(t, true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { show(t, false); }, ms || 3000);
  }

  function loading(on, text) {
    $('loading-text').textContent = text || '';
    show($('loading'), on);
  }

  // Xtream returns EPG titles as base64-encoded UTF-8
  function b64(s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(atob(s))); } catch (e) { return s; }
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var mm = (h && m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return (h ? h + ':' : '') + mm + ':' + ss;
  }

  function clock(ts) {
    var d = new Date(ts * 1000);
    var m = d.getMinutes();
    return d.getHours() + ':' + (m < 10 ? '0' : '') + m;
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  // Load mpegts.js on demand when the bundled copy is missing
  var mpegtsPromise = null;
  function loadMpegts() {
    if (window.mpegts) return Promise.resolve(window.mpegts);
    if (!mpegtsPromise) {
      mpegtsPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js';
        s.onload = function () { window.mpegts ? resolve(window.mpegts) : reject(new Error('mpegts')); };
        s.onerror = function () { mpegtsPromise = null; reject(new Error('mpegts')); };
        document.head.appendChild(s);
      });
    }
    return mpegtsPromise;
  }

  /* ---------- TV platform: LG webOS or Samsung Tizen ---------- */

  var tizen = typeof window.tizen !== 'undefined' && !!window.tizen.tvinputdevice;

  // Samsung remotes send other codes for a few keys: map them to the webOS ones the app uses
  var TIZEN_KEYS = { 10009: KEY.BACK, 427: KEY.CH_UP, 428: KEY.CH_DOWN };
  function normalizeKey(code) {
    return tizen && TIZEN_KEYS[code] ? TIZEN_KEYS[code] : code;
  }

  // Samsung only delivers media, colour, channel and number keys that the app asks for
  function initPlatform() {
    if (!tizen) return;
    var wanted = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
      'ChannelUp', 'ChannelDown', 'ColorF2Yellow', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    try {
      var supported = window.tizen.tvinputdevice.getSupportedKeys().map(function (k) { return k.name; });
      window.tizen.tvinputdevice.registerKeyBatch(wanted.filter(function (n) { return supported.indexOf(n) >= 0; }));
    } catch (e) { /* older firmware: the arrows, OK and Back still work */ }
  }

  function exitApp() {
    if (tizen) {
      try { window.tizen.application.getCurrentApplication().exit(); return; } catch (e) { /* fall through */ }
    }
    window.close();
  }

  return {
    KEY: KEY, store: store, $: $, el: el, show: show, toast: toast, loading: loading,
    b64: b64, fmtTime: fmtTime, clock: clock, debounce: debounce, loadMpegts: loadMpegts,
    isTizen: tizen, normalizeKey: normalizeKey, initPlatform: initPlatform, exitApp: exitApp
  };
})();
