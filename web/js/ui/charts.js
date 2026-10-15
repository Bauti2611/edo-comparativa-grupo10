/**
 * EDO.charts - Chart.js wrapper: theme-aware styling, projection-aware sizes and a data-table fallback.
 *
 *   EDO.charts.methodStyle(id)      -> {id, color, dash, pointStyle, width, radius, order}   (id: euler, taylor[2-4],
 *                                      heun, rk2, exact|reference). Colours come from the CSS tokens, so they
 *                                      follow the light/dark theme; width and dash follow the projection mode.
 *                                      Lines and markers are "nested" (RK2 widest and drawn first, then Euler
 *                                      Mejorado, Taylor, Euler, and the thin exact curve on top) so that curves
 *                                      that coincide still show every colour and marker shape.
 *   EDO.charts.dataset(id, label, data, extra) -> a Chart.js dataset styled for that method (managed:
 *                                      it is restyled automatically when the theme or the mode changes).
 *   EDO.charts.create(canvas, config, {title, tableAlt, signal}) -> {chart, update(patch), destroy(), mode, element}
 *       `config` is a normal Chart.js config {type, data, options}; theme options are merged underneath it.
 *       `title` names the chart for assistive technology and captions the table.
 *       `tableAlt`: true (default) adds a collapsible data table, false none, an Element renders the table there.
 *       `signal` (AbortSignal): the chart is destroyed when it aborts (pass ctx.signal inside a page).
 *       Without Chart.js (offline, ?nocdn=1) the datasets are shown as a table plus a one-line notice
 *       (`mode` is then 'table'); `chart` stays null.
 *       Append the canvas to the page first. A canvas that is not in the DOM yet gets wrapped and the
 *       outermost node is returned as `element`.
 *   EDO.charts.refresh()            re-applies theme and mode to every live chart (done automatically).
 *
 * Layout: the canvas lives in `.chart-box` (position: relative, fixed height from CSS) which avoids the
 * classic Chart.js endless-resize loop. Animations are disabled on purpose (live demos, no decorative motion).
 *
 * Load order: after deps.js, bus.js, prefs.js and dom.js.
 */
