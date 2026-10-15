/**
 * EDO.theory.kit - building blocks shared by the sections of the Teoría page (sections-a/b/c.js).
 *
 * `makeKit(h, format)` returns small element builders on top of EDO.dom.h (`h`) that only use the classes of
 * components.css: section, prose, formula, callout, fold (the `.disclosure` box for what stays out of the main
 * reading flow), extension (the dashed "Ampliación" box), table, links and number helpers. `rational` is a tiny exact-fraction helper (the RK2 family table shows exact fractions, not
 * decimals). The section order and the method names live here so the page and the tests share one source.
 *
 * Nothing here touches the DOM directly: every element is built through the injected `h`, so the same code runs
 * in the tests with a stand-in. Math is written as `$...$` / `$$...$$` text and rendered by EDO.tex.hydrate.
 *
 * Load order: after data.js, before sections-a.js. Also `require`-able in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.theory = EDO.theory || { sections: [] };
    EDO.theory.kit = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Section slugs, in reading order (the ids are `teoria-<slug>`). The Receta comes right after the PVI because
   * it is what the group needs if it is asked to solve an exercise live; the comparative sections (error, cost
   * and the summary with its decision guide) live on the Comparativa page, which owns the assigned topic.
   */
  const SECTION_ORDER = Object.freeze(['pvi', 'receta', 'taylor', 'heun', 'rk2', 'familia', 'glosario']);

  /** Names as the page writes them (the apunte's wording). */
  const METHOD_NAMES = Object.freeze({
    euler: 'Euler',
    taylor: 'Taylor de grado 2',
    heun: 'Euler Mejorado',
    rk2: 'RK2 (punto medio)',
  });

  /** Short names for chips and table headers. */
  const CHIP_NAMES = Object.freeze({
    euler: 'Euler',
    taylor: 'Taylor',
    heun: 'Euler Mejorado',
    rk2: 'RK2',
  });

  /* ---- Exact fractions ------------------------------------------------------------------------------------- */

  const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

  /**
   * An exact fraction n/d in lowest terms with a positive denominator.
   * @param {number} n Integer numerator.
   * @param {number} [d] Integer denominator (default 1, never 0).
   * @returns {{n: number, d: number}}
   */
  function rational(n, d) {
    const den = d === undefined ? 1 : d;
    if (!Number.isInteger(n) || !Number.isInteger(den) || den === 0) throw new RangeError('rational: se esperan enteros y un denominador distinto de cero.');
    const g = gcd(n, den) || 1;
    const sign = den < 0 ? -1 : 1;
    return Object.freeze({ n: (sign * n) / g, d: (sign * den) / g });
  }

  const Q = Object.freeze({
    of: rational,
    add: (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d),
    sub: (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d),
    mul: (a, b) => rational(a.n * b.n, a.d * b.d),
    div: (a, b) => rational(a.n * b.d, a.d * b.n),
    value: (a) => a.n / a.d,
    /** TeX of a fraction: `\frac{1}{2}`, `-\frac{1}{12}` or the integer itself. */
    tex: (a) => (a.d === 1 ? String(a.n) : `${a.n < 0 ? '-' : ''}\\frac{${Math.abs(a.n)}}{${a.d}}`),
  });

  /**
   * One member of the two-stage RK2 family, from its weight a2 (a2 = 0 is excluded).
   * Order conditions: a1 + a2 = 1, a2*p = 1/2, a2*q = 1/2 (so p = q = 1/(2*a2)).
   * `f2` is the coefficient of F2 in the one-step local error, 1/6 - p/4 (the one of f_y*D is 1/6 for all).
   */
  function familyMember(a2) {
    if (a2.n === 0) throw new RangeError('familyMember: a2 debe ser distinto de cero.');
    const one = rational(1);
    const p = Q.div(one, Q.mul(rational(2), a2));
    return {
      a1: Q.sub(one, a2),
      a2,
      p,
      q: p,
      f2: Q.sub(rational(1, 6), Q.div(p, rational(4))),
      fyd: rational(1, 6),
    };
  }

  /* ---- Element builders ---------------------------------------------------------------------------------------- */

  /**
   * @param {function} h EDO.dom.h (or a stand-in with the same signature).
   * @param {object} format EDO.format (num, sci).
   */
  function makeKit(h, format) {
    const badge = (text, kind) => h('span', { class: 'badge', 'data-kind': kind || null }, text);
    const ampliacion = () => badge('Ampliación');
    const fromApunte = () => badge('Del apunte', 'course');

    const prose = (...children) => h('div', { class: 'prose' }, ...children);

    /** Inline math as text; EDO.tex.hydrate renders it. The caller keeps each formula inside one text node. */
    const im = (tex) => `$${tex}$`;

    /** Display formula. `hl` is the yellow of the apunte: the generic formula (Ordenada Genérica). */
    const formula = (tex, opts) => h('div', { class: opts && opts.hl ? 'formula hl' : 'formula' }, `$$${tex}$$`);

    /** The label under a highlighted formula: where it comes from. */
    const caption = (...children) => h('p', { class: 'theory-caption' }, ...children);

    /**
     * `.callout` with an optional label. kind: note | extension | warning | result. `wide` lifts the reading
     * measure (a callout that holds a wide table).
     */
    function callout(opts, ...children) {
      return h('div', { class: 'callout', 'data-kind': opts.kind || null, 'data-wide': opts.wide ? 'true' : null },
        opts.label ? h('p', { class: 'callout__label' }, opts.label) : null,
        ...children);
    }

    /**
     * A folded block (the `.disclosure` component of components.css): the content stays available but out of the
     * main reading flow. The talk no longer walks through the long derivations, so they live here.
     * @param {string} title What the summary line says.
     * @param {...(Node|null)} children
     */
    const fold = (title, ...children) => h('details', { class: 'disclosure theory-fold' },
      h('summary', null, title),
      h('div', { class: 'disclosure__body stack' }, ...children));

    /** The dashed box of everything that goes beyond the apunte, always tagged with the "Ampliación" badge. */
    const extension = (title, ...children) => callout({ kind: 'extension', label: [ampliacion(), ' ', title] }, ...children);
    const extensionWide = (title, ...children) => callout({ kind: 'extension', wide: true, label: [ampliacion(), ' ', title] }, ...children);

    const link = (href, ...children) => h('a', { href }, ...children);

    /** Link to another section of this page (`#/teoria/<slug>`). */
    const goto = (slug, text) => link(`#/teoria/${slug}`, text);

    const methodChip = (id, text) => h('span', { class: 'method-chip', 'data-method': id }, text || CHIP_NAMES[id] || id);

    /**
     * Page section: `<section id="teoria-<slug>">` with its h2 and the given blocks.
     * @param {string} slug
     * @param {string} title
     * @param {...(Node|null)} children
     */
    function section(slug, title, ...children) {
      return h('section', { id: `teoria-${slug}`, class: 'theory-section', 'aria-labelledby': `teoria-${slug}-title` },
        h('h2', { id: `teoria-${slug}-title` }, title),
        ...children);
    }

    /**
     * A table in the shape of the style guide: scrollable region, tabular numerals, screen-reader caption.
     * Cells are a node or string, or `{c, num, wrap, nowrap, row, hl}` (`num`: right-aligned numerals, `wrap`: a
     * numeric cell may wrap, `nowrap`: a formula that must stay in one line, `row`: row header). Heads are cells
     * too. `caption` is the visible line above the table. From about 900 px of viewport on, tables fit the reading
     * column by wrapping their cells (see the Teoría block of pages.css), so only what must not break is marked.
     */
    function table(opts) {
      const spec = (cell) => (cell !== null && typeof cell === 'object' && !cell.nodeType && !Array.isArray(cell) && 'c' in cell ? cell : { c: cell });
      const attrsOf = (cell) => ({ class: [cell.num ? 'num' : null, cell.wrap ? 'wrap' : null, cell.nowrap ? 'nowrap' : null].filter(Boolean).join(' ') || null });
      const head = h('thead', null, h('tr', null, opts.head.map((raw) => {
        const cell = spec(raw);
        return h('th', Object.assign(attrsOf(cell), { scope: 'col' }), cell.c);
      })));
      const body = h('tbody', null, opts.rows.map((row) => h('tr', { 'data-hl': row.hl ? 'true' : null }, (row.cells || row).map((raw) => {
        const cell = spec(raw);
        return cell.row
          ? h('th', Object.assign(attrsOf(cell), { scope: 'row' }), cell.c)
          : h('td', attrsOf(cell), cell.c);
      }))));
      return h('div', { class: 'stack', style: { '--gap': '0.5rem' } },
        opts.caption ? h('p', { class: 'muted' }, opts.caption) : null,
        h('div', {
          class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': opts.label,
        }, h('table', null, h('caption', { class: 'sr-only' }, opts.label), head, body)));
    }

    /** Decimal number with a fixed count of decimals (trailing zeros kept: aligned columns). */
    const fixed = (v, decimals) => format.num(v, { decimals, mode: 'round', trim: false });
    /** Decimal number, trailing zeros dropped. */
    const plain = (v, decimals) => format.num(v, { decimals: decimals === undefined ? 4 : decimals, mode: 'round' });
    /** Scientific notation with `digits` significant digits, zeros kept so columns align ("3.500e-4"). */
    const sci = (v, digits) => format.sci(v, { digits: digits === undefined ? 4 : digits, trim: false });

    return {
      badge, ampliacion, fromApunte, prose, im, formula, caption, callout, fold, extension, extensionWide, link, goto, methodChip, section, table, fixed, plain, sci, Q, familyMember,
    };
  }

  return {
    SECTION_ORDER, METHOD_NAMES, CHIP_NAMES, rational, Q, familyMember, makeKit,
  };
}));
