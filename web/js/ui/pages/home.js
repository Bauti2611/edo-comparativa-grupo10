/**
 * Page 'inicio': the title block from config, the comparative question of the talk (the topic the group was
 * assigned), the PVI that threads the site with the source it comes from, the hero "El paso" (the guiding
 * question and the signature diagram of js/ui/step-diagram.js).
 * Members are listed only when config.members has names. The content lives in home/model.js.
 *
 * Load order: after home/model.js (index.html).
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;
  const cfg = EDO.config;
  const M = EDO.home.model;

  const TITLE = 'Comparativa de métodos para PVI: Taylor, Euler Mejorado y RK2';

  /** One "label: value" row of the metadata list; renders nothing when there is no value. */
  function metaRow(label, value) {
    if (!value) return null;
    return h('div', { class: 'meta-list__row' }, h('dt', null, label), h('dd', null, value));
  }

  const chip = (id, text) => h('span', { class: 'method-chip', 'data-method': id }, text);

  function titleBlock() {
    const g = cfg.group;
    return h('header', { class: 'title-block' },
      h('h1', { class: 'title-block__title' }, TITLE),
      h('p', { class: 'title-block__group' }, `Grupo ${g.number}`),
      h('p', { class: 'title-block__line' }, `${g.course} · ${g.school}`),
      h('p', { class: 'title-block__line' }, `${g.round} · ${g.dateLabel}`),
      h('dl', { class: 'meta-list' },
        metaRow((cfg.professors && cfg.professors.length === 1) ? 'Docente' : 'Docentes', (cfg.professors || []).join(' · ')),
        metaRow('Integrantes', M.membersText(cfg.members))));
  }

  /**
   * The comparative question the group was assigned. The three methods are presented one by one by the groups
   * that expose before, so the site states its own question first and the demo below answers how a step is given.
   */
  function thesis() {
    const t = M.THESIS;
    return h('section', { class: 'home-thesis', id: 'inicio-tesis', 'aria-labelledby': 'inicio-tesis-title' },
      h('p', { class: 'home-hero__eyebrow' }, t.eyebrow),
      h('h2', { class: 'home-thesis__question', id: 'inicio-tesis-title' }, t.question),
      t.body.map((line) => h('p', { class: 'home-thesis__text' }, line)),
      h('p', { class: 'home-thesis__links cluster' }, t.links.map((link) => h('a', { href: link.href }, link.label))));
  }

  /**
   * The PVI that threads the site, stated with its provenance before the hero diagram below uses it. The
   * statement is read from the preset, so no value of it is typed here.
   */
  function caseBlock() {
    const c = M.CASE;
    const p = EDO.problems.fromPreset(c.preset);
    const fTex = EDO.expr.toTeX(p.fNode, { indep: p.indep });
    return h('section', { class: 'home-thesis', id: 'inicio-caso', 'aria-labelledby': 'inicio-caso-title' },
      h('p', { class: 'home-hero__eyebrow' }, c.eyebrow),
      h('h2', { class: 'home-thesis__question', id: 'inicio-caso-title' },
        `$y' = ${fTex}$, con $y(${p.x0}) = ${p.y0}$ y paso $h = ${p.h}$`),
      c.body.map((line) => h('p', { class: 'home-thesis__text' }, line)));
  }

  function hero(signal) {
    const figure = h('div', { class: 'home-hero__figure' });
    const section = h('section', { class: 'home-hero', id: 'inicio-paso', 'aria-labelledby': 'inicio-paso-title' },
      h('div', { class: 'home-hero__lead' },
        h('p', { class: 'home-hero__eyebrow' }, 'El paso'),
        h('h2', { class: 'home-hero__question', id: 'inicio-paso-title' }, M.QUESTION),
        h('p', { class: 'home-hero__text' },
          'Todos los métodos parten del mismo punto $(x_n, y_n)$ y avanzan el mismo paso $h$. ',
          'Lo que cambia es la información que usan para estimar $y_{n+1}$:'),
        h('ul', { class: 'home-hero__ways' },
          h('li', null, chip('taylor', 'Taylor de grado 2'), h('span', null, 'sigue la curvatura: suma el término $\\tfrac{h^2}{2!}\\,y_n\'\'$.')),
          h('li', null, chip('heun', 'Euler Mejorado'), h('span', null, 'promedia la pendiente del inicio y la del final del paso.')),
          h('li', null, chip('rk2', 'RK2 (punto medio)'), h('span', null, 'usa la pendiente en el punto medio del paso.')))),
      figure,
      h('p', { class: 'home-hero__note' }, 'Mueva el control de $h$: con pasos grandes las tres construcciones se separan; con pasos chicos casi coinciden con la curva exacta.'));
    try {
      EDO.stepDiagram.mount(figure, { signal });
    } catch (err) {
      console.error(err);
      figure.appendChild(h('p', { class: 'chart-notice', role: 'status' }, 'No se pudo mostrar el diagrama.'));
    }
    return section;
  }

  function render(page, ctx) {
    page.appendChild(h('div', { class: 'home' }, titleBlock(), thesis(), caseBlock(), hero(ctx.signal)));
    EDO.tex.hydrate(page);
  }

  EDO.app.registerPage('inicio', {
    title: 'Inicio',
    nav: { label: 'Inicio', order: 10 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
