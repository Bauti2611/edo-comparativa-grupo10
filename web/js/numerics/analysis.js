/**
 * EDO.analysis - reference solutions, error vectors, convergence studies with
 * observed orders, work-precision data and the one-step error constants.
 * Everything here is an addition to the course ("verificación" / "ampliación").
 *
 * Browser load order: expr.js -> format.js -> problems.js -> methods.js -> analysis.js
 *
 * Cost convention and units: see methods.js (work = fEvals + derivEvals).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./expr.js'), require('./methods.js'));
  } else {
    root.EDO = root.EDO || {};
    if (!root.EDO.expr || !root.EDO.methods) throw new Error('EDO.analysis needs EDO.expr and EDO.methods loaded first.');
    root.EDO.analysis = factory(root.EDO.expr, root.EDO.methods);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (expr, methods) {
  'use strict';

  const { EDOError } = expr;
  const REF_SUBSTEPS = 200;
  const MAX_REF_STEPS = 4000000;
  const MAX_CONVERGENCE_N = 200000;

  /* ---- Reference solution (RK4) -------------------------------------------- */

  function rk4Step(f, x, y, h) {
    const k1 = f(x, y);
    const k2 = f(x + h / 2, y + (h / 2) * k1);
    const k3 = f(x + h / 2, y + (h / 2) * k2);
    const k4 = f(x + h, y + h * k3);
    return y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }

  /** Integrates from (x, y) to xTarget with `steps` equal RK4 steps. */
  function rk4Advance(f, x, y, xTarget, steps) {
    if (steps < 1) return y;
    const h = (xTarget - x) / steps;
    let yy = y;
    for (let i = 0; i < steps; i += 1) yy = rk4Step(f, x + i * h, yy, h);
    return yy;
  }

  /**
   * Reference values y(x) at the given abscissas ("referencia"): the exact solution
   * when the problem has one, otherwise a fine RK4 run with steps of (grid step)/200
   * started at (x0, y0).
   * @param {object} problem A Problem.
   * @param {number[]} xs Abscissas (typically `solution.xs`).
   * @param {{substeps?: number}} [opts] RK4 substeps per grid step (default 200).
   * @returns {number[]} Reference values, same length as `xs`.
   */
  function reference(problem, xs, opts) {
    if (problem.exact) return xs.map((x) => problem.exact.fn(x));
    const sub = (opts && opts.substeps) || REF_SUBSTEPS;
    const grid = xs.length > 1 ? Math.abs(xs[xs.length - 1] - xs[0]) / (xs.length - 1) : problem.h;
    const hRef = grid / sub;
    const out = new Array(xs.length);
    let x = problem.x0;
    let y = problem.y0;
    const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    for (const i of order) {
      const span = xs[i] - x;
      const steps = span === 0 ? 0 : Math.max(1, Math.ceil(Math.abs(span) / hRef - 1e-9));
      y = rk4Advance(problem.f, x, y, xs[i], steps);
      x = xs[i];
      out[i] = y;
    }
    return out;
  }

  /**
   * Error vectors of a solution against reference values.
   * @param {{ys: number[]}} sol A Solution.
   * @param {number[]} refYs Reference values at `sol.xs`.
   * @returns {{abs: number[], rel: (number|null)[], pct: (number|null)[]}}
   *   Absolute error, relative error and percentage error; `null` where the reference is 0.
   */
  function errors(sol, refYs) {
    const abs = [];
    const rel = [];
    const pct = [];
    sol.ys.forEach((y, i) => {
      const r = refYs[i];
      const a = Math.abs(y - r);
      const rl = r === 0 ? null : a / Math.abs(r);
      abs.push(a);
      rel.push(rl);
      pct.push(rl === null ? null : 100 * rl);
    });
    return { abs, rel, pct };
  }

  /* ---- Convergence study ---------------------------------------------------- */

  function parseMethodSpec(spec) {
    const m = /^taylor([2-4])$/.exec(spec);
    const id = m ? 'taylor' : spec;
    if (!methods.byId(id)) throw new EDOError(`Método desconocido: «${spec}».`);
    return { id, order: m ? Number(m[1]) : undefined };
  }

  function maxAbsError(problem, sol) {
    let worst = 0;
    for (const v of errors(sol, reference(problem, sol.xs)).abs) {
      if (Number.isNaN(v)) return NaN;
      if (v > worst) worst = v;
    }
    return worst;
  }

  /** Observed order log2(e1/e2) for errors at h and h/2, or null when undefined. */
  function observedOrder(e1, e2) {
    if (!Number.isFinite(e1) || !Number.isFinite(e2) || e1 <= 0 || e2 <= 0) return null;
    return Math.log2(e1 / e2);
  }

  /**
   * Convergence study: solves with N0, 2*N0, 4*N0, ... steps and measures the error at
   * x_f (or the maximum over the grid) against the exact solution or the RK4 reference.
   * @param {object} problem A Problem.
   * @param {string[]} methodIds Method ids; 'taylor3' and 'taylor4' select those Taylor orders.
   * @param {{levels?: number, N0?: number, norm?: 'final'|'max'}} [opts] `levels` default 6;
   *   `N0` default max(problem.N, 4); `norm` 'final' (default) or 'max'.
   * @returns {{Ns: number[], hs: number[], errors: Object<string, (number|null)[]>,
   *   orders: Object<string, (number|null)[]>, evals: Object<string, number[]>}}
   *   `errors[id][k]` is null when the run diverged or the error is not finite; `orders[id][k]` is
   *   log2(e_k/e_{k+1}) (length levels-1), null when either error is 0 or not finite; `evals` is the
   *   work (fEvals + derivEvals) per level.
   */
  function convergence(problem, methodIds, opts) {
    const o = opts || {};
    const levels = o.levels === undefined ? 6 : o.levels;
    const N0 = o.N0 === undefined ? Math.max(problem.N || 4, 4) : o.N0;
    if (!Number.isInteger(levels) || levels < 2) throw new EDOError('El estudio de convergencia necesita al menos 2 niveles.');
    if (!Number.isInteger(N0) || N0 < 1) throw new EDOError('N0 debe ser un entero positivo.');
    const Ns = Array.from({ length: levels }, (_, k) => N0 * 2 ** k);
    if (Ns[levels - 1] > MAX_CONVERGENCE_N) throw new EDOError('El estudio de convergencia pide demasiados pasos; reduzca los niveles o N0.');
    const span = problem.xf - problem.x0;
    const hs = Ns.map((N) => span / N);

    let refFinal;
    if (problem.exact) {
      refFinal = problem.exact.fn(problem.xf);
    } else {
      const refSteps = Math.min(Ns[levels - 1] * REF_SUBSTEPS, MAX_REF_STEPS);
      refFinal = rk4Advance(problem.f, problem.x0, problem.y0, problem.xf, refSteps);
    }

    const out = { Ns, hs, errors: {}, orders: {}, evals: {} };
    for (const spec of methodIds) {
      const { id, order } = parseMethodSpec(spec);
      const errs = [];
      const work = [];
      for (const N of Ns) {
        const sol = methods.solve(id, problem, { N, order });
        work.push(sol.fEvals + sol.derivEvals);
        let e = null;
        if (!sol.diverged) {
          e = o.norm === 'max' ? maxAbsError(problem, sol) : Math.abs(sol.ys[sol.N] - refFinal);
        }
        errs.push(Number.isFinite(e) ? e : null);
      }
      out.errors[spec] = errs;
      out.evals[spec] = work;
      out.orders[spec] = errs.slice(0, -1).map((e, k) => observedOrder(e, errs[k + 1]));
    }
    return out;
  }

  /**
   * Work-precision points from a convergence result (positive errors only, ready for a log-log chart).
   * @param {object} conv Result of `convergence`.
   * @returns {Object<string, {evals: number, error: number, h: number}[]>}
   */
  function workPrecision(conv) {
    const out = {};
    for (const id of Object.keys(conv.errors)) {
      out[id] = conv.errors[id]
        .map((error, k) => ({ evals: conv.evals[id][k], error, h: conv.hs[k] }))
        .filter((p) => p.error !== null && p.error > 0);
    }
    return out;
  }

  /* ---- One-step error constants -------------------------------------------- */

  const partialsCache = new WeakMap();

  function partialsOf(problem) {
    let p = partialsCache.get(problem);
    if (!p) {
      const fx = problem.fx();
      const fy = problem.fy();
      p = {
        fx: expr.compile(fx),
        fy: expr.compile(fy),
        fxx: expr.compile(expr.diff(fx, 'x')),
        fxy: expr.compile(expr.diff(fx, 'y')),
        fyy: expr.compile(expr.diff(fy, 'y')),
      };
      partialsCache.set(problem, p);
    }
    return p;
  }

  /**
   * Leading constants c of the one-step local error, exact minus numerical = c*h^3 + O(h^4), at (x, y):
   * with D = f_x + f f_y (= y'') and F2 = f_xx + 2 f f_xy + f^2 f_yy (so y''' = F2 + f_y D),
   *   Taylor-2: (F2 + f_y D)/6;  RK2 (midpoint): F2/24 + f_y D/6;  Euler Mejorado: -F2/12 + f_y D/6.
   * @param {object} problem A Problem.
   * @param {number} x Abscissa.
   * @param {number} y Ordinate.
   * @returns {{taylor: number, rk2: number, heun: number, F2: number, D: number, fyD: number}}
   */
  function localErrorConstants(problem, x, y) {
    const p = partialsOf(problem);
    const f = problem.f(x, y);
    const fy = p.fy(x, y);
    const D = p.fx(x, y) + f * fy;
    const F2 = p.fxx(x, y) + 2 * f * p.fxy(x, y) + f * f * p.fyy(x, y);
    const fyD = fy * D;
    return {
      taylor: (F2 + fyD) / 6,
      rk2: F2 / 24 + fyD / 6,
      heun: -F2 / 12 + fyD / 6,
      F2,
      D,
      fyD,
    };
  }

  return { reference, errors, convergence, workPrecision, localErrorConstants };
}));
