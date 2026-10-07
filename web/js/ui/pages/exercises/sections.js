/**
 * EDO.exercises.sections - the header and the three sections of the Ejercicios page, built through the injected
 * `env` so that the same code runs in the browser (EDO.dom.h) and in the tests (a stand-in). Math is written as
 * `$...$` text (one formula per text node) and rendered by EDO.tex.hydrate; every number comes from
 * EDO.exercises.data.
 *
 * env contract (the page, exercises.js, implements it):
 *   h, kit, data                 EDO.dom.h, EDO.theory.kit.makeKit(h, format), EDO.exercises.data
 *   mode() / setMode(m)          the display mode ('trunc' | 'round'), and a way to change it
 *   onMode(fn)                   fn(mode) runs when the mode changes
 *   uid(prefix), hydrate(el)     unique ids and KaTeX rendering of an element
 *   whenOpen(details, fn)        runs fn once, when a <details> is (or becomes) open
 *   afterMount(fn)               runs fn once the page is attached to the document
 *   solution(host, id, method, {number})   mounts the step-by-step solution of a preset into host (follows the mode)
 *   chart(canvas, series, title)           draws a figure from EDO.exercises.data.chartSeries
 *   tabs(items, {label})         accessible tabs; each item {id, label, host, mount} mounts lazily on first show
 *   onRow(id, open)              registers the opener of a bank row (deep links)
 *
 * Load order: after data.js and theory/kit.js. Also `require`-able in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.exercises = EDO.exercises || {};
    EDO.exercises.sections = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NAV = Object.freeze([
    { slug: 'catedra', label: 'Ejercicios de la cátedra' },
    { slug: 'comparativo', label: 'Caso comparativo' },
    { slug: 'banco', label: 'Banco de práctica' },
  ]);

  const MODE_LABELS = Object.freeze({ trunc: 'Truncadas (como el apunte)', round: 'Redondeadas' });
  const ALL = 'all';

  /** Title block of a section: `<section id="ejercicios-<slug>">` with its h2. */
  function section(h, slug, title, ...children) {
    return h('section', { id: `ejercicios-${slug}`, class: 'exercises-section', 'aria-labelledby': `ejercicios-${slug}-title` },
      h('h2', { id: `ejercicios-${slug}-title` }, title),
      ...children);
  }

  /** Single-choice `.segmented` group of radio inputs. `options`: [{value, label}]; `onPick(value)` on change. */
  function segmented(env, label, options, current, onPick) {
    const { h } = env;
    const groupId = env.uid('ej-radio');
    const inputs = {};
    const radio = (opt) => {
      const input = h('input', {
        type: 'radio', name: groupId, value: opt.value, checked: current === opt.value, onchange: () => { if (input.checked) onPick(opt.value); },
      });
      inputs[opt.value] = input;
      return h('label', null, input, h('span', null, opt.label));
    };
    const element = h('div', { class: 'field' },
      h('span', { class: 'field__label', id: `${groupId}-label` }, label),
      h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': `${groupId}-label` }, options.map(radio)));
    return { element, set: (value) => { Object.keys(inputs).forEach((key) => { inputs[key].checked = key === value; }); } };
  }

  /* ======================================================================================================
     Header: title, how to read, the "Cifras" control and the in-page navigation
     ====================================================================================================== */

  function header(env) {
    const { h, kit, data } = env;
    const notice = data.modeNotice();
    const noticeEl = h('p', { class: 'muted exercises__notice' }, notice[env.mode()]);
    const control = segmented(env, 'Cifras de los valores', [
      { value: 'trunc', label: MODE_LABELS.trunc }, { value: 'round', label: MODE_LABELS.round },
    ], env.mode(), (value) => env.setMode(value));
    env.onMode((mode) => {
      control.set(mode);
      noticeEl.replaceChildren(notice[mode]);
    });
    return h('header', { class: 'exercises__head' },
      h('h1', null, 'Ejercicios'),
      h('p', { class: 'lead' }, 'Los ejercicios resueltos del apunte, un caso comparativo con los tres métodos y el banco de práctica de las guías, todos resueltos paso a paso con el mismo motor de cálculo que usa el simulador.'),
      kit.callout({ kind: 'note', label: 'Cómo leer esta página' },
        h('p', null, 'Cada resolución sigue el formato del apunte: enunciado, condición inicial y dominio, Ordenada Genérica y una iteración por vez. El fondo amarillo marca la fórmula general y el valor que se anota. Lo que lleva la etiqueta ', kit.badge('Ampliación'),
          ' (la verificación contra la solución exacta, los gráficos y los errores) no figura en el apunte.')),
      h('div', { class: 'exercises__controls' }, control.element, noticeEl),
      h('nav', { class: 'exercises__nav', 'aria-label': 'Secciones de ejercicios' },
        h('ul', { class: 'cluster', role: 'list' }, NAV.map((item) => h('li', null, h('a', { href: `#/ejercicios/${item.slug}` }, item.label))))));
  }

  /* ======================================================================================================
     A. The four solved examples of the apunte
     ====================================================================================================== */

  function notesList(h, notes) {
    return notes && notes.length
      ? h('ul', { class: 'exercise-notes muted' }, notes.map((text) => h('li', null, text)))
      : null;
  }

  function card(env, e, open) {
    const { h, kit } = env;
    const solutionHost = h('div', { class: 'exercise-card__solution' });
    const canvas = h('canvas');
    const figure = h('figure', { class: 'chart exercise-card__chart' },
      h('div', { class: 'chart-box' }, canvas),
      h('figcaption', null, `Solución numérica (${e.methodName}) y solución exacta de $${e.pvi.f}$, $${e.pvi.ic}$, con $${e.pvi.h}$.`));
    const body = h('div', { class: 'exercise-card__body' },
      notesList(h, e.notes),
      solutionHost,
      figure,
      h('p', { class: 'exercise-card__actions' }, h('a', { class: 'btn', href: `#/simulador?preset=${e.id}` }, 'Abrir en el simulador')));
    const details = h('details', { class: 'exercise-card', id: `ejercicios-${e.slug}`, open: open ? true : null },
      h('summary', { class: 'exercise-card__summary' },
        h('span', { class: 'exercise-card__head' },
          h('span', { class: 'exercise-card__title' }, `Ejercicio ${e.number}`),
          kit.methodChip(e.methodId, e.chip)),
        h('span', { class: 'exercise-card__pvi' }, `$${e.pvi.f}$, $${e.pvi.h}$, $${e.pvi.ic}$. Se pide $${e.pvi.ask}$.`)),
      body);
    env.whenOpen(details, () => {
      env.solution(solutionHost, e.id, e.methodId, { number: e.number });
      env.chart(canvas, e.series, `Solución de ${e.methodName} y solución exacta`);
      env.hydrate(figure);
    });
    return details;
  }

  function catedra(env) {
    const { h, data } = env;
    const entries = data.catedra();
    return section(h, 'catedra', 'Ejercicios resueltos de la cátedra',
      h('div', { class: 'prose' },
        h('p', null, 'Son los cuatro ejemplos del apunte, uno por método: Taylor de grado 2, Euler, Euler Mejorado y RK de grado 2 (punto medio). Cada tarjeta se abre para ver la resolución completa, con el formato que se pide en clase, y el gráfico de la solución numérica contra la exacta.')),
      h('div', { class: 'exercise-cards' }, entries.map((e, i) => card(env, e, i === 0))));
  }

  /* ======================================================================================================
     B. The comparative case
     ====================================================================================================== */

  function comparisonTable(env, cmp) {
    const { h, kit, data } = env;
    const mode = env.mode();
    const rows = cmp.rows.map((r) => ({
      hl: r.id === cmp.best,
      cells: [
        { c: kit.methodChip(r.id, r.chip), row: true },
        { c: data.show(r.y, mode, 6), num: true },
        { c: data.showError(r.error), num: true },
        { c: data.showPercent(r.relative), num: true },
        { c: String(r.evals), num: true },
      ],
    }));
    rows.push({
      cells: [{ c: 'Solución exacta', row: true }, { c: data.show(cmp.exact, 'round', 6), num: true }, '', '', ''],
    });
    return kit.table({
      label: 'Comparación de los cuatro métodos en el caso comparativo',
      caption: `Valores en el extremo del intervalo con $${cmp.pvi.h}$. Está resaltado el método de segundo orden más cercano al valor exacto.`,
      head: ['Método', { c: `$${cmp.pvi.ask}$`, num: true }, { c: '|error|', num: true }, { c: 'Error relativo (%)', num: true }, { c: 'Evaluaciones por paso', num: true }],
      rows,
    });
  }

  function closing(env, cmp) {
    const { h, kit, data } = env;
    const c = cmp.closing;
    const e = (r) => data.showError(r.error);
    return h('div', { class: 'prose exercise-compare__closing' },
      h('p', null,
        `Con $${cmp.pvi.h}$, el método de segundo orden que queda más cerca del valor exacto $${cmp.pvi.ask} = ${data.show(cmp.exact, 'round', 6)}$ es `,
        h('strong', null, c.closest.name), ` (error ${e(c.closest)}), seguido por ${c.middle.name} (${e(c.middle)}) y ${c.farthest.name} (${e(c.farthest)}). `,
        `Euler, de primer orden, se equivoca ${e(c.euler)}`,
        c.gainOverEuler ? `: unas ${data.show(c.gainOverEuler, 'round', 1)} veces más que el mejor de los tres.` : '.'),
      h('p', null,
        'Los tres tienen el mismo orden de error global, $O(h^2)$, así que cuál queda más cerca depende del problema: lo que cambia es la constante del error local, no el orden. Se explica en ',
        kit.link('#/teoria/error', 'Teoría: error y orden'), ' y se mide en la ', kit.link('#/comparativa', 'Comparativa'), '.'));
  }

  function comparativo(env) {
    const { h, data } = env;
    const cmp = data.comparison();
    const tableHost = h('div', { class: 'exercise-compare__table' }, comparisonTable(env, cmp));
    env.onMode(() => {
      tableHost.replaceChildren(comparisonTable(env, cmp));
      env.hydrate(tableHost);
    });

    const canvas = h('canvas');
    const figure = h('figure', { class: 'chart exercise-compare__chart' },
      h('div', { class: 'chart-box' }, canvas),
      h('figcaption', null, `Solución exacta y los cuatro métodos para $${cmp.pvi.f}$, $${cmp.pvi.ic}$, con $${cmp.pvi.h}$.`));
    env.afterMount(() => {
      env.chart(canvas, cmp.series, 'Solución exacta y los cuatro métodos');
      env.hydrate(figure);
    });

    const tabMethods = ['taylor', 'heun', 'rk2'];
    const tabs = env.tabs(tabMethods.map((id) => {
      const host = h('div', { class: 'exercise-compare__solution' });
      return { id, label: data.METHOD_NAMES[id], host, mount: () => env.solution(host, data.COMPARE_ID, id, {}) };
    }), { label: 'Resolución paso a paso por método' });

    return section(h, 'comparativo', 'Caso comparativo',
      h('div', { class: 'prose' },
        h('p', null, `Es el mismo problema de los Ejemplos 1 y 4 del apunte, $${cmp.pvi.f}$ con $${cmp.pvi.ic}$ y $${cmp.pvi.h}$, ahora resuelto con los tres métodos de segundo orden y con Euler como referencia. Se pide $${cmp.pvi.ask}$.`)),
      tableHost,
      figure,
      closing(env, cmp),
      h('h3', { class: 'exercise-compare__subtitle' }, 'Resolución paso a paso'),
      tabs);
  }

  /* ======================================================================================================
     C. The practice bank
     ====================================================================================================== */

  const BANK_COLUMNS = 9;

  function bankRow(env, r, state) {
    const { h, kit, data } = env;
    const detailId = `ejercicios-${r.slug}-detalle`;
    const resultCell = h('td', { class: 'num' }, data.show(r.y, env.mode(), 6));
    const exactNote = r.exactKind === 'exacta' ? null : h('span', { class: 'muted exercises-bank__flag' }, 'referencia RK4');
    const exactCell = h('td', { class: 'num' }, data.show(r.exact, 'round', 6), exactNote ? [h('br'), exactNote] : null);
    env.onMode((mode) => resultCell.replaceChildren(data.show(r.y, mode, 6)));

    const host = h('div', { class: 'exercises-bank__solution' });
    const detail = h('tr', { class: 'exercises-bank__detail', id: detailId, hidden: true },
      h('td', { colspan: BANK_COLUMNS }, h('div', { class: 'exercises-bank__detail-body' }, notesList(h, r.notes), host)));
    const button = h('button', {
      type: 'button', class: 'btn btn--small', 'aria-expanded': 'false', 'aria-controls': detailId, onclick: () => toggle(),
    }, 'Resolver paso a paso');

    function toggle(force) {
      const open = force === undefined ? detail.hidden === true : Boolean(force);
      state.open = open;
      detail.hidden = !open || row.hidden === true;
      button.setAttribute('aria-expanded', String(open));
      button.replaceChildren(open ? 'Ocultar la resolución' : 'Resolver paso a paso');
      if (open && !state.mounted) {
        state.mounted = true;
        env.solution(host, r.id, r.methodId, {});
      }
    }

    const row = h('tr', { class: 'exercises-bank__row', id: `ejercicios-${r.slug}`, 'data-group': r.group, 'data-method': r.methodId },
      h('th', { scope: 'row', class: 'wrap' }, r.source, r.notes && r.notes.length ? [' ', kit.badge('Nota')] : null),
      h('td', { class: 'wrap' }, `$${r.pvi.f}$`, h('br'), `$${r.pvi.ic}$`),
      h('td', null, kit.methodChip(r.methodId, r.chip)),
      h('td', { class: 'num' }, `${r.pvi.h.replace(/^h = /, '')} · ${r.n}`),
      h('td', { class: 'num' }, `$${r.ask}$`),
      resultCell,
      exactCell,
      h('td', { class: 'num' }, data.showError(r.error)),
      h('td', { class: 'exercises-bank__actions' },
        h('div', { class: 'stack', style: { '--gap': '0.375rem' } },
          button,
          h('a', { class: 'btn btn--small', href: `#/simulador?preset=${r.id}` }, 'Abrir en el simulador'))));
    env.onRow(r.id, () => toggle(true));
    return { row, detail, state, toggle };
  }

  function banco(env) {
    const { h, data } = env;
    const rows = data.bankRows();
    const filters = data.bankFilters(rows);
    const items = rows.map((r) => bankRow(env, r, { open: false, mounted: false }));
    const status = h('p', { class: 'muted', role: 'status' }, `Mostrando ${rows.length} de ${rows.length} ejercicios.`);
    const filter = { group: ALL, method: ALL };

    function apply() {
      let shown = 0;
      items.forEach((item, i) => {
        const r = rows[i];
        const visible = (filter.group === ALL || r.group === filter.group) && (filter.method === ALL || r.methodId === filter.method);
        item.row.hidden = !visible;
        item.detail.hidden = !(visible && item.state.open);
        if (visible) shown += 1;
      });
      status.replaceChildren(`Mostrando ${shown} de ${rows.length} ejercicios.`);
    }

    const groupFilter = segmented(env, 'Práctica',
      [{ value: ALL, label: 'Todas' }].concat(filters.groups.map((g) => ({ value: g.id, label: g.label }))), ALL,
      (value) => { filter.group = value; apply(); });
    const methodFilter = segmented(env, 'Método',
      [{ value: ALL, label: 'Todos' }].concat(filters.methods.map((m) => ({ value: m.id, label: m.label }))), ALL,
      (value) => { filter.method = value; apply(); });

    const heads = ['Ejercicio', 'PVI', 'Método', 'h · n', 'Se pide', 'Resultado', 'Exacto', '|error|', ''];
    const nums = [false, false, false, true, true, true, true, true, false];
    const table = h('table', { class: 'exercises-bank' },
      h('caption', { class: 'sr-only' }, 'Banco de ejercicios de las prácticas 05 y 06'),
      h('thead', null, h('tr', null, heads.map((text, i) => h('th', { scope: 'col', class: nums[i] ? 'num' : null }, text || h('span', { class: 'sr-only' }, 'Acciones'))))),
      h('tbody', null, items.map((item) => [item.row, item.detail])));

    return section(h, 'banco', 'Banco de práctica',
      h('div', { class: 'prose' },
        h('p', null, 'Todos los ejercicios de las prácticas 05 y 06 que se resuelven con Taylor, Euler, Euler Mejorado y RK2, con el método que pide cada guía. El resultado se compara con la solución exacta cuando existe y, si no, con una referencia numérica (RK4 con paso h/200). Cada fila se resuelve paso a paso en el formato del apunte o se abre en el simulador para cambiar los datos.')),
      h('div', { class: 'exercises-bank__filters cluster' }, groupFilter.element, methodFilter.element),
      status,
      h('div', { class: 'table-wrap exercises-bank__wrap', role: 'region', tabindex: '0', 'aria-label': 'Banco de ejercicios de práctica' }, table));
  }

  /** The sections in page order (the page builds them in this order). */
  const SECTIONS = Object.freeze([
    { id: 'catedra', title: 'Ejercicios resueltos de la cátedra', build: catedra },
    { id: 'comparativo', title: 'Caso comparativo', build: comparativo },
    { id: 'banco', title: 'Banco de práctica', build: banco },
  ]);

  return {
    NAV, MODE_LABELS, SECTIONS, header, catedra, comparativo, banco, card, bankRow, comparisonTable,
  };
}));
