/**
 * Page 'simulador': solves a PVI with the chosen methods and shows the results table, the errors against the
 * exact solution (or an RK4 reference), the two charts, the step-by-step solution in the apunte's format, a CSV and
 * a shareable link. The logic (state, validation, query, tables, CSV) lives in simulator/state.js and the small DOM
 * builders in simulator/views.js; this file wires them to the form.
 *
 *  - state: one plain object of typed text (see state.js); every edit makes a new state, the inputs follow it.
 *  - recompute: debounced (150 ms). Display options (decimals, truncate/round, kind of error) and the toggles
 *    only repaint the last run. Charts are created once and updated; everything is cleaned up with ctx.signal.
 *  - URL: the inputs are written to the hash query with EDO.app.setQuery(..., {replace: true}); `#/simulador?preset=a1`
 *    (from Ejercicios) and the free form are restored on load.
 *
 * Load order: after state.js, views.js, steps-model.js, steps.js and theory/kit.js (index.html), before start.js.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const doc = root.document;
  const { h, uid } = EDO.dom;
  const S = EDO.simulator.state;
  const V = EDO.simulator.views;

  const DEBOUNCE_MS = 150;
  const MANY_POINTS = 60;

  const sub = (name, index) => [name, h('sub', null, index)];

  function render(page, ctx) {
    const kit = EDO.theory.kit.makeKit(h, EDO.format);
    const { signal } = ctx;
    let state = S.fromQuery(ctx.query);
    let current = null;
    let timer = null;
    let showDetails = false;
    let logScale = false;
    let stepsHandle = null;
    let stepsKey = '';
    const charts = { solution: null, error: null };
    const refs = {};
    const fields = {};
    const methodBoxes = {};

    const xName = () => state.indep;

    /* ---- Inputs ------------------------------------------------------------------------------------------ */

    const textInput = (key, extra) => h('input', Object.assign({
      class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', value: state[key], oninput: (event) => commit(key, event.target.value),
    }, extra));

    const presetSelect = h('select', { class: 'select', id: uid('sim-preset'), onchange: (event) => pickPreset(event.target.value) },
      h('option', { value: 'custom' }, 'Problema propio'),
      EDO.problems.GROUPS.map((g) => h('optgroup', { label: g.label },
        EDO.problems.PRESETS.filter((p) => p.group === g.id).map((p) => h('option', { value: p.id }, p.title)))));
    refs.presetNote = h('p', { class: 'field__hint' });

    fields.f = V.field(h, uid, {
      label: '',
      input: textInput('f', { 'data-mono': true }),
      hint: 'Use * para multiplicar y ^ para potencias. Funciones: sen, cos, tan, exp, ln, log, sqrt, abs. Constantes: e, pi.',
    });
    refs.preview = h('div', { class: 'sim__preview', 'aria-live': 'polite', hidden: true });
    fields.x0 = V.field(h, uid, { label: '', input: textInput('x0', { inputmode: 'decimal' }) });
    fields.y0 = V.field(h, uid, { label: '', input: textInput('y0', { inputmode: 'decimal' }) });
    fields.xf = V.field(h, uid, { label: '', input: textInput('xf', { inputmode: 'decimal' }) });
    fields.h = V.field(h, uid, { label: 'h (paso)', input: textInput('h', { inputmode: 'decimal' }), hint: 'Distancia entre dos x consecutivos.' });
    fields.N = V.field(h, uid, { label: 'N (pasos)', input: textInput('N', { inputmode: 'numeric' }), hint: `Cantidad de pasos (máximo ${S.MAX_N}).` });
    fields.exact = V.field(h, uid, { label: '', input: textInput('exact', { 'data-mono': true }) });
    const indep = V.segmented(h, uid, 'Variable independiente', [{ value: 'x', label: 'x' }, { value: 't', label: 't' }], state.indep, (value) => commit('indep', value));

    const taylorOrder = h('select', {
      class: 'select sim__order', 'aria-label': 'Grado del método de Taylor', onchange: (event) => { state = S.edit(state, 'order', event.target.value); syncInputs(); schedule(); },
    }, S.ORDERS.map((p) => h('option', { value: p }, p === 2 ? 'grado 2' : `grado ${p}`)));
    refs.taylorBadge = kit.ampliacion();

    function methodRow(id, text, extra) {
      const input = h('input', {
        type: 'checkbox', checked: state.methods.includes(id), onchange: () => toggleMethod(id, input.checked),
      });
      methodBoxes[id] = input;
      return h('div', { class: 'sim__method' }, h('label', { class: 'checkbox' }, input, h('span', null, kit.methodChip(id, text))), extra);
    }
    refs.methodsError = h('p', { class: 'field__error', role: 'alert', hidden: true });

    const decimals = h('select', { class: 'select', id: uid('sim-decimals'), onchange: (event) => display('decimals', event.target.value) },
      [2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => h('option', { value: n }, String(n))));
    const mode = V.segmented(h, uid, 'Cifras', [{ value: 'round', label: 'Redondeadas' }, { value: 'trunc', label: 'Truncadas' }], state.mode, (value) => display('mode', value));
    const errType = h('select', { class: 'select', id: uid('sim-errtype'), onchange: (event) => display('errType', event.target.value) },
      h('option', { value: 'abs' }, 'Absoluto'), h('option', { value: 'rel' }, 'Relativo'), h('option', { value: 'pct' }, 'Porcentual (%)'));

    /** Brings every control in line with the state (except the text field being typed in). */
    function syncInputs(except) {
      ['f', 'x0', 'y0', 'xf', 'h', 'N', 'exact'].forEach((key) => {
        const input = fields[key].control;
        if (key !== except && input.value !== state[key]) input.value = state[key];
      });
      presetSelect.value = state.preset;
      indep.set(state.indep);
      S.METHOD_ORDER.forEach((id) => { methodBoxes[id].checked = state.methods.includes(id); });
      taylorOrder.value = String(state.order);
      taylorOrder.disabled = !state.methods.includes('taylor');
      refs.taylorBadge.hidden = state.order <= 2 || !state.methods.includes('taylor');
      decimals.value = String(state.decimals);
      mode.set(state.mode);
      errType.value = state.errType;
      const x = xName();
      fields.f.setLabel(['f(', x, ', y) = y', h('sup', null, '′')]);
      fields.x0.setLabel(sub(x, '0'));
      fields.y0.setLabel(sub('y', '0'));
      fields.xf.setLabel(sub(x, 'f'));
      fields.exact.setLabel(`Solución exacta y(${x}) (opcional)`);
      const preset = EDO.problems.byId(state.preset);
      refs.presetNote.textContent = preset ? [preset.source].concat(preset.notes).join(' ') : 'Datos ingresados a mano.';
      fields.exact.control.placeholder = preset && preset.exact ? preset.exact.str : 'Sin solución exacta';
      fields.exact.setHint(isBlank(state.exact)
        ? (preset && preset.exact
          ? 'Vacío: se usa la solución exacta del ejemplo.'
          : 'Vacío: los errores se miden contra una referencia numérica (RK4 de paso fino), indicada como «referencia».')
        : 'Use la variable independiente elegida; no puede contener y.');
    }

    const isBlank = (s) => String(s).trim() === '';

    /* ---- Edits ------------------------------------------------------------------------------------------- */

    function commit(field, value) {
      state = S.edit(state, field, value);
      syncInputs(field);
      schedule();
    }

    function pickPreset(id) {
      state = S.edit(state, 'preset', id);
      syncInputs();
      schedule(0);
    }

    function toggleMethod(id, checked) {
      const ids = S.METHOD_ORDER.filter((m) => (m === id ? checked : state.methods.includes(m)));
      state = S.edit(Object.assign({}, state, { methods: ids }), 'order', state.order);
      syncInputs();
      schedule();
    }

    /** Display options repaint the last run: nothing is solved again. */
    function display(field, value) {
      state = S.edit(state, field, value);
      syncInputs();
      paint();
    }

    function schedule(delay) {
      root.clearTimeout(timer);
      timer = root.setTimeout(update, delay === undefined ? DEBOUNCE_MS : delay);
    }

    /* ---- Outputs: containers ------------------------------------------------------------------------------ */

    const section = (id, title, ...children) => h('section', { class: 'sim-section', 'aria-labelledby': id }, h('h2', { id }, title), ...children);

    refs.status = h('p', { class: 'muted sim__status', role: 'status' });
    refs.link = h('input', { class: 'input sim__link', type: 'text', readonly: true, 'aria-label': 'Enlace para compartir', hidden: true, onfocus: (event) => event.target.select() });
    refs.invalid = h('div', { class: 'callout', 'data-kind': 'note', role: 'status' },
      h('p', null, 'Complete o corrija los datos marcados en el panel de entrada para ver los resultados.'));
    refs.warnings = h('div', { class: 'stack', style: { '--gap': '0.5rem' } });
    refs.reference = h('p', { class: 'muted sim__reference' });
    refs.results = h('div');
    refs.errors = h('div');

    const detailsToggle = h('input', { type: 'checkbox', onchange: () => { showDetails = detailsToggle.checked; paintResults(); } });
    const logToggle = h('input', {
      type: 'checkbox',
      onchange: () => { logScale = logToggle.checked; paintCharts(); },
    });
    refs.solutionCanvas = h('canvas');
    refs.errorCanvas = h('canvas');
    refs.stepsSelect = h('select', { class: 'select', id: uid('sim-steps-method'), onchange: () => paintSteps() });
    refs.stepsNote = h('p', { class: 'muted' });
    refs.stepsHost = h('div', { class: 'sim__steps' });
    refs.stepsDetails = h('details', { class: 'disclosure sim__steps-panel' },
      h('summary', null, 'Ver la resolución paso a paso'),
      h('div', { class: 'disclosure__body stack' },
        h('div', { class: 'field sim__steps-method' }, h('label', { class: 'field__label', for: refs.stepsSelect.id }, 'Método'), refs.stepsSelect),
        refs.stepsNote, refs.stepsHost));
    refs.stepsDetails.addEventListener('toggle', () => { if (refs.stepsDetails.open) paintSteps(); });

    refs.outputs = h('div', { class: 'sim__results stack' },
      refs.warnings,
      section('sim-results-title', 'Resultados',
        h('div', { class: 'stack', style: { '--gap': '0.75rem' } },
          h('label', { class: 'checkbox' }, detailsToggle, h('span', null, 'Mostrar valores intermedios')),
          refs.results)),
      section('sim-errors-title', [kit.ampliacion(), ' Errores'],
        refs.reference, refs.errors),
      section('sim-charts-title', 'Gráficos',
        h('div', { class: 'sim__charts' },
          h('figure', { class: 'chart' }, h('div', { class: 'chart-box' }, refs.solutionCanvas),
            h('figcaption', null, 'Solución numérica de cada método y solución exacta (o referencia).')),
          h('figure', { class: 'chart' },
            h('label', { class: 'checkbox sim__log' }, logToggle, h('span', null, 'Escala logarítmica')),
            h('div', { class: 'chart-box' }, refs.errorCanvas),
            h('figcaption', null, 'Error de cada método en cada x (la escala logarítmica omite los errores iguales a cero).')))),
      section('sim-steps-title', 'Paso a paso', refs.stepsDetails));

    /* ---- Painting ------------------------------------------------------------------------------------------ */

    const tableOptions = () => ({
      decimals: state.decimals, mode: state.mode, errType: state.errType, intermediate: showDetails,
    });

    function paintResults() {
      if (!current) return;
      refs.results.replaceChildren(V.table(h, kit, S.resultsTable(current, tableOptions()), {
        label: 'Resultados: n, x y los valores de y de cada método',
        caption: state.mode === 'trunc' ? 'Valores truncados, como en el apunte. Los cálculos usan precisión completa.' : 'Valores redondeados. Los cálculos usan precisión completa.',
      }));
    }

    function paintErrors() {
      if (!current) return;
      const kind = S.ERROR_HEAD[state.errType];
      refs.errors.replaceChildren(V.table(h, kit, S.errorsTable(current, tableOptions()), {
        label: `Tabla de errores (${kind}) respecto de ${current.reference.kind === 'exact' ? 'la solución exacta' : 'la referencia'}`,
      }));
      refs.reference.replaceChildren();
      if (current.reference.kind === 'exact') {
        refs.reference.append('Verificación contra la solución exacta ', `$y(${current.problem.indep}) = ${current.reference.tex}$.`);
        EDO.tex.hydrate(refs.reference);
      } else {
        refs.reference.textContent = 'Este problema no tiene solución exacta conocida: los errores se miden contra una referencia numérica (RK4 con un paso mucho menor que h), indicada como «referencia».';
      }
    }

    function chartOptions(yTitle, yType) {
      return {
        scales: {
          x: { type: 'linear', title: { display: true, text: xName() } },
          y: { type: yType, title: { display: true, text: yTitle } },
        },
      };
    }

    const lineExtra = (points) => (points.length > MANY_POINTS ? { pointRadius: 0, pointHoverRadius: 3 } : {});

    function paintCharts() {
      if (!current) return;
      const series = S.chartSeries(current);
      const solutionSets = [EDO.charts.dataset('exact', series.reference.label, series.reference.points, { pointRadius: 0 })];
      series.methods.forEach((m) => solutionSets.push(EDO.charts.dataset(m.id, m.label, m.points, lineExtra(m.points))));
      const solutionOptions = chartOptions('y', 'linear');
      if (charts.solution) charts.solution.update({ data: { datasets: solutionSets }, options: solutionOptions });
      else charts.solution = EDO.charts.create(refs.solutionCanvas, { type: 'line', data: { datasets: solutionSets }, options: solutionOptions }, { title: 'Soluciones numéricas y solución exacta', signal });

      const errorSets = S.errorSeries(current, { errType: state.errType, log: logScale })
        .map((m) => EDO.charts.dataset(m.id, m.label, m.points, lineExtra(m.points)));
      const errorOptions = chartOptions(S.ERROR_HEAD[state.errType], logScale ? 'logarithmic' : 'linear');
      if (charts.error) charts.error.update({ data: { datasets: errorSets }, options: errorOptions });
      else charts.error = EDO.charts.create(refs.errorCanvas, { type: 'line', data: { datasets: errorSets }, options: errorOptions }, { title: 'Error de cada método', signal });
    }

    function paintSteps() {
      if (!current || !refs.stepsDetails.open) return;
      const ids = current.solutions.map((s) => s.id);
      const key = ids.join();
      if (key !== stepsKey) {
        const previous = refs.stepsSelect.value;
        refs.stepsSelect.replaceChildren(...current.solutions.map((s) => h('option', { value: s.id }, s.label)));
        refs.stepsSelect.value = ids.includes(previous) ? previous : ids[0];
        stepsKey = key;
      }
      const upTo = S.stepsUpTo(current.problem.N);
      refs.stepsNote.textContent = upTo
        ? `Se muestran las primeras ${upTo} de ${current.problem.N} iteraciones; el resto sigue el mismo procedimiento.`
        : '';
      let model;
      try {
        model = EDO.stepsModel.build(current.problem, refs.stepsSelect.value, {
          mode: state.mode, decimals: state.decimals, order: state.order, upTo,
        });
      } catch (err) {
        console.error(err);
        refs.stepsHost.replaceChildren(h('p', { class: 'chart-notice', role: 'alert' }, 'No se pudo armar la resolución paso a paso para estos datos.'));
        stepsHandle = null;
        return;
      }
      if (!stepsHandle || !refs.stepsHost.contains(stepsHandle.element)) {
        refs.stepsHost.replaceChildren();
        stepsHandle = EDO.steps.render(refs.stepsHost, model, { signal, collapsible: true, headingLevel: 3 });
      } else {
        stepsHandle.update(model);
      }
    }

    function paintWarnings() {
      refs.warnings.replaceChildren(...current.diverged.map((d) => h('div', { class: 'callout', 'data-kind': 'warning', role: 'status' },
        h('p', { class: 'callout__label' }, `Divergencia: ${d.label}`), h('p', null, d.message))));
    }

    function paint() {
      if (!current) return;
      paintResults();
      paintErrors();
      paintCharts();
      paintSteps();
    }

    /* ---- Update ---------------------------------------------------------------------------------------------- */

    function showErrors(errors) {
      ['f', 'x0', 'y0', 'xf', 'h', 'N', 'exact'].forEach((key) => fields[key].setError(errors[key] || null));
      refs.methodsError.textContent = errors.methods ? errors.methods.message : '';
      refs.methodsError.hidden = !errors.methods;
    }

    function updatePreview(errors) {
      if (errors.f) {
        refs.preview.replaceChildren();
        refs.preview.hidden = true;
        return;
      }
      try {
        const tex = EDO.expr.toTeX(EDO.expr.parse(state.f, { indep: state.indep }), { indep: state.indep });
        EDO.tex.render(refs.preview, `y' = ${tex}`);
        refs.preview.hidden = false;
      } catch (err) {
        refs.preview.replaceChildren();
        refs.preview.hidden = true;
      }
    }

    function syncUrl() {
      try {
        EDO.app.setQuery(S.toQuery(state), { replace: true, merge: false });
      } catch (err) {
        /* history may be unavailable in sandboxed contexts: the page still works */
      }
    }

    function update() {
      timer = null;
      const check = S.validate(state);
      showErrors(check.errors);
      updatePreview(check.errors);
      let next = null;
      if (check.ok) {
        try {
          next = S.run(state);
        } catch (err) {
          console.error(err);
          refs.invalid.querySelector('p').textContent = `No se pudo resolver el problema: ${err && err.message ? err.message : 'error inesperado'}`;
        }
      }
      if (next && next.ok) {
        current = next;
        refs.invalid.hidden = true;
        refs.outputs.hidden = false;
        paintWarnings();
        paint();
      } else {
        current = null;
        refs.outputs.hidden = true;
        refs.invalid.hidden = false;
        if (check.ok === false) refs.invalid.querySelector('p').textContent = 'Complete o corrija los datos marcados en el panel de entrada para ver los resultados.';
      }
      syncUrl();
    }

    /* ---- Export and share ------------------------------------------------------------------------------------- */

    function say(message) {
      refs.status.textContent = message;
      EDO.app.announce(message);
    }

    function downloadCsv() {
      if (!current) return;
      const blob = new root.Blob(['﻿', S.csv(current)], { type: 'text/csv;charset=utf-8' });
      const href = root.URL.createObjectURL(blob);
      const link = h('a', { href, download: `simulador-${current.problem.id}.csv`, hidden: true });
      doc.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(() => root.URL.revokeObjectURL(href), 1500);
      say('Se descargó el archivo CSV con todos los valores.');
    }

    async function copyLink() {
      if (timer !== null) {
        root.clearTimeout(timer);
        update();
      }
      const url = root.location.href;
      try {
        await root.navigator.clipboard.writeText(url);
        refs.link.hidden = true;
        say('Enlace copiado al portapapeles.');
      } catch (err) {
        refs.link.value = url;
        refs.link.hidden = false;
        refs.link.focus();
        refs.link.select();
        say('No se pudo copiar automáticamente: copie el enlace seleccionado con Ctrl+C.');
      }
    }

    /* ---- Page ------------------------------------------------------------------------------------------------ */

    const inputs = h('form', {
      class: 'sim__panel stack', 'aria-labelledby': 'sim-inputs-title', novalidate: true, onsubmit: (event) => event.preventDefault(),
    },
    h('h2', { id: 'sim-inputs-title' }, 'Datos del problema'),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: presetSelect.id }, 'Ejemplo'), presetSelect, refs.presetNote),
    indep.element,
    h('div', { class: 'stack', style: { '--gap': '0.25rem' } }, fields.f.element, refs.preview),
    h('div', { class: 'sim__row' }, fields.x0.element, fields.y0.element, fields.xf.element),
    h('div', { class: 'sim__row' }, fields.h.element, fields.N.element),
    h('fieldset', { class: 'sim__group' },
      h('legend', null, 'Métodos'),
      methodRow('euler', 'Euler', kit.badge('Línea de base')),
      methodRow('taylor', 'Taylor', h('span', { class: 'sim__order-wrap' }, taylorOrder, refs.taylorBadge)),
      methodRow('heun', 'Euler Mejorado'),
      methodRow('rk2', 'RK2 (punto medio)'),
      refs.methodsError),
    fields.exact.element,
    h('fieldset', { class: 'sim__group' },
      h('legend', null, 'Visualización'),
      h('div', { class: 'sim__row' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: decimals.id }, 'Decimales'), decimals),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: errType.id }, 'Tipo de error'), errType)),
      mode.element));

    const actions = h('div', { class: 'sim__actions cluster' },
      h('button', { type: 'button', class: 'btn', 'data-variant': 'primary', onclick: downloadCsv }, 'Descargar CSV'),
      h('button', { type: 'button', class: 'btn', onclick: copyLink }, 'Copiar enlace'),
      refs.status, refs.link);

    page.appendChild(h('div', { class: 'sim' },
      h('header', { class: 'sim__head' },
        h('h1', null, 'Simulador'),
        h('p', { class: 'lead' }, 'Resuelva un problema de valor inicial con Euler, Taylor, Euler Mejorado y RK2, compare los resultados con la solución exacta y vea cada paso en el formato del apunte.')),
      h('div', { class: 'sim__layout' },
        h('div', { class: 'sim__inputs' }, inputs),
        h('div', { class: 'sim__outputs stack' }, actions, refs.invalid, refs.outputs))));

    refs.outputs.hidden = true;
    syncInputs();
    update();
    EDO.tex.hydrate(page);

    signal.addEventListener('abort', () => {
      root.clearTimeout(timer);
      timer = null;
      current = null;
    }, { once: true });
  }

  EDO.app.registerPage('simulador', {
    title: 'Simulador',
    nav: { label: 'Simulador', order: 40 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
