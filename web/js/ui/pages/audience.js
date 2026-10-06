/**
 * Page 'audiencia' (T1 stub, replaced by a later task): heading, one-line description and a quiet stub marker.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;

  function render(page) {
    page.appendChild(h('div', { class: 'stack' },
      h('h1', null, 'Audiencia'),
      h('p', { class: 'lead' }, 'Preguntas y actividades para verificar la comprensión del tema.'),
      h('p', { class: 'stub-note', 'data-stub': true }, 'Sección en preparación.')));
  }

  EDO.app.registerPage('audiencia', {
    title: 'Audiencia',
    nav: { label: 'Audiencia', order: 60 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
