/**
 * EDO.config - the editable facts of the deliverable: group data, version and build date,
 * talk settings and dependency switches. Pure data: no DOM access, no side effects.
 *
 * Load order: first script of the page (deps.js and everything else read it).
 * Also `require`-able in Node so the tests can check it.
 *
 * Open items for the group (never invent them here):
 *  - `members`: full names of the group members. While the array is empty nothing is rendered.
 *  - `talk.minutes`: the real time limit of the exposition (20 is only a placeholder).
 *  - `deps.vendored`: set to true after copying Chart.js and KaTeX into web/vendor/ (see README).
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

    /** Group members, one full name per entry. Empty on purpose: nothing visible is rendered. */
    members: [],

    /**
     * Presentation settings. `minutes` is a placeholder that can be edited at runtime (the timer
     * stores the user's choice in prefs). The agenda shares are provisional and must sum to 1.
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
     * Third-party dependencies (see deps.js). `vendored: false` means the loader never requests
     * web/vendor/ paths, so there are no 404s in the console.
     */
    deps: {
      vendored: false,
      katex: '0.16.11',
      chart: '4.4.7',
      fonts: true,
    },
  };

  Object.freeze(config.group);
  Object.freeze(config.professors);
  Object.freeze(config.deps);
  // `members` and `talk` stay mutable: the group edits one and the timer adjusts the other.
  return Object.freeze(config);
}));
