/**
 * Page 'teoria': the theory of the PVI and of the three methods of the course, as one long reading page with a
 * sticky table of contents. The content lives in theory/sections-a/b/c.js (one builder per section, fed with the
 * numbers of theory/data.js); this file lays it out and wires the behaviour:
 *
 *  - layout: reading column plus a sticky contents rail on wide screens (`data-layout="rail"`), and a closed
 *    `<details>` at the top on narrow ones (`compact`). The switch is measured in rem, so projection mode (bigger
 *    root size) falls back to the compact layout sooner, as it should.
 *  - scroll-spy: an IntersectionObserver marks the section being read with `aria-current="true"` in the contents.
 *  - lazy diagrams: every "El paso" diagram is mounted only when it comes near the viewport, with the page's
 *    AbortSignal, so leaving the page destroys them (EDO.charts.count() returns to its baseline).
 *  - display setting: the worked first iterations of the Receta follow `EDO.prefs` `display.mode`. The apunte
 *    truncates, so the page starts in 'trunc' unless the user already chose something; changing the control
 *    writes the preference (the diagrams follow too) and the blocks are rebuilt.
 *  - sub-routes: '#/teoria/rk2' scrolls to the section with id 'teoria-rk2' (done by the shell).
 *
 * Load order: after theory/data.js, theory/kit.js and theory/sections-a/b/c.js (index.html), before start.js.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const doc = root.document;
  const { h } = EDO.dom;

  /** Content width (in rem) from which the contents go into a side rail. */
  const RAIL_MIN_REM = 62;
  /** Diagrams are mounted when they come this close to the viewport. */
  const LAZY_MARGIN = '600px 0px';
  /** The band of the viewport (from the top) where a section counts as "the one being read". */
  const SPY_MARGIN = '-12% 0px -60% 0px';

  /** The display mode chosen in this session (module state: it outlives a visit to another page). */
  let chosenMode = null;

  /** `display.mode` stored by an earlier visit or another page (EDO.prefs does not tell default from chosen). */
  function storedDisplayMode() {
    try {
      const raw = root.localStorage.getItem(EDO.prefs.STORAGE_KEY);
      const display = raw ? JSON.parse(raw).display : null;
      return display && (display.mode === 'trunc' || display.mode === 'round') ? display.mode : null;
    } catch (err) {
      return null;
    }
  }

  function header(kit) {
    const { callout, badge, im } = kit;
    return h('header', { class: 'theory__head' },
      h('h1', null, 'Teoría'),
      h('p', { class: 'lead' }, 'Cómo se da un paso de ', im('x_n'), ' a ', im('x_{n+1}'), ' con Taylor, Euler Mejorado y RK2: de dónde sale cada fórmula, cómo se aplica a mano y cuánto error comete.'),
      callout({ kind: 'note', label: 'Cómo leer esta página' },
        h('p', null, 'El texto principal sigue el apunte de la cátedra: su notación, sus fórmulas y su formato. Los recuadros de borde punteado con la etiqueta ', badge('Ampliación'),
          ' agregan lo que el apunte no trae y pueden omitirse sin perder el hilo del curso. El fondo amarillo marca, como en el apunte, la fórmula general (la Ordenada Genérica) y el valor que se anota.'),
        h('p', null, 'Todos los valores numéricos de esta página los calcula, al abrirla, el mismo motor que usan los ejercicios y el simulador.')));
  }

  function failedSection(spec, err) {
    console.error(err);
    return h('section', { id: `teoria-${spec.id}`, class: 'theory-section', 'aria-labelledby': `teoria-${spec.id}-title` },
      h('h2', { id: `teoria-${spec.id}-title` }, spec.title),
      h('div', { class: 'callout', 'data-kind': 'warning', role: 'alert' },
        h('p', { class: 'callout__label' }, 'Error'),
        h('p', null, `No se pudo mostrar esta sección: ${err && err.message ? err.message : String(err)}`)));
  }

  function render(page, ctx) {
    const theory = EDO.theory;
    const kit = theory.kit.makeKit(h, EDO.format);
    const order = theory.kit.SECTION_ORDER;
    const specs = theory.sections.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    const diagrams = [];
    const listeners = [];
    let mode = chosenMode || storedDisplayMode() || 'trunc';
    const cleanups = [];

    const env = {
      h,
      kit,
      data: theory.data,
      expr: EDO.expr,
      format: EDO.format,
      problems: EDO.problems,
      methods: EDO.methods,
      analysis: EDO.analysis,
      uid: EDO.dom.uid,
      hydrate: (el) => EDO.tex.hydrate(el),
      diagram(opts, label) {
        const host = h('div', {
          class: 'theory-diagram', role: 'group', 'aria-label': label, 'data-methods': opts.methods,
        });
        diagrams.push({ host, opts });
        return host;
      },
      displayMode: () => mode,
      setDisplayMode: (next) => { EDO.prefs.set('display', { mode: next }); },
      onDisplay: (fn) => { listeners.push(fn); },
    };

    // Everything below needs the sections; one that fails to build must not take the page down.
    const built = specs.map((spec) => {
      let el;
      try {
        el = spec.build(env);
      } catch (err) {
        el = failedSection(spec, err);
      }
      return { spec, el };
    });

    /* ---- Contents ----------------------------------------------------------------------------------- */
    const tocLinks = new Map();
    const list = h('ul', { class: 'theory-toc__list', role: 'list' }, built.map(({ spec }) => {
      const link = h('a', { class: 'theory-toc__link', href: `#/teoria/${spec.id}` },
        h('span', null, spec.toc || spec.title),
        spec.extension ? h('span', { class: 'badge' }, 'Ampliación') : null);
      tocLinks.set(spec.id, link);
      return h('li', null, link);
    }));
    const details = h('details', { class: 'disclosure theory-toc__details' }, h('summary', { class: 'theory-toc__summary' }, 'Contenido de la teoría'), list);
    const nav = h('nav', { class: 'theory-toc', 'aria-label': 'Contenido de la teoría' },
      h('p', { class: 'theory-toc__title', 'aria-hidden': 'true' }, 'Contenido'),
      details);

    const wrapper = h('div', { class: 'theory', 'data-layout': 'compact' },
      header(kit),
      h('div', { class: 'theory__layout' },
        h('div', { class: 'theory__rail' }, nav),
        h('div', { class: 'theory__body' }, built.map(({ el }) => el))));
    page.appendChild(wrapper);
    EDO.tex.hydrate(page);

    /* ---- Layout: rail or compact ---------------------------------------------------------------------- */
    function measure() {
      const rem = parseFloat(root.getComputedStyle(doc.documentElement).fontSize) || 16;
      const wide = wrapper.getBoundingClientRect().width >= RAIL_MIN_REM * rem;
      const next = wide ? 'rail' : 'compact';
      if (wrapper.getAttribute('data-layout') !== next) {
        wrapper.setAttribute('data-layout', next);
        details.open = wide;
      }
    }
    measure();
    if (typeof root.ResizeObserver === 'function') {
      const resize = new root.ResizeObserver(measure);
      resize.observe(wrapper);
      cleanups.push(() => resize.disconnect());
    } else {
      root.addEventListener('resize', measure);
      cleanups.push(() => root.removeEventListener('resize', measure));
    }
    cleanups.push(EDO.bus.on('mode:change', measure));

    nav.addEventListener('click', (event) => {
      const link = event.target.closest ? event.target.closest('a') : null;
      if (link && wrapper.getAttribute('data-layout') === 'compact') details.open = false;
    });

    /* ---- Scroll-spy ------------------------------------------------------------------------------------- */
    if (typeof root.IntersectionObserver === 'function' && built.length) {
      const inBand = new Set();
      let current = null;
      const mark = (id) => {
        if (id === current) return;
        current = id;
        tocLinks.forEach((link, key) => {
          if (key === id) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      };
      const pick = () => {
        const atBottom = root.innerHeight + root.scrollY >= doc.documentElement.scrollHeight - 2;
        if (atBottom) {
          mark(built[built.length - 1].spec.id);
          return;
        }
        const first = built.find(({ spec }) => inBand.has(spec.id));
        if (first) mark(first.spec.id);
        else if (current === null) mark(built[0].spec.id);
      };
      const spy = new root.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id.replace(/^teoria-/, '');
          if (entry.isIntersecting) inBand.add(id);
          else inBand.delete(id);
        });
        pick();
      }, { rootMargin: SPY_MARGIN, threshold: 0 });
      built.forEach(({ el }) => spy.observe(el));
      cleanups.push(() => spy.disconnect());
      pick();
    }

    /* ---- Diagrams: mounted when they come near ------------------------------------------------------------ */
    function mountDiagram(entry) {
      if (entry.mounted || !EDO.stepDiagram) return;
      entry.mounted = true;
      entry.host.setAttribute('data-mounted', 'true');
      try {
        EDO.stepDiagram.mount(entry.host, Object.assign({}, entry.opts, { signal: ctx.signal }));
      } catch (err) {
        console.error(err);
        entry.host.appendChild(h('p', { class: 'chart-notice', role: 'status' }, 'No se pudo mostrar el diagrama.'));
      }
    }
    if (typeof root.IntersectionObserver === 'function') {
      const byHost = new Map(diagrams.map((entry) => [entry.host, entry]));
      const lazy = new root.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          lazy.unobserve(entry.target);
          mountDiagram(byHost.get(entry.target));
        });
      }, { rootMargin: LAZY_MARGIN });
      diagrams.forEach((entry) => lazy.observe(entry.host));
      cleanups.push(() => lazy.disconnect());
    } else {
      diagrams.forEach(mountDiagram);
    }

    /* ---- Display setting ----------------------------------------------------------------------------------- */
    cleanups.push(EDO.bus.on('prefs:change', (change) => {
      if (!change || change.key !== 'display' || !change.value) return;
      const next = change.value.mode === 'round' ? 'round' : 'trunc';
      chosenMode = next;
      if (next === mode) return;
      mode = next;
      listeners.forEach((fn) => fn(mode));
    }));

    ctx.signal.addEventListener('abort', () => {
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
    }, { once: true });
  }

  EDO.app.registerPage('teoria', {
    title: 'Teoría',
    nav: { label: 'Teoría', order: 20 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
