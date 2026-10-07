/**
 * EDO.compare.views - DOM builders of the Comparativa page. Everything is built through the injected `h`
 * (EDO.dom.h) and the Teoría kit (`kit.table`, `kit.methodChip`, number formats), so text never becomes markup.
 *
 *   sameTable(h, kit, result)    the four methods at x_f: value, errors, evaluations and a log-scale error bar
 *   ordersTable(h, kit, study)   observed order p per halving of h and the estimate (last pair)
 *   summaryTable(h, kit, rows)   order, evaluations per step, derivatives, work by hand
 *   linearTable(h, kit, demo)    y_n of the four methods on y' = λy next to the exact e^{λx}
 *   stat(h, label, value, note, hl)
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
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

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

  function summaryTable(h, kit, rows) {
    return kit.table({
      label: 'Resumen de los cuatro métodos: orden, evaluaciones por paso, derivadas y trabajo a mano',
      head: ['Método', { c: 'Orden global', num: true }, { c: 'Evaluaciones por paso', num: true, wrap: true }, '¿Necesita derivadas de f?', 'Trabajo a mano'],
      rows: rows.map((r) => [
        { c: kit.methodChip(r.id, r.label), row: true },
        { c: kit.im(r.order === 1 ? 'O(h)' : 'O(h^2)'), num: true },
        { c: String(r.perStep), num: true },
        r.derivatives ? 'Sí: ∂f/∂x y ∂f/∂y' : 'No',
        { c: r.byHand, wrap: true },
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
    barWidths, sameTable, ordersTable, summaryTable, linearTable, stat,
  };
}));
