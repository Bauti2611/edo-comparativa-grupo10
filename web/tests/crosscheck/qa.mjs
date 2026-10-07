// qa.mjs: headless Chromium QA harness over the Chrome DevTools Protocol (needs Node >= 22 and Chrome or Edge).
// Loads a URL exactly like a user would (real file:// semantics, no relaxed security flags), runs actions in
// command-line order, captures console errors/exceptions/failed requests and screenshots, prints a JSON report.
//
//   node qa.mjs --url <url> [--width 1280] [--height 900] [--scheme light|dark] [--reduced-motion] [--mobile]
//               [--offline] [--wait 1500] [--wait-for "<js expr>"] [--browser <exe>]
//               then any number of actions, executed in order:
//               --click "<css selector>"   --key "<Key>"   --eval "<js expr>"   --set "<selector>" "<value>"
//               --sleep <ms>   --shot <file.png>   --shot-full <file.png>   --goto "<url>"
// Exit code 1 when console errors, uncaught exceptions or failed (non-aborted) requests were seen.
//
// Example:  node qa.mjs --url "file:///C:/path/to/web/index.html#/teoria" --wait-for "window.EDO&&EDO.app&&EDO.app.ready"
//                       --eval "document.documentElement.scrollWidth<=innerWidth" --shot teoria.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const opt = { width: 1280, height: 900, scheme: null, wait: 1500, actions: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--url') opt.url = next();
  else if (a === '--width') opt.width = +next();
  else if (a === '--height') opt.height = +next();
  else if (a === '--scheme') opt.scheme = next();
  else if (a === '--wait') opt.wait = +next();
  else if (a === '--wait-for') opt.waitFor = next();
  else if (a === '--browser') opt.browser = next();
  else if (a === '--reduced-motion') opt.reduced = true;
  else if (a === '--mobile') opt.mobile = true;
  else if (a === '--offline') opt.offline = true;
  else if (a === '--set') opt.actions.push({ t: 'set', sel: next(), val: next() });
  else if (['--click', '--key', '--eval', '--sleep', '--shot', '--shot-full', '--goto'].includes(a)) opt.actions.push({ t: a.slice(2), v: next() });
  else { console.error('unknown arg ' + a); process.exit(2); }
}
if (!opt.url) { console.error('--url required'); process.exit(2); }

const candidates = [
  opt.browser,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const exe = candidates.find((p) => fs.existsSync(p));
if (!exe) { console.error('no Chromium-based browser found (pass --browser <exe>)'); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 600);
const udir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${udir}`, '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--disable-extensions', '--force-device-scale-factor=1',
  `--window-size=${opt.width},${opt.height}`, 'about:blank'], { stdio: 'ignore' });

const report = { url: opt.url, errors: [], warnings: [], failedRequests: [], evals: [], shots: [], notes: [] };
let ws, nextId = 0;
const pending = new Map();
const reqUrls = new Map();
const send = (method, params = {}) => new Promise((res) => { const id = ++nextId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  return { value: r.result?.result?.value };
};
let loadResolve;
const loaded = () => new Promise((r) => { loadResolve = r; });

function onEvent(m) {
  const p = m.params || {};
  if (m.method === 'Page.loadEventFired' && loadResolve) loadResolve();
  else if (m.method === 'Runtime.consoleAPICalled') {
    const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (p.type === 'error') report.errors.push({ source: 'console', text });
    else if (p.type === 'warning') report.warnings.push({ source: 'console', text });
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = p.exceptionDetails || {};
    report.errors.push({ source: 'exception', text: d.exception?.description || d.text, url: d.url, line: d.lineNumber });
  } else if (m.method === 'Log.entryAdded') {
    const e = p.entry || {};
    if (e.level === 'error') report.errors.push({ source: e.source, text: e.text, url: e.url });
    else if (e.level === 'warning') report.warnings.push({ source: e.source, text: e.text, url: e.url });
  } else if (m.method === 'Network.requestWillBeSent') reqUrls.set(p.requestId, p.request.url);
  else if (m.method === 'Network.loadingFailed' && !p.canceled && p.errorText !== 'net::ERR_ABORTED')
    report.failedRequests.push({ url: reqUrls.get(p.requestId), error: p.errorText });
}

async function shot(file, full) {
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    const h = Math.min(Math.ceil(m.result.cssContentSize.height), 9000);
    await send('Emulation.setDeviceMetricsOverride', { width: opt.width, height: h, deviceScaleFactor: 1, mobile: !!opt.mobile });
    await sleep(250);
  }
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  report.shots.push(file);
  if (full) await send('Emulation.setDeviceMetricsOverride', { width: opt.width, height: opt.height, deviceScaleFactor: 1, mobile: !!opt.mobile });
}

async function main() {
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* retry */ }
    await sleep(200);
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('browser did not expose a page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) onEvent(m);
  });
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await send(`${d}.enable`);
  await send('Emulation.setDeviceMetricsOverride', { width: opt.width, height: opt.height, deviceScaleFactor: 1, mobile: !!opt.mobile });
  if (opt.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const features = [];
  if (opt.scheme) features.push({ name: 'prefers-color-scheme', value: opt.scheme });
  if (opt.reduced) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (features.length) await send('Emulation.setEmulatedMedia', { features });
  if (opt.offline) await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });

  const go = async (url) => { const l = loaded(); await send('Page.navigate', { url }); await Promise.race([l, sleep(20000)]); };
  await go(opt.url);
  if (opt.waitFor) {
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { ok = !!(await evaluate(opt.waitFor)).value; if (!ok) await sleep(250); }
    if (!ok) report.notes.push(`wait-for timed out: ${opt.waitFor}`);
  }
  await sleep(opt.wait);

  for (const a of opt.actions) {
    if (a.t === 'click') { const r = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(a.v)});if(!e)return 'NOT FOUND';e.click();return 'clicked'})()`); report.notes.push(`click ${a.v}: ${r.value ?? r.error}`); await sleep(350); }
    else if (a.t === 'key') {
      const k = a.v; const text = k.length === 1 ? k : undefined;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text, code: text ? `Key${k.toUpperCase()}` : k });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: text ? `Key${k.toUpperCase()}` : k });
      await sleep(350);
    } else if (a.t === 'eval') { const r = await evaluate(a.v); report.evals.push({ expr: a.v, ...r }); }
    else if (a.t === 'set') { const r = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(a.sel)});if(!e)return 'NOT FOUND';e.value=${JSON.stringify(a.val)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'set'})()`); report.notes.push(`set ${a.sel}: ${r.value ?? r.error}`); await sleep(350); }
    else if (a.t === 'sleep') await sleep(+a.v);
    else if (a.t === 'shot') await shot(a.v, false);
    else if (a.t === 'shot-full') await shot(a.v, true);
    else if (a.t === 'goto') { await go(a.v); await sleep(opt.wait); }
  }
}

let code = 0;
try { await main(); }
catch (e) { report.errors.push({ source: 'qa-harness', text: String(e.stack || e) }); code = 2; }
finally {
  try { ws?.close(); } catch { /* ignore */ }
  proc.kill('SIGKILL');
  await sleep(500);
  try { fs.rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(JSON.stringify(report, null, 2));
process.exit(code || (report.errors.length || report.failedRequests.length ? 1 : 0));
