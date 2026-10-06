/**
 * EDO.deps - loader for the third-party dependencies, with graceful degradation.
 *
 *   EDO.deps.status  {katex, chart, fonts}: 'pending' | 'loaded' | 'failed' | 'skipped'
 *   EDO.deps.katex / .chart / .fonts   promises (never reject) that resolve to the final status of each item
 *   EDO.deps.ready   promise (never rejects) that resolves to `status` once all three have settled
 *
 * Sources: with config.deps.vendored === true the local copy under web/vendor/ is tried first (never
 * requested when false, so no 404s in the console), then the jsDelivr CDN:
 *   KaTeX      {katex.min.css, katex.min.js, contrib/auto-render.min.js}  (version config.deps.katex)
 *   Chart.js   dist/chart.umd.min.js                                       (version config.deps.chart)
 *   Fonts      Google Fonts (Public Sans: plain zero, unlike Atkinson), injected after the first paint, never blocking.
 * Vendored layout: vendor/katex/{katex.min.css, katex.min.js, contrib/auto-render.min.js, fonts/*.woff2}
 * and vendor/chart/chart.umd.min.js.
 *
 * `?nocdn=1` (in the URL query, or after the hash route) skips everything WITHOUT making any request,
 * to test the offline degradation. Each item has a timeout, so a hung network becomes 'failed'.
 *
 * Load order: after config.js, before everything that renders (tex.js and charts.js wait on these promises).
 */
(function (root) {
  'use strict';

  const EDO = (root.EDO = root.EDO || {});
  const doc = root.document;
  const cfg = (EDO.config && EDO.config.deps) || {};

  const TIMEOUT_MS = 12000;
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap';

  const safeDecode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch (err) {
      return s;
    }
  };

  /** True when ?name (or ?name=1) is present in the URL query or in the query of the hash route. */
  function readFlag(name) {
    const sources = [];
    try { sources.push(root.location.search.replace(/^\?/, '')); } catch (err) { /* ignore */ }
    try {
      const hash = root.location.hash;
      const at = hash.indexOf('?');
      if (at !== -1) sources.push(hash.slice(at + 1));
    } catch (err) { /* ignore */ }
    for (let i = 0; i < sources.length; i += 1) {
      const pairs = sources[i].split('&');
      for (let j = 0; j < pairs.length; j += 1) {
        const at = pairs[j].indexOf('=');
        const key = safeDecode(at === -1 ? pairs[j] : pairs[j].slice(0, at));
        if (key === name) {
          const value = at === -1 ? '' : safeDecode(pairs[j].slice(at + 1));
          return !/^(0|false|no|off)$/i.test(value);
        }
      }
    }
    return false;
  }

  function loadScript(url) {
    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const el = doc.createElement('script');
      el.src = url;
      el.async = true;
      el.onload = () => finish(true);
      el.onerror = () => {
        if (el.parentNode) el.parentNode.removeChild(el);
        finish(false);
      };
      timer = setTimeout(() => finish(false), TIMEOUT_MS);
      (doc.head || doc.documentElement).appendChild(el);
    });
  }

  function loadStyle(url) {
    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const el = doc.createElement('link');
      el.rel = 'stylesheet';
      el.href = url;
      el.onload = () => finish(true);
      el.onerror = () => {
        if (el.parentNode) el.parentNode.removeChild(el);
        finish(false);
      };
      timer = setTimeout(() => finish(false), TIMEOUT_MS);
      (doc.head || doc.documentElement).appendChild(el);
    });
  }

  const katexVersion = cfg.katex || '0.16.11';
  const chartVersion = cfg.chart || '4.4.7';
  const katexDist = `${CDN}katex@${katexVersion}/dist/`;
  const katexBundles = (cfg.vendored ? [{
    css: 'vendor/katex/katex.min.css', js: 'vendor/katex/katex.min.js', auto: 'vendor/katex/contrib/auto-render.min.js',
  }] : []).concat([{
    css: `${katexDist}katex.min.css`, js: `${katexDist}katex.min.js`, auto: `${katexDist}contrib/auto-render.min.js`,
  }]);
  const chartBundles = (cfg.vendored ? [{ js: 'vendor/chart/chart.umd.min.js' }] : []).concat([{
    js: `${CDN}chart.js@${chartVersion}/dist/chart.umd.min.js`,
  }]);

  async function loadKatexBundle(bundle) {
    const results = await Promise.all([loadStyle(bundle.css), loadScript(bundle.js)]);
    if (!results[0] || !results[1] || !root.katex) return false;
    return (await loadScript(bundle.auto)) && typeof root.renderMathInElement === 'function';
  }

  async function loadChartBundle(bundle) {
    return (await loadScript(bundle.js)) && typeof root.Chart === 'function';
  }

  async function firstThatLoads(bundles, loadOne) {
    for (let i = 0; i < bundles.length; i += 1) {
      if (await loadOne(bundles[i])) return true;
    }
    return false;
  }

  /** Fonts: after the first paint, never blocking the page. */
  function loadFonts() {
    return new Promise((resolve) => {
      const start = () => { loadStyle(FONTS_URL).then(resolve); };
      const afterPaint = () => root.requestAnimationFrame(() => setTimeout(start, 0));
      if (doc.readyState === 'complete') afterPaint();
      else root.addEventListener('load', afterPaint, { once: true });
    });
  }

  const noCdn = readFlag('nocdn');
  const status = { katex: 'pending', chart: 'pending', fonts: 'pending' };

  function settle(name, promise) {
    return promise.then(
      (ok) => { status[name] = ok ? 'loaded' : 'failed'; return status[name]; },
      () => { status[name] = 'failed'; return status[name]; },
    );
  }

  function skipped(name) {
    status[name] = 'skipped';
    return Promise.resolve('skipped');
  }

  const katex = noCdn ? skipped('katex') : settle('katex', firstThatLoads(katexBundles, loadKatexBundle));
  const chart = noCdn ? skipped('chart') : settle('chart', firstThatLoads(chartBundles, loadChartBundle));
  const fonts = noCdn || cfg.fonts === false ? skipped('fonts') : settle('fonts', loadFonts());
  const ready = Promise.all([katex, chart, fonts]).then(() => status);

  EDO.deps = { status, katex, chart, fonts, ready, noCdn, FONTS_URL };
}(typeof window !== 'undefined' ? window : this));
