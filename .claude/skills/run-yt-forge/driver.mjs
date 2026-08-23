// REPL driver for YT-Forge (Electron) — drive the real app with Playwright.
// Designed for agents: run inside tmux, send commands as lines, capture output.
//
//   node .claude/skills/run-yt-forge/driver.mjs
//
// Prerequisites: `npm install`, `npm run build:main && npm run build:preload`,
// and the vite dev server running on :5173 (see SKILL.md).
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { createRequire } from 'node:module';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(APP_DIR, 'package.json'));
const { _electron: electron } = require('playwright-core');

const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), 'yt-forge-shots');
const MAIN_LOG = path.join(SHOT_DIR, 'main-process.log');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let app = null;
let page = null;

const electronBin = process.platform === 'darwin'
  ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(APP_DIR, 'node_modules/electron/dist/electron');

const checkVite = () => new Promise((resolve) => {
  const req = http.get('http://localhost:5173', (res) => { res.resume(); resolve(true); });
  req.on('error', () => resolve(false));
  req.setTimeout(2000, () => { req.destroy(); resolve(false); });
});

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');

    if (!fs.existsSync(path.join(APP_DIR, 'dist-electron/main.js')) ||
        !fs.existsSync(path.join(APP_DIR, 'dist-electron/preload.js'))) {
      return console.log('ERROR: dist-electron incomplete — run `npm run build:main && npm run build:preload` first (main empties the dir, preload must be built after)');
    }
    if (!(await checkVite())) {
      return console.log('ERROR: vite dev server not reachable on :5173 — run `npx vite --config vite.renderer.config.mjs &` first');
    }

    // Strip VS Code's ELECTRON_RUN_AS_NODE or the app launches as plain Node
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    app = await electron.launch({
      executablePath: electronBin,
      args: [APP_DIR],
      env,
      timeout: 30_000,
    });

    // Mirror main-process stdout/stderr to a file for debugging
    try {
      const proc = app.process();
      fs.writeFileSync(MAIN_LOG, '');
      proc.stdout?.on('data', d => fs.appendFileSync(MAIN_LOG, d));
      proc.stderr?.on('data', d => fs.appendFileSync(MAIN_LOG, d));
    } catch (e) { console.log('main log capture failed:', e.message); }

    page = await app.firstWindow();
    globalThis.__logs = [];
    page.on('console', m => globalThis.__logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', e => globalThis.__logs.push(`[pageerror] ${e.message}`));
    await page.waitForSelector('header', { timeout: 20_000 }).catch(() => {});
    console.log('launched.', app.windows().length, 'windows:');
    for (const w of app.windows()) console.log(' ', w.url());
    console.log('main-process log:', MAIN_LOG);
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  // DOM click — fine for plain buttons; Radix Select/portals need `pwclick`
  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel);
    console.log('click', sel, '→', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"], span, h3, p')];
      const el = els.find(e => e.textContent?.trim() === t)
              ?? els.find(e => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName;
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  // Real Playwright click (trusted pointer events): pwclick <index> <css-sel>
  async pwclick(rest) {
    if (!page) return console.log('ERROR: launch first');
    const m = rest.match(/^(\d+)\s+(.+)$/);
    const idx = m ? parseInt(m[1]) : 0;
    const sel = m ? m[2] : rest;
    try {
      await page.locator(sel).nth(idx).click({ timeout: 5000 });
      console.log('pwclick OK', idx, sel);
    } catch (e) { console.log('pwclick FAIL:', e.message.split('\n')[0]); }
  },

  // Set the URL input (React controlled input needs the native setter)
  async seturl(url) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((u) => {
      const input = document.querySelector('header input');
      if (!input) return 'NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, u);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK';
    }, url);
    console.log('seturl →', r);
  },

  async type(text)  { if (page) await page.keyboard.type(text, { delay: 30 }); },
  async press(key)  { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 30_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try {
      console.log(JSON.stringify(await page.evaluate(expr)));
    } catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  logs() { (globalThis.__logs || []).slice(-25).forEach(l => console.log(l)); },

  async reload() { if (page) { await page.reload(); await new Promise(r => setTimeout(r, 2000)); console.log('reloaded'); } },

  async quit() { if (app) await app.close().catch(() => {}); app = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

// Raw fd read protects the REPL's stdin from being stolen by child processes
const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async line => {
  const trimmed = line.trim();
  if (!trimmed) return rl.prompt();
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, '— try: help'); return rl.prompt(); }
  try { await fn(rest); } catch (e) { console.log('ERROR:', e.message); }
  console.log('::done::');
  if (cmd === 'quit') { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });

console.log('yt-forge driver — "help" for commands, "launch" to start');
rl.prompt();
