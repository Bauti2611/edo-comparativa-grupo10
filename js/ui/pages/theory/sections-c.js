/**
 * Sections 8 to 10 of the Teoría page: the cátedra's recipe with one worked first iteration per method (the
 * apunte's layout, in `.step-block`s that follow the display setting), the comparison summary and the glossary.
 *
 * The first iterations come from EDO.theory.data.firstStep(mode); the end values from EDO.methods. The blocks are
 * rebuilt when the display mode changes (`env.onDisplay`): the apunte truncates to 4 decimals, the computation is
 * always full precision. Each section is `{id, title, toc, build(env)}`; see sections-a.js for the shape of `env`
 * (here also `env.methods`, `env.uid`, `env.displayMode`, `env.setDisplayMode`, `env.onDisplay`, `env.hydrate`).
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
     8. Receta para resolver a mano
     ====================================================================================================== */

  function buildReceta(env) {
    const {
      h, kit, data, methods, format,
    } = env;
    const {
      section, prose, im, formula, methodChip, goto,
    } = kit;
    const ex = data.example();
    const xf = ex.xf;
    const n = (v) => format.num(v, { decimals: 4 });
    const finals = {};
    ['taylor', 'heun', 'rk2'].forEach((id) => { finals[id] = methods.solve(id, ex).ys[ex.N]; });
    const sample = finals.taylor;

    /** One `.step-block`: the first iteration of a method, then the end of the exercise. */
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
          entry.parts.map((part) => [h('p', null, part.say), part.tex ? formula(part.tex) : null]),
          h('p', null, h('mark', { class: 'hl' }, im(entry.y1TeX))),
          withReading
            ? h('p', { class: 'step-block__note' }, `Esto se lee así: el valor de ${im('y_1')} es igual al valor de ${im('y')} evaluado en el punto ${im('x_1')}, y como ${im('x_1 = x_0 + h')} entonces ${im(`x_1 = ${fmt(ex.x0)} + ${fmt(ex.h)} = ${x1}`)}.`)
            : null,
          h('p', null, `Las iteraciones ${im('n = 1')} y ${im(`n = ${ex.N - 1}`)} repiten el procedimiento con los valores nuevos (se resuelven en `, h('a', { href: '#/ejercicios' }, 'Ejercicios'), '). Al terminar:'),
          h('p', null, h('mark', { class: 'hl' }, im(`y_${ex.N} = ${fmt(finals[entry.id])} = y(x_${ex.N}) = y(${fmt(xf)})`))),
          h('p', { class: 'step-block__note' }, `Se llegó al valor de ${im('y')} correspondiente al final del intervalo: el ejercicio termina en este punto.`)));
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
        h('p', null, 'El apunte resuelve cada ejercicio con el mismo procedimiento. El orden de los pasos importa:'),
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
        h('h3', null, 'Primera iteración de cada método'),
        h('p', null, 'Las tres iteraciones siguen el formato del apunte, con el problema del ejemplo. Los valores de ', im('y_1'), ' son ',
          `${exFirst.taylor.y1Text} (Taylor), ${exFirst.heun.y1Text} (Euler Mejorado) y ${exFirst.rk2.y1Text} (RK2): tres aproximaciones distintas de la misma cantidad, cuyo valor exacto es `,
          im(T`y(x_1) = e^{x_1^{2}-1} \approx ${format.num(exact1, { decimals: 4 })}`), ' (verificación; el apunte no lo calcula). En ', goto('error', 'Error y orden'), ' se ve por qué difieren.')),
      control,
      host);
  }

  /* ======================================================================================================
     9. Resumen comparativo
     ====================================================================================================== */

  function buildResumen(env) {
    const {
      h, kit, data, expr, format,
    } = env;
    const {
      section, prose, im, extensionWide, table, methodChip, fixed, goto, badge,
    } = kit;
    const first = data.firstStep('trunc');
    const orders = data.orders();
    const costs = data.costs();
    /** Short chip ("Taylor", "RK2"): these tables are wide and must fit the reading column. */
    const short = (id) => methodChip(id);

    /** The Ordenada Genérica for a table cell: the formula, with a trailing definition (the k1 of RK2) on a second line. */
    const AND = T`, \qquad `;
    const genericCell = (tex) => {
      const cut = tex.indexOf(AND);
      return cut < 0 ? im(tex) : [im(tex.slice(0, cut)), h('br'), 'con ', im(tex.slice(cut + AND.length))];
    };

    const summaryRows = [
      ['euler', T`y_{n+1} = y_n + h\,y_n'`, costs.euler.total, 'No', 'Ejemplo 2'],
      ['taylor', first.taylor.generic, costs.taylor2.total, 'Sí: f_x y f_y', 'Ejemplo 1'],
      ['heun', first.heun.generic, costs.heun.total, 'No', 'Ejemplo 3'],
      ['rk2', first.rk2.generic, costs.rk2.total, 'No', 'Ejemplo 4'],
    ].map(([id, tex, evals, derivs, where]) => [
      { c: short(id), row: true },
      { c: genericCell(tex), nowrap: true },
      { c: im(orders[id] === 1 ? 'O(h)' : `O(h^{${orders[id]}})`), num: true },
      { c: String(evals), num: true },
      { c: derivs === 'No' ? 'No' : ['Sí: ', im('f_x'), ' y ', im('f_y')], wrap: true },
      { c: where, wrap: true },
    ]);

    const cases = data.comparison();
    const second = ['taylor', 'heun', 'rk2'];
    const errorOf = (c, id) => Math.abs(c.values[id] - c.exact);
    const worstOf = (c) => second.reduce((a, b) => (errorOf(c, b) > errorOf(c, a) ? b : a));
    const countBest = (id) => cases.filter((c) => c.best === id).length;
    const taylorWorstEverywhere = cases.every((c) => worstOf(c) === 'taylor');
    const liveRows = cases.map((c) => {
      const cell = (id) => {
        const text = fixed(c.values[id], 6);
        return { c: id === c.best ? [h('mark', { class: 'hl' }, text), h('span', { class: 'sr-only' }, ' (el más cercano de los tres de orden 2)')] : text, num: true };
      };
      const p = c.problem;
      const n4 = (v) => format.num(v, { decimals: 4 });
      return [
        { c: [im(`y' = ${expr.toTeX(p.fNode, { indep: 'x' })}`), ', ', im(`y(${n4(p.x0)}) = ${n4(p.y0)}`), ', ', im(`x_f = ${n4(c.xf)}`)], row: true, wrap: true },
        { c: fixed(c.values.euler, 6), num: true },
        cell('taylor'),
        cell('heun'),
        cell('rk2'),
        { c: fixed(c.exact, 6), num: true },
        { c: short(c.best) },
      ];
    });
    const pluralCases = (count) => (count === 1 ? 'en 1 de los' : `en ${count} de los`);

    return section('resumen', 'Resumen comparativo',
      prose(
        h('p', null, 'Los cuatro métodos usan el mismo esquema: partir de ', im('(x_n, y_n)'), ' y avanzar ', im('h'), ' con una pendiente. Lo que cambia es cómo se obtiene esa pendiente.')),
      table({
        label: 'Comparación de Euler, Taylor de grado 2, Euler Mejorado y RK2',
        head: ['Método', 'Ordenada Genérica', { c: 'Error global', num: true, wrap: true }, { c: 'Evaluaciones por paso', num: true, wrap: true }, '¿Hay que derivar f?', 'En el apunte'],
        rows: summaryRows,
      }),
      h('p', { class: 'theory-provenance' }, badge('Ampliación'), ' Las columnas «Error global» y «Evaluaciones por paso» no figuran en el apunte, que no analiza el error ni el costo (véanse ',
        goto('error', 'Error y orden'), ' y ', goto('costo', 'Costo computacional'), ').'),
      extensionWide('Los cuatro métodos sobre los mismos problemas',
        prose(
          h('p', null, 'Cada fila es un problema: su ecuación, su condición inicial y el Valor final ', im('x_f'),
            `. Se muestran los valores en ${im('x_f')} con ${im(`h = ${format.num(cases[0].problem.h, { decimals: 4 })}`)}, redondeados a 6 decimales, junto con la solución exacta. Está resaltado, en cada fila, el método de orden 2 más cercano al valor exacto.`)),
        table({
          label: 'Valor final de cada método y solución exacta en cuatro casos',
          head: ['Problema', { c: short('euler'), num: true }, { c: short('taylor'), num: true }, { c: short('heun'), num: true }, { c: short('rk2'), num: true }, { c: 'Exacta', num: true }, 'Más cercano'],
          rows: liveRows,
        })),
      prose(
        h('h3', null, '¿Cuál elegir?'),
        h('p', null, h('strong', null, 'No hay un ganador universal.'), ' Los tres métodos de segundo orden tienen el mismo orden de error; los distinguen el costo y la constante del error, que depende del problema.'),
        h('ul', null,
          h('li', null, h('strong', null, 'Euler'), ' es la base de comparación: una evaluación por paso, pero necesita pasos mucho más pequeños para igualar la precisión.'),
          h('li', null, h('strong', null, 'Taylor de grado 2'), ' exige derivar ', im('f'), ' a mano (', im('f_x'), ' y ', im('f_y'), '). Conviene cuando esas derivadas son simples o cuando se quiere el desarrollo explícito. Tener el mismo orden no lo hace más preciso',
            taylorWorstEverywhere ? `: en los ${cases.length} casos de la tabla fue el de mayor error de los tres.` : '.'),
          h('li', null, h('strong', null, 'Euler Mejorado'), ' y ', h('strong', null, 'RK2'), ' solo evalúan ', im('f'), ', dos veces por paso. Cuál resulta más preciso depende del problema: en la tabla, Euler Mejorado quedó más cerca ',
            `${pluralCases(countBest('heun'))} ${cases.length} casos y RK2 ${pluralCases(countBest('rk2'))} ${cases.length} (dos de los casos son el mismo problema con distinto extremo).`)),
        h('p', null, 'La elección práctica depende de si se pueden derivar ', im('f_x'), ' y ', im('f_y'), ' con facilidad, de cuánto cuesta evaluar ', im('f'), ' y de la precisión que se pide.'),
        h('p', { class: 'theory-lead-in' }, 'El diagrama reúne los tres métodos de orden 2 sobre el mismo paso: al variar ', im('h'), ' se ve dónde cae cada uno respecto del valor exacto.')),
      env.diagram({ methods: 'all' }, 'Diagrama de un paso con los tres métodos'),
      prose(
        h('p', null, 'Para seguir: los ', h('a', { href: '#/ejercicios' }, 'ejercicios resueltos'), ' paso a paso, el ', h('a', { href: '#/simulador' }, 'simulador'), ' con funciones propias y la ',
          h('a', { href: '#/comparativa' }, 'comparativa'), ' completa (convergencia y costo). Los términos de esta página están en el ', goto('glosario', 'glosario'), '.')));
  }

  /* ======================================================================================================
     10. Glosario
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
      id: 'resumen', title: 'Resumen comparativo', toc: 'Resumen comparativo', build: buildResumen,
    },
    {
      id: 'glosario', title: 'Glosario', toc: 'Glosario', build: buildGlosario,
    },
  ];
}));
