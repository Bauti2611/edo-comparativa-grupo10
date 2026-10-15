/**
 * EDO.compare.model - the logic of the Comparativa page, with no DOM. Every number comes from the engine
 * (`methods.solve`, `analysis.reference`/`convergence`/`workPrecision`/`localErrorConstants`); this module decides
 * what to compute for each view and writes the conclusions from the computed values only.
 *
 *   defaultState() / fromQuery(query) / toQuery(state)   {caseId, h}; the query is {caso, h}, empty for the default
 *   caseGroups()                       presets grouped for the case selector (comparison cases first)
 *   hOptions(caseId) -> [{h, N}]       steps around the case's own h that divide the interval exactly
 *   sameProblem(caseId, h)             the four methods at x_f against the exact solution (or an RK4 reference)
 *   solutionSeries(result), errorSeries(result)   points of the solution chart and of the error-vs-x chart
 *   convergenceStudy(caseId)           h, h/2, ..., h/32 from the case's h: errors at x_f, observed orders, estimate
 *   slopeLines(study), workPrecision(study)       reference slopes 1 and 2; (total evaluations, error) points
 *   linearDemo({lambda, h, steps})     y' = λy: the three second-order methods coincide; |R(hλ)| > 1 is unstable
 *   stabilityScan(zs)                  R(z) of the four methods for several z = hλ, with the verdict of each row
 *   winners(), noUniversalWinner()     which second-order method wins each catalogue case, and the sentence it proves
 *   taylorFarthest()                   in how many catalogue cases Taylor is the farthest of the three
 *   orderTable(), costTable()          local/global error order per method; evaluations per step (Taylor 2, 3, 4)
 *   taylorDegrees()                    what a higher Taylor degree buys: y_1, the error of one step and its drop
 *   summaryMatrix(), conclusions(result, study)
 *   localConstants(caseId)             C of the one-step error, predicted vs measured, and the ratio as h falls
 *   constantsOverview()                the same constants for every comparison case: the winner changes
 *
 * The Ordenada Genérica of each method and the stability scan are read from EDO.theory.data, the pure module that
 * already computes them for the apunte's example: the formulas of the cátedra have one source, not two.
 *
 * Load order: after the numerics (expr, format, problems, methods, analysis) and theory/data.js.
 * Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      format: require('../../../numerics/format.js'),
      problems: require('../../../numerics/problems.js'),
      methods: require('../../../numerics/methods.js'),
      analysis: require('../../../numerics/analysis.js'),
      theory: { data: require('../theory/data.js') },
    });
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.compare = EDO.compare || {};
    EDO.compare.model = factory(EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const {
    format, problems, methods, analysis,
  } = EDO;
  const theoryData = EDO.theory.data;

  const IDS = Object.freeze(['euler', 'taylor', 'heun', 'rk2']);
  const SECOND = Object.freeze(['taylor', 'heun', 'rk2']);
  const LABELS = Object.freeze({
    euler: 'Euler', taylor: 'Taylor de grado 2', heun: 'Euler Mejorado', rk2: 'RK2 (punto medio)',
  });
  const DEFAULT_CASE = 'cmp_2xy_13';
  const H_FACTORS = Object.freeze([4, 2, 1, 0.5, 0.25, 0.125]);
  const MAX_N = 2000;
  const LEVELS = 6;
  const CURVE_POINTS = 121;
  const LAMBDAS = Object.freeze([-1, -2, -5, -10, -20]);
  const LINEAR = Object.freeze({
    lambda: -10, h: 0.1, steps: 8, hMin: 0.05, hMax: 0.5, hStep: 0.05,
  });
  const UNSTABLE_TOL = 1e-12;
  /** How far an estimated order may be from 1 or 2 for the conclusions to say it matches the theory. */
  const ORDER_TOL = 0.15;
  /** Taylor degrees the cost table lists next to the one-stage and two-stage methods. */
  const TAYLOR_DEGREES = Object.freeze([2, 3, 4]);
  /** Which worked example of the apunte each method comes from (the apunte's own numbering). */
  const APUNTE = Object.freeze({
    euler: 'Ejemplo 2', taylor: 'Ejemplo 1', heun: 'Ejemplo 3', rk2: 'Ejemplo 4',
  });
  /** Euler's step: the definition of the method, the one Ordenada Genérica the apunte does not print apart. */
  const EULER_GENERIC = "y_{n+1} = y_n + h\\,y_n'";
  /** How many halvings of h the local-error ratio table covers. */
  const RATIO_LEVELS = 4;

  /** Removes binary noise such as 0.30000000000000004 / 3 -> 0.1. */
  const clean = (v) => Number(Number(v).toPrecision(12));
  const fixed = (v, d) => format.num(v, { decimals: d, mode: 'round' });
  const sci = (v) => format.sci(v, { digits: 3 });
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  /* ---- Cases and state ------------------------------------------------------------------------------------- */

  function presetOf(caseId) {
    return problems.byId(caseId) || problems.byId(DEFAULT_CASE);
  }

  function baseH(preset) {
    return clean(preset.h !== undefined && preset.h !== null ? preset.h : (preset.xf - preset.x0) / preset.N);
  }

  function caseGroups() {
    const order = ['comparativa'].concat(problems.GROUPS.map((g) => g.id).filter((id) => id !== 'comparativa'));
    return order.map((id) => {
      const group = problems.GROUPS.find((g) => g.id === id);
      return {
        id,
        label: group.label,
        cases: problems.PRESETS.filter((p) => p.group === id).map((p) => ({ id: p.id, title: p.title })),
      };
    }).filter((g) => g.cases.length > 0);
  }

  /** Steps h·{4, 2, 1, 1/2, 1/4, 1/8} of the case's own h that give an integer N (at most MAX_N), largest first. */
  function hOptions(caseId) {
    const preset = presetOf(caseId);
    const h0 = baseH(preset);
    const out = [];
    H_FACTORS.forEach((factor) => {
      const hh = clean(h0 * factor);
      const s = problems.stepsFor(preset.x0, preset.xf, hh);
      if (s.ok && s.N <= MAX_N && !out.some((o) => o.h === hh)) out.push({ h: hh, N: s.N });
    });
    return out;
  }

  function defaultState() {
    return { caseId: DEFAULT_CASE, h: baseH(presetOf(DEFAULT_CASE)) };
  }

  /** A valid state for a case: the requested h when it is one of the offered steps, else the case's own h. */
  function stateFor(caseId, h) {
    const id = problems.byId(caseId) ? caseId : DEFAULT_CASE;
    const match = hOptions(id).find((o) => Math.abs(o.h - h) <= 1e-12 * Math.max(1, o.h));
    return { caseId: id, h: match ? match.h : baseH(presetOf(id)) };
  }

  function fromQuery(query) {
    const q = query || {};
    const caseId = problems.byId(q.caso) ? q.caso : DEFAULT_CASE;
    const h = format.parseNumber(String(q.h === undefined ? '' : q.h));
    return stateFor(caseId, h);
  }

  function toQuery(state) {
    const out = {};
    if (state.caseId !== DEFAULT_CASE) out.caso = state.caseId;
    if (state.h !== baseH(presetOf(state.caseId))) out.h = String(state.h);
    return out;
  }

  /* ---- Same problem, four methods ---------------------------------------------------------------------------- */

  function referenceOf(problem, xs) {
    if (problem.exact) {
      return {
        kind: 'exact', label: 'Solución exacta', tex: problem.exact.tex, ys: xs.map((x) => problem.exact.fn(x)),
      };
    }
    return {
      kind: 'reference', label: 'Referencia (RK4)', tex: null, ys: analysis.reference(problem, xs),
    };
  }

  /**
   * Solves the case with the four methods and step h and measures each one at x_f.
   * @returns {{caseId, preset, problem, h, N, xs, reference: {kind, label, tex, value, ys}, solutions,
   *   rows: {id, label, baseline, y, abs, rel, perStep, total, diverged, best}[], bestId, worstId, diverged}}
   */
  function sameProblem(caseId, h) {
    const state = stateFor(caseId, h);
    const preset = presetOf(state.caseId);
    const problem = problems.fromPreset(state.caseId, { h: state.h });
    const xs = Array.from({ length: problem.N + 1 }, (_, n) => problem.x0 + n * problem.h);
    const reference = referenceOf(problem, xs);
    reference.value = reference.ys[problem.N];
    const solutions = {};
    const rows = IDS.map((id) => {
      const sol = methods.solve(id, problem, { order: id === 'taylor' ? 2 : undefined });
      solutions[id] = sol;
      const y = sol.diverged ? NaN : sol.ys[sol.N];
      const abs = finite(y) ? Math.abs(y - reference.value) : NaN;
      return {
        id,
        label: LABELS[id],
        baseline: id === 'euler',
        y,
        abs,
        rel: finite(abs) && reference.value !== 0 ? abs / Math.abs(reference.value) : null,
        perStep: methods.costPerStep(id, 2).total,
        total: sol.fEvals + sol.derivEvals,
        diverged: sol.diverged,
        best: false,
      };
    });
    const ranked = rows.filter((r) => finite(r.abs)).sort((a, b) => a.abs - b.abs);
    const bestId = ranked.length ? ranked[0].id : null;
    const worstId = ranked.length ? ranked[ranked.length - 1].id : null;
    rows.forEach((r) => { r.best = r.id === bestId; });
    return {
      caseId: state.caseId,
      preset,
      problem,
      h: state.h,
      N: problem.N,
      xs,
      reference,
      solutions,
      rows,
      bestId,
      worstId,
      diverged: rows.filter((r) => r.diverged).map((r) => ({ id: r.id, label: r.label, message: solutions[r.id].message })),
    };
  }

  function solutionSeries(result) {
    const { problem } = result;
    const span = problem.xf - problem.x0;
    const dense = Array.from({ length: CURVE_POINTS }, (_, i) => problem.x0 + (span * i) / (CURVE_POINTS - 1));
    const ref = referenceOf(problem, dense);
    return {
      reference: { label: ref.label, points: dense.map((x, i) => ({ x, y: ref.ys[i] })) },
      methods: IDS.map((id) => {
        const sol = result.solutions[id];
        return { id, label: LABELS[id], points: sol.xs.map((x, i) => ({ x, y: sol.ys[i] })) };
      }),
    };
  }

  /** |y_n − y(x_n)| along x; zero errors (x_0) are left out so the chart can use a logarithmic scale. */
  function errorSeries(result) {
    return IDS.map((id) => {
      const sol = result.solutions[id];
      const points = sol.xs
        .map((x, i) => ({ x, y: Math.abs(sol.ys[i] - result.reference.ys[i]) }))
        .filter((p) => finite(p.y) && p.y > 0);
      return { id, label: LABELS[id], points };
    });
  }

  /* ---- Convergence and work-precision ------------------------------------------------------------------------- */

  /** Convergence study with h, h/2, ..., h/2^(LEVELS-1) from the case's own step. */
  function convergenceStudy(caseId) {
    const preset = presetOf(caseId);
    const problem = problems.fromPreset(preset.id);
    const conv = analysis.convergence(problem, IDS.slice(), { levels: LEVELS, N0: problem.N });
    const estimate = {};
    IDS.forEach((id) => {
      const known = conv.orders[id].filter((p) => p !== null);
      estimate[id] = known.length ? known[known.length - 1] : null;
    });
    return Object.assign({}, conv, {
      caseId: preset.id, hs: conv.hs.map(clean), estimate, reference: problem.exact ? 'exact' : 'reference',
    });
  }

  /** Reference lines C·h^p (p = 1, 2) over the studied range, placed just below the curves of that order. */
  function slopeLines(study) {
    const first = (ids) => ids.map((id) => study.errors[id][0]).filter((e) => finite(e) && e > 0);
    const anchor = (ids) => {
      const errs = first(ids);
      return errs.length ? Math.min(...errs) * 0.5 : 1e-3;
    };
    const h0 = study.hs[0];
    const hEnd = study.hs[study.hs.length - 1];
    return [
      { p: 1, label: 'Pendiente 1 (orden 1)', y0: anchor(['euler']) },
      { p: 2, label: 'Pendiente 2 (orden 2)', y0: anchor(SECOND) },
    ].map((l) => ({
      p: l.p,
      label: l.label,
      points: [h0, hEnd].map((x) => ({ x, y: l.y0 * (x / h0) ** l.p })),
    }));
  }

  function workPrecision(study) {
    const wp = analysis.workPrecision(study);
    return IDS.map((id) => ({ id, label: LABELS[id], points: (wp[id] || []).map((p) => ({ x: p.evals, y: p.error, h: clean(p.h) })) }));
  }

  /* ---- Linear case y' = λy (ampliación) --------------------------------------------------------------------- */

  /**
   * Runs the four methods on y' = λy, y(0) = 1 with `steps` steps of size h.
   * @returns {{lambda, h, z, N, xs, exact, curve: {x, y}[], ys: Object<string, number[]>, R: {euler, second}, maxSpread,
   *   unstable: {euler: boolean, second: boolean}}}
   */
  function linearDemo(opts) {
    const o = opts || {};
    const lambda = finite(o.lambda) ? o.lambda : LINEAR.lambda;
    const h = finite(o.h) && o.h > 0 ? clean(o.h) : LINEAR.h;
    const N = Number.isInteger(o.steps) && o.steps > 0 ? o.steps : LINEAR.steps;
    const problem = problems.make({
      id: 'linear-demo', fStr: `(${lambda})*y`, x0: 0, y0: 1, xf: N * h, N,
    });
    const z = h * lambda;
    const ys = {};
    IDS.forEach((id) => { ys[id] = methods.solve(id, problem, { h, N, order: id === 'taylor' ? 2 : undefined }).ys; });
    const xs = Array.from({ length: N + 1 }, (_, n) => n * h);
    let maxSpread = 0;
    for (let n = 0; n <= N; n += 1) {
      const vals = SECOND.map((id) => ys[id][n]);
      const spread = (Math.max(...vals) - Math.min(...vals)) / Math.max(1, Math.abs(vals[0]));
      if (spread > maxSpread) maxSpread = spread;
    }
    const R = { euler: 1 + z, second: 1 + z + (z * z) / 2 };
    const curve = Array.from({ length: CURVE_POINTS }, (_, i) => {
      const x = (N * h * i) / (CURVE_POINTS - 1);
      return { x, y: Math.exp(lambda * x) };
    });
    return {
      lambda,
      h,
      z,
      N,
      xs,
      exact: xs.map((x) => Math.exp(lambda * x)),
      curve,
      ys,
      R,
      maxSpread,
      unstable: { euler: Math.abs(R.euler) > 1 + UNSTABLE_TOL, second: Math.abs(R.second) > 1 + UNSTABLE_TOL },
    };
  }

  /**
   * R(z) of the four methods for several z = hλ, measured by running one step of each (never from the polynomial),
   * with the verdict of the row: whether the computed values decay, sit at the edge or grow.
   * @param {number[]} [zs] Values of z = hλ (default: the scan around the edge of the real stability interval).
   * @returns {{z, euler, taylor, heun, rk2, verdict: 'decae'|'limite'|'crece'}[]}
   */
  function stabilityScan(zs) {
    const tol = 1e-9;
    return theoryData.stabilityTable(zs).map((row) => {
      const mags = IDS.map((id) => Math.abs(row[id]));
      let verdict = 'decae';
      if (!mags.every((m) => m <= 1 + tol)) verdict = 'crece';
      else if (mags.some((m) => Math.abs(m - 1) <= tol)) verdict = 'limite';
      return Object.assign({}, row, { verdict });
    });
  }

  /* ---- Summary and conclusions ---------------------------------------------------------------------------- */

  const BY_HAND = Object.freeze({
    euler: 'La más simple: una evaluación de f por paso, sin cálculos auxiliares.',
    taylor: 'Antes de empezar hay que derivar y″ = ∂f/∂x + ∂f/∂y · f a mano; después, una sola fórmula por paso.',
    heun: 'Sin derivadas: predictor de Euler y promedio de dos pendientes; se anota y′ de cada paso.',
    rk2: 'Sin derivadas: se calcula k1 y se evalúa f en el punto medio del paso.',
  });

  function summaryMatrix() {
    const generics = theoryData.firstStep('trunc');
    return IDS.map((id) => {
      const cost = methods.costPerStep(id, 2);
      return {
        id,
        label: LABELS[id],
        order: methods.byId(id).order,
        generic: id === 'euler' ? EULER_GENERIC : generics[id].generic,
        perStep: cost.total,
        fEvals: cost.f,
        derivEvals: cost.deriv,
        derivatives: cost.deriv > 0,
        byHand: BY_HAND[id],
        apunte: APUNTE[id],
      };
    });
  }

  /**
   * Local error, global error and the factor by which halving h divides the global error, per method:
   * a method of order p has a local error O(h^{p+1}) and halving h divides its global error by 2^p.
   * @returns {{id, label, order, localOrder, halving}[]}
   */
  function orderTable() {
    return IDS.map((id) => {
      const order = methods.byId(id).order;
      return {
        id, label: LABELS[id], order, localOrder: order + 1, halving: 2 ** order,
      };
    });
  }

  /**
   * What the extra evaluations of a higher Taylor degree buy: the value of y_1 after one step of the apunte's
   * own example, the error of that step and by how much it fell from the previous degree. `drop` is null on the
   * first row. The TeX of y''' and y'''' shows what has to be derived by hand to get there.
   * @returns {{problem, h, exact, y3TeX, y4TeX, rows: {order, y1, error, drop}[]}}
   */
  function taylorDegrees() {
    const t = theoryData.taylorExample();
    return {
      problem: t.problem,
      h: t.h,
      exact: t.exact,
      y3TeX: t.y3TeX,
      y4TeX: t.y4TeX,
      rows: t.degrees.map((d, i) => ({
        order: d.order,
        y1: d.y1,
        error: d.error,
        drop: i > 0 ? t.degrees[i - 1].error / d.error : null,
      })),
    };
  }

  /**
   * Evaluations per step: the one-stage and two-stage methods, then Taylor of every degree of the catalogue.
   * `derivatives` says whether f has to be derived by hand before iterating.
   * @returns {{key, id, label, degree, f, deriv, total, derivatives}[]}
   */
  function costTable() {
    const plainRows = ['euler', 'heun', 'rk2'].map((id) => {
      const cost = methods.costPerStep(id);
      return {
        key: id,
        id,
        label: LABELS[id],
        degree: null,
        f: cost.f,
        deriv: cost.deriv,
        total: cost.total,
        derivatives: cost.deriv > 0,
      };
    });
    const taylorRows = TAYLOR_DEGREES.map((degree) => {
      const cost = methods.costPerStep('taylor', degree);
      return {
        key: `taylor${degree}`,
        id: 'taylor',
        label: `Taylor de grado ${degree}`,
        degree,
        f: cost.f,
        deriv: cost.deriv,
        total: cost.total,
        derivatives: cost.deriv > 0,
      };
    });
    return plainRows.concat(taylorRows);
  }

  const nameOf = (id) => LABELS[id];

  /**
   * The second-order winner of each comparison case at its own h (to show that the winner changes), with the
   * value every method reaches at x_f and the reference it is measured against, so one table can show them all.
   * @returns {{id, title, bestId, worstId, exact, problem, h, xf, values, reference}[]}
   */
  function winners() {
    return problems.PRESETS.filter((p) => p.group === 'comparativa').map((p) => {
      const h = baseH(p);
      const r = sameProblem(p.id, h);
      const second = r.rows.filter((row) => SECOND.includes(row.id) && finite(row.abs)).sort((a, b) => a.abs - b.abs);
      const values = {};
      r.rows.forEach((row) => { values[row.id] = row.y; });
      return {
        id: p.id,
        title: p.title,
        bestId: second.length ? second[0].id : null,
        worstId: second.length ? second[second.length - 1].id : null,
        exact: r.reference.kind === 'exact',
        problem: r.problem,
        h,
        xf: clean(r.problem.xf),
        values,
        reference: r.reference.value,
      };
    });
  }

  /**
   * How often Taylor de grado 2 is the farthest of the three second-order methods over the catalogue of
   * comparison cases: the evidence behind "the same order does not make it more precise".
   * @returns {{count: number, total: number, always: boolean}}
   */
  function taylorFarthest() {
    const list = winners().filter((w) => w.worstId);
    const count = list.filter((w) => w.worstId === 'taylor').length;
    return { count, total: list.length, always: list.length > 0 && count === list.length };
  }

  /**
   * One sentence, written from the engine, about how the catalogue of comparison cases with a known exact solution
   * splits between the three second-order methods. Empty string when there is no such case to count.
   * @returns {string}
   */
  function noUniversalWinner() {
    const list = winners().filter((w) => w.exact && w.bestId);
    if (!list.length) return '';
    const tally = SECOND.map((id) => ({ id, count: list.filter((w) => w.bestId === id).length })).filter((t) => t.count > 0);
    const parts = tally.map((t) => `${nameOf(t.id)} en ${t.count}`);
    const join = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
    const head = `Sobre los ${list.length} casos de este catálogo con solución exacta conocida, el más cercano es ${join}`;
    return tally.length > 1
      ? `${head}. El ganador cambia de problema en problema: no hay uno universal.`
      : `${head}, siempre el mismo en este catálogo; con otros problemas el orden cambia, porque lo que los distingue es la constante del error.`;
  }

  /**
   * Short conclusions (Spanish), each one built from the computed numbers of this case.
   * @param {object} result Result of `sameProblem`.
   * @param {object} study Result of `convergenceStudy` for the same case.
   * @returns {string[]}
   */
  function conclusions(result, study) {
    const lines = [];
    const row = (id) => result.rows.find((r) => r.id === id);
    const refName = result.reference.kind === 'exact' ? 'la solución exacta' : 'la referencia numérica';
    const xf = clean(result.problem.xf);
    const best = result.bestId && row(result.bestId);
    const worst = result.worstId && row(result.worstId);
    if (best) {
      lines.push(`Con h = ${result.h} (N = ${result.N}), ${nameOf(best.id)} queda más cerca de ${refName} en x = ${xf}: `
        + `${fixed(best.y, 6)} frente a ${fixed(result.reference.value, 6)} (error ${sci(best.abs)}).`
        + (worst && worst.id !== best.id ? ` ${nameOf(worst.id)} queda más lejos (error ${sci(worst.abs)}).` : ''));
    }
    const euler = row('euler');
    if (best && best.id !== 'euler' && finite(euler.abs) && best.abs > 0) {
      lines.push(`Con el mismo h, el error de ${nameOf(best.id)} es ${fixed(euler.abs / best.abs, 1)} veces menor que el de Euler, `
        + `a cambio de ${best.perStep} evaluaciones por paso en lugar de 1.`);
    }

    const pe = study.estimate.euler;
    const ps = SECOND.map((id) => study.estimate[id]).filter(finite);
    if (finite(pe) && ps.length) {
      const lo = Math.min(...ps);
      const hi = Math.max(...ps);
      const range = (a, b) => (a === b ? a : `${a} a ${b}`);
      const asTheory = Math.abs(pe - 1) <= ORDER_TOL && ps.length === SECOND.length && ps.every((p) => Math.abs(p - 2) <= ORDER_TOL);
      lines.push(`En el estudio de convergencia, al dividir h por 2 el error de Euler se divide por ${fixed(2 ** pe, 2)} (p ≈ ${fixed(pe, 2)}) `
        + `y el de los métodos de grado 2 por ${range(fixed(2 ** lo, 2), fixed(2 ** hi, 2))} (p ≈ ${range(fixed(lo, 2), fixed(hi, 2))})`
        + (asTheory
          ? ', como predice la teoría: orden 1 y orden 2.'
          : '. Estos valores todavía se apartan de 1 y 2: con estos pasos el error no está en su régimen asintótico.'));
    }

    const firstErrs = SECOND
      .map((id) => ({ id, e: study.errors[id][0], w: study.evals[id][0] }))
      .filter((p) => finite(p.e) && p.e > 0)
      .sort((a, b) => a.e - b.e);
    if (firstErrs.length) {
      const target = firstErrs[0];
      const k = study.errors.euler.findIndex((e) => finite(e) && e <= target.e);
      if (k >= 0) {
        lines.push(`Para llegar a un error de ${sci(target.e)} o menor, Euler necesita ${study.evals.euler[k]} evaluaciones `
          + `(h = ${study.hs[k]}); ${nameOf(target.id)} lo logra con ${target.w} (h = ${study.hs[0]}).`);
      } else {
        const last = study.hs.length - 1;
        lines.push(`Ni con ${study.evals.euler[last]} evaluaciones (h = ${study.hs[last]}) Euler alcanza el error de `
          + `${sci(target.e)} que ${nameOf(target.id)} obtiene con ${target.w} evaluaciones (h = ${study.hs[0]}).`);
      }
    }

    const ranking = result.rows.filter((r) => SECOND.includes(r.id) && finite(r.abs)).sort((a, b) => a.abs - b.abs);
    if (ranking.length === SECOND.length) {
      const others = winners().filter((w) => w.id !== result.caseId && w.bestId && w.bestId !== ranking[0].id);
      const tail = others.length
        ? ` En otro caso comparativo («${others[0].title}») el más cercano es ${nameOf(others[0].bestId)}: no hay un ganador universal.`
        : '';
      lines.push(`Entre los métodos de grado 2, de más cercano a más lejano: ${ranking.map((r) => nameOf(r.id)).join(', ')}.${tail}`);
    }
    return lines;
  }

  /** Error of one step of size `step` from (x0, y0): reference value minus the value the method computes. */
  function oneStepError(problem, id, step) {
    const sol = methods.solve(id, problem, { h: step, N: 1, order: id === 'taylor' ? 2 : undefined });
    const x1 = problem.x0 + step;
    const reference = problem.exact ? problem.exact.fn(x1) : analysis.reference(problem, [x1])[0];
    return { y1: sol.ys[1], measured: reference - sol.ys[1] };
  }

  /**
   * One-step error constants at (x0, y0) (ampliación): exact minus numerical ≈ C·h³ for each second-order method,
   * their ranking by |C| and whether it matches the ranking observed at x_f with the case's own h. `measured`
   * and `predicted` put the leading term next to the error a real step of the case's own h commits, and `ratios`
   * shows that their quotient tends to 1 as h falls (the h⁴ and higher terms lose weight).
   * @returns {{caseId, x0, y0, h, values, predicted, measured, euler, ratios, F2, D, fyD,
   *   ranking: string[], observed: string[], matchesObserved}|null}
   */
  function localConstants(caseId) {
    const preset = presetOf(caseId);
    const problem = problems.fromPreset(preset.id);
    let c;
    try {
      c = analysis.localErrorConstants(problem, preset.x0, preset.y0);
    } catch (err) {
      return null;
    }
    const values = { taylor: c.taylor, rk2: c.rk2, heun: c.heun };
    if (!SECOND.every((id) => finite(values[id]))) return null;
    const h0 = baseH(preset);
    const predicted = {};
    const measured = {};
    SECOND.forEach((id) => {
      predicted[id] = values[id] * h0 ** 3;
      measured[id] = oneStepError(problem, id, h0).measured;
    });
    const ratios = Array.from({ length: RATIO_LEVELS }, (_, k) => {
      const step = clean(h0 / 2 ** k);
      const row = { h: step };
      SECOND.forEach((id) => {
        const c3 = values[id] * step ** 3;
        row[id] = c3 === 0 ? null : oneStepError(problem, id, step).measured / c3;
      });
      return row;
    });
    const ranking = SECOND.slice().sort((a, b) => Math.abs(values[a]) - Math.abs(values[b]));
    const observed = sameProblem(preset.id, h0).rows
      .filter((r) => SECOND.includes(r.id) && finite(r.abs)).sort((a, b) => a.abs - b.abs).map((r) => r.id);
    return {
      caseId: preset.id,
      x0: preset.x0,
      y0: preset.y0,
      h: h0,
      values,
      predicted,
      measured,
      euler: oneStepError(problem, 'euler', h0).measured,
      ratios,
      F2: c.F2,
      D: c.D,
      fyD: c.fyD,
      ranking,
      observed,
      matchesObserved: ranking.join() === observed.join(),
    };
  }

  /**
   * The same constants for every comparison case of the catalogue: only the coefficient of F2 changes between
   * the three methods, so which one has the smallest |C| depends on the sign and the size of F2 against f_y D.
   * This is the table that shows, in one view, that the winner is a property of the problem.
   * @returns {{id, title, problem, x0, y0, F2, fyD, values: {taylor, rk2, heun}, smallest, best}[]}
   */
  function constantsOverview() {
    return winners().map((w) => {
      let c;
      try {
        c = analysis.localErrorConstants(w.problem, w.problem.x0, w.problem.y0);
      } catch (err) {
        return null;
      }
      const values = { taylor: c.taylor, rk2: c.rk2, heun: c.heun };
      if (!SECOND.every((id) => finite(values[id]))) return null;
      return {
        id: w.id,
        title: w.title,
        problem: w.problem,
        x0: w.problem.x0,
        y0: w.problem.y0,
        F2: c.F2,
        fyD: c.fyD,
        values,
        smallest: SECOND.reduce((a, b) => (Math.abs(values[b]) < Math.abs(values[a]) ? b : a)),
        best: w.bestId,
      };
    }).filter(Boolean);
  }

  return {
    IDS, SECOND, LABELS, DEFAULT_CASE, LEVELS, LAMBDAS, LINEAR, MAX_N, TAYLOR_DEGREES,
    clean, baseH, caseGroups, hOptions, defaultState, stateFor, fromQuery, toQuery,
    sameProblem, solutionSeries, errorSeries, convergenceStudy, slopeLines, workPrecision,
    linearDemo, stabilityScan, summaryMatrix, orderTable, costTable, taylorDegrees,
    winners, noUniversalWinner, taylorFarthest, conclusions, localConstants, constantsOverview,
  };
}));
