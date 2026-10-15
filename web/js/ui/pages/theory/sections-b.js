/**
 * The RK2 family and the nomenclature note: which method each name denotes, and the fact that Euler Mejorado and
 * RK2 are two members of one family of two-stage order-2 methods. The reader needs this to read any table of the
 * site, so it stays in the recap; what the family implies about the error, and the derivation of the order
 * conditions that produces the coefficients, belong to the Comparativa and this section links to them.
 *
 * This is the last content section of the Teoría page and closes it with the links that continue the reading.
 * The sections that measured the comparison (error and order, computational cost, the comparative summary with
 * its decision guide) are no longer here either.
 *
 * Each section is `{id, title, toc, extension?, build(env)}`; see sections-a.js for the shape of `env`.
 * Load order: after sections-a.js, before sections-c.js. Also `require`-able.
 */
(function (root, factory) {
  const sections = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = sections;
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.theory = EDO.theory || { sections: [] };
    sections.forEach((s) => EDO.theory.sections.push(s));
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const T = String.raw;

  /* ======================================================================================================
     La familia RK2 y la nomenclatura
     ====================================================================================================== */

  function buildFamilia(env) {
    const { h, kit } = env;
    const {
      section, prose, im, formula, extension, goto, link, Q, familyMember,
    } = kit;

    const heun = familyMember(Q.of(1, 2));
    const mid = familyMember(Q.of(1, 1));

    return section('familia', 'La familia RK2 y la nomenclatura',
      prose(
        h('p', null, 'Euler Mejorado y RK2 se construyen de manera distinta, pero son dos casos de una misma familia: los métodos de Runge-Kutta de dos evaluaciones de ',
          im('f'), ' por paso y orden 2. La forma general reparte el paso entre dos pendientes:'),
        formula(T`y_{n+1} = y_n + h\,(a_1 k_1 + a_2 k_2), \qquad k_1 = f(x_n, y_n), \qquad k_2 = f(x_n + p\,h,\ y_n + q\,h\,k_1)`),
        // One sentence with the weights, computed from the parametrization; the derivation is on the Comparativa.
        h('p', null, 'Euler Mejorado reparte el peso en partes iguales entre las dos pendientes (',
          im(`a_1 = a_2 = ${Q.tex(heun.a2)}`), ') y el punto medio se lo da entero a la pendiente intermedia (',
          im(`a_1 = ${Q.tex(mid.a1)}`), ', ', im(`a_2 = ${Q.tex(mid.a2)}`), '). Taylor de grado 2 no pertenece a la familia: llega al mismo orden derivando ',
          im('f'), ' en lugar de evaluarla dos veces. De dónde salen esos pesos, y por qué son la única diferencia entre los errores de los tres, está en ',
          link('#/comparativa/constantes', 'Comparativa: la constante del error local'), '.')),
      prose(
        h('h3', null, 'Nomenclatura'),
        h('p', null, 'Los nombres cambian de un libro a otro. En la cátedra, «Euler Mejorado» es el método de Heun (trapecio con predictor de Euler) y «RK2» es el método del punto medio. '
          + 'Otros textos llaman al punto medio «polígono mejorado» o «Euler modificado», y usan «Euler modificado» también para el método de Heun; hay autores que llaman «Heun» a un método de tercer orden. '
          + 'Por eso conviene identificar cada método por su fórmula y no solo por el nombre.')),
      extension('Hay infinitos miembros',
        h('p', null, 'Las condiciones de orden dejan un parámetro libre, así que cada valor de ', im(T`a_2 \ne 0`),
          ' da un método de orden 2 distinto, con ', im('a_1 = 1 - a_2'), ' y ', im(T`p = q = \frac{1}{2a_2}`),
          '. Euler Mejorado y el punto medio son dos de ellos; un tercero que aparece en algunos textos se llama «Ralston» y no figura en el apunte. La tabla completa, con el coeficiente de error de cada uno, está en ',
          link('#/comparativa/constantes', 'la Comparativa'), '.')),
      // The reading ends here: where to go next, and where the words of this page are defined.
      prose(
        h('p', null, 'Para seguir: la ', link('#/comparativa', 'Comparativa'),
          ' mide los tres métodos sobre el mismo problema (error, orden de convergencia, costo y caso lineal) y responde cuál elegir; los ',
          link('#/ejercicios', 'ejercicios resueltos'), ' repiten el procedimiento paso a paso y el ',
          link('#/simulador', 'simulador'), ' lo aplica a funciones propias. Los términos de esta página están en el ',
          goto('glosario', 'glosario'), '.')));
  }

  return [
    {
      id: 'familia', title: 'La familia RK2 y la nomenclatura', toc: 'Familia RK2 y nomenclatura', build: buildFamilia,
    },
  ];
}));
