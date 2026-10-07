'use strict';
/**
 * Audiencia page: the quiz bank (audience/quiz.js) and the two activities (audience/model.js). Every answer key that
 * has a number behind it is checked against the numerics engine and against the course facts of section 5 of the
 * ODD document.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Q = require('../js/ui/pages/audience/quiz.js');
const A = require('../js/ui/pages/audience/model.js');
const problems = require('../js/numerics/problems.js');
const methods = require('../js/numerics/methods.js');

const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} != ${want} (tol ${tol})`);
const byId = (id) => Q.QUESTIONS.find((q) => q.id === id);
const correctOption = (q) => q.options.find((o) => o.id === q.answer);
const endError = (id, problem, h) => {
  const s = methods.solve(id, problem, { h });
  return Math.abs(s.ys[s.ys.length - 1] - problem.exact.fn(problem.xf));
};

describe('quiz: shape of the bank', () => {
  it('has ten questions with unique ids, a prompt and an explanation each', () => {
    assert.equal(Q.QUESTIONS.length, 10);
    assert.equal(new Set(Q.QUESTIONS.map((q) => q.id)).size, 10);
    Q.QUESTIONS.forEach((q) => {
      assert.ok(q.prompt.length > 10, q.id);
      assert.ok(q.explanation.length > 20, q.id);
      assert.ok(q.kind === 'choice' || q.kind === 'number', q.id);
    });
  });

  it('gives every choice question exactly one key among its options', () => {
    Q.QUESTIONS.filter((q) => q.kind === 'choice').forEach((q) => {
      assert.ok(q.options.length >= 3, q.id);
      assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length, q.id);
      assert.equal(q.options.filter((o) => o.id === q.answer).length, 1, q.id);
    });
  });

  it('covers the topics of the outline', () => {
    const topics = new Set(Q.QUESTIONS.map((q) => q.topic));
    ['pvi', 'orden', 'formula', 'nomenclatura', 'costo', 'lineal', 'calculo'].forEach((t) => assert.ok(topics.has(t), t));
  });

  it('labels the questions that go beyond the apunte', () => {
    ['orden-heun', 'orden-mitad', 'lineal'].forEach((id) => assert.equal(byId(id).extension, true, id));
    ['pvi', 'nombre-em', 'formula-rk2'].forEach((id) => assert.ok(!byId(id).extension, id));
  });

  it('never shows the printed errata of the handout', () => {
    const text = JSON.stringify(Q.QUESTIONS) + JSON.stringify(A.EXERCISES) + JSON.stringify(A.CLOSING);
    assert.ok(!text.includes('1.4297') && !text.includes('1.4843'));
  });
});

describe('quiz: answer keys against the engine and section 5', () => {
  const p2xy = problems.fromPreset('cmp_2xy_13');

  it('the PVI needs the four things of the apunte', () => {
    const q = byId('pvi');
    assert.match(correctOption(q).text, /condición inicial/);
    assert.match(correctOption(q).text, /paso/);
    assert.match(correctOption(q).text, /dominio/);
  });

  it('Euler Mejorado is second order: the end error drops about 4 times when h is halved', () => {
    assert.equal(correctOption(byId('orden-heun')).id, 'h2');
    const e1 = endError('heun', p2xy, 0.05);
    const e2 = endError('heun', p2xy, 0.025);
    near(Math.log2(e1 / e2), 2, 0.15);
    assert.equal(methods.byId('heun').order, 2);
  });

  it('halving h divides the error of RK2 by about 4', () => {
    assert.equal(byId('orden-mitad').answer, '4');
    const ratio = endError('rk2', p2xy, 0.05) / endError('rk2', p2xy, 0.025);
    near(ratio, 4, 0.4);
  });

  it('the midpoint formula with k1 = h f is RK2, and evaluated on y\' = 2xy it gives the printed 1.231', () => {
    assert.equal(byId('formula-rk2').answer, 'rk2');
    const f = (x, y) => 2 * x * y;
    const h = 0.1;
    const k1 = h * f(1, 1);
    const byHand = 1 + h * f(1 + h / 2, 1 + k1 / 2);
    near(byHand, methods.solve('rk2', p2xy).ys[1], 1e-15);
    near(byHand, 1.231, 1e-12);
  });

  it('the trapezoid formula with the Euler predictor is Euler Mejorado (1.232 on the same step)', () => {
    assert.equal(byId('formula-em').answer, 'heun');
    const f = (x, y) => 2 * x * y;
    const h = 0.1;
    const byHand = 1 + (h / 2) * (f(1, 1) + f(1 + h, 1 + h * f(1, 1)));
    near(byHand, methods.solve('heun', p2xy).ys[1], 1e-15);
  });

  it('y\'\' of y\' = 2xy is 2y + 4x²y, as the engine computes it for Taylor', () => {
    const q = byId('taylor-y2');
    assert.equal(q.answer, 'a');
    assert.match(correctOption(q).text, /2y \+ 4x\^2 ?y/);
    const sol = methods.solve('taylor', p2xy);
    sol.steps.forEach((s) => near(s.detail.derivs[1], 2 * s.yn + 4 * s.xn * s.xn * s.yn, 1e-12));
  });

  it('the course calls Heun "Euler Mejorado"', () => {
    assert.equal(byId('nombre-em').answer, 'heun');
    assert.equal(methods.byId('heun').label, 'Euler Mejorado');
    assert.equal(methods.byId('heun').alias, 'Heun');
  });

  it('Taylor de grado 2 needs three evaluations per step (f, f_x, f_y); Euler Mejorado and RK2 need two', () => {
    const q = byId('costo-taylor');
    assert.equal(Number(q.answer), methods.costPerStep('taylor', 2).total);
    assert.equal(methods.costPerStep('heun').total, 2);
    assert.equal(methods.costPerStep('rk2').total, 2);
  });

  it('on y\' = λy the three second-order methods coincide with (1 + z + z²/2)^n', () => {
    assert.equal(byId('lineal').answer, 'same');
    const p = problems.fromPreset('ex_linear');
    const z = p.h * -2;
    const ys = ['taylor', 'heun', 'rk2'].map((id) => methods.solve(id, p).ys);
    ys[0].forEach((y, n) => {
      near(ys[1][n], y, 1e-12);
      near(ys[2][n], y, 1e-12);
      near(y, (1 + z + z * z / 2) ** n, 1e-12);
    });
  });

  it('the one-step calculation is checked against methods.solve (Euler Mejorado, y1 = 1.232)', () => {
    const q = byId('calculo');
    assert.equal(q.kind, 'number');
    const key = Q.numericKey(q);
    near(key.value, methods.solve('heun', p2xy, { h: 0.1 }).ys[1], 0);
    near(key.value, 1.232, 1e-12);
    assert.match(q.explanation, /1\.232/);
  });
});

describe('quiz: grading', () => {
  it('grades a choice by its option id', () => {
    const q = byId('nombre-em');
    assert.equal(Q.grade(q, 'heun').status, 'correct');
    assert.equal(Q.grade(q, 'rk2').status, 'wrong');
    assert.equal(Q.grade(q, '').status, 'empty');
    assert.equal(Q.grade(q, 'zzz').status, 'invalid');
  });

  it('grades the number with comma or dot, at 4 decimals', () => {
    const q = byId('calculo');
    ['1.232', '1,232', '1.2320', ' 1.232 ', '1.23199'].forEach((t) => assert.equal(Q.grade(q, t).status, 'correct', t));
    assert.equal(Q.grade(q, '1.2321').status, 'close');
    assert.equal(Q.grade(q, '1.231').status, 'close');
    assert.equal(Q.grade(q, '1.3').status, 'wrong');
    assert.equal(Q.grade(q, 'uno').status, 'invalid');
    assert.equal(Q.grade(q, '').status, 'empty');
  });

  it('keeps the score over the answered questions', () => {
    const results = { pvi: 'correct', lineal: 'wrong', calculo: 'correct' };
    assert.deepEqual(Q.score(results), { answered: 3, correct: 2, total: 10 });
    assert.deepEqual(Q.score({}), { answered: 0, correct: 0, total: 10 });
  });
});

describe('audience model: who ends closest', () => {
  it('reproduces the values of section 5.6 and names Euler Mejorado on y\' = 2xy', () => {
    const r = A.predict('cmp_2xy_13', 0.1);
    const y = (id) => r.rows.find((row) => row.id === id).y;
    near(y('taylor'), 1.972761, 5e-7);
    near(y('rk2'), 1.977951, 5e-7);
    near(y('heun'), 1.983150, 5e-7);
    near(y('euler'), 1.815360, 5e-7);
    near(r.reference.value, 1.993716, 5e-7);
    assert.equal(r.reference.kind, 'exact');
    assert.equal(r.winner, 'heun');
    assert.equal(r.N, 3);
  });

  it('names RK2 on y\' = −3x²y and Euler Mejorado on y\' = (1 + y²)/4 (no universal winner)', () => {
    assert.equal(A.predict('cmp_3x2y', 0.1).winner, 'rk2');
    assert.equal(A.predict('cmp_quarter', 0.1).winner, 'heun');
  });

  it('declares a tie on the linear problem', () => {
    const r = A.predict('ex_linear', 0.1);
    assert.equal(r.winner, 'tie');
    assert.deepEqual(r.winners.slice().sort(), ['heun', 'rk2', 'taylor']);
  });

  it('judges a guess against the computed winner', () => {
    const r = A.predict('cmp_3x2y', 0.1);
    assert.equal(A.judge(r, 'rk2'), true);
    assert.equal(A.judge(r, 'heun'), false);
    assert.equal(A.judge(A.predict('ex_linear', 0.1), 'tie'), true);
    assert.equal(A.judge(A.predict('ex_linear', 0.1), 'rk2'), false);
  });

  it('offers only steps that divide the interval, including the case\'s own h', () => {
    A.PREDICT_CASES.forEach((id) => {
      const hs = A.predictHs(id);
      assert.ok(hs.includes(0.1), id);
      const p = problems.byId(id);
      hs.forEach((h) => assert.ok(problems.stepsFor(p.x0, p.xf, h).ok, `${id} h=${h}`));
    });
    assert.ok(!A.predictHs('cmp_2xy_13').includes(0.2));
  });

  it('falls back to the default case for unknown input', () => {
    const r = A.predict('nope', 0.123);
    assert.equal(r.caseId, A.PREDICT_CASES[0]);
    assert.equal(r.h, 0.1);
  });
});

describe('audience model: one step by hand', () => {
  it('has one exercise per second-order method, each checked against methods.solve', () => {
    assert.deepEqual(A.EXERCISES.map((e) => e.method).sort(), ['heun', 'rk2', 'taylor']);
    const hand = { rk2: 2.99775, taylor: 1.05125, heun: 1.005 };
    A.EXERCISES.forEach((e) => {
      const x = A.exercise(e.id);
      assert.equal(x.problem.N, 1, e.id);
      near(x.y1, methods.solve(e.method, x.problem).ys[1], 0);
      near(x.y1, hand[e.method], 1e-12);
    });
  });

  it('accepts comma or dot and either the truncated or the rounded 4-decimal value', () => {
    const y1 = A.exercise('rk2').y1; // 2.99775
    ['2.9977', '2,9978', '2.99775', '2,99775'].forEach((t) => assert.equal(A.checkAnswer(t, y1).status, 'correct', t));
    assert.equal(A.checkAnswer('2.998', y1).status, 'close');
    assert.equal(A.checkAnswer('3', y1).status, 'close');
    assert.equal(A.checkAnswer('2.9', y1).status, 'wrong');
    assert.equal(A.checkAnswer('2..9', y1).status, 'invalid');
    assert.equal(A.checkAnswer('   ', y1).status, 'empty');
  });

  it('has a list of closing questions', () => {
    assert.ok(A.CLOSING.length >= 4);
    A.CLOSING.forEach((c) => assert.ok(typeof c === 'string' && c.endsWith('?'), c));
  });
});
