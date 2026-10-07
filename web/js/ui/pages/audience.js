/**
 * Page 'audiencia': activities for the audience during the talk.
 *   - Cuestionario: the ten questions of audience/quiz.js, one at a time, immediate feedback with the explanation,
 *     score, a numbered strip to jump between questions and a reset. Options carry letters (A-D) so the room can
 *     answer aloud.
 *   - ¿Qué método llega más cerca?: pick a case and h, guess among the three second-order methods (or a tie), then
 *     reveal the computed values against the exact solution (audience/model.js `predict`).
 *   - Un paso a mano: one step of RK2, Euler Mejorado or Taylor de grado 2, an answer checked against the engine
 *     (comma or dot, 4 decimals), then the cátedra's step-by-step resolution (EDO.stepsModel + EDO.steps).
 *   - Para cerrar: questions for the audience (static).
 * Sub-routes scroll to each part: #/audiencia/cuestionario, /prediccion, /paso, /cierre.
 *
 * Load order: after audience/quiz.js, audience/model.js, theory/kit.js and simulator/views.js (index.html).
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h, uid } = EDO.dom;
  const Q = EDO.audience.quiz;
  const A = EDO.audience.model;

  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const STATUS_TEXT = {
    correct: 'correcta', wrong: 'incorrecta', close: 'cerca, pero incorrecta',
  };

  function segmented(label, options, current, onPick) {
    if (EDO.simulator && EDO.simulator.views) return EDO.simulator.views.segmented(h, uid, label, options, current, onPick);
    const id = uid('aud-sel');
    const select = h('select', { class: 'select', id, onchange: (event) => onPick(event.target.value) },
      options.map((o) => h('option', { value: o.value }, o.label)));
    select.value = current;
    return { element: h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), select), set(v) { select.value = v; } };
  }

  const section = (slug, title, ...children) => h('section', { id: `audiencia-${slug}`, class: 'aud-section', 'aria-labelledby': `audiencia-${slug}-title` },
    h('h2', { id: `audiencia-${slug}-title` }, title), ...children);

  /* ---- Quiz -------------------------------------------------------------------------------------------------- */

  function quizView(kit) {
    const state = { index: 0, results: {}, responses: {} };
    const card = h('div', { class: 'aud-quiz card', 'data-tone': 'flat' });
    const scoreLine = h('p', { class: 'aud-quiz__score' });
    const strip = h('ol', { class: 'aud-quiz__strip', role: 'list', 'aria-label': 'Preguntas' });
    const reset = h('button', { class: 'btn', type: 'button', 'data-variant': 'ghost', 'data-size': 'sm' }, 'Reiniciar el cuestionario');

    function paintScore() {
      const s = Q.score(state.results);
      scoreLine.textContent = s.answered === 0
        ? `${s.total} preguntas. Elija una opción para ver si es correcta.`
        : `Correctas: ${s.correct} de ${s.answered} respondidas (${s.total} en total).`;
      strip.replaceChildren(...Q.QUESTIONS.map((q, k) => {
        const st = state.results[q.id];
        const btn = h('button', {
          class: 'aud-quiz__dot',
          type: 'button',
          'data-state': st || 'open',
          'aria-current': k === state.index ? 'step' : null,
          'aria-label': `Pregunta ${k + 1}: ${st ? STATUS_TEXT[st] : 'sin responder'}`,
          onclick: () => go(k, true),
        }, String(k + 1));
        return h('li', null, btn);
      }));
    }

    function feedbackFor(q, result) {
      const right = result.status === 'correct';
      const key = q.kind === 'number'
        ? `La respuesta es ${EDO.format.num(Q.numericKey(q).value, { decimals: 4, mode: 'round' })}.`
        : `La respuesta es la ${LETTERS[q.options.findIndex((o) => o.id === q.answer)]}.`;
      const head = right ? 'Correcto.' : (result.status === 'close' ? `Cerca, pero no coincide en 4 decimales. ${key}` : `Incorrecto. ${key}`);
      return kit.callout({ kind: right ? 'result' : 'note', label: head }, h('p', null, q.explanation));
    }

    function answer(q, response) {
      if (state.results[q.id]) return;
      const result = Q.grade(q, response);
      if (result.status === 'empty' || result.status === 'invalid') {
        const problem = result.status === 'empty' ? 'Ingrese un valor.' : 'Ingrese un número; puede usar coma o punto decimal.';
        paintCard(problem);
        const input = card.querySelector('input');
        if (input) input.focus();
        EDO.app.announce(problem);
        return;
      }
      state.results[q.id] = result.status;
      state.responses[q.id] = response;
      paintCard();
      paintScore();
      const label = card.querySelector('.aud-quiz__feedback .callout__label');
      if (label) EDO.app.announce(label.textContent);
    }

    function paintCard(problem) {
      const q = Q.QUESTIONS[state.index];
      const done = state.results[q.id];
      const promptId = uid('aud-q');
      const prompt = h('p', { class: 'aud-quiz__prompt', id: promptId, tabindex: '-1' }, q.prompt);
      let body;
      if (q.kind === 'number') {
        const inputId = uid('aud-num');
        const input = h('input', {
          class: 'input aud-quiz__input', id: inputId, type: 'text', inputmode: 'decimal', autocomplete: 'off',
          value: state.responses[q.id] || '', readonly: Boolean(done), 'aria-invalid': problem ? 'true' : null,
          'aria-describedby': problem ? `${inputId}-err` : null,
          onkeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); answer(q, input.value); } },
        });
        body = h('div', { class: 'aud-quiz__numeric' },
          h('div', { class: 'field' },
            h('label', { class: 'field__label', for: inputId }, '$y_1 =$'),
            h('div', { class: 'aud-inline' }, input,
              h('button', { class: 'btn', type: 'button', 'data-variant': 'primary', disabled: Boolean(done), onclick: () => answer(q, input.value) }, 'Comprobar')),
            problem ? h('p', { class: 'field__error', id: `${inputId}-err` }, problem) : null));
      } else {
        body = h('div', { class: 'aud-quiz__options', role: 'group', 'aria-labelledby': promptId }, q.options.map((o, k) => {
          let mark = null;
          if (done && o.id === q.answer) mark = 'key';
          if (done && o.id === state.responses[q.id] && o.id !== q.answer) mark = 'wrong';
          return h('button', {
            class: 'aud-option',
            type: 'button',
            'data-state': mark,
            'aria-disabled': done ? 'true' : null,
            onclick: () => answer(q, o.id),
          },
          h('span', { class: 'aud-option__letter', 'aria-hidden': 'true' }, LETTERS[k]),
          h('span', { class: 'aud-option__text' }, h('span', { class: 'sr-only' }, `Opción ${LETTERS[k]}: `), o.text),
          mark === 'key' ? h('span', { class: 'sr-only' }, ' (respuesta correcta)') : null,
          mark === 'wrong' ? h('span', { class: 'sr-only' }, ' (su respuesta)') : null);
        }));
      }
      const prev = h('button', { class: 'btn', type: 'button', 'data-size': 'sm', disabled: state.index === 0, onclick: () => go(state.index - 1, true) }, 'Anterior');
      const next = h('button', {
        class: 'btn', type: 'button', 'data-size': 'sm', 'data-variant': done ? 'primary' : null, disabled: state.index === Q.QUESTIONS.length - 1, onclick: () => go(state.index + 1, true),
      }, 'Siguiente');
      card.replaceChildren(
        h('div', { class: 'aud-quiz__top' },
          h('p', { class: 'aud-quiz__count' }, `Pregunta ${state.index + 1} de ${Q.QUESTIONS.length}`),
          q.extension ? kit.ampliacion() : null),
        prompt,
        body,
        h('div', { class: 'aud-quiz__feedback' }, done ? feedbackFor(q, { status: done }) : null),
        h('div', { class: 'aud-quiz__nav' }, prev, next));
      EDO.tex.hydrate(card);
    }

    function go(index, focus) {
      state.index = Math.max(0, Math.min(Q.QUESTIONS.length - 1, index));
      paintCard();
      paintScore();
      if (focus) {
        const prompt = card.querySelector('.aud-quiz__prompt');
        if (prompt) prompt.focus({ preventScroll: true });
      }
    }

    reset.addEventListener('click', () => {
      state.results = {};
      state.responses = {};
      go(0, true);
    });

    go(0, false);
    return h('div', { class: 'stack', style: { '--gap': 'var(--space-s)' } },
      h('div', { class: 'aud-quiz__head' }, scoreLine, reset),
      card,
      strip);
  }

  /* ---- Who ends closest ---------------------------------------------------------------------------------- */

  function predictView(kit) {
    let caseId = A.PREDICT_CASES[0];
    let step = A.predict(caseId).h;
    let guess = null;
    let result = null;
    const caseSelect = h('select', { class: 'select', id: uid('aud-case'), onchange: (event) => { caseId = event.target.value; step = A.predict(caseId).h; buildH(); refresh(); } },
      A.PREDICT_CASES.map((id) => h('option', { value: id }, EDO.problems.byId(id).title)));
    const hHost = h('div');
    const statement = h('p', { class: 'aud-predict__statement' });
    const choices = h('div', { class: 'aud-predict__choices', role: 'group', 'aria-label': 'Su predicción' });
    const revealBtn = h('button', { class: 'btn', type: 'button', 'data-variant': 'primary' }, 'Mostrar el resultado');
    const out = h('div', { class: 'aud-predict__out', 'aria-live': 'polite' });

    function buildH() {
      const control = segmented('Paso h', A.predictHs(caseId).map((v) => ({ value: String(v), label: String(v) })), String(step), (v) => { step = Number(v); refresh(); });
      hHost.replaceChildren(control.element);
    }

    function paintChoices() {
      choices.replaceChildren(...A.SECOND.concat(['tie']).map((id) => h('button', {
        class: 'aud-choice', type: 'button', 'aria-pressed': String(guess === id), onclick: () => { guess = id; paintChoices(); },
      }, id === 'tie' ? h('span', null, A.LABELS.tie) : h('span', { class: 'method-chip', 'data-method': id }, A.LABELS[id]))));
    }

    function refresh() {
      result = A.predict(caseId, step);
      guess = null;
      const x = result.indep;
      statement.replaceChildren(`$y' = ${result.fTex}$, $y(${result.x0}) = ${result.y0}$; con $h = ${result.h}$ se dan $N = ${result.N}$ pasos hasta $${x} = ${result.xf}$.`);
      EDO.tex.hydrate(statement);
      out.replaceChildren();
      paintChoices();
    }

    function reveal() {
      const r = result;
      const winnerText = r.winner === 'tie' ? 'los tres métodos de grado 2 dan el mismo valor' : `el más cercano es ${A.LABELS[r.winner]}`;
      let verdict;
      if (!guess) verdict = `Resultado: ${winnerText}.`;
      else if (A.judge(r, guess)) verdict = `Predicción correcta: ${winnerText}.`;
      else verdict = `Predicción incorrecta: ${winnerText}.`;
      const isWinner = (id) => r.winners.includes(id);
      const refLabel = r.reference.kind === 'exact' ? `Solución exacta $y = ${r.reference.tex}$` : 'Referencia (RK4 con paso fino)';
      out.replaceChildren(
        kit.callout({ kind: guess && !A.judge(r, guess) ? 'note' : 'result', label: verdict },
          h('p', null, r.winner === 'tie'
            ? 'En un problema lineal los tres hacen la misma cuenta en cada paso; las diferencias son solo de redondeo.'
            : 'Los tres son de orden 2: lo que decide quién queda más cerca es la constante del error, que depende del problema.')),
        kit.table({
          label: `Valores en x = ${r.xf} y error absoluto de cada método`,
          head: ['Método', { c: `y(${r.xf})`, num: true }, { c: 'Error absoluto', num: true }],
          rows: [{ cells: [{ c: refLabel, row: true }, { c: kit.plain(r.reference.value, 6), num: true }, { c: '—', num: true }] }]
            .concat(r.rows.map((row) => ({
              hl: isWinner(row.id),
              cells: [
                { c: [kit.methodChip(row.id, row.label), row.id === 'euler' ? h('span', { class: 'muted' }, ' orden 1, como referencia') : null], row: true },
                { c: kit.plain(row.y, 6), num: true },
                { c: Number.isFinite(row.error) ? kit.sci(row.error, 3) : '—', num: true },
              ],
            }))),
        }));
      EDO.tex.hydrate(out);
    }

    revealBtn.addEventListener('click', reveal);
    buildH();
    refresh();
    return h('div', { class: 'aud-predict stack' },
      h('div', { class: 'aud-predict__controls' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: caseSelect.id }, 'Caso'), caseSelect),
        hHost),
      statement,
      h('p', { class: 'aud-predict__ask' }, '¿Qué método de grado 2 termina más cerca del valor exacto?'),
      choices,
      h('div', null, revealBtn),
      out);
  }

  /* ---- One step by hand ------------------------------------------------------------------------------------ */

  function stepView(kit, signal) {
    let current = A.EXERCISES[0].id;
    let solution = null;
    const statement = h('div', { class: 'aud-step__statement' });
    const inputId = uid('aud-step');
    const input = h('input', {
      class: 'input aud-step__input', id: inputId, type: 'text', inputmode: 'decimal', autocomplete: 'off',
      onkeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); check(); } },
    });
    const feedback = h('div', { class: 'aud-step__feedback', 'aria-live': 'polite' });
    const solutionHost = h('div', { class: 'aud-step__solution' });
    const showBtn = h('button', { class: 'btn', type: 'button' }, 'Mostrar la resolución');
    const label = h('label', { class: 'field__label', for: inputId });

    function paint() {
      const x = A.exercise(current);
      const v = x.indep;
      statement.replaceChildren(
        h('p', null, `Un paso de ${x.label}: $y' = ${x.fTex}$, $y(${x.x0}) = ${x.y0}$, $h = ${x.h}$. Calcule $y_1 = y(${x.x1})$ con 4 decimales.`),
        h('details', { class: 'disclosure' }, h('summary', null, 'Ver una ayuda'), h('p', { class: 'disclosure__body' }, x.hint)));
      label.replaceChildren(`$y_1 = y(${x.x1})$`);
      if (v !== 'x') label.append(` (variable ${v})`);
      input.value = '';
      input.removeAttribute('aria-invalid');
      feedback.replaceChildren();
      if (solution) solution.destroy();
      solution = null;
      solutionHost.replaceChildren();
      showBtn.hidden = false;
      EDO.tex.hydrate(statement);
      EDO.tex.hydrate(label);
    }

    function check() {
      const x = A.exercise(current);
      const r = A.checkAnswer(input.value, x.y1);
      const value = EDO.format.num(x.y1, { decimals: 6, mode: 'round' });
      const msgs = {
        empty: ['note', 'Ingrese un valor.'],
        invalid: ['note', 'Ingrese un número; puede usar coma o punto decimal.'],
        correct: ['result', `Correcto: el valor calculado es $y_1 = ${value}$.`],
        close: ['note', 'Cerca: revise las últimas cifras (se piden 4 decimales correctos).'],
        wrong: ['note', 'No coincide. Revise la fórmula del método o pida la resolución.'],
      };
      const [kind, text] = msgs[r.status];
      if (r.status === 'invalid' || r.status === 'empty') input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      feedback.replaceChildren(kit.callout({ kind }, h('p', null, text)));
      EDO.tex.hydrate(feedback);
    }

    function showSolution() {
      const x = A.exercise(current);
      if (solution) solution.destroy();
      const model = EDO.stepsModel.build(x.problem, x.method, { order: 2, ask: 'value' });
      solution = EDO.steps.render(solutionHost, model, { signal, headingLevel: 3 });
      showBtn.hidden = true;
    }

    showBtn.addEventListener('click', showSolution);
    const picker = segmented('Método', A.EXERCISES.map((e) => ({ value: e.id, label: A.LABELS[e.method] })), current, (id) => { current = id; paint(); });
    paint();
    return h('div', { class: 'aud-step stack' },
      picker.element,
      statement,
      h('div', { class: 'field aud-step__field' }, label,
        h('div', { class: 'aud-inline' }, input, h('button', { class: 'btn', type: 'button', 'data-variant': 'primary', onclick: check }, 'Comprobar'))),
      feedback,
      h('div', null, showBtn),
      solutionHost);
  }

  /* ---- Page ------------------------------------------------------------------------------------------------- */

  function render(page, ctx) {
    const kit = EDO.theory.kit.makeKit(h, EDO.format);
    const parts = [['cuestionario', 'Cuestionario'], ['prediccion', '¿Qué método llega más cerca?'], ['paso', 'Un paso a mano'], ['cierre', 'Para cerrar']];
    page.appendChild(h('div', { class: 'aud' },
      h('header', { class: 'aud__head' },
        h('h1', null, 'Audiencia'),
        h('p', { class: 'lead' }, 'Preguntas y actividades para comprobar lo visto: respuestas inmediatas, con la explicación y los valores calculados por el motor numérico.'),
        h('nav', { class: 'aud__toc', 'aria-label': 'Partes de la sección' },
          h('ul', { role: 'list' }, parts.map(([slug, title]) => h('li', null, h('a', { href: `#/audiencia/${slug}` }, title)))))),
      section('cuestionario', 'Cuestionario', quizView(kit)),
      section('prediccion', '¿Qué método llega más cerca?',
        h('p', { class: 'aud-section__lead' }, 'Elija un caso y un paso, apueste por un método y después revele los valores calculados.'),
        predictView(kit)),
      section('paso', 'Un paso a mano',
        h('p', { class: 'aud-section__lead' }, 'Resuelva el primer paso con lápiz y papel (o calculadora), ingrese el resultado y compruébelo.'),
        stepView(kit, ctx.signal)),
      section('cierre', 'Para cerrar',
        h('ul', { class: 'aud-closing', role: 'list' }, A.CLOSING.map((text) => h('li', null, text))))));
    EDO.tex.hydrate(page);
  }

  EDO.app.registerPage('audiencia', {
    title: 'Audiencia',
    nav: { label: 'Audiencia', order: 60 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
