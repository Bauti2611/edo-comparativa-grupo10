/**
 * The problema de valor inicial and the three methods of the course (Taylor de grado 2, Euler Mejorado,
 * RK2 de punto medio), derived the way the apunte presents them. The PVI section also states, once and
 * prominently, why Euler is in every table: it is the common building block and the reference line, not a
 * fourth method under comparison.
 *
 * Each section is `{id, title, toc, build(env)}`; `build` returns one `<section>` element. `env` carries what a
 * builder may use (see theory.js): `h`, `kit`, `data` (EDO.theory.data), `expr`, `format`, `diagram(opts, label)`.
 * Course content is plain text; everything that goes beyond the apunte sits in a dashed `.callout` tagged
 * "Ampliación". Every number comes from the engine at build time (EDO.theory.data or EDO.methods); the page
 * has no hand-typed results. Math is `$...$` text rendered afterwards by EDO.tex.hydrate.
 *
 * The order of the operations of each method by hand lives in the Receta (sections-c.js), which the reader
 * reaches before these sections; the measurement of error and cost lives on the Comparativa page.
 *
 * Load order: after kit.js, before sections-b.js. Also `require`-able in Node (returns the section list).
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

  /** Key of each method in `data.costs()` (Taylor is listed by degree). */
  const COST_KEYS = Object.freeze({
    euler: 'euler', taylor: 'taylor2', heun: 'heun', rk2: 'rk2',
  });

  /**
   * The fast path of a method section: the Ordenada Genérica, what the method needs, what one step costs and its
   * global order. The groups that expose before this one present each method on its own, so every section opens
   * with this summary and leaves the derivation folded below it.
   * @param {object} env The section environment (see the file header).
   * @param {string} id Method id ('taylor' | 'heun' | 'rk2').
   * @param {string} genericTex TeX of the Ordenada Genérica, as the apunte writes it.
   * @param {string} captionText What the caption under the formula says.
   * @param {Array} needs Children describing what the method needs before it can be applied.
   */
  function essentials(env, id, genericTex, captionText, needs) {
    const { h, kit, data } = env;
    const {
      callout, formula, caption, im, fromApunte, link, goto,
    } = kit;
    const cost = data.costs()[COST_KEYS[id]];
    const order = data.orders()[id];
    const evals = `${cost.f} evaluación${cost.f === 1 ? '' : 'es'} de `;
    return callout({ kind: 'note', label: 'Lo esencial' },
      formula(genericTex, { hl: true }),
      caption(fromApunte(), ' ', captionText),
      h('ul', null,
        h('li', null, 'Qué necesita: ', ...needs),
        h('li', null, 'Costo por paso: ', evals, im('f'),
          cost.deriv
            ? ` y ${cost.deriv} de sus derivadas parciales, ${cost.total} en total.`
            : `, ${cost.total} en total.`),
        // One sentence here; the measurement of the error and of the cost belongs to the Comparativa.
        h('li', null, 'Error global: ', im(order === 1 ? 'O(h)' : `O(h^{${order}})`),
          '. Cada método tiene su orden de error; cuánto se equivoca y cuánto cuesta se mide en la ',
          link('#/comparativa/convergencia', 'Comparativa'), '.'),
        h('li', null, 'Cómo se aplica a mano: ', goto('receta', 'Receta para resolver a mano'), '.')));
  }

  /* ======================================================================================================
     1. El problema de valor inicial
     ====================================================================================================== */

  function buildPvi(env) {
    const {
      h, kit, data, expr, format,
    } = env;
    const {
      section, prose, im, callout, extension, fold, link,
    } = kit;
    const ex = data.example();
    const orders = data.orders();
    /** By how much halving h divides the global error of a method of that order: 2^p, computed, never typed. */
    const halving = (id) => format.num(2 ** orders[id], { decimals: 0 });
    const num = (v) => format.num(v, { decimals: 4 });
    const fTeX = expr.toTeX(ex.fNode, { indep: 'x' });
    const xAt = (k) => num(ex.x0 + k * ex.h);

    const notation = [
      [im('h'), 'Paso: distancia entre dos abscisas consecutivas.'],
      [im('x_{n+1} = x_n + h'), [T`Abscisas del cálculo: `, im('x_n = x_0 + n\\,h'), '.']],
      [im('x_0') + ' y ' + im('x_f'), 'Valor inicial y Valor final del dominio o intervalo de trabajo.'],
      [im(T`y_n \approx y(x_n)`), [T`Valor que calcula el método en `, im('x_n'), T`; aproxima al valor exacto `, im('y(x_n)'), ', que no se conoce.']],
      [im(T`y_n' = f(x_n, y_n)`), ['Pendiente de la solución en el punto ', im('(x_n, y_n)'), '. El apunte la escribe ', im(T`f\bigl(x_n, y(x_n)\bigr)`), '; en el cálculo se usa el valor aproximado ', im('y_n'), '.']],
      [im(T`N = \frac{x_f - x_0}{h}`), ['Cantidad de iteraciones; tiene que ser un entero. Se itera con ', im(T`n = 0, 1, \dots, N-1`), '.']],
      ['Ordenada Genérica', ['La fórmula de ', im('y_{n+1}'), ' en función de ', im('y_n'), '. Se escribe primero con la fórmula general del método y después con los datos del problema.']],
    ];

    return section('pvi', 'El problema de valor inicial',
      prose(
        h('p', null, 'Un ', h('strong', null, 'problema de valor inicial'), ' (PVI) queda definido por cuatro cosas:'),
        h('ul', null,
          h('li', null, T`la ecuación diferencial `, im(T`y' = f\bigl(x, y(x)\bigr)`), ';'),
          h('li', null, 'la condición inicial ', im('y(x_0) = y_0'), ';'),
          h('li', null, 'el dominio o intervalo de trabajo ', im(T`x_0 \le x \le x_f`), ';'),
          h('li', null, 'el paso ', im('h'), '.')),
        h('p', null, 'En rigor, el paso no forma parte del problema sino de la manera de resolverlo; el apunte lo incluye entre los datos porque sin él no se puede calcular.'),
        h('p', null, 'Casi siempre se resuelve de forma numérica: muchas ecuaciones no tienen una solución ', im('y(x)'),
          ' expresable con funciones elementales (por ejemplo, ', im('y\' = x + y^{2}'), ', ejercicio 3c de la Práctica 05). Un método numérico no busca esa fórmula: parte de la condición inicial y calcula valores aproximados ',
          im(T`y_1, y_2, \dots`), ' en los puntos ', im(T`x_1, x_2, \dots`), ', separados por el paso ', im('h'), '.'),
        // The running example is named here, once, with its source: every section below uses it, and the reader
        // should know whose problem it is before seeing it in a diagram. Values come from the preset.
        h('p', null, 'Todos los ejemplos de esta página son el mismo PVI, el de la cátedra: ',
          im(T`y' = ${fTeX}`), ', con ', im(`y(${num(ex.x0)}) = ${num(ex.y0)}`), ' y paso ', im(`h = ${num(ex.h)}`),
          '. Es el Ejemplo 1 del apunte, resuelto con Taylor de grado 2, y el Ejemplo 4, el mismo problema resuelto con RK2 de punto medio; también es el Ejercicio 1c de la Práctica 05 y de la Práctica 06. Al repetirlo en los tres métodos, lo único que cambia de una sección a otra es la fórmula.')),
      // Reference material, not reading: a recap reader looks a symbol up instead of going through the list.
      fold('Notación: los símbolos que usa el apunte',
        h('dl', { class: 'theory-notation' }, notation.map(([term, description]) => h('div', { class: 'theory-notation__row' },
          h('dt', null, term),
          h('dd', null, description))))),
      h('p', { class: 'theory-lead-in' }, h('strong', null, 'Un paso, a la vista. '),
        'El diagrama muestra el paso más simple, el de Euler: se parte de ', im('(x_n, y_n)'), ' y se avanza una distancia ', im('h'),
        ' con la pendiente ', im("y_n'"), '. Los demás métodos de esta página mejoran ese paso. El deslizador cambia ', im('h'),
        ' y la tabla compara el resultado con el valor exacto.'),
      env.diagram({ methods: 'euler' }, 'Diagrama de un paso del método de Euler'),
      // Euler has no section of its own, and it should not: stated here, once, so no table of the site needs to
      // explain again why it is in it. The two factors come from the orders of the catalogue, not from the prose.
      callout({ kind: 'result', label: 'Euler no es un cuarto método: es la línea de base' },
        h('p', null, 'Euler no se compara como un método más. Es el ', h('strong', null, 'ladrillo común'),
          ' de los otros tres y la ', h('strong', null, 'línea de referencia'), ' contra la que se los mide:'),
        h('ul', null,
          h('li', null, 'El predictor de Euler Mejorado, ', im(T`y_n + h\,y_n'`), ', es exactamente un paso de Euler.'),
          h('li', null, 'El ', im(T`k_1 = h\,f(x_n, y_n)`), ' de RK2 es ese mismo incremento de Euler, usado para tantear el punto medio.'),
          h('li', null, 'Taylor de grado 2 es Euler más el término cuadrático: Euler es Taylor de grado 1.')),
        h('p', null, 'Por eso sigue en todas las tablas: sin un método de primer orden, «segundo orden» no se mide contra nada. Al reducir ',
          im('h'), ' a la mitad, el error de Euler se divide por unas ', h('strong', { class: 'num' }, halving('euler')),
          ' veces y el de los otros tres por unas ', h('strong', { class: 'num' }, halving('taylor')), '; eso se mide en ',
          link('#/comparativa/convergencia', 'Comparativa: orden de convergencia'), ', y el orden de cada método está en la ',
          link('#/comparativa/resumen', 'tabla resumen de la Comparativa'), '.')),
      prose(
        h('h3', null, 'Paso simple y paso múltiple'),
        h('p', null, 'Un método es de ', h('strong', null, 'paso simple'), ' cuando calcula ', im('y_{n+1}'), ' usando solo el punto anterior ', im('(x_n, y_n)'),
          '. Los de ', h('strong', null, 'paso múltiple'), ', como Adams-Bashforth, usan varios puntos anteriores y necesitan arrancar con valores calculados por un método de paso simple. Los cuatro métodos de esta página (Euler, Taylor, Euler Mejorado y RK2) son de paso simple.')),
      callout({ kind: 'note', label: 'Ejemplo que se usa en toda la página' },
        h('p', null, 'Es el problema de los Ejemplos 1 y 4 del apunte: ', im(`y' = ${fTeX}`), ' con ', im(`y(${num(ex.x0)}) = ${num(ex.y0)}`),
          ' en el intervalo ', im(`${num(ex.x0)} \\le x \\le ${num(ex.xf)}`), ' y paso ', im(`h = ${num(ex.h)}`), '.'),
        h('p', null, 'Entonces ', im(`x_0 = ${num(ex.x0)}`), ', ', im(`y_0 = ${num(ex.y0)}`), ', ', im(`x_f = ${num(ex.xf)}`), ' y ',
          im(`N = \\frac{${num(ex.xf)} - ${num(ex.x0)}}{${num(ex.h)}} = ${ex.N}`), ' iteraciones, con ',
          im(`x_1 = ${xAt(1)}`), ', ', im(`x_2 = ${xAt(2)}`), ' y ', im(`x_3 = ${xAt(3)}`), '. Su solución exacta es ', im(`y = ${ex.exact.tex}`),
          '; solo sirve para verificar, porque en un problema real no se conoce.')),
      extension('Existencia y unicidad',
        h('p', null, 'Si ', im('f'), ' es continua y cumple una condición de Lipschitz respecto de ', im('y'), ' en el dominio de trabajo, es decir, si existe ', im('L'),
          ' tal que ', im(T`|f(x, y_1) - f(x, y_2)| \le L\,|y_1 - y_2|`), ' para ', im(T`x_0 \le x \le x_f`), ' y todo par ', im('y_1, y_2'),
          ', el PVI tiene una única solución en ', im('[x_0, x_f]'), '. Si no se cumple, la solución puede no ser única o dejar de existir antes de ', im('x_f'), '.')));
  }

  /* ======================================================================================================
     2. Taylor de grado 2
     ====================================================================================================== */

  function buildTaylor(env) {
    const {
      h, kit, data, format,
    } = env;
    const {
      section, prose, im, formula, caption, callout, fold, extension, goto, link, fromApunte,
    } = kit;
    const tx = data.taylorExample();
    const first = data.firstStep('trunc');
    const y1 = format.num(first.taylor.y1, { decimals: 4 });

    const handDerivation = T`\begin{aligned}
f(x, y) &= ${tx.fTeX} \\
f_x &= ${tx.fxTeX}, \qquad f_y = ${tx.fyTeX} \\
y'' &= f_x + f_y\,f = ${tx.fxTeX} + ${tx.fyTeX}\cdot(${tx.fTeX}) = ${tx.y2TeX}
\end{aligned}`;

    return section('taylor', 'Método de Taylor de grado 2',
      essentials(env, 'taylor', first.taylor.generic, 'Ordenada Genérica de Taylor de grado 2.',
        ['Hay que derivar ', im('f'), ' a mano: necesita ', im('f_x'), ' y ', im('f_y'), ' para armar ', im("y''"), '.']),
      fold('De dónde sale la fórmula',
        prose(
          h('p', null, 'Se desarrolla la solución en serie de Taylor alrededor de ', im('x_n'), ', con ', im('h = x_{n+1} - x_n'), ':'),
          formula(T`y(x_{n+1}) = y(x_n) + h\,y'(x_n) + \frac{h^{2}}{2!}\,y''(x_n) + \frac{h^{3}}{3!}\,y'''(\xi), \qquad x_n < \xi < x_{n+1}`),
          h('p', null, 'El último término es el resto de la serie. Como ', im(T`\xi`), ' no se conoce, se descarta. Al reemplazar ', im('y(x_n)'), ' por ', im('y_n'),
            ' y las derivadas por sus valores en ', im('(x_n, y_n)'), ' queda la Ordenada Genérica de arriba, llamada de grado 2 por el grado del polinomio de Taylor que se usa.'),
          h('p', null, 'El resto descartado es del orden de ', im('h^{3}'), ': ese es el error que se comete en cada paso (se mide en ',
            link('#/comparativa/constantes', 'Comparativa: la constante del error local'), ').'))),
      prose(
        h('h3', null, 'Cómo se obtiene ', im("y''")),
        h('p', null, 'La ecuación da ', im("y' = f(x, y(x))"), ', pero la fórmula necesita también ', im("y''"),
          '. Se obtiene derivando ', im("y'"), ' respecto de ', im('x'), ' con la regla de la cadena, porque ', im('y'), ' depende de ', im('x'), ':'),
        formula(T`y'' = \frac{\partial f}{\partial x} + \frac{\partial f}{\partial y}\,\frac{dy}{dx} = \frac{\partial f}{\partial x} + \frac{\partial f}{\partial y}\,y'`),
        h('p', null, 'En cada iteración las derivadas parciales se evalúan en ', im('(x_n, y_n)'), ' y ', im("y_n' = f(x_n, y_n)"), '. Para obtener ', im("y''"), ' a mano:'),
        h('ol', null,
          h('li', null, 'Derivar ', im('f'), ' respecto de ', im('x'), ', con ', im('y'), ' como constante: ', im(T`f_x = \partial f / \partial x`), '.'),
          h('li', null, 'Derivar ', im('f'), ' respecto de ', im('y'), ', con ', im('x'), ' como constante: ', im(T`f_y = \partial f / \partial y`), '.'),
          h('li', null, 'Armar ', im('y\'\' = f_x + f_y\\,f'), ', porque ', im("y' = f"), '.'),
          h('li', null, 'Simplificar la expresión y, en cada iteración, evaluarla en ', im('(x_n, y_n)'), '.'))),
      fold('La derivación completa en el ejemplo de la página',
        prose(
          h('p', null, 'Con ', im(`f(x, y) = ${tx.fTeX}`), ':'),
          formula(handDerivation),
          h('p', null, 'El apunte llega a la misma expresión. Con ella, la primera iteración da ', im(`y_1 = ${y1}`), ' (se detalla en ', goto('receta', 'Receta para resolver a mano'), ').'))),
      h('p', { class: 'theory-lead-in' }, 'En el diagrama, la parábola es el polinomio de Taylor de grado 2 en ', im('x_n'), ': tiene la pendiente ', im("y_n'"), ' y la curvatura ', im("y_n''"),
        ' de la solución en el punto de partida. Acompaña a la curva exacta mientras ', im('h'), ' es pequeño y se separa cuando crece.'),
      env.diagram({ methods: 'taylor' }, 'Diagrama de un paso de Taylor de grado 2'),
      // One sentence about the higher degrees; what they cost and what they buy is measured on the Comparativa.
      extension('Grados mayores',
        h('p', null, 'El apunte presenta solo el grado 2. Si se conservan más términos de la serie se obtienen grados mayores:'),
        formula(T`y_{n+1} = y_n + h\,y_n' + \frac{h^{2}}{2!}\,y_n'' + \frac{h^{3}}{3!}\,y_n''' + \frac{h^{4}}{4!}\,y_n^{(4)} + \cdots`),
        h('p', null, 'Cada grado nuevo exige derivar ', im('f'), ' otra vez a mano, con el operador de derivada total ',
          im(T`D(g) = \frac{\partial g}{\partial x} + \frac{\partial g}{\partial y}\,f`), ': ', im("y'' = D(f)"), ', ',
          im("y''' = D(D(f))"), ' y así sucesivamente. Cuánto cuesta cada grado y cuánto baja el error a cambio se mide en ',
          link('#/comparativa/costo', 'Comparativa: costo y precisión'), '.')));
  }

  /* ======================================================================================================
     3. Euler Mejorado (Heun)
     ====================================================================================================== */

  function buildHeun(env) {
    const { h, kit, data } = env;
    const {
      section, prose, im, formula, fold, goto,
    } = kit;
    const first = data.firstStep('trunc');

    return section('heun', 'Euler Mejorado (método de Heun)',
      essentials(env, 'heun', first.heun.generic,
        ['Ordenada Genérica de Euler Mejorado. El apunte escribe ', im('2!'), ' en el denominador, que vale 2.'],
        ['Nada más que ', im('f'), ': ninguna derivada parcial.']),
      fold('De dónde sale la fórmula',
        prose(
          h('p', null, 'Se integra la ecuación ', im("y' = f(x, y)"), ' entre ', im('x_n'), ' y ', im('x_{n+1}'), ':'),
          formula(T`y(x_{n+1}) - y(x_n) = \int_{x_n}^{x_{n+1}} f\bigl(x, y(x)\bigr)\,dx`),
          h('p', null, 'La integral se aproxima con la regla del trapecio, que promedia el valor del integrando en los dos extremos:'),
          formula(T`y_{n+1} = y_n + \frac{h}{2}\Bigl[f(x_n, y_n) + f(x_{n+1}, y_{n+1})\Bigr]`),
          h('p', null, 'Esta fórmula es implícita: ', im('y_{n+1}'), ' aparece también en el lado derecho y no se puede calcular directamente. Para volverla explícita, en el lado derecho se reemplaza ',
            im('y_{n+1}'), ' por una primera estimación, el ', h('strong', null, 'predictor'), ' de Euler, ', im(T`\tilde{y}_{n+1} = y_n + h\,y_n'`), '. El resultado es la Ordenada Genérica de arriba.'))),
      prose(
        h('h3', null, 'Predictor y corrector'),
        h('p', null, 'El método se describe como un par predictor-corrector. El predictor es el paso de Euler y da una estimación provisional ', im(T`\tilde{y}_{n+1}`),
          '. El corrector es la regla del trapecio, que usa la pendiente en ese punto para mejorar el resultado. El orden en que se hacen las cuatro operaciones de una iteración está en ',
          goto('receta', 'la Receta'), ', junto con la primera iteración resuelta.'),
        h('h3', null, 'Qué significa en el diagrama'),
        h('p', null, 'Euler avanza con la pendiente del inicio del paso. Euler Mejorado avanza con el promedio de dos pendientes: la del inicio, ', im("y_n'"),
          ', y la que tiene la ecuación en el extremo predicho, ', im(T`f(x_{n+1}, \tilde{y}_{n+1})`), '. Si la pendiente cambia a lo largo del paso, ese promedio representa mejor al paso entero que la pendiente del inicio.')),
      h('p', { class: 'theory-lead-in' }, 'En el diagrama, el segmento fino con el punto hueco es el paso de Euler (el predictor); la marca en su extremo es la pendiente allí. El paso final, más grueso, usa el promedio de las dos pendientes.'),
      env.diagram({ methods: 'heun' }, 'Diagrama de un paso de Euler Mejorado'));
  }

  /* ======================================================================================================
     4. RK2 (punto medio)
     ====================================================================================================== */

  function buildRk2(env) {
    const { h, kit, data } = env;
    const {
      section, prose, im, formula, fold, callout, goto,
    } = kit;
    const first = data.firstStep('trunc');

    return section('rk2', 'Runge-Kutta de grado 2 (RK2, punto medio)',
      essentials(env, 'rk2', first.rk2.generic, 'Ordenada Genérica de RK2.',
        ['Nada más que ', im('f'), ': ninguna derivada parcial, igual que Euler Mejorado.']),
      fold('De dónde sale la fórmula',
        prose(
          h('p', null, 'Se parte de la misma integral que en Euler Mejorado, pero ahora se la aproxima con la regla del punto medio: el ancho del intervalo por el valor del integrando en su centro.'),
          formula(T`y_{n+1} = y_n + h\,f\Bigl(x_n + \frac{h}{2},\ y\bigl(x_n + \tfrac{h}{2}\bigr)\Bigr)`),
          h('p', null, 'El valor ', im(T`y(x_n + h/2)`), ' no se conoce. Se lo estima con medio paso de Euler: ', im(T`y(x_n + h/2) \approx y_n + \frac{h}{2}\,y_n' = y_n + \frac{k_1}{2}`),
            ', donde ', im(T`k_1 = h\,f(x_n, y_n) = h\,y_n'`), '. El resultado es la Ordenada Genérica de arriba.'))),
      callout({ kind: 'warning', label: ['Atención con ', im('k_1')] },
        h('p', null, 'En el apunte ', im('k_1'), ' ya incluye el factor ', im('h'), '. En otros libros ', im('k_1 = f(x_n, y_n)'), ' no lo lleva y la fórmula se escribe con ', im(T`\frac{h}{2}\,k_1`),
          '; es el mismo método. Además, el apunte lo llama «de grado 2» y la práctica de la segunda parte, «de 2º orden».')),
      prose(
        h('p', null, 'El orden en que se hacen las tres operaciones de una iteración está en ', goto('receta', 'la Receta'),
          ', junto con la primera iteración resuelta.'),
        h('h3', null, 'Qué significa en el diagrama'),
        h('p', null, 'Se avanza medio paso con Euler hasta el punto medio, allí se mide la pendiente de la ecuación y con esa pendiente se da el paso completo desde ', im('(x_n, y_n)'),
          '. La pendiente del punto medio representa al intervalo mejor que la del extremo izquierdo.')),
      h('p', { class: 'theory-lead-in' }, 'En el diagrama, el segmento fino con el punto hueco llega hasta el punto medio y la marca allí es la pendiente medida. El paso completo, más grueso, usa esa pendiente.'),
      env.diagram({ methods: 'rk2' }, 'Diagrama de un paso de RK2 (punto medio)'));
  }

  return [
    {
      id: 'pvi', title: 'El problema de valor inicial', toc: 'Problema de valor inicial', build: buildPvi,
    },
    {
      id: 'taylor', title: 'Método de Taylor de grado 2', toc: 'Taylor de grado 2', build: buildTaylor,
    },
    {
      id: 'heun', title: 'Euler Mejorado (método de Heun)', toc: 'Euler Mejorado', build: buildHeun,
    },
    {
      id: 'rk2', title: 'Runge-Kutta de grado 2 (RK2, punto medio)', toc: 'RK2 (punto medio)', build: buildRk2,
    },
  ];
}));
