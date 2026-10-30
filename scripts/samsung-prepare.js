#!/usr/bin/env node
/*
 * Builds the Samsung (Tizen) version of the app in build/tizen: the same app
 * folder as LG, with tizen/config.xml (version filled in) instead of appinfo.json.
 * Used by scripts/samsung-install.bat; `tizen package` turns the folder into a .wgt.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const OUT = path.join(ROOT, 'build', 'tizen');

const version = (fs.readFileSync(path.join(APP, 'js', 'version.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
if (!version) throw new Error('APP_VERSION not found in app/js/version.js');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name === 'appinfo.json') continue;   // LG only
    const src = path.join(from, name), dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(APP, OUT);
const config = fs.readFileSync(path.join(ROOT, 'tizen', 'config.xml'), 'utf8').split('{{VERSION}}').join(version);
fs.writeFileSync(path.join(OUT, 'config.xml'), config);
console.log(`[*] Samsung app ${version} prepared in ${path.relative(ROOT, OUT)}`);
