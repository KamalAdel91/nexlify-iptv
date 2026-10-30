/* Minimal Xtream Codes API client. */
function Xtream(creds) {
  var server = String(creds.server || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
  this.server = server;
  this.username = String(creds.username || '').trim();
  this.password = String(creds.password || '').trim();
}

Xtream.prototype.api = function (params, timeoutMs) {
  var q = 'username=' + encodeURIComponent(this.username) + '&password=' + encodeURIComponent(this.password);
  Object.keys(params || {}).forEach(function (k) {
    q += '&' + k + '=' + encodeURIComponent(params[k]);
  });
  var url = this.server + '/player_api.php?' + q;
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;
  return fetch(url, ctrl ? { signal: ctrl.signal } : {})
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) { clearTimeout(timer); return data; },
          function (err) { clearTimeout(timer); throw err; });
};

Xtream.prototype.login = function () {
  return this.api({}, 20000).then(function (data) {
    if (!data || !data.user_info || String(data.user_info.auth) !== '1') {
      throw new Error('auth');
    }
    return data;
  });
};

function asArray(data) { return Array.isArray(data) ? data : []; }

Xtream.prototype.categories = function (kind) {
  var action = { live: 'get_live_categories', vod: 'get_vod_categories', series: 'get_series_categories' }[kind];
  return this.api({ action: action }).then(asArray);
};

Xtream.prototype.streams = function (kind) {
  var action = { live: 'get_live_streams', vod: 'get_vod_streams', series: 'get_series' }[kind];
  return this.api({ action: action }, 120000).then(asArray);
};

Xtream.prototype.seriesInfo = function (seriesId) {
  return this.api({ action: 'get_series_info', series_id: seriesId });
};

Xtream.prototype.shortEpg = function (streamId) {
  return this.api({ action: 'get_short_epg', stream_id: streamId, limit: 2 }, 15000)
    .then(function (data) { return (data && data.epg_listings) || []; });
};

Xtream.prototype.path = function (type) {
  return this.server + '/' + type + '/' + encodeURIComponent(this.username) + '/' + encodeURIComponent(this.password) + '/';
};

Xtream.prototype.liveUrl = function (streamId, format) {
  return this.path('live') + streamId + '.' + (format === 'ts' ? 'ts' : 'm3u8');
};

Xtream.prototype.movieUrl = function (streamId, ext) {
  return this.path('movie') + streamId + '.' + (ext || 'mp4');
};

Xtream.prototype.episodeUrl = function (episodeId, ext) {
  return this.path('series') + episodeId + '.' + (ext || 'mp4');
};
