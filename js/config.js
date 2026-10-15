/**
 * EDO.config - the editable facts of the deliverable: group data, version and build date,
 * talk settings and dependency switches. Pure data: no DOM access, no side effects.
 *
 * Load order: first script of the page (deps.js and everything else read it).
 * Also `require`-able in Node so the tests can check it.
 *
 * Open items for the group (never invent them here):
 *  - `talk.minutes`: the real time limit of the exposition (20 is only a placeholder).
 *  - `deps.vendored`: set to true after copying Chart.js and KaTeX into web/vendor/ (see README).
 *  - `apunte.mostrarVerificacion`: off by default (see the `apunte` block below).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EDO = root.EDO || {};
    root.EDO.config = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const config = {
    /** Version shown in the footer: the exposition must use the version delivered beforehand. */
    version: '1.0.0',
    /** ISO date (YYYY-MM-DD) of the build; bump it together with `version`. */
    buildDate: '2026-10-06',

    group: {
      number: 10,
      course: 'Cátedras de Modelos Numéricos, Análisis Numérico y Cálculo Avanzado',
      school: 'U.T.N. Facultad Regional La Plata',
      round: 'Ronda 3: Ecuaciones Diferenciales Ordinarias (PVI)',
      topic: 'Comparativa de los métodos: Taylor, Euler Mejorado y RK2',
      dateISO: '2026-10-19',
      dateLabel: 'Lunes 19 de octubre de 2026',
      slot: 6,
    },

    professors: ['Ing. Diego Amiconi', 'Germán Céspedes'],

    /** Group members, one full name per entry, in the order in which they expose. */
    members: [
      'Bautista Biscayart',
      'Santino Maya',
      'Milagros Belén Olivera',
      'Zoe Ramljak',
    ],

    /**
     * Presentation settings. `minutes` is a placeholder that can be edited at runtime on Inicio (the
     * choice is stored in prefs). The agenda shares are provisional and must sum to 1.
     */
    talk: {
      minutes: 20,
      agenda: [
        { id: 'inicio', label: 'Inicio', share: 0.10 },
        { id: 'teoria', label: 'Teoría', share: 0.25 },
        { id: 'ejercicios', label: 'Ejercicios', share: 0.20 },
        { id: 'simulador', label: 'Simulador', share: 0.20 },
        { id: 'comparativa', label: 'Comparativa', share: 0.15 },
        { id: 'audiencia', label: 'Audiencia', share: 0.10 },
      ],
    },

    /**
     * The four worked examples of the apunte of the cátedra, as the apunte prints them.
     *
     * `published` lists the values the apunte writes for y1, y2, ... of that example; they are the only
     * numbers of the site typed by hand. Everything the site shows is recomputed by the engine from the
     * same preset (`preset`) and the same method (`method`), so each published value can be checked.
     *
     * `mostrarVerificacion: false` (the default) means the site shows only its own computed values and
     * says nothing about any difference. Set it to true and the Ejercicios page adds, under the examples
     * whose published value does not follow from the apunte's own expression, one neutral line with both
     * numbers. Nothing else changes.
     */
    apunte: {
      mostrarVerificacion: false,
      examples: {
        ej1: { preset: 'a1', method: 'taylor', published: [1.23, 1.5426, 1.9727] },
        ej2: { preset: 'a2', method: 'euler', published: [0.5, 1.4297] },
        ej3: { preset: 'a3', method: 'heun', published: [1.125, 1.4843] },
        ej4: { preset: 'a4', method: 'rk2', published: [1.231, 1.5452, 1.9779] },
      },
    },

    /**
     * Third-party dependencies (see deps.js). `vendored: false` means the loader never requests
     * web/vendor/ paths, so there are no 404s in the console. Every version is exact: the page pins
     * what it loads instead of following a moving tag.
     */
    deps: {
      vendored: false,
      katex: '0.16.11',
      chart: '4.4.7',
      /** chartjs-plugin-zoom: zoom and pan on "El paso". Only requested once Chart.js is there. */
      zoom: '2.2.0',
      /** Hammer.js: the pinch gesture of the zoom plugin. Without it wheel and drag zoom still work. */
      hammer: '2.0.8',
      fonts: true,
    },
  };

  Object.freeze(config.group);
  Object.freeze(config.professors);
  Object.freeze(config.deps);
  // `members`, `talk` and `apunte` stay mutable: the group edits the first and the last, Inicio adjusts `talk`.
  return Object.freeze(config);
}));
