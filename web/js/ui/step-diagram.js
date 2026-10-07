/**
 * EDO.stepDiagram - "El paso": one step of size h from (x_n, y_n), built the way each method builds it,
 * drawn over the slope field next to the exact curve. It is the signature figure of the site.
 *
 *   EDO.stepDiagram.mount(container, opts) -> {update(opts), destroy(), getState(), readout(), element}
 *
 *   opts.problem      preset id or Problem (default 'cmp_2xy_13': the cátedra's y' = 2xy, y(1) = 1)
 *   opts.x0, opts.y0  starting point (x_n, y_n); default the problem's own initial condition. A different point
 *                     has no closed form, so the curve is then the RK4 "referencia" through it.
 *   opts.h            step (default 0.4: large enough for the three constructions to be told apart); the slider
 *                     runs over opts.hMin..opts.hMax in steps of opts.hStep (defaults 0.05..0.5 step 0.05). The
 *                     frame of the picture is fixed for the whole range, so only the step moves when the slider does.
 *   opts.methods      'all' (toggles for Euler, Taylor, Euler Mejorado and RK2) or one of euler|taylor|heun|rk2:
 *                     a single method shows only its own construction and has no method toggles.
 *   opts.visible      with methods 'all': the ids that start checked (default taylor, heun, rk2).
 *   opts.showField    slope field on/off (default true), opts.construction auxiliary points and slopes on/off
 *   opts.signal       AbortSignal (pass ctx.signal inside a page): the diagram is destroyed when it aborts
 *
 *   update(next)      merges new options (everything above except `signal`) and repaints at once. A new `problem`
 *                     also resets x0 and y0 to its own initial condition unless they are given; a new `methods`
 *                     resets `visible` unless it is given.
 *   getState()        plain copy of the current state: {problem (id), x0, y0, h, hMin, hMax, hStep, methods,
 *                     visible, showField, construction}.
 *   readout()         the numbers on screen, {rows, exactText, exactLabel, sentence} (what the table shows).
 *   destroy()         removes the element and every listener; also runs when `opts.signal` aborts.
 *   element           the root element, already inside `container`.
 *   chart             (getter, for debugging) the Chart.js instance, or null while it loads or when it is unavailable.
 *
 * The slider repaints on every `input` event (one repaint per frame at most) and the live summary follows when it
 * settles (350 ms without input, or its `change` event); the method and display switches repaint at once. The
 * picture is redrawn on `theme:change`, `mode:change` and `prefs:change` (display), so it follows the theme, the
 * projection mode and the decimals / truncation setting. A container that is attached later is waited for.
 *
 * Everything numeric comes from the engine: `methods.solve(id, problem, {h, N: 1})` for each method and the
 * exact solution (or the RK4 reference) for the error brackets and the readout. Colours, dashes and marker
 * shapes come from EDO.charts.methodStyle, so they follow the theme and the projection mode. The picture is
 * drawn by Chart.js plus one small plugin (slope field, guides, error brackets with their values); without
 * Chart.js the visible readout table is the data alternative, with a one-line notice. No animations.
 *
 * The pure part (`model`, `readout`, `stepAt`, `frameFor`, `valueText`, `errorText`, plus `buildDatasets`,
 * `chartOptions`, `spreadLabels` and the Chart.js `plugin`) also `require`s in Node without a DOM, where it is
 * unit-tested; `_env` is the test seam (set `_env.charts` to a stub of EDO.charts there).
 * Load order: after charts.js (it uses EDO.dom, EDO.tex, EDO.charts, EDO.prefs, EDO.deps and EDO.bus).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // `env` is the same object the factory reads `EDO.charts` from, so a test can plug a stub into it.
    const env = {
      expr: require('../numerics/expr.js'),
      format: require('../numerics/format.js'),
      problems: require('../numerics/problems.js'),
      methods: require('../numerics/methods.js'),
      analysis: require('../numerics/analysis.js'),
    };
    module.exports = Object.assign(factory(env), { _env: env });
  } else {
    root.EDO = root.EDO || {};
    root.EDO.stepDiagram = factory(root.EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const { expr, format, problems, methods, analysis } = EDO;

  const IDS = Object.freeze(['euler', 'taylor', 'heun', 'rk2']);
  const LABELS = Object.freeze({
    euler: 'Euler', taylor: 'Taylor (grado 2)', heun: 'Euler Mejorado', rk2: 'RK2 (punto medio)',
  });
  const CHIP_LABELS = Object.freeze({
    euler: 'Euler', taylor: 'Taylor', heun: 'Euler Mejorado', rk2: 'RK2 (punto medio)',
  });
  /** The three methods of the course start checked; Euler (the baseline) is one click away. */
  const DEFAULT_VISIBLE = Object.freeze(['taylor', 'heun', 'rk2']);
  const DEFAULTS = Object.freeze({
    problem: 'cmp_2xy_13', h: 0.4, hMin: 0.05, hMax: 0.5, hStep: 0.05, methods: 'all', showField: true, construction: true,
  });
  const PLUGIN_ID = 'edoStep';
  const CURVE_POINTS = 90;
  const PARABOLA_POINTS = 24;
  const TICK_HALF = 0.16; // half-width of a slope tick, as a fraction of h

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ======================================================================================================
     Model (pure): numbers and geometry of one step
     ====================================================================================================== */

  function resolveProblem(spec) {
    if (spec && typeof spec === 'object' && typeof spec.f === 'function') return spec;
    return problems.fromPreset(typeof spec === 'string' && spec ? spec : DEFAULTS.problem);
  }

  /**
   * The one-step problem from (x0, y0) with step h. The closed form is kept only when (x0, y0) is the
   * problem's own initial condition: any other starting point lies on a different solution.
   */
  function stepProblem(problem, x0, y0, h) {
    if (!problem.fStr) return problem; // hand-built problem without source text: use it as given
    const same = Math.abs(x0 - problem.x0) < 1e-12 && Math.abs(y0 - problem.y0) < 1e-12;
    return problems.make({
      id: problem.id, title: problem.title, indep: problem.indep, fStr: problem.fStr, x0, y0, xf: x0 + h, h, exact: same ? problem.exact : null,
    });
  }

  /** Exact (or RK4 reference) values at the abscissas. */
  function curveValues(base, xs) {
    return base.exact ? xs.map((x) => base.exact.fn(x)) : analysis.reference(base, xs);
  }

  const tick = (xc, yc, slope, half) => [{ x: xc - half, y: yc - slope * half }, { x: xc + half, y: yc + slope * half }];

  /**
   * One step of every method from (x0, y0) with step h, with the points and slopes of each construction.
   * @param {object} problem A Problem.
   * @param {number} x0 Abscissa x_n.
   * @param {number} y0 Ordinate y_n.
   * @param {number} h Step (> 0).
   * @returns {object} `{h, x0, y0, x1, exact, reference, base, methods: {id: {id, valid, y1, error, ...}}}`;
   *   `error` is the absolute difference with `exact`; per-method geometry: euler `{slope, line}`,
   *   taylor `{derivs, tangent, curve}`, heun `{slope, yPred, slopeEnd, slopeAvg, predLine, tick, line}`,
   *   rk2 `{k1, xMid, yMid, slopeMid, halfLine, tick, line}`.
   */
  function stepAt(problem, x0, y0, h) {
    const base = stepProblem(problem, x0, y0, h);
    const x1 = x0 + h;
    const exactY1 = curveValues(base, [x0, x1])[1];
    const half = TICK_HALF * h;
    const out = {
      h, x0, y0, x1, exact: exactY1, reference: !base.exact, base, methods: {},
    };
    IDS.forEach((id) => {
      const sol = methods.solve(id, base, { h, N: 1 });
      const step = sol.steps[0];
      const y1 = step ? step.yn1 : NaN;
      const entry = { id, valid: finite(y1) && finite(exactY1), y1, error: Math.abs(y1 - exactY1) };
      if (step) {
        const d = step.detail;
        if (id === 'euler') {
          Object.assign(entry, { slope: d.slope, line: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
        } else if (id === 'taylor') {
          const q = (x) => y0 + d.derivs[0] * (x - x0) + (d.derivs[1] * (x - x0) ** 2) / 2;
          Object.assign(entry, {
            derivs: d.derivs.slice(0, 2),
            tangent: [{ x: x0, y: y0 }, { x: x1, y: y0 + d.derivs[0] * h }],
            curve: Array.from({ length: PARABOLA_POINTS + 1 }, (v, i) => { const x = x0 + (i * h) / PARABOLA_POINTS; return { x, y: q(x) }; }),
          });
        } else if (id === 'heun') {
          Object.assign(entry, {
            slope: d.slope, yPred: d.yPred, slopeEnd: d.slopeEnd, slopeAvg: d.slopeAvg,
            predLine: [{ x: x0, y: y0 }, { x: x1, y: d.yPred }],
            tick: tick(x1, d.yPred, d.slopeEnd, half),
            line: [{ x: x0, y: y0 }, { x: x1, y: y1 }],
          });
        } else {
          Object.assign(entry, {
            k1: d.k1, xMid: d.xMid, yMid: d.yMid, slopeMid: d.slopeMid,
            halfLine: [{ x: x0, y: y0 }, { x: d.xMid, y: d.yMid }],
            tick: tick(d.xMid, d.yMid, d.slopeMid, half),
            line: [{ x: x0, y: y0 }, { x: x1, y: y1 }],
          });
        }
      }
      out.methods[id] = entry;
    });
    return out;
  }

  /** Ordinates that must fit in the frame for a step of size h (start, end points, auxiliary points, exact). */
  function stepOrdinates(m) {
    const vals = [m.y0, m.exact];
    IDS.forEach((id) => {
      const e = m.methods[id];
      if (!e.valid) return;
      vals.push(e.y1);
      if (finite(e.yPred)) vals.push(e.yPred);
      if (finite(e.yMid)) vals.push(e.yMid);
    });
    return vals.filter(finite);
  }

  /**
   * The fixed frame of the picture, computed for the largest step so that nothing jumps while h changes.
   * @returns {{xMin: number, xMax: number, yMin: number, yMax: number}}
   */
  function frameFor(problem, x0, y0, hMax) {
    const xMin = x0 - 0.25 * hMax;
    const xMax = x0 + 1.35 * hMax;
    const m = stepAt(problem, x0, y0, hMax);
    const xs = Array.from({ length: 33 }, (v, i) => xMin + (i * (x0 + hMax - xMin)) / 32);
    const vals = stepOrdinates(m).concat(curveValues(m.base, xs).filter(finite));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.1;
    return { xMin, xMax, yMin: lo - pad, yMax: hi + pad };
  }

  /** The dense curve (exact or RK4 reference) over the frame, without non-finite points. */
  function curveFor(problem, x0, y0, frame) {
    const base = stepProblem(problem, x0, y0, DEFAULTS.hStep);
    const xs = Array.from({ length: CURVE_POINTS }, (v, i) => frame.xMin + (i * (frame.xMax - frame.xMin)) / (CURVE_POINTS - 1));
    const ys = curveValues(base, xs);
    return xs.map((x, i) => ({ x, y: ys[i] })).filter((p) => finite(p.y));
  }

  /**
   * The options with every default applied and every value made safe: `h` clamped into the slider range,
   * `mode` ('all' or one method id) and `visible` (the ids that are drawn and listed, in catalogue order).
   */
  function normalize(opts) {
    const o = opts || {};
    const problem = resolveProblem(o.problem);
    const x0 = finite(o.x0) ? o.x0 : problem.x0;
    const y0 = finite(o.y0) ? o.y0 : problem.y0;
    const hMin = finite(o.hMin) && o.hMin > 0 ? o.hMin : DEFAULTS.hMin;
    const hMax = Math.max(hMin, finite(o.hMax) ? o.hMax : DEFAULTS.hMax);
    const hStep = finite(o.hStep) && o.hStep > 0 ? o.hStep : DEFAULTS.hStep;
    const h = clamp(finite(o.h) ? o.h : DEFAULTS.h, hMin, hMax);
    const mode = o.methods === undefined || o.methods === 'all' ? 'all' : (IDS.includes(o.methods) ? o.methods : 'all');
    const requested = Array.isArray(o.visible) ? IDS.filter((id) => o.visible.includes(id)) : DEFAULT_VISIBLE.slice();
    return {
      problem, x0, y0, h, hMin, hMax, hStep, mode,
      visible: mode === 'all' ? requested : [mode],
      showField: o.showField === undefined ? DEFAULTS.showField : Boolean(o.showField),
      construction: o.construction === undefined ? DEFAULTS.construction : Boolean(o.construction),
    };
  }

  /**
   * The fixed frame and the dense curve depend on the starting point and on the largest step, not on `h`: a caller
   * that repaints on every slider event passes the same `cache` object to reuse them.
   */
  function frameAndCurve(s, cache) {
    if (cache && cache.problem === s.problem && cache.x0 === s.x0 && cache.y0 === s.y0 && cache.hMax === s.hMax) return cache;
    const frame = frameFor(s.problem, s.x0, s.y0, s.hMax);
    const out = {
      problem: s.problem, x0: s.x0, y0: s.y0, hMax: s.hMax, frame, curve: curveFor(s.problem, s.x0, s.y0, frame),
    };
    if (cache) Object.assign(cache, out);
    return out;
  }

  /**
   * Pure model of the diagram for the given options (see the header): the numbers of one step for every
   * method, the fixed frame and the dense curve. Nothing here touches the DOM.
   * @param {object} [opts] The options of `mount` (the ones about the picture).
   * @param {object} [cache] Optional object kept by the caller between calls (see `frameAndCurve`).
   * @returns {object} `stepAt`'s result plus `options` (normalized), `frame` and `curve`.
   */
  function model(opts, cache) {
    const s = normalize(opts);
    const step = stepAt(s.problem, s.x0, s.y0, s.h);
    const { frame, curve } = frameAndCurve(s, cache);
    return Object.assign({}, step, { options: s, frame, curve });
  }

  /* ======================================================================================================
     Readout (pure): the values as text
     ====================================================================================================== */

  /** Decimals of the display setting (EDO.prefs `display`), 4 as in the apunte when it is missing or invalid. */
  function decimalsOf(display) {
    const d = display && display.decimals;
    return Number.isInteger(d) ? clamp(d, 0, 12) : 4;
  }

  /** Decimals needed to write a step such as 0.05 or 0.125 exactly (at least 2): the slider's value and the summary. */
  function stepDecimals(step) {
    const text = String(step);
    const at = text.indexOf('.');
    return Math.min(6, Math.max(2, at < 0 ? 0 : text.length - at - 1));
  }

  /** The step h as text, with as many decimals as the slider's step needs ("0.30"). */
  function stepText(h, step) {
    return format.num(h, { decimals: stepDecimals(step === undefined ? DEFAULTS.hStep : step), trim: false });
  }

  /** y values at the display setting's decimals (trailing zeros dropped), truncated or rounded as the setting says. */
  function valueText(v, display) {
    const d = display || {};
    return format.num(v, { decimals: decimalsOf(d), mode: d.mode === 'trunc' ? 'trunc' : 'round' });
  }

  /** Errors with 4 decimals, or 3 significant digits in scientific form below 1e-3 (a fixed format shows 0 there). */
  function errorText(v) {
    if (!finite(v)) return '—';
    return v !== 0 && Math.abs(v) < 1e-3 ? format.sci(v, { digits: 3 }) : format.num(v, { decimals: 4, mode: 'round' });
  }

  /** The numbers behind a method's construction, as one short phrase (what the auxiliary marks of the picture mean). */
  function constructionText(e, display) {
    const n = (v) => valueText(v, display);
    if (!e.valid) return '—';
    if (e.id === 'euler') return `pendiente ${n(e.slope)}`;
    if (e.id === 'taylor') return `y' = ${n(e.derivs[0])}; y'' = ${n(e.derivs[1])}`;
    if (e.id === 'heun') return `pendientes ${n(e.slope)} y ${n(e.slopeEnd)}; promedio ${n(e.slopeAvg)}`;
    return `k1 = ${n(e.k1)}; pendiente en el punto medio: ${n(e.slopeMid)}`;
  }

  /**
   * The readout of a model as plain text: one row per method id (in the order given) and the exact value.
   * @param {object} m Result of `model`.
   * @param {string[]} ids Method ids to list.
   * @param {{decimals?: number, mode?: 'round'|'trunc'}} [display] How y values are shown (EDO.prefs `display`).
   * @returns {{rows: object[], exactText: string, exactLabel: string, sentence: string}}
   *   `rows[i]` is `{id, label, construction, y1Text, errorText}`; `sentence` is the whole readout in one phrase.
   */
  function readout(m, ids, display) {
    const list = (ids || IDS).filter((id) => IDS.includes(id));
    const rows = list.map((id) => {
      const e = m.methods[id];
      return {
        id,
        label: LABELS[id],
        construction: constructionText(e, display),
        y1Text: e.valid ? valueText(e.y1, display) : '—',
        errorText: e.valid ? errorText(e.error) : '—',
      };
    });
    const exactLabel = m.reference ? 'Referencia (RK4)' : 'Exacta';
    const exactText = valueText(m.exact, display);
    const indep = (m.base && m.base.indep) || 'x';
    const h = stepText(m.h, m.options && m.options.hStep);
    const parts = rows.map((r) => `${r.label}: ${r.y1Text} (error ${r.errorText})`);
    const start = `(${format.num(m.x0, { decimals: 4 })}, ${format.num(m.y0, { decimals: 4 })})`;
    const target = `Valor ${m.reference ? 'de referencia' : 'exacto'} en ${indep} = ${format.num(m.x1, { decimals: 4 })}: ${exactText}.`;
    const sentence = `Paso h = ${h} desde ${start}. ${target}${parts.length ? ` ${parts.join('; ')}.` : ''}`;
    return { rows, exactText, exactLabel, sentence };
  }

  /* ======================================================================================================
     Chart.js plugin: slope field, guides, error brackets and labels (drawn in pixel space)
     ====================================================================================================== */

  const win = typeof window !== 'undefined' ? window : null;

  function cssVar(name, fallback) {
    try {
      const value = win.getComputedStyle(win.document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    } catch (err) {
      return fallback;
    }
  }

  /** Short line segments along the slope of f, with the visual angle taken from both axis scales. */
  function drawField(ctx, area, sx, sy, f, size) {
    const cell = Math.max(40, size * 3.6);
    const nx = Math.max(6, Math.floor(area.width / cell));
    const ny = Math.max(5, Math.floor(area.height / cell));
    const dx = area.width / nx;
    const dy = area.height / ny;
    const len = Math.min(dx, dy) * 0.5;
    const ppx = area.width / (sx.max - sx.min);
    const ppy = area.height / (sy.max - sy.min);
    ctx.beginPath();
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) {
        const px = area.left + (i + 0.5) * dx;
        const py = area.top + (j + 0.5) * dy;
        const slope = f(sx.min + (px - area.left) / ppx, sy.max - (py - area.top) / ppy);
        if (finite(slope)) {
          const vx = ppx;
          const vy = -slope * ppy;
          const norm = Math.hypot(vx, vy);
          const ux = (vx / norm) * (len / 2);
          const uy = (vy / norm) * (len / 2);
          ctx.moveTo(px - ux, py - uy);
          ctx.lineTo(px + ux, py + uy);
        }
      }
    }
    ctx.stroke();
  }

  /** Italic variable with a subscript ("x" + "n+1"); the digits and the plus sign stay upright. */
  function drawSubscripted(ctx, base, sub, px, py, size, family, align) {
    const subSize = Math.round(size * 0.74 * 10) / 10;
    const piece = (text, italic, s) => {
      ctx.font = `${italic ? 'italic ' : ''}${s}px ${family}`;
      return { text, italic, s, w: ctx.measureText(text).width };
    };
    const parts = [piece(base, true, size)].concat(sub.split('').map((ch) => piece(ch, /[a-z]/i.test(ch), subSize)));
    const total = parts.reduce((sum, p) => sum + p.w, 0);
    let x = align === 'right' ? px - total : (align === 'center' ? px - total / 2 : px);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    parts.forEach((p, i) => {
      ctx.font = `${p.italic ? 'italic ' : ''}${p.s}px ${family}`;
      ctx.fillText(p.text, x, i === 0 ? py : py + size * 0.24);
      x += p.w;
    });
  }

  /** Marker of a method's end point as a glyph: circle, triangle, square, diamond ('rectRot') or a short bar. */
  function drawMarker(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (shape === 'triangle') {
      ctx.moveTo(x, y - r * 1.1);
      ctx.lineTo(x + r * 1.05, y + r * 0.85);
      ctx.lineTo(x - r * 1.05, y + r * 0.85);
      ctx.closePath();
    } else if (shape === 'rect') {
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    } else if (shape === 'rectRot') {
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.2, y);
      ctx.lineTo(x, y + r * 1.2);
      ctx.lineTo(x - r * 1.2, y);
      ctx.closePath();
    } else {
      ctx.rect(x - r * 1.1, y - Math.max(1, r * 0.18), r * 2.2, Math.max(2, r * 0.36));
    }
    ctx.fill();
  }

  /** Text with a halo in the surface colour, so it stays readable over the slope field and the curves. */
  function haloText(ctx, str, x, y, halo, fill, align, baseline) {
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = halo;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  /**
   * Vertical positions for a column of labels: each keeps its preferred position when it can, neighbours are at
   * least `gap` apart, the order of the preferred positions is kept and the column stays inside [top, bottom]
   * whenever it fits there at all.
   * @param {number[]} ys Preferred positions (any order).
   * @param {number} gap Minimum distance between two labels.
   * @param {number} top Lowest allowed position (smallest y).
   * @param {number} bottom Highest allowed position (largest y).
   * @returns {number[]} The positions, in the order of `ys`.
   */
  function spreadLabels(ys, gap, top, bottom) {
    const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
    const out = ys.slice();
    let previous = top - gap;
    order.forEach((i) => {
      out[i] = Math.max(ys[i], previous + gap, top);
      previous = out[i];
    });
    let next = bottom + gap;
    for (let k = order.length - 1; k >= 0; k -= 1) {
      const i = order[k];
      out[i] = Math.min(out[i], next - gap, bottom);
      next = out[i];
    }
    return out;
  }

  const stepPlugin = {
    id: PLUGIN_ID,

    beforeDatasetsDraw(chart, args, o) {
      if (!o || !o.active) return;
      const area = chart.chartArea;
      const sx = chart.scales.x;
      const sy = chart.scales.y;
      if (!area || !sx || !sy) return;
      const ctx = chart.ctx;
      const size = (chart.options.font && chart.options.font.size) || 13;
      const line = cssVar('--border-strong', '#6f7c91');
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.width, area.height);
      ctx.clip();
      if (o.field && o.field.enabled && typeof o.field.f === 'function') {
        ctx.strokeStyle = line;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = Math.max(1.1, size * 0.1);
        ctx.lineCap = 'round';
        drawField(ctx, area, sx, sy, o.field.f, size);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      [o.x0, o.x1].forEach((xv) => {
        const px = sx.getPixelForValue(xv);
        ctx.beginPath();
        ctx.moveTo(px, area.top);
        ctx.lineTo(px, area.bottom);
        ctx.stroke();
      });
      ctx.restore();
    },

    afterDatasetsDraw(chart, args, o) {
      if (!o || !o.active) return;
      const area = chart.chartArea;
      const sx = chart.scales.x;
      const sy = chart.scales.y;
      if (!area || !sx || !sy) return;
      const ctx = chart.ctx;
      const size = (chart.options.font && chart.options.font.size) || 13;
      const family = (chart.options.font && chart.options.font.family) || 'sans-serif';
      const text = cssVar('--chart-text', '#37465c');
      const ink = cssVar('--ink', '#0f1a2b');
      const px0 = sx.getPixelForValue(o.x0);
      const px1 = sx.getPixelForValue(o.x1);
      ctx.save();

      // x_n and x_{n+1} flank the step, above the plotting area.
      ctx.fillStyle = text;
      const labelY = area.top - Math.max(5, size * 0.45);
      drawSubscripted(ctx, 'x', 'n', px0 - 4, labelY, size, family, 'right');
      drawSubscripted(ctx, 'x', 'n+1', px1 + 4, labelY, size, family, 'left');

      // The step h as a dimension line near the bottom edge.
      if (px1 - px0 > size * 1.6) {
        const yy = area.bottom - Math.max(8, size * 0.8);
        ctx.strokeStyle = text;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px0, yy);
        ctx.lineTo(px1, yy);
        ctx.moveTo(px0, yy - 4);
        ctx.lineTo(px0, yy + 4);
        ctx.moveTo(px1, yy - 4);
        ctx.lineTo(px1, yy + 4);
        ctx.stroke();
        ctx.font = `italic ${size}px ${family}`;
        haloText(ctx, 'h', (px0 + px1) / 2, yy - 5, cssVar('--surface', '#ffffff'), text, 'center', 'alphabetic');
      }

      // Error brackets: one vertical segment per method from its y_{n+1} to the exact value, side by side.
      const list = o.brackets || [];
      const gap = Math.max(6, size * 0.5);
      const cap = Math.max(3, size * 0.24);
      const first = px1 + (o.clear || 8);
      list.forEach((b, i) => {
        const bx = first + i * gap;
        const ya = sy.getPixelForValue(b.y1);
        const yb = sy.getPixelForValue(b.y2);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.width;
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(bx, ya);
        ctx.lineTo(bx, yb);
        ctx.moveTo(bx - cap, ya);
        ctx.lineTo(bx + cap, ya);
        if (Math.abs(ya - yb) > 1.5) {
          ctx.moveTo(bx - cap, yb);
          ctx.lineTo(bx + cap, yb);
        }
        ctx.stroke();
      });

      // Value labels in one column to the right of the brackets: the exact value and every y_{n+1}, each with the
      // marker of its method, spread apart so that they never overlap. A label that does not fit is left out
      // (the readout table next to the picture always has the numbers).
      const radius = Math.max(3, size * 0.32);
      const markerX = first + Math.max(0, list.length - 1) * gap + gap + 6 + radius;
      const textX = markerX + radius + 6;
      const items = [];
      if (o.exactLabel) {
        const withValue = o.exactText ? `${o.exactLabel} ${o.exactText}` : '';
        items.push({
          y: sy.getPixelForValue(o.exactY), shape: 'line', color: ink, ink: true, texts: [withValue, o.exactLabel].filter(Boolean),
        });
      }
      list.forEach((b) => {
        if (b.label) items.push({ y: sy.getPixelForValue(b.y1), shape: b.shape, color: b.color, texts: [b.label] });
      });
      ctx.font = `${size}px ${family}`;
      const room = chart.width - 2 - textX;
      const shown = items
        .map((item) => Object.assign(item, { text: item.texts.find((t) => ctx.measureText(t).width <= room) }))
        .filter((item) => item.text);
      const rows = spreadLabels(shown.map((s) => s.y), size * 1.3, area.top + size * 0.7, area.bottom - size * 0.7);
      const halo = cssVar('--surface', '#ffffff');
      shown.forEach((item, i) => {
        ctx.fillStyle = item.color;
        drawMarker(ctx, item.shape, markerX, rows[i], radius);
        ctx.font = `${size}px ${family}`;
        haloText(ctx, item.text, textX, rows[i], halo, item.ink ? ink : text);
      });
      ctx.restore();
    },
  };

  const registered = new WeakSet();

  function registerPlugin(Chart) {
    if (!Chart || registered.has(Chart)) return;
    registered.add(Chart);
    try {
      Chart.register(stepPlugin);
    } catch (err) {
      /* already registered */
    }
  }

  /* ======================================================================================================
     Datasets and chart options (styles from EDO.charts.methodStyle)
     ====================================================================================================== */

  /**
   * Chart.js datasets of one model: the exact curve, the start and exact points and, per visible method, its
   * construction (thin lines and hollow markers) and its result (the method's own line and a filled marker).
   */
  function buildDatasets(m, st) {
    const style = (id) => EDO.charts.methodStyle(id);
    const surface = cssVar('--surface', '#ffffff');
    const ex = style('exact');
    const sets = [];
    const bigger = 1.7;
    const dataset = (label, data, s, extra) => Object.assign({
      type: 'line',
      label,
      data,
      tension: 0,
      fill: false,
      borderColor: s.color,
      backgroundColor: s.color,
      borderWidth: s.width,
      borderDash: s.dash,
      pointStyle: s.pointStyle,
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,
      pointBackgroundColor: s.color,
      pointBorderColor: surface,
      pointBorderWidth: 1.5,
      order: s.order,
    }, extra || {});
    const lastOnly = (n, r) => Array.from({ length: n }, (v, i) => (i === n - 1 ? r : 0));
    const thin = (s) => ({ borderWidth: Math.max(1.25, s.width * 0.5), borderDash: [] });
    const hollow = (s, r, n) => ({
      pointRadius: lastOnly(n, r), pointBackgroundColor: surface, pointBorderColor: s.color, pointBorderWidth: Math.max(2, s.width * 0.8),
    });
    const filled = (s, n) => ({ pointRadius: lastOnly(n, s.radius * bigger) });

    const reference = m.reference;
    sets.push(dataset(reference ? 'Referencia (RK4)' : 'Solución exacta', m.curve, ex, { order: 0 }));

    st.visible.forEach((id) => {
      const e = m.methods[id];
      if (!e.valid) return;
      const s = style(id);
      const aux = st.construction;
      if (id === 'euler') {
        sets.push(dataset('Euler: tangente en el punto inicial', e.line, s, filled(s, 2)));
      } else if (id === 'taylor') {
        if (aux && st.mode === 'taylor') sets.push(dataset('Taylor: tangente (término de grado 1)', e.tangent, s, thin(s)));
        sets.push(dataset('Taylor: parábola de grado 2', e.curve, s, filled(s, e.curve.length)));
      } else if (id === 'heun') {
        if (aux) {
          sets.push(dataset('Euler Mejorado: predictor (paso de Euler)', e.predLine, s, Object.assign(thin(s), hollow(s, s.radius * 1.25, 2))));
          sets.push(dataset('Euler Mejorado: pendiente en el predictor', e.tick, s, thin(s)));
        }
        sets.push(dataset('Euler Mejorado: pendiente promedio', e.line, s, filled(s, 2)));
      } else {
        if (aux) {
          sets.push(dataset('RK2: medio paso de Euler hasta el punto medio', e.halfLine, s, Object.assign(thin(s), hollow(s, s.radius * 1.25, 2))));
          sets.push(dataset('RK2: pendiente en el punto medio', e.tick, s, thin(s)));
        }
        sets.push(dataset('RK2: paso completo con la pendiente del punto medio', e.line, s, filled(s, 2)));
      }
    });

    sets.push(dataset('Punto de partida', [{ x: m.x0, y: m.y0 }], ex, {
      order: -2, pointStyle: 'circle', pointRadius: Math.max(4.5, ex.radius * 1.6), pointBackgroundColor: ex.color, pointBorderColor: surface, pointBorderWidth: 2,
    }));
    sets.push(dataset(reference ? 'Referencia en x_{n+1}' : 'Valor exacto en x_{n+1}', [{ x: m.x1, y: m.exact }], ex, {
      order: -2, pointStyle: 'circle', pointRadius: Math.max(5.5, ex.radius * 1.9), pointBackgroundColor: surface, pointBorderColor: ex.color, pointBorderWidth: Math.max(2.25, ex.width * 1.4),
    }));
    return sets;
  }

  /**
   * Chart.js options of one model: the fixed frame, no interaction (the picture is a figure, the readout is the
   * data) and the `edoStep` plugin options: guides, slope field, and per shown method a bracket
   * `{y1, y2, color, width, shape, label}` from its y_{n+1} to the exact value.
   * @param {object} m Result of `model`.
   * @param {object} st `{visible, showField}` (the normalized options of the model do).
   * @param {{decimals?: number, mode?: string}} [display] How the value labels are written.
   */
  function chartOptions(m, st, display) {
    const style = (id) => EDO.charts.methodStyle(id);
    const size = parseFloat(cssVar('--chart-font', '13')) || 13;
    const fontPx = /rem$/.test(cssVar('--chart-font', '')) ? size * (parseFloat(win.getComputedStyle(win.document.documentElement).fontSize) || 16) : size;
    const shown = st.visible.filter((id) => m.methods[id].valid);
    const brackets = shown.map((id) => {
      const s = style(id);
      return {
        y1: m.methods[id].y1,
        y2: m.exact,
        color: s.color,
        width: Math.max(1.75, s.width * 0.85),
        shape: s.pointStyle,
        label: valueText(m.methods[id].y1, display),
      };
    });
    const radius = Math.max(0, ...shown.map((id) => style(id).radius * 1.7), style('exact').radius * 1.9);
    const frame = m.frame;
    return {
      events: [],
      layout: { padding: { top: Math.round(fontPx * 2), right: 6 } },
      scales: {
        // includeBounds: false keeps the frame's own edges (not round numbers) from showing up as ticks.
        x: { type: 'linear', min: frame.xMin, max: frame.xMax, title: { display: true, text: m.base.indep || 'x' }, ticks: { maxTicksLimit: 8, includeBounds: false } },
        y: { type: 'linear', min: frame.yMin, max: frame.yMax, title: { display: true, text: 'y' }, ticks: { maxTicksLimit: 7, includeBounds: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        [PLUGIN_ID]: {
          active: true,
          x0: m.x0,
          x1: m.x1,
          field: { enabled: st.showField, f: m.base.f },
          brackets,
          clear: Math.ceil(radius) + 5,
          exactLabel: m.reference ? 'referencia' : 'exacto',
          exactText: valueText(m.exact, display),
          exactY: m.exact,
        },
      },
    };
  }

  /* ======================================================================================================
     Mount: the figure, the controls, the readout table and the live chart (browser only)
     ====================================================================================================== */

  const SUMMARY_DELAY_MS = 350;
  const CHART_WAIT_FRAMES = 180;
  const FALLBACK_NOTICE = 'No se pudo cargar la biblioteca de gráficos. Se muestran los resultados del paso en la tabla.';
  const CANVAS_LABEL = 'Diagrama de un paso sobre el campo de pendientes: la curva exacta y la aproximación de cada método elegido. '
    + 'Los valores están en la tabla de resultados.';

  /** What `mount` returns when its signal was already aborted: nothing was built, every call is a no-op. */
  function inertHandle() {
    return {
      element: null, chart: null, update() {}, destroy() {}, getState: () => null, readout: () => null,
    };
  }

  /**
   * Builds the diagram inside `container` and keeps it live: the picture (Chart.js), the h slider, the method and
   * display switches, the readout table and a polite live summary that follows the slider when it settles.
   * @param {Element} container Element the diagram is appended to.
   * @param {object} [opts] See the header of this file.
   * @returns {{update: function(object): void, destroy: function(): void, getState: function(): object,
   *   readout: function(): object, element: Element, chart: ?object}}
   */
  function mount(container, opts) {
    if (!win || !EDO.dom) throw new Error('EDO.stepDiagram.mount necesita un navegador con EDO.dom.');
    if (!container || container.nodeType !== 1) throw new Error('EDO.stepDiagram.mount: falta el elemento contenedor.');
    const signal = opts && opts.signal;
    if (signal && signal.aborted) return inertHandle();
    const { h, clear, uid } = EDO.dom;

    const first = normalize(opts);
    const state = {
      problem: first.problem,
      x0: first.x0,
      y0: first.y0,
      h: first.h,
      hMin: first.hMin,
      hMax: first.hMax,
      hStep: first.hStep,
      methods: first.mode,
      visible: first.visible.slice(),
      showField: first.showField,
      construction: first.construction,
    };
    const cache = {};
    const refs = { methodInputs: {}, switches: {} };
    const unsubscribe = [];
    const sliderId = uid('step-h');
    let destroyed = false;
    let chart = null; // the EDO.charts handle
    let chartLost = false; // Chart.js is not available: the table is the data alternative
    let chartWaits = 0;
    let current = null; // the model on screen
    let frameRequest = 0;
    let summaryTimer = 0;
    let lastSummary = '';
    let captionKey = '';

    const display = () => (EDO.prefs && EDO.prefs.get('display')) || { decimals: 4, mode: 'round' };
    const nextFrame = (fn) => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : win.setTimeout(fn, 16));
    const cancelFrame = (id) => (win.cancelAnimationFrame ? win.cancelAnimationFrame(id) : win.clearTimeout(id));
    /** The colour-and-shape label of a method; "(punto medio)" can be dropped by the CSS where the room is short. */
    const chip = (id, text) => h('span', { class: 'method-chip', 'data-method': id }, text);
    const methodChip = (id) => chip(id, id === 'rk2' ? h('span', null, 'RK2', h('span', { class: 'step-diagram__qual' }, ' (punto medio)')) : CHIP_LABELS[id]);

    /** A slider value on the step grid and inside the range (the browser may hand over float noise). */
    function snap(v) {
      const k = Math.round((v - state.hMin) / state.hStep);
      return clamp(Number((state.hMin + k * state.hStep).toFixed(10)), state.hMin, state.hMax);
    }

    /* ---- Static structure ------------------------------------------------------------------------- */

    function buildFigure() {
      refs.canvas = h('canvas');
      refs.plot = h('div', { class: 'chart-box step-diagram__plot' }, refs.canvas);
      refs.notice = h('p', { class: 'chart-notice', role: 'status', hidden: true }, FALLBACK_NOTICE);
      refs.caption = h('figcaption', { class: 'step-diagram__caption' });
      return h('figure', { class: 'step-diagram__figure' }, refs.plot, refs.notice, refs.caption);
    }

    /** What the picture shows (slope field, construction): under the figure, next to what it changes. */
    function buildShow() {
      refs.switches = {};
      const sw = (key, text) => {
        const input = h('input', { type: 'checkbox', checked: state[key] });
        input.addEventListener('change', () => onSwitch(key, input.checked));
        refs.switches[key] = input;
        return h('label', { class: 'checkbox' }, input, h('span', null, text));
      };
      return h('fieldset', { class: 'step-diagram__group step-diagram__show' },
        h('legend', { class: 'field__label' }, 'Mostrar'),
        h('div', { class: 'step-diagram__toggles' }, sw('showField', 'Campo de pendientes'), sw('construction', 'Construcción del paso')));
    }

    /** The h slider and, when every method is available, the method toggles. */
    function buildControls() {
      refs.methodInputs = {};
      refs.output = h('output', { class: 'step-diagram__h-value num', for: sliderId });
      refs.slider = h('input', {
        class: 'range', id: sliderId, type: 'range', min: String(state.hMin), max: String(state.hMax), step: String(state.hStep), value: String(state.h),
      });
      refs.slider.addEventListener('input', () => onSlider(false));
      refs.slider.addEventListener('change', () => onSlider(true));
      const stepField = h('div', { class: 'field step-diagram__h' },
        h('div', { class: 'step-diagram__h-head' },
          h('label', { class: 'field__label', for: sliderId }, 'Paso ', h('var', null, 'h')),
          refs.output),
        refs.slider);

      const toggle = (id) => {
        const input = h('input', { type: 'checkbox', checked: state.visible.includes(id), 'data-method': id });
        input.addEventListener('change', () => onMethod(id, input.checked));
        refs.methodInputs[id] = input;
        return h('label', { class: 'checkbox step-diagram__toggle' }, input, chip(id, CHIP_LABELS[id]));
      };
      const methodsGroup = state.methods === 'all'
        ? h('fieldset', { class: 'step-diagram__group step-diagram__methods' },
          h('legend', { class: 'field__label' }, 'Métodos'),
          h('div', { class: 'step-diagram__toggles' }, IDS.map(toggle)))
        : null;

      return h('div', { class: 'step-diagram__controls' }, stepField, methodsGroup);
    }

    function buildReadout() {
      refs.tableNote = h('p', { class: 'muted step-diagram__note' });
      refs.tbody = h('tbody');
      const table = h('table', null,
        h('caption', { class: 'sr-only' }, 'Valor de y en x siguiente para cada método y su error respecto del valor exacto'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Método'),
          h('th', { scope: 'col', class: 'num' }, h('span', { 'aria-hidden': 'true' }, 'y', h('sub', null, 'n+1')), h('span', { class: 'sr-only' }, 'Valor de y en el paso siguiente')),
          h('th', { scope: 'col', class: 'num' }, h('span', { 'aria-hidden': 'true' }, '|error|'), h('span', { class: 'sr-only' }, 'Error absoluto')))),
        refs.tbody);
      const wrap = h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': 'Resultados del paso' }, table);
      return h('div', { class: 'step-diagram__readout' }, refs.tableNote, wrap);
    }

    /* ---- Painting ------------------------------------------------------------------------------------ */

    /** Caption under the picture: the problem and the starting point (TeX), plus what the thin curve is. */
    function paintCaption() {
      const o = current.options;
      const p = o.problem;
      const indep = p.indep || 'x';
      const key = [p.id, p.fStr, o.x0, o.y0, o.mode, current.reference, chartLost].join('|');
      if (key === captionKey) return;
      captionKey = key;
      const num = (v) => format.tex(v, { decimals: 4 });
      const who = o.mode === 'all' ? 'Un paso' : `Un paso de ${methods.byId(o.mode).label}`;
      const curve = current.reference ? 'la referencia numérica (RK4)' : 'la solución exacta';
      // Each formula travels with its punctuation (a line never starts with a lone full stop).
      const nb = (tex) => h('span', { class: 'step-diagram__nb' }, tex);
      clear(refs.caption).appendChild(h('span', null,
        `${who} de tamaño `, nb('$h$'), ' desde ', nb(`$(${indep}_n, y_n) = (${num(o.x0)}, ${num(o.y0)})$`),
        ' para ', nb(`$y' = ${expr.toTeX(p.fNode, { indep })}$.`),
        chartLost ? null : ` La curva fina es ${curve}.`));
      if (EDO.tex) EDO.tex.hydrate(refs.caption);
    }

    function paintControls() {
      const o = current.options;
      const text = stepText(o.h, o.hStep);
      refs.output.textContent = text;
      refs.slider.setAttribute('aria-valuetext', `h = ${text}`);
      if (Number(refs.slider.value) !== o.h) refs.slider.value = String(o.h);
      IDS.forEach((id) => {
        if (refs.methodInputs[id]) refs.methodInputs[id].checked = o.visible.includes(id);
      });
      Object.keys(refs.switches).forEach((key) => { refs.switches[key].checked = Boolean(o[key]); });
    }

    function paintReadout() {
      const o = current.options;
      const d = display();
      const ro = readout(current, o.visible, d);
      refs.tableNote.textContent = `h = ${stepText(o.h, o.hStep)} · valores ${d.mode === 'trunc' ? 'truncados' : 'redondeados'} a ${decimalsOf(d)} decimales`;
      clear(refs.tbody);
      if (ro.rows.length === 0) {
        refs.tbody.appendChild(h('tr', null, h('td', { colspan: '3', class: 'wrap' }, 'Elija al menos un método para ver su paso.')));
      }
      ro.rows.forEach((r) => {
        refs.tbody.appendChild(h('tr', { 'data-method': r.id },
          h('th', { scope: 'row' },
            h('span', { class: 'step-diagram__method' },
              methodChip(r.id),
              o.construction ? h('span', { class: 'step-diagram__how' }, r.construction) : null)),
          h('td', { class: 'num' }, r.y1Text),
          h('td', { class: 'num' }, r.errorText)));
      });
      refs.tbody.appendChild(h('tr', { 'data-exact': '' },
        h('th', { scope: 'row' }, chip('exact', ro.exactLabel)),
        h('td', { class: 'num' }, ro.exactText),
        h('td', { class: 'num' })));
    }

    function paintChart() {
      if (!chart) return;
      chart.update({ data: { datasets: buildDatasets(current, current.options) }, options: chartOptions(current, current.options, display()) });
    }

    function paint() {
      if (destroyed) return;
      current = model(state, cache);
      paintCaption();
      paintControls();
      paintReadout();
      paintChart();
    }

    /** Coalesces the repaints of one frame (a drag can fire several `input` events per frame). */
    function schedule() {
      if (destroyed || frameRequest) return;
      frameRequest = nextFrame(() => {
        frameRequest = 0;
        paint();
      });
    }

    function flush() {
      if (!frameRequest) return;
      cancelFrame(frameRequest);
      frameRequest = 0;
      paint();
    }

    /** The live summary changes only when the value settles, and only when its text actually changes. */
    function flushSummary() {
      win.clearTimeout(summaryTimer);
      summaryTimer = 0;
      if (destroyed || !current) return;
      const text = readout(current, current.options.visible, display()).sentence;
      if (text === lastSummary) return;
      lastSummary = text;
      refs.live.textContent = text;
    }

    /* ---- Events ---------------------------------------------------------------------------------------- */

    function onSlider(settled) {
      const v = snap(Number(refs.slider.value));
      if (Number.isFinite(v)) state.h = v;
      if (settled) {
        paintNow();
        flushSummary();
      } else {
        schedule();
        win.clearTimeout(summaryTimer);
        summaryTimer = win.setTimeout(flushSummary, SUMMARY_DELAY_MS);
      }
    }

    function paintNow() {
      if (frameRequest) cancelFrame(frameRequest);
      frameRequest = 0;
      paint();
    }

    function onMethod(id, checked) {
      const set = new Set(state.visible);
      if (checked) set.add(id);
      else set.delete(id);
      state.visible = IDS.filter((x) => set.has(x));
      paintNow();
      flushSummary();
    }

    function onSwitch(key, checked) {
      state[key] = checked;
      paintNow();
    }

    function onLook() {
      if (!destroyed && current) paintChart();
    }

    function onPrefs(change) {
      if (!destroyed && current && change && change.key === 'display') paintNow();
    }

    /* ---- Chart.js ------------------------------------------------------------------------------------------ */

    function showFallback() {
      chartLost = true;
      refs.plot.hidden = true;
      refs.notice.hidden = false;
      refs.showHost.hidden = true; // the switches only change the picture
      if (current) paintCaption();
    }

    /** Creates the chart as soon as Chart.js is known to be there; without it the table is the figure's data. */
    function startChart() {
      if (destroyed || chart || chartLost) return;
      const deps = EDO.deps;
      const status = deps && deps.status ? deps.status.chart : 'failed';
      if (status === 'pending' && deps.chart && typeof deps.chart.then === 'function') {
        deps.chart.then(startChart);
        return;
      }
      if (status !== 'loaded' || typeof win.Chart !== 'function' || !EDO.charts) {
        showFallback();
        return;
      }
      if (!refs.canvas.isConnected) {
        // The caller attaches `container` later: wait for it (Chart.js needs a laid-out canvas).
        if (chartWaits < CHART_WAIT_FRAMES) {
          chartWaits += 1;
          nextFrame(startChart);
        }
        return;
      }
      registerPlugin(win.Chart);
      let handle = null;
      try {
        handle = EDO.charts.create(refs.canvas, {
          type: 'line',
          data: { datasets: buildDatasets(current, current.options) },
          options: chartOptions(current, current.options, display()),
        }, { title: 'Diagrama de un paso', tableAlt: false });
      } catch (err) {
        handle = null;
      }
      if (!handle || handle.mode !== 'chart') {
        if (handle) handle.destroy();
        const extra = refs.plot.nextElementSibling;
        if (extra && extra.classList.contains('chart-extra')) clear(extra); // charts.js drew its own table: ours is the data
        showFallback();
        return;
      }
      chart = handle;
      refs.canvas.setAttribute('aria-label', CANVAS_LABEL);
    }

    /* ---- Public handle -------------------------------------------------------------------------------------- */

    function update(next) {
      if (destroyed || !next || typeof next !== 'object') return;
      const merged = Object.assign({}, state, next);
      delete merged.signal;
      if (next.problem !== undefined && next.problem !== state.problem) {
        if (next.x0 === undefined) delete merged.x0;
        if (next.y0 === undefined) delete merged.y0;
      }
      if (next.methods !== undefined && next.visible === undefined) delete merged.visible;
      const s = normalize(merged);
      Object.assign(state, {
        problem: s.problem, x0: s.x0, y0: s.y0, h: s.h, hMin: s.hMin, hMax: s.hMax, hStep: s.hStep, methods: s.mode, visible: s.visible.slice(), showField: s.showField, construction: s.construction,
      });
      const controls = buildControls();
      refs.controlsHost.replaceWith(controls);
      refs.controlsHost = controls;
      const show = buildShow();
      show.hidden = chartLost;
      refs.showHost.replaceWith(show);
      refs.showHost = show;
      captionKey = '';
      paintNow();
    }

    function getState() {
      return {
        problem: state.problem.id,
        x0: state.x0,
        y0: state.y0,
        h: state.h,
        hMin: state.hMin,
        hMax: state.hMax,
        hStep: state.hStep,
        methods: state.methods,
        visible: state.visible.slice(),
        showField: state.showField,
        construction: state.construction,
      };
    }

    function getReadout() {
      flush();
      return readout(current, current.options.visible, display());
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frameRequest) cancelFrame(frameRequest);
      win.clearTimeout(summaryTimer);
      unsubscribe.forEach((off) => off());
      if (signal) signal.removeEventListener('abort', destroy);
      if (chart) chart.destroy();
      chart = null;
      if (refs.root.parentNode) refs.root.parentNode.removeChild(refs.root);
    }

    /* ---- Assemble ---------------------------------------------------------------------------------------------- */

    refs.controlsHost = buildControls();
    refs.showHost = buildShow();
    refs.live = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    refs.root = h('div', { class: 'step-diagram', 'data-mode': state.methods === 'all' ? 'all' : 'single', 'data-method': state.methods === 'all' ? null : state.methods },
      h('div', { class: 'step-diagram__layout' },
        h('div', { class: 'step-diagram__main' }, buildFigure(), refs.showHost),
        h('div', { class: 'step-diagram__panel' }, refs.controlsHost, buildReadout(), refs.live)));
    container.appendChild(refs.root);

    if (EDO.bus) {
      unsubscribe.push(EDO.bus.on('theme:change', onLook), EDO.bus.on('mode:change', onLook), EDO.bus.on('prefs:change', onPrefs));
    }
    if (signal) signal.addEventListener('abort', destroy, { once: true });

    paint();
    startChart();

    return {
      element: refs.root,
      update,
      destroy,
      getState,
      readout: getReadout,
      get chart() { return chart ? chart.chart : null; },
    };
  }

  return {
    IDS,
    LABELS,
    DEFAULTS,
    DEFAULT_VISIBLE,
    model,
    readout,
    stepAt,
    frameFor,
    valueText,
    errorText,
    stepText,
    buildDatasets,
    chartOptions,
    spreadLabels,
    plugin: stepPlugin,
    mount,
  };
}));
