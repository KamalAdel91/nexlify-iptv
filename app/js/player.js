/*
 * Video playback. HLS (.m3u8) and VOD files use the TV's native player;
 * MPEG-TS live streams go through mpegts.js (Media Source Extensions).
 */
var Player = (function () {
  'use strict';

  var video, ts = null, token = 0, handlers = {};

  function init(h) {
    handlers = h || {};
    video = Util.$('video');
    var spinner = Util.$('spinner');
    video.addEventListener('waiting', function () { Util.show(spinner, true); });
    video.addEventListener('loadstart', function () { Util.show(spinner, true); });
    video.addEventListener('playing', function () { Util.show(spinner, false); });
    video.addEventListener('canplay', function () { Util.show(spinner, false); });
    video.addEventListener('ended', function () { if (handlers.onEnded) handlers.onEnded(); });
    video.addEventListener('timeupdate', function () { if (handlers.onTime) handlers.onTime(); });
    video.addEventListener('error', function () {
      if (!video.getAttribute('src')) return;
      Util.show(spinner, false);
      if (handlers.onError) handlers.onError('native');
    });
  }

  function destroyTs() {
    if (!ts) return;
    try { ts.pause(); ts.unload(); ts.detachMediaElement(); ts.destroy(); } catch (e) { /* already torn down */ }
    ts = null;
  }

  function stop() {
    token++;
    destroyTs();
    video.pause();
    video.removeAttribute('src');
    video.load();
    Util.show(Util.$('spinner'), false);
  }

  function playNative(url, startAt) {
    video.src = url;
    if (startAt) {
      var seekOnce = function () {
        video.removeEventListener('loadedmetadata', seekOnce);
        try { video.currentTime = startAt; } catch (e) { /* not seekable */ }
      };
      video.addEventListener('loadedmetadata', seekOnce);
    }
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay errors surface via the error event */ });
  }

  function playTs(url, my) {
    Util.show(Util.$('spinner'), true);
    Util.loadMpegts().then(function (mpegts) {
      if (my !== token) return;
      if (!mpegts.getFeatureList().mseLivePlayback) { playNative(url); return; }
      ts = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: url },
        { enableWorker: false, lazyLoad: false, liveBufferLatencyChasing: true, autoCleanupSourceBuffer: true }
      );
      ts.on(mpegts.Events.ERROR, function () {
        if (my !== token) return;
        Util.show(Util.$('spinner'), false);
        if (handlers.onError) handlers.onError('ts');
      });
      ts.attachMediaElement(video);
      ts.load();
      var p = ts.play();
      if (p && p.catch) p.catch(function () {});
    }, function () {
      // No mpegts.js and no internet for the CDN copy: let the TV try the stream itself
      if (my === token) playNative(url);
    });
  }

  /* opts: { live: bool, ts: bool, startAt: seconds } */
  function play(url, opts) {
    stop();
    var my = token;
    opts = opts || {};
    if (opts.live && opts.ts) playTs(url, my);
    else playNative(url, opts.startAt);
  }

  function togglePause() {
    if (video.paused) video.play(); else video.pause();
    return video.paused;
  }

  function seek(delta) {
    if (!isFinite(video.duration)) return;
    video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), video.duration - 1);
  }

  return {
    init: init, play: play, stop: stop, togglePause: togglePause, seek: seek,
    time: function () { return video.currentTime || 0; },
    duration: function () { return isFinite(video.duration) ? video.duration : 0; },
    paused: function () { return video.paused; }
  };
})();
