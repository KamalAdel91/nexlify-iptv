#!/usr/bin/env node
/*
 * Collects the Developer Mode token of every LG TV registered with ares-setup-device
 * and stores them all in the GitHub secret LG_DEVMODE_TOKENS, which the daily
 * "Extend LG Developer Mode" workflow reads (one token per line).
 *
 * Usage: node scripts/sync-tokens.js [tv-name ...]
 *   With names, only those TVs are asked again; the others keep their last token.
 * Tokens are remembered in %APPDATA%\Nexlify\devmode-tokens.json, because GitHub
 * secrets cannot be read back. Needs the GitHub CLI (gh), signed in.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const SECRET = 'LG_DEVMODE_TOKENS';
const STORE = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'Nexlify', 'devmode-tokens.json');

function run(cmd, opts) {
  return execSync(cmd, Object.assign({ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }, opts));
}

function fail(msg) {
  console.log('[X] ' + msg);
  process.exit(1);
}

// "owner/repo" of this clone, so the secret lands in the right repository
function repoName() {
  try {
    const url = run('git -C "' + path.join(__dirname, '..') + '" remote get-url origin').trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (m) return m[1];
  } catch (e) { /* fall through */ }
  return 'KamalAdel91/nexlify-iptv';
}

// TVs registered with ares-setup-device, without the built-in emulator entry
function registeredTvs() {
  let out;
  try { out = run('ares-setup-device --listfull'); } catch (e) { fail('webOS CLI not found. Run:  npm install -g @webos-tools/cli'); }
  try {
    return JSON.parse(out).map((d) => d.name).filter((n) => n && n !== 'emulator');
  } catch (e) {
    // Older CLI: read the first column of the table
    return out.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0])
      .filter((n) => n && !/^(name|-+)$/.test(n) && n !== 'emulator');
  }
}

function fetchToken(name) {
  try {
    const out = run('ares-novacom --device ' + name + ' --run "cat /var/luna/preferences/devmode_enabled"').trim();
    const token = out.split(/\r?\n/).pop().trim();
    return /^[A-Za-z0-9+/=_-]{16,}$/.test(token) ? token : null;
  } catch (e) {
    return null;
  }
}

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { return {}; }
}

// ---- main ----
try { run('gh auth status'); } catch (e) {
  fail('GitHub CLI is not installed or not signed in. Install it (winget install --id GitHub.cli), then run:  gh auth login');
}

const tvs = registeredTvs();
if (!tvs.length) fail('No TVs registered. Add one with scripts\\setup-new-tv.bat first.');

const asked = process.argv.slice(2);
const tokens = loadStore();
const missing = [];

for (const name of tvs) {
  // Ask a TV again when it was named, or when its token is not known yet
  if (asked.length && asked.indexOf(name) < 0 && tokens[name]) continue;
  process.stdout.write('[*] ' + name + ': ');
  const token = fetchToken(name);
  if (token) { tokens[name] = token; console.log('token read'); }
  else if (tokens[name]) console.log('not reachable, keeping its last token');
  else { console.log('not reachable'); missing.push(name); }
}

// Never upload a list that would silently drop a TV from the daily extension
if (missing.length) {
  fail('No token for: ' + missing.join(', ') + '. Turn ' + (missing.length > 1 ? 'those TVs' : 'it') +
    ' on (Developer Mode active, same Wi-Fi) and run scripts\\sync-tokens.bat again.\n' +
    '    A TV you no longer use can be removed with:  ares-setup-device -r <name>');
}

// Forget TVs that were removed from ares-setup-device
for (const name of Object.keys(tokens)) if (tvs.indexOf(name) < 0) delete tokens[name];

fs.mkdirSync(path.dirname(STORE), { recursive: true });
fs.writeFileSync(STORE, JSON.stringify(tokens, null, 2));

const repo = repoName();
try {
  run('gh secret set ' + SECRET + ' --repo ' + repo, { input: Object.keys(tokens).map((n) => tokens[n]).join('\n') });
} catch (e) {
  fail('Could not update the GitHub secret: ' + String(e.stderr || e.message).trim());
}
console.log('[OK] ' + SECRET + ' on ' + repo + ' now holds ' + Object.keys(tokens).length + ' TV(s): ' + Object.keys(tokens).join(', '));
