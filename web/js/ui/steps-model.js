/**
 * EDO.stepsModel - the step-by-step solution of the cátedra (Ing. Amiconi's format, section 5.2 of the ODD
 * document) as a pure data model. No DOM: js/ui/steps.js lays it out, and web/tests/steps.test.js checks it
 * against the oracles of the apunte. Every number comes from `methods.solve` and every substitution line from
 * `expr.toTeX(..., {style: 'catedra', numFmt})`; nothing numeric is typed by hand.
 *
 *   EDO.stepsModel.build(problem, methodId, opts) -> model
 *   EDO.stepsModel.exercise(idOrProblem, methodId, opts) -> {problem, solution, model}
 *   EDO.stepsModel.showValue(v, {mode, decimals}) -> string          a result, strictly truncated or rounded
 *   EDO.stepsModel.showIntermediate(v, {mode, decimals}) -> string   a k1, a slope: an exact extra decimal is kept
 *
 * opts: mode 'trunc' (default: the apunte's convention) | 'round'; decimals (default 4); order (Taylor, 2 to 4,
 * default the problem's own or 2: orders 3 and 4 are an extension beyond the course); number (the exercise
 * number, optional); upTo (render only the first k iterations); ask 'value' | 'interval' (does the statement ask
 * for y(xf), or give the interval x0 <= x <= xf? default: the apunte's choice for its own examples, 'value' else).
 *
 * The model, in the order of the apunte. A "part" is {kind, say?, tex?, highlight?, label?}: `say` is Spanish text
 * with inline math in $...$ and `tex` is one display formula (no delimiters).
 *   title, number, method {id, label, chip, name, order, extension}, problem {...}, options, display {mode, decimals,
 *   notice}, partial, diverged, message,
 *   statement.parts            f(x, y(x)) = y' = ..., [the interval,] h, y(x0) = y0, [Hallar y(xf)]
 *   initial.parts              La condición inicial: y(x0) = y0 -> x0 = ..., y0 = ...
 *   domain {N, parts}          the working domain and N = (xf - x0)/h iterations
 *   abscissas {parts, truncated}   x0, x1 = x0 + h, ... (abbreviated with dots when long)
 *   generic.parts              Ordenada Genérica: the generic formula and the one for this f, both highlighted
 *   iterations[]               {n, label, ordinal, x, y, yText, values, valueTexts, parts[]}; the parts follow
 *                              the apunte per method: intro ("Si n=0 entonces"), [where], [predictor], replace
 *                              ("Reemplazando cada valor"), result (y_{n+1} = value = y(x_{n+1}) = y(x), highlighted)
 *                              and, on the first iteration only, the note "Esto se lee así"
 *   closing                    one of the two closing sentences of the apunte (null for a partial or diverged run)
 *   summary {columns, rows, final}    n, x_n, y_n and the intermediate values of each method
 *   verification               OUR ADDITION (labelled "Verificación", `extension: true`): exact value or RK4
 *                              reference at the last point shown, absolute and relative error
 *
 * Display rule. The calculation always runs at full float64 precision; only the text is cut. Results (every y_n)
 * are cut strictly to `decimals`. Intermediate values (k1, slopes, predictor) follow the apunte one step further:
 * in truncated mode one that is exact with one more decimal is written whole (the handout prints k1 = 0.27082,
 * not 0.2708, yet 0.3708 for the 0.37086583 of the next step). Data (x_n, h, y_0, the constants of f) are always
 * written exactly. Two sentinel tricks keep the printers honest: computed values enter the expression printer as
 * very large placeholder numbers that `numFmt` maps back to their text, so the engine decides every parenthesis.
 *
 * Load order (browser): after the numerics (expr, format, problems, methods, analysis). Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      expr: require('../numerics/expr.js'),
      format: require('../numerics/format.js'),
      problems: require('../numerics/problems.js'),
      methods: require('../numerics/methods.js'),
      analysis: require('../numerics/analysis.js'),
    });
  } else {
    root.EDO = root.EDO || {};
    root.EDO.stepsModel = factory(root.EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const {
    expr, format, problems, methods, analysis,
  } = EDO;
  const B = expr.N; // node builders
  const T = String.raw; // TeX written with single backslashes

  const METHOD_IDS = Object.freeze(['euler', 'taylor', 'heun', 'rk2']);
  const DEFAULTS = Object.freeze({ mode: 'trunc', decimals: 4, order: 2 });
  const DATA_DECIMALS = 10; // data are written exactly (up to 10 decimals, trailing zeros dropped)
  const MAX_DECIMALS = 10;
  const MAX_LISTED_ABSCISSAS = 10; // x_0 .. x_N are all listed up to this many, then abbreviated
  const SENTINEL = 1.2345e300; // placeholder numbers (times 1, 2, 3, ...) that stand for already-formatted text

  /** The apunte's own examples that give the interval of work instead of "Hallar y(xf)" (Ejercicios 2 and 3). */
  const INTERVAL_EXERCISES = Object.freeze(['a2', 'a3']);
  const ORDINALS = Object.freeze(['Primer', 'Segunda', 'Tercer', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava', 'Novena', 'Décima']);
  const COUNT_WORDS = Object.freeze(['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']);
  const CLOSING_VALUE = 'Hallamos el valor que nos pedía el enunciado, por lo tanto el ejercicio termina aquí.';
  const CLOSING_INTERVAL = 'Llegamos al valor de "y" correspondiente al final del intervalo, por lo tanto el ejercicio termina en este punto.';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const isZero = (node) => node && node.t === 'num' && node.v === 0;
  /** A negative number gets parentheses when it follows an operator. */
  const par = (text) => (text.charAt(0) === '-' ? `(${text})` : text);
  const countWord = (n) => (n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n));
  const plural = (n, one, many) => (n === 1 ? one : many);

  /* ======================================================================================================
     Number display
     ====================================================================================================== */

  function displayOptions(o) {
    const mode = o && o.mode === 'round' ? 'round' : 'trunc';
    const d = o && Number.isInteger(o.decimals) ? clamp(o.decimals, 0, MAX_DECIMALS) : DEFAULTS.decimals;
    return { mode, decimals: d };
  }

  /**
   * A result written with `decimals` decimals, truncated toward zero ('trunc', as the apunte) or rounded.
   * @param {number} v
   * @param {{mode?: 'trunc'|'round', decimals?: number}} [o]
   * @returns {string} '.' as the decimal separator, trailing zeros dropped.
   */
  function showValue(v, o) {
    const d = displayOptions(o);
    return format.num(v, { decimals: d.decimals, mode: d.mode });
  }

  const isExact = (v, text) => Math.abs(v - Number(text)) <= 1e-12 * Math.max(1, Math.abs(v));

  /**
   * An intermediate value (k1, a slope, the predictor). Like `showValue`, except that in truncated mode a value that
   * is exact with one more decimal is written whole, as the handout does with k1 = 0.27082.
   */
  function showIntermediate(v, o) {
    const d = displayOptions(o);
    const strict = format.num(v, { decimals: d.decimals, mode: d.mode });
    if (d.mode === 'round' || !Number.isFinite(v)) return strict;
    const longer = format.num(v, { decimals: d.decimals + 1, mode: 'trunc' });
    return isExact(v, longer) ? longer : strict;
  }

  /** TeX of an already formatted number (scientific notation, infinity and NaN as TeX). */
  function texOfNumber(s) {
    if (s === '∞') return '\\infty';
    if (s === '-∞') return '-\\infty';
    if (s === 'NaN') return '\\mathrm{NaN}';
    const m = /^(-?[\d.]+)e(-?\d+)$/.exec(s);
    return m ? `${m[1]}\\times 10^{${m[2]}}` : s;
  }

  /** `digits` significant digits, in fixed notation when readable, scientific otherwise (errors). */
  function significant(v, digits) {
    if (!Number.isFinite(v)) return format.num(v);
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    if (e < -3 || e >= 6) return format.sci(v, { digits });
    return format.num(v, { decimals: Math.max(0, digits - 1 - e), mode: 'round' });
  }

  /* ======================================================================================================
     The expression printer: engine TeX with symbols and formatted values as placeholders
     ====================================================================================================== */

  /**
   * One printer per model. `sym(text)` is a symbol printed verbatim (x_n, h, k_1); `dat(v)` a datum written exactly;
   * `val(v)` a result and `mid(v)` an intermediate written as displayed. They return expression nodes, so
   * `expr.substitute` + `expr.toTeX` keep every operator, sign and parenthesis decision in the engine.
   */
  function makePrinter(indep, display) {
    const table = new Map(); // placeholder number -> text
    const keys = new Map(); // text (without sign) -> placeholder
    const symbols = new Set();
    let count = 0;

    function atom(text, symbolic) {
      const negative = text.charAt(0) === '-';
      const magnitude = negative ? text.slice(1) : text;
      let key = keys.get(magnitude);
      if (key === undefined) {
        count += 1;
        key = SENTINEL * count;
        keys.set(magnitude, key);
        table.set(key, magnitude);
        table.set(-key, `-${magnitude}`);
        if (symbolic) symbols.add(magnitude);
      }
      return B.num(negative ? -key : key);
    }

    const data = (v) => texOfNumber(format.num(v, { decimals: DATA_DECIMALS, mode: 'round' }));
    const value = (v) => texOfNumber(showValue(v, display));
    const inter = (v) => texOfNumber(showIntermediate(v, display));
    const numFmt = (v) => (table.has(v) ? table.get(v) : data(v));

    function tex(node, style) {
      let out = expr.toTeX(node, { indep, numFmt, style: style === 'math' ? undefined : 'catedra' });
      // the engine parenthesizes a numeric base ((1)^2, as the handout writes); a symbol needs no parentheses
      symbols.forEach((s) => { out = out.split(`(${s})^`).join(`${s}^`); });
      return out;
    }

    return {
      indep,
      data,
      value,
      inter,
      sym: (text) => atom(text, true),
      dat: (v) => atom(data(v), false),
      val: (v) => atom(value(v), false),
      mid: (v) => atom(inter(v), false),
      tex,
      /** TeX of f(x, y) with the nodes `x` and `y` in place of the variables. */
      at: (node, x, y) => tex(expr.substitute(node, { x, y })),
    };
  }

  /* ======================================================================================================
     Names of the symbols at an index (a number k or the generic 'n')
     ====================================================================================================== */

  const brace = (s) => (String(s).length > 1 ? `{${s}}` : String(s));

  function names(K, X) {
    const cur = K === 'n' ? 'n' : brace(K);
    const next = K === 'n' ? '{n+1}' : brace(K + 1);
    return {
      x: `${X}_${cur}`, y: `y_${cur}`, yp: `y_${cur}'`, xNext: `${X}_${next}`, yNext: `y_${next}`,
    };
  }

  /** y^(order) without index: y', y'', y''', y^{(4)}. */
  function derivMark(order) {
    if (order <= 3) return "'".repeat(order);
    return `^{(${order})}`;
  }

  const derivName = (K, order, X) => `${names(K, X).y}${derivMark(order)}`;

  /* ======================================================================================================
     Context shared by the section builders
     ====================================================================================================== */

  function methodInfo(id, order) {
    const entry = methods.byId(id);
    const extension = id === 'taylor' && order > 2;
    const name = { euler: 'Euler', taylor: `Taylor de grado ${order}`, heun: 'Euler Mejorado', rk2: 'Runge Kutta de grado 2' }[id];
    return {
      id,
      label: entry.label,
      chip: extension ? `Taylor (grado ${order})` : entry.label,
      name,
      order: id === 'taylor' ? order : entry.order,
      extension,
    };
  }

  function makeContext(problem, id, sol, o) {
    const X = problem.indep;
    const P = makePrinter(X, o);
    const info = methodInfo(id, o.order);
    let derivs = null;
    if (id === 'taylor') {
      derivs = problem.derivNodes(o.order).slice();
      const hand = typeof problem.handNode === 'function' ? problem.handNode() : null;
      if (hand && o.order >= 2) derivs[1] = hand; // the second derivative as derived by hand in the handout
    }
    return {
      problem, id, sol, o, X, P, info, f: problem.fNode, derivs, order: info.order, h: sol.h, N: problem.N,
    };
  }

  /* ======================================================================================================
     Statement, initial condition, domain, abscissas
     ====================================================================================================== */

  function askOf(problem, o) {
    if (o.ask === 'value' || o.ask === 'interval') return o.ask;
    if (problem.ask === 'value' || problem.ask === 'interval') return problem.ask;
    return INTERVAL_EXERCISES.includes(problem.id) ? 'interval' : 'value';
  }

  function statementSection(C, ask) {
    const { P, X, problem } = C;
    const parts = [{ kind: 'f', tex: `f(${X}, y(${X})) = y' = ${P.tex(C.f, 'math')}` }];
    if (ask === 'interval') parts.push({ kind: 'interval', tex: T`${P.data(problem.x0)} \le ${X} \le ${P.data(problem.xf)}` });
    parts.push({ kind: 'h', tex: `h = ${P.data(C.h)}` });
    parts.push({ kind: 'initial', tex: `y(${P.data(problem.x0)}) = ${P.data(problem.y0)}` });
    if (ask === 'value') parts.push({ kind: 'find', say: `Hallar $y(${P.data(problem.xf)})$` });
    return { parts };
  }

  function initialSection(C) {
    const { P, X, problem } = C;
    return {
      parts: [
        { kind: 'condition', say: 'La condición inicial:', tex: T`y(${X}_0) = y_0 \;\Rightarrow\; y(${P.data(problem.x0)}) = ${P.data(problem.y0)}` },
        { kind: 'values', say: 'entonces:', tex: T`${X}_0 = ${P.data(problem.x0)} \qquad y_0 = ${P.data(problem.y0)}` },
      ],
    };
  }

  function domainSection(C, ask) {
    const { P, X, problem } = C;
    const N = problem.N;
    const x0 = P.data(problem.x0);
    const xf = P.data(problem.xf);
    const hT = P.data(C.h);
    const iterations = plural(N, 'iteración', 'iteraciones');
    const count = { kind: 'count', tex: T`N = \frac{${X}_f - ${X}_0}{h} = \frac{${xf} - ${par(x0)}}{${hT}} = ${N}` };
    const parts = [];
    if (ask === 'interval') {
      parts.push(Object.assign({
        kind: 'domain',
        say: `Nuestro dominio o intervalo de trabajo, si $${X}_0 = ${x0}$ y el intervalo es hasta $${xf}$, con paso $h = ${hT}$, tendremos que realizar entonces $${N}$ ${iterations}, ya que:`,
      }, count));
    } else {
      parts.push({
        kind: 'domain',
        say: `Nuestro dominio o intervalo de trabajo, si $${X}_0 = ${x0}$ y queremos hallar $y(${xf})$, que sería el valor de "y" en el punto final $${X}_f = ${xf}$, quedaría entonces como:`,
        tex: T`${x0} \le ${X} \le ${xf}`,
      });
      parts.push(Object.assign({ say: `Como el paso $h = ${hT}$, tendremos que realizar entonces $${N}$ ${iterations}, ya que:` }, count));
    }
    return { N, parts };
  }

  function abscissasSection(C) {
    const { P, X, problem } = C;
    const N = problem.N;
    const line = (k) => (k === 0
      ? { kind: 'x', tex: `${X}_0 = ${P.data(problem.x0)}` }
      : { kind: 'x', tex: `${X}_${brace(k)} = ${X}_${brace(k - 1)} + h = ${P.data(problem.x0 + k * C.h)}` });
    const indices = Array.from({ length: N + 1 }, (v, k) => k);
    const long = indices.length > MAX_LISTED_ABSCISSAS;
    const shown = long ? [0, 1, 2] : indices;
    const parts = shown.map(line);
    if (long) {
      parts.push({ kind: 'dots', tex: T`\vdots` });
      [N - 1, N].forEach((k) => parts.push(line(k)));
    }
    return { truncated: long, parts };
  }

  /* ======================================================================================================
     Ordenada Genérica
     ====================================================================================================== */

  /** The formula of the method with y', y'', ... as symbols (the first, highlighted one). */
  function genericFormula(C) {
    const X = C.X;
    switch (C.id) {
      case 'euler': return T`y_{n+1} = y_n + h\,y_n'`;
      case 'taylor': {
        let line = T`y_{n+1} = y_n + h\,y_n'`;
        for (let j = 2; j <= C.order; j += 1) line += T` + \frac{h^{${j}}}{${j}!}\,${derivName('n', j, X)}`;
        return line;
      }
      case 'heun': return T`y_{n+1} = y_n + \frac{h}{2!}\Bigl[f(${X}_n, y(${X}_n)) + f\bigl(${X}_{n+1},\ y_n + h\,y_n'\bigr)\Bigr]`;
      default: return T`y_{n+1} = y_n + h\,f\!\left(${X}_n + \frac{h}{2},\ y_n + \frac{k_1}{2}\right)`;
    }
  }

  /** The Ordenada Genérica particularized for the problem's f, at the index K ('n' or an iteration k). */
  function particularized(C, K) {
    const { P, X } = C;
    const nm = names(K, X);
    const xs = P.sym(nm.x);
    const ys = P.sym(nm.y);
    switch (C.id) {
      case 'euler':
        return T`${nm.yNext} = ${nm.y} + h\cdot[${P.at(C.f, xs, ys)}]`;
      case 'taylor': {
        let line = T`${nm.yNext} = ${nm.y} + h\cdot[${P.at(C.derivs[0], xs, ys)}]`;
        for (let j = 2; j <= C.order; j += 1) line += T` + \frac{h^{${j}}}{${j}!}\cdot[${P.at(C.derivs[j - 1], xs, ys)}]`;
        return line;
      }
      case 'heun': {
        const predictor = B.add([ys, B.mul([P.sym('h'), P.sym(nm.yp)])]);
        return T`${nm.yNext} = ${nm.y} + \frac{h}{2!}\cdot[(${P.at(C.f, xs, ys)}) + (${P.at(C.f, P.sym(nm.xNext), predictor)})]`;
      }
      default: {
        const xm = B.add([xs, B.div(P.sym('h'), B.num(2))]);
        const ym = B.add([ys, B.div(P.sym('k_1'), B.num(2))]);
        return T`${nm.yNext} = ${nm.y} + h\cdot[${P.at(C.f, xm, ym)}]`;
      }
    }
  }

  const GENERIC_OUTRO = [
    'Esa será nuestra ordenada genérica y con ella empezamos a recorrer el dominio de trabajo haciendo iteraciones.',
    'Hacemos todo en los puntos "n-ésimos" para recorrer luego el dominio y simplemente ir reemplazando los valores de acuerdo a la iteración en la que estamos parados.',
  ];

  /** y'' = f_x + f_y*y' as the handout derives it, then simplified (only when something can be said in between). */
  function secondDerivativeChain(C) {
    const { P, X, problem } = C;
    const xs = P.sym(`${X}_n`);
    const ys = P.sym('y_n');
    const simplified = P.at(C.derivs[1], xs, ys);
    const fx = problem.fx();
    const fy = problem.fy();
    const pieces = [];
    if (!isZero(fx)) pieces.push(expr.substitute(fx, { x: xs, y: ys }));
    if (!isZero(fy)) pieces.push(B.mul([expr.substitute(fy, { x: xs, y: ys }), expr.substitute(C.f, { x: xs, y: ys })]));
    const expanded = pieces.length > 1 ? P.tex(B.add(pieces)) : null;
    const head = `${derivName('n', 2, X)} = `;
    return expanded && expanded !== simplified ? `${head}${expanded} = ${simplified}` : `${head}${simplified}`;
  }

  function genericSection(C) {
    const { P, X, info, id } = C;
    const parts = [];
    const intro = { kind: 'intro', say: `Por ${info.name} vamos a definir la Ordenada Genérica $y_{n+1}$ para nuestro problema para poder realizar las iteraciones.` };
    const lead = { kind: 'lead', say: `Entonces reemplazando por los datos de nuestro problema en las ecuaciones de ${info.name}, nos quedará que:` };
    const particular = (say, tex) => Object.assign({
      kind: 'particular', tex, highlight: true, label: 'Ordenada Genérica',
    }, say ? { say } : {});
    const xs = P.sym(`${X}_n`);
    const ys = P.sym('y_n');
    const explain = (call, xText, yText) => ({
      kind: 'explain',
      say: `$${call}$ es nuestra ecuación diferencial original del enunciado, pero evaluada en los puntos $(${xText},\\ ${yText})$. `
        + `Es decir, donde en la ecuación diferencial original teníamos el valor "${X}" ahora usamos $${xText}$ y donde teníamos el valor "y" ahora usamos $${yText}$.`,
    });

    parts.push(intro, { kind: 'generic', tex: genericFormula(C), highlight: true });

    if (id === 'euler') {
      parts.push({ kind: 'where', say: 'donde:', tex: `y_n' = f(${X}_n, y(${X}_n))` });
      parts.push(lead);
      parts.push(particular(null, particularized(C, 'n')));
    } else if (id === 'taylor') {
      parts.push({ kind: 'where', say: 'donde:', tex: `y_n' = f(${X}_n, y(${X}_n))` });
      for (let j = 2; j <= C.order; j += 1) {
        const previous = j === 2 ? 'f' : `y${derivMark(j - 1)}`;
        parts.push({
          kind: 'where',
          tex: T`${derivName('n', j, X)} = \frac{\partial ${previous}}{\partial ${X}} + \frac{\partial ${previous}}{\partial y}\,y_n'`,
        });
      }
      let partial = T`y_{n+1} = y_n + h\cdot[${P.at(C.derivs[0], xs, ys)}]`;
      for (let j = 2; j <= C.order; j += 1) partial += T` + \frac{h^{${j}}}{${j}!}\,${derivName('n', j, X)}`;
      parts.push(Object.assign({}, lead, { tex: partial }));
      parts.push({ kind: 'step', say: 'Pero:', tex: secondDerivativeChain(C) });
      for (let j = 3; j <= C.order; j += 1) parts.push({ kind: 'step', tex: `${derivName('n', j, X)} = ${P.at(C.derivs[j - 1], xs, ys)}` });
      parts.push(particular('Por lo tanto:', particularized(C, 'n')));
    } else if (id === 'heun') {
      parts.push({ kind: 'where', say: 'como:', tex: `y_n' = f(${X}_n, y(${X}_n))` });
      parts.push({ kind: 'where', say: 'entonces:', tex: T`y_{n+1} = y_n + \frac{h}{2!}\Bigl[y_n' + f\bigl(${X}_{n+1},\ y_n + h\,y_n'\bigr)\Bigr]` });
      parts.push(lead);
      const predictor = B.add([ys, B.mul([P.sym('h'), P.sym("y_n'")])]);
      parts.push({ kind: 'step', tex: `y_n' = ${P.at(C.f, xs, ys)}` });
      parts.push({ kind: 'step', tex: T`f\bigl(${X}_{n+1},\ y_n + h\,y_n'\bigr) = ${P.at(C.f, P.sym(`${X}_{n+1}`), predictor)}` });
      parts.push(explain(T`f(${X}_{n+1},\ y_n + h\,y_n')`, `${X}_{n+1}`, T`y_n + h\,y_n'`));
      parts.push(particular('Por lo tanto la ordenada genérica quedará como:', particularized(C, 'n')));
    } else {
      parts.push({ kind: 'where', say: 'donde:', tex: `k_1 = h\\,f(${X}_n, y(${X}_n)) = h\\,y_n'` });
      parts.push(lead);
      const xm = B.add([xs, B.div(P.sym('h'), B.num(2))]);
      const ym = B.add([ys, B.div(P.sym('k_1'), B.num(2))]);
      parts.push({ kind: 'step', tex: T`f\!\left(${X}_n + \frac{h}{2},\ y_n + \frac{k_1}{2}\right) = ${P.at(C.f, xm, ym)}` });
      parts.push(explain(T`f\!\left(${X}_n + \frac{h}{2},\ y_n + \frac{k_1}{2}\right)`, T`${X}_n + \frac{h}{2}`, T`y_n + \frac{k_1}{2}`));
      parts.push(particular('Por lo tanto la ordenada genérica quedará como:', particularized(C, 'n')));
      parts.push({ kind: 'step', say: 'con:', tex: T`k_1 = h\cdot(${P.at(C.f, xs, ys)})` });
    }
    GENERIC_OUTRO.forEach((say) => parts.push({ kind: 'outro', say }));
    return { parts };
  }

  /* ======================================================================================================
     Iterations
     ====================================================================================================== */

  function ordinalLabel(n) {
    return n < ORDINALS.length ? { label: `${ORDINALS[n]} iteración`, ordinal: true } : { label: `Iteración n=${n}`, ordinal: false };
  }

  /** "Esto se lee así": the first iteration only. */
  function readingNote(C, ask) {
    const { P, X, problem } = C;
    const x1 = P.data(problem.x0 + C.h);
    let say = `Esto se lee así: el valor de $y_1$ es igual al valor de $y$ evaluado en el punto $${X}_1$, y como $${X}_1 = ${X}_0 + h$ entonces `
      + `$${X}_1 = ${P.data(problem.x0)} + ${P.data(C.h)} = ${x1}$.`;
    const missing = problem.N - 1;
    if (missing >= 1) {
      if (ask === 'interval') {
        say += ` Si debemos llegar hasta un valor de $${X}$ que sea igual a "${P.data(problem.xf)}", para llegar al final del intervalo, aún nos falta seguir haciendo iteraciones.`;
      } else {
        const rest = missing === 1 ? 'nos falta una iteración más' : `nos faltan ${countWord(missing)} iteraciones más`;
        say += ` Si debemos llegar hasta $${P.data(problem.xf)}$, que nos pide el enunciado, aún ${rest}.`;
      }
    }
    return { kind: 'note', say };
  }

  /** One iteration: the parts of the apunte for the method, from the engine's step record. */
  function iteration(C, k, ask) {
    const {
      P, X, id, f, h,
    } = C;
    const s = C.sol.steps[k];
    const d = s.detail;
    const nm = names(k, X);
    const xs = P.sym(nm.x);
    const ys = P.sym(nm.y);
    const xN = P.dat(s.xn);
    const yN = k === 0 ? P.dat(s.yn) : P.val(s.yn);
    const yT = k === 0 ? P.data(s.yn) : P.value(s.yn);
    const hT = P.data(h);
    const xN1 = P.dat(s.xn1);
    const yNext = P.value(s.yn1);
    const parts = [{ kind: 'intro', say: `Si $n=${k}$ entonces:`, tex: particularized(C, k) }];
    const values = {};
    const valueTexts = {};
    const put = (key, v) => { values[key] = v; valueTexts[key] = showIntermediate(v, C.o); };
    const callAt = `f(${X}_${brace(k)}, y_${brace(k)})`;

    if (id === 'euler' || id === 'heun') {
      put('slope', d.slope);
      const numeric = P.at(f, xN, yN);
      const slopeT = P.inter(d.slope);
      parts.push({ kind: 'where', say: 'Donde:', tex: `${nm.yp} = ${callAt} = ${numeric}${numeric === slopeT ? '' : ` = ${slopeT}`}` });
    }

    if (id === 'taylor') {
      d.derivs.forEach((v, j) => put(['slope', 'curvature', 'd3', 'd4'][j], v));
      let line = T`${nm.yNext} = ${yT} + ${hT}\cdot[${P.at(C.derivs[0], xN, yN)}]`;
      for (let j = 2; j <= C.order; j += 1) line += T` + \frac{(${hT})^{${j}}}{${j}!}\cdot[${P.at(C.derivs[j - 1], xN, yN)}]`;
      parts.push({ kind: 'replace', say: 'Reemplazando cada valor:', tex: line });
    } else if (id === 'euler') {
      parts.push({ kind: 'replace', say: 'Reemplazando cada valor:', tex: T`${nm.yNext} = ${yT} + ${hT}\cdot[${P.at(f, xN, yN)}]` });
    } else if (id === 'heun') {
      put('yPred', d.yPred);
      put('slopeEnd', d.slopeEnd);
      const slopeT = P.inter(d.slope);
      const predT = P.inter(d.yPred);
      parts.push({
        kind: 'predictor',
        say: T`El predictor (paso de Euler) es $${nm.y} + h\,${nm.yp} = ${yT} + ${hT}\cdot ${par(slopeT)} = ${predT}$ y la pendiente en $${nm.xNext}$ es:`,
        tex: `f(${nm.xNext}, ${predT}) = ${P.at(f, xN1, P.mid(d.yPred))} = ${P.inter(d.slopeEnd)}`,
      });
      const predictor = B.add([yN, B.mul([P.dat(h), P.mid(d.slope)])]);
      parts.push({
        kind: 'replace',
        say: 'Reemplazando cada valor:',
        tex: T`${nm.yNext} = ${yT} + \frac{${hT}}{2!}\cdot[(${P.at(f, xN, yN)}) + (${P.at(f, xN1, predictor)})]`,
      });
    } else {
      put('k1', d.k1);
      put('yMid', d.yMid);
      put('slopeMid', d.slopeMid);
      parts.push({ kind: 'where', say: 'Con:', tex: T`k_1 = h\cdot(${P.at(f, xs, ys)}) = ${hT}\cdot(${P.at(f, xN, yN)}) = ${P.inter(d.k1)}` });
      const xm = B.add([xN, B.div(P.dat(h), B.num(2))]);
      const ym = B.add([yN, B.div(P.mid(d.k1), B.num(2))]);
      parts.push({ kind: 'replace', say: 'Reemplazando cada valor:', tex: T`${nm.yNext} = ${yT} + ${hT}\cdot[${P.at(f, xm, ym)}]` });
    }

    parts.push({
      kind: 'result', tex: `${nm.yNext} = ${yNext} = y(${X}_${brace(k + 1)}) = y(${P.data(s.xn1)})`, highlight: true,
    });
    if (k === 0) parts.push(readingNote(C, ask));

    const { label, ordinal } = ordinalLabel(k);
    return {
      n: k, label, ordinal, x: s.xn, y: s.yn1, xNext: s.xn1, yText: showValue(s.yn1, C.o), values, valueTexts, parts,
    };
  }

  /* ======================================================================================================
     Summary table and verification
     ====================================================================================================== */

  function summaryColumns(C) {
    const X = C.X;
    switch (C.id) {
      case 'euler': return [{ key: 'slope', head: "y_n'" }];
      case 'taylor': {
        const keys = ['slope', 'curvature', 'd3', 'd4'];
        return Array.from({ length: C.order }, (v, j) => ({ key: keys[j], head: derivName('n', j + 1, X) }));
      }
      case 'heun': return [
        { key: 'slope', head: "y_n'" },
        { key: 'yPred', head: T`y_n + h\,y_n'` },
        { key: 'slopeEnd', head: T`f(${X}_{n+1},\ y_n + h\,y_n')` },
      ];
      default: return [
        { key: 'k1', head: 'k_1' },
        { key: 'yMid', head: 'y_n + k_1/2' },
        { key: 'slopeMid', head: T`f(${X}_n + h/2,\ y_n + k_1/2)` },
      ];
    }
  }

  function summarySection(C, iterations) {
    const columns = summaryColumns(C);
    const rows = [];
    for (let n = 0; n <= iterations.length; n += 1) {
      const it = iterations[n];
      const x = n === 0 ? C.problem.x0 : iterations[n - 1].xNext;
      const y = n === 0 ? C.problem.y0 : iterations[n - 1].y;
      rows.push({
        n,
        x,
        y,
        xText: format.num(x, { decimals: DATA_DECIMALS, mode: 'round' }),
        yText: n === 0 ? format.num(y, { decimals: DATA_DECIMALS, mode: 'round' }) : iterations[n - 1].yText,
        cells: it ? columns.map((c) => ({ key: c.key, value: it.values[c.key], text: it.valueTexts[c.key] })) : [],
      });
    }
    const last = rows[rows.length - 1];
    return {
      caption: 'Resumen de los valores de cada iteración',
      columns,
      rows,
      final: { n: last.n, x: last.x, y: last.y, xText: last.xText, yText: last.yText },
    };
  }

  function verificationSection(C, shown) {
    const { problem, sol, X } = C;
    const n = shown;
    const x = sol.xs[n];
    const y = sol.ys[n];
    const xText = format.num(x, { decimals: DATA_DECIMALS, mode: 'round' });
    const reference = !problem.exact;
    const exact = analysis.reference(problem, sol.xs.slice(0, n + 1))[n];
    const abs = Math.abs(y - exact);
    const rel = exact === 0 ? null : abs / Math.abs(exact);
    const pct = rel === null ? null : 100 * rel;
    const exactTex = reference ? null : problem.exact.tex;
    const say = reference
      ? 'Esta comprobación no figura en el apunte: este problema no tiene solución exacta conocida, así que el resultado se compara con una referencia numérica (RK4 con paso h/200).'
      : `Esta comprobación no figura en el apunte: compara el resultado con la solución exacta${exactTex ? ` $y(${X}) = ${exactTex}$` : ''}.`;
    const label = reference ? 'Valor de referencia' : 'Valor exacto';
    return {
      label: 'Verificación',
      extension: true,
      reference,
      kind: reference ? 'rk4' : 'exact',
      n,
      x,
      xText,
      exact,
      exactText: showValue(exact, C.o),
      exactTex,
      y,
      yText: showValue(y, C.o),
      abs,
      absText: significant(abs, 4),
      rel,
      relText: rel === null ? null : significant(rel, 4),
      pct,
      pctText: pct === null ? null : significant(pct, 4),
      say,
      parts: [{ kind: 'say', say }],
      rows: [
        { key: 'exact', label: `${label} $y(${xText})$`, text: showValue(exact, C.o) },
        { key: 'approx', label: `Valor obtenido $y_${brace(n)}$`, text: showValue(y, C.o) },
        { key: 'abs', label: 'Error absoluto', text: significant(abs, 4) },
        { key: 'rel', label: 'Error relativo', text: pct === null ? 'no definido' : `${significant(pct, 4)} %` },
      ],
    };
  }

  /* ======================================================================================================
     Assembly
     ====================================================================================================== */

  function noticeFor(o) {
    const unit = o.decimals === 1 ? '1 decimal' : `${o.decimals} decimales`;
    const tail = ' Los cálculos usan precisión completa: al reemplazar a mano los valores mostrados, el último decimal puede diferir.';
    if (o.mode === 'round') return `Los valores se muestran redondeados a ${unit}.${tail}`;
    return `Los valores se muestran truncados a ${unit}${o.decimals === 4 ? ', como en el apunte' : ''}.${tail}`
      + ' Un valor intermedio exacto con un decimal más se escribe completo.';
  }

  function asProblem(source) {
    if (source && typeof source === 'object' && typeof source.f === 'function') return source;
    if (typeof source === 'string' || (source && typeof source === 'object' && source.fStr !== undefined)) {
      return typeof source === 'string' ? problems.fromPreset(source) : problems.make(source);
    }
    throw new expr.EDOError('Falta el problema a resolver.');
  }

  function resolveOptions(problem, methodId, opts) {
    const given = opts || {};
    const d = displayOptions(given);
    const taylorOrder = Number.isInteger(given.order) ? given.order : (Number.isInteger(problem.order) ? problem.order : DEFAULTS.order);
    const method = methods.byId(methodId);
    return {
      mode: d.mode,
      decimals: d.decimals,
      order: method && method.id === 'taylor' ? taylorOrder : (method ? method.order : DEFAULTS.order),
      number: Number.isInteger(given.number) ? given.number : null,
      upTo: Number.isInteger(given.upTo) ? given.upTo : null,
      ask: given.ask === 'value' || given.ask === 'interval' ? given.ask : null,
    };
  }

  function assemble(problem, methodId, sol, o) {
    const C = makeContext(problem, methodId, sol, o);
    const ask = askOf(problem, o);
    const total = sol.N;
    const shown = o.upTo === null ? total : clamp(o.upTo, total > 0 ? 1 : 0, total);
    const iterations = Array.from({ length: shown }, (v, k) => iteration(C, k, ask));
    const partial = shown < total;
    const title = `${o.number === null ? '' : `Ejercicio nro ${o.number}: `}Resolver el siguiente problema de Valor Inicial aplicando el método de ${C.info.name}.`;
    const complete = !partial && !sol.diverged && shown === problem.N;
    return {
      title,
      number: o.number,
      method: C.info,
      problem: {
        id: problem.id,
        title: problem.title,
        indep: problem.indep,
        fTeX: C.P.tex(C.f, 'math'),
        x0: problem.x0,
        y0: problem.y0,
        xf: problem.xf,
        h: sol.h,
        N: problem.N,
        ask,
        exactTex: problem.exact ? problem.exact.tex : null,
      },
      options: Object.assign({}, o, { ask }),
      display: { mode: o.mode, decimals: o.decimals, notice: noticeFor(o) },
      partial,
      diverged: Boolean(sol.diverged),
      message: sol.message || '',
      statement: statementSection(C, ask),
      initial: initialSection(C),
      domain: domainSection(C, ask),
      abscissas: abscissasSection(C),
      generic: genericSection(C),
      iterations,
      closing: complete ? (ask === 'interval' ? CLOSING_INTERVAL : CLOSING_VALUE) : null,
      summary: summarySection(C, iterations),
      verification: shown >= 1 && !sol.diverged ? verificationSection(C, shown) : null,
    };
  }

  /**
   * The model of the solution of `problem` with the method `methodId`.
   * @param {object|string} problem A Problem, a preset id or a spec for `problems.make`.
   * @param {'euler'|'taylor'|'heun'|'rk2'} methodId
   * @param {object} [opts] See the header of this file.
   * @returns {object} The model.
   * @throws {EDOError} Spanish message for an unknown method, a wrong Taylor order or a missing problem.
   */
  function build(problem, methodId, opts) {
    const p = asProblem(problem);
    const o = resolveOptions(p, methodId, opts);
    return assemble(p, methodId, methods.solve(methodId, p, { order: o.order }), o);
  }

  /**
   * Convenience for the pages: resolves a preset id (or a Problem, or a spec), uses the preset's own method when
   * `methodId` is omitted (Taylor for a case without one) and returns everything needed to draw the exercise.
   * @returns {{problem: object, solution: object, model: object}}
   */
  function exercise(idOrProblem, methodId, opts) {
    const p = asProblem(idOrProblem);
    const id = methodId || p.method || 'taylor';
    const o = resolveOptions(p, id, opts);
    const solution = methods.solve(id, p, { order: o.order });
    return { problem: p, solution, model: assemble(p, id, solution, o) };
  }

  return {
    METHOD_IDS, DEFAULTS, INTERVAL_EXERCISES, build, exercise, showValue, showIntermediate,
  };
}));
