'use strict';
/**
 * The dependency loader (js/deps.js) run as the classic script it is, in a `vm` context with a fake document:
 * every <script> and <link> it appends is recorded and then answered as loaded or failed, so the tests can
 * check which URLs the page really asks for, in which order, and what each item's status ends up being.
 *
 * The item under test here is `zoom` (chartjs-plugin-zoom): it extends Chart.js instead of standing on its
 * own, so it must never be requested without Chart.js and must be registered on it when both arrive.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WEB_ROOT } = require('./helpers.js');

const SOURCE = fs.readFileSync(path.join(WEB_ROOT, 'js', 'deps.js'), 'utf8');
const CDN = 'https://cdn.jsdelivr.net/npm/';
const VERSIONS = {
  katex: '0.16.11', chart: '4.4.7', zoom: '2.2.0', hammer: '2.0.8',
};
const URLS = {
  katexCss: `${CDN}katex@${VERSIONS.katex}/dist/katex.min.css`,
  katexJs: `${CDN}katex@${VERSIONS.katex}/dist/katex.min.js`,
  katexAuto: `${CDN}katex@${VERSIONS.katex}/dist/contrib/auto-render.min.js`,
  chart: `${CDN}chart.js@${VERSIONS.chart}/dist/chart.umd.min.js`,
  hammer: `${CDN}hammerjs@${VERSIONS.hammer}/hammer.min.js`,
  zoom: `${CDN}chartjs-plugin-zoom@${VERSIONS.zoom}/dist/chartjs-plugin-zoom.min.js`,
};

/** What each URL does when the fake document fetches it: the globals it defines, or nothing when it fails. */
function defaultServer() {
  return {
    [URLS.katexCss]: (ctx) => { ctx.katexCss = true; return true; },
    [URLS.katexJs]: (ctx) => { ctx.katex = {}; return true; },
    [URLS.katexAuto]: (ctx) => { ctx.renderMathInElement = () => {}; return true; },
    [URLS.chart]: (ctx) => {
      const Chart = function Chart() {};
      Chart.register = (plugin) => { ctx.registered.push(plugin); };
      ctx.Chart = Chart;
      return true;
    },
    [URLS.hammer]: (ctx) => { ctx.Hammer = { Manager: function Manager() {} }; return true; },
    [URLS.zoom]: (ctx) => { ctx.ChartZoom = { id: 'zoom' }; return true; },
  };
}

/**
 * Runs deps.js in a fresh context.
 * @param {object} [opts] `server` overrides entries of `defaultServer` (a falsy handler fails the request),
 *   `search` is the URL query, `config` overrides `EDO.config.deps`.
 * @returns {{ctx: object, requests: string[], deps: object}}
 */
function runLoader(opts) {
  const o = opts || {};
  const server = Object.assign(defaultServer(), o.server || {});
  const requests = [];
  const ctx = {
    EDO: {
      config: {
        deps: Object.assign({
          vendored: false, katex: VERSIONS.katex, chart: VERSIONS.chart, zoom: VERSIONS.zoom, hammer: VERSIONS.hammer, fonts: false,
        }, o.config || {}),
      },
    },
    location: { search: o.search || '', hash: o.hash || '' },
    registered: [],
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    addEventListener: () => {},
  };
  ctx.window = ctx;
  ctx.document = {
    readyState: 'complete',
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), parentNode: null }),
    head: {
      appendChild(el) {
        const url = el.src || el.href;
        requests.push(url);
        el.parentNode = ctx.document.head;
        setTimeout(() => {
          const handler = Object.prototype.hasOwnProperty.call(server, url) ? server[url] : null;
          if (handler && handler(ctx) !== false) el.onload();
          else el.onerror();
        }, 0);
        return el;
      },
      removeChild: (el) => { el.parentNode = null; return el; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx, { filename: 'deps.js' });
  return { ctx, requests, deps: ctx.EDO.deps };
}

