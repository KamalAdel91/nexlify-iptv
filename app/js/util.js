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

  var store = {
    get: function (key, def) {
      try {
        var v = localStorage.getItem('iptv.' + key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set: function (key, value) {
      try { localStorage.setItem('iptv.' + key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
    },
    remove: function (key) {
      try { localStorage.removeItem('iptv.' + key); } catch (e) { /* ignore */ }
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

  return {
    KEY: KEY, store: store, $: $, el: el, show: show, toast: toast, loading: loading,
    b64: b64, fmtTime: fmtTime, clock: clock, debounce: debounce, loadMpegts: loadMpegts
  };
})();
