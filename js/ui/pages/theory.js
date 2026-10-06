/**
 * Page 'teoria' (T1 stub, replaced by a later task): heading, one-line description and a quiet stub marker.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;

  function render(page) {
    page.appendChild(h('div', { class: 'stack' },
      h('h1', null, 'Teoría'),
      h('p', { class: 'lead' }, 'Fundamentos del problema de valor inicial y de los métodos de Taylor, Euler Mejorado y RK2.'),
      h('p', { class: 'stub-note', 'data-stub': true }, 'Sección en preparación.')));
  }

  EDO.app.registerPage('teoria', {
    title: 'Teoría',
    nav: { label: 'Teoría', order: 20 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
