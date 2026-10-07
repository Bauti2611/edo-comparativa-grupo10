/**
 * EDO.steps - lays out the step-by-step solution of the cátedra (the model of js/ui/steps-model.js) with the
 * site's components: the problem statement, the planteo, the Ordenada Genérica, one `.step-block` per iteration,
 * a compact summary table and, apart and labelled as an addition, the Verificación.
 *
 *   EDO.steps.render(container, model, opts) -> {element, update(model), destroy()}
 *   EDO.steps.build(h, model, opts) -> Node[]      the same layout as a list of nodes, for any `h` (tests use a stand-in)
 *
 *   opts.signal         AbortSignal (pass ctx.signal inside a page): the solution is destroyed when it aborts
 *   opts.collapsible    every iteration becomes a <details open> (long solutions); default false
 *   opts.headingLevel   level of the title (default 2); the blocks use the next level
 *
 *   update(model)       re-renders in place (the same element), e.g. when the display mode changes; the open or
 *                       closed state of collapsible iterations is kept
 *   destroy()           removes the element; also runs when `opts.signal` aborts. Every call after it is a no-op.
 *   element             the root <article class="steps-solution">, already inside `container`
 *
 * Everything is built with EDO.dom.h (text never becomes markup) and then rendered by EDO.tex.hydrate: formulas are
 * `$...$` / `$$...$$` text, so without KaTeX the raw TeX stays readable. Colours, spacing and type come from the
 * shared tokens (see the `.steps-solution` block of css/pages.css), so dark and projection modes need nothing here.
 *
 * Load order (browser): after dom.js, tex.js and steps-model.js (EDO.dom and EDO.tex are read when rendering).
 * Also `require`-able in Node, where `_env` is the test seam: set `_env.dom` and `_env.tex` to stand-ins.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const env = { dom: null, tex: null };
    module.exports = Object.assign(factory(env), { _env: env });
  } else {
    root.EDO = root.EDO || {};
    root.EDO.steps = factory(root.EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const DEFAULT_LEVEL = 2;
  const MAX_LEVEL = 5; // the blocks use one level more, and HTML stops at h6

  const BLOCK = Object.freeze({
    planteo: 'Condición inicial y dominio',
    generic: 'Ordenada Genérica',
    summary: 'Resumen de resultados',
    statement: 'Enunciado',
  });

  const clampLevel = (v) => Math.min(MAX_LEVEL, Math.max(1, Number.isInteger(v) ? v : DEFAULT_LEVEL));
  const mathInline = (tex) => `$${tex}$`;
  const mathDisplay = (tex) => `$$${tex}$$`;

  /* ======================================================================================================
     Layout (pure: it only calls the `h` it is given)
     ====================================================================================================== */

  /**
   * One part of the model as nodes: the sentence (inline math) and/or the formula; a result as the highlighted
   * line; the first iteration's explanation as the quiet note of the step block.
   */
  function partNodes(h, part) {
    const out = [];
    if (part.kind === 'note') {
      out.push(h('p', { class: 'step-block__note' }, part.say));
      return out;
    }
    if (part.say) out.push(h('p', { class: 'steps-solution__say' }, part.say));
    if (!part.tex) return out;
    if (part.kind === 'result') {
      out.push(h('p', { class: 'steps-solution__result' }, h('mark', { class: 'hl' }, mathInline(part.tex))));
    } else {
      out.push(h('div', { class: part.highlight ? 'formula hl' : 'formula' }, mathDisplay(part.tex)));
      if (part.label) out.push(h('p', { class: 'steps-solution__tag' }, part.label));
    }
    return out;
  }

  const partsNodes = (h, parts) => parts.flatMap((part) => partNodes(h, part));

  /** A block in the visual language of the style guide: a header with its title, then the body. */
  function block(h, opts, body) {
    const { title, id, level, aside } = opts;
    return h('article', { class: 'step-block', 'aria-labelledby': id },
      h('header', { class: 'step-block__head' },
        h(`h${level}`, { class: 'step-block__title', id }, title),
        aside ? h('span', { class: 'step-block__n' }, aside) : null),
      h('div', { class: 'step-block__body' }, body));
  }

  function statementNodes(h, model, ids, level) {
    return h('div', { class: 'steps-solution__statement', role: 'group', 'aria-labelledby': ids.statement },
      h(`h${level}`, { class: 'sr-only', id: ids.statement }, BLOCK.statement),
      partsNodes(h, model.statement.parts));
  }

  function planteoNodes(h, model, ids, level) {
    const grid = h('div', { class: 'steps-solution__grid' }, model.abscissas.parts.map((part) => h('div', { class: 'formula' }, mathDisplay(part.tex))));
    return block(h, { title: BLOCK.planteo, id: ids.planteo, level }, [
      partsNodes(h, model.initial.parts),
      partsNodes(h, model.domain.parts),
      grid,
    ]);
  }

  function iterationNode(h, it, ids, level, o) {
    const id = `${ids.base}-n${it.n}`;
    const body = partsNodes(h, it.parts);
    const aside = it.ordinal ? `n = ${it.n}` : null;
    if (!o.collapsible) return block(h, { title: it.label, id, level, aside }, body);
    return h('details', {
      class: 'step-block steps-solution__iteration', open: o.isOpen(it.n), 'aria-labelledby': id, ontoggle: (event) => o.onToggle(it.n, Boolean(event && event.target && event.target.open)),
    },
    h('summary', { class: 'step-block__head' },
      h(`h${level}`, { class: 'step-block__title', id }, it.label),
      aside ? h('span', { class: 'step-block__n' }, aside) : null),
    h('div', { class: 'step-block__body' }, body));
  }

  function summaryNodes(h, model, ids, level) {
    const { summary } = model;
    const head = h('thead', null, h('tr', null,
      h('th', { scope: 'col', class: 'num' }, 'n'),
      h('th', { scope: 'col', class: 'num' }, mathInline(`${model.problem.indep}_n`)),
      h('th', { scope: 'col', class: 'num' }, mathInline('y_n')),
      summary.columns.map((c) => h('th', { scope: 'col', class: 'num' }, mathInline(c.head)))));
    const last = summary.rows.length - 1;
    const body = h('tbody', null, summary.rows.map((row, i) => h('tr', { 'data-hl': i === last ? true : null },
      h('th', { scope: 'row', class: 'num' }, String(row.n)),
      h('td', { class: 'num' }, row.xText),
      h('td', { class: 'num' }, row.yText),
      summary.columns.map((c, j) => h('td', { class: 'num' }, row.cells[j] ? row.cells[j].text : '')))));
    return h('div', { class: 'steps-solution__summary' },
      h(`h${level}`, { class: 'steps-solution__subtitle', id: ids.summary }, BLOCK.summary),
      h('div', {
        class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': summary.caption,
      }, h('table', null, h('caption', { class: 'sr-only' }, summary.caption), head, body)));
  }

  function verificationNodes(h, model, ids, level) {
    const v = model.verification;
    return h('div', { class: 'callout steps-solution__verif', 'data-kind': 'extension' },
      h(`h${level}`, { class: 'callout__label', id: ids.verification }, h('span', { class: 'badge' }, 'Ampliación'), ' ', v.label),
      h('p', null, v.say),
      h('dl', { class: 'steps-solution__verif-list' }, v.rows.map((row) => h('div', { class: 'steps-solution__verif-row' },
        h('dt', null, row.label),
        h('dd', { class: 'num' }, row.text)))));
  }

  /**
   * The whole solution as the children of the root article.
   * @param {function} h EDO.dom.h (or a stand-in with its signature).
   * @param {object} model A model of EDO.stepsModel.
   * @param {{base?: string, level?: number, collapsible?: boolean, isOpen?: function, onToggle?: function}} [opts]
   * @returns {Array} Nodes: the header, the statement, the planteo, the Ordenada Genérica, the iterations, the
   *   closing (or the reason the run stopped), the summary and the Verificación.
   */
  function build(h, model, opts) {
    const o = opts || {};
    const level = clampLevel(o.level);
    const sub = level + 1;
    const base = o.base || 'steps';
    const ids = {
      base, title: `${base}-title`, statement: `${base}-statement`, planteo: `${base}-planteo`, generic: `${base}-generic`, summary: `${base}-summary`, verification: `${base}-verification`,
    };
    const layout = {
      collapsible: Boolean(o.collapsible),
      isOpen: typeof o.isOpen === 'function' ? o.isOpen : () => true,
      onToggle: typeof o.onToggle === 'function' ? o.onToggle : () => {},
    };
    const method = model.method;
    const nodes = [];
    nodes.push(h('header', { class: 'steps-solution__head' },
      h(`h${level}`, { class: 'steps-solution__title', id: ids.title }, model.title),
      h('div', { class: 'steps-solution__tags' },
        h('span', { class: 'method-chip', 'data-method': method.id }, method.chip),
        method.extension ? h('span', { class: 'badge' }, 'Ampliación') : null),
      h('p', { class: 'steps-solution__notice' }, model.display.notice)));
    nodes.push(statementNodes(h, model, ids, sub));
    nodes.push(planteoNodes(h, model, ids, sub));
    nodes.push(block(h, { title: BLOCK.generic, id: ids.generic, level: sub }, partsNodes(h, model.generic.parts)));
    model.iterations.forEach((it) => nodes.push(iterationNode(h, it, ids, sub, layout)));
    if (model.closing) nodes.push(h('p', { class: 'steps-solution__closing' }, model.closing));
    if (model.diverged) {
      nodes.push(h('div', { class: 'callout', 'data-kind': 'warning' }, h('p', { class: 'callout__label' }, 'La solución se detuvo'), h('p', null, model.message)));
    }
    nodes.push(summaryNodes(h, model, ids, sub));
    if (model.verification) nodes.push(verificationNodes(h, model, ids, sub));
    return nodes;
  }

  /* ======================================================================================================
     Mount (browser)
     ====================================================================================================== */

  /** What `render` returns when its signal was already aborted: nothing was built, every call is a no-op. */
  function inertHandle() {
    return { element: null, update() {}, destroy() {} };
  }

  function rootAttributes(model, base) {
    return {
      'data-method': model.method.id,
      'data-mode': model.display.mode,
      'data-partial': model.partial ? 'true' : 'false',
      'aria-labelledby': `${base}-title`,
    };
  }

  /**
   * Draws the solution inside `container` and keeps it live.
   * @param {Element} container Element the solution is appended to.
   * @param {object} model A model of EDO.stepsModel.build / exercise.
   * @param {{signal?: AbortSignal, collapsible?: boolean, headingLevel?: number}} [opts]
   * @returns {{element: ?Element, update: function(object): void, destroy: function(): void}}
   */
  function render(container, model, opts) {
    const dom = EDO.dom;
    if (!dom || typeof dom.h !== 'function') throw new Error('EDO.steps.render necesita EDO.dom (cargue js/ui/dom.js antes).');
    if (!container || container.nodeType !== 1) throw new Error('EDO.steps.render: falta el elemento contenedor.');
    if (!model || !Array.isArray(model.iterations)) throw new Error('EDO.steps.render: falta el modelo (EDO.stepsModel.build).');
    const o = opts || {};
    const signal = o.signal;
    if (signal && signal.aborted) return inertHandle();

    const base = dom.uid ? dom.uid('steps') : 'steps';
    const closed = new Set(); // iterations the reader collapsed (kept across update)
    let current = model;
    let destroyed = false;

    const layout = () => ({
      base,
      level: o.headingLevel,
      collapsible: o.collapsible,
      isOpen: (n) => !closed.has(n),
      onToggle: (n, open) => { if (open) closed.delete(n); else closed.add(n); },
    });
    const root = dom.h('article', Object.assign({ class: 'steps-solution' }, rootAttributes(current, base)), build(dom.h, current, layout()));
    container.appendChild(root);

    const hydrate = () => { if (EDO.tex && typeof EDO.tex.hydrate === 'function') EDO.tex.hydrate(root); };

    function update(next) {
      if (destroyed || !next || !Array.isArray(next.iterations)) return;
      current = next;
      const attrs = rootAttributes(current, base);
      Object.keys(attrs).forEach((key) => root.setAttribute(key, attrs[key]));
      dom.clear(root);
      build(dom.h, current, layout()).forEach((node) => root.appendChild(node));
      hydrate();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (signal) signal.removeEventListener('abort', destroy);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    if (signal) signal.addEventListener('abort', destroy, { once: true });
    hydrate();
    return { element: root, update, destroy };
  }

  return { render, build, BLOCK };
}));