describe('EDO.deps: the zoom plugin is an extension of Chart.js, not a dependency of its own', () => {
  it('exposes a status and a promise per item, zoom among them', async () => {
    const { deps } = runLoader();
    assert.deepEqual(Object.keys(deps.status), ['katex', 'chart', 'zoom', 'fonts']);
    ['katex', 'chart', 'zoom', 'fonts'].forEach((name) => assert.equal(typeof deps[name].then, 'function', name));
    const status = await deps.ready;
    assert.equal(status, deps.status);
  });

  it('requests Hammer.js and then the plugin from the same CDN, at the exact pinned versions', async () => {
    const { requests, deps } = runLoader();
    await deps.ready;
    assert.ok(requests.includes(URLS.hammer), requests.join('\n'));
    assert.ok(requests.includes(URLS.zoom), requests.join('\n'));
    assert.ok(requests.indexOf(URLS.hammer) < requests.indexOf(URLS.zoom), 'Hammer.js first: only the pinch gesture needs it');
    requests.forEach((url) => assert.ok(url.startsWith(CDN) || url.startsWith('https://fonts.googleapis.com/'), url));
    // No moving tag: every request names a whole version.
    requests.filter((url) => url.startsWith(CDN)).forEach((url) => assert.match(url, /@\d+\.\d+\.\d+\//, url));
  });

  it('asks for the plugin only after Chart.js answered, and registers it on Chart.js', async () => {
    const { requests, deps, ctx } = runLoader();
    await deps.ready;
    assert.ok(requests.indexOf(URLS.chart) < requests.indexOf(URLS.hammer), 'Chart.js is requested first');
    assert.equal(deps.status.chart, 'loaded');
    assert.equal(deps.status.zoom, 'loaded');
    assert.deepEqual(ctx.registered, [ctx.ChartZoom]);
  });

  it('never requests the plugin when Chart.js did not arrive, and reports it skipped', async () => {
    const { requests, deps, ctx } = runLoader({ server: { [URLS.chart]: null } });
    await deps.ready;
    assert.equal(deps.status.chart, 'failed');
    assert.equal(deps.status.zoom, 'skipped');
    assert.ok(!requests.includes(URLS.zoom), 'the plugin would throw while it evaluates without window.Chart');
    assert.ok(!requests.includes(URLS.hammer));
    assert.deepEqual(ctx.registered, []);
  });

  it('reports the plugin failed, and leaves Chart.js loaded, when it does not arrive', async () => {
    const { deps, ctx } = runLoader({ server: { [URLS.zoom]: null } });
    await deps.ready;
    assert.equal(deps.status.chart, 'loaded');
    assert.equal(deps.status.zoom, 'failed');
    assert.deepEqual(ctx.registered, []);
  });

  it('reports the plugin failed when the script arrives but defines no global to register', async () => {
    const { deps, ctx } = runLoader({ server: { [URLS.zoom]: () => true } });
    await deps.ready;
    assert.equal(deps.status.zoom, 'failed');
    assert.deepEqual(ctx.registered, []);
  });

  it('keeps the plugin loaded when Hammer.js fails: only the pinch gesture needs it', async () => {
    const { requests, deps, ctx } = runLoader({ server: { [URLS.hammer]: null } });
    await deps.ready;
    assert.ok(requests.includes(URLS.zoom), 'the plugin is still requested');
    assert.equal(deps.status.zoom, 'loaded');
    assert.deepEqual(ctx.registered, [ctx.ChartZoom]);
  });

  it('?nocdn=1 skips every item without making a single request', async () => {
    const { requests, deps, ctx } = runLoader({ search: '?nocdn=1' });
    const status = await deps.ready;
    assert.equal(deps.noCdn, true);
    // The object comes from the vm context, so it is compared by value, not by prototype.
    assert.deepEqual(Object.assign({}, status), {
      katex: 'skipped', chart: 'skipped', zoom: 'skipped', fonts: 'skipped',
    });
    assert.deepEqual(requests, []);
    assert.deepEqual(ctx.registered, []);
  });

  it('tries the vendored copies of the plugin first when the project vendored them', async () => {
    const { requests, deps } = runLoader({
      config: { vendored: true },
      server: {
        'vendor/chart/chart.umd.min.js': (ctx) => {
          const Chart = function Chart() {};
          Chart.register = (plugin) => { ctx.registered.push(plugin); };
          ctx.Chart = Chart;
          return true;
        },
        'vendor/zoom/hammer.min.js': (ctx) => { ctx.Hammer = {}; return true; },
        'vendor/zoom/chartjs-plugin-zoom.min.js': (ctx) => { ctx.ChartZoom = { id: 'zoom' }; return true; },
      },
    });
    await deps.ready;
    assert.equal(deps.status.zoom, 'loaded');
    assert.ok(requests.includes('vendor/zoom/chartjs-plugin-zoom.min.js'), requests.join('\n'));
    assert.ok(!requests.includes(URLS.zoom), 'the CDN is not asked once the local copy answered');
  });

  it('falls back to the CDN when the vendored plugin is missing', async () => {
    const { requests, deps } = runLoader({ config: { vendored: true } });
    await deps.ready;
    assert.ok(requests.includes('vendor/zoom/chartjs-plugin-zoom.min.js'));
    assert.ok(requests.includes(URLS.zoom));
    assert.equal(deps.status.zoom, 'loaded');
  });

  it('documents the four items and the zoom rule in its own header', () => {
    const header = SOURCE.slice(0, SOURCE.indexOf('(function'));
    assert.match(header, /\{katex, chart, zoom, fonts\}/);
    assert.match(header, /only requested once Chart\.js/i);
  });
});
