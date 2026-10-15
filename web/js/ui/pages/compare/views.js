/**
 * EDO.compare.views - DOM builders of the Comparativa page. Everything is built through the injected `h`
 * (EDO.dom.h) and the Teoría kit (`kit.table`, `kit.methodChip`, number formats), so text never becomes markup.
 *
 *   sameTable(h, kit, result)    the four methods at x_f: value, errors, evaluations and a log-scale error bar
 *   convergenceTable(h, kit, study)              error at x_f for every step h of the study (what the chart draws)
 *   ordersTable(h, kit, study)   observed order p per halving of h and the estimate (last pair)
 *   orderTable(h, kit, rows)     local error, global error and the factor 2^p of halving h, per method
 *   costTable(h, kit, rows)      evaluations of f and of partial derivatives per step (Taylor of degree 2, 3, 4)
 *   taylorDegreesTable(h, kit, t)                what a higher Taylor degree buys: y_1 and the error of one step
 *   familyTable(h, kit, members)                 the members of the RK2 family, their weights and their name
 *   summaryTable(h, kit, rows)   Ordenada Genérica, order, evaluations per step, derivatives, work by hand, apunte
 *   overviewTable(h, kit, list, fTeX)            the catalogue of comparison cases: value of each method and the closest
 *   stepFormulaTable(h, kit, coef)               the one-step error of each method in terms of F2 and f_y D
 *   constantsTable(h, kit, c, coef)              constant C, the predicted C·h³ and the error a real step commits
 *   ratiosTable(h, kit, c)                       measured error divided by C·h³ for several h: it tends to 1
 *   constantsOverviewTable(h, kit, list, fTeX)   F2, f_y D and the three constants of every comparison case
 *   stabilityTable(h, kit, rows)                 R(z) of the four methods for several z = hλ and the verdict
 *   linearTable(h, kit, demo)    y_n of the four methods on y' = λy next to the exact e^{λx}
 *   stat(h, label, value, note, hl)
 *
 * `coef` is `{taylor, rk2, heun}` of `{f2, fyd}` TeX fractions, built by the caller from kit.familyMember so the
 * coefficients come from the order conditions of the RK2 family and not from a typed string. `fTeX(problem)`
 * renders a problem's right-hand side (the caller injects EDO.expr, like `h` and `kit`).
 *
 * Load order: after compare/model.js and theory/kit.js, before compare.js. Also `require`-able in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.compare = EDO.compare || {};
    EDO.compare.views = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DASH = '—';
  const SECOND = ['taylor', 'rk2', 'heun'];
  /** What the verdict of a stability row says in the table. */
  const VERDICT = { decae: 'decae (estable)', limite: 'en el límite', crece: 'crece (inestable)' };
  /** The separator theory/data.js puts between an Ordenada Genérica and the definition that follows it. */
  const AND = ', \\qquad ';
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const orderTeX = (order) => (order === 1 ? 'O(h)' : `O(h^{${order}})`);

  /**
   * Length (% of the bar track) of each error bar: log10 of the error mapped onto [12, 100] over the errors of the
   * table. The page passes it to CSS as the fraction `--w` (a percentage of an auto-sized cell would collapse).
   */
  function barWidths(rows) {
    const logs = rows.map((r) => (finite(r.abs) && r.abs > 0 ? Math.log10(r.abs) : null));
    const known = logs.filter((v) => v !== null);
    if (!known.length) return logs.map(() => null);
    const hi = Math.max(...known);
    const lo = Math.min(...known) - 0.5;
    return logs.map((v) => (v === null ? null : (hi === lo ? 100 : 12 + (88 * (v - lo)) / (hi - lo))));
  }

  function sameTable(h, kit, result) {
    const xf = kit.plain(result.problem.xf, 6);
    const widths = barWidths(result.rows);
    const ref = result.reference;
    const refRow = {
      cells: [
        { c: kit.methodChip('exact', ref.label), row: true },
        { c: kit.fixed(ref.value, 6), num: true },
        { c: DASH, num: true }, { c: DASH, num: true }, { c: DASH, num: true }, { c: DASH, num: true }, '',
      ],
    };
    const rows = result.rows.map((r, i) => ({
      hl: r.best,
      cells: [
        {
          c: [kit.methodChip(r.id, r.label), r.baseline ? [' ', kit.badge('Línea de base')] : null, r.best ? [' ', kit.badge('Más cercano', 'course')] : null],
          row: true,
        },
        { c: finite(r.y) ? kit.fixed(r.y, 6) : 'diverge', num: true },
        { c: finite(r.abs) ? kit.sci(r.abs, 3) : DASH, num: true },
        { c: finite(r.rel) ? kit.sci(r.rel, 3) : DASH, num: true },
        { c: String(r.perStep), num: true },
        { c: String(r.total), num: true },
        widths[i] === null ? '' : h('span', {
          class: 'cmp-bar', 'data-method': r.id, 'aria-hidden': 'true', style: { '--w': (widths[i] / 100).toFixed(3) },
        }),
      ],
    }));
    return kit.table({
      label: `Valores en x = ${xf} con h = ${result.h}: método, y(${xf}), errores y evaluaciones`,
      head: ['Método', { c: `y(${xf})`, num: true }, { c: 'Error absoluto', num: true }, { c: 'Error relativo', num: true },
        { c: 'Evaluaciones por paso', num: true, wrap: true }, { c: 'Evaluaciones totales', num: true, wrap: true },
        { c: 'Error (escala log.)', wrap: true }],
      rows: [refRow].concat(rows),
    });
  }

  /** The error at x_f of each method for every step of the study: the numbers the log-log chart draws. */
  function convergenceTable(h, kit, study) {
    const ids = Object.keys(study.estimate);
    return kit.table({
      label: 'Error en el punto final para cada paso h del estudio',
      head: [{ c: kit.im('h') }, { c: kit.im('N'), num: true }]
        .concat(ids.map((id) => ({ c: kit.methodChip(id), num: true }))),
      rows: study.hs.map((hh, k) => [
        { c: kit.plain(hh, 6), row: true, num: true },
        { c: String(study.Ns[k]), num: true },
      ].concat(ids.map((id) => {
        const e = study.errors[id][k];
        return { c: e === null || !finite(e) ? DASH : kit.sci(e, 3), num: true };
      }))),
    });
  }

  function ordersTable(h, kit, study) {
    const ids = Object.keys(study.estimate);
    const pText = (p) => (p === null || !finite(p) ? DASH : kit.fixed(p, 2));
    const rows = study.hs.slice(0, -1).map((hh, k) => ({
      cells: [{ c: `${hh} → ${study.hs[k + 1]}`, row: true, num: true }].concat(ids.map((id) => ({ c: pText(study.orders[id][k]), num: true }))),
    }));
    rows.push({
      hl: true,
      cells: [{ c: 'Estimación (último par)', row: true }].concat(ids.map((id) => ({ c: pText(study.estimate[id]), num: true }))),
    });
    return kit.table({
      label: 'Orden observado p = log2(e(h) / e(h/2)) en cada reducción del paso',
      head: [{ c: 'Paso h → h/2', num: true }].concat(ids.map((id) => ({ c: kit.methodChip(id), num: true }))),
      rows,
    });
  }

  /** Local error, global error and the factor by which halving h divides the global error. */
  function orderTable(h, kit, rows) {
    return kit.table({
      label: 'Orden de cada método: error local, error global y efecto de reducir h a la mitad',
      head: ['Método', { c: 'Error local', num: true }, { c: 'Error global', num: true },
        { c: 'Si h se reduce a la mitad, el error global se divide por', num: true, wrap: true }],
      rows: rows.map((r) => [
        { c: kit.methodChip(r.id, r.label), row: true },
        { c: kit.im(`O(h^{${r.localOrder}})`), num: true },
        { c: kit.im(orderTeX(r.order)), num: true },
        { c: String(r.halving), num: true },
      ]),
    });
  }

  /** Evaluations of f and of partial derivatives per step, with Taylor of every degree of the catalogue. */
  function costTable(h, kit, rows) {
    return kit.table({
      label: 'Evaluaciones de f y de derivadas parciales por paso de cada método',
      head: ['Método', { c: kit.im('f'), num: true }, { c: 'Derivadas', num: true },
        { c: 'Total por paso', num: true }, '¿Hay que derivar f a mano?'],
      rows: rows.map((r) => [
        { c: kit.methodChip(r.id, r.label), row: true },
        { c: String(r.f), num: true },
        { c: String(r.deriv), num: true },
        { c: String(r.total), num: true },
        { c: r.derivatives ? ['Sí: ', kit.im('f_x'), ' y ', kit.im('f_y')] : 'No', wrap: true },
      ]),
    });
  }

  /** What a higher Taylor degree buys: y_1 after one step and the error of that step, with the exact value below. */
  function taylorDegreesTable(h, kit, t) {
    const rows = t.rows.map((r) => [
      { c: `Grado ${r.order}`, row: true },
      { c: kit.fixed(r.y1, 6), num: true },
      { c: kit.sci(r.error, 4), num: true },
    ]);
    rows.push([{ c: 'Solución exacta', row: true }, { c: kit.fixed(t.exact, 6), num: true }, { c: DASH, num: true }]);
    return kit.table({
      label: 'Taylor de grado 2, 3 y 4: valor de y1 tras un paso y su error',
      head: ['Método', { c: kit.im('y_1'), num: true }, { c: 'Error en un paso', num: true }],
      rows,
    });
  }

  /** The members of the two-stage RK2 family: their weights as exact fractions and their name in the apunte. */
  function familyTable(h, kit, members) {
    return kit.table({
      label: 'Miembros de la familia RK2: parámetros y nombre en el apunte',
      head: ['Método', { c: kit.im('a_1'), num: true }, { c: kit.im('a_2'), num: true },
        { c: kit.im('p = q'), num: true }, 'Nombre en el apunte'],
      rows: members.map((m) => [
        { c: m.id ? kit.methodChip(m.id, m.label) : m.label, row: true },
        { c: kit.im(m.a1), num: true },
        { c: kit.im(m.a2), num: true },
        { c: kit.im(m.p), num: true },
        { c: m.apunte || 'No figura en el apunte', wrap: true },
      ]),
    });
  }

  /**
   * The Ordenada Genérica for a table cell: the formula, with a trailing definition (the k1 of RK2) on a
   * second line, so the column does not grow to the width of both.
   */
  function genericCell(h, kit, tex) {
    const cut = tex.indexOf(AND);
    return cut < 0 ? kit.im(tex) : [kit.im(tex.slice(0, cut)), h('br'), 'con ', kit.im(tex.slice(cut + AND.length))];
  }

  function summaryTable(h, kit, rows) {
    return kit.table({
      label: 'Resumen de los cuatro métodos: Ordenada Genérica, orden, evaluaciones por paso, derivadas, trabajo a mano y ejemplo del apunte',
      head: ['Método', 'Ordenada Genérica', { c: 'Orden global', num: true },
        { c: 'Evaluaciones por paso', num: true, wrap: true }, '¿Necesita derivadas de f?', 'Trabajo a mano', 'En el apunte'],
      rows: rows.map((r) => [
        { c: kit.methodChip(r.id, r.label), row: true },
        { c: genericCell(h, kit, r.generic), nowrap: true },
        { c: kit.im(orderTeX(r.order)), num: true },
        { c: String(r.perStep), num: true },
        r.derivatives ? 'Sí: ∂f/∂x y ∂f/∂y' : 'No',
        { c: r.byHand, wrap: true },
        { c: r.apunte, wrap: true },
      ]),
    });
  }

  /** The catalogue of comparison cases at their own h: value of each method, reference and the closest of the three. */
  function overviewTable(h, kit, list, fTeX) {
    return kit.table({
      label: 'Valor final de cada método y solución exacta en cada caso del catálogo',
      head: ['Problema', { c: kit.methodChip('euler'), num: true }, { c: kit.methodChip('taylor'), num: true },
        { c: kit.methodChip('heun'), num: true }, { c: kit.methodChip('rk2'), num: true },
        { c: 'Exacta', num: true }, 'Más cercano'],
      rows: list.map((w) => {
        const cell = (id) => {
          const text = kit.fixed(w.values[id], 6);
          return {
            c: id === w.bestId
              ? [h('mark', { class: 'hl' }, text), h('span', { class: 'sr-only' }, ' (el más cercano de los tres de orden 2)')]
              : text,
            num: true,
          };
        };
        return [
          {
            c: [kit.im(`y' = ${fTeX(w.problem)}`), ', ', kit.im(`y(${kit.plain(w.problem.x0, 6)}) = ${kit.plain(w.problem.y0, 6)}`),
              ', ', kit.im(`x_f = ${kit.plain(w.xf, 6)}`)],
            row: true,
            wrap: true,
          },
          { c: kit.fixed(w.values.euler, 6), num: true },
          cell('taylor'), cell('heun'), cell('rk2'),
          { c: kit.fixed(w.reference, 6), num: true },
          { c: kit.methodChip(w.bestId) },
        ];
      }),
    });
  }

  /** The one-step error of each second-order method written in terms of F2 and f_y D, with exact fractions. */
  function stepFormulaTable(h, kit, coef) {
    return kit.table({
      label: 'Error de un paso de cada método de orden 2 en función de F2 y fy D',
      head: ['Método', ['Error de un paso, más términos de orden ', kit.im('h^{4}'), ' y superiores']],
      rows: SECOND.map((id) => [
        { c: kit.methodChip(id), row: true },
        { c: kit.im(`h^{3}\\Bigl(${coef[id].f2}\\,F_2 + ${coef[id].fyd}\\,f_y D\\Bigr)`), wrap: true },
      ]),
    });
  }

  /** Constant C of the leading term, the value C·h³ it predicts and the error a real step of that h commits. */
  function constantsTable(h, kit, c, coef) {
    const exact = (id) => (Number.isInteger(c.F2) && Number.isInteger(c.fyD)
      ? `${coef[id].f2}\\cdot ${c.F2} + ${coef[id].fyd}\\cdot ${c.fyD} = `
      : '');
    return kit.table({
      label: 'Constante C, valor predicho C por h al cubo y error medido de un paso',
      head: ['Método', ['Constante ', kit.im('C')], { c: kit.im('C\\,h^{3}'), num: true }, { c: 'Error medido', num: true }],
      rows: SECOND.map((id) => [
        { c: kit.methodChip(id), row: true },
        { c: kit.im(`${exact(id)}${kit.plain(c.values[id], 4)}`), wrap: true },
        { c: kit.sci(c.predicted[id], 4), num: true },
        { c: kit.sci(c.measured[id], 4), num: true },
      ]),
    });
  }

  /** Measured error divided by C·h³ for several h: the h⁴ and higher terms lose weight, so the quotient tends to 1. */
  function ratiosTable(h, kit, c) {
    return kit.table({
      label: 'Cociente entre el error medido de un paso y C por h al cubo, para varios h',
      caption: ['Error medido dividido por ', kit.im('C\\,h^{3}'), ', para varios ', kit.im('h'), '.'],
      head: [{ c: kit.im('h') }].concat(SECOND.map((id) => ({ c: kit.methodChip(id), num: true }))),
      rows: c.ratios.map((row) => [{ c: kit.plain(row.h, 6), row: true, num: true }]
        .concat(SECOND.map((id) => ({ c: row[id] === null ? DASH : kit.fixed(row[id], 3), num: true })))),
    });
  }

  /** F2, f_y D and the three constants at (x0, y0) of every comparison case: the winner is a property of the problem. */
  function constantsOverviewTable(h, kit, list, fTeX) {
    return kit.table({
      label: 'Constantes del error local en el punto inicial de cada caso comparativo',
      head: ['Problema', { c: kit.im('(x_0, y_0)'), num: true }, { c: kit.im('F_2'), num: true },
        { c: kit.im('f_y D'), num: true }].concat(SECOND.map((id) => ({ c: kit.methodChip(id), num: true })),
        ['Menor |C|']),
      rows: list.map((row) => [
        { c: kit.im(`y' = ${fTeX(row.problem)}`), row: true, wrap: true },
        { c: kit.im(`(${kit.plain(row.x0, 4)}, ${kit.plain(row.y0, 4)})`), num: true },
        { c: kit.plain(row.F2, 4), num: true },
        { c: kit.plain(row.fyD, 4), num: true },
      ].concat(SECOND.map((id) => ({ c: kit.plain(row.values[id], 4), num: true })),
        [{ c: kit.methodChip(row.smallest) }])),
    });
  }

  /** R(z) of the four methods for several z = hλ, measured by running them, with the verdict of each row. */
  function stabilityTable(h, kit, rows) {
    return kit.table({
      label: 'Factor R(z) por el que cada método multiplica a y_n en un paso de y\' = lambda y',
      caption: ['Factor ', kit.im('R(z)'), ' por el que un paso multiplica a ', kit.im('y_n'),
        ', calculado ejecutando los cuatro métodos con ', kit.im('h = 0.1'), ' y ', kit.im('\\lambda = z/h'), '.'],
      head: [{ c: kit.im('z = h\\lambda') }, { c: kit.methodChip('euler'), num: true }, { c: kit.methodChip('taylor'), num: true },
        { c: kit.methodChip('heun'), num: true }, { c: kit.methodChip('rk2'), num: true }, 'Resultado'],
      rows: rows.map((row) => [
        { c: kit.im(`z = ${kit.plain(row.z, 4)}`), row: true },
        { c: kit.fixed(row.euler, 4), num: true },
        { c: kit.fixed(row.taylor, 4), num: true },
        { c: kit.fixed(row.heun, 4), num: true },
        { c: kit.fixed(row.rk2, 4), num: true },
        { c: VERDICT[row.verdict] || row.verdict, wrap: true },
      ]),
    });
  }

  function linearTable(h, kit, demo, labels) {
    const ids = Object.keys(demo.ys);
    return kit.table({
      label: `Valores de y_n con λ = ${demo.lambda} y h = ${demo.h}`,
      head: [{ c: 'n', num: true }, { c: 'x', num: true }, { c: kit.methodChip('exact', 'Exacta'), num: true }]
        .concat(ids.map((id) => ({ c: kit.methodChip(id, labels[id]), num: true }))),
      rows: demo.xs.map((x, n) => [
        { c: String(n), row: true, num: true },
        { c: kit.plain(x, 4), num: true },
        { c: kit.fixed(demo.exact[n], 6), num: true },
      ].concat(ids.map((id) => ({ c: kit.fixed(demo.ys[id][n], 6), num: true })))),
    });
  }

  function stat(h, label, value, note, hl) {
    return h('div', { class: 'stat', 'data-hl': hl ? 'true' : null },
      h('span', { class: 'stat__label' }, label),
      h('span', { class: 'stat__value' }, value),
      note ? h('span', { class: 'stat__note' }, note) : null);
  }

  return {
    barWidths, sameTable, convergenceTable, ordersTable, orderTable, costTable, taylorDegreesTable, familyTable,
    genericCell, summaryTable, overviewTable, stepFormulaTable, constantsTable, ratiosTable,
    constantsOverviewTable, stabilityTable, linearTable, stat,
  };
}));
