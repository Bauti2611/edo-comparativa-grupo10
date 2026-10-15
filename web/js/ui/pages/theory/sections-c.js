/**
 * The cátedra's recipe and the glossary. The Receta is the second section of the page, right after the PVI,
 * because it is what the group needs if it is asked to solve an exercise at the board: it states, per method,
 * the Ordenada Genérica, the order in which the operations are done by hand, and one worked first iteration in
 * the apunte's own layout (`.step-block`s that follow the display setting).
 *
 * The first iterations come from EDO.theory.data.firstStep(mode); the end values from EDO.methods. The blocks are
 * rebuilt when the display mode changes (`env.onDisplay`): the apunte truncates to 4 decimals, the computation is
 * always full precision. Each section is `{id, title, toc, build(env)}`; see sections-a.js for the shape of `env`
 * (here also `env.methods`, `env.uid`, `env.displayMode`, `env.setDisplayMode`, `env.onDisplay`, `env.hydrate`).
 *
 * The comparative summary that used to close this file (the four methods side by side and the «¿Cuál elegir?»
 * guide) lives on the Comparativa page: the decision guide exists in exactly one place.
 *
 * Load order: after sections-b.js, before theory.js. Also `require`-able in Node.
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

  const NAMES = {
    euler: 'Euler', taylor: 'Taylor de grado 2', heun: 'Euler Mejorado', rk2: 'RK2 (punto medio)',
  };
  const BY = {
    taylor: 'Taylor de grado 2', heun: 'Euler Mejorado', rk2: 'RK2',
  };

  /* ======================================================================================================
     Receta para resolver a mano
     ====================================================================================================== */

  function buildReceta(env) {
    const {
      h, kit, data, methods, format,
    } = env;
    const {
      section, prose, im, formula, methodChip, link,
    } = kit;
    const ex = data.example();
    const xf = ex.xf;
    const n = (v) => format.num(v, { decimals: 4 });
    const finals = {};
    ['taylor', 'heun', 'rk2'].forEach((id) => { finals[id] = methods.solve(id, ex).ys[ex.N]; });
    const sample = finals.taylor;

    /**
     * The order of the operations of one iteration of each method, by hand. This is the part the group applies
     * at the board, so it sits next to the Ordenada Genérica instead of inside each method's own section.
     */
    const operations = {
      taylor: () => [
        h('li', null, 'Derivar ', im('f'), ' una sola vez, antes de iterar: ', im(T`f_x = \partial f/\partial x`), ', ',
          im(T`f_y = \partial f/\partial y`), ' y ', im(T`y'' = f_x + f_y\,f`), '.'),
        h('li', null, 'Evaluar la pendiente: ', im("y_n' = f(x_n, y_n)"), '.'),
        h('li', null, 'Evaluar la curvatura: ', im("y_n''"), ' en ', im('(x_n, y_n)'), '.'),
        h('li', null, 'Reemplazar ', im('y_n'), ', ', im("y_n'"), ' y ', im("y_n''"), ' en la Ordenada Genérica y anotar ', im('y_{n+1}'), '.'),
      ],
      heun: () => [
        h('li', null, 'Pendiente al inicio: ', im("y_n' = f(x_n, y_n)"), '.'),
        h('li', null, 'Predictor (un paso de Euler): ', im(T`\tilde{y}_{n+1} = y_n + h\,y_n'`), '.'),
        h('li', null, 'Pendiente al final, en el punto predicho: ', im(T`f(x_{n+1}, \tilde{y}_{n+1})`), '.'),
        h('li', null, 'Corrector: ', im(T`y_{n+1} = y_n + \frac{h}{2}\bigl[\,y_n' + f(x_{n+1}, \tilde{y}_{n+1})\,\bigr]`), '.'),
      ],
      rk2: () => [
        h('li', null, 'Calcular ', im(T`k_1 = h\,f(x_n, y_n)`), ' (el incremento de Euler, con el factor ', im('h'), ' incluido).'),
        h('li', null, 'Armar el punto medio: ', im('x_n + h/2'), ' y ', im('y_n + k_1/2'), '.'),
        h('li', null, 'Evaluar ', im('f'), ' en el punto medio y multiplicar por ', im('h'), ': ',
          im(T`y_{n+1} = y_n + h\,f\bigl(x_n + h/2,\ y_n + k_1/2\bigr)`), '.'),
      ],
    };

    /** One `.step-block`: the Ordenada Genérica of a method, how it is applied, and its first iteration. */
    function stepBlock(entry, mode, withReading) {
      const fmt = (v) => format.num(v, { decimals: 4, mode });
      const x1 = fmt(ex.x0 + ex.h);
      return h('article', { class: 'step-block', 'data-method': entry.id, 'data-display': mode },
        h('header', { class: 'step-block__head' },
          h('h4', { class: 'step-block__title' }, methodChip(entry.id, NAMES[entry.id]), ' Primera iteración'),
          h('span', { class: 'step-block__n' }, 'n = 0')),
        h('div', { class: 'step-block__body' },
          h('p', null, `Por ${BY[entry.id]}, la Ordenada Genérica ${im('y_{n+1}')} del problema es:`),
          formula(entry.generic, { hl: true }),
          h('p', { class: 'step-block__note' }, 'Orden de las operaciones de cada iteración:'),
          h('ol', { class: 'theory-recipe theory-recipe--ops' }, ...operations[entry.id]()),
          entry.parts.map((part) => [h('p', null, part.say), part.tex ? formula(part.tex) : null]),
          h('p', null, h('mark', { class: 'hl' }, im(entry.y1TeX))),
          withReading
            ? h('p', { class: 'step-block__note' }, `Esto se lee así: el valor de ${im('y_1')} es igual al valor de ${im('y')} evaluado en el punto ${im('x_1')}, y como ${im('x_1 = x_0 + h')} entonces ${im(`x_1 = ${fmt(ex.x0)} + ${fmt(ex.h)} = ${x1}`)}.`)
            : null,
          h('p', null, `Las iteraciones ${im('n = 1')} y ${im(`n = ${ex.N - 1}`)} repiten el procedimiento con los valores nuevos. Al terminar:`),
          h('p', null, h('mark', { class: 'hl' }, im(`y_${ex.N} = ${fmt(finals[entry.id])} = y(x_${ex.N}) = y(${fmt(xf)})`)))));
    }

    const host = h('div', { class: 'theory-steps' });
    const radios = {};

    function fill(mode, hydrate) {
      const entries = data.firstStep(mode);
      host.replaceChildren(stepBlock(entries.taylor, mode, true), stepBlock(entries.heun, mode, false), stepBlock(entries.rk2, mode, false));
      Object.keys(radios).forEach((key) => { radios[key].checked = key === mode; });
      if (hydrate) env.hydrate(host);
    }

    const groupId = env.uid('cifras');
    const radio = (value, text) => {
      const input = h('input', {
        type: 'radio', name: groupId, value, checked: env.displayMode() === value, onchange: () => { if (input.checked) env.setDisplayMode(value); },
      });
      radios[value] = input;
      return h('label', null, input, h('span', null, text));
    };
    const control = h('div', { class: 'theory-display' },
      h('div', { class: 'field' },
        h('span', { class: 'field__label', id: `${groupId}-label` }, 'Cifras de los valores'),
        h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': `${groupId}-label` },
          radio('trunc', 'Truncadas (como el apunte)'), radio('round', 'Redondeadas'))),
      h('p', { class: 'muted' }, `El apunte trunca a 4 decimales: ${im(`${format.num(sample, { decimals: 7 })}\\ldots`)} se escribe ${format.num(sample, { decimals: 4, mode: 'trunc' })} (redondeado sería ${format.num(sample, { decimals: 4, mode: 'round' })}). `
        + 'Los cálculos se hacen siempre con todas las cifras; el formato solo cambia lo que se muestra.'));

    fill(env.displayMode(), false);
    env.onDisplay((mode) => fill(mode, true));

    const exFirst = data.firstStep('trunc');
    const exact1 = ex.exact.fn(ex.x0 + ex.h);

    return section('receta', 'Receta para resolver a mano',
      prose(
        h('p', null, 'Esta es la sección operativa de la página: el procedimiento con el que el apunte resuelve cada ejercicio, y después la Ordenada Genérica de cada método con el orden de sus operaciones. El orden de los pasos importa:'),
        h('ol', { class: 'theory-recipe' },
          h('li', null, h('strong', null, 'Identificar los datos:'), ' la función ', im('f(x, y)'), ', la condición inicial ', im('x_0'), ' e ', im('y_0'), ', el Valor final ', im('x_f'), ' y el paso ', im('h'),
            `. En el ejemplo: ${im(`f = ${env.expr.toTeX(ex.fNode, { indep: 'x' })}`)}, ${im(`x_0 = ${n(ex.x0)}`)}, ${im(`y_0 = ${n(ex.y0)}`)}, ${im(`x_f = ${n(ex.xf)}`)} y ${im(`h = ${n(ex.h)}`)}.`),
          h('li', null, h('strong', null, 'Calcular la cantidad de iteraciones:'), ' ', im(T`N = \frac{x_f - x_0}{h}`), ' (tiene que dar un entero). ',
            `En el ejemplo, ${im(`N = \\frac{${n(ex.xf)} - ${n(ex.x0)}}{${n(ex.h)}} = ${ex.N}`)}.`),
          h('li', null, h('strong', null, 'Listar las abscisas:'), ' ', im(T`x_0,\ x_1 = x_0 + h,\ x_2 = x_1 + h,\ \dots`), ' hasta ', im('x_N = x_f'), '. ',
            `En el ejemplo: ${Array.from({ length: ex.N + 1 }, (v, k) => im(`x_${k} = ${n(ex.x0 + k * ex.h)}`)).join(', ')}.`),
          h('li', null, h('strong', null, 'Escribir la Ordenada Genérica'), ' del método: primero la fórmula general y después la particularizada con los datos del problema (la ', im('f'), ' y el paso ', im('h'), ').'),
          h('li', null, h('strong', null, 'Iterar'), ' para ', im(T`n = 0, 1, \dots, N-1`), '. En cada iteración se reemplazan ', im('x_n'), ' e ', im('y_n'), ' en la Ordenada Genérica, se calcula lo que pida el método (',
            im("y_n'"), ', ', im("y_n''"), ', el predictor o ', im('k_1'), ') y se obtiene ', im('y_{n+1}'), '.'),
          h('li', null, h('strong', null, 'Informar el valor pedido:'), ' al llegar a ', im('x_N = x_f'), ', ', im('y_N'), ' es la aproximación de ', im('y(x_f)'), ' y el ejercicio termina.')),
        h('h3', null, 'Cada método, paso a paso'),
        h('p', null, 'Cada bloque trae la Ordenada Genérica del método, el orden en que se hacen sus operaciones y la primera iteración resuelta con el problema del ejemplo, en el formato del apunte. Los valores de ', im('y_1'), ' son ',
          `${exFirst.taylor.y1Text} (Taylor), ${exFirst.heun.y1Text} (Euler Mejorado) y ${exFirst.rk2.y1Text} (RK2): tres aproximaciones distintas de la misma cantidad, cuyo valor exacto es `,
          im(T`y(x_1) = e^{x_1^{2}-1} \approx ${format.num(exact1, { decimals: 4 })}`), ' (verificación; el apunte no lo calcula). Por qué difieren se mide en ',
          link('#/comparativa/constantes', 'Comparativa: la constante del error local'), '.')),
      control,
      host,
      // Said once, after the three blocks, instead of three times inside them.
      prose(
        h('p', null, 'En los tres casos se llegó al valor de ', im('y'), ' correspondiente al final del intervalo, ',
          im(`y(${n(xf)})`), ': el ejercicio termina en ese punto. Las iteraciones intermedias de cada método están resueltas en ',
          h('a', { href: '#/ejercicios' }, 'Ejercicios'), ', y la comparación de los tres resultados contra el valor exacto, en la ',
          link('#/comparativa', 'Comparativa'), '.')));
  }

  /* ======================================================================================================
     Glosario
     ====================================================================================================== */

  function buildGlosario(env) {
    const {
      h, kit, data, methods, format,
    } = env;
    const { section, im } = kit;
    const orders = data.orders();
    const ex = data.example();
    const sample = methods.solve('taylor', ex).ys[ex.N];
    const cut = format.num(sample, { decimals: 4, mode: 'trunc' });
    const entries = [
      ['Corrector', ['En Euler Mejorado, la regla del trapecio que usa la pendiente en el punto predicho para calcular el valor final ', im('y_{n+1}'), '.']],
      ['Dominio o intervalo de trabajo', ['El intervalo ', im(T`x_0 \le x \le x_f`), ' en el que se resuelve el PVI.']],
      ['Error global', ['Error acumulado en ', im('x_n'), ', ', im('y(x_n) - y_n'), '. Suma el efecto de todos los pasos anteriores.']],
      ['Error local', ['Error que comete un solo paso, suponiendo exacto el punto de partida.']],
      ['Iteración', ['Cada aplicación de la fórmula del método para pasar de ', im('(x_n, y_n)'), ' a ', im('(x_{n+1}, y_{n+1})'), '. Se numeran ', im(T`n = 0, 1, 2, \dots`), ' (primera iteración: ', im('n = 0'), ').']],
      ['k1', ['En el apunte, ', im(T`k_1 = h\,f(x_n, y_n) = h\,y_n'`), ': el paso de Euler, que ya incluye el factor ', im('h'), '. En otros libros ', im('k_1 = f(x_n, y_n)'), ', sin ', im('h'), '.'], im('k_1')],
      ['Orden de un método', ['El exponente ', im('p'), ' tal que el error global es ', im('O(h^{p})'), `. Euler tiene orden ${orders.euler}; Taylor de grado 2, Euler Mejorado y RK2, orden ${orders.rk2}.`]],
      ['Ordenada Genérica', ['La fórmula de ', im('y_{n+1}'), ' en función de ', im('y_n'), ': primero la general del método y después la particularizada con los datos del problema.']],
      ['Paso', ['Distancia entre dos abscisas consecutivas: ', im('h'), ', con ', im('x_{n+1} = x_n + h'), '.']],
      ['Paso simple y paso múltiple', ['Un método de paso simple calcula ', im('y_{n+1}'), ' con el punto anterior ', im('(x_n, y_n)'), '; uno de paso múltiple (por ejemplo, Adams-Bashforth) usa varios puntos anteriores.']],
      ['Pendiente', ['Valor de ', im('f(x, y)'), ' en un punto: la inclinación de la solución que pasa por él. ', im("y_n' = f(x_n, y_n)"), '.']],
      ['Predictor', ['Estimación provisional de ', im('y_{n+1}'), ' con un paso de Euler, ', im(T`\tilde{y}_{n+1} = y_n + h\,y_n'`), '. Euler Mejorado la usa para medir la pendiente en el extremo del paso.']],
      ['Problema de valor inicial (PVI)', ['Ecuación diferencial ', im("y' = f(x, y)"), ' con una condición inicial ', im('y(x_0) = y_0'), ', un dominio de trabajo ', im(T`x_0 \le x \le x_f`), ' y un paso ', im('h'), ' (las cuatro cosas del apunte).']],
      ['Truncamiento', [h('strong', null, 'Error de truncamiento'), ': el que se comete al descartar términos de una serie (en Taylor, el resto ', im(T`\frac{h^{3}}{3!}\,y'''(\xi)`), '). ', h('strong', null, 'Truncar un número'), `: cortar sus cifras decimales sin redondear, como hace el apunte (${format.num(sample, { decimals: 7 })} se escribe ${cut}).`]],
      ['Valor inicial y Valor final', [im('x_0'), ' y ', im('x_f'), ': los extremos del dominio de trabajo.']],
    ];
    const sorted = entries.slice().sort((a, b) => a[0].localeCompare(b[0], 'es', { sensitivity: 'base' }));

    return section('glosario', 'Glosario',
      h('dl', { class: 'theory-glossary' }, sorted.map(([term, definition, display]) => h('div', { class: 'theory-glossary__row' },
        h('dt', null, display || term),
        h('dd', null, definition)))));
  }

  return [
    {
      id: 'receta', title: 'Receta para resolver a mano', toc: 'Receta para resolver a mano', build: buildReceta,
    },
    {
      id: 'glosario', title: 'Glosario', toc: 'Glosario', build: buildGlosario,
    },
  ];
}));
