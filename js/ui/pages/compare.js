/**
 * Page 'comparativa' (T1 stub, replaced by a later task): heading, one-line description and a quiet stub marker.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;

  function render(page) {
    page.appendChild(h('div', { class: 'stack' },
      h('h1', null, 'Comparativa'),
      h('p', { class: 'lead' }, 'Comparación de la exactitud, el orden de convergencia y el costo de los métodos.'),
      h('p', { class: 'stub-note', 'data-stub': true }, 'Sección en preparación.')));
  }

  EDO.app.registerPage('comparativa', {
    title: 'Comparativa',
    nav: { label: 'Comparativa', order: 50 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
