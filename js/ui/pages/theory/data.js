/**
 * EDO.theory.data - every number and formula string shown on the Teoría page that comes from the engine.
 * Pure logic (no DOM): the page formats and lays these values out, and web/tests/theory.test.js checks
 * them against the oracles of the ODD document (sections 5.4 to 5.7). Nothing here is typed by hand.
 *
 * The running example is the cátedra's own PVI: y' = 2xy, y(1) = 1, h = 0.1 (Ejemplos 1 and 4 of the apunte).
 *
 * Load order: after the numerics (expr, format, problems, methods, analysis). Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../../numerics/expr.js'),
      require('../../../numerics/format.js'),
      require('../../../numerics/problems.js'),
      require('../../../numerics/methods.js'),
      require('../../../numerics/analysis.js'),
    );
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.theory = EDO.theory || { sections: [] };
    EDO.theory.data = factory(EDO.expr, EDO.format, EDO.problems, EDO.methods, EDO.analysis);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (expr, format, problems, methods, analysis) {
  'use strict';

  const { N: build } = expr;
  const METHOD_IDS = Object.freeze(['euler', 'taylor', 'heun', 'rk2']);
  const COMPARISON_IDS = Object.freeze(['cmp_2xy_13', 'cmp_2xy_15', 'cmp_3x2y', 'cmp_quarter']);

  /** The cátedra's running example (a1 = Ejemplo 1 of the apunte; same PVI as Ejemplo 4). */
  const example = () => problems.fromPreset('a1');

  const numFmt = (mode, decimals) => (v) => format.num(v, { decimals: decimals === undefined ? 4 : decimals, mode: mode === 'round' ? 'round' : 'trunc' });
  const tex = (node, mode, style) => expr.toTeX(node, { indep: 'x', numFmt: numFmt(mode), style: style || 'catedra' });

  /** One step of a method from (x0, y0) with the example's h (h and N are both given, so h is used as is). */
  function oneStep(id, problem, h, order) {
    return methods.solve(id, problem, { h, N: 1, order });
  }

  /* ---- Taylor: derivatives of the example, as TeX -------------------------------------------------------- */

  /**
   * f, its partial derivatives and y'', y''', y'''' of the example as TeX (the engine's total derivative
   * D(g) = g_x + g_y f applied repeatedly), plus the value of each Taylor degree after one step.
   */
  function taylorExample(h) {
    const p = example();
    const step = h === undefined ? p.h : h;
    const derivs = p.derivNodes(4);
    const exact = p.exact.fn(p.x0 + step);
    const degrees = [2, 3, 4].map((order) => {
      const sol = oneStep('taylor', p, step, order);
      return { order, y1: sol.ys[1], error: Math.abs(exact - sol.ys[1]) };
    });
    return {
      problem: p,
      h: step,
      fTeX: expr.toTeX(p.fNode, { indep: 'x' }),
      fxTeX: expr.toTeX(p.fx(), { indep: 'x' }),
      fyTeX: expr.toTeX(p.fy(), { indep: 'x' }),
      y2TeX: expr.toTeX(derivs[1], { indep: 'x' }),
      y3TeX: expr.toTeX(derivs[2], { indep: 'x' }),
      y4TeX: expr.toTeX(derivs[3], { indep: 'x' }),
      exact,
      degrees,
    };
  }

  /* ---- First step in the cátedra's layout ----------------------------------------------------------------- */

  /**
   * The first iteration (n = 0) of the three course methods on the example, as the apunte prints it.
   * Every number comes from `methods.solve`; every substitution line from `expr.toTeX(..., {style: 'catedra'})`.
   * @param {'trunc'|'round'} [mode] Display mode of the numbers (default 'trunc': the apunte truncates to 4 decimals).
   * @returns {{taylor: object, heun: object, rk2: object}} Each entry: `{id, y1, y1Text, y1TeX, intro, generic, parts, result}`
   *   where `parts` is a list of `{say?: string, tex?: string}` (text with $..$ math, or a display formula).
   */
  function firstStep(mode) {
    const p = example();
    const fmt = numFmt(mode);
    const t = (node) => tex(node, mode);
    const at = (x, y) => expr.substitute(p.fNode, { x, y });
    const n = (v) => fmt(v);
    const sols = {
      taylor: oneStep('taylor', p, p.h, 2),
      heun: oneStep('heun', p, p.h, 2),
      rk2: oneStep('rk2', p, p.h, 2),
    };
    const result = (sol) => ({ y1: sol.ys[1], y1Text: n(sol.ys[1]), y1TeX: `y_1 = ${n(sol.ys[1])} = y(x_1) = y(${n(sol.xs[1])})` });

    // Taylor grado 2: y1 = y0 + h*y0' + h^2/2! * y0'' with y0' and y0'' evaluated at (x0, y0).
    const d = sols.taylor.steps[0].detail;
    const y2Node = p.derivNodes(2)[1];
    const taylor = Object.assign({
      id: 'taylor',
      generic: "y_{n+1} = y_n + h\\,y_n' + \\frac{h^{2}}{2!}\\,y_n''",
      parts: [
        { say: 'Si $n = 0$ entonces:', tex: "y_1 = y_0 + h\\,y_0' + \\frac{h^{2}}{2!}\\,y_0''" },
        { say: 'Donde:', tex: `y_0' = f(x_0, y_0) = ${t(at(p.x0, p.y0))} = ${n(d.derivs[0])} \\qquad y_0'' = ${t(expr.substitute(y2Node, { x: p.x0, y: p.y0 }))} = ${n(d.derivs[1])}` },
        {
          say: 'Reemplazando cada valor:',
          tex: `y_1 = ${n(p.y0)} + ${n(p.h)}\\cdot[${t(at(p.x0, p.y0))}] + \\frac{(${n(p.h)})^{2}}{2!}\\cdot[${t(expr.substitute(y2Node, { x: p.x0, y: p.y0 }))}] = ${n(sols.taylor.ys[1])}`,
        },
      ],
    }, result(sols.taylor));

    // Euler Mejorado: y_n' printed apart, predictor inline.
    const e = sols.heun.steps[0].detail;
    const heun = Object.assign({
      id: 'heun',
      generic: "y_{n+1} = y_n + \\frac{h}{2!}\\Bigl[\\,y_n' + f\\bigl(x_{n+1},\\ y_n + h\\,y_n'\\bigr)\\Bigr]",
      parts: [
        { say: 'Si $n = 0$ entonces:', tex: "y_1 = y_0 + \\frac{h}{2!}\\Bigl[\\,y_0' + f\\bigl(x_1,\\ y_0 + h\\,y_0'\\bigr)\\Bigr]" },
        { say: 'Donde:', tex: `y_0' = f(x_0, y_0) = ${t(at(p.x0, p.y0))} = ${n(e.slope)}` },
        {
          say: `El predictor (paso de Euler) es $y_0 + h\\,y_0' = ${n(p.y0)} + ${n(p.h)}\\cdot ${n(e.slope)} = ${n(e.yPred)}$ y la pendiente en $x_1$ es:`,
          tex: `f(x_1, ${n(e.yPred)}) = ${t(at(sols.heun.xs[1], e.yPred))} = ${n(e.slopeEnd)}`,
        },
        {
          say: 'Reemplazando cada valor:',
          tex: `y_1 = ${n(p.y0)} + \\frac{${n(p.h)}}{2!}\\,[\\,${n(e.slope)} + ${n(e.slopeEnd)}\\,] = ${n(sols.heun.ys[1])}`,
        },
      ],
    }, result(sols.heun));

    // RK2 punto medio: k1 already contains h.
    const r = sols.rk2.steps[0].detail;
    const xMid = build.add([build.num(p.x0), build.div(build.num(p.h), build.num(2))]);
    const yMid = build.add([build.num(p.y0), build.div(build.num(r.k1), build.num(2))]);
    const rk2 = Object.assign({
      id: 'rk2',
      generic: "y_{n+1} = y_n + h\\,f\\!\\left(x_n + \\frac{h}{2},\\ y_n + \\frac{k_1}{2}\\right), \\qquad k_1 = h\\,f(x_n, y_n)",
      parts: [
        { say: 'Si $n = 0$ entonces:', tex: "y_1 = y_0 + h\\,f\\!\\left(x_0 + \\frac{h}{2},\\ y_0 + \\frac{k_1}{2}\\right)" },
        { say: 'Con:', tex: `k_1 = h\\cdot f(x_0, y_0) = ${n(p.h)}\\cdot(${t(at(p.x0, p.y0))}) \\;\\Rightarrow\\; k_1 = ${n(r.k1)}` },
        {
          say: 'Reemplazando cada valor:',
          tex: `y_1 = ${n(p.y0)} + ${n(p.h)}\\cdot[${t(at(xMid, yMid))}] = ${n(sols.rk2.ys[1])}`,
        },
      ],
    }, result(sols.rk2));

    return { taylor, heun, rk2, problem: p };
  }

  /* ---- Local error constants (Ampliación) ------------------------------------------------------------------------ */

  /**
   * One-step local error of the three second-order methods on the example at (x0, y0):
   * the leading constants of exact - numerical = c h^3 (from `analysis.localErrorConstants`) next to the
   * measured error of a single step of size h.
   */
  function localErrors(h) {
    const p = example();
    const step = h === undefined ? p.h : h;
    const L = analysis.localErrorConstants(p, p.x0, p.y0);
    const exact = p.exact.fn(p.x0 + step);
    const row = (id, c) => {
      const y1 = oneStep(id, p, step).ys[1];
      return { id, c, predicted: c * step ** 3, y1, measured: exact - y1 };
    };
    const eulerY1 = oneStep('euler', p, step).ys[1];
    return {
      problem: p,
      h: step,
      exact,
      F2: L.F2,
      D: L.D,
      fyD: L.fyD,
      rows: [row('taylor', L.taylor), row('rk2', L.rk2), row('heun', L.heun)],
      euler: { id: 'euler', y1: eulerY1, measured: exact - eulerY1 },
    };
  }

  /* ---- Linear test problem: coincidence and stability --------------------------------------------------------------- */

  /** Value of y_1 after one step of every method on y' = lambda*y, y(0) = 1, with step h (so y_1 = R(h*lambda)). */
  function linearStep(lambda, h) {
    const p = problems.make({
      id: 'lin', fStr: `${lambda}*y`, x0: 0, y0: 1, xf: h, h,
    });
    const out = { z: lambda * h };
    METHOD_IDS.forEach((id) => { out[id] = oneStep(id, p, h).ys[1]; });
    return out;
  }

  /**
   * Amplification factors R(z) of one step (|R| <= 1 means a decaying step), measured by running the methods.
   * `z` values are h*lambda; h = 0.1 is fixed and lambda = z/h.
   */
  function stabilityTable(zs) {
    const list = zs || [-0.2, -1, -2, -2.5, -3];
    const h = 0.1;
    return list.map((z) => {
      const s = linearStep(Math.round((z / h) * 1e9) / 1e9, h); // lambda without binary noise (so fStr stays readable)
      return { z, euler: s.euler, taylor: s.taylor, heun: s.heun, rk2: s.rk2 };
    });
  }

  /* ---- Convergence by step halving ----------------------------------------------------------------------------------- */

  /** Errors at x_f and observed orders for y' = 2xy on [1, 1.5] with N0 = 10 and four halvings of h (cmp_2xy_15). */
  function convergence() {
    const p = problems.fromPreset('cmp_2xy_15');
    const conv = analysis.convergence(p, METHOD_IDS.slice(), { levels: 4, N0: 10 });
    return { problem: p, Ns: conv.Ns, hs: conv.hs, errors: conv.errors, orders: conv.orders };
  }

  /* ---- Same PVI, four methods (table of section 5.6) --------------------------------------------------------------- */

  /** The four comparison cases at h = 0.1: final value of each method, exact value and the closest 2nd-order method. */
  function comparison() {
    return COMPARISON_IDS.map((id) => {
      const p = problems.fromPreset(id);
      const values = {};
      METHOD_IDS.forEach((m) => { values[m] = methods.solve(m, p).ys[p.N]; });
      const exact = p.exact.fn(p.xf);
      const second = ['taylor', 'rk2', 'heun'];
      const best = second.reduce((a, b) => (Math.abs(values[b] - exact) < Math.abs(values[a] - exact) ? b : a));
      return { id, problem: p, xf: p.xf, values, exact, best };
    });
  }

  /* ---- Cost ----------------------------------------------------------------------------------------------------------- */

  /** Evaluations per step: `{f, deriv, total}` for Euler, Taylor of degree 2 to 4, Euler Mejorado and RK2. */
  function costs() {
    return {
      euler: methods.costPerStep('euler'),
      taylor2: methods.costPerStep('taylor', 2),
      taylor3: methods.costPerStep('taylor', 3),
      taylor4: methods.costPerStep('taylor', 4),
      heun: methods.costPerStep('heun'),
      rk2: methods.costPerStep('rk2'),
    };
  }

  /** Global orders of the catalogue (Euler 1; Taylor, Euler Mejorado and RK2 2). */
  function orders() {
    const out = {};
    methods.METHODS.forEach((m) => { out[m.id] = m.order; });
    return out;
  }

  /** Everything at once (the page computes it lazily, section by section, with the functions above). */
  function all(mode) {
    return {
      taylor: taylorExample(),
      firstStep: firstStep(mode),
      localErrors: localErrors(),
      stability: stabilityTable(),
      convergence: convergence(),
      comparison: comparison(),
      costs: costs(),
      orders: orders(),
    };
  }

  return {
    METHOD_IDS, COMPARISON_IDS, example, taylorExample, firstStep, localErrors, linearStep, stabilityTable, convergence, comparison, costs, orders, all,
  };
}));
