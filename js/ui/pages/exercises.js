/**
 * Page 'ejercicios' (T1 stub, replaced by a later task): heading, one-line description and a quiet stub marker.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;

  function render(page) {
    page.appendChild(h('div', { class: 'stack' },
      h('h1', null, 'Ejercicios'),
      h('p', { class: 'lead' }, 'Ejercicios resueltos paso a paso con la notación de la cátedra y banco de práctica.'),
      h('p', { class: 'stub-note', 'data-stub': true }, 'Sección en preparación.')));
  }

  EDO.app.registerPage('ejercicios', {
    title: 'Ejercicios',
    nav: { label: 'Ejercicios', order: 30 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
