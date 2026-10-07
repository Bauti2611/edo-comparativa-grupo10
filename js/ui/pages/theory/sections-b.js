/**
 * Sections 5 to 7 of the Teoría page: the RK2 family with the nomenclature note, error and order, and cost.
 * The apunte contains none of this beyond the names of the methods, so everything that is not a restatement of
 * the apunte sits in a dashed "Ampliación" callout, and the live tables (local error constants, stability,
 * convergence by step halving, evaluations per step) are computed by the engine when the page is built.
 *
 * Each section is `{id, title, toc, extension?, build(env)}`; see sections-a.js for the shape of `env`
 * (here `env.analysis` is also used). Load order: after sections-a.js, before sections-c.js. Also `require`-able.
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

  /* ======================================================================================================
     5. La familia RK2 y la nomenclatura
     ====================================================================================================== */

  function buildFamilia(env) {
    const { h, kit } = env;
    const {
      section, prose, im, formula, extension, table, methodChip, goto, Q, familyMember,
    } = kit;

    const members = [
      { id: 'heun', label: 'Euler Mejorado (Heun)', a2: Q.of(1, 2), apunte: 'Euler Mejorado' },
      { id: 'rk2', label: 'Punto medio', a2: Q.of(1, 1), apunte: 'RK2 (Runge-Kutta de grado 2)' },
      { id: 'ralston', label: 'Ralston', a2: Q.of(2, 3), apunte: null },
    ].map((m) => Object.assign({}, m, familyMember(m.a2)));

    const rows = members.map((m) => [
      { c: m.id === 'ralston' ? m.label : methodChip(m.id, m.label), row: true },
      { c: im(Q.tex(m.a1)), num: true },
      { c: im(Q.tex(m.a2)), num: true },
      { c: im(Q.tex(m.p)), num: true },
      { c: m.apunte || 'No figura en el apunte', wrap: true },
    ]);

    // The other pair of values some texts print under the name "Ralston" (a2 = 3/4): it also meets the order conditions.
    const variant = familyMember(Q.of(3, 4));

    return section('familia', 'La familia RK2 y la nomenclatura',
      prose(
        h('p', null, 'Euler Mejorado y RK2 se construyen de manera distinta, pero son dos casos de una misma familia: los métodos de Runge-Kutta de dos evaluaciones de ', im('f'), ' por paso y orden 2.'),
        h('h3', null, 'Nomenclatura'),
        h('p', null, 'Los nombres cambian de un libro a otro. En la cátedra, «Euler Mejorado» es el método de Heun (trapecio con predictor de Euler) y «RK2» es el método del punto medio. '
          + 'Otros textos llaman al punto medio «polígono mejorado» o «Euler modificado», y usan «Euler modificado» también para el método de Heun; hay autores que llaman «Heun» a un método de tercer orden. '
          + 'Por eso conviene identificar cada método por su fórmula y no solo por el nombre.')),
      extension('Una sola familia',
        prose(
          h('p', null, 'La forma general de un método de dos etapas es:'),
          formula(T`y_{n+1} = y_n + h\,(a_1 k_1 + a_2 k_2), \qquad k_1 = f(x_n, y_n), \qquad k_2 = f(x_n + p\,h,\ y_n + q\,h\,k_1)`),
          h('p', null, 'Aquí ', im('k_1'), ' y ', im('k_2'), ' son pendientes, sin el factor ', im('h'), ' (como en la mayoría de los libros); en el apunte, ', im('k_1'), ' lleva ese factor.'),
          h('p', null, 'Los parámetros ', im('a_1, a_2, p, q'), ' se eligen para que el método coincida con la serie de Taylor hasta ', im('h^{2}'), '. Se desarrolla ', im('k_2'), ' alrededor de ', im('(x_n, y_n)'),
            ', con ', im('f'), ', ', im('f_x'), ' y ', im('f_y'), ' evaluadas allí:'),
          formula(T`k_2 = f + p\,h\,f_x + q\,h\,f\,f_y + O(h^{2})`),
          h('p', null, 'Al reemplazar queda:'),
          formula(T`y_{n+1} = y_n + (a_1 + a_2)\,h\,f + a_2\,h^{2}\,\bigl(p\,f_x + q\,f\,f_y\bigr) + O(h^{3})`),
          h('p', null, 'La serie de la solución es ', im(T`y(x_{n+1}) = y_n + h\,f + \frac{h^{2}}{2}\,(f_x + f\,f_y) + O(h^{3})`),
            '. Para que ambas coincidan hasta ', im('h^{2}'), ' con cualquier ', im('f'), ' se igualan los coeficientes de ', im(T`h\,f`), ', de ', im(T`h^{2}f_x`), ' y de ', im(T`h^{2}f\,f_y`), ':'),
          formula(T`a_1 + a_2 = 1, \qquad a_2\,p = \frac{1}{2}, \qquad a_2\,q = \frac{1}{2}`),
          h('p', null, 'Son tres ecuaciones para cuatro incógnitas: queda un parámetro libre. Elegido ', im(T`a_2 \ne 0`), ', resultan ', im('a_1 = 1 - a_2'), ' y ', im(T`p = q = \frac{1}{2a_2}`),
            '. Cada elección es un método de orden 2 distinto:')),
        table({
          label: 'Miembros de la familia RK2: parámetros y nombre en el apunte',
          head: ['Método', { c: im('a_1'), num: true }, { c: im('a_2'), num: true }, { c: im('p = q'), num: true }, 'Nombre en el apunte'],
          rows,
        }),
        prose(
          h('p', null, 'Euler Mejorado promedia las pendientes de los dos extremos (', im(T`a_1 = a_2 = \frac{1}{2}`), ') y el punto medio usa solo la pendiente intermedia (', im('a_1 = 0'),
            '). Hay infinitos más. Taylor de grado 2 no pertenece a la familia, pero se relaciona con ella: los métodos de Runge-Kutta alcanzan el orden de Taylor de grado 2 sin derivar ', im('f'),
            ', porque la combinación ', im(T`p\,f_x + q\,f\,f_y`), ' que Taylor obtiene derivando la obtienen evaluando ', im('f'), ' en un punto desplazado.'),
          h('p', { class: 'muted' }, 'Algunos textos llaman «Ralston» a la otra pareja de valores, ', im(`a_2 = ${Q.tex(variant.a2)}`), ' y ', im(`p = q = ${Q.tex(variant.p)}`),
            '. También cumple las condiciones de orden 2 y, con ella, el coeficiente de ', im('F_2'), ' en el error local (véase ', goto('error', 'Error y orden'), ') vale ', im(Q.tex(variant.f2)),
            '; con ', im(`a_2 = ${Q.tex(members[2].a2)}`), ' y ', im(`p = q = ${Q.tex(members[2].p)}`), ' vale ', im(Q.tex(members[2].f2)), '.'))));
  }

  /* ======================================================================================================
     6. Error y orden
     ====================================================================================================== */

  function buildError(env) {
    const {
      h, kit, data, analysis, expr, format,
    } = env;
    const {
      section, prose, im, formula, extension, extensionWide, table, methodChip, goto, badge, Q, familyMember, fixed, plain, sci,
    } = kit;

    const orders = data.orders();
    const le = data.localErrors();
    const hh = format.num(le.h, { decimals: 4 });
    const asInt = (v) => (Number.isInteger(v) ? v : null);
    const chip = (id) => methodChip(id, NAMES[id]);
    /** Short chip ("Taylor", "RK2") for the heads of the numeric tables, which must fit the reading column. */
    const short = (id) => methodChip(id);

    /* -- A: local, global, order ------------------------------------------------------------------ */
    const orderRows = ['euler', 'taylor', 'heun', 'rk2'].map((id) => [
      { c: chip(id), row: true },
      { c: im(`O(h^{${orders[id] + 1}})`), num: true },
      { c: im(orders[id] === 1 ? 'O(h)' : `O(h^{${orders[id]}})`), num: true },
      { c: format.num(2 ** orders[id], { decimals: 0 }), num: true },
    ]);

    /* -- B1: constants of the local error, from the family parametrization ------------------------ */
    const one = Q.of(1, 1);
    const coef = {
      taylor: { f2: Q.of(1, 6), fyd: Q.of(1, 6) },
      rk2: familyMember(one),
      heun: familyMember(Q.of(1, 2)),
    };
    const stepFormula = (id) => im(T`h^{3}\Bigl(${Q.tex(coef[id].f2)}\,F_2 + ${Q.tex(coef[id].fyd)}\,f_y D\Bigr)`);
    const intF2 = asInt(le.F2);
    const intFyD = asInt(le.fyD);
    const constantTeX = (id) => {
      const decimal = `${format.tex(le.rows.find((r) => r.id === id).c, { decimals: 4 })}`;
      if (intF2 === null || intFyD === null) return decimal;
      const exact = Q.add(Q.mul(coef[id].f2, Q.of(intF2, 1)), Q.mul(coef[id].fyd, Q.of(intFyD, 1)));
      return `${Q.tex(coef[id].f2)}\\cdot ${intF2} + ${Q.tex(coef[id].fyd)}\\cdot ${intFyD} = ${Q.tex(exact)} \\approx ${decimal}`;
    };
    const constantsRows = ['taylor', 'rk2', 'heun'].map((id) => {
      const r = le.rows.find((x) => x.id === id);
      return [
        { c: chip(id), row: true },
        { c: im(constantTeX(id)), wrap: true },
        { c: sci(r.predicted, 4), num: true },
        { c: sci(r.measured, 4), num: true },
      ];
    });

    // measured / (c h^3) for several h: it tends to 1 as h -> 0.
    const hs = [0.2, 0.1, 0.05, 0.025];
    const ratioRows = hs.map((step) => {
      const row = data.localErrors(step);
      const ratio = (id) => row.rows.find((r) => r.id === id);
      return [
        { c: format.num(step, { decimals: 4 }), row: true },
        ...['taylor', 'rk2', 'heun'].map((id) => ({ c: fixed(ratio(id).measured / ratio(id).predicted, 3), num: true })),
      ];
    });

    /* -- B2: the ranking depends on the problem --------------------------------------------------- */
    const cases = data.comparison().filter((c) => c.id === 'cmp_2xy_13' || c.id === 'cmp_3x2y');
    const caseRows = cases.map((c) => {
      const p = c.problem;
      const L = analysis.localErrorConstants(p, p.x0, p.y0);
      const smallest = ['taylor', 'rk2', 'heun'].reduce((a, b) => (Math.abs(L[b]) < Math.abs(L[a]) ? b : a));
      const n = (v) => format.num(v, { decimals: 4 });
      return [
        { c: im(`y' = ${expr.toTeX(p.fNode, { indep: 'x' })}`), row: true, wrap: true },
        { c: im(`(${n(p.x0)}, ${n(p.y0)})`), num: true },
        { c: plain(L.F2), num: true },
        { c: plain(L.fyD), num: true },
        { c: plain(L.taylor), num: true },
        { c: plain(L.rk2), num: true },
        { c: plain(L.heun), num: true },
        { c: short(smallest) },
      ];
    });

    /* -- C: linear problem and stability ---------------------------------------------------------- */
    const stability = data.stabilityTable();
    const verdict = (row) => {
      const mags = [row.euler, row.taylor, row.heun, row.rk2].map(Math.abs);
      const tol = 1e-9;
      if (!mags.every((m) => m <= 1 + tol)) return 'crece (inestable)';
      return mags.some((m) => Math.abs(m - 1) <= tol) ? 'en el límite' : 'decae (estable)';
    };
    const stabilityRows = stability.map((row) => [
      { c: im(`z = ${format.num(row.z, { decimals: 4 })}`), row: true },
      { c: fixed(row.euler, 4), num: true },
      { c: fixed(row.taylor, 4), num: true },
      { c: fixed(row.heun, 4), num: true },
      { c: fixed(row.rk2, 4), num: true },
      { c: verdict(row), wrap: true },
    ]);

    /* -- D: convergence by step halving ----------------------------------------------------------- */
    const conv = data.convergence();
    const ids = ['euler', 'taylor', 'heun', 'rk2'];
    const errorRows = conv.hs.map((step, k) => [
      { c: plain(step, 5), row: true },
      { c: String(conv.Ns[k]), num: true },
      ...ids.map((id) => ({ c: conv.errors[id][k] === null ? '—' : sci(conv.errors[id][k], 3), num: true })),
    ]);
    const orderObsRows = conv.hs.slice(0, -1).map((step, k) => [
      { c: `de ${plain(step, 5)} a ${plain(conv.hs[k + 1], 5)}`, row: true },
      ...ids.map((id) => ({ c: conv.orders[id][k] === null ? '—' : fixed(conv.orders[id][k], 2), num: true })),
    ]);
    const last = conv.errors.heun.length - 1;
    const second = ['taylor', 'heun', 'rk2'];
    const bestAtEnd = second.reduce((a, b) => (conv.errors[b][last] < conv.errors[a][last] ? b : a));
    const worstAtEnd = second.reduce((a, b) => (conv.errors[b][last] > conv.errors[a][last] ? b : a));
    const p = conv.problem;
    const n4 = (v) => format.num(v, { decimals: 4 });

    return section('error', 'Error y orden',
      h('p', { class: 'theory-provenance' }, badge('Ampliación'), ' El apunte calcula los valores sin estudiar el error. Esta sección completa lo que falta: cuánto se equivoca cada método y cómo se comprueba.'),
      extensionWide('Error local, error global y orden',
        prose(
          h('p', null, 'Cada paso comete un error porque la fórmula descarta términos de la serie de Taylor o aproxima una integral. Conviene distinguir dos:'),
          h('ul', null,
            h('li', null, h('strong', null, 'Error local'), ': el que comete un solo paso, suponiendo exacto el punto de partida ', im('y_n'), '.'),
            h('li', null, h('strong', null, 'Error global'), ': el que se acumula hasta ', im('x_n'), ', es decir ', im('y(x_n) - y_n'), '; suma el efecto de todos los pasos anteriores.')),
          h('p', null, 'Si el error local es del orden de ', im('h^{p+1}'), ', el error global en un ', im('x_f'), ' fijo es del orden de ', im('h^{p}'), ': son ', im(T`N = (x_f - x_0)/h`),
            ' pasos y cada uno aporta un error de orden ', im('h^{p+1}'), '. Ese ', im('p'), ' es el ', h('strong', null, 'orden'), ' del método. En Taylor de grado 2, el error local es justamente el resto que se descartó, ',
            im(T`\frac{h^{3}}{3!}\,y'''(\xi)`), '.')),
        table({
          label: 'Orden de cada método: error local, error global y efecto de reducir h a la mitad',
          head: ['Método', { c: 'Error local', num: true }, { c: 'Error global', num: true }, { c: 'Si h se reduce a la mitad, el error global se divide por', num: true, wrap: true }],
          rows: orderRows,
        })),
      extensionWide('Constantes del error local',
        prose(
          h('p', null, 'Sean ', im(T`D = f_x + f\,f_y`), ' (es ', im("y''"), ') y ', im(T`F_2 = f_{xx} + 2f\,f_{xy} + f^{2}f_{yy}`), '. Entonces ', im(T`y''' = F_2 + f_y\,D`),
            '. Con estas dos cantidades, evaluadas en ', im('(x_n, y_n)'), ', el error de un paso (valor exacto menos valor calculado) es, cuando ', im(T`h \to 0`), ':')),
        table({
          label: 'Error de un paso de cada método de orden 2 en función de F2 y fy D',
          head: ['Método', ['Error de un paso, más términos de orden ', im('h^{4}'), ' y superiores']],
          rows: ['taylor', 'rk2', 'heun'].map((id) => [{ c: chip(id), row: true }, { c: stepFormula(id), wrap: true }]),
        }),
        prose(
          h('p', null, 'Los tres comparten el término ', im(T`\frac{1}{6}\,f_y D`), '; solo cambia el coeficiente de ', im('F_2'), '. En el ejemplo, en ',
            im(`(${format.num(le.problem.x0, { decimals: 4 })}, ${format.num(le.problem.y0, { decimals: 4 })})`), ' con ', im(`h = ${hh}`), ', valen ', im(`D = ${plain(le.D)}`), ', ', im(`F_2 = ${plain(le.F2)}`),
            ' y ', im(`f_y D = ${plain(le.fyD)}`), ', de modo que la constante ', im('c'), ' de cada método (error de un paso ', im(T`\approx c\,h^{3}`), ') y el error realmente medido son:')),
        table({
          label: 'Constante c, valor predicho c por h al cubo y error medido de un paso en el ejemplo',
          head: ['Método', ['Constante ', im('c')], { c: im(T`c\,h^{3}`), num: true }, { c: 'Error medido', num: true }],
          rows: constantsRows,
        }),
        prose(
          h('p', null, 'Para comparar, Euler comete en el mismo paso un error de ', h('strong', { class: 'num' }, sci(le.euler.measured, 4)), ', unas ',
            h('strong', { class: 'num' }, format.num(le.euler.measured / le.rows[le.rows.length - 1].measured, { decimals: 0 })), ' veces el de Euler Mejorado: su error local es de orden ', im('h^{2}'), '.'),
          h('p', null, 'El error medido supera a ', im(T`c\,h^{3}`), ' porque incluye términos de orden ', im('h^{4}'), ' y superior. Esos términos pierden peso al reducir ', im('h'),
            ': el cociente entre el error medido y ', im(T`c\,h^{3}`), ' tiende a 1.')),
        table({
          label: 'Cociente entre el error medido de un paso y c por h al cubo, para varios h',
          caption: ['Error medido dividido por ', im(T`c\,h^{3}`), ', para varios ', im('h'), '.'],
          head: [{ c: im('h') }, { c: short('taylor'), num: true }, { c: short('rk2'), num: true }, { c: short('heun'), num: true }],
          rows: ratioRows,
        })),
      extensionWide('Por qué el método más preciso depende del problema',
        prose(
          h('p', null, 'Como lo único que cambia es el coeficiente de ', im('F_2'), ' (', im(Q.tex(coef.taylor.f2)), ' en Taylor, ', im(Q.tex(coef.rk2.f2)), ' en RK2 y ', im(Q.tex(coef.heun.f2)),
            ' en Euler Mejorado), cuál método queda mejor depende del signo y del tamaño de ', im('F_2'), ' frente a ', im('f_y D'), '. Dos problemas, con las constantes en el punto inicial:')),
        table({
          label: 'Constantes del error local en el punto inicial de dos problemas',
          head: ['Problema', { c: im('(x_0, y_0)'), num: true }, { c: im('F_2'), num: true }, { c: im('f_y D'), num: true },
            { c: short('taylor'), num: true }, { c: short('rk2'), num: true }, { c: short('heun'), num: true }, 'Menor |c|'],
          rows: caseRows,
        }),
        prose(
          h('p', null, 'Los valores finales de ', goto('resumen', 'Resumen comparativo'), ' concuerdan: para ', im(`y' = ${expr.toTeX(cases[0].problem.fNode, { indep: 'x' })}`), ' queda más cerca ',
            chip(cases[0].best), ' y para ', im(`y' = ${expr.toTeX(cases[1].problem.fNode, { indep: 'x' })}`), ', ', chip(cases[1].best),
            '. El error global acumula los errores locales de todos los pasos y las constantes cambian a lo largo de la solución, así que el punto inicial es solo una guía.'))),
      extensionWide('Caso lineal y estabilidad',
        prose(
          h('p', null, 'En el problema lineal ', im(T`y' = \lambda y`), ' las derivadas segundas de ', im('f'), ' son nulas (', im('F_2 = 0'), ') y los tres métodos de orden 2 dan exactamente la misma fórmula. Con ',
            im(T`z = h\lambda`), ':'),
          h('p', null, 'Euler: ', im('y_{n+1} = (1 + z)\\,y_n'), '. Taylor de grado 2, Euler Mejorado y RK2:'),
          formula(T`y_{n+1} = \Bigl(1 + z + \frac{z^{2}}{2}\Bigr)\,y_n`),
          h('p', null, 'La solución exacta avanza un factor ', im('e^{z}'), ' por paso; el factor de los métodos de orden 2 es su polinomio de Taylor de grado 2. Para ', im(T`\lambda < 0`),
            ' la solución exacta decrece, y la calculada decrece solo si el factor ', im('R(z)'), ' cumple ', im(T`|R(z)| \le 1`), '. Para los cuatro métodos eso ocurre si ', im(T`-2 \le z \le 0`),
            ': el intervalo de estabilidad real es ', im('[-2, 0]'), '. Con un paso demasiado grande para ese ', im(T`\lambda`), ', los valores calculados crecen aunque la solución exacta tienda a 0.')),
        table({
          label: 'Factor R(z) por el que cada método multiplica a y_n en un paso de y\' = lambda y',
          caption: ['Factor ', im('R(z)'), ' por el que un paso multiplica a ', im('y_n'), ', calculado ejecutando los cuatro métodos con ', im('h = 0.1'), ' y ', im(T`\lambda = z/h`), '.'],
          head: [{ c: im('z = h\\lambda') }, { c: short('euler'), num: true }, { c: short('taylor'), num: true }, { c: short('heun'), num: true }, { c: short('rk2'), num: true }, 'Resultado'],
          rows: stabilityRows,
        })),
      extensionWide('Medir el orden reduciendo el paso a la mitad',
        prose(
          h('p', null, 'Si el error global es ', im(T`e(h) \approx C\,h^{p}`), ', al pasar de ', im('h'), ' a ', im('h/2'), ' queda ', im(T`e(h/2) \approx C\,(h/2)^{p}`), ' y entonces:'),
          formula(T`p \approx \log_2\frac{e(h)}{e(h/2)}`),
          h('p', null, 'Para ', im(`y' = ${expr.toTeX(p.fNode, { indep: 'x' })}`), ', ', im(`y(${n4(p.x0)}) = ${n4(p.y0)}`), ' en ', im(`[${n4(p.x0)}, ${n4(p.xf)}]`), ', con ',
            im(`N = ${conv.Ns.join(', ')}`), ' pasos, el error en ', im(`x_f = ${n4(p.xf)}`), ' respecto de la solución exacta es:')),
        table({
          label: 'Error en el extremo del intervalo para cuatro valores de h',
          head: [{ c: im('h') }, { c: im('N'), num: true }, ...ids.map((id) => ({ c: short(id), num: true }))],
          rows: errorRows,
        }),
        prose(h('p', null, 'Y el orden observado entre cada par de pasos consecutivos:')),
        table({
          label: 'Orden observado p entre pasos consecutivos',
          head: ['Reducción de h', ...ids.map((id) => ({ c: short(id), num: true }))],
          rows: orderObsRows,
        }),
        prose(
          h('p', null, 'El orden observado se acerca a 1 para Euler y a 2 para los otros tres métodos a medida que ', im('h'), ' disminuye. Que Taylor, Euler Mejorado y RK2 tengan el mismo orden no significa que tengan el mismo error: cambia la constante. ',
            `Con el paso más pequeño, el de menor error es ${NAMES[bestAtEnd]} y el de mayor, ${NAMES[worstAtEnd]}.`))));
  }

  /* ======================================================================================================
     7. Costo computacional
     ====================================================================================================== */

  function buildCosto(env) {
    const { h, kit, data } = env;
    const {
      section, prose, im, extensionWide, table, methodChip, goto, badge,
    } = kit;
    const costs = data.costs();
    const entry = (label, key, derivs, needs) => [
      { c: label, row: true },
      { c: String(costs[key].f), num: true },
      { c: String(costs[key].deriv), num: true },
      { c: String(costs[key].total), num: true },
      { c: needs ? ['Sí: ', derivs] : 'No', wrap: true },
    ];
    const rows = [
      entry(methodChip('euler', 'Euler'), 'euler', null, false),
      entry(methodChip('heun', 'Euler Mejorado'), 'heun', null, false),
      entry(methodChip('rk2', 'RK2 (punto medio)'), 'rk2', null, false),
      entry(methodChip('taylor', 'Taylor de grado 2'), 'taylor2', [im('f_x'), ' y ', im('f_y')], true),
      entry(methodChip('taylor', 'Taylor de grado 3'), 'taylor3', 'todas las derivadas parciales hasta el orden 2', true),
      entry(methodChip('taylor', 'Taylor de grado 4'), 'taylor4', 'todas las derivadas parciales hasta el orden 3', true),
    ];

    return section('costo', 'Costo computacional',
      h('p', { class: 'theory-provenance' }, badge('Ampliación'), ' El apunte no analiza el costo. Esta sección cuenta cuánto trabajo exige cada paso.'),
      extensionWide('Evaluaciones por paso',
        prose(
          h('p', null, 'Como unidad de costo se cuenta cuántas veces hay que evaluar una expresión (la función ', im('f'), ' o una de sus derivadas parciales) en cada paso. No se cuenta el trabajo de obtener las derivadas a mano.')),
        table({
          label: 'Evaluaciones de f y de derivadas parciales por paso de cada método',
          head: ['Método', { c: im('f'), num: true }, { c: 'Derivadas', num: true }, { c: 'Total por paso', num: true }, '¿Hay que derivar f a mano?'],
          rows,
        }),
        prose(
          h('p', null, 'Taylor de grado ', im('p'), ' necesita ', im('f'), ' y todas sus derivadas parciales hasta el orden ', im('p-1'), '. Como hay ', im('k+1'), ' derivadas parciales de orden ', im('k'),
            ', el total es ', im(T`1 + 2 + \dots + p = \frac{p(p+1)}{2}`), '.'),
          h('p', null, 'El inconveniente práctico de Taylor es otro: esas derivadas hay que obtenerlas a mano, y con funciones trascendentes las expresiones crecen rápido (en el ejemplo, ', im('y^{(4)}'),
            ' ya tiene tres términos). Euler Mejorado y RK2 logran el mismo orden 2 evaluando solo ', im('f'), ', dos veces por paso. En este sitio un motor simbólico propio calcula las derivadas, pero a mano son la parte costosa.'),
          h('p', null, 'Para comparar métodos con la misma precisión, y no con el mismo paso, véase la ', h('a', { href: '#/comparativa' }, 'Comparativa'), ' (error en función del trabajo) y el cuadro de ', goto('resumen', 'Resumen comparativo'), '.'))));
  }

  return [
    {
      id: 'familia', title: 'La familia RK2 y la nomenclatura', toc: 'Familia RK2 y nomenclatura', build: buildFamilia,
    },
    {
      id: 'error', title: 'Error y orden', toc: 'Error y orden', extension: true, build: buildError,
    },
    {
      id: 'costo', title: 'Costo computacional', toc: 'Costo computacional', extension: true, build: buildCosto,
    },
  ];
}));
