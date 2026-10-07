/**
 * EDO.simulator.views - the small DOM builders of the Simulador page: a labelled field with its error line, a
 * segmented radio group and the results/errors tables. Everything is built through the injected `h`
 * (EDO.dom.h), so text never becomes markup.
 *
 *   field(h, uid, {label, input, hint}) -> {element, setError(err|null), setHint(text)}
 *   segmented(h, uid, label, options, current, onPick) -> {element, set(value)}
 *   table(h, kit, data, {label, caption, maxRows}) -> Node     data: {groups, columns, rows} of simulator/state.js
 *   heading(h, column) -> Node[]                                the text of a column head: x, n+1/2, y', k1 ...
 *
 * Load order: after state.js, before simulator.js. Also `require`-able in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.simulator = EDO.simulator || {};
    EDO.simulator.views = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRIME = { "'": '′', "''": '″', "'''": '‴' };
  /** Rows shown before the table is cut to its beginning and its last row (the CSV always has every row). */
  const MAX_ROWS = 200;

  /** The text of a column head as nodes: `y` + subscript `n` + the prime marks. */
  function heading(h, column) {
    const out = [column.text];
    if (column.sub) out.push(h('sub', null, column.sub));
    if (column.sup) out.push(column.sup.charAt(0) === '(' ? h('sup', null, column.sup) : (PRIME[column.sup] || column.sup));
    return out;
  }

  /**
   * A `.field` with a label, a control, an optional hint and an error line. The control gets
   * `aria-describedby` pointing at the hint and the error, and `aria-invalid` while there is an error.
   */
  function field(h, uid, spec) {
    const id = uid('sim-field');
    const control = spec.input;
    if (!control.id) control.id = id;
    const hintId = `${id}-hint`;
    const errId = `${id}-error`;
    const label = h('label', { class: 'field__label', for: control.id }, spec.label);
    const hint = h('p', { class: 'field__hint', id: hintId }, spec.hint || '');
    const error = h('p', { class: 'field__error', id: errId, role: 'alert', hidden: true });
    control.setAttribute('aria-describedby', `${hintId} ${errId}`);
    hint.hidden = !spec.hint;
    const element = h('div', { class: 'field' }, label, control, hint, error);
    return {
      element,
      label,
      control,
      setLabel(nodes) { label.replaceChildren(...[].concat(nodes)); },
      setHint(text) {
        hint.textContent = text || '';
        hint.hidden = !text;
      },
      setError(err) {
        if (err) {
          const pos = err.pos !== undefined && !/posici[oó]n/i.test(err.message) ? ` (posición ${err.pos + 1})` : '';
          error.textContent = `${err.message}${pos}`;
          error.hidden = false;
          control.setAttribute('aria-invalid', 'true');
        } else {
          error.textContent = '';
          error.hidden = true;
          control.removeAttribute('aria-invalid');
        }
      },
    };
  }

  /** Single-choice `.segmented` group of radio inputs. `options`: [{value, label}]. */
  function segmented(h, uid, label, options, current, onPick) {
    const groupId = uid('sim-radio');
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
    return { element, set(value) { Object.keys(inputs).forEach((key) => { inputs[key].checked = key === value; }); } };
  }

  /** Which rows are shown: all of them, or the first MAX_ROWS - 1 and the last one (with a gap between). */
  function visibleRows(rows, maxRows) {
    const limit = maxRows || MAX_ROWS;
    if (rows.length <= limit) return { shown: rows.map((row) => ({ row })), cut: 0 };
    const head = rows.slice(0, limit - 1).map((row) => ({ row }));
    return { shown: head.concat([{ gap: true }, { row: rows[rows.length - 1] }]), cut: rows.length - limit };
  }

  /**
   * A results or errors table in the shape of the style guide: scrollable region, tabular numerals, a first
   * header row with the method of each group of columns and a second with the column heads.
   */
  function table(h, kit, data, spec) {
    const o = spec || {};
    const span = data.columns.length;
    const groupRow = h('tr', null, data.groups.map((g) => (g.id
      ? h('th', { scope: 'colgroup', colspan: g.span, class: 'sim-table__group' }, kit.methodChip(g.id, g.label))
      : h('td', { colspan: g.span }))));
    const headRow = h('tr', null, data.columns.map((c) => h('th', { scope: 'col', class: 'num' }, heading(h, c))));
    const { shown, cut } = visibleRows(data.rows, o.maxRows);
    const body = shown.map((item) => {
      if (item.gap) return h('tr', { class: 'sim-table__gap' }, h('td', { colspan: span }, `… ${cut} filas intermedias no se muestran`));
      const [first, ...rest] = item.row;
      return h('tr', null, h('th', { scope: 'row', class: 'num' }, first), rest.map((cell) => h('td', { class: 'num' }, cell)));
    });
    return h('div', { class: 'stack', style: { '--gap': '0.5rem' } },
      o.caption ? h('p', { class: 'muted' }, o.caption) : null,
      h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': o.label }, h('table', { class: 'sim-table' },
        h('caption', { class: 'sr-only' }, o.label),
        h('thead', null, groupRow, headRow),
        h('tbody', null, body))),
      cut ? h('p', { class: 'muted' }, `La tabla muestra las primeras ${MAX_ROWS - 1} filas y la última. El archivo CSV incluye todas.`) : null);
  }

  return {
    MAX_ROWS, heading, field, segmented, table, visibleRows,
  };
}));
