/**
 * Page 'ejercicios': the solved examples of the apunte, a comparative case and the practice bank, every solution
 * generated step by step by the same engine the simulator uses. The content lives in exercises/data.js (numbers) and
 * exercises/sections.js (layout, built through an injected `env`); this file wires the behaviour:
 *
 *  - display setting: the page-level "Cifras" control (Truncadas / Redondeadas) rebuilds every mounted solution and
 *    every table value. It is local to the page (it does not write the global preference); the apunte truncates, so
 *    the page starts in 'trunc' and remembers the choice for the rest of the session.
 *  - lazy content: a card's solution and chart are built when the card is open (or the first time it opens), a bank
 *    row's solution when its button is pressed, a method tab's solution when the tab is first shown. Everything is
 *    cleaned up with the page's AbortSignal (EDO.charts.count() returns to its baseline).
 *  - sub-routes: '#/ejercicios/catedra|comparativo|banco' (sections), 'ej1'..'ej4' (a card, opened) and a bank
 *    preset id such as 'p5_3a' (that row, with its step-by-step open). The shell scrolls to 'ejercicios-<sub>'.
 *
 * Load order: after exercises/data.js, exercises/sections.js, steps-model.js, steps.js and theory/kit.js
 * (index.html), before start.js.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const doc = root.document;
  const { h } = EDO.dom;

  /** The display mode chosen in this session (module state: it outlives a visit to another page). */
  let chosenMode = null;

  function failedSection(spec, err) {
    console.error(err);
    return h('section', { id: `ejercicios-${spec.id}`, class: 'exercises-section', 'aria-labelledby': `ejercicios-${spec.id}-title` },
      h('h2', { id: `ejercicios-${spec.id}-title` }, spec.title),
      h('div', { class: 'callout', 'data-kind': 'warning', role: 'alert' },
        h('p', { class: 'callout__label' }, 'Error'),
        h('p', null, `No se pudo mostrar esta sección: ${err && err.message ? err.message : String(err)}`)));
  }

  function render(page, ctx) {
    const data = EDO.exercises.data;
    const sections = EDO.exercises.sections;
    const kit = EDO.theory.kit.makeKit(h, EDO.format);

    let mode = chosenMode || 'trunc';
    const modeListeners = [];
    const mountLater = [];
    const opens = [];
    const rowOpeners = new Map();

    function setMode(next) {
      const value = next === 'round' ? 'round' : 'trunc';
      chosenMode = value;
      if (value === mode) return;
      mode = value;
      modeListeners.forEach((fn) => fn(mode));
    }

    const env = {
      h,
      kit,
      data,
      mode: () => mode,
      setMode,
      onMode(fn) { modeListeners.push(fn); },
      uid: EDO.dom.uid,
      hydrate: (el) => EDO.tex.hydrate(el),
      whenOpen(details, fn) { opens.push({ details, fn }); },
      afterMount(fn) { mountLater.push(fn); },

      /** Mounts the step-by-step solution of a preset into `host`; it follows the display mode. */
      solution(host, presetId, methodId, opts) {
        const number = opts && opts.number;
        const build = () => EDO.stepsModel.exercise(presetId, methodId || undefined, { mode, decimals: 4, number }).model;
        let handle;
        try {
          handle = EDO.steps.render(host, build(), { signal: ctx.signal, collapsible: true, headingLevel: 3 });
        } catch (err) {
          console.error(err);
          host.appendChild(h('p', { class: 'chart-notice', role: 'alert' }, 'No se pudo mostrar la resolución.'));
          return null;
        }
        modeListeners.push(() => {
          try {
            handle.update(build());
          } catch (err) {
            console.error(err);
          }
        });
        return handle;
      },

      /** Draws the figure of a problem (exact curve or RK4 reference, plus the numerical solutions). */
      chart(canvas, series, title) {
        const sets = [EDO.charts.dataset('exact', series.reference ? 'Referencia (RK4)' : 'Solución exacta', series.curve)];
        series.methods.forEach((m) => sets.push(EDO.charts.dataset(m.id, m.label, m.points)));
        EDO.charts.create(canvas, {
          type: 'line',
          data: { datasets: sets },
          options: {
            scales: {
              x: { type: 'linear', title: { display: true, text: series.indep } },
              y: { type: 'linear', title: { display: true, text: 'y' } },
            },
          },
        }, { title, signal: ctx.signal });
      },

      /** Accessible tabs whose panels are mounted the first time they are shown. */
      tabs(items, opts) {
        const el = EDO.dom.tabset(items.map((item) => ({ id: item.id, label: item.label, content: item.host })), { label: opts && opts.label });
        const mounted = new Set();
        const ensure = (index) => {
          const item = items[index];
          if (!item || mounted.has(item.id)) return;
          mounted.add(item.id);
          try {
            item.mount();
          } catch (err) {
            console.error(err);
          }
        };
        el.addEventListener('tabchange', (event) => ensure(event.detail.index));
        mountLater.push(() => ensure(el.index()));
        return el;
      },

      onRow(id, open) { rowOpeners.set(id, open); },
    };

    // One section that fails to build must not take the page down.
    const built = sections.SECTIONS.map((spec) => {
      try {
        return spec.build(env);
      } catch (err) {
        return failedSection(spec, err);
      }
    });
    let head;
    try {
      head = sections.header(env);
    } catch (err) {
      console.error(err);
      head = h('header', { class: 'exercises__head' }, h('h1', null, 'Ejercicios'));
    }

    page.appendChild(h('div', { class: 'exercises' }, head, built));
    EDO.tex.hydrate(page);

    // Lazy parts: a <details> builds its content when it is (or becomes) open.
    opens.forEach(({ details, fn }) => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        try {
          fn();
        } catch (err) {
          console.error(err);
        }
      };
      if (details.open) run();
      else details.addEventListener('toggle', () => { if (details.open) run(); });
    });
    mountLater.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    });

    // Deep link: open the card or the bank row it points to. A change of sub-route inside this page does not
    // render it again (the shell only scrolls), so the same opener also runs on `hashchange`; the shell's own
    // handler is registered first, so `EDO.app.current()` is already up to date when ours runs.
    function openTarget(sub) {
      const target = data.resolveSub(sub);
      if (target && target.kind === 'card') {
        const card = doc.getElementById(target.elementId);
        if (card) card.open = true;
      } else if (target && target.kind === 'row') {
        const open = rowOpeners.get(target.id);
        if (open) open();
      }
    }
    openTarget(ctx.sub);
    const onHash = () => {
      const current = EDO.app.current();
      if (current && current.page === 'ejercicios') openTarget(current.sub);
    };
    root.addEventListener('hashchange', onHash);

    ctx.signal.addEventListener('abort', () => {
      root.removeEventListener('hashchange', onHash);
      modeListeners.length = 0;
      mountLater.length = 0;
      opens.length = 0;
      rowOpeners.clear();
    }, { once: true });
  }

  EDO.app.registerPage('ejercicios', {
    title: 'Ejercicios',
    nav: { label: 'Ejercicios', order: 30 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
