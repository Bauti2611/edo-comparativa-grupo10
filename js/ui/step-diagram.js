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
 *                     (the zoom has no option: it is view state, not part of the model)
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
 * The value labels are written to the right of the picture, in a margin that `chartOptions` reserves with the
 * chart's own right padding (`labelColumn` measures it), so that nothing is drawn over the slope field or the
 * curves. Each label reads "<método> <valor>" and falls back to the bare value, and then to nothing, as the
 * room shrinks; the names come from the engine's registry. The auxiliary construction marks are drawn thinner,
 * lighter and under every trajectory, so the three methods and the exact curve stay the strongest lines.
 *
 * Zoom: the four end values can be a handful of pixels apart (at h = 0.4 the three second-order methods land
 * about 12 px from each other), so the figure can be zoomed in. chartjs-plugin-zoom is loaded by deps.js and
 * registered there; this file only configures it (`zoomConfig`) and never requires it: without it the picture
 * is exactly what it was and the "Zoom" group is never shown. The wheel zooms only with Ctrl held, so a plain
 * wheel keeps scrolling the page the figure sits in; a drag selects a region and two fingers pinch. The two
 * buttons are the keyboard and projector route: "Ampliar el final del paso" declares the window `zoomWindow`
 * computes from the model, "Ver todo" gives the frame back - the single reset of every view. A new problem or a
 * new h starts at the frame again, and the marks the `edoStep` plugin draws in pixel space leave out whatever
 * the view no longer contains.
 *
 * One value at a time: with a small h the four end values differ in the fourth decimal only, so the preset
 * window holds all of them and resolves none. Clicking the value label of a method (or of the exact value)
 * declares `zoomWindowFor`'s window instead: centred on that one value, tight enough that it stands alone with
 * its closest neighbour still in view. The labels are painted on the canvas, so the plugin records the hit
 * rectangle of each row as it draws it (`labelRects`, `labelAt`) and the figure hit-tests the click and the
 * hover itself; a canvas cannot be reached by keyboard, so the y_{n+1} of every readout row is the same action
 * as a real button named "Ampliar en <método>", and both routes end in exactly the same view.
 *
 * The pure part (`model`, `readout`, `stepAt`, `frameFor`, `valueText`, `errorText`, plus `buildDatasets`,
 * `chartOptions`, `zoomWindow`, `zoomWindowFor`, `focusLabel`, `zoomConfig`, `spreadLabels`, `labelTexts`,
 * `labelColumn`, `labelRects`, `labelAt`, `textWidth` and the Chart.js `plugin`) also `require`s in Node
 * without a DOM, where it is unit-tested; `_env` is the test seam (set `_env.charts` to a stub of EDO.charts).
 * Load order: after charts.js (it uses EDO.dom, EDO.tex, EDO.charts, EDO.prefs, EDO.deps, EDO.app and EDO.bus).
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

  /* ---- The zoomed window on the end of the step ------------------------------------------------------- */

  /** Margin around the end values of the zoomed window, as a share of the distance they span. */
  const ZOOM_PAD = 0.18;
  /** How much of the step is kept to the left of x_{n+1}, so the last stretch of every path is in view. */
  const ZOOM_X_BEFORE = 0.45;
  /** And to its right, where the error marks and the label column live. */
  const ZOOM_X_AFTER = 0.22;
  /** The exact (or reference) value, as a target of a zoom: it is not a method, so it needs an id of its own. */
  const EXACT_ID = 'exact';

  /** The ids that really are drawn: in the catalogue, among the ones asked for, and with a finite y_{n+1}. */
  function shownIds(m, ids) {
    const all = (m && m.methods) || {};
    return (ids || IDS).filter((id) => IDS.includes(id) && all[id] && all[id].valid);
  }

  /**
   * A window at the end of the step over the ordinates `[lo, hi]`: the abscissas are x_{n+1} with a slice of the
   * step on each side, and every edge is kept inside the model's frame - which is what makes a zoom window able
   * only to zoom in, never out past the picture's own frame.
   */
  function endWindow(m, lo, hi) {
    const f = m.frame || {};
    const low = (value, bound) => (finite(bound) ? Math.max(bound, value) : value);
    const high = (value, bound) => (finite(bound) ? Math.min(bound, value) : value);
    return {
      xMin: low(m.x1 - ZOOM_X_BEFORE * m.h, f.xMin),
      xMax: high(m.x1 + ZOOM_X_AFTER * m.h, f.xMax),
      yMin: low(lo, f.yMin),
      yMax: high(hi, f.yMax),
    };
  }

  /**
   * The window of the "Ampliar el final del paso" preset: x_{n+1} with a slice of the step on each side, and
   * the ordinates of the shown methods together with the exact (or reference) value they are compared with,
   * with a small margin. At h = 0.4 the three second-order methods land 0.064 apart over a frame about 2.8
   * tall; this window is about 0.45 tall, so the same pixels now separate them.
   *
   * Every number comes from the model: this only chooses which of them the view has to contain. The window is
   * kept inside the model's frame, so the preset can only ever zoom in - where the end values already fill the
   * frame (the largest step of a steep problem) it simply has nothing to gain.
   * @param {object} m Result of `model`.
   * @param {string[]} [ids] Method ids that are drawn (default: all of them).
   * @returns {?{xMin: number, xMax: number, yMin: number, yMax: number}} Null when there is nothing to frame.
   */
  function zoomWindow(m, ids) {
    if (!m || !finite(m.x1) || !finite(m.h)) return null;
    const vals = shownIds(m, ids).map((id) => m.methods[id].y1).concat([m.exact]).filter(finite);
    if (!vals.length) return null;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo || Math.abs(hi) || 1) * ZOOM_PAD;
    return endWindow(m, lo - pad, hi + pad);
  }

  /* ---- The close-up of one value --------------------------------------------------------------------- */

  /**
   * Half-height of a close-up, as a multiple of the distance to the closest other value: the neighbour lands
   * about seven tenths of the way out, so the value asked for is alone in the middle and the neighbour is
   * still inside the picture as context.
   */
  const ZOOM_FOCUS_SPAN = 1.4;
  /**
   * Smallest half-height of a close-up, as a share of the value it frames: a window one unit wide in the
   * fourth decimal, which is what the readout writes. It takes over exactly when the values coincide to those
   * digits, so a close-up can never collapse onto a single ordinate.
   */
  const ZOOM_FOCUS_MIN = 5e-5;

  /**
   * The window of one value's close-up: the same slice of the step as `zoomWindow` and ordinates centred on the
   * value asked for. With a small h the four end values differ in the fourth decimal only, so the preset window
   * holds all of them at once and none of them is resolved; this frames one of them and leaves its closest
   * neighbour in view. Every number comes from the model and the window is kept inside the model's frame, so it
   * can only ever zoom in.
   * @param {object} m Result of `model`.
   * @param {string[]} [ids] Method ids that are drawn (default: all of them); the others give the context.
   * @param {string} id The value to frame: a method id, or 'exact' for the exact (or reference) value.
   * @returns {?{xMin: number, xMax: number, yMin: number, yMax: number}} Null when that value is not there.
   */
  function zoomWindowFor(m, ids, id) {
    if (!m || !finite(m.x1) || !finite(m.h)) return null;
    const list = shownIds(m, ids);
    const value = id === EXACT_ID ? m.exact : (list.includes(id) ? m.methods[id].y1 : NaN);
    if (!finite(value)) return null;
    const gaps = list.filter((x) => x !== id).map((x) => m.methods[x].y1)
      .concat(id === EXACT_ID ? [] : [m.exact])
      .filter(finite)
      .map((v) => Math.abs(v - value))
      .filter((d) => d > 0);
    const half = Math.max(
      gaps.length ? ZOOM_FOCUS_SPAN * Math.min(...gaps) : 0,
      ZOOM_FOCUS_MIN * Math.max(Math.abs(value), 1),
    );
    return endWindow(m, value - half, value + half);
  }

  /** How a value is named by the control that frames it: the method's own name, or the exact / reference value. */
  function focusName(id, reference) {
    if (id === EXACT_ID) return reference ? 'el valor de referencia' : 'el valor exacto';
    return LABELS[id] || id;
  }

  /**
   * Name of the control that frames one value in the picture, both in the canvas label and in the readout row.
   * @param {string} id A method id, or 'exact'.
   * @param {boolean} [reference] True when the thin curve is the RK4 reference instead of the exact solution.
   * @returns {string} "Ampliar en Euler Mejorado", "Ampliar en el valor exacto".
   */
  function focusLabel(id, reference) {
    return `Ampliar en ${focusName(id, reference)}`;
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

  /**
   * How the value label of a method may be written in the picture, the most informative wording first: the
   * name of the method and its value, the same without the qualifier between brackets, and the bare value
   * (the picture writes the first one that fits). The name is the engine's own, never one written here.
   * @param {string} id Method id.
   * @param {string} value The value as text.
   * @returns {string[]} The wordings, without repetitions.
   */
  function labelTexts(id, value) {
    const entry = methods.byId(id);
    const name = (entry && entry.label) || id;
    const short = name.replace(/\s*\([^)]*\)\s*$/, '');
    return Array.from(new Set([`${name} ${value}`, `${short} ${value}`, value]));
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
   * @returns {{rows: object[], exactText: string, exactLabel: string, exactZoomLabel: string, sentence: string}}
   *   `rows[i]` is `{id, label, construction, y1Text, errorText, zoomLabel}`, where `zoomLabel` names the
   *   control that frames that row's value in the picture; `sentence` is the whole readout in one phrase.
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
        zoomLabel: focusLabel(id, m.reference),
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
    return {
      rows, exactText, exactLabel, exactZoomLabel: focusLabel(EXACT_ID, m.reference), sentence,
    };
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

  /* ---- Weight of the auxiliary construction marks --------------------------------------------------------- */

  /** The construction (predictor, midpoint probe and their segments) against the weight of a method's own path. */
  const AUX_WIDTH = 0.42;
  const AUX_ALPHA = 0.5;
  const AUX_POINT_ALPHA = 0.75;
  const AUX_BEHIND = 8; // added to the draw order, so the construction stays under every trajectory

  /**
   * The same colour with an alpha applied, when the colour can be read (the CSS tokens are hex, a computed
   * value may be `rgb(...)`); anything else is returned untouched, so a colour is never lost.
   * @param {string} color CSS colour.
   * @param {number} alpha 0..1.
   * @returns {string} The colour with that alpha, or `color`.
   */
  function fade(color, alpha) {
    const value = String(color === undefined || color === null ? '' : color).trim();
    const a = clamp(alpha, 0, 1);
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
    if (hex) {
      const digits = hex[1];
      const rgb = digits.length <= 4 ? digits.slice(0, 3).split('').map((ch) => ch + ch).join('') : digits.slice(0, 6);
      return `#${rgb}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
    }
    const parts = /^rgba?\(([^)]*)\)$/i.exec(value);
    if (parts) {
      const channels = parts[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
      if (channels.length === 3) return `rgba(${channels.join(', ')}, ${a})`;
    }
    return value;
  }

  /* ---- The column of value labels (geometry shared by the plugin and the chart options) ------------------ */

  /** Radius of the marker at y_{n+1}: small enough that two methods 12 px apart do not merge. */
  const END_MARKER_RADIUS = 3.4;

  /** Ring thickness of that marker: it is drawn hollow so an overlapping pair stays legible. */
  const END_MARKER_RING = 1.75;

  /** The error marks are hairlines: the gap they measure is the message, not the stroke. */
  const ERROR_MARK_WIDTH = 1;

  /** Opacity of an error mark, low enough to stay behind the end markers it sits next to. */
  const ERROR_MARK_ALPHA = 0.55;

  /** Horizontal distance between two error brackets. */
  const bracketGap = (size) => Math.max(8, size * 0.75);

  /** Radius of the marker that goes with a value label. */
  const markerRadius = (size) => Math.max(3, size * 0.32);

  /** Share of the canvas the label column may take before the labels start falling back to shorter wordings. */
  const COLUMN_MAX = 0.36;
  /** The reserved column is a little wider than measured: the figure's font may not be the one measured yet. */
  const COLUMN_SLACK = 1.08;

  /** Air to the left and to the right of a label's hit rectangle: a click a pixel off its glyphs still lands. */
  const HIT_PAD = 3;
  /** Half-height of that rectangle, as a share of the font size: exactly the rows `spreadLabels` keeps apart. */
  const HIT_HALF = 0.8;

  /**
   * The hit rectangles of the value labels, per chart, as the plugin draws them. The labels are painted on the
   * canvas and are not elements, so this is what a click and a hover have to be tested against; `labelAt` is
   * the only reader. The list is written on every pass - empty when nothing was drawn - so a rectangle never
   * outlives the label it belongs to, nor the view that placed it.
   */
  const labelHitMap = new WeakMap();

  /**
   * The hit rectangles of the labels this chart drew last, in the order they were drawn.
   * @param {object} chart A Chart.js instance.
   * @returns {Array<{id: string, left: number, top: number, right: number, bottom: number}>} Empty when the
   *   chart drew no label (no room for one, or the plugin is not active).
   */
  function labelRects(chart) {
    const hits = chart ? labelHitMap.get(chart) : null;
    return hits ? hits.slice() : [];
  }

  /**
   * The value label at one point of the canvas, in the chart's own pixel space.
   * @param {object} chart A Chart.js instance.
   * @param {number} px Distance from the left edge of the canvas.
   * @param {number} py Distance from its top edge.
   * @returns {?string} A method id, 'exact', or null where there is no label.
   */
  function labelAt(chart, px, py) {
    if (!finite(px) || !finite(py)) return null;
    const hit = labelRects(chart).find((r) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom);
    return hit ? hit.id : null;
  }

  let measureCanvas = null;

  /**
   * Width of a label at the figure's font: a real canvas measurement in the browser and, without one (Node,
   * where the options are unit-tested), an estimate from the number of characters that errs on the wide side.
   * @param {string} str The text.
   * @param {number} size Font size in px.
   * @param {string} [family] Font family.
   * @returns {number} Width in px (0 for an empty text).
   */
  function textWidth(str, size, family) {
    const value = str === undefined || str === null ? '' : String(str);
    if (!value) return 0;
    if (win && win.document) {
      try {
        measureCanvas = measureCanvas || win.document.createElement('canvas');
        const ctx = measureCanvas.getContext('2d');
        if (ctx) {
          ctx.font = `${size}px ${family || 'sans-serif'}`;
          return ctx.measureText(value).width;
        }
      } catch (err) {
        /* no canvas here: the estimate below is enough to reserve the room */
      }
    }
    return value.length * size * 0.56;
  }

  /**
   * The column of value labels lives in the margin that `layout.padding.right` reserves for it, so that no
   * label lands on the slope field or on the curves. Offsets are measured from `area.right`.
   * @param {number} size Font size in px.
   * @param {number} widest Width in px of the widest label text (0 when there is no label).
   * @returns {{radius: number, marker: number, text: number, edge: number, width: number}} `marker` and `text`
   *   are the offsets of the marker centre and of the text; `width` is the padding the column needs.
   */
  function labelColumn(size, widest) {
    const radius = markerRadius(size);
    const lead = Math.max(6, size * 0.55); // clean air between the drawing and the column
    const pad = Math.max(4, size * 0.4); // between a marker and its text
    const edge = Math.max(3, size * 0.3); // between the text and the right edge of the canvas
    const marker = lead + radius;
    const text = marker + radius + pad;
    return {
      radius, marker, text, edge, width: widest > 0 ? text + widest + edge : lead,
    };
  }

  /**
   * The padding the label column needs: every label is written in the first wording of its list that fits, so
   * the column is measured with the first wording the whole column can afford, and never grows past `max`.
   * The measurement is taken with the font the browser has at hand, which is not always the one the figure
   * ends up drawn with (a canvas never asks for a font itself), hence the small slack.
   * @param {number} size Font size in px.
   * @param {string} family Font family.
   * @param {string[][]} lists One list of wordings per label, the most informative first.
   * @param {number} [max] Largest padding allowed (the canvas is not known in Node: then there is no limit).
   * @returns {number} Padding in px.
   */
  function reserveColumn(size, family, lists, max) {
    const limit = finite(max) && max > 0 ? max : Infinity;
    const rungs = Math.max(0, ...lists.map((texts) => texts.length));
    // The ladders are lined up at their last rung (the shortest wording), so a label with fewer wordings is
    // not already down to its bare value while the others still carry the name of their method.
    const rung = (texts, r) => texts[clamp(texts.length - rungs + r, 0, texts.length - 1)];
    let width = labelColumn(size, 0).width;
    for (let r = 0; r < rungs; r += 1) {
      const widest = Math.max(0, ...lists.map((texts) => textWidth(rung(texts, r), size, family)));
      width = labelColumn(size, widest * COLUMN_SLACK).width;
      if (width <= limit) break;
    }
    return Math.min(width, limit);
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
      // Nothing drawn, no label to click: the rectangles of the previous pass are dropped first of all.
      labelHitMap.set(chart, []);
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
      // Zooming and panning move the scales under these pixel-space marks: anything whose abscissa or
      // ordinate has left the plotting area is left out instead of being drawn over the axes or outside
      // the canvas. Nothing changes while the view is the model's own frame, where everything is inside.
      const inX = (px) => px >= area.left - 0.5 && px <= area.right + 0.5;
      const inY = (py) => py >= area.top - 0.5 && py <= area.bottom + 0.5;
      const clampY = (py) => clamp(py, area.top, area.bottom);
      ctx.save();

      // x_n and x_{n+1} flank the step, above the plotting area.
      ctx.fillStyle = text;
      const labelY = area.top - Math.max(5, size * 0.45);
      if (inX(px0)) drawSubscripted(ctx, 'x', 'n', px0 - 4, labelY, size, family, 'right');
      if (inX(px1)) drawSubscripted(ctx, 'x', 'n+1', px1 + 4, labelY, size, family, 'left');

      // The step h as a dimension line near the bottom edge.
      if (px1 - px0 > size * 1.6 && inX(px0) && inX(px1)) {
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

      // Error marks: one hairline per method, from its y_{n+1} up to the exact value, side by side next to
      // x_{n+1}. No caps and low opacity on purpose: the four end markers already meet in this corner, and the
      // numbers live in the labels and in the readout table, so these only have to show which gap is larger.
      const list = o.brackets || [];
      const gap = bracketGap(size);
      const first = px1 + (o.clear || 8);
      ctx.save();
      ctx.globalAlpha = ERROR_MARK_ALPHA;
      list.forEach((b, i) => {
        const bx = first + i * gap;
        // A mark is anchored to x_{n+1} and lives between it and the label column: both ends are kept
        // inside the plotting area, and a mark that no longer fits there is not drawn at all.
        if (!inX(px1) || bx > area.right || bx < area.left) return;
        const y1 = sy.getPixelForValue(b.y1);
        const y2 = sy.getPixelForValue(b.y2);
        if (!inY(y1) && !inY(y2) && (y1 < area.top) === (y2 < area.top)) return;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = ERROR_MARK_WIDTH;
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(bx, clampY(y1));
        ctx.lineTo(bx, clampY(y2));
        ctx.stroke();
      });
      ctx.restore();

      // Value labels in the margin the chart options reserve to the right of the plotting area (never over the
      // drawing): the exact value and every y_{n+1}, each with the marker of its method and the name of the
      // method before the number, spread apart so that they never overlap. A label that does not fit falls back
      // to a shorter wording and, as a last resort, is left out (the readout table always has the numbers).
      const column = labelColumn(size, 0);
      const radius = column.radius;
      const markerX = area.right + column.marker;
      const textX = area.right + column.text;
      const items = [];
      if (o.exactLabel) {
        const withValue = o.exactText ? `${o.exactLabel} ${o.exactText}` : '';
        items.push({
          id: EXACT_ID, y: sy.getPixelForValue(o.exactY), shape: 'line', color: ink, ink: true, texts: [withValue, o.exactLabel].filter(Boolean),
        });
      }
      list.forEach((b) => {
        const texts = (b.texts || []).filter(Boolean);
        if (texts.length) {
          items.push({
            id: b.id, y: sy.getPixelForValue(b.y1), shape: b.shape, color: b.color, texts,
          });
        }
      });
      ctx.font = `${size}px ${family}`;
      const room = chart.width - column.edge - textX;
      /** The first wording that fits, with the width it was measured at (the hit rectangle needs it too). */
      const fitting = (texts) => {
        for (let k = 0; k < texts.length; k += 1) {
          const w = ctx.measureText(texts[k]).width;
          if (w <= room + 0.5) return { text: texts[k], textWidth: w };
        }
        return {};
      };
      const shown = items
        // A value the view no longer shows gets no label: `spreadLabels` would clamp it to the edge of the
        // column and point at a row where its marker is not.
        .filter((item) => inY(item.y))
        .map((item) => Object.assign(item, fitting(item.texts)))
        .filter((item) => item.text);
      const rows = spreadLabels(shown.map((s) => s.y), size * 1.6, area.top + size * 0.8, area.bottom - size * 0.8);
      const halo = cssVar('--surface', '#ffffff');
      shown.forEach((item, i) => {
        ctx.fillStyle = item.color;
        drawMarker(ctx, item.shape, markerX, rows[i], radius);
        ctx.font = `${size}px ${family}`;
        haloText(ctx, item.text, textX, rows[i], halo, item.ink ? ink : text);
      });
      // Where each label ended up: a click on one of them is a close-up of its own value, and only the drawing
      // knows where the row landed once `spreadLabels` has moved it.
      labelHitMap.set(chart, shown.map((item, i) => ({
        id: item.id,
        left: markerX - radius - HIT_PAD,
        top: rows[i] - size * HIT_HALF,
        right: textX + item.textWidth + HIT_PAD,
        bottom: rows[i] + size * HIT_HALF,
      })).filter((r) => typeof r.id === 'string' && r.id));
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
    // The construction is secondary: thinner, lighter and drawn under every trajectory (Chart.js draws a
    // higher `order` first), so the three method paths and the exact curve stay the strongest lines.
    const thin = (s) => ({
      borderWidth: Math.max(1, s.width * AUX_WIDTH), borderDash: [], borderColor: fade(s.color, AUX_ALPHA), order: s.order + AUX_BEHIND,
    });
    const hollow = (s, r, n) => ({
      pointRadius: lastOnly(n, r), pointBackgroundColor: surface, pointBorderColor: fade(s.color, AUX_POINT_ALPHA), pointBorderWidth: Math.max(1.25, s.width * 0.45),
    });
    // The three methods can land within a few pixels of each other (at h = 0.4 they are 0.064 apart, about
    // 12 px), so the end marker is a small ring instead of a disc: rings that overlap stay readable, discs
    // hide each other. The shape still matches the legend and the readout table.
    const filled = (s, n) => ({
      pointRadius: lastOnly(n, END_MARKER_RADIUS),
      pointBackgroundColor: surface,
      pointBorderColor: s.color,
      pointBorderWidth: END_MARKER_RING,
    });

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
          sets.push(dataset('Euler Mejorado: predictor (paso de Euler)', e.predLine, s, Object.assign(thin(s), hollow(s, s.radius * 1.05, 2))));
          sets.push(dataset('Euler Mejorado: pendiente en el predictor', e.tick, s, thin(s)));
        }
        sets.push(dataset('Euler Mejorado: pendiente promedio', e.line, s, filled(s, 2)));
      } else {
        if (aux) {
          sets.push(dataset('RK2: medio paso de Euler hasta el punto medio', e.halfLine, s, Object.assign(thin(s), hollow(s, s.radius * 1.05, 2))));
          sets.push(dataset('RK2: pendiente en el punto medio', e.tick, s, thin(s)));
        }
        sets.push(dataset('RK2: paso completo con la pendiente del punto medio', e.line, s, filled(s, 2)));
      }
    });

    sets.push(dataset('Punto de partida', [{ x: m.x0, y: m.y0 }], ex, {
      order: -2, pointStyle: 'circle', pointRadius: Math.max(3.5, ex.radius * 1.15), pointBackgroundColor: ex.color, pointBorderColor: surface, pointBorderWidth: 2,
    }));
    sets.push(dataset(reference ? 'Referencia en x_{n+1}' : 'Valor exacto en x_{n+1}', [{ x: m.x1, y: m.exact }], ex, {
      order: -2, pointStyle: 'circle', pointRadius: Math.max(4.5, ex.radius * 1.4), pointBackgroundColor: surface, pointBorderColor: ex.color, pointBorderWidth: Math.max(2.25, ex.width * 1.4),
    }));
    return sets;
  }

  /* ---- chartjs-plugin-zoom ------------------------------------------------------------------------------- */

  const ZOOM_PLUGIN_ID = 'zoom';

  /** How far in the view may be pushed, as a share of the model's own frame: past this the picture is noise. */
  const ZOOM_MAX_IN = 0.01;

  /**
   * Options of chartjs-plugin-zoom for this figure, written so that it can never hijack the page: the wheel
   * only zooms while Ctrl is held (a plain wheel is left alone and keeps scrolling the long page it sits in),
   * a Shift + drag selects the region to zoom to, and two fingers pinch. Panning is direct (plain drag) and is
   * left off where any pointer is coarse: Hammer.js would set `touch-action: none` on the canvas and a one-finger
   * drag over the figure would stop scrolling the page.
   * @param {object} [opts] `{frame}` the model's frame (the zoom-out limit and the finest zoom come from it),
   *   `{pan}` whether a plain drag may pan, `{onChange}` called once a gesture has moved the view (the
   *   preset's pressed state follows it).
   * @returns {object} The value of `plugins.zoom`.
   */
  function zoomConfig(opts) {
    const o = opts || {};
    const frame = o.frame;
    const moved = typeof o.onChange === 'function' ? () => o.onChange() : undefined;
    const span = (min, max) => (finite(min) && finite(max) && max > min ? max - min : undefined);
    const limits = frame ? {
      x: { min: frame.xMin, max: frame.xMax, minRange: span(frame.xMin, frame.xMax) * ZOOM_MAX_IN },
      y: { min: frame.yMin, max: frame.yMax, minRange: span(frame.yMin, frame.yMax) * ZOOM_MAX_IN },
    } : {};
    return {
      zoom: {
        wheel: { enabled: true, modifierKey: 'ctrl', speed: 0.08 },
        drag: {
          enabled: true,
          modifierKey: 'shift',
          backgroundColor: fade(cssVar('--ink-2', '#37465c'), 0.12),
          borderColor: cssVar('--border-strong', '#6f7c91'),
          borderWidth: 1,
          threshold: 6,
        },
        pinch: { enabled: true },
        mode: 'xy',
        onZoomComplete: moved,
      },
      pan: {
        enabled: Boolean(o.pan), mode: 'xy', threshold: 8, onPanComplete: moved,
      },
      limits,
    };
  }

  /**
   * Chart.js options of one model: the fixed frame, no interaction (the picture is a figure, the readout is the
   * data), a right padding that reserves the margin of the value labels, and the `edoStep` plugin options:
   * guides, slope field, and per shown method a bracket `{id, y1, y2, color, width, shape, texts}` from its
   * y_{n+1} to the exact value (`texts` are the wordings of its label, the most informative first).
   * @param {object} m Result of `model`.
   * @param {object} st `{visible, showField}` (the normalized options of the model do).
   * @param {{decimals?: number, mode?: string}} [display] How the value labels are written.
   * @param {number} [width] Width of the canvas in px, when it is known: the label column never takes more
   *   than a share of it, and the labels fall back to a shorter wording instead.
   * @param {object} [zoom] Zoom state, when chartjs-plugin-zoom is there: `{enabled}` adds its options,
   *   `{view}` a `{xMin, xMax, yMin, yMax}` window the scales use instead of the model's frame, and
   *   `{animated: false}` pins the zoom transition to zero (prefers-reduced-motion), `{pan}` see `zoomConfig`.
   */
  function chartOptions(m, st, display, width, zoom) {
    const style = (id) => EDO.charts.methodStyle(id);
    const size = parseFloat(cssVar('--chart-font', '13')) || 13;
    const fontPx = /rem$/.test(cssVar('--chart-font', '')) ? size * (parseFloat(win.getComputedStyle(win.document.documentElement).fontSize) || 16) : size;
    const shown = st.visible.filter((id) => m.methods[id].valid);
    const brackets = shown.map((id) => {
      const s = style(id);
      return {
        id,
        y1: m.methods[id].y1,
        y2: m.exact,
        color: s.color,
        width: Math.max(1.75, s.width * 0.85),
        shape: s.pointStyle,
        texts: labelTexts(id, valueText(m.methods[id].y1, display)),
      };
    });
    const radius = Math.max(0, END_MARKER_RADIUS + END_MARKER_RING, style('exact').radius * 1.4);
    const z = zoom || {};
    // The declared view: the preset window while it is on, and the model's own frame otherwise. The plugin
    // writes its wheel, drag and pinch zooms straight into the live scales, so a repaint (a new h, a new
    // problem, a theme change) hands the picture back to whatever is declared here - which is why the zoom
    // resets by itself when the numbers change.
    const frame = z.view && finite(z.view.xMin) && z.view.xMax > z.view.xMin && z.view.yMax > z.view.yMin ? z.view : m.frame;
    const exactLabel = m.reference ? 'referencia' : 'exacto';
    const exactText = valueText(m.exact, display);
    const column = reserveColumn(fontPx, cssVar('--font-sans', 'sans-serif'),
      brackets.map((b) => b.texts).concat([[`${exactLabel} ${exactText}`, exactLabel]]),
      finite(width) && width > 0 ? width * COLUMN_MAX : undefined);
    return {
      events: [],
      layout: { padding: { top: Math.round(fontPx * 2), right: Math.ceil(column) } },
      scales: {
        // includeBounds: false keeps the frame's own edges (not round numbers) from showing up as ticks.
        x: { type: 'linear', min: frame.xMin, max: frame.xMax, title: { display: true, text: m.base.indep || 'x' }, ticks: { maxTicksLimit: 8, includeBounds: false } },
        y: { type: 'linear', min: frame.yMin, max: frame.yMax, title: { display: true, text: 'y' }, ticks: { maxTicksLimit: 7, includeBounds: false } },
      },
      // The figure never animates (charts.js sets `animation: false`); under prefers-reduced-motion the
      // zoom transition is pinned to zero as well, so no setting can turn a zoom into motion.
      ...(z.animated === false ? { transitions: { zoom: { animation: { duration: 0 } } } } : {}),
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
          exactLabel,
          exactText,
          exactY: m.exact,
        },
        ...(z.enabled ? { [ZOOM_PLUGIN_ID]: zoomConfig({ frame: m.frame, pan: z.pan, animated: z.animated }) } : {}),
      },
    };
  }

  /* ======================================================================================================
     Mount: the figure, the controls, the readout table and the live chart (browser only)
     ====================================================================================================== */

  const SUMMARY_DELAY_MS = 350;
  const CHART_WAIT_FRAMES = 180;
  const FALLBACK_NOTICE = 'No se pudo cargar la biblioteca de gráficos. Se muestran los resultados del paso en la tabla.';
  const ZOOM_IN_LABEL = 'Ampliar el final del paso';
  const ZOOM_OUT_LABEL = 'Ver todo';
  /** The one line that tells the reader the gestures exist: an interaction nobody discovers is worth nothing. */
  const ZOOM_HINT = 'Ctrl + rueda acerca; arrastre para mover; Shift + arrastre para ampliar. Haga clic en una etiqueta de valor, '
    + 'o en ese valor de la tabla, para ampliar ese método.';
  const ZOOM_SAID_IN = 'Vista ampliada en el final del paso.';
  const ZOOM_SAID_OUT = 'Vista completa del paso.';
  /** What the live region says when one value has been framed; the name is the control's own. */
  const zoomSaidAt = (name) => `Vista ampliada en ${name}.`;
  /** The declared view that is the "Ampliar el final del paso" preset (the others are the id of one value). */
  const PRESET_VIEW = 'preset';
  /** A click that travelled further than this was a drag, and a drag belongs to chartjs-plugin-zoom. */
  const CLICK_SLOP = 4;
  /**
   * Hammer.js writes `touch-action: none` on the canvas to recognize the pinch, which would also stop a
   * one-finger drag over the figure from scrolling the page it sits in the middle of. `pan-y` gives the
   * vertical scroll back to the browser and still leaves the two-finger gesture to the plugin.
   */
  const CANVAS_TOUCH_ACTION = 'pan-y';
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
    const refs = { methodInputs: {}, switches: {}, focus: {} };
    const unsubscribe = [];
    const sliderId = uid('step-h');
    let destroyed = false;
    let chart = null; // the EDO.charts handle
    let chartLost = false; // Chart.js is not available: the table is the data alternative
    let chartWaits = 0;
    let zoomReady = false; // chartjs-plugin-zoom arrived and is registered: the zoom controls are shown
    // The declared view: null is the model's own frame, PRESET_VIEW the "Ampliar el final del paso" window,
    // and any other value the id of the one end value (a method, or 'exact') that is being looked at closely.
    let zoomView = null;
    let current = null; // the model on screen
    let frameRequest = 0;
    let summaryTimer = 0;
    let lastSummary = '';
    let captionKey = '';
    let pressedAt = null; // where the pointer went down on the canvas, to tell a click from a drag

    const display = () => (EDO.prefs && EDO.prefs.get('display')) || { decimals: 4, mode: 'round' };
    /**
     * Width of the picture, so that the label column never eats it on a narrow screen. The box is measured,
     * not the canvas: before Chart.js sizes it for the first time the canvas still has its default width.
     */
    const plotWidth = () => (refs.plot && refs.plot.clientWidth) || (refs.canvas && refs.canvas.clientWidth) || 0;
    const nextFrame = (fn) => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : win.setTimeout(fn, 16));
    const cancelFrame = (id) => (win.cancelAnimationFrame ? win.cancelAnimationFrame(id) : win.clearTimeout(id));
    const media = (query) => Boolean(win.matchMedia && win.matchMedia(query).matches);
    const reduced = () => (EDO.app && EDO.app.reducedMotion ? EDO.app.reducedMotion() : media('(prefers-reduced-motion: reduce)'));
    /**
     * Panning is left off wherever any pointer is coarse: Hammer.js takes `touch-action` away from the canvas
     * to recognize a drag, and a one-finger drag over the figure would then stop scrolling the page.
     */
    const panAllowed = () => media('(pointer: fine)') || !media('(any-pointer: coarse)');
    /**
     * The window the declared view asks for, straight from the model: the preset's, one value's close-up, or
     * none at all (the picture's own frame). Null is also the answer when what was framed is no longer there.
     */
    function declaredWindow() {
      if (!current || !zoomView) return null;
      const ids = current.options.visible;
      return zoomView === PRESET_VIEW ? zoomWindow(current, ids) : zoomWindowFor(current, ids, zoomView);
    }
    /** What the chart options have to say about the zoom: see `chartOptions`. */
    const zoomState = () => ({
      enabled: zoomReady,
      view: declaredWindow(),
      pan: panAllowed(),
      animated: !reduced(),
      onChange: onFreeZoom,
    });
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

    /**
     * The zoom, next to the switches that also change the picture: a preset that frames the end of the step
     * and a reset, both plain buttons so they work from the keyboard and from a projector, plus the one line
     * that names the gesture. The group stays hidden while chartjs-plugin-zoom is not there.
     */
    function buildZoom() {
      refs.zoomIn = h('button', {
        type: 'button', class: 'btn', 'data-size': 'sm', 'data-zoom': 'in', 'aria-pressed': zoomView === PRESET_VIEW ? 'true' : 'false',
      }, ZOOM_IN_LABEL);
      refs.zoomOut = h('button', {
        type: 'button', class: 'btn', 'data-size': 'sm', 'data-zoom': 'out',
      }, ZOOM_OUT_LABEL);
      refs.zoomIn.addEventListener('click', onZoomIn);
      refs.zoomOut.addEventListener('click', onZoomOut);
      return h('fieldset', { class: 'step-diagram__group step-diagram__zoom' },
        h('legend', { class: 'field__label' }, 'Zoom'),
        h('div', { class: 'step-diagram__zoom-buttons' }, refs.zoomIn, refs.zoomOut),
        h('p', { class: 'muted step-diagram__hint' }, ZOOM_HINT));
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

    /**
     * The y_{n+1} of a row, as the control that frames that value in the picture: the canvas labels are painted
     * pixels, so this is the keyboard and screen-reader route to the very same close-up, and its accessible name
     * says which value it frames. Where there is no close-up to reach - no zoom plugin, no picture, a value the
     * model does not have - the cell is the plain number it has always been, never a control that does nothing.
     */
    function focusCell(id, text, label) {
      if (!zoomReady || chartLost || !declaredFor(id)) return text;
      const button = h('button', {
        type: 'button',
        class: 'step-diagram__focus',
        'data-focus': id,
        'aria-label': label,
        title: label,
        'aria-pressed': zoomView === id ? 'true' : 'false',
      }, text);
      button.addEventListener('click', () => onFocus(id));
      refs.focus[id] = button;
      return button;
    }

    function paintReadout() {
      const o = current.options;
      const d = display();
      const ro = readout(current, o.visible, d);
      refs.tableNote.textContent = `h = ${stepText(o.h, o.hStep)} · valores ${d.mode === 'trunc' ? 'truncados' : 'redondeados'} a ${decimalsOf(d)} decimales`;
      clear(refs.tbody);
      refs.focus = {};
      if (ro.rows.length === 0) {
        refs.tbody.appendChild(h('tr', null, h('td', { colspan: '3', class: 'wrap' }, 'Elija al menos un método para ver su paso.')));
      }
      ro.rows.forEach((r) => {
        refs.tbody.appendChild(h('tr', { 'data-method': r.id },
          h('th', { scope: 'row' },
            h('span', { class: 'step-diagram__method' },
              methodChip(r.id),
              o.construction ? h('span', { class: 'step-diagram__how' }, r.construction) : null)),
          h('td', { class: 'num' }, focusCell(r.id, r.y1Text, r.zoomLabel)),
          h('td', { class: 'num' }, r.errorText)));
      });
      refs.tbody.appendChild(h('tr', { 'data-exact': '' },
        h('th', { scope: 'row' }, chip('exact', ro.exactLabel)),
        h('td', { class: 'num' }, focusCell(EXACT_ID, ro.exactText, ro.exactZoomLabel)),
        h('td', { class: 'num' })));
    }

    function paintChart() {
      if (!chart) return;
      chart.update({ data: { datasets: buildDatasets(current, current.options) }, options: chartOptions(current, current.options, display(), plotWidth(), zoomState()) });
      // Hammer.js sets the canvas' own touch-action when it starts; this is the only place that can take it
      // back, and it is cheap enough to re-assert on every repaint.
      if (zoomReady && refs.canvas.style.touchAction !== CANVAS_TOUCH_ACTION) refs.canvas.style.touchAction = CANVAS_TOUCH_ACTION;
    }

    /** Which view is on screen: the preset button and every row control report their own pressed state. */
    function paintZoom() {
      if (refs.zoomIn) {
        refs.zoomIn.setAttribute('aria-pressed', zoomView === PRESET_VIEW ? 'true' : 'false');
        refs.zoomIn.disabled = !zoomReady || !current || !zoomWindow(current, current.options.visible);
      }
      Object.keys(refs.focus).forEach((id) => {
        refs.focus[id].setAttribute('aria-pressed', zoomView === id ? 'true' : 'false');
      });
    }

    function paint() {
      if (destroyed) return;
      current = model(state, cache);
      paintCaption();
      paintControls();
      paintZoom();
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

    /** Says the new state and then lets the readout be announced again, even if its text did not change. */
    function announceZoom(said) {
      if (!refs.live || !current) return;
      refs.live.textContent = `${said} ${readout(current, current.options.visible, display()).sentence}`;
      lastSummary = '';
    }

    /**
     * The declared view changed: the picture follows it and so do the pressed states, without rebuilding the
     * readout - the row control that was just activated has to keep the keyboard focus it has.
     */
    function applyView(said) {
      flush();
      paintZoom();
      paintChart();
      announceZoom(said);
    }

    /** The close-up of one value, when the model has one to give (the guard of every route to it). */
    function declaredFor(id) {
      return current ? zoomWindowFor(current, current.options.visible, id) : null;
    }

    function onZoomIn() {
      if (!zoomReady || !current || !zoomWindow(current, current.options.visible)) return;
      zoomView = PRESET_VIEW;
      applyView(ZOOM_SAID_IN);
    }

    function onZoomOut() {
      if (!zoomReady) return;
      zoomView = null;
      applyView(ZOOM_SAID_OUT);
    }

    /** One value framed on its own: from its label in the picture, or from its row in the readout table. */
    function onFocus(id) {
      if (!zoomReady || !current || !declaredFor(id)) return;
      zoomView = id;
      applyView(zoomSaidAt(focusName(id, current.reference)));
    }

    /** A wheel, drag or pinch gesture moved the view: what was declared is no longer what is on screen. */
    function onFreeZoom() {
      if (destroyed || !zoomView) return;
      zoomView = null;
      paintZoom();
    }

    /** A new step (or a new problem) gives the picture back its own frame. */
    function resetZoom() {
      if (!zoomView) return;
      zoomView = null;
      paintZoom();
    }

    /* ---- The value labels of the picture as controls ---------------------------------------------------- */

    /** Where a pointer event landed in the chart's own pixel space, which is the space the labels are drawn in. */
    function canvasPoint(event) {
      const live = chart && chart.chart;
      const box = live && refs.canvas.getBoundingClientRect();
      if (!box || !box.width || !box.height) return null;
      return {
        x: ((event.clientX - box.left) * live.width) / box.width,
        y: ((event.clientY - box.top) * live.height) / box.height,
      };
    }

    /** The id of the value label under a pointer event, or null anywhere else on the canvas. */
    function labelUnder(event) {
      if (destroyed || !zoomReady || !chart || !chart.chart) return null;
      const p = canvasPoint(event);
      return p ? labelAt(chart.chart, p.x, p.y) : null;
    }

    /** The pointer cursor is the whole affordance of a painted label: without it nobody tries to click one. */
    function onCanvasMove(event) {
      const want = labelUnder(event) ? 'pointer' : '';
      if (refs.canvas.style.cursor !== want) refs.canvas.style.cursor = want;
    }

    function onCanvasLeave() {
      if (refs.canvas.style.cursor) refs.canvas.style.cursor = '';
    }

    function onCanvasDown(event) {
      pressedAt = { x: event.clientX, y: event.clientY };
    }

    /**
     * A click on a label frames its value. A drag-to-region zoom ends in a click too, so a pointer that
     * travelled is left to chartjs-plugin-zoom, and a click anywhere else on the canvas changes nothing.
     */
    function onCanvasClick(event) {
      const from = pressedAt;
      pressedAt = null;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP) return;
      const id = labelUnder(event);
      if (id) onFocus(id);
    }

    function onSlider(settled) {
      const v = snap(Number(refs.slider.value));
      if (Number.isFinite(v)) state.h = v;
      resetZoom();
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
      // A method that is no longer drawn cannot go on being the one the picture is looking at closely.
      if (zoomView && zoomView !== PRESET_VIEW && zoomView !== EXACT_ID && !state.visible.includes(zoomView)) zoomView = null;
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
      refs.zoomHost.hidden = true; // and so does the zoom
      if (current) paintCaption();
    }

    /** True once chartjs-plugin-zoom is registered on Chart.js (deps.js does the registering). */
    function zoomPluginRegistered() {
      try {
        return Boolean(win.Chart && win.Chart.registry && win.Chart.registry.getPlugin(ZOOM_PLUGIN_ID));
      } catch (err) {
        return false; // the registry throws when the id is unknown
      }
    }

    /**
     * The zoom controls appear only when the plugin really arrived; when it did not, the figure stays exactly
     * as it was and the group is never shown, so there is no control that does nothing.
     */
    function startZoom() {
      if (destroyed || zoomReady || !chart) return;
      const deps = EDO.deps;
      const status = deps && deps.status ? deps.status.zoom : 'failed';
      if (status === 'pending' && deps.zoom && typeof deps.zoom.then === 'function') {
        deps.zoom.then(startZoom);
        return;
      }
      if (status !== 'loaded' || !zoomPluginRegistered()) return;
      zoomReady = true;
      refs.zoomHost.hidden = false;
      // The row controls of the readout appear with the rest of the zoom, and only then: until this moment
      // there is no view for them to declare, and a control that does nothing is worse than none.
      paintNow();
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
          options: chartOptions(current, current.options, display(), plotWidth(), zoomState()),
        }, { title: 'Diagrama de un paso', tableAlt: false, actions: false });
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
      // Only now that there is a picture: without one there is no label to hover and nothing to click.
      const canvasEvents = {
        mousemove: onCanvasMove, mouseleave: onCanvasLeave, mousedown: onCanvasDown, click: onCanvasClick,
      };
      Object.keys(canvasEvents).forEach((name) => refs.canvas.addEventListener(name, canvasEvents[name]));
      unsubscribe.push(() => Object.keys(canvasEvents).forEach((name) => refs.canvas.removeEventListener(name, canvasEvents[name])));
      startZoom();
      remeasure();
    }

    /**
     * The margin of the value labels is reserved from their measured width, and a web font that is still on
     * its way measures as the fallback one: repaint once the document's fonts are settled, so the margin is
     * the one the labels really need (the slack of the reservation covers the wait).
     */
    function remeasure() {
      const fonts = win.document && win.document.fonts;
      if (!fonts || !fonts.ready || typeof fonts.ready.then !== 'function') return;
      fonts.ready.then(() => { if (!destroyed && chart) paintChart(); }, () => {});
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
      zoomView = null; // a new problem or a new step is a new picture: it starts at its own frame
      const zoomGroup = buildZoom();
      zoomGroup.hidden = chartLost || !zoomReady;
      refs.zoomHost.replaceWith(zoomGroup);
      refs.zoomHost = zoomGroup;
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
    refs.zoomHost = buildZoom();
    refs.zoomHost.hidden = true; // until chartjs-plugin-zoom is known to be registered
    refs.live = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    refs.root = h('div', { class: 'step-diagram', 'data-mode': state.methods === 'all' ? 'all' : 'single', 'data-method': state.methods === 'all' ? null : state.methods },
      h('div', { class: 'step-diagram__layout' },
        h('div', { class: 'step-diagram__main' }, buildFigure(), refs.showHost, refs.zoomHost),
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
    zoomWindow,
    zoomWindowFor,
    zoomConfig,
    focusLabel,
    labelRects,
    labelAt,
    EXACT_ID,
    spreadLabels,
    labelTexts,
    labelColumn,
    textWidth,
    plugin: stepPlugin,
    mount,
  };
}));
