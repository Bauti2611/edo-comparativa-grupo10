/**
 * EDO.methods - the single-step methods of the course, returning the step
 * records (intermediate values) that the step-by-step views print.
 *
 * Browser load order: expr.js -> format.js -> problems.js -> methods.js -> analysis.js
 *
 * Formulas exactly as the cátedra teaches them (x_n = x0 + n*h, never accumulated):
 *   Euler          y_{n+1} = y_n + h*y_n'
 *   Taylor-p       y_{n+1} = y_n + sum_{k=1..p} h^k/k! * y^(k),   y^(1) = f, y^(k+1) = D(y^(k)),
 *                  D(g) = g_x + g_y*f   (p = 2 is the course's "grado 2"; 3 and 4 are an extension)
 *   Euler Mejorado y_{n+1} = y_n + (h/2)[ y_n' + f(x_{n+1}, y_n + h*y_n') ]   (Heun; Euler predictor)
 *   RK2            y_{n+1} = y_n + h*f(x_n + h/2, y_n + k1/2),   k1 = h*f(x_n, y_n)   (midpoint; k1 already holds h)
 *
 * Cost convention (shared with analysis.js): the unit is one evaluation of an
 * expression per step.
 *   Euler 1 (f); Euler Mejorado 2 (f); RK2 2 (f);
 *   Taylor-p p(p+1)/2: f plus every partial derivative of f up to total order p-1
 *   (p=2 -> f, f_x, f_y = 3; p=3 -> 6; p=4 -> 10), not counting the symbolic derivation itself.
 * A Solution reports `fEvals` (evaluations of f) and `derivEvals` (evaluations of partial
 * derivatives); their sum is the work used by the work-precision study.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./expr.js'), require('./problems.js'));
  } else {
    root.EDO = root.EDO || {};
    if (!root.EDO.expr || !root.EDO.problems) throw new Error('EDO.methods needs EDO.expr and EDO.problems loaded first.');
    root.EDO.methods = factory(root.EDO.expr, root.EDO.problems);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (expr, problems) {
  'use strict';

  const { EDOError } = expr;
  const MAX_STEPS = 1000000;
  const TAYLOR_RANGE = Object.freeze([2, 4]);

  /** Method catalogue (evalsPerStep of Taylor is for its default order 2; see `costPerStep`). */
  const METHODS = Object.freeze([
    Object.freeze({ id: 'euler', label: 'Euler', order: 1, baseline: true, evalsPerStep: 1 }),
    Object.freeze({ id: 'taylor', label: 'Taylor', order: 2, orderRange: TAYLOR_RANGE, evalsPerStep: 3 }),
    Object.freeze({ id: 'heun', label: 'Euler Mejorado', alias: 'Heun', order: 2, evalsPerStep: 2 }),
    Object.freeze({ id: 'rk2', label: 'RK2 (punto medio)', order: 2, evalsPerStep: 2 }),
  ]);

  /**
   * @param {string} id 'euler' | 'taylor' | 'heun' | 'rk2'.
   * @returns {object|undefined} The catalogue entry.
   */
  function byId(id) {
    return METHODS.find((m) => m.id === id);
  }

  /**
   * Evaluations per step under the cost convention above.
   * @param {string} id Method id.
   * @param {number} [order] Taylor order (default 2); ignored by the other methods.
   * @returns {{f: number, deriv: number, total: number}}
   */
  function costPerStep(id, order) {
    let f = 1;
    let deriv = 0;
    if (id === 'heun' || id === 'rk2') {
      f = 2;
    } else if (id === 'taylor') {
      const p = order === undefined ? 2 : order;
      deriv = (p * (p + 1)) / 2 - 1;
    } else if (id !== 'euler') {
      throw new EDOError(`Método desconocido: «${id}».`);
    }
    return { f, deriv, total: f + deriv };
  }

  /* ---- Step kernels: (xn, yn, h, xn1) -> {y1, detail} ---------------------- */

  function eulerKernel(problem) {
    const { f } = problem;
    return (xn, yn, h) => {
      const slope = f(xn, yn);
      return { y1: yn + h * slope, detail: { slope } };
    };
  }

  function taylorKernel(problem, order) {
    const fns = problem.derivFns(order);
    return (xn, yn, h) => {
      const derivs = fns.map((g) => g(xn, yn));
      const terms = [];
      let y1 = yn;
      let hk = 1;
      let fact = 1;
      for (let k = 1; k <= order; k += 1) {
        hk *= h;
        fact *= k;
        const term = (hk / fact) * derivs[k - 1];
        terms.push(term);
        y1 += term;
      }
      return { y1, detail: { derivs, terms } };
    };
  }

  function heunKernel(problem) {
    const { f } = problem;
    return (xn, yn, h, xn1) => {
      const slope = f(xn, yn);
      const yPred = yn + h * slope;
      const slopeEnd = f(xn1, yPred);
      const slopeAvg = (slope + slopeEnd) / 2;
      return { y1: yn + h * slopeAvg, detail: { slope, yPred, slopeEnd, slopeAvg } };
    };
  }

  function rk2Kernel(problem) {
    const { f } = problem;
    return (xn, yn, h) => {
      const k1 = h * f(xn, yn);
      const xMid = xn + h / 2;
      const yMid = yn + k1 / 2;
      const slopeMid = f(xMid, yMid);
      return { y1: yn + h * slopeMid, detail: { k1, xMid, yMid, slopeMid } };
    };
  }

  const KERNELS = { euler: eulerKernel, taylor: taylorKernel, heun: heunKernel, rk2: rk2Kernel };

  /* ---- Input validation ---------------------------------------------------- */

  function resolveOrder(method, order) {
    if (method.id !== 'taylor') return method.order;
    const p = order === undefined || order === null ? method.order : order;
    if (!Number.isInteger(p) || p < TAYLOR_RANGE[0] || p > TAYLOR_RANGE[1]) {
      throw new EDOError(`El orden de Taylor debe ser un entero entre ${TAYLOR_RANGE[0]} y ${TAYLOR_RANGE[1]}.`);
    }
    return p;
  }

  function checkH(h) {
    if (typeof h !== 'number' || !Number.isFinite(h) || !(h > 0)) throw new EDOError('El paso h debe ser un número positivo.');
  }

  function checkN(N) {
    if (!Number.isInteger(N) || N < 1) throw new EDOError('La cantidad de pasos N debe ser un entero positivo.');
    if (N > MAX_STEPS) throw new EDOError(`La cantidad de pasos N es demasiado grande (máximo ${MAX_STEPS}).`);
  }

  /** h and N from the call options, falling back to the problem's own. */
  function resolveSteps(problem, opts) {
    const hasH = opts.h !== undefined && opts.h !== null;
    const hasN = opts.N !== undefined && opts.N !== null;
    let h;
    let N;
    if (!hasH && !hasN) {
      h = problem.h;
      N = problem.N;
    } else if (hasH && !hasN) {
      checkH(opts.h);
      const s = problems.stepsFor(problem.x0, problem.xf, opts.h);
      if (!s.ok) throw new EDOError(s.message);
      h = opts.h;
      N = s.N;
    } else if (hasN && !hasH) {
      checkN(opts.N);
      N = opts.N;
      h = (problem.xf - problem.x0) / N;
    } else {
      h = opts.h;
      N = opts.N;
    }
    checkH(h);
    checkN(N);
    return { h, N };
  }

  /**
   * Solves y' = f(x, y) with one of the course's methods and records every step.
   * @param {'euler'|'taylor'|'heun'|'rk2'} methodId Method.
   * @param {object} problem A Problem from `problems.make`.
   * @param {{h?: number, N?: number, order?: number}} [opts] Step size or step count (default: the
   *   problem's own; with `h` alone N = (xf-x0)/h must be an integer; with `N` alone h = (xf-x0)/N;
   *   with both they are used as given). `order`: Taylor order 2-4 (default 2).
   * @returns {object} Solution `{method, label, order, h, N, requestedN, xs[N+1], ys[N+1], steps[N],
   *   fEvals, derivEvals, evalsPerStep, diverged, message}`. Each step is
   *   `{n, xn, yn, xn1, yn1, detail}` with `detail` as follows:
   *   euler `{slope}`; taylor `{derivs, terms}`; heun `{slope, yPred, slopeEnd, slopeAvg}`;
   *   rk2 `{k1, xMid, yMid, slopeMid}`. If a value stops being finite the run stops: `diverged` is true,
   *   `message` explains it, and `N`/`xs`/`ys`/`steps` hold only the finite part (`requestedN` is the request).
   * @throws {EDOError} Spanish message for an unknown method or invalid h, N, order or data.
   */
  function solve(methodId, problem, opts) {
    const method = byId(methodId);
    if (!method) throw new EDOError(`Método desconocido: «${methodId}».`);
    if (!problem || typeof problem.f !== 'function') throw new EDOError('Falta el problema a resolver.');
    const o = opts || {};
    const order = resolveOrder(method, o.order);
    const { h, N: requestedN } = resolveSteps(problem, o);
    const { x0, y0 } = problem;
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) throw new EDOError('Los valores iniciales x0 e y0 deben ser números finitos.');

    const kernel = KERNELS[method.id](problem, order);
    const xs = [x0];
    const ys = [y0];
    const steps = [];
    let diverged = false;
    let message = '';
    let attempted = 0;
    for (let n = 0; n < requestedN; n += 1) {
      const xn = x0 + n * h;
      const xn1 = x0 + (n + 1) * h;
      const yn = ys[n];
      attempted += 1;
      const { y1, detail } = kernel(xn, yn, h, xn1);
      if (!Number.isFinite(y1)) {
        diverged = true;
        message = `La solución dejó de ser finita en el paso ${n + 1} (x = ${Number(xn1.toPrecision(10))}). `
          + 'Pruebe con un paso h menor o revise la ecuación.';
        break;
      }
      xs.push(xn1);
      ys.push(y1);
      steps.push({ n, xn, yn, xn1, yn1: y1, detail });
    }
    const cost = costPerStep(method.id, order);
    return {
      method: method.id,
      label: method.label,
      order,
      h,
      N: steps.length,
      requestedN,
      xs,
      ys,
      steps,
      fEvals: attempted * cost.f,
      derivEvals: attempted * cost.deriv,
      evalsPerStep: cost.total,
      diverged,
      message,
    };
  }

  return { METHODS, byId, costPerStep, solve };
}));
