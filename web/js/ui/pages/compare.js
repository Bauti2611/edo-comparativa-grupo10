/**
 * Page 'comparativa': the four methods on the same problem (table at x_f, solution and error charts), the convergence
 * study computed live (log-log chart with reference slopes, observed order per halving), the work-precision chart,
 * the linear-case demo y' = λy with its stability limit, the summary matrix, "¿Cuál elegir?" and conclusions written
 * from the computed numbers. The logic lives in compare/model.js and the DOM builders in compare/views.js; this file
 * wires them to the controls.
 *
 *  - state: {caseId, h} written to the hash query (`#/comparativa?caso=cmp_3x2y&h=0.05`, empty for the default case).
 *    A change of h recomputes the table and the two first charts; a change of case also the study and the summary.
 *  - charts: created once after the page is in the DOM, then updated; all of them are destroyed through ctx.signal.
 *
 * Load order: after compare/model.js, compare/views.js, theory/kit.js and simulator/views.js (index.html).
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h, uid } = EDO.dom;
  const M = EDO.compare.model;
  const V = EDO.compare.views;

  const minus = (v) => String(v).replace('-', '−');

  function segmented(label, options, current, onPick) {
    if (EDO.simulator && EDO.simulator.views) return EDO.simulator.views.segmented(h, uid, label, options, current, onPick);
    const select = h('select', { class: 'select', onchange: (event) => onPick(event.target.value) },
      options.map((o) => h('option', { value: o.value }, o.label)));
    select.value = current;
    return { element: h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), select), set(v) { select.value = v; } };
  }

  function render(page, ctx) {
    const kit = EDO.theory.kit.makeKit(h, EDO.format);
    const { signal } = ctx;
    let state = M.fromQuery(ctx.query);
    let linear = { lambda: M.LINEAR.lambda, h: M.LINEAR.h };
    let result = null;
    let study = null;
    const charts = {};
    const refs = {};

    /* ---- Controls ------------------------------------------------------------------------------------------- */

    const caseSelect = h('select', { class: 'select', id: uid('cmp-case'), onchange: (event) => pickCase(event.target.value) },
      M.caseGroups().map((g) => h('optgroup', { label: g.label }, g.cases.map((c) => h('option', { value: c.id }, c.title)))));
    refs.hHost = h('div', { class: 'cmp__h' });
    refs.statement = h('div', { class: 'cmp__statement' });

    function buildHControl() {
      const options = M.hOptions(state.caseId).map((o) => ({ value: String(o.h), label: String(o.h) }));
      refs.hControl = segmented('Paso h', options, String(state.h), (value) => pickH(Number(value)));
      refs.hHost.replaceChildren(refs.hControl.element);
    }

    function pickCase(id) {
      state = M.stateFor(id, NaN);
      buildHControl();
      updateAll();
    }

    function pickH(value) {
      state = M.stateFor(state.caseId, value);
      updateSame();
      syncUrl();
    }

    function syncUrl() {
      try {
        EDO.app.setQuery(M.toQuery(state), { replace: true, merge: false });
      } catch (err) {
        /* history may be unavailable in sandboxed contexts: the page still works */
      }
    }

    /* ---- Containers --------------------------------------------------------------------------------------------- */

    const section = (slug, title, ...children) => h('section', { id: `comparativa-${slug}`, class: 'cmp-section', 'aria-labelledby': `comparativa-${slug}-title` },
      h('h2', { id: `comparativa-${slug}-title` }, title), ...children);
    const figure = (canvas, caption) => h('figure', { class: 'chart' }, h('div', { class: 'chart-box' }, canvas), h('figcaption', null, caption));
    const canvas = (key) => { refs[key] = h('canvas'); return refs[key]; };

    refs.warnings = h('div', { class: 'stack', style: { '--gap': '0.5rem' } });
    refs.same = h('div');
    refs.referenceNote = h('p', { class: 'muted cmp__note' });
    refs.orders = h('div');
    refs.wpNote = h('p', { class: 'cmp__note' });
    refs.conclusions = h('ul', { class: 'cmp__conclusions' });
    refs.constants = h('div');
    refs.failure = h('div', { class: 'callout', 'data-kind': 'warning', role: 'alert', hidden: true });

    /* ---- Linear demo controls ------------------------------------------------------------------------------- */

    const lambdaControl = segmented('λ', M.LAMBDAS.map((l) => ({ value: String(l), label: minus(l) })), String(linear.lambda),
      (value) => { linear = Object.assign({}, linear, { lambda: Number(value) }); updateLinear(); });
    const hOut = h('output', { class: 'cmp__out' });
    const hRange = h('input', {
      class: 'range', type: 'range', id: uid('cmp-lin-h'), min: M.LINEAR.hMin, max: M.LINEAR.hMax, step: M.LINEAR.hStep, value: linear.h,
      oninput: (event) => { linear = Object.assign({}, linear, { h: M.clean(Number(event.target.value)) }); updateLinear(); },
    });
    hOut.setAttribute('for', hRange.id);
    refs.linStats = h('div', { class: 'cmp__stats' });
    refs.linStatus = h('div', { role: 'status' });
    refs.linTable = h('div');

    /* ---- Painting ------------------------------------------------------------------------------------------------ */

    function lineChart(key, title, datasets, options) {
      const config = { type: 'line', data: { datasets }, options };
      if (charts[key]) charts[key].update({ data: { datasets }, options });
      else charts[key] = EDO.charts.create(refs[key], config, { title, signal });
    }

    const axes = (xTitle, yTitle, xType, yType) => ({
      scales: {
        x: { type: xType || 'linear', title: { display: true, text: xTitle } },
        y: { type: yType || 'linear', title: { display: true, text: yTitle } },
      },
    });

    function paintStatement() {
      const p = result.problem;
      const x = p.indep;
      const fTex = EDO.expr.toTeX(p.fNode, { indep: x });
      const preset = result.preset;
      refs.statement.replaceChildren(
        h('p', { class: 'cmp__pvi' }, `$y' = ${fTex}$`, ', ', `$y(${kit.plain(p.x0, 6)}) = ${kit.plain(p.y0, 6)}$`, '; se busca ',
          `$y(${kit.plain(p.xf, 6)})$`, ` con $h = ${state.h}$ ($N = ${result.N}$ pasos).`),
        h('p', { class: 'muted' }, [preset.source].concat(preset.notes || []).filter(Boolean).join(' · ')),
      );
      EDO.tex.hydrate(refs.statement);
    }

    function paintSame() {
      refs.same.replaceChildren(V.sameTable(h, kit, result));
      refs.referenceNote.replaceChildren();
      if (result.reference.kind === 'exact') {
        refs.referenceNote.append(`Errores medidos contra la solución exacta $y(${result.problem.indep}) = ${result.reference.tex}$. `,
          'La fila resaltada es la más cercana. Las barras comparan el tamaño del error en escala logarítmica.');
      } else {
        refs.referenceNote.textContent = 'Este caso no tiene solución exacta conocida: los errores se miden contra una referencia numérica '
          + '(RK4 con un paso 200 veces menor). La fila resaltada es la más cercana.';
      }
      EDO.tex.hydrate(refs.referenceNote);
      refs.warnings.replaceChildren(...result.diverged.map((d) => h('div', { class: 'callout', 'data-kind': 'warning', role: 'status' },
        h('p', { class: 'callout__label' }, `Divergencia: ${d.label}`), h('p', null, d.message))));

      const x = result.problem.indep;
      const series = M.solutionSeries(result);
      lineChart('solution', 'Soluciones numéricas y solución exacta',
        [EDO.charts.dataset('exact', series.reference.label, series.reference.points, { pointRadius: 0 })]
          .concat(series.methods.map((m) => EDO.charts.dataset(m.id, m.label, m.points))),
        axes(x, 'y'));
      lineChart('error', 'Error absoluto de cada método a lo largo del intervalo',
        M.errorSeries(result).map((m) => EDO.charts.dataset(m.id, m.label, m.points)),
        axes(x, 'Error absoluto', 'linear', 'logarithmic'));
    }

    function paintStudy() {
      const sets = M.IDS.map((id) => EDO.charts.dataset(id, M.LABELS[id], study.errors[id]
        .map((e, k) => ({ x: study.hs[k], y: e }))
        .filter((p) => p.y !== null && p.y > 0)));
      M.slopeLines(study).forEach((line) => sets.push(EDO.charts.dataset('exact', line.label, line.points, {
        segment: { borderDash: () => (line.p === 1 ? [8, 5] : [2, 4]) },
      })));
      lineChart('convergence', 'Error en el punto final según el paso h (escala log-log)', sets, axes('h', 'Error en el punto final', 'logarithmic', 'logarithmic'));
      refs.orders.replaceChildren(V.ordersTable(h, kit, study));

      lineChart('work', 'Error en el punto final según la cantidad de evaluaciones (escala log-log)',
        M.workPrecision(study).map((s) => EDO.charts.dataset(s.id, s.label, s.points)),
        axes('Evaluaciones totales', 'Error en el punto final', 'logarithmic', 'logarithmic'));
    }

    function paintSummary() {
      const lines = M.conclusions(result, study);
      refs.conclusions.replaceChildren(...lines.map((line) => h('li', null, line)));
      const workLine = lines.find((line) => /evaluaciones \(h =|Ni con/.test(line));
      refs.wpNote.textContent = workLine || '';
      refs.wpNote.hidden = !workLine;

      const c = M.localConstants(state.caseId);
      if (!c) {
        refs.constants.replaceChildren();
        return;
      }
      const names = (ids) => ids.map((id) => M.LABELS[id]).join(', ');
      refs.constants.replaceChildren(kit.extension('Por qué gana uno u otro: la constante del error local',
        h('p', null, `En un paso, el error local es aproximadamente $C\\,h^3$, con la misma potencia de h en los tres métodos de grado 2; `
          + `lo que cambia es la constante C. Calculadas en $(x_0, y_0) = (${kit.plain(c.x0, 6)}, ${kit.plain(c.y0, 6)})$:`),
        kit.table({
          label: 'Constantes del error local de un paso en (x0, y0)',
          head: ['Método', 'Constante', { c: 'Valor', num: true }],
          rows: [
            [{ c: kit.methodChip('taylor', M.LABELS.taylor), row: true }, kit.im('\\tfrac{1}{6}\\,(F_2 + f_y D)'), { c: kit.plain(c.values.taylor, 6), num: true }],
            [{ c: kit.methodChip('rk2', M.LABELS.rk2), row: true }, kit.im('\\tfrac{1}{24}F_2 + \\tfrac{1}{6} f_y D'), { c: kit.plain(c.values.rk2, 6), num: true }],
            [{ c: kit.methodChip('heun', M.LABELS.heun), row: true }, kit.im('-\\tfrac{1}{12}F_2 + \\tfrac{1}{6} f_y D'), { c: kit.plain(c.values.heun, 6), num: true }],
          ],
        }),
        h('p', { class: 'muted' }, kit.im('D = f_x + f\\,f_y = y\'\''), ', ', kit.im('F_2 = f_{xx} + 2f\\,f_{xy} + f^2 f_{yy}'), '.'),
        h('p', null, `Ordenados por |C|: ${names(c.ranking)}. `, c.matchesObserved
          ? `Coincide con el orden observado en la tabla con el h del caso: la constante más pequeña explica por qué ${M.LABELS[c.ranking[0]]} queda más cerca.`
          : `No coincide con el orden observado (${names(c.observed)}): las constantes cambian a lo largo del intervalo y los errores de cada paso se propagan, así que el valor en $x_0$ no alcanza para predecir el resultado.`)));
      EDO.tex.hydrate(refs.constants);
    }

    function updateLinear() {
      const d = M.linearDemo({ lambda: linear.lambda, h: linear.h, steps: M.LINEAR.steps });
      hOut.textContent = `h = ${d.h}`;
      const z = kit.plain(d.z, 4);
      refs.linStats.replaceChildren(
        V.stat(h, 'z = hλ', minus(z)),
        V.stat(h, 'R(z) de Euler = 1 + z', minus(kit.plain(d.R.euler, 4)), Math.abs(d.R.euler) > 1 ? '|R| > 1: inestable' : '|R| ≤ 1'),
        V.stat(h, 'R(z) de los métodos de grado 2', minus(kit.plain(d.R.second, 4)), d.unstable.second ? '|R| > 1: inestable' : '|R| ≤ 1', d.unstable.second),
        V.stat(h, 'Diferencia máxima entre los tres', d.maxSpread === 0 ? '0' : kit.sci(d.maxSpread, 2), 'redondeo de punto flotante'),
      );
      refs.linStatus.replaceChildren(d.unstable.second || d.unstable.euler
        ? kit.callout({ kind: 'warning', label: 'Fuera del intervalo de estabilidad' },
          h('p', null, `Con hλ = ${minus(z)} < −2, |R(hλ)| > 1: cada paso multiplica el valor anterior por R, `
            + 'así que los valores numéricos crecen en módulo aunque la solución exacta decae. Reduzca h hasta que hλ ≥ −2.'))
        : kit.callout({ kind: 'note', label: 'Dentro del intervalo de estabilidad' },
          h('p', null, `Con hλ = ${minus(z)} ≥ −2, |R(hλ)| ≤ 1 y la solución numérica decae como la exacta. Aumente h para ver el límite.`)));
      refs.linTable.replaceChildren(V.linearTable(h, kit, d, M.LABELS));
      lineChart('linear', `y' = λy con λ = ${d.lambda} y h = ${d.h}`,
        [EDO.charts.dataset('exact', 'Solución exacta', d.curve, { pointRadius: 0 })]
          .concat(M.IDS.map((id) => EDO.charts.dataset(id, M.LABELS[id], d.xs.map((x, n) => ({ x, y: d.ys[id][n] }))))),
        axes('x', 'y'));
    }

    function guard(fn) {
      try {
        fn();
        refs.failure.hidden = true;
      } catch (err) {
        console.error(err);
        refs.failure.replaceChildren(h('p', { class: 'callout__label' }, 'Error'),
          h('p', null, `No se pudo calcular la comparación: ${err && err.message ? err.message : 'error inesperado'}`));
        refs.failure.hidden = false;
      }
    }

    function updateSame() {
      guard(() => {
        result = M.sameProblem(state.caseId, state.h);
        paintStatement();
        paintSame();
        if (study) paintSummary();
      });
    }

    function updateAll() {
      caseSelect.value = state.caseId;
      guard(() => {
        result = M.sameProblem(state.caseId, state.h);
        study = M.convergenceStudy(state.caseId);
        paintStatement();
        paintSame();
        paintStudy();
        paintSummary();
      });
      syncUrl();
    }

    /* ---- Page ------------------------------------------------------------------------------------------------ */

    const choose = h('div', { class: 'cmp__choose' },
      h('h3', null, '¿Cuál elegir?'),
      kit.callout({ kind: 'note', label: 'No hay ganador universal' },
        h('p', null, 'Los tres métodos de grado 2 tienen el mismo orden. Cuál queda más cerca depende del problema: '
          + 'cambie de caso arriba y observe cómo cambia la fila resaltada.')),
      h('ul', { class: 'cmp__advice' },
        h('li', null, h('strong', null, 'Euler: '), 'sirve como línea de base. Es el más simple, pero con el mismo h su error es el mayor (orden 1).'),
        h('li', null, h('strong', null, 'Taylor de grado 2: '), 'conviene cuando y″ se deriva con facilidad; el costo está en la derivación previa, que en problemas largos aumenta el riesgo de error algebraico.'),
        h('li', null, h('strong', null, 'Euler Mejorado y RK2: '), 'dan orden 2 sin derivar f, con dos evaluaciones por paso. Para resolver a mano suelen ser la opción más directa.')));

    page.appendChild(h('div', { class: 'cmp' },
      h('header', { class: 'cmp__head' },
        h('h1', null, 'Comparativa'),
        h('p', { class: 'lead' }, 'Los cuatro métodos sobre el mismo problema: qué tan cerca llegan, a qué velocidad mejora el error al reducir h y cuánto cuesta cada uno.')),
      h('form', { class: 'cmp__controls', 'aria-label': 'Caso y paso', novalidate: true, onsubmit: (event) => event.preventDefault() },
        h('div', { class: 'field cmp__case' }, h('label', { class: 'field__label', for: caseSelect.id }, 'Caso'), caseSelect),
        refs.hHost,
        refs.statement),
      refs.failure,
      section('tabla', 'Mismo problema, cuatro métodos',
        h('p', { class: 'muted cmp__note' }, kit.ampliacion(), ' Las columnas de error y de costo no figuran en el apunte: se agregan para comparar.'),
        refs.warnings, refs.same, refs.referenceNote),
      section('graficos', 'Soluciones y error',
        h('div', { class: 'cmp__charts' },
          figure(canvas('solution'), 'Valores de cada método en cada x y la solución exacta (o la referencia).'),
          figure(canvas('error'), 'Error absoluto en cada x, en escala logarítmica (se omite x0, donde el error es cero).'))),
      section('convergencia', [kit.ampliacion(), ' Orden de convergencia'],
        h('p', { class: 'cmp__note' }, 'El caso se resuelve con el h del enunciado y con h/2, h/4, …, h/32. Si el error se comporta como ',
          kit.im('C\\,h^p'), ', al dividir h por 2 se divide por ', kit.im('2^p'), ', y ', kit.im('p = \\log_2\\big(e(h)/e(h/2)\\big)'),
          '. En escala log-log cada método forma una recta de pendiente p; las líneas de referencia tienen pendiente 1 y 2.'),
        h('div', { class: 'cmp__charts' },
          figure(canvas('convergence'), 'Error en el punto final según h. Euler sigue la pendiente 1; los tres métodos de grado 2, la pendiente 2.'),
          h('div', { class: 'stack' }, h('h3', null, 'Orden observado'), refs.orders))),
      section('costo', [kit.ampliacion(), ' Costo y precisión'],
        h('p', { class: 'cmp__note' }, 'Cada punto es una corrida del estudio anterior: en el eje horizontal, la cantidad total de evaluaciones ',
          '(de f y, para Taylor, de sus derivadas parciales); en el vertical, el error en el punto final. Más abajo y más a la izquierda es mejor.'),
        h('div', { class: 'cmp__charts cmp__charts--wide' },
          figure(canvas('work'), 'Error en el punto final según la cantidad total de evaluaciones.')),
        refs.wpNote),
      section('lineal', [kit.ampliacion(), ' Caso lineal y estabilidad'],
        h('p', { class: 'cmp__note' }, 'En ', kit.im("y' = \\lambda y"), ' los tres métodos de grado 2 hacen exactamente la misma cuenta en cada paso: ',
          kit.im('y_{n+1} = \\left(1 + z + \\tfrac{z^2}{2}\\right) y_n'), ' con ', kit.im('z = h\\lambda'), '; Euler hace ',
          kit.im('y_{n+1} = (1 + z)\\, y_n'), '. Si ', kit.im('|R(z)| > 1'), ' los valores crecen: para los cuatro métodos eso ocurre cuando ',
          kit.im('h\\lambda < -2'), '.'),
        h('div', { class: 'cmp__linear-controls' }, lambdaControl.element,
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: hRange.id }, 'Paso h'), hRange, hOut)),
        refs.linStats, refs.linStatus,
        h('div', { class: 'cmp__charts' },
          figure(canvas('linear'), `Las curvas de Taylor de grado 2, Euler Mejorado y RK2 se superponen (${M.LINEAR.steps} pasos desde y(0) = 1).`),
          refs.linTable)),
      section('resumen', 'Resumen',
        V.summaryTable(h, kit, M.summaryMatrix()),
        choose,
        h('div', { class: 'callout', 'data-kind': 'result' },
          h('p', { class: 'callout__label' }, 'Conclusiones para este caso'), refs.conclusions),
        refs.constants)));

    buildHControl();
    updateAll();
    updateLinear();
    EDO.tex.hydrate(page);
  }

  EDO.app.registerPage('comparativa', {
    title: 'Comparativa',
    nav: { label: 'Comparativa', order: 50 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
