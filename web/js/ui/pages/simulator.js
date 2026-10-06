/**
 * Page 'simulador' (T1 stub, replaced by a later task): heading, one-line description and a quiet stub marker.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;

  function render(page) {
    page.appendChild(h('div', { class: 'stack' },
      h('h1', null, 'Simulador'),
      h('p', { class: 'lead' }, 'Resolución de un problema de valor inicial con los métodos elegidos, con tablas, gráficos y pasos intermedios.'),
      h('p', { class: 'stub-note', 'data-stub': true }, 'Sección en preparación.')));
  }

  EDO.app.registerPage('simulador', {
    title: 'Simulador',
    nav: { label: 'Simulador', order: 40 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
