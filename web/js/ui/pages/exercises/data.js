/**
 * EDO.exercises.data - the numbers and TeX of the Ejercicios page. Pure logic (no DOM): the page lays the values
 * out and web/tests/exercises.test.js checks them against the oracles of the ODD document (sections 5.4 to 5.6).
 * Nothing numeric is typed by hand: every value comes from the engine (`methods.solve`, `analysis.reference`).
 * The only exception are the values the apunte publishes, which live in `EDO.config.apunte` and are never used
 * as a result: they are only compared with what the engine recomputes.
 *
 *   catedra()          the four solved examples of the apunte (presets a1..a4)
 *   comparison()       the comparative case y' = 2xy, y(1) = 1 (preset cmp_2xy_13) with the four methods
 *   iterations(preset) the four methods on one preset, iteration by iteration, against the exact solution
 *   bankRows()         one row per exercise of the practice sheets (groups practica05 and practica06)
 *   chartSeries(...)   the points of the figure of one problem
 *   apunteChecks()     the published values of EDO.config.apunte recomputed by the engine (always available)
 *   verificationLines(key)  the neutral lines of one example; empty unless `apunte.mostrarVerificacion` is true
 *   resolveSub(sub)    what a '#/ejercicios/<sub>' deep link points to
 *
 * Load order: after config.js and the numerics (expr, format, problems, methods, analysis) and steps-model.js.
 * Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      config: require('../../../config.js'),
      expr: require('../../../numerics/expr.js'),
      format: require('../../../numerics/format.js'),
      problems: require('../../../numerics/problems.js'),
      methods: require('../../../numerics/methods.js'),
      analysis: require('../../../numerics/analysis.js'),
    });
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.exercises = EDO.exercises || {};
    EDO.exercises.data = factory(EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const {
    config, expr, format, problems, methods, analysis,
  } = EDO;

  /** The four solved examples of the apunte, in order. */
  const CATEDRA_IDS = Object.freeze(['a1', 'a2', 'a3', 'a4']);
  /** The comparative case: the PVI of Ejemplos 1 and 4 of the apunte, here with the four methods. */
  const COMPARE_ID = 'cmp_2xy_13';
  /** Groups of the practice bank. */
  const BANK_GROUPS = Object.freeze(['practica05', 'practica06']);
  const METHOD_ORDER = Object.freeze(['euler', 'taylor', 'heun', 'rk2']);
  /** The three methods of second order: the ones the talk compares with each other. */
  const SECOND_ORDER = Object.freeze(['taylor', 'heun', 'rk2']);
  /** Errors closer than this (relative) are a tie: rounding noise, not a difference between methods. */
  const TIE_REL = 1e-12;

  const METHOD_NAMES = Object.freeze({
    euler: 'Euler',
    taylor: 'Taylor de grado 2',
    heun: 'Euler Mejorado',
    rk2: 'RK2 (punto medio)',
  });
  const CHIP_NAMES = Object.freeze({
    euler: 'Euler', taylor: 'Taylor', heun: 'Euler Mejorado', rk2: 'RK2',
  });

  /** Slug of the card of each solved example: '#/ejercicios/ej1' .. 'ej4'. */
  const CARD_SLUGS = Object.freeze(CATEDRA_IDS.map((id, i) => `ej${i + 1}`));
  const SECTION_SLUGS = Object.freeze(['catedra', 'comparativo', 'banco']);

  /* ---- Display ------------------------------------------------------------------------------------------------ */

  /** A value as the tables show it: `decimals` decimals, truncated (the apunte's way) or rounded. */
  function show(v, mode, decimals) {
    return format.num(v, { decimals: decimals === undefined ? 6 : decimals, mode: mode === 'round' ? 'round' : 'trunc', trim: false });
  }

  /** An error: always rounded (it is our addition, not a value of the apunte), scientific when it is tiny or huge. */
  function showError(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a < 1e-4 || a >= 1e4) return format.sci(v, { digits: 3, trim: false });
    return format.num(v, { decimals: 6, mode: 'round', trim: false });
  }

  /** A relative error as a percentage, with 3 significant digits (null when it is not defined). */
  function showPercent(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    const pct = v * 100;
    if (pct === 0) return '0';
    return Math.abs(pct) < 0.001 ? format.sci(pct, { digits: 3, trim: false }) : format.num(pct, { decimals: 4, mode: 'round' });
  }

  /** What the "Cifras" control explains, computed from the apunte's own Ejemplo 1 (1.9727613... truncated or rounded). */
  function modeNotice() {
    const p = problems.fromPreset('a1');
    const y = methods.solve('taylor', p, { order: 2 }).ys[p.N];
    const exact = format.num(y, { decimals: 7, mode: 'round' });
    const t = format.num(y, { decimals: 4, mode: 'trunc' });
    const r = format.num(y, { decimals: 4, mode: 'round' });
    return {
      trunc: `Se cortan a 4 decimales, como en el apunte: ${exact}… se escribe ${t}. Los cálculos usan siempre todas las cifras.`,
      round: `Se redondean a 4 decimales: ${exact}… se escribe ${r}. Los cálculos usan siempre todas las cifras.`,
    };
  }

  /* ---- The problem as text ------------------------------------------------------------------------------------- */

  /**
   * The PVI as TeX pieces: `f` ("y' = ..."), `ic` ("y(1) = 1"), `h`, `ask` ("y(1.3)"), `n` (the iterations).
   * Data are written exactly (up to 10 decimals, zeros dropped).
   */
  function pviTeX(problem) {
    const n = (v) => format.num(v, { decimals: 10 });
    return {
      f: `y' = ${expr.toTeX(problem.fNode, { indep: problem.indep })}`,
      ic: `y(${n(problem.x0)}) = ${n(problem.y0)}`,
      h: `h = ${n(problem.h)}`,
      ask: `y(${n(problem.xf)})`,
      n: problem.N,
    };
  }

  /* ---- Charts ----------------------------------------------------------------------------------------------------- */

  /**
   * The points of the figure of one problem: a dense curve of the exact solution (or of the RK4 reference when the
   * problem has no closed form) and the numerical solutions.
   * @param {object} problem A Problem.
   * @param {object[]} solutions Solutions of `methods.solve`.
   * @returns {{indep: string, reference: boolean, curve: {x: number, y: number}[], methods: {id: string, label: string, points: {x: number, y: number}[]}[]}}
   */
  function chartSeries(problem, solutions) {
    const m = Math.max(40, Math.min(200, problem.N * 20));
    const xs = Array.from({ length: m + 1 }, (v, i) => problem.x0 + ((problem.xf - problem.x0) * i) / m);
    const ys = problem.exact ? xs.map((x) => problem.exact.fn(x)) : analysis.reference(problem, xs);
    return {
      indep: problem.indep || 'x',
      reference: !problem.exact,
      curve: xs.map((x, i) => ({ x, y: ys[i] })),
      methods: solutions.map((sol) => ({
        id: sol.method,
        label: METHOD_NAMES[sol.method] || sol.label || sol.method,
        points: sol.xs.map((x, i) => ({ x, y: sol.ys[i] })),
      })),
    };
  }

  /* ---- The three methods side by side on one problem ------------------------------------------------------------- */

  /**
   * The four methods on one preset, iteration by iteration: this is the view the comparison needs, because the
   * difference between the three methods of second order only becomes visible value by value.
   * @param {string} presetId A preset id of the library.
   * @returns {{problem: object, pvi: object, exactKind: 'exacta'|'referencia', rows: object[], solutions: object}}
   *   `rows[n]` = `{n, x, exact, values: {id: y_n}, errors: {id: |exact - y_n|}, best}`; `best` is the closest of
   *   the three methods of second order at that abscissa, or null at n = 0, where every method still has no error.
   */
  function iterations(presetId) {
    const problem = problems.fromPreset(presetId);
    const solutions = {};
    METHOD_ORDER.forEach((id) => { solutions[id] = methods.solve(id, problem, { order: 2 }); });
    const xs = solutions.euler.xs;
    const exact = problem.exact ? xs.map((x) => problem.exact.fn(x)) : analysis.reference(problem, xs);
    const rows = xs.map((x, n) => {
      const values = {};
      const errors = {};
      METHOD_ORDER.forEach((id) => {
        values[id] = solutions[id].ys[n];
        errors[id] = Math.abs(exact[n] - values[id]);
      });
      const ranked = SECOND_ORDER.filter((id) => Number.isFinite(errors[id])).sort((a, b) => errors[a] - errors[b]);
      // A tie is not a winner: on a linear problem the three methods do exactly the same arithmetic.
      const tie = ranked.length > 1 && Math.abs(errors[ranked[0]] - errors[ranked[1]]) <= TIE_REL * Math.max(1, Math.abs(errors[ranked[1]]));
      return {
        n,
        x,
        exact: exact[n],
        values,
        errors,
        best: n === 0 || !ranked.length || tie ? null : ranked[0],
      };
    });
    return {
      problem, pvi: pviTeX(problem), exactKind: problem.exact ? 'exacta' : 'referencia', rows, solutions,
    };
  }

  /* ---- The published values of the apunte ------------------------------------------------------------------------- */

  /** How many decimals a published value is written with (1.4297 -> 4), to compare at the apunte's own precision. */
  function decimalsOf(value) {
    const dot = String(value).indexOf('.');
    return dot < 0 ? 0 : String(value).length - dot - 1;
  }

  /** The published value as the apunte writes it. */
  const showPublished = (value) => format.num(value, { decimals: decimalsOf(value) });

  /**
   * A published value agrees with the engine when it is what the computed value becomes at that same number of
   * decimals, truncated (the apunte's usual way) or rounded.
   */
  function agrees(published, computed) {
    if (!Number.isFinite(computed)) return false;
    const decimals = decimalsOf(published);
    const want = showPublished(published);
    return ['trunc', 'round'].some((mode) => format.num(computed, { decimals, mode }) === want);
  }

  /**
   * The published values of `EDO.config.apunte` next to what the engine computes for the same preset with the same
   * method. Always available: it does not depend on `mostrarVerificacion`.
   * @returns {{key: string, preset: string, methodId: string, values: object[]}[]}
   *   `values[i]` = `{step, published, publishedText, computed, computedText, agrees}` for y1, y2, ...
   */
  function apunteChecks() {
    const block = (config && config.apunte) || {};
    const examples = block.examples || {};
    return Object.keys(examples).map((key) => {
      const spec = examples[key];
      const problem = problems.fromPreset(spec.preset);
      const solution = methods.solve(spec.method, problem, { order: problem.order || 2 });
      const values = (spec.published || []).map((published, i) => {
        const computed = solution.ys[i + 1];
        return {
          step: i + 1,
          published,
          publishedText: showPublished(published),
          computed,
          computedText: show(computed, 'round', 6),
          agrees: agrees(published, computed),
        };
      });
      return {
        key, preset: spec.preset, methodId: spec.method, values,
      };
    });
  }

  /**
   * The verification lines of one example: one neutral line per published value that does not follow from the
   * apunte's own expression. Empty while `EDO.config.apunte.mostrarVerificacion` is false, which is the default.
   * @param {string} key Key of the example in `EDO.config.apunte.examples` ('ej1' .. 'ej4').
   * @returns {string[]}
   */
  function verificationLines(key) {
    const block = (config && config.apunte) || {};
    if (block.mostrarVerificacion !== true) return [];
    const entry = apunteChecks().find((c) => c.key === key);
    if (!entry) return [];
    return entry.values.filter((v) => !v.agrees)
      .map((v) => `Valor publicado en el apunte: ${v.publishedText} · Valor recalculado con la misma fórmula: ${v.computedText}`);
  }

  /* ---- Section A: the apunte's examples ---------------------------------------------------------------------------- */

  /**
   * The four solved examples of the apunte. Each entry: `{id, slug, number, problem, methodId, methodName, chip,
   * pvi, solution, notes, verification, compare, series}`; `series` is the figure of that example (its method
   * against the exact curve), `compare` the same PVI solved with the four methods iteration by iteration and
   * `verification` the lines of the published values (empty unless the config switch is on).
   */
  function catedra() {
    return CATEDRA_IDS.map((id, i) => {
      const problem = problems.fromPreset(id);
      const methodId = problem.method;
      const solution = methods.solve(methodId, problem, { order: problem.order });
      return {
        id,
        slug: CARD_SLUGS[i],
        number: i + 1,
        problem,
        methodId,
        methodName: METHOD_NAMES[methodId],
        chip: CHIP_NAMES[methodId],
        pvi: pviTeX(problem),
        solution,
        notes: problem.notes,
        verification: verificationLines(CARD_SLUGS[i]),
        compare: iterations(id),
        series: chartSeries(problem, [solution]),
      };
    });
  }

  /* ---- Section B: the comparative case ----------------------------------------------------------------------------- */

  /**
   * The comparative case with the four methods at h = 0.1: final value, error against the exact value, evaluations
   * per step and the closest method of the three of second order.
   * @returns {{problem: object, pvi: object, exact: number, rows: object[], best: string, ranking: string[],
   *   solutions: Object<string, object>, series: object, closing: object}}
   */
  function comparison() {
    const problem = problems.fromPreset(COMPARE_ID);
    const solutions = {};
    METHOD_ORDER.forEach((id) => { solutions[id] = methods.solve(id, problem, { order: 2 }); });
    const refs = analysis.reference(problem, solutions.euler.xs);
    const exact = refs[refs.length - 1];
    const rows = METHOD_ORDER.map((id) => {
      const y = solutions[id].ys[problem.N];
      const error = Math.abs(exact - y);
      const cost = methods.costPerStep(id, 2);
      return {
        id,
        name: METHOD_NAMES[id],
        chip: CHIP_NAMES[id],
        y,
        error,
        relative: exact !== 0 ? error / Math.abs(exact) : null,
        evals: cost.total,
        f: cost.f,
        deriv: cost.deriv,
        secondOrder: id !== 'euler',
      };
    });
    const second = rows.filter((r) => r.secondOrder).sort((a, b) => a.error - b.error);
    const best = second[0].id;
    const eulerRow = rows[0];
    return {
      problem,
      pvi: pviTeX(problem),
      exact,
      rows,
      best,
      ranking: second.map((r) => r.id),
      solutions,
      series: chartSeries(problem, METHOD_ORDER.map((id) => solutions[id])),
      closing: {
        closest: second[0],
        middle: second[1],
        farthest: second[2],
        euler: eulerRow,
        // How many times smaller the closest second-order error is than Euler's.
        gainOverEuler: second[0].error > 0 ? eulerRow.error / second[0].error : null,
      },
    };
  }

  /* ---- Section C: the practice bank ---------------------------------------------------------------------------------- */

  /**
   * One row per exercise of the practice sheets (Práctica 05 and Práctica 06), solved with the method the sheet asks
   * for. Each row: `{id, slug, group, groupLabel, source, title, methodId, methodName, chip, pvi, h, n, ask, y,
   * exact, exactKind, error, relative, notes, problem}`.
   */
  function bankRows() {
    const labels = {};
    problems.GROUPS.forEach((g) => { labels[g.id] = g.label; });
    return problems.PRESETS.filter((spec) => BANK_GROUPS.includes(spec.group)).map((spec) => {
      const problem = problems.fromPreset(spec.id);
      const methodId = problem.method;
      const solution = methods.solve(methodId, problem, { order: problem.order });
      const refs = analysis.reference(problem, solution.xs);
      const exact = refs[refs.length - 1];
      const y = solution.ys[solution.N];
      const error = Math.abs(exact - y);
      return {
        id: spec.id,
        slug: spec.id,
        group: spec.group,
        groupLabel: labels[spec.group] || spec.group,
        source: problem.source,
        title: problem.title,
        methodId,
        methodName: METHOD_NAMES[methodId],
        chip: CHIP_NAMES[methodId],
        pvi: pviTeX(problem),
        h: problem.h,
        n: problem.N,
        ask: pviTeX(problem).ask,
        y,
        exact,
        exactKind: problem.exact ? 'exacta' : 'referencia RK4',
        error,
        relative: exact !== 0 ? error / Math.abs(exact) : null,
        notes: problem.notes,
        problem,
      };
    });
  }

  /** The groups and methods present in the bank, for the filter chips (in display order). */
  function bankFilters(rows) {
    const groups = [];
    const methodIds = [];
    rows.forEach((r) => {
      if (!groups.some((g) => g.id === r.group)) groups.push({ id: r.group, label: r.groupLabel });
      if (!methodIds.includes(r.methodId)) methodIds.push(r.methodId);
    });
    return {
      groups,
      methods: METHOD_ORDER.filter((id) => methodIds.includes(id)).map((id) => ({ id, label: CHIP_NAMES[id] })),
    };
  }

  /* ---- Deep links ----------------------------------------------------------------------------------------------------- */

  /**
   * What '#/ejercicios/<sub>' points to: `{kind: 'section'|'card'|'row', id, elementId}` or null.
   * Elements are `ejercicios-<slug>`: the shell scrolls to `ejercicios-<sub>` by itself.
   */
  function resolveSub(sub) {
    if (!sub) return null;
    if (SECTION_SLUGS.includes(sub)) return { kind: 'section', id: sub, elementId: `ejercicios-${sub}` };
    const ci = CARD_SLUGS.indexOf(sub);
    if (ci >= 0) return { kind: 'card', id: CATEDRA_IDS[ci], elementId: `ejercicios-${sub}` };
    const spec = problems.byId(sub);
    if (spec && BANK_GROUPS.includes(spec.group)) return { kind: 'row', id: sub, elementId: `ejercicios-${sub}` };
    return null;
  }

  return {
    CATEDRA_IDS,
    COMPARE_ID,
    BANK_GROUPS,
    METHOD_ORDER,
    SECOND_ORDER,
    METHOD_NAMES,
    CHIP_NAMES,
    CARD_SLUGS,
    SECTION_SLUGS,
    show,
    showError,
    showPercent,
    modeNotice,
    pviTeX,
    chartSeries,
    iterations,
    apunteChecks,
    verificationLines,
    catedra,
    comparison,
    bankRows,
    bankFilters,
    resolveSub,
  };
}));
