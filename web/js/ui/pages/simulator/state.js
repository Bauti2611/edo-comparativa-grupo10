/**
 * EDO.simulator.state - the logic of the Simulador page, with no DOM: the form state (every input kept as typed
 * text), validation with Spanish messages, the h/N link, the shareable query, the run of the chosen methods
 * against the exact solution or an RK4 reference, the rows of the tables, the series of the charts and the CSV.
 * Everything numeric comes from the engine (`methods.solve`, `analysis.reference`/`errors`); this module only
 * decides what to compute and how to write it.
 *
 *   defaultState(), stateFromPreset(id)        a fresh state (the page never mutates one: every change returns a new state)
 *   edit(state, field, text)                   field: preset | f | indep | x0 | y0 | xf | h | N | exact; links h and N
 *   toQuery(state) / fromQuery(query)          the hash query; 'preset=' alone while the problem is the preset's own
 *   validate(state) -> {ok, errors, values}    errors[field] = {message, pos?}; values = {x0, y0, xf, h, N}
 *   run(state) -> {ok, errors} | {ok, problem, preset, reference, refYs, xs, solutions, diverged, ...}
 *   resultsTable(run, opts), errorsTable(run, opts)   {groups, columns, rows} of strings
 *   chartSeries(run), errorSeries(run, opts)   the points of the two charts
 *   csv(run)                                   text of the results at full precision
 *   stepsUpTo(N)                               iterations of the step-by-step panel (null = all)
 *
 * Load order: after the numerics (expr, format, problems, methods, analysis). Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      expr: require('../../../numerics/expr.js'),
      format: require('../../../numerics/format.js'),
      problems: require('../../../numerics/problems.js'),
      methods: require('../../../numerics/methods.js'),
      analysis: require('../../../numerics/analysis.js'),
    });
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.simulator = EDO.simulator || {};
    EDO.simulator.state = factory(EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const {
    expr, format, problems, methods, analysis,
  } = EDO;

  const MAX_N = 2000;
  const STEPS_SHOWN = 20;
  const DEFAULT_PRESET = 'cmp_2xy_13';
  const METHOD_ORDER = Object.freeze(['euler', 'taylor', 'heun', 'rk2']);
  const ORDERS = Object.freeze([2, 3, 4]);
  const NUMERIC_FIELDS = Object.freeze(['x0', 'y0', 'xf']);
  const CURVE_POINTS = 200;
  const ELLIPSIS = '—';

  const METHOD_NAMES = Object.freeze({
    euler: 'Euler', heun: 'Euler Mejorado', rk2: 'RK2 (punto medio)',
  });
  const PRIMES = Object.freeze({
    1: "'", 2: "''", 3: "'''", 4: '(4)',
  });

  /* ---- Small helpers -------------------------------------------------------------------------------------- */

  const parseNumber = format.parseNumber;
  const text = (v) => String(Number(Number(v).toPrecision(12)));
  const clone = (state) => Object.assign({}, state, { methods: state.methods.slice() });
  const isBlank = (s) => String(s === undefined || s === null ? '' : s).trim() === '';
  const squash = (s) => String(s).replace(/\s+/g, '');

  /** Number written for CSV and the URL: 15 significant digits, so binary noise (1.2299999999999998) disappears. */
  const fullNum = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(15))) : '');

  function errorOf(err) {
    const out = { message: err && err.message ? String(err.message) : 'Valor no válido.' };
    if (err && Number.isInteger(err.pos)) out.pos = err.pos;
    return out;
  }

  function sortedMethods(ids) {
    return METHOD_ORDER.filter((id) => ids.includes(id));
  }

  /* ---- State ---------------------------------------------------------------------------------------------- */

  /** The state of a preset: the typed text of its fields and the default choices of methods and display. */
  function stateFromPreset(id) {
    const preset = problems.byId(id) || problems.byId(DEFAULT_PRESET);
    return {
      preset: preset.id,
      f: preset.fStr,
      indep: preset.indep,
      x0: text(preset.x0),
      y0: text(preset.y0),
      xf: text(preset.xf),
      h: text(preset.h),
      N: String(preset.N),
      stepMode: 'h',
      methods: METHOD_ORDER.slice(),
      order: 2,
      exact: '',
      decimals: 4,
      mode: 'round',
      errType: 'abs',
    };
  }

  function defaultState() {
    return stateFromPreset(DEFAULT_PRESET);
  }

  /* ---- Numbers and steps ---------------------------------------------------------------------------------- */

  function tooManySteps(N) {
    return `La cantidad de pasos N = ${N} supera el máximo de ${MAX_N}. Aumente h o reduzca el intervalo.`;
  }

  /** Reads x0, y0, xf, h and N out of the text; `errors` holds what is wrong. */
  function resolveNumbers(state) {
    const errors = {};
    const values = {};
    NUMERIC_FIELDS.forEach((field) => {
      const v = parseNumber(state[field]);
      if (Number.isNaN(v)) errors[field] = { message: `Ingrese un número válido para ${field} (se admite coma o punto decimal).` };
      else values[field] = v;
    });
    if (errors.x0 || errors.xf) return { values, errors };
    if (!(values.xf > values.x0)) {
      errors.xf = { message: 'El valor final xf debe ser mayor que x0.' };
      return { values, errors };
    }
    if (state.stepMode === 'N') {
      const n = parseNumber(state.N);
      if (!Number.isInteger(n) || n < 1) errors.N = { message: 'La cantidad de pasos N debe ser un entero positivo.' };
      else if (n > MAX_N) errors.N = { message: tooManySteps(n) };
      else {
        values.N = n;
        values.h = (values.xf - values.x0) / n;
      }
      return { values, errors };
    }
    const hv = parseNumber(state.h);
    if (Number.isNaN(hv)) {
      errors.h = { message: 'Ingrese un paso h numérico (se admite coma o punto decimal).' };
      return { values, errors };
    }
    const steps = problems.stepsFor(values.x0, values.xf, hv);
    if (!steps.ok) errors.h = { message: steps.message };
    else if (steps.N > MAX_N) errors.h = { message: tooManySteps(steps.N) };
    else {
      values.h = hv;
      values.N = steps.N;
    }
    return { values, errors };
  }

  /* ---- Presets -------------------------------------------------------------------------------------------- */

  /** True when the problem in the form is exactly the preset's own (same f, variable, data and steps, no typed closed form). */
  function matchesPreset(state) {
    const preset = problems.byId(state.preset);
    if (!preset) return false;
    if (squash(state.f) !== squash(preset.fStr) || state.indep !== preset.indep || !isBlank(state.exact)) return false;
    const { values, errors } = resolveNumbers(state);
    if (Object.keys(errors).length) return false;
    return values.x0 === preset.x0 && values.y0 === preset.y0 && values.xf === preset.xf && values.N === preset.N
      && Math.abs(values.h - preset.h) <= 1e-12 * Math.abs(preset.h);
  }

  /** A state whose problem no longer matches its preset becomes the user's own problem. */
  function syncPreset(state) {
    if (state.preset === 'custom' || matchesPreset(state)) return state;
    return Object.assign({}, state, { preset: 'custom' });
  }

  /* ---- Editing -------------------------------------------------------------------------------------------- */

  /** Recomputes the field that follows the one edited last (N from h, or h from N), when the data allow it. */
  function relink(state) {
    const x0 = parseNumber(state.x0);
    const xf = parseNumber(state.xf);
    if (Number.isNaN(x0) || Number.isNaN(xf) || !(xf > x0)) return state;
    if (state.stepMode === 'N') {
      const n = parseNumber(state.N);
      if (Number.isInteger(n) && n >= 1) state.h = text((xf - x0) / n);
    } else {
      const hv = parseNumber(state.h);
      const steps = problems.stepsFor(x0, xf, hv);
      if (steps.ok) state.N = String(steps.N);
    }
    return state;
  }

  /**
   * A new state with one field changed. h and N are linked: editing one makes it the source and updates the
   * other when the combination is valid (otherwise the other keeps its value and `validate` explains the problem).
   * @param {object} state
   * @param {'preset'|'f'|'indep'|'x0'|'y0'|'xf'|'h'|'N'|'exact'|'decimals'|'mode'|'errType'|'order'} field
   * @param {string} value
   * @returns {object}
   */
  function edit(state, field, value) {
    if (field === 'preset') return value === 'custom' ? Object.assign({}, state, { preset: 'custom' }) : Object.assign(stateFromPreset(value), pickDisplay(state));
    const next = clone(state);
    if (field === 'indep') next.indep = value === 't' ? 't' : 'x';
    else if (field === 'order') next.order = ORDERS.includes(Number(value)) ? Number(value) : 2;
    else if (field === 'decimals') next.decimals = Math.min(10, Math.max(2, Math.round(Number(value)) || 4));
    else if (field === 'mode') next.mode = value === 'trunc' ? 'trunc' : 'round';
    else if (field === 'errType') next.errType = ['abs', 'rel', 'pct'].includes(value) ? value : 'abs';
    else next[field] = String(value);
    if (field === 'h') next.stepMode = 'h';
    if (field === 'N') next.stepMode = 'N';
    if (['x0', 'xf', 'h', 'N'].includes(field)) relink(next);
    return syncPreset(next);
  }

  /** The choices that survive a change of preset: methods, Taylor order and the display options. */
  function pickDisplay(state) {
    return {
      methods: state.methods.slice(), order: state.order, decimals: state.decimals, mode: state.mode, errType: state.errType,
    };
  }

  /* ---- Validation ----------------------------------------------------------------------------------------- */

  /**
   * Checks the form. `errors` maps a field (f, x0, y0, xf, h, N, exact, methods) to {message, pos?}.
   * @returns {{ok: boolean, errors: object, values: {x0?: number, y0?: number, xf?: number, h?: number, N?: number}}}
   */
  function validate(state) {
    const errors = {};
    const indep = state.indep === 't' ? 't' : 'x';
    if (isBlank(state.f)) errors.f = { message: 'Ingrese la expresión de f(x, y), por ejemplo 2*x*y.' };
    else {
      try {
        expr.parse(state.f, { indep });
      } catch (err) {
        errors.f = errorOf(err);
      }
    }
    const y0 = parseNumber(state.y0);
    const numbers = resolveNumbers(state);
    Object.assign(errors, numbers.errors);
    if (Number.isNaN(y0)) errors.y0 = { message: 'Ingrese un número válido para y0 (se admite coma o punto decimal).' };
    if (!isBlank(state.exact)) {
      try {
        problems.exactFromString(state.exact, { indep });
      } catch (err) {
        errors.exact = errorOf(err);
      }
    }
    if (!state.methods.length) errors.methods = { message: 'Elija al menos un método.' };
    return { ok: Object.keys(errors).length === 0, errors, values: Object.assign({ y0 }, numbers.values) };
  }

  /* ---- Query ---------------------------------------------------------------------------------------------- */

  const numText = (s) => {
    const v = parseNumber(s);
    return Number.isNaN(v) ? String(s).trim() : String(v);
  };

  /**
   * The hash query of a state: `{preset}` alone while the problem is the preset's own, otherwise
   * `f, indep, x0, y0, xf, h|n, m, ord` (and `ex`). Methods and order are added to the preset form only when
   * they are not the defaults.
   */
  function toQuery(state) {
    const query = {};
    const usesTaylor = state.methods.includes('taylor');
    const defaultMethods = sortedMethods(state.methods).join() === METHOD_ORDER.join();
    if (state.preset !== 'custom' && matchesPreset(state)) {
      query.preset = state.preset;
      if (!defaultMethods) query.m = sortedMethods(state.methods).join(',');
      if (usesTaylor && state.order !== 2) query.ord = String(state.order);
      return query;
    }
    query.f = String(state.f).trim();
    query.indep = state.indep;
    query.x0 = numText(state.x0);
    query.y0 = numText(state.y0);
    query.xf = numText(state.xf);
    if (state.stepMode === 'N') query.n = numText(state.N);
    else query.h = numText(state.h);
    query.m = sortedMethods(state.methods).join(',');
    if (usesTaylor) query.ord = String(state.order);
    if (!isBlank(state.exact)) query.ex = String(state.exact).trim();
    return query;
  }

  /** Methods and Taylor order from the `m` and `ord` parameters; `taylor3` and `taylor4` are accepted as ids. */
  function methodsFromQuery(query) {
    const ids = [];
    let order = ORDERS.includes(Number(query.ord)) ? Number(query.ord) : 2;
    String(query.m === undefined ? '' : query.m).split(',').forEach((raw) => {
      const m = /^(euler|taylor|heun|rk2)([2-4])?$/.exec(raw.trim().toLowerCase());
      if (!m) return;
      if (!ids.includes(m[1])) ids.push(m[1]);
      if (m[2]) order = Number(m[2]);
    });
    return { methods: ids.length ? sortedMethods(ids) : METHOD_ORDER.slice(), order };
  }

  /** The state a hash query describes (anything unknown or malformed falls back to the defaults). */
  function fromQuery(query) {
    const q = query && typeof query === 'object' ? query : {};
    const preset = problems.byId(q.preset);
    let state = preset ? stateFromPreset(preset.id) : defaultState();
    const free = ['f', 'indep', 'x0', 'y0', 'xf', 'h', 'n', 'ex'].some((key) => q[key] !== undefined && q[key] !== '');
    if (free && !preset) state = Object.assign(state, { preset: 'custom' });
    const set = (field, value) => {
      if (value !== undefined && value !== '') state[field] = String(value).trim();
    };
    set('f', q.f);
    if (q.indep !== undefined) state.indep = q.indep === 't' ? 't' : 'x';
    set('x0', q.x0);
    set('y0', q.y0);
    set('xf', q.xf);
    set('exact', q.ex);
    if (q.h !== undefined && q.h !== '') {
      state.h = String(q.h).trim();
      state.stepMode = 'h';
    } else if (q.n !== undefined && q.n !== '') {
      state.N = String(q.n).trim();
      state.stepMode = 'N';
    }
    Object.assign(state, methodsFromQuery(q));
    relink(state);
    return syncPreset(state);
  }

  /* ---- Run ------------------------------------------------------------------------------------------------ */

  function methodInfo(id, order) {
    const key = id === 'taylor' ? `taylor${order}` : id;
    const label = id === 'taylor' ? `Taylor (grado ${order})` : METHOD_NAMES[id];
    return {
      id, key, label, order: id === 'taylor' ? order : methods.byId(id).order, extension: id === 'taylor' && order > 2,
      short: id === 'taylor' ? 'Taylor' : label,
    };
  }

  function buildProblem(state, values, preset, exact) {
    const base = preset ? Object.assign({}, preset) : { id: 'custom', title: 'Problema propio', source: 'Simulador' };
    const spec = Object.assign(base, {
      indep: state.indep, fStr: state.f, x0: values.x0, y0: values.y0, xf: values.xf, exact: exact || null,
    });
    delete spec.h;
    delete spec.N;
    if (state.stepMode === 'N') spec.N = values.N;
    else spec.h = values.h;
    return problems.make(spec);
  }

  /** Choice of substeps of the RK4 reference: fine for short runs, coarser (still far below the methods' error) for long ones. */
  const substepsFor = (N) => Math.max(20, Math.min(200, Math.floor(40000 / N)));

  /**
   * Solves the problem with every chosen method and measures the errors.
   * @returns {object} `{ok: false, errors}` for an invalid form; otherwise `{ok: true, state, values, problem, preset,
   *   reference: {kind: 'exact'|'reference', label, tex, str}, xs, refYs, solutions: [{key, id, label, short, order,
   *   extension, solution, errors: {abs, rel, pct}}], diverged: [{label, message}]}`.
   */
  function run(state) {
    const check = validate(state);
    if (!check.ok) return { ok: false, errors: check.errors };
    const { values } = check;
    const preset = state.preset !== 'custom' && matchesPreset(state) ? problems.byId(state.preset) : null;
    let exact = null;
    if (!isBlank(state.exact)) exact = problems.exactFromString(state.exact, { indep: state.indep });
    else if (preset) exact = preset.exact;
    const problem = buildProblem(state, values, preset, exact);
    const xs = Array.from({ length: problem.N + 1 }, (_, i) => problem.x0 + i * problem.h);
    const refYs = analysis.reference(problem, xs, { substeps: substepsFor(problem.N) });
    const solutions = [];
    const diverged = [];
    sortedMethods(state.methods).forEach((id) => {
      const info = methodInfo(id, state.order);
      const solution = methods.solve(id, problem, id === 'taylor' ? { order: state.order } : {});
      solutions.push(Object.assign(info, { solution, errors: analysis.errors(solution, refYs.slice(0, solution.ys.length)) }));
      if (solution.diverged) diverged.push({ label: info.label, message: solution.message });
    });
    const reference = exact
      ? { kind: 'exact', label: 'Solución exacta', tex: exact.tex, str: exact.str }
      : { kind: 'reference', label: 'Referencia (RK4 de paso fino)', tex: null, str: null };
    return {
      ok: true, state, values, problem, preset, reference, xs, refYs, solutions, diverged,
    };
  }

  /* ---- Tables --------------------------------------------------------------------------------------------- */

  const showX = (v) => format.num(v, { decimals: 10, mode: 'round' });
  // Trailing zeros kept so the columns line up (1.2000 above 1.5427).
  const showY = (v, o) => format.num(v, { decimals: o.decimals, mode: o.mode, trim: false });

  /** Columns of intermediate values of a method, from `step.detail` (the engine's own numbers). */
  function detailColumns(sol) {
    const col = (text0, sub, sup, get) => ({
      text: text0, sub: sub || '', sup: sup || '', get,
    });
    switch (sol.id) {
      case 'euler':
        return [col('y', 'n', "'", (d) => d.slope)];
      case 'taylor':
        return Array.from({ length: sol.order }, (_, k) => col('y', 'n', PRIMES[k + 1], (d) => d.derivs[k]));
      case 'heun':
        return [col('y', 'n', "'", (d) => d.slope), col('predictor', '', '', (d) => d.yPred), col('f(predictor)', '', '', (d) => d.slopeEnd)];
      default:
        return [col('k', '1', '', (d) => d.k1), col('x', 'n+1/2', '', (d) => d.xMid), col('y', 'n+1/2', '', (d) => d.yMid)];
    }
  }

  function options(opts) {
    const o = opts || {};
    return {
      decimals: Number.isInteger(o.decimals) ? o.decimals : 4,
      mode: o.mode === 'trunc' ? 'trunc' : 'round',
      errType: ['abs', 'rel', 'pct'].includes(o.errType) ? o.errType : 'abs',
      intermediate: Boolean(o.intermediate),
    };
  }

  /**
   * The results table: n, x_n and, for each method, y_n (and, with `intermediate`, the values of its step n).
   * @returns {{groups: Array<{label: string, key: string|null, span: number}>, columns: Array<{text, sub, sup}>, rows: string[][]}}
   */
  function resultsTable(runResult, opts) {
    const o = options(opts);
    const N = runResult.problem.N;
    const groups = [{ label: '', key: null, id: null, span: 2 }];
    const columns = [{ text: 'n', sub: '', sup: '' }, { text: 'x', sub: 'n', sup: '' }];
    const perMethod = runResult.solutions.map((sol) => {
      const extra = o.intermediate ? detailColumns(sol) : [];
      groups.push({ label: sol.label, key: sol.key, id: sol.id, span: 1 + extra.length });
      columns.push({ text: 'y', sub: 'n', sup: '' });
      extra.forEach((c) => columns.push({ text: c.text, sub: c.sub, sup: c.sup }));
      return extra;
    });
    const rows = [];
    for (let n = 0; n <= N; n += 1) {
      const row = [String(n), showX(runResult.xs[n])];
      runResult.solutions.forEach((sol, i) => {
        const { ys, steps } = sol.solution;
        row.push(n < ys.length ? showY(ys[n], o) : ELLIPSIS);
        perMethod[i].forEach((c) => {
          const step = steps[n];
          row.push(step && n < ys.length ? showY(c.get(step.detail), o) : (n < ys.length ? '' : ELLIPSIS));
        });
      });
      rows.push(row);
    }
    return { groups, columns, rows };
  }

  /** An error as text: scientific when tiny or huge, "—" when it is not defined (reference 0, divergence). */
  function showError(v, type, decimals) {
    if (v === null || v === undefined || !Number.isFinite(v)) return ELLIPSIS;
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (type === 'pct') {
      return a < 1e-3 || a >= 1e6 ? format.sci(v, { digits: 3, trim: false }) : format.num(v, { decimals: Math.max(decimals, 4), mode: 'round' });
    }
    if (a < 1e-4 || a >= 1e4) return format.sci(v, { digits: 3, trim: false });
    return format.num(v, { decimals: Math.max(decimals, 6), mode: 'round' });
  }

  const errorAt = (errors, type, i) => errors[type][i];

  /** The errors table: n, x_n and the chosen kind of error (abs, rel or pct) of each method at every x_n. */
  function errorsTable(runResult, opts) {
    const o = options(opts);
    const N = runResult.problem.N;
    const groups = [{ label: '', key: null, id: null, span: 2 }];
    const columns = [{ text: 'n', sub: '', sup: '' }, { text: 'x', sub: 'n', sup: '' }];
    runResult.solutions.forEach((sol) => {
      groups.push({ label: sol.label, key: sol.key, id: sol.id, span: 1 });
      columns.push({ text: ERROR_HEAD[o.errType], sub: '', sup: '' });
    });
    const rows = [];
    for (let n = 0; n <= N; n += 1) {
      const row = [String(n), showX(runResult.xs[n])];
      runResult.solutions.forEach((sol) => {
        row.push(n < sol.solution.ys.length ? showError(errorAt(sol.errors, o.errType, n), o.errType, o.decimals) : ELLIPSIS);
      });
      rows.push(row);
    }
    return { groups, columns, rows };
  }
  const ERROR_HEAD = Object.freeze({ abs: 'error absoluto', rel: 'error relativo', pct: 'error (%)' });

  /* ---- Charts --------------------------------------------------------------------------------------------- */

  /** Points of the solutions and of the reference curve (dense when the closed form is known). */
  function chartSeries(runResult) {
    const { problem, xs } = runResult;
    const finite = (p) => Number.isFinite(p.x) && Number.isFinite(p.y);
    let referencePoints;
    if (runResult.reference.kind === 'exact') {
      const span = problem.xf - problem.x0;
      referencePoints = Array.from({ length: CURVE_POINTS + 1 }, (_, i) => {
        const x = problem.x0 + (span * i) / CURVE_POINTS;
        return { x, y: problem.exact.fn(x) };
      }).filter(finite);
    } else {
      referencePoints = xs.map((x, i) => ({ x, y: runResult.refYs[i] })).filter(finite);
    }
    return {
      indep: problem.indep,
      reference: { label: runResult.reference.label, points: referencePoints },
      methods: runResult.solutions.map((sol) => ({
        key: sol.key, id: sol.id, label: sol.label, points: sol.solution.ys.map((y, i) => ({ x: sol.solution.xs[i], y })).filter(finite),
      })),
    };
  }

  /** One series of errors per method; a log axis drops the zeros (the error at x0) it cannot draw. */
  function errorSeries(runResult, opts) {
    const o = options(opts);
    const log = Boolean(opts && opts.log);
    return runResult.solutions.map((sol) => ({
      key: sol.key,
      id: sol.id,
      label: sol.label,
      points: sol.solution.xs
        .map((x, i) => ({ x, y: errorAt(sol.errors, o.errType, i) }))
        .filter((p) => p.y !== null && Number.isFinite(p.y) && (!log || p.y > 0)),
    }));
  }

  /* ---- CSV ------------------------------------------------------------------------------------------------ */

  const csvCell = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

  /**
   * The results as CSV text (comma-separated, '.' decimals, CRLF): n, x, the exact solution or reference and, per
   * method, y_n and its absolute and relative error, all at full precision (15 significant digits).
   */
  function csv(runResult) {
    const head = ['n', 'x', runResult.reference.kind === 'exact' ? 'exacta' : 'referencia'];
    runResult.solutions.forEach((sol) => head.push(`${sol.key}_y`, `${sol.key}_error_abs`, `${sol.key}_error_rel`));
    const lines = [head.map(csvCell).join(',')];
    for (let n = 0; n <= runResult.problem.N; n += 1) {
      const row = [String(n), fullNum(runResult.xs[n]), fullNum(runResult.refYs[n])];
      runResult.solutions.forEach((sol) => {
        const here = n < sol.solution.ys.length;
        row.push(here ? fullNum(sol.solution.ys[n]) : '', here ? fullNum(sol.errors.abs[n]) : '', here ? fullNum(sol.errors.rel[n]) : '');
      });
      lines.push(row.map(csvCell).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  /** Iterations the step-by-step panel renders: all of them, or only the first STEPS_SHOWN when N is larger. */
  function stepsUpTo(N) {
    return N > STEPS_SHOWN ? STEPS_SHOWN : null;
  }

  return {
    MAX_N,
    STEPS_SHOWN,
    DEFAULT_PRESET,
    METHOD_ORDER,
    ORDERS,
    ERROR_HEAD,
    defaultState,
    stateFromPreset,
    edit,
    matchesPreset,
    validate,
    toQuery,
    fromQuery,
    run,
    resultsTable,
    errorsTable,
    chartSeries,
    errorSeries,
    csv,
    stepsUpTo,
  };
}));
