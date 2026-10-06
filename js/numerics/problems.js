/**
 * EDO.problems - problem factory, step-count helper and the preset library
 * (the cátedra's solved examples, the practice bank, the comparison cases and a
 * few extras). Pure logic, no DOM.
 *
 * Browser load order: expr.js -> format.js -> problems.js -> methods.js -> analysis.js
 *
 * A preset is a plain spec; `make(spec)` turns it into a Problem. User-visible
 * strings (titles, sources, notes) are Spanish; code and comments are English.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./expr.js'), require('./format.js'));
  } else {
    root.EDO = root.EDO || {};
    if (!root.EDO.expr || !root.EDO.format) throw new Error('EDO.problems needs EDO.expr and EDO.format loaded first.');
    root.EDO.problems = factory(root.EDO.expr, root.EDO.format);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (expr, format) {
  'use strict';

  const { EDOError } = expr;
  const STEP_TOLERANCE = 1e-9;
  const show = (v) => format.num(v, { decimals: 6 });

  /**
   * Number of steps N = (xf - x0)/h, which must be an integer (relative tolerance 1e-9).
   * @param {number} x0 Initial value.
   * @param {number} xf Final value (> x0).
   * @param {number} h Step (> 0).
   * @returns {{N: number, ok: boolean, message: string, suggestions: number[]}}
   *   When `ok` is false, `message` (Spanish) explains why and `suggestions` lists nearby valid steps.
   */
  function stepsFor(x0, xf, h) {
    const fail = (message, suggestions) => ({ N: NaN, ok: false, message, suggestions: suggestions || [] });
    if (![x0, xf, h].every(Number.isFinite)) return fail('Los valores x0, xf y h deben ser números finitos.');
    if (!(h > 0)) return fail('El paso h debe ser un número positivo.');
    if (!(xf > x0)) return fail('El valor final xf debe ser mayor que x0.');
    const ratio = (xf - x0) / h;
    const N = Math.round(ratio);
    if (N >= 1 && Math.abs(ratio - N) <= STEP_TOLERANCE * Math.max(1, N)) {
      return { N, ok: true, message: '', suggestions: [] };
    }
    const span = xf - x0;
    const counts = [Math.max(1, Math.ceil(ratio)), Math.max(1, Math.floor(ratio))];
    const unique = counts.filter((n, i) => counts.indexOf(n) === i);
    const hs = unique.map((n) => span / n);
    const options = unique.map((n, i) => `h = ${show(hs[i])} (N = ${n})`).join(' o ');
    return fail(
      `El intervalo [${show(x0)}, ${show(xf)}] no es un múltiplo exacto de h = ${show(h)}: (xf − x0)/h = ${show(ratio)}. Pruebe con ${options}.`,
      hs,
    );
  }

  function finiteOrThrow(v, name) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new EDOError(`El valor ${name} debe ser un número finito.`);
    return v;
  }

  /**
   * Builds a Problem from a spec.
   * @param {object} spec
   * @param {string} [spec.id] Identifier.
   * @param {string} [spec.title] Display title (Spanish).
   * @param {string} [spec.source] Where the problem comes from (Spanish).
   * @param {'x'|'t'|string} [spec.indep='x'] Independent variable letter.
   * @param {string} spec.fStr Right-hand side f(x, y) as typed ("2*x*y", "sen(t)+e^{-t}").
   * @param {number} spec.x0 Initial abscissa.
   * @param {number} spec.y0 Initial value y(x0).
   * @param {number} spec.xf Final abscissa (> x0).
   * @param {number} [spec.h] Step; N is derived and must be an exact integer.
   * @param {number} [spec.N] Number of steps; h is derived. Give h or N (both must agree).
   * @param {{fn: function(number): number, tex: string, str: string}|null} [spec.exact]
   *   Closed form y(x): `fn` evaluates it, `tex` is the LaTeX of the right-hand side of y = ..., `str` its plain text.
   * @param {string} [spec.hand] Hand-derived y'' (text) for Taylor presets.
   * @param {string[]} [spec.notes] Spanish notes about assumptions and ambiguities.
   * @param {string|null} [spec.method] Method the source asks for ('euler'|'taylor'|'heun'|'rk2') or null.
   * @param {number} [spec.order] Taylor order the source asks for.
   * @returns {object} Problem = spec + {indep, fNode, f, h, N, fx(), fy(), derivNodes(order), derivFns(order), handNode()}.
   *   `f(x, y)` is compiled from the typed expression; `fx()`/`fy()` return simplified nodes (lazy, cached);
   *   `derivNodes(k)` returns `[y', y'', ..., y^(k)]` (the first is the typed node, the rest are total derivatives);
   *   `derivFns(k)` returns the same as compiled closures; `handNode()` parses `hand` (or returns null).
   * @throws {EDOParseError|EDOError} Spanish messages for syntax errors and invalid data.
   */
  function make(spec) {
    if (!spec || typeof spec !== 'object') throw new EDOError('Falta la especificación del problema.');
    const indep = expr.normalizeIndep(spec.indep);
    const fNode = expr.parse(String(spec.fStr), { indep });
    const x0 = finiteOrThrow(spec.x0, 'x0');
    const y0 = finiteOrThrow(spec.y0, 'y0');
    const xf = finiteOrThrow(spec.xf, 'xf');
    if (!(xf > x0)) throw new EDOError('El valor final xf debe ser mayor que x0.');
    if (spec.exact && typeof spec.exact.fn !== 'function') throw new EDOError('La solución exacta debe tener una función fn(x).');

    let { h, N } = spec;
    const hasH = h !== undefined && h !== null;
    const hasN = N !== undefined && N !== null;
    if (hasH) {
      const s = stepsFor(x0, xf, h);
      if (!s.ok) throw new EDOError(s.message);
      if (hasN && N !== s.N) throw new EDOError(`N = ${N} no coincide con (xf − x0)/h = ${s.N}.`);
      N = s.N;
    } else if (hasN) {
      if (!Number.isInteger(N) || N < 1) throw new EDOError('La cantidad de pasos N debe ser un entero positivo.');
      h = (xf - x0) / N;
    } else {
      throw new EDOError('Indique el paso h o la cantidad de pasos N.');
    }

    const f = expr.compile(fNode);
    let derivs = [];
    const derivFnCache = [f];
    let fxNode = null;
    let fyNode = null;
    let handCache;

    const ensureDerivs = (order) => {
      if (derivs.length === 0) derivs = [expr.simplify(fNode)];
      while (derivs.length < order) derivs.push(expr.totalDerivative(derivs[derivs.length - 1], { f: derivs[0] }));
    };
    const checkOrder = (order) => {
      if (!Number.isInteger(order) || order < 1) throw new EDOError('El orden de derivación debe ser un entero positivo.');
    };

    return Object.assign({}, spec, {
      id: spec.id || 'custom',
      title: spec.title || '',
      notes: spec.notes || [],
      indep, fNode, f, x0, y0, xf, h, N,
      fx() {
        if (!fxNode) fxNode = expr.diff(fNode, 'x');
        return fxNode;
      },
      fy() {
        if (!fyNode) fyNode = expr.diff(fNode, 'y');
        return fyNode;
      },
      derivNodes(order) {
        checkOrder(order);
        ensureDerivs(order);
        return [fNode].concat(derivs.slice(1, order));
      },
      derivFns(order) {
        checkOrder(order);
        ensureDerivs(order);
        while (derivFnCache.length < order) derivFnCache.push(expr.compile(derivs[derivFnCache.length]));
        return derivFnCache.slice(0, order);
      },
      handNode() {
        if (handCache === undefined) handCache = spec.hand ? expr.parse(spec.hand, { indep }) : null;
        return handCache;
      },
    });
  }

  /**
   * Builds the `exact` object of a spec from typed text (the simulator's optional closed form).
   * @param {string} str Closed form in the independent variable only, e.g. "exp(x^2-1)".
   * @param {{indep?: string}} [opts]
   * @returns {{fn: function(number): number, tex: string, str: string}}
   * @throws {EDOParseError|EDOError} Spanish messages.
   */
  function exactFromString(str, opts) {
    const indep = expr.normalizeIndep(opts && opts.indep);
    const node = expr.parse(str, { indep });
    if (expr.dependsOn(node, 'y')) throw new EDOError(`La solución exacta debe depender solo de ${indep}.`);
    const g = expr.compile(node);
    return { fn: (x) => g(x, NaN), tex: expr.toTeX(node, { indep }), str: expr.toString(node, { indep }) };
  }

  /* ------------------------------------------------------------------------ */
  /* Closed forms (each verified in tests: initial condition and ODE residual) */
  /* ------------------------------------------------------------------------ */

  const exact = (fn, tex, str) => Object.freeze({ fn, tex, str });
  const EXACT_2XY = exact((x) => Math.exp(x * x - 1), 'e^{x^{2}-1}', 'exp(x^2 - 1)');
  const EXACT_3X2Y = exact((x) => 3 * Math.exp(-(x ** 3)), '3e^{-x^{3}}', '3*exp(-x^3)');
  const EXACT_QUARTER = exact(
    (x) => Math.tan(x / 4 + Math.PI / 4), '\\tan\\left(\\frac{x}{4}+\\frac{\\pi}{4}\\right)', 'tan(x/4 + pi/4)',
  );
  const EXACT_LINEAR_FORCED = exact((x) => x + Math.exp(-x), 'x+e^{-x}', 'x + exp(-x)');
  const EXACT_SIN_EXP = exact(
    (t) => 2 - Math.cos(t) - Math.exp(-t), '2-\\cos(t)-e^{-t}', '2 - cos(t) - exp(-t)',
  );

  const notes = (...lines) => Object.freeze(lines);
  const preset = (spec) => Object.freeze(Object.assign({ indep: 'x', method: null, exact: null, notes: notes() }, spec));

  const TAYLOR_ASSUMPTION = 'La hoja indica solo «método de Taylor»: se asume grado 2, el único que aparece en el apunte.';
  const RK2_NAMING = 'La Práctica 06 llama «Runge-Kutta de 2º orden» al RK de grado 2 del apunte (punto medio).';

  /** Preset groups, in display order. */
  const GROUPS = Object.freeze([
    Object.freeze({ id: 'amiconi', label: 'Ejemplos resueltos del apunte' }),
    Object.freeze({ id: 'practica05', label: 'Práctica 05: EDO (PVI)' }),
    Object.freeze({ id: 'practica06', label: 'Práctica 06: EDO (2.ª parte)' }),
    Object.freeze({ id: 'comparativa', label: 'Casos comparativos' }),
    Object.freeze({ id: 'extra', label: 'Ampliación (no figura en el curso)' }),
  ]);

  /** The preset library (frozen specs; pass one to `make` or use `fromPreset`). */
  const PRESETS = Object.freeze([
    /* ---- Solved examples of the apunte --------------------------------- */
    preset({
      id: 'a1', group: 'amiconi', title: 'Ejemplo 1: Taylor de grado 2', source: 'Apunte de Amiconi · Ej. 1',
      method: 'taylor', order: 2, fStr: '2*x*y', x0: 1, y0: 1, xf: 1.3, h: 0.1, N: 3, exact: EXACT_2XY,
      hand: '2*y + 4*x^2*y', notes: notes('Se pide y(1.3) en 3 iteraciones.'),
    }),
    preset({
      id: 'a2', group: 'amiconi', title: 'Ejemplo 2: Euler', source: 'Apunte de Amiconi · Ej. 2',
      method: 'euler', indep: 't', fStr: 'sen(t) + e^{-t}', x0: 0, y0: 0, xf: 1, h: 0.5, N: 2, exact: EXACT_SIN_EXP,
      notes: notes('Variable independiente t, con 0 ≤ t ≤ 1 y 2 iteraciones.'),
    }),
    preset({
      id: 'a3', group: 'amiconi', title: 'Ejemplo 3: Euler Mejorado', source: 'Apunte de Amiconi · Ej. 3',
      method: 'heun', fStr: '-y + x + 1', x0: 0, y0: 1, xf: 1, h: 0.5, N: 2, exact: EXACT_LINEAR_FORCED,
      notes: notes('Dominio 0 ≤ x ≤ 1 y 2 iteraciones; el apunte muestra y′ en cada paso como valor intermedio.'),
    }),
    preset({
      id: 'a4', group: 'amiconi', title: 'Ejemplo 4: RK2 (punto medio)', source: 'Apunte de Amiconi · Ej. 4',
      method: 'rk2', fStr: '2*x*y', x0: 1, y0: 1, xf: 1.3, h: 0.1, N: 3, exact: EXACT_2XY,
      notes: notes('Es el mismo PVI del Ejemplo 1, resuelto con RK de grado 2 (punto medio).'),
    }),

    /* ---- Práctica 05 -------------------------------------------------------- */
    preset({
      id: 'p5_1a', group: 'practica05', title: 'Ej. 1a: Taylor', source: 'Práctica 05 · Ej. 1a',
      method: 'taylor', order: 2, fStr: '-3*x^2*y', x0: 0, y0: 3, xf: 0.5, h: 0.1, N: 5, exact: EXACT_3X2Y,
      hand: '9*x^4*y - 6*x*y', notes: notes(TAYLOR_ASSUMPTION),
    }),
    preset({
      id: 'p5_1b', group: 'practica05', title: 'Ej. 1b: Taylor', source: 'Práctica 05 · Ej. 1b',
      method: 'taylor', order: 2, fStr: '(1/4)*(1+y^2)', x0: 0, y0: 1, xf: 0.5, h: 0.1, N: 5, exact: EXACT_QUARTER,
      hand: 'y*(1+y^2)/8',
      notes: notes(TAYLOR_ASSUMPTION, 'La hoja no indica x0 de forma explícita: se toma x0 = 0 por el dominio 0 ≤ x ≤ 0.5.'),
    }),
    preset({
      id: 'p5_1c', group: 'practica05', title: 'Ej. 1c: Taylor', source: 'Práctica 05 · Ej. 1c',
      method: 'taylor', order: 2, fStr: '2*x*y', x0: 1, y0: 1, xf: 1.3, h: 0.1, N: 3, exact: EXACT_2XY,
      hand: '2*y + 4*x^2*y',
      notes: notes(TAYLOR_ASSUMPTION, 'La hoja pide y(1.3); la Práctica 06 pide y(1.5) con RK de 2º orden.'),
    }),
    preset({
      id: 'p5_1d', group: 'practica05', title: 'Ej. 1d: Taylor', source: 'Práctica 05 · Ej. 1d',
      method: 'taylor', order: 2, indep: 't', fStr: '(1/t)*(y^2+y)', x0: 1, y0: -2, xf: 3, h: 0.5, N: 4,
      exact: exact((t) => (2 * t) / (1 - 2 * t), '\\frac{2t}{1-2t}', '2*t/(1 - 2*t)'),
      hand: '2*y^2*(y+1)/t^2',
      notes: notes(
        TAYLOR_ASSUMPTION,
        'La hoja escribe y(t0) = −2 con el dominio 1 ≤ x ≤ 3: se toma t0 = 1.',
        'La hoja pregunta cuántas iteraciones son necesarias: N = (xf − x0)/h = 4.',
      ),
    }),
    preset({
      id: 'p5_2a', group: 'practica05', title: 'Ej. 2a: Euler', source: 'Práctica 05 · Ej. 2a',
      method: 'euler', fStr: '-y + x + 1', x0: 0, y0: 1, xf: 1, h: 0.1, N: 10, exact: EXACT_LINEAR_FORCED,
    }),
    preset({
      id: 'p5_2b', group: 'practica05', title: 'Ej. 2b: Euler', source: 'Práctica 05 · Ej. 2b',
      method: 'euler', indep: 't', fStr: 'sen(t) + e^{-t}', x0: 0, y0: 0, xf: 1, h: 0.5, N: 2, exact: EXACT_SIN_EXP,
      notes: notes('Es el mismo PVI del Ejemplo 2 del apunte.'),
    }),
    preset({
      id: 'p5_2c', group: 'practica05', title: 'Ej. 2c: Euler', source: 'Práctica 05 · Ej. 2c',
      method: 'euler', fStr: '(x-y)^2', x0: 2, y0: 0.5, xf: 2.75, h: 0.25, N: 3,
      exact: exact(
        (x) => x - 1 / Math.tanh(x + 0.5 * Math.log(5) - 2),
        'x-\\coth\\left(x+\\frac{1}{2}\\ln 5-2\\right)', 'x - 1/tanh(x + 0.5*ln(5) - 2)',
      ),
    }),
    preset({
      id: 'p5_2d_1', group: 'practica05', title: 'Ej. 2d, corrida 1: Euler', source: 'Práctica 05 · Ej. 2d',
      method: 'euler', fStr: 'x*y^2 - y/x', x0: 1, y0: 1, xf: 1.5, h: 0.1, N: 5,
      exact: exact((x) => 1 / (x * (2 - x)), '\\frac{1}{x(2-x)}', '1/(x*(2 - x))'),
      notes: notes('La hoja pide dos corridas con h y extremos distintos: corrida 1 con h = 0.1 hasta y(1.5).'),
    }),
    preset({
      id: 'p5_2d_2', group: 'practica05', title: 'Ej. 2d, corrida 2: Euler', source: 'Práctica 05 · Ej. 2d',
      method: 'euler', fStr: 'x*y^2 - y/x', x0: 1, y0: 1, xf: 1.25, h: 0.05, N: 5,
      exact: exact((x) => 1 / (x * (2 - x)), '\\frac{1}{x(2-x)}', '1/(x*(2 - x))'),
      notes: notes('Corrida 2 con h = 0.05 hasta y(1.25); no es comparable con la corrida 1 en el mismo x.'),
    }),
    preset({
      id: 'p5_2e_1', group: 'practica05', title: 'Ej. 2e, corrida 1: Euler', source: 'Práctica 05 · Ej. 2e',
      method: 'euler', fStr: '2*x - 3*y + 1', x0: 1, y0: 5, xf: 1.5, h: 0.1, N: 5,
      exact: exact(
        (x) => (2 * x) / 3 + 1 / 9 + (38 / 9) * Math.exp(-3 * (x - 1)),
        '\\frac{2x}{3}+\\frac{1}{9}+\\frac{38}{9}e^{-3(x-1)}', '2*x/3 + 1/9 + 38/9*exp(-3*(x - 1))',
      ),
      notes: notes('La hoja pide dos corridas con h y extremos distintos: corrida 1 con h = 0.1 hasta y(1.5).'),
    }),
    preset({
      id: 'p5_2e_2', group: 'practica05', title: 'Ej. 2e, corrida 2: Euler', source: 'Práctica 05 · Ej. 2e',
      method: 'euler', fStr: '2*x - 3*y + 1', x0: 1, y0: 5, xf: 1.25, h: 0.05, N: 5,
      exact: exact(
        (x) => (2 * x) / 3 + 1 / 9 + (38 / 9) * Math.exp(-3 * (x - 1)),
        '\\frac{2x}{3}+\\frac{1}{9}+\\frac{38}{9}e^{-3(x-1)}', '2*x/3 + 1/9 + 38/9*exp(-3*(x - 1))',
      ),
      notes: notes('Corrida 2 con h = 0.05 hasta y(1.25); no es comparable con la corrida 1 en el mismo x.'),
    }),
    preset({
      id: 'p5_3a', group: 'practica05', title: 'Ej. 3a: Euler Mejorado', source: 'Práctica 05 · Ej. 3a',
      method: 'heun', fStr: '2*x*y', x0: 1, y0: 1, xf: 1.5, h: 0.1, N: 5, exact: EXACT_2XY,
    }),
    preset({
      id: 'p5_3b', group: 'practica05', title: 'Ej. 3b: Euler Mejorado', source: 'Práctica 05 · Ej. 3b',
      method: 'heun', fStr: '(x+y-1)^2', x0: 0, y0: 2, xf: 0.5, h: 0.1, N: 5,
      exact: exact((x) => Math.tan(x + Math.PI / 4) - x + 1, '\\tan\\left(x+\\frac{\\pi}{4}\\right)-x+1', 'tan(x + pi/4) - x + 1'),
    }),
    preset({
      id: 'p5_3c', group: 'practica05', title: 'Ej. 3c: Euler Mejorado', source: 'Práctica 05 · Ej. 3c',
      method: 'heun', fStr: 'x + y^2', x0: 0, y0: 0, xf: 0.5, h: 0.1, N: 5,
      notes: notes('No tiene solución en forma cerrada: la verificación usa una referencia RK4 con paso h/200.'),
    }),
    preset({
      id: 'p5_3e', group: 'practica05', title: 'Ej. 3e: Euler Mejorado', source: 'Práctica 05 · Ej. 3e',
      method: 'heun', indep: 't', fStr: '-t*y + 4*t/y', x0: 0, y0: 1, xf: 1, h: 0.25, N: 4,
      exact: exact(
        (t) => Math.sqrt(4 - 3 * Math.exp(-(t * t))), '\\sqrt{4-3e^{-t^{2}}}', 'sqrt(4 - 3*exp(-t^2))',
      ),
      notes: notes('La hoja indica el dominio 0 ≤ t ≤ 1.'),
    }),

    /* ---- Práctica 06 -------------------------------------------------------- */
    preset({
      id: 'p6_1a', group: 'practica06', title: 'Ej. 1a: RK2', source: 'Práctica 06 · Ej. 1a',
      method: 'rk2', fStr: '-3*x^2*y', x0: 0, y0: 3, xf: 0.5, h: 0.1, N: 5, exact: EXACT_3X2Y,
      notes: notes(RK2_NAMING),
    }),
    preset({
      id: 'p6_1b', group: 'practica06', title: 'Ej. 1b: RK2', source: 'Práctica 06 · Ej. 1b',
      method: 'rk2', fStr: '(1/4)*(1+y^2)', x0: 0, y0: 1, xf: 0.5, h: 0.1, N: 5, exact: EXACT_QUARTER,
      notes: notes(RK2_NAMING),
    }),
    preset({
      id: 'p6_1c', group: 'practica06', title: 'Ej. 1c: RK2', source: 'Práctica 06 · Ej. 1c',
      method: 'rk2', fStr: '2*x*y', x0: 1, y0: 1, xf: 1.5, h: 0.1, N: 5, exact: EXACT_2XY,
      notes: notes(RK2_NAMING, 'Aquí se pide y(1.5); la Práctica 05 pide y(1.3) en el Ej. 1c.'),
    }),

    /* ---- Comparison cases: same PVI, all methods, h = 0.1 ----------------- */
    preset({
      id: 'cmp_2xy_13', group: 'comparativa', title: "y' = 2xy, y(1) = 1: y(1.3)", source: 'Caso comparativo',
      fStr: '2*x*y', x0: 1, y0: 1, xf: 1.3, h: 0.1, N: 3, exact: EXACT_2XY,
      notes: notes('Mismo PVI que los Ejemplos 1 y 4 del apunte: permite comparar los tres métodos de grado 2 en el mismo caso.'),
    }),
    preset({
      id: 'cmp_2xy_15', group: 'comparativa', title: "y' = 2xy, y(1) = 1: y(1.5)", source: 'Caso comparativo',
      fStr: '2*x*y', x0: 1, y0: 1, xf: 1.5, h: 0.1, N: 5, exact: EXACT_2XY,
    }),
    preset({
      id: 'cmp_3x2y', group: 'comparativa', title: "y' = -3x²y, y(0) = 3: y(0.5)", source: 'Caso comparativo',
      fStr: '-3*x^2*y', x0: 0, y0: 3, xf: 0.5, h: 0.1, N: 5, exact: EXACT_3X2Y,
      notes: notes('Aquí RK2 (punto medio) resulta el más cercano a la solución exacta.'),
    }),
    preset({
      id: 'cmp_quarter', group: 'comparativa', title: "y' = (1 + y²)/4, y(0) = 1: y(0.5)", source: 'Caso comparativo',
      fStr: '(1+y^2)/4', x0: 0, y0: 1, xf: 0.5, h: 0.1, N: 5, exact: EXACT_QUARTER,
    }),

    /* ---- Extras (not in the course) ---------------------------------------- */
    preset({
      id: 'ex_linear', group: 'extra', title: "Lineal: y' = -2y, y(0) = 1", source: 'Ampliación',
      fStr: '-2*y', x0: 0, y0: 1, xf: 1, h: 0.1, N: 10,
      exact: exact((x) => Math.exp(-2 * x), 'e^{-2x}', 'exp(-2*x)'),
      notes: notes('En un problema lineal y′ = λy los tres métodos de grado 2 dan exactamente los mismos valores.'),
    }),
    preset({
      id: 'ex_unstable', group: 'extra', title: "Inestabilidad: y' = -10y, h = 0.3", source: 'Ampliación',
      fStr: '-10*y', x0: 0, y0: 1, xf: 3, h: 0.3, N: 10,
      exact: exact((x) => Math.exp(-10 * x), 'e^{-10x}', 'exp(-10*x)'),
      notes: notes('Con h·λ = −3, fuera del intervalo de estabilidad [−2, 0], los métodos crecen en lugar de decaer.'),
    }),
  ]);

  /**
   * Looks a preset up by id.
   * @param {string} id For example 'a1', 'p5_1a', 'p6_1c', 'cmp_2xy_13', 'ex_linear'.
   * @returns {object|undefined} The frozen preset spec.
   */
  function byId(id) {
    return PRESETS.find((p) => p.id === id);
  }

  /**
   * Builds a Problem from a preset id (or spec), optionally overriding fields.
   * Overriding `h` (or `N`) alone drops the preset's other step field so `make` re-derives it.
   * @param {string|object} idOrSpec Preset id or spec.
   * @param {object} [overrides] Fields to replace (e.g. `{h: 0.05}`).
   * @returns {object} Problem.
   */
  function fromPreset(idOrSpec, overrides) {
    const base = typeof idOrSpec === 'string' ? byId(idOrSpec) : idOrSpec;
    if (!base) throw new EDOError(`No existe el ejemplo «${idOrSpec}».`);
    const o = overrides || {};
    const spec = Object.assign({}, base, o);
    if (o.h !== undefined && o.N === undefined) delete spec.N;
    if (o.N !== undefined && o.h === undefined) delete spec.h;
    return make(spec);
  }

  return { make, stepsFor, exactFromString, fromPreset, byId, PRESETS, GROUPS };
}));
