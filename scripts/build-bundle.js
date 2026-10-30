#!/usr/bin/env node
/*
 * Builds bundle.json, the over-the-internet update that installed TVs download
 * (see app/js/boot.js). Usage: node scripts/build-bundle.js <output-file>
 * Bump APP_VERSION in app/js/version.js and appinfo.json before publishing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
const JS = ['js/util.js', 'js/i18n.js', 'js/xtream.js', 'js/vlist.js', 'js/player.js', 'js/app.js'];
const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'bundle.json');

const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

const version = (read('js/version.js').match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
const appinfo = JSON.parse(read('appinfo.json'));
if (!version) throw new Error('APP_VERSION not found in js/version.js');
if (appinfo.version !== version) {
  throw new Error(`Version mismatch: version.js has ${version}, appinfo.json has ${appinfo.version}`);
}

// The page markup without the script tags; boot.js puts it in place of the packaged body
const index = read('index.html');
const body = index.slice(index.indexOf('<body>') + '<body>'.length, index.indexOf('<script'));
if (!body.trim()) throw new Error('Could not extract the page markup from index.html');

const bundle = {
  version,
  built: new Date().toISOString(),
  html: body,
  css: read('css/app.css'),
  js: JS.map((name) => ({ name, code: read(name) }))
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(bundle));
console.log(`bundle.json ${version} -> ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
