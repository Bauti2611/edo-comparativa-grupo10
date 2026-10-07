/**
 * EDO.audience.model - the two activities of the Audiencia page with no DOM, and the closing questions.
 *
 *   PREDICT_CASES, predictHs(caseId) -> [h]      cases of the "who ends closest" round; steps that divide the interval
 *   predict(caseId, h) -> {caseId, title, h, N, x0, y0, xf, fTex, indep, reference {value, kind}, rows[], winner, winners[]}
 *       rows: Euler (baseline) and the three second-order methods at x_f, {id, label, y, error}; the winner is the
 *       second-order method with the smallest error, or 'tie' when several share it (y' = λy: they coincide)
 *   judge(result, guess) -> boolean              guess: 'taylor' | 'heun' | 'rk2' | 'tie'
 *   EXERCISES[], exercise(id) -> {id, method, label, problem, x0, y0, h, x1, y1, step, fTex, hint}
 *       one step by hand: problem with x_f = x_0 + h (N = 1), so the step-by-step view shows exactly that step
 *   checkAnswer(text, expected) -> {status: correct|close|wrong|invalid|empty, value?}   comma or dot; 4 decimals
 *   CLOSING[]                                    questions for the audience at the end
 *
 * Every number comes from `methods.solve` and `analysis.reference` (the exact solution when the preset has one).
 * Load order: after the numerics and audience/quiz.js. Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      expr: require('../../../numerics/expr.js'),
      format: require('../../../numerics/format.js'),
      problems: require('../../../numerics/problems.js'),
      methods: require('../../../numerics/methods.js'),
      analysis: require('../../../numerics/analysis.js'),
      audience: { quiz: require('./quiz.js') },
    });
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.audience = EDO.audience || {};
    EDO.audience.model = factory(EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const {
    expr, format, problems, methods, analysis,
  } = EDO;
  const { gradeNumber } = EDO.audience.quiz;

  const IDS = Object.freeze(['euler', 'taylor', 'heun', 'rk2']);
  const SECOND = Object.freeze(['taylor', 'heun', 'rk2']);
  const LABELS = Object.freeze({
    euler: 'Euler', taylor: 'Taylor de grado 2', heun: 'Euler Mejorado', rk2: 'RK2 (punto medio)', tie: 'Los tres dan lo mismo',
  });
  const PREDICT_CASES = Object.freeze(['cmp_2xy_13', 'cmp_3x2y', 'cmp_quarter', 'ex_linear']);
  const H_CANDIDATES = Object.freeze([0.5, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05]);
  const MAX_N = 50;
  /** Errors that differ by less than this (relative to the value) are a tie: rounding noise, not a method effect. */
  const TIE_REL = 1e-12;

  const clean = (v) => Number(Number(v).toPrecision(12));

  /* ---- Who ends closest ------------------------------------------------------------------------------------- */

  function presetFor(caseId) {
    return problems.byId(PREDICT_CASES.includes(caseId) ? caseId : PREDICT_CASES[0]);
  }

  function predictHs(caseId) {
    const p = presetFor(caseId);
    return H_CANDIDATES.filter((h) => {
      const s = problems.stepsFor(p.x0, p.xf, h);
      return s.ok && s.N <= MAX_N;
    });
  }

  function predict(caseId, h) {
    const preset = presetFor(caseId);
    const hs = predictHs(preset.id);
    const own = clean(preset.h !== undefined ? preset.h : (preset.xf - preset.x0) / preset.N);
    const step = hs.includes(clean(h)) ? clean(h) : own;
    const problem = problems.fromPreset(preset.id, { h: step });
    const reference = analysis.reference(problem, [problem.xf])[0];
    const rows = IDS.map((id) => {
      const sol = methods.solve(id, problem, { h: step });
      const y = sol.ys[sol.ys.length - 1];
      return {
        id, label: LABELS[id], y, error: sol.diverged ? Infinity : Math.abs(y - reference),
      };
    });
    const second = rows.filter((r) => SECOND.includes(r.id) && Number.isFinite(r.error));
    const best = Math.min(...second.map((r) => r.error));
    const scale = Math.max(1, Math.abs(reference));
    const winners = second.filter((r) => r.error - best <= TIE_REL * scale).map((r) => r.id);
    return {
      caseId: preset.id,
      title: preset.title,
      h: step,
      N: problem.N,
      x0: problem.x0,
      y0: problem.y0,
      xf: problem.xf,
      indep: problem.indep,
      fTex: expr.toTeX(problem.fNode, { indep: problem.indep }),
      reference: { value: reference, kind: problem.exact ? 'exact' : 'reference', tex: problem.exact ? problem.exact.tex : null },
      rows,
      winners,
      winner: winners.length === 1 ? winners[0] : 'tie',
    };
  }

  const judge = (result, guess) => Boolean(result) && guess === result.winner;

  /* ---- One step by hand -------------------------------------------------------------------------------------- */

  const EXERCISES = Object.freeze([
    Object.freeze({
      id: 'rk2', method: 'rk2', preset: 'cmp_3x2y', h: 0.1, hint: 'Recuerde que $k_1 = h\\,f(x_0, y_0)$ ya incluye a $h$.',
    }),
    Object.freeze({
      id: 'heun', method: 'heun', preset: 'a3', h: 0.1, hint: 'Primero el predictor $y_0 + h\\,y_0\'$; después, el promedio de las dos pendientes.',
    }),
    Object.freeze({
      id: 'taylor', method: 'taylor', preset: 'p5_1b', h: 0.1, hint: 'Derivando, $y\'\' = \\tfrac{y\\,(1 + y^2)}{8}$.',
    }),
  ]);

  function exercise(id) {
    const e = EXERCISES.find((x) => x.id === id) || EXERCISES[0];
    const base = problems.byId(e.preset);
    const problem = problems.fromPreset(e.preset, {
      id: `aud_${e.id}`, xf: clean(base.x0 + e.h), h: e.h, notes: [],
    });
    const sol = methods.solve(e.method, problem, { h: e.h, order: 2 });
    return {
      id: e.id,
      method: e.method,
      label: LABELS[e.method],
      problem,
      x0: problem.x0,
      y0: problem.y0,
      h: e.h,
      x1: sol.xs[1],
      y1: sol.ys[1],
      step: sol.steps[0],
      indep: problem.indep,
      fTex: expr.toTeX(problem.fNode, { indep: problem.indep }),
      hint: e.hint,
    };
  }

  function checkAnswer(text, expected) {
    const s = text === undefined || text === null ? '' : String(text).trim();
    if (!s) return { status: 'empty' };
    const v = format.parseNumber(s);
    if (!Number.isFinite(v)) return { status: 'invalid' };
    return { status: gradeNumber(v, expected), value: v };
  }

  /* ---- Closing ------------------------------------------------------------------------------------------------- */

  const CLOSING = Object.freeze([
    'Si en un parcial $f$ fuera difícil de derivar, ¿qué método elegiría para resolver a mano, y por qué?',
    '¿Por qué RK2 queda más cerca en $y\' = -3x^2 y$ y Euler Mejorado en $y\' = 2xy$, si los tres métodos son de orden 2?',
    '¿Qué tienen en común Euler Mejorado y RK2 con Taylor de grado 2, si ninguno de los dos calcula $y\'\'$?',
    '¿Cuántos pasos de Euler harían falta para alcanzar el error de RK2 con $h = 0.1$ en $y\' = 2xy$, y cuántas evaluaciones de $f$ costaría?',
    '¿Qué pasa con cualquiera de los cuatro métodos en $y\' = \\lambda y$ cuando $h\\lambda < -2$?',
  ]);

  return {
    IDS, SECOND, LABELS, PREDICT_CASES, predictHs, predict, judge, EXERCISES, exercise, checkAnswer, CLOSING,
  };
}));
