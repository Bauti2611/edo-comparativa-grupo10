/**
 * Page 'inicio' (T1 stub, completed in T7): title block from config and the reserved "El paso" slot.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;
  const cfg = EDO.config;

  const TITLE = 'Comparativa de métodos para PVI: Taylor, Euler Mejorado y RK2';

  /** One "label: value" row of the metadata list; renders nothing when there is no value. */
  function metaRow(label, value) {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    return h('div', { class: 'meta-list__row' },
      h('dt', null, label),
      h('dd', null, Array.isArray(value) ? value.join(' · ') : value));
  }

  function render(page) {
    const g = cfg.group;
    page.appendChild(h('header', { class: 'title-block' },
      h('h1', { class: 'title-block__title' }, TITLE),
      h('p', { class: 'title-block__group' }, `Grupo ${g.number}`),
      h('p', { class: 'title-block__line' }, `${g.course} · ${g.school}`),
      h('p', { class: 'title-block__line' }, `${g.round} · ${g.dateLabel}`),
      h('dl', { class: 'meta-list' },
        metaRow('Docentes', cfg.professors),
        metaRow('Integrantes', cfg.members))));

    page.appendChild(h('section', {
      class: 'paso-slot', id: 'el-paso', 'data-slot': 'el-paso', 'aria-labelledby': 'el-paso-title',
    },
    h('h2', { id: 'el-paso-title', class: 'paso-slot__title' }, 'El paso'),
    h('p', { class: 'paso-slot__hint' }, 'Espacio reservado para el diagrama interactivo de un paso de $x_n$ a $x_{n+1}$.')));

    page.appendChild(h('p', { class: 'stub-note', 'data-stub': true }, 'Sección en preparación.'));
    EDO.tex.hydrate(page);
  }

  EDO.app.registerPage('inicio', {
    title: 'Inicio',
    nav: { label: 'Inicio', order: 10 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
