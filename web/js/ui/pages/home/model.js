/**
 * EDO.home.model - the content of the Inicio page with no DOM: the comparative question the group was assigned,
 * the PVI that threads the site, the guiding question, plus the optional members line.
 *
 *   THESIS {eyebrow, question, body[], links[]}  the comparative question of the talk, inline TeX in `body`
 *   CASE {eyebrow, preset, body[]}    the PVI that threads the site and where it comes from; the statement
 *                                     itself is read from `preset`, never typed
 *   QUESTION                          the guiding question, inline TeX
 *   membersText(members) -> 'A · B' | null   null (render nothing) while config.members is empty
 *
 * Load order: before home.js. Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.home = EDO.home || {};
    EDO.home.model = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * The topic assigned to the group is the comparison itself: the three methods are presented one by one before
   * this talk, so the site opens with the question that only the comparison answers.
   */
  const THESIS = Object.freeze({
    eyebrow: 'El tema de esta exposición',
    question: '¿Cuál de los tres métodos de segundo orden conviene usar, y por qué?',
    body: Object.freeze([
      'Taylor de grado 2, Euler Mejorado y RK2 alcanzan los tres el mismo orden de error global, $O(h^2)$, por caminos distintos: Taylor deriva $f$ para usar la curvatura $y_n\'\'$; Euler Mejorado y RK2 no derivan nada y evalúan $f$ dos veces por paso.',
      'Por eso la elección no se decide por el orden. Se decide por lo que cada método necesita, por lo que cuesta cada paso y por la constante del error, que cambia de problema en problema. Todo el sitio responde esa pregunta con valores calculados, no con afirmaciones.',
    ]),
    links: Object.freeze([
      { href: '#/comparativa', label: 'Ver la comparación completa' },
      { href: '#/ejercicios', label: 'Ver los tres métodos sobre el mismo ejercicio' },
    ]),
  });

  /**
   * The PVI that threads the whole site, and where it comes from. The apunte solves this same problem with
   * Taylor de grado 2 (Ejemplo 1) and again with RK2 de punto medio (Ejemplo 4), and it is Ej. 1c of both
   * prácticas, so it is the only problem of the course solved with more than one of the compared methods.
   * It is stated here, before the diagram below uses it, so the reader does not meet the equation in a caption
   * first. `preset` is the preset the statement is read from; no value of the statement is typed by hand.
   */
  const CASE = Object.freeze({
    eyebrow: 'El problema que recorre el sitio',
    preset: 'a1',
    body: Object.freeze([
      'No es un problema elegido por nosotros: es el de la cátedra. El apunte lo resuelve con Taylor de grado 2 (Ejemplo 1) y lo vuelve a resolver con RK2 de punto medio (Ejemplo 4), y aparece como Ejercicio 1c de la Práctica 05 y de la Práctica 06.',
      'Es el único problema que el curso resuelve con más de uno de los métodos que comparamos, así que sirve de hilo conductor: el diagrama de abajo, los ejemplos de la Teoría y el caso inicial de la Comparativa son este mismo PVI.',
    ]),
  });

  const QUESTION = '¿Cómo damos un paso de $x_n$ a $x_{n+1}$?';

  function membersText(members) {
    const names = (Array.isArray(members) ? members : [])
      .filter((m) => typeof m === 'string' && m.trim())
      .map((m) => m.trim());
    return names.length ? names.join(' · ') : null;
  }

  return {
    THESIS, CASE, QUESTION, membersText,
  };
}));
