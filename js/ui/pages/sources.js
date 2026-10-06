/**
 * Page 'fuentes' (T1 stub, replaced by a later task): heading, one-line description and a quiet stub marker.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;

  function render(page) {
    page.appendChild(h('div', { class: 'stack' },
      h('h1', null, 'Fuentes'),
      h('p', { class: 'lead' }, 'Fuentes consultadas, software utilizado y verificaciones realizadas.'),
      h('p', { class: 'stub-note', 'data-stub': true }, 'Sección en preparación.')));
  }

  EDO.app.registerPage('fuentes', {
    title: 'Fuentes',
    nav: { label: 'Fuentes', order: 70 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
