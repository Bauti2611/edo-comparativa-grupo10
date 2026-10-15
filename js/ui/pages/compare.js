/**
 * Page 'comparativa': the page that carries the assigned topic, so the whole comparison lives here. It shows the four
 * methods on the same problem (table at x_f, one-step diagram, solution and error charts), the order of the error
 * (local, global and the convergence study computed live), the constant of the local error that decides which
 * second-order method wins, the work-precision chart, the linear case y' = λy with its stability limit, and the
 * summary with "¿Cuál elegir, dado un problema?" — the only decision guide of the site — and conclusions written
 * from the computed numbers. The logic lives in compare/model.js and the DOM builders in compare/views.js; this
 * file wires them to the controls.
 *
 *  - state: {caseId, h} written to the hash query (`#/comparativa?caso=cmp_3x2y&h=0.05`, empty for the default case).
 *    A change of h recomputes the table and the two first charts; a change of case also the study, the constants,
 *    the summary and the one-step diagram.
 *  - charts: created once after the page is in the DOM, then updated; all of them are destroyed through ctx.signal,
 *    and so are the "El paso" diagram and the opening figure.
 *  - sub-routes: '#/comparativa/constantes' scrolls to the section with id 'comparativa-constantes' (the shell does it).
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
    let diagram = null;
    let solutionZoomed = false;
    let zoomInBtn = null;
    let zoomOutBtn = null;
    let convZoomed = false;
    let convZoomInBtn = null;
    let convZoomOutBtn = null;
    const charts = {};
    const refs = {};

    function convergenceZoomWindow(std) {
      if (!std || !std.errors) return null;
      const secondErrors = [];
      ['taylor', 'heun', 'rk2'].forEach((id) => {
        (std.errors[id] || []).forEach((e) => {
          if (Number.isFinite(e) && e > 0) secondErrors.push(e);
        });
      });
      if (!secondErrors.length) return null;
      const minVal = Math.min(...secondErrors);
      const maxVal = Math.max(...secondErrors);
      const hs = (std.hs || []).filter((h) => Number.isFinite(h) && h > 0);
      const hMin = Math.min(...hs);
      const hMax = Math.max(...hs);
      return {
        xMin: hMin * 0.75,
        xMax: hMax * 1.35,
        yMin: minVal * 0.5,
        yMax: maxVal * 1.4,
      };
    }

    function solutionZoomWindow(res) {
      if (!res || !res.problem) return null;
      const x0 = res.problem.x0;
      const xf = res.problem.xf;
      const h = res.h;
      const endYs = [];
      const prevYs = [];
      const series = M.solutionSeries(res);
      if (series.reference && series.reference.points && series.reference.points.length >= 2) {
        const pts = series.reference.points;
        endYs.push(pts[pts.length - 1].y);
      }
      ['taylor', 'heun', 'rk2'].forEach((id) => {
        const sol = res.solutions[id];
        if (sol && sol.ys && sol.ys.length >= 2) {
          endYs.push(sol.ys[sol.ys.length - 1]);
          prevYs.push(sol.ys[sol.ys.length - 2]);
        }
      });
      const validEnd = endYs.filter(Number.isFinite);
      if (!validEnd.length) return null;
      const yMinVal = Math.min(...validEnd);
      const yMaxVal = Math.max(...validEnd);
      const spreadY = Math.max(0.002, yMaxVal - yMinVal);
      const padY = spreadY * 0.55;
      const yMin = yMinVal - padY;
      const yMax = yMaxVal + padY;

      // Estimate slope over the final step to frame horizontal range proportionally
      const validPrev = prevYs.filter(Number.isFinite);
      const avgEnd = validEnd.reduce((a, b) => a + b, 0) / validEnd.length;
      const avgPrev = validPrev.length ? validPrev.reduce((a, b) => a + b, 0) / validPrev.length : avgEnd;
      const slope = Math.abs((avgEnd - avgPrev) / Math.max(1e-9, h));
      const spanY = yMax - yMin;
      const xActive = slope > 1e-6 ? spanY / slope : h * 0.5;
      const xSpanBefore = Math.min(xf - x0, Math.max(h * 0.2, xActive * 1.35));
      const xSpanAfter = Math.max(h * 0.04, xActive * 0.3);

      return {
        xMin: Math.max(x0, xf - xSpanBefore),
        xMax: xf + xSpanAfter,
        yMin,
        yMax,
      };
    }

    /**
     * Coefficients of F2 and of f_y D in the one-step local error, as exact fractions. They come from the order
     * conditions of the RK2 family (kit.familyMember), not from typed strings: Taylor's 1/6 is the h³/3! of the
     * discarded remainder, the punto medio gives 1/24 and Euler Mejorado −1/12.
     */
    const COEF = (() => {
      const { Q, familyMember } = kit;
      const fractions = (m) => ({ f2: Q.tex(m.f2), fyd: Q.tex(m.fyd) });
      return {
        taylor: { f2: Q.tex(Q.of(1, 6)), fyd: Q.tex(Q.of(1, 6)) },
        rk2: fractions(familyMember(Q.of(1, 1))),
        heun: fractions(familyMember(Q.of(1, 2))),
      };
    })();

    const fTeX = (problem) => EDO.expr.toTeX(problem.fNode, { indep: problem.indep });
    const names = (ids) => ids.map((id) => M.LABELS[id]).join(', ');

    /**
     * The members of the two-stage RK2 family, from the order conditions: Euler Mejorado and the punto medio are
     * two choices of the same free parameter, and that is why only their coefficient of F2 differs. Ralston is the
     * third choice some texts print; the apunte has no name for it.
     */
    const FAMILY = (() => {
      const { Q, familyMember } = kit;
      return [
        { id: 'heun', label: 'Euler Mejorado (Heun)', a2: Q.of(1, 2), apunte: 'Euler Mejorado' },
        { id: 'rk2', label: 'Punto medio', a2: Q.of(1, 1), apunte: 'RK2 (Runge-Kutta de grado 2)' },
        { id: null, label: 'Ralston', a2: Q.of(2, 3), apunte: null },
      ].map((m) => {
        const member = familyMember(m.a2);
        return Object.assign({}, m, {
          a1: Q.tex(member.a1), a2: Q.tex(member.a2), p: Q.tex(member.p), f2: Q.tex(member.f2), member,
        });
      });
    })();
    /** The other pair of values some texts print as "Ralston" (a2 = 3/4): it also meets the order conditions. */
    const VARIANT = (() => {
      const { Q, familyMember } = kit;
      const m = familyMember(Q.of(3, 4));
      return { a2: Q.tex(m.a2), p: Q.tex(m.p), f2: Q.tex(m.f2) };
    })();

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
      solutionZoomed = false;
      convZoomed = false;
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
    refs.errors = h('div');
    refs.orders = h('div');
    refs.wpNote = h('p', { class: 'cmp__note' });
    refs.conclusions = h('ul', { class: 'cmp__conclusions' });
    refs.constants = h('div', { class: 'stack' });
    refs.failure = h('div', { class: 'callout', 'data-kind': 'warning', role: 'alert', hidden: true });
    refs.diagram = h('div', { class: 'cmp__diagram', role: 'group', 'aria-label': 'Diagrama de un paso con los cuatro métodos' });

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

    function lineChart(key, title, datasets, options, chartOpts) {
      const config = { type: 'line', data: { datasets }, options };
      if (charts[key]) charts[key].update({ data: { datasets }, options });
      else charts[key] = EDO.charts.create(refs[key], config, Object.assign({ title, signal }, chartOpts));
    }

    function makeZoomPlugin(xType, yType, zoomLimits) {
      const isXLog = xType === 'logarithmic';
      const isYLog = yType === 'logarithmic';
      const limits = Object.assign({}, zoomLimits || {});
      if (isXLog && !limits.x) limits.x = { min: 1e-6, max: 10 };
      if (isYLog && !limits.y) limits.y = { min: 1e-12, max: 1e6 };
      return {
        zoom: {
          wheel: { enabled: true, modifierKey: 'ctrl', speed: 0.08 },
          drag: {
            enabled: true,
            modifierKey: 'shift',
            backgroundColor: 'rgba(55, 70, 92, 0.12)',
            borderColor: '#6f7c91',
            borderWidth: 1,
            threshold: 6,
          },
          pinch: { enabled: true },
          mode: 'xy',
        },
        pan: {
          enabled: true,
          mode: 'xy',
          threshold: 8,
        },
        limits,
      };
    }

    const axes = (xTitle, yTitle, xType, yType, zoomLimits) => ({
      scales: {
        x: { type: xType || 'linear', title: { display: true, text: xTitle } },
        y: { type: yType || 'linear', title: { display: true, text: yTitle } },
      },
      plugins: {
        zoom: makeZoomPlugin(xType, yType, zoomLimits),
      },
    });

    function paintStatement() {
      const p = result.problem;
      const preset = result.preset;
      refs.statement.replaceChildren(
        h('p', { class: 'cmp__pvi' }, `$y' = ${fTeX(p)}$`, ', ', `$y(${kit.plain(p.x0, 6)}) = ${kit.plain(p.y0, 6)}$`, '; se busca ',
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
      const solAxes = axes(x, 'y');
      if (solutionZoomed) {
        const zw = solutionZoomWindow(result);
        if (zw) {
          solAxes.scales.x.min = zw.xMin;
          solAxes.scales.x.max = zw.xMax;
          solAxes.scales.y.min = zw.yMin;
          solAxes.scales.y.max = zw.yMax;
        }
      } else {
        solAxes.scales.x.min = undefined;
        solAxes.scales.x.max = undefined;
        solAxes.scales.y.min = undefined;
        solAxes.scales.y.max = undefined;
      }
      if (zoomInBtn) zoomInBtn.setAttribute('aria-pressed', solutionZoomed ? 'true' : 'false');
      if (zoomOutBtn) zoomOutBtn.setAttribute('aria-pressed', solutionZoomed ? 'false' : 'true');

      lineChart('solution', 'Soluciones numéricas y solución exacta',
        [EDO.charts.dataset('exact', series.reference.label, series.reference.points, { pointRadius: 0 })]
          .concat(series.methods.map((m) => EDO.charts.dataset(m.id, m.label, m.points))),
        solAxes,
        { tools: [zoomInBtn, zoomOutBtn], customReset: true });
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
      const convAxes = axes('h', 'Error en el punto final', 'logarithmic', 'logarithmic');
      if (convZoomed) {
        const zw = convergenceZoomWindow(study);
        if (zw) {
          convAxes.scales.x.min = zw.xMin;
          convAxes.scales.x.max = zw.xMax;
          convAxes.scales.y.min = zw.yMin;
          convAxes.scales.y.max = zw.yMax;
        }
      } else {
        convAxes.scales.x.min = undefined;
        convAxes.scales.x.max = undefined;
        convAxes.scales.y.min = undefined;
        convAxes.scales.y.max = undefined;
      }
      if (convZoomInBtn) convZoomInBtn.setAttribute('aria-pressed', convZoomed ? 'true' : 'false');
      if (convZoomOutBtn) convZoomOutBtn.setAttribute('aria-pressed', convZoomed ? 'false' : 'true');

      lineChart('convergence', 'Error en el punto final según el paso h (escala log-log)', sets, convAxes,
        { tools: [convZoomInBtn, convZoomOutBtn], customReset: true });
      refs.errors.replaceChildren(V.convergenceTable(h, kit, study));
      refs.orders.replaceChildren(V.ordersTable(h, kit, study));

      lineChart('work', 'Error en el punto final según la cantidad de evaluaciones (escala log-log)',
        M.workPrecision(study).map((s) => EDO.charts.dataset(s.id, s.label, s.points)),
        axes('Evaluaciones totales', 'Error en el punto final', 'logarithmic', 'logarithmic'));
    }

    /**
     * The constants of the one-step local error for the selected case: what the leading term predicts, what a
     * real step commits, and whether the ranking by |C| is the one observed at x_f. Every value is computed.
     */
    function paintConstants() {
      const c = M.localConstants(state.caseId);
      if (!c) {
        refs.constants.replaceChildren(h('p', { class: 'muted' },
          'Este caso no permite calcular las constantes del error local: faltan las derivadas segundas de f.'));
        return;
      }
      const best = c.ranking[0];
      const factor = Math.abs(c.measured[best]) > 0 ? Math.abs(c.euler) / Math.abs(c.measured[best]) : null;
      refs.constants.replaceChildren(
        h('p', null, `En $(x_0, y_0) = (${kit.plain(c.x0, 6)}, ${kit.plain(c.y0, 6)})$ con $h = ${c.h}$ valen `
          + `$D = ${kit.plain(c.D, 4)}$, $F_2 = ${kit.plain(c.F2, 4)}$ y $f_y D = ${kit.plain(c.fyD, 4)}$, de modo que la constante `
          + '$C$ de cada método y el error que comete realmente un paso son:'),
        V.constantsTable(h, kit, c, COEF),
        h('p', null, `Para comparar, Euler comete en el mismo paso un error de ${kit.sci(c.euler, 4)}`,
          factor !== null && factor > 1 ? `, unas ${kit.plain(factor, 0)} veces el de ${M.LABELS[best]}` : '',
          ': su error local es de orden $h^{2}$, no $h^{3}$.'),
        h('p', null, 'El error medido supera a $C\\,h^{3}$ porque incluye términos de orden $h^{4}$ y superior. '
          + 'Esos términos pierden peso al reducir h: el cociente entre el error medido y $C\\,h^{3}$ tiende a 1.'),
        V.ratiosTable(h, kit, c),
        h('p', null, `Ordenados por |C|: ${names(c.ranking)}. `, c.matchesObserved
          ? `Coincide con el orden observado en la tabla con el h del caso: la constante más pequeña explica por qué ${M.LABELS[best]} queda más cerca.`
          : `No coincide con el orden observado (${names(c.observed)}): las constantes cambian a lo largo del intervalo y los errores de cada paso se propagan, así que el valor en $x_0$ no alcanza para predecir el resultado.`),
      );
      EDO.tex.hydrate(refs.constants);
    }

    function paintSummary() {
      const lines = M.conclusions(result, study);
      refs.conclusions.replaceChildren(...lines.map((line) => h('li', null, line)));
      const workLine = lines.find((line) => /evaluaciones \(h =|Ni con/.test(line));
      refs.wpNote.textContent = workLine || '';
      refs.wpNote.hidden = !workLine;
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
        paintConstants();
        paintSummary();
        if (diagram) diagram.update({ problem: state.caseId });
      });
      syncUrl();
    }

    /* ---- Page ------------------------------------------------------------------------------------------------ */

    // The decision guide, and the only one on the site: it starts from the problem at hand, not from the method,
    // and every count comes from the engine (`summaryMatrix`, `noUniversalWinner`, `taylorFarthest`).
    const cost = Object.fromEntries(M.summaryMatrix().map((r) => [r.id, r]));
    const taylorWorst = M.taylorFarthest();
    const times = (n) => (n === 1 ? 'una sola evaluación' : `${n} evaluaciones`);
    const howOften = (n) => (n === 1 ? 'una sola vez' : `${n} veces`);
    const choose = h('div', { class: 'cmp__choose' },
      h('h3', null, '¿Cuál elegir, dado un problema?'),
      kit.callout({ kind: 'note', label: 'No hay ganador universal' },
        h('p', null, 'Los tres métodos de grado 2 tienen el mismo orden. Cuál queda más cerca depende del problema: '
          + 'cambie de caso arriba y observe cómo cambia la fila resaltada.'),
        M.noUniversalWinner() ? h('p', null, M.noUniversalWinner()) : null),
      h('ul', { class: 'cmp__advice' },
        h('li', null, h('strong', null, 'Si ', kit.im('f'), ' es barata y sus derivadas parciales están a mano: '),
          'Taylor de grado 2 es competitivo. Evalúa ', kit.im('f'), ` ${howOften(cost.taylor.fEvals)} por paso y usa `
          + `${cost.taylor.derivEvals} derivadas parciales obtenidas de antemano (${cost.taylor.perStep} evaluaciones en total). `
          + 'El riesgo no es el costo: es el error algebraico al derivar. Tener el mismo orden no lo hace más preciso'
          + (taylorWorst.total === 0 ? '.' : (taylorWorst.always
            ? `: en los ${taylorWorst.total} casos de este catálogo fue el de mayor error de los tres.`
            : `: en ${taylorWorst.count} de los ${taylorWorst.total} casos de este catálogo fue el de mayor error de los tres.`))),
        h('li', null, h('strong', null, 'Si no hay derivadas, o ', kit.im('f'), ' es complicada o viene tabulada: '),
          `Euler Mejorado o RK2. Llegan al mismo orden 2 con ${cost.heun.perStep} evaluaciones de `, kit.im('f'),
          ' por paso y ninguna derivada, así que sirven aunque ', kit.im('f'),
          ' solo se pueda evaluar. Entre los dos, decida con la tabla de arriba para su problema.'),
        h('li', null, h('strong', null, 'Si solo se necesita una estimación aproximada: '),
          `Euler, con ${times(cost.euler.perStep)} por paso. Es de orden 1, así que para igualar la precisión de los otros `,
          'hace falta un paso mucho más chico: lo mide ', kit.link('#/comparativa/costo', 'Costo y precisión'), '.'),
        h('li', null, h('strong', null, 'Si el problema es rígido o ', kit.im('h\\lambda < -2'), ': '),
          'ninguno de los cuatro sirve sin reducir el paso: los valores crecen aunque la solución decaiga.')));

    zoomInBtn = h('button', {
      type: 'button', class: 'chart-tool-btn', id: 'cmp-btn-zoom-in', 'data-zoom': 'in',
      'aria-pressed': solutionZoomed ? 'true' : 'false',
      title: 'Ampliar el final (separar curvas)',
      onclick: () => {
        solutionZoomed = true;
        paintSame();
      },
    }, '🔍 Separar curvas');

    zoomOutBtn = h('button', {
      type: 'button', class: 'chart-tool-btn', id: 'cmp-btn-zoom-out', 'data-zoom': 'out',
      'aria-pressed': solutionZoomed ? 'false' : 'true',
      title: 'Restablecer zoom (Vista completa)',
      onclick: () => {
        solutionZoomed = false;
        if (charts.solution && charts.solution.chart && typeof charts.solution.chart.resetZoom === 'function') {
          charts.solution.chart.resetZoom();
        }
        paintSame();
      },
    }, '↺ Restablecer');

    convZoomInBtn = h('button', {
      type: 'button', class: 'chart-tool-btn', id: 'cmp-btn-conv-zoom-in', 'data-zoom': 'in',
      'aria-pressed': convZoomed ? 'true' : 'false',
      title: 'Ampliar métodos de orden 2 (separar curvas)',
      onclick: () => {
        convZoomed = true;
        paintStudy();
      },
    }, '🔍 Enfocar orden 2');

    convZoomOutBtn = h('button', {
      type: 'button', class: 'chart-tool-btn', id: 'cmp-btn-conv-zoom-out', 'data-zoom': 'out',
      'aria-pressed': convZoomed ? 'false' : 'true',
      title: 'Restablecer zoom (Vista completa)',
      onclick: () => {
        convZoomed = false;
        if (charts.convergence && charts.convergence.chart && typeof charts.convergence.chart.resetZoom === 'function') {
          charts.convergence.chart.resetZoom();
        }
        paintStudy();
      },
    }, '↺ Restablecer');

    page.appendChild(h('div', { class: 'cmp' },
      h('header', { class: 'cmp__head' },
        h('h1', null, 'Comparativa'),
        h('p', { class: 'lead' }, 'Los cuatro métodos sobre el mismo problema: qué tan cerca llegan, a qué velocidad mejora el error al reducir h, qué constante decide cuál gana y cuánto cuesta cada uno.')),
      h('form', { class: 'cmp__controls', 'aria-label': 'Caso y paso', novalidate: true, onsubmit: (event) => event.preventDefault() },
        h('div', { class: 'field cmp__case' }, h('label', { class: 'field__label', for: caseSelect.id }, 'Caso'), caseSelect),
        refs.hHost,
        refs.statement),
      refs.failure,
      section('tabla', 'Mismo problema, cuatro métodos',
        h('p', { class: 'muted cmp__note' }, kit.ampliacion(), ' Las columnas de error y de costo no figuran en el apunte: se agregan para comparar.'),
        refs.warnings, refs.same, refs.referenceNote,
        h('p', { class: 'cmp__note' }, 'El diagrama baja a un solo paso del caso elegido: al mover ', kit.im('h'),
          ' se ve dónde cae cada método respecto del valor exacto, y de dónde sale la diferencia que la tabla acumula.'),
        refs.diagram),
      section('graficos', 'Soluciones y error',
        h('div', { class: 'cmp__charts' },
          figure(canvas('solution'), 'Valores de cada método en cada x y la solución exacta (o la referencia).'),
          figure(canvas('error'), 'Error absoluto en cada x, en escala logarítmica (se omite x0, donde el error es cero).'))),
      section('convergencia', [kit.ampliacion(), ' Orden de convergencia'],
        h('div', { class: 'prose' },
          h('p', null, 'Cada paso comete un error porque la fórmula descarta términos de la serie de Taylor o aproxima una integral. Conviene distinguir dos:'),
          h('ul', null,
            h('li', null, h('strong', null, 'Error local'), ': el que comete un solo paso, suponiendo exacto el punto de partida ', kit.im('y_n'), '.'),
            h('li', null, h('strong', null, 'Error global'), ': el que se acumula hasta ', kit.im('x_n'), ', es decir ', kit.im('y(x_n) - y_n'),
              '; suma el efecto de todos los pasos anteriores.')),
          h('p', null, 'Si el error local es del orden de ', kit.im('h^{p+1}'), ', el error global en un ', kit.im('x_f'),
            ' fijo es del orden de ', kit.im('h^{p}'), ': son ', kit.im('N = (x_f - x_0)/h'), ' pasos y cada uno aporta un error de orden ',
            kit.im('h^{p+1}'), '. Ese ', kit.im('p'), ' es el ', h('strong', null, 'orden'), ' del método. En Taylor de grado 2 el error local es justamente el resto que se descartó, ',
            kit.im('\\frac{h^{3}}{3!}\\,y\'\'\'(\\xi)'), '.')),
        V.orderTable(h, kit, M.orderTable()),
        h('p', { class: 'cmp__note' }, 'Eso se mide: el caso se resuelve con el h del enunciado y con h/2, h/4, …, h/32. Si el error se comporta como ',
          kit.im('C\\,h^p'), ', al dividir h por 2 se divide por ', kit.im('2^p'), ', y ', kit.im('p = \\log_2\\big(e(h)/e(h/2)\\big)'),
          '. En escala log-log cada método forma una recta de pendiente p; las líneas de referencia tienen pendiente 1 y 2.'),
        h('div', { class: 'cmp__charts cmp__charts--stack' },
          figure(canvas('convergence'), 'Error en el punto final según h. Euler sigue la pendiente 1; los tres métodos de grado 2, la pendiente 2.'),
          h('div', { class: 'stack' },
            h('h3', null, 'Error en el punto final'), refs.errors,
            h('h3', null, 'Orden observado'), refs.orders))),
      section('constantes', [kit.ampliacion(), ' La constante del error local'],
        // The thesis of the whole talk, stated where it is proved: the pair is one family, Taylor is the contrast.
        kit.callout({ kind: 'result', label: 'El punto de la comparación' },
          h('p', null, h('strong', null, 'Euler Mejorado y RK2 son la misma familia con pesos distintos.'),
            ' Los dos son métodos de Runge-Kutta de dos etapas y orden 2: Euler Mejorado reparte el peso en partes iguales entre las dos pendientes (',
            kit.im(`a_1 = a_2 = ${FAMILY[0].a2}`), ') y el punto medio se lo da entero a la pendiente intermedia (',
            kit.im(`a_1 = ${FAMILY[1].a1}`), ', ', kit.im(`a_2 = ${FAMILY[1].a2}`),
            '). De ahí sale la única diferencia entre sus errores: el coeficiente de ', kit.im('F_2'), '.'),
          h('p', null, h('strong', null, 'El contraste real es contra Taylor de grado 2.'), ' Taylor llega al mismo orden ',
            kit.im('O(h^{2})'), ' por otro camino: deriva ', kit.im('f'), ' para usar ', kit.im('y_n\'\''),
            ' en lugar de evaluar ', kit.im('f'), ' dos veces por paso. Cómo se llaman los tres y por qué se confunden está en ',
            kit.link('#/teoria/familia', 'Teoría: la familia RK2 y la nomenclatura'), '.')),
        h('div', { class: 'prose' },
          h('p', null, 'Los tres métodos de grado 2 tienen el mismo orden, así que el orden no los distingue: el error de un paso es ',
            kit.im('\\approx C\\,h^{3}'), ' y lo único que cambia es la constante ', kit.im('C'), '. Sean ',
            kit.im('D = f_x + f\\,f_y'), ' (es ', kit.im('y\'\''), ') y ', kit.im('F_2 = f_{xx} + 2f\\,f_{xy} + f^{2}f_{yy}'), '. Entonces ',
            kit.im('y\'\'\' = F_2 + f_y\\,D'), ' y el error de un paso (valor exacto menos valor calculado) es, cuando ',
            kit.im('h \\to 0'), ':')),
        V.stepFormulaTable(h, kit, COEF),
        h('p', { class: 'cmp__note' }, 'Los tres comparten el término ', kit.im(`${COEF.taylor.fyd}\\,f_y D`),
          '; solo cambia el coeficiente de ', kit.im('F_2'), ' (', kit.im(COEF.taylor.f2), ' en Taylor, ', kit.im(COEF.rk2.f2),
          ' en RK2 y ', kit.im(COEF.heun.f2), ' en Euler Mejorado). Por eso cuál método queda mejor depende del signo y del tamaño de ',
          kit.im('F_2'), ' frente a ', kit.im('f_y D'), ', es decir, del problema.'),
        refs.constants,
        kit.extension('De dónde salen esos coeficientes: una sola familia',
          h('div', { class: 'prose' },
            h('p', null, 'La forma general de un método de dos etapas es:'),
            kit.formula('y_{n+1} = y_n + h\\,(a_1 k_1 + a_2 k_2), \\qquad k_1 = f(x_n, y_n), \\qquad k_2 = f(x_n + p\\,h,\\ y_n + q\\,h\\,k_1)'),
            h('p', null, 'Aquí ', kit.im('k_1'), ' y ', kit.im('k_2'), ' son pendientes, sin el factor ', kit.im('h'),
              ' (como en la mayoría de los libros); en el apunte, ', kit.im('k_1'), ' lleva ese factor.'),
            h('p', null, 'Los parámetros ', kit.im('a_1, a_2, p, q'), ' se eligen para que el método coincida con la serie de Taylor hasta ',
              kit.im('h^{2}'), '. Se desarrolla ', kit.im('k_2'), ' alrededor de ', kit.im('(x_n, y_n)'), ', con ', kit.im('f'), ', ',
              kit.im('f_x'), ' y ', kit.im('f_y'), ' evaluadas allí:'),
            kit.formula('k_2 = f + p\\,h\\,f_x + q\\,h\\,f\\,f_y + O(h^{2})'),
            h('p', null, 'Al reemplazar queda:'),
            kit.formula('y_{n+1} = y_n + (a_1 + a_2)\\,h\\,f + a_2\\,h^{2}\\,\\bigl(p\\,f_x + q\\,f\\,f_y\\bigr) + O(h^{3})'),
            h('p', null, 'La serie de la solución es ',
              kit.im('y(x_{n+1}) = y_n + h\\,f + \\frac{h^{2}}{2}\\,(f_x + f\\,f_y) + O(h^{3})'),
              '. Para que ambas coincidan hasta ', kit.im('h^{2}'), ' con cualquier ', kit.im('f'),
              ' se igualan los coeficientes de ', kit.im('h\\,f'), ', de ', kit.im('h^{2}f_x'), ' y de ', kit.im('h^{2}f\\,f_y'), ':'),
            kit.formula('a_1 + a_2 = 1, \\qquad a_2\\,p = \\frac{1}{2}, \\qquad a_2\\,q = \\frac{1}{2}'),
            h('p', null, 'Son tres ecuaciones para cuatro incógnitas: queda un parámetro libre. Elegido ',
              kit.im('a_2 \\ne 0'), ', resultan ', kit.im('a_1 = 1 - a_2'), ' y ', kit.im('p = q = \\frac{1}{2a_2}'),
              '. Cada elección es un método de orden 2 distinto, y el coeficiente de ', kit.im('F_2'),
              ' del error local vale ', kit.im('\\frac{1}{6} - \\frac{p}{4}'), ':')),
          V.familyTable(h, kit, FAMILY),
          h('div', { class: 'prose' },
            h('p', null, 'Taylor de grado 2 no pertenece a la familia, pero se relaciona con ella: los métodos de Runge-Kutta alcanzan el orden de Taylor de grado 2 sin derivar ',
              kit.im('f'), ', porque la combinación ', kit.im('p\\,f_x + q\\,f\\,f_y'),
              ' que Taylor obtiene derivando la obtienen evaluando ', kit.im('f'), ' en un punto desplazado.'),
            h('p', { class: 'muted' }, 'Algunos textos llaman «Ralston» a la otra pareja de valores, ',
              kit.im(`a_2 = ${VARIANT.a2}`), ' y ', kit.im(`p = q = ${VARIANT.p}`),
              '. También cumple las condiciones de orden 2 y, con ella, el coeficiente de ', kit.im('F_2'), ' vale ',
              kit.im(VARIANT.f2), '; con ', kit.im(`a_2 = ${FAMILY[2].a2}`), ' y ', kit.im(`p = q = ${FAMILY[2].p}`), ' vale ',
              kit.im(FAMILY[2].f2), '.'))),
        kit.extension('Los casos del catálogo, lado a lado',
          h('p', null, 'Las mismas constantes en el punto inicial de cada caso comparativo. La última columna es el método de menor ',
            kit.im('|C|'), ', y coincide con el más cercano de la tabla de valores finales mientras las constantes no cambien demasiado a lo largo del intervalo.'),
          V.constantsOverviewTable(h, kit, M.constantsOverview(), fTeX))),
      section('costo', [kit.ampliacion(), ' Costo y precisión'],
        h('p', { class: 'cmp__note' }, 'Como unidad de costo se cuenta cuántas veces hay que evaluar una expresión (la función ',
          kit.im('f'), ' o una de sus derivadas parciales) en cada paso. No se cuenta el trabajo de obtener las derivadas a mano.'),
        V.costTable(h, kit, M.costTable()),
        h('div', { class: 'prose' },
          h('p', null, 'Taylor de grado ', kit.im('p'), ' necesita ', kit.im('f'), ' y todas sus derivadas parciales hasta el orden ',
            kit.im('p-1'), '. Como hay ', kit.im('k+1'), ' derivadas parciales de orden ', kit.im('k'), ', el total es ',
            kit.im('1 + 2 + \\dots + p = \\frac{p(p+1)}{2}'), '.'),
          h('p', null, 'El inconveniente práctico de Taylor es otro: esas derivadas hay que obtenerlas a mano, y con funciones trascendentes las expresiones crecen rápido. Euler Mejorado y RK2 logran el mismo orden 2 evaluando solo ',
            kit.im('f'), ', dos veces por paso. En este sitio un motor simbólico propio calcula las derivadas, pero a mano son la parte costosa.')),
        // What those 6 and 10 evaluations buy, measured on the apunte's own example: the trade-off, in one table.
        (() => {
          const t = M.taylorDegrees();
          const drop = (order) => kit.plain(t.rows.find((r) => r.order === order).drop, 1);
          return kit.extension('Qué compran esas evaluaciones: Taylor de grados 3 y 4',
            h('p', null, 'El apunte presenta solo el grado 2. Si se conservan más términos de la serie se obtienen grados mayores, y las derivadas se obtienen aplicando varias veces el operador de derivada total ',
              kit.im('D(g) = \\frac{\\partial g}{\\partial x} + \\frac{\\partial g}{\\partial y}\\,f'), '. En el ejemplo del apunte, ',
              kit.im(`y''' = ${t.y3TeX}`), ' y ', kit.im(`y^{(4)} = ${t.y4TeX}`), '.'),
            h('p', null, 'Un paso desde ',
              kit.im(`(x_0, y_0) = (${kit.plain(t.problem.x0, 4)}, ${kit.plain(t.problem.y0, 4)})`), ' con ',
              kit.im(`h = ${kit.plain(t.h, 4)}`), ' da, según el grado:'),
            V.taylorDegreesTable(h, kit, t),
            h('p', { class: 'muted' }, 'Valores redondeados a 6 decimales; el error es la diferencia en valor absoluto con la solución exacta.'),
            h('p', null, 'El error de un paso se divide por ', h('strong', { class: 'num' }, drop(3)),
              ' al pasar de grado 2 a 3 y por ', h('strong', { class: 'num' }, drop(4)),
              ' al pasar de 3 a 4, a cambio de ', String(M.costTable().find((r) => r.degree === 3).total), ' y ',
              String(M.costTable().find((r) => r.degree === 4).total),
              ' evaluaciones por paso y de derivar ', kit.im('f'), ' más veces a mano.'));
        })(),
        h('p', { class: 'cmp__note' }, 'Comparar con el mismo paso no es comparar con la misma precisión. Cada punto del gráfico es una corrida del estudio anterior: en el eje horizontal, la cantidad total de evaluaciones ',
          '(de f y, para Taylor, de sus derivadas parciales); en el vertical, el error en el punto final. Más abajo y más a la izquierda es mejor.'),
        h('div', { class: 'cmp__charts cmp__charts--wide' },
          figure(canvas('work'), 'Error en el punto final según la cantidad total de evaluaciones.')),
        refs.wpNote),
      section('lineal', [kit.ampliacion(), ' Caso lineal y estabilidad'],
        h('p', { class: 'cmp__note' }, 'En ', kit.im("y' = \\lambda y"), ' las derivadas segundas de ', kit.im('f'), ' son nulas (',
          kit.im('F_2 = 0'), '), así que los tres métodos de grado 2 hacen exactamente la misma cuenta en cada paso: ',
          kit.im('y_{n+1} = \\left(1 + z + \\tfrac{z^2}{2}\\right) y_n'), ' con ', kit.im('z = h\\lambda'), '; Euler hace ',
          kit.im('y_{n+1} = (1 + z)\\, y_n'), '. Si ', kit.im('|R(z)| > 1'), ' los valores crecen: para los cuatro métodos eso ocurre cuando ',
          kit.im('h\\lambda < -2'), '.'),
        h('div', { class: 'cmp__linear-controls' }, lambdaControl.element,
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: hRange.id }, 'Paso h'), hRange, hOut)),
        refs.linStats, refs.linStatus,
        h('div', { class: 'cmp__charts cmp__charts--stack' },
          figure(canvas('linear'), `Las curvas de Taylor de grado 2, Euler Mejorado y RK2 se superponen (${M.LINEAR.steps} pasos desde y(0) = 1).`),
          refs.linTable),
        kit.extension('El factor R(z) en el límite de la estabilidad',
          h('p', null, 'La solución exacta avanza un factor ', kit.im('e^{z}'), ' por paso; el factor de los métodos de orden 2 es su polinomio de Taylor de grado 2. Para ',
            kit.im('\\lambda < 0'), ' la solución exacta decrece, y la calculada decrece solo si ', kit.im('|R(z)| \\le 1'),
            '. Para los cuatro métodos eso ocurre si ', kit.im('-2 \\le z \\le 0'), ': el intervalo de estabilidad real es ',
            kit.im('[-2, 0]'), '. Con un paso demasiado grande para ese ', kit.im('\\lambda'),
            ', los valores calculados crecen aunque la solución exacta tienda a 0.'),
          V.stabilityTable(h, kit, M.stabilityScan()))),
      section('resumen', 'Resumen',
        V.summaryTable(h, kit, M.summaryMatrix()),
        h('p', { class: 'muted cmp__note' }, kit.ampliacion(), ' Las columnas «Orden global» y «Evaluaciones por paso» no figuran en el apunte, que no analiza el error ni el costo.'),
        kit.extension('Los cuatro métodos sobre los mismos problemas',
          h('p', null, 'Cada fila es un caso del catálogo comparativo: su ecuación, su condición inicial y el Valor final ',
            kit.im('x_f'), ', resuelto con el paso del enunciado. Está resaltado, en cada fila, el método de orden 2 más cercano al valor exacto.'),
          V.overviewTable(h, kit, M.winners(), fTeX)),
        choose,
        h('div', { class: 'callout', 'data-kind': 'result' },
          h('p', { class: 'callout__label' }, 'Conclusiones para este caso'), refs.conclusions))));

    buildHControl();
    updateAll();
    updateLinear();
    EDO.tex.hydrate(page);


    // "El paso" on the selected case: mounted after the page is in the DOM and destroyed through ctx.signal.
    if (EDO.stepDiagram) {
      try {
        diagram = EDO.stepDiagram.mount(refs.diagram, { problem: state.caseId, methods: 'all', signal });
      } catch (err) {
        console.error(err);
        refs.diagram.appendChild(h('p', { class: 'chart-notice', role: 'status' }, 'No se pudo mostrar el diagrama.'));
      }
    }
  }

  EDO.app.registerPage('comparativa', {
    title: 'Comparativa',
    nav: { label: 'Comparativa', order: 50 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