(function (root) {
  'use strict';

  const EDO = (root.EDO = root.EDO || {});
  const doc = root.document;
  const { h, clear } = EDO.dom;

  const NOTICE = 'No se pudo cargar la biblioteca de gráficos. Se muestran los datos en una tabla.';
  const MAX_TABLE_ROWS = 120;
  const live = new Set();

  /* ---- Tokens ---------------------------------------------------------------------------------- */

  const cssVar = (name) => root.getComputedStyle(doc.documentElement).getPropertyValue(name).trim();

  function cssPx(name, fallback) {
    const raw = cssVar(name);
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return fallback;
    return /rem$/.test(raw) ? value * parseFloat(root.getComputedStyle(doc.documentElement).fontSize) : value;
  }

  function theme() {
    return {
      text: cssVar('--chart-text') || '#37465c',
      grid: cssVar('--chart-grid') || '#dde3ec',
      axis: cssVar('--chart-axis') || '#6f7c91',
      surface: cssVar('--surface') || '#ffffff',
      tipBg: cssVar('--chart-tip-bg') || '#0f1a2b',
      tipFg: cssVar('--chart-tip-fg') || '#ffffff',
      font: cssVar('--font-sans') || 'sans-serif',
      size: cssPx('--chart-font', 13),
      line: parseFloat(cssVar('--chart-line')) || 2.25,
      point: parseFloat(cssVar('--chart-point')) || 4,
    };
  }

  /* ---- Method styles --------------------------------------------------------------------------- */

  /**
   * Per method: token, dash, marker, draw `order` (Chart.js draws a lower order last, i.e. on top) and the
   * line/marker scale relative to the mode's base size. Bigger things sit underneath smaller ones.
   */
  const METHOD_STYLES = {
    euler: { token: '--m-euler', dash: [2, 5], pointStyle: 'rect', order: 1, lineScale: 0.9, pointScale: 0.8 },
    taylor: { token: '--m-taylor', dash: [], pointStyle: 'circle', order: 2, lineScale: 1, pointScale: 0.85 },
    heun: { token: '--m-heun', dash: [10, 4], pointStyle: 'triangle', order: 3, lineScale: 1.25, pointScale: 1.2 },
    rk2: { token: '--m-rk2', dash: [4, 3], pointStyle: 'rectRot', order: 4, lineScale: 1.5, pointScale: 1.45 },
    exact: { token: '--m-exact', dash: [], pointStyle: 'line', order: 0, lineScale: 0.6, pointScale: 0 },
  };
  const ALIASES = {
    taylor2: 'taylor', taylor3: 'taylor', taylor4: 'taylor',
    reference: 'exact', referencia: 'exact', exacta: 'exact', ref: 'exact',
  };

  function methodStyle(id) {
    const key = ALIASES[id] || id;
    const base = METHOD_STYLES[key];
    const t = theme();
    if (!base) {
      return { id: key, color: cssVar('--ink-2') || '#37465c', dash: [], pointStyle: 'circle', width: t.line, radius: t.point, order: undefined };
    }
    const width = key === 'exact' ? Math.max(1.5, t.line * base.lineScale) : t.line * base.lineScale;
    const scale = width / 2.25;
    return {
      id: key,
      color: cssVar(base.token) || '#37465c',
      dash: base.dash.map((v) => Math.round(v * scale * 10) / 10),
      pointStyle: base.pointStyle,
      width: Math.round(width * 100) / 100,
      radius: Math.round(t.point * base.pointScale * 100) / 100,
      order: base.order,
    };
  }

  function styleProps(id, surface) {
    const s = methodStyle(id);
    const exact = s.id === 'exact';
    return {
      borderColor: s.color,
      backgroundColor: s.color,
      pointBackgroundColor: s.color,
      // Legends with usePointStyle draw the point style: the exact curve needs a visible stroke there.
      pointBorderColor: exact ? s.color : surface,
      pointBorderWidth: exact ? s.width : 1,
      borderWidth: s.width,
      borderDash: s.dash,
      pointStyle: s.pointStyle,
      pointRadius: s.radius,
      pointHoverRadius: exact ? 4 : s.radius + 2,
      ...(s.order === undefined ? {} : { order: s.order }),
    };
  }

  /**
   * Builds a dataset styled for a method.
   * @param {string} id Method id (see methodStyle).
   * @param {string} label Legend text.
   * @param {Array<{x: number, y: number}>} data Points.
   * @param {object} [extra] Any Chart.js dataset option (overrides the defaults, but a managed dataset is
   *   restyled on theme/mode changes).
   */
  function dataset(id, label, data, extra) {
    return Object.assign(
      { label, data, tension: 0, fill: false, edoMethod: id }, styleProps(id, theme().surface), extra || {},
    );
  }

  function restyle(datasets) {
    const surface = theme().surface;
    (datasets || []).forEach((ds) => {
      if (ds && ds.edoMethod) Object.assign(ds, styleProps(ds.edoMethod, surface));
    });
  }

  /* ---- Options ---------------------------------------------------------------------------------- */

  const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

  /** Deep merge of plain objects; arrays, functions and everything else from `over` replace `base`. */
  function merge(base, over) {
    const out = Object.assign({}, base);
    Object.keys(over || {}).forEach((key) => {
      out[key] = isPlain(out[key]) && isPlain(over[key]) ? merge(out[key], over[key]) : over[key];
    });
    return out;
  }

  /** Compact tooltip number: 7 significant digits, scientific notation for very small or large values. */
  function fmtValue(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e7)) return v.toExponential(3);
    return String(Number(v.toPrecision(7)));
  }

  /** Axis label of a logarithmic tick: plain decimals between 1e-3 and 1e4, otherwise `2e-5` style. */
  function fmtLogTick(v) {
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e4) return String(Number(v.toPrecision(3)));
    const [m, e] = v.toExponential(0).split('e');
    return `${m}e${Number(e)}`;
  }

  /**
   * Chart.js labels every 1..9 x 10^k tick of a logarithmic axis, which piles labels on top of each other.
   * Keep the labels at 1, 2 and 5 x 10^k when the axis spans few decades, and only at powers of ten otherwise.
   * A callback set by the page wins.
   */
  function tuneLogScales(options) {
    Object.keys(options.scales || {}).forEach((id) => {
      const sc = options.scales[id];
      if (!sc || sc.type !== 'logarithmic') return;
      const ticks = sc.ticks || (sc.ticks = {});
      if (ticks.callback) return;
      ticks.autoSkip = false;
      // Only exact 1/2/5 x 10^k values get a label: the axis ends (e.g. 0.15) and near-duplicates stay unlabeled.
      const nice = (v) => {
        const k = Math.floor(Math.log10(v) + 1e-9);
        const mant = v / 10 ** k;
        const m = Math.round(mant);
        return Math.abs(mant - m) < 1e-6 ? { m, k } : null;
      };
      ticks.callback = function logTick(value, index, all) {
        const v = Number(value);
        if (!(v > 0)) return null;
        const n = nice(v);
        const decades = Math.log10(this.max / this.min);
        if (!n || !(decades > 2.5 ? n.m === 1 : (n.m === 1 || n.m === 2 || n.m === 5))) return null;
        const prev = index > 0 && all[index - 1] ? nice(Number(all[index - 1].value)) : null;
        if (prev && prev.m === n.m && prev.k === n.k) return null;
        return fmtLogTick(v);
      };
    });
    return options;
  }

  function baseOptions(user) {
    const t = theme();
    const font = { family: t.font, size: t.size };
    const scale = () => ({
      grid: { color: t.grid },
      border: { color: t.axis },
      ticks: { color: t.text, font, maxRotation: 0, autoSkipPadding: t.size },
      title: { color: t.text, font: { family: t.font, size: t.size, weight: 'bold' } },
    });
    const scales = { x: scale(), y: scale() };
    Object.keys((user && user.scales) || {}).forEach((id) => { if (!scales[id]) scales[id] = scale(); });
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      locale: 'en-US', // decimal point on the axes, as in the cátedra's notation and the rest of the site
      color: t.text,
      font,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales,
      plugins: {
        legend: {
          position: 'bottom',
          // boxHeight sets the legend marker radius: kept small so a circle is not twice the size of a square.
          labels: { color: t.text, usePointStyle: true, boxWidth: t.size * 1.4, boxHeight: t.size * 0.7, padding: t.size * 1.25, font },
        },
        tooltip: {
          backgroundColor: t.tipBg,
          titleColor: t.tipFg,
          bodyColor: t.tipFg,
          padding: 10,
          cornerRadius: 6,
          usePointStyle: true,
          titleFont: font,
          bodyFont: font,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtValue(ctx.parsed && ctx.parsed.y)}`,
          },
        },
      },
    };
  }

  /* ---- Data table (alternative and fallback) ------------------------------------------------- */

  function seriesOf(config) {
    const data = (config && config.data) || {};
    const labels = data.labels || [];
    return (data.datasets || []).map((ds) => ({
      label: ds.label || '',
      points: (ds.data || []).map((p, i) => (p !== null && typeof p === 'object'
        ? { x: p.x, y: p.y }
        : { x: labels[i] !== undefined ? labels[i] : i, y: p })),
    }));
  }

  function cell(v) {
    if (typeof v !== 'number') return v === undefined || v === null ? '' : String(v);
    const fmt = EDO.format;
    if (!fmt || !Number.isFinite(v)) return String(v);
    const display = (EDO.prefs && EDO.prefs.get('display')) || { decimals: 4, mode: 'round' };
    const tiny = v !== 0 && Math.abs(v) < Math.pow(10, -display.decimals);
    return tiny ? fmt.sci(v, { digits: 3 }) : fmt.num(v, { decimals: display.decimals, mode: display.mode });
  }

  /** Row indices of a series: all of them, or evenly spaced (always including the last) when it is long. */
  function rowIndices(length) {
    if (length <= MAX_TABLE_ROWS) return Array.from({ length }, (v, i) => i);
    const out = [];
    for (let i = 0; i < MAX_TABLE_ROWS; i += 1) out.push(Math.round((i * (length - 1)) / (MAX_TABLE_ROWS - 1)));
    return out;
  }

  const samplingNote = (shown, total) => (total > shown
    ? h('p', { class: 'muted' }, `Se muestran ${shown} de ${total} puntos.`) : null);

  function sharedX(series) {
    const first = series[0].points;
    return series.every((s) => s.points.length === first.length && s.points.every((p, i) => p.x === first[i].x));
  }

  function tableFor(config, title) {
    const series = seriesOf(config).filter((s) => s.points.length > 0);
    const scales = (config.options && config.options.scales) || {};
    const xName = (scales.x && scales.x.title && scales.x.title.text) || 'x';
    const wrap = (table) => h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': `Datos: ${title || 'gráfico'}` }, table);
    // A <caption> scrolls with the table, so the visible label lives outside the scroller.
    const label = (text) => (text ? h('p', { class: 'muted' }, text) : null);
    const num = (value) => h('td', { class: 'num' }, cell(value));
    const head = (labels) => h('thead', null, h('tr', null, labels.map((label) => h('th', { scope: 'col', class: 'num' }, label))));
    if (series.length === 0) return h('p', { class: 'muted' }, 'No hay datos para mostrar.');

    if (sharedX(series)) {
      const rows = rowIndices(series[0].points.length);
      const table = h('table', null,
        title ? h('caption', { class: 'sr-only' }, title) : null,
        head([xName].concat(series.map((s) => s.label))),
        h('tbody', null, rows.map((i) => h('tr', null, num(series[0].points[i].x), series.map((s) => num(s.points[i].y))))));
      return h('div', { class: 'stack', style: { '--gap': '0.5rem' } }, label(title), wrap(table), samplingNote(rows.length, series[0].points.length));
    }
    return h('div', { class: 'stack' }, series.map((s) => {
      const rows = rowIndices(s.points.length);
      const table = h('table', null,
        h('caption', { class: 'sr-only' }, s.label),
        head([xName, 'y']),
        h('tbody', null, rows.map((i) => h('tr', null, num(s.points[i].x), num(s.points[i].y)))));
      return h('div', { class: 'stack', style: { '--gap': '0.5rem' } }, label(s.label), wrap(table), samplingNote(rows.length, s.points.length));
    }));
  }

  /* ---- Handle ------------------------------------------------------------------------------------ */

  function ensureBox(canvas) {
    const parent = canvas.parentNode;
    if (parent && parent.classList && parent.classList.contains('chart-box')) return parent;
    const box = h('div', { class: 'chart-box' });
    if (parent) parent.insertBefore(box, canvas);
    box.appendChild(canvas);
    return box;
  }

  function create(canvas, config, opts) {
    const o = opts || {};
    const title = o.title || '';
    const spec = { type: config.type || 'line', data: config.data || { datasets: [] }, options: config.options || {} };
    const box = ensureBox(canvas);
    let extra = box.nextElementSibling && box.nextElementSibling.classList.contains('chart-extra') ? box.nextElementSibling : null;
    let element = box;
    if (!extra) {
      extra = h('div', { class: 'chart-extra' });
      if (box.parentNode) {
        // Keep a figure's caption right under the chart: the data table goes after it.
        const next = box.nextElementSibling;
        const anchor = next && next.tagName === 'FIGCAPTION' ? next : box;
        box.parentNode.insertBefore(extra, anchor.nextSibling);
      } else {
        element = h('div', { class: 'chart' }, box, extra);
      }
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${title || 'Gráfico'}${o.tableAlt === false ? '' : '. Los datos están disponibles en la tabla.'}`);

    const handle = { chart: null, mode: 'pending', element, update, destroy, canvas };
    let destroyed = false;
    let details = null;
    let altBody = null;
    let altBuilt = false;

    // Actions toolbar placed above chart-box (reset zoom, presets)
    let actions = box.previousElementSibling && box.previousElementSibling.classList.contains('chart-actions')
      ? box.previousElementSibling
      : null;
    if (!actions && o.actions !== false && o.resetButton !== false) {
      actions = h('div', { class: 'chart-actions' });
      if (Array.isArray(o.tools)) {
        o.tools.forEach((btn) => { if (btn) actions.appendChild(btn); });
      }
      if (!o.customReset) {
        const resetBtn = h('button', {
          type: 'button',
          class: 'chart-tool-btn',
          title: o.resetTitle || 'Restablecer zoom y posición (Vista completa)',
          'aria-label': o.resetLabel || 'Restablecer gráfico',
          onclick: () => {
            if (handle.chart && typeof handle.chart.resetZoom === 'function') {
              handle.chart.resetZoom();
            }
            if (typeof o.onReset === 'function') {
              o.onReset();
            }
          },
        }, o.resetText || '↺ Restablecer');
        if (o.resetId) resetBtn.id = o.resetId;
        actions.appendChild(resetBtn);
      }
      if (box.parentNode) {
        box.parentNode.insertBefore(actions, box);
      }
    }

    const chartReady = () => Boolean(EDO.deps && EDO.deps.status.chart === 'loaded' && typeof root.Chart === 'function');
    const hostElement = o.tableAlt && o.tableAlt.nodeType === 1 ? o.tableAlt : null;

    function fillAlt() {
      if (!altBody) return;
      clear(altBody);
      altBody.appendChild(tableFor(spec, title));
      altBuilt = true;
    }

    function setupAlt() {
      if (o.tableAlt === false) return;
      if (hostElement) {
        clear(hostElement).appendChild(tableFor(spec, title));
        return;
      }
      altBody = h('div', { class: 'chart-alt__body' });
      details = h('details', { class: 'disclosure chart-alt' }, h('summary', null, 'Ver los datos del gráfico en una tabla'), altBody);
      details.addEventListener('toggle', () => { if (details.open && !altBuilt) fillAlt(); });
      extra.appendChild(details);
    }

    function showTableMode() {
      handle.mode = 'table';
      box.hidden = true;
      if (actions) actions.hidden = true;
      clear(extra);
      extra.appendChild(h('p', { class: 'chart-notice', role: 'status' }, NOTICE));
      if (hostElement) {
        clear(hostElement).appendChild(tableFor(spec, title));
      } else {
        extra.appendChild(tableFor(spec, title));
      }
      details = null;
      altBody = null;
    }

    function prepared() {
      restyle(spec.data.datasets);
      return { type: spec.type, data: spec.data, options: tuneLogScales(merge(baseOptions(spec.options), spec.options)) };
    }

    function mount() {
      if (destroyed) return;
      if (!chartReady()) {
        showTableMode();
        return;
      }
      try {
        handle.chart = new root.Chart(canvas, prepared());
        handle.mode = 'chart';
        live.add(handle);
        setupAlt();
      } catch (err) {
        handle.chart = null;
        showTableMode();
      }
    }

    /**
     * Replaces the data and/or merges options, then redraws.
     * @param {{data?: object, options?: object}} [patch]
     */
    function update(patch) {
      if (destroyed) return;
      if (patch && patch.data) spec.data = patch.data;
      if (patch && patch.options) spec.options = merge(spec.options, patch.options);
      if (handle.chart) {
        const next = prepared();
        handle.chart.data = next.data;
        handle.chart.options = next.options;
        handle.chart.update('none');
        altBuilt = false;
        if (details && details.open) fillAlt();
        else if (altBody) clear(altBody);
      } else if (handle.mode === 'table') {
        showTableMode();
      }
      if (hostElement && handle.mode === 'chart') clear(hostElement).appendChild(tableFor(spec, title));
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      live.delete(handle);
      if (handle.chart) {
        try {
          handle.chart.destroy();
        } catch (err) {
          /* already gone */
        }
      }
      handle.chart = null;
      if (actions && actions.parentNode) {
        actions.parentNode.removeChild(actions);
      }
    }

    handle.refresh = () => {
      if (!handle.chart || destroyed) return;
      if (!canvas.isConnected) {
        destroy();
        return;
      }
      const next = prepared();
      handle.chart.options = next.options;
      handle.chart.update('none');
    };

    if (o.signal) {
      if (o.signal.aborted) {
        destroyed = true;
        return handle;
      }
      o.signal.addEventListener('abort', destroy, { once: true });
    }

    const status = EDO.deps && EDO.deps.status ? EDO.deps.status.chart : 'failed';
    if (status === 'pending' && EDO.deps.chart && typeof EDO.deps.chart.then === 'function') {
      EDO.deps.chart.then(mount);
    } else {
      mount();
    }
    return handle;
  }

  function refresh() {
    Array.from(live).forEach((handle) => handle.refresh());
  }

  if (EDO.bus) {
    EDO.bus.on('theme:change', refresh);
    EDO.bus.on('mode:change', refresh);
  }
  if (doc.fonts && typeof doc.fonts.addEventListener === 'function') doc.fonts.addEventListener('loadingdone', refresh);

  EDO.charts = {
    create, methodStyle, dataset, refresh, NOTICE, count: () => live.size,
  };
}(typeof window !== 'undefined' ? window : this));
