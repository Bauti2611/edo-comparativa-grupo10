'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, near } = require('./helpers.js');

const E = load('expr');
const P = load('problems');
const M = load('methods');

const a1 = () => P.fromPreset('a1'); // y' = 2xy, y(1) = 1, h = 0.1, N = 3
const make = (spec) => P.make(Object.assign({ x0: 0, y0: 1, xf: 1, h: 0.1 }, spec));

describe('method catalogue', () => {
  it('lists the four methods of the course in order', () => {
    assert.deepEqual(M.METHODS.map((m) => m.id), ['euler', 'taylor', 'heun', 'rk2']);
    assert.deepEqual(M.METHODS.map((m) => m.label), ['Euler', 'Taylor', 'Euler Mejorado', 'RK2 (punto medio)']);
    assert.deepEqual(M.METHODS.map((m) => m.order), [1, 2, 2, 2]);
    assert.equal(M.byId('euler').baseline, true);
    assert.equal(M.byId('heun').alias, 'Heun');
    assert.deepEqual(M.byId('taylor').orderRange, [2, 4]);
    assert.equal(M.byId('rk4'), undefined);
  });

  it('declares the evaluations per step of the cost convention', () => {
    assert.deepEqual(M.METHODS.map((m) => m.evalsPerStep), [1, 3, 2, 2]);
    assert.deepEqual(M.costPerStep('euler'), { f: 1, deriv: 0, total: 1 });
    assert.deepEqual(M.costPerStep('heun'), { f: 2, deriv: 0, total: 2 });
    assert.deepEqual(M.costPerStep('rk2'), { f: 2, deriv: 0, total: 2 });
    assert.deepEqual([2, 3, 4].map((p) => M.costPerStep('taylor', p).total), [3, 6, 10]);
    assert.deepEqual(M.costPerStep('taylor'), { f: 1, deriv: 2, total: 3 });
    assert.throws(() => M.costPerStep('rk4'), E.EDOError);
  });
});

describe('solution structure', () => {
  it('has xs[N+1], ys[N+1], steps[N] with consistent records', () => {
    for (const id of ['euler', 'taylor', 'heun', 'rk2']) {
      const sol = M.solve(id, a1());
      assert.equal(sol.method, id);
      assert.equal(sol.N, 3);
      assert.equal(sol.xs.length, 4);
      assert.equal(sol.ys.length, 4);
      assert.equal(sol.steps.length, 3);
      assert.equal(sol.ys[0], 1);
      assert.equal(sol.diverged, false);
      assert.equal(sol.message, '');
      sol.steps.forEach((s, n) => {
        assert.equal(s.n, n);
        assert.equal(s.xn, sol.xs[n]);
        assert.equal(s.xn1, sol.xs[n + 1]);
        assert.equal(s.yn, sol.ys[n]);
        assert.equal(s.yn1, sol.ys[n + 1]);
        assert.equal(typeof s.detail, 'object');
      });
    }
  });

  it('computes x_n = x0 + n*h without accumulating rounding error', () => {
    const p = make({ fStr: '-y' });
    const sol = M.solve('euler', p);
    sol.xs.forEach((x, n) => assert.equal(x, 0 + n * 0.1, `x_${n}`));
    let accumulated = 0;
    for (let i = 0; i < 10; i += 1) accumulated += 0.1;
    assert.notEqual(accumulated, 1, 'sanity: naive accumulation drifts');
    assert.equal(sol.xs[10], 1);
  });

  it('records the intermediate values of each method', () => {
    const euler = M.solve('euler', a1());
    assert.deepEqual(euler.steps[0].detail, { slope: 2 });
    assert.equal(euler.steps[0].yn1, 1.2);

    const taylor = M.solve('taylor', a1());
    const d = taylor.steps[0].detail;
    assert.deepEqual(d.derivs, [2, 6]);
    near(d.terms[0], 0.2, 1e-15);
    near(d.terms[1], 0.03, 1e-15);

    const heun = M.solve('heun', P.fromPreset('a3'));
    assert.deepEqual(heun.steps[0].detail, { slope: 0, yPred: 1, slopeEnd: 0.5, slopeAvg: 0.25 });
    assert.deepEqual(heun.steps[1].detail, { slope: 0.375, yPred: 1.3125, slopeEnd: 0.6875, slopeAvg: 0.53125 });
    assert.equal(heun.ys[2], 1.390625);

    const rk2 = M.solve('rk2', P.fromPreset('a4'));
    const r = rk2.steps[0].detail;
    near(r.k1, 0.2, 1e-15);
    near(r.xMid, 1.05, 1e-15);
    near(r.yMid, 1.1, 1e-15);
    near(r.slopeMid, 2.31, 1e-12);
    near(rk2.ys[1], 1.231, 1e-14);
  });

  it('uses the course formulas: Heun averages the slopes, RK2 uses the midpoint slope', () => {
    // One step of y' = x + y from (0, 1) with h = 0.5.
    const p = make({ fStr: 'x + y', xf: 0.5, h: 0.5 });
    const s0 = 1;
    const heun = M.solve('heun', p).ys[1];
    const pred = 1 + 0.5 * s0;
    assert.equal(heun, 1 + (0.5 / 2) * (s0 + (0.5 + pred)));
    const rk2 = M.solve('rk2', p).ys[1];
    const k1 = 0.5 * s0;
    assert.equal(rk2, 1 + 0.5 * (0.25 + (1 + k1 / 2)));
  });

  it('uses t as the independent variable', () => {
    const sol = M.solve('euler', P.fromPreset('a2'));
    assert.deepEqual(sol.xs, [0, 0.5, 1]);
    assert.equal(sol.steps[0].detail.slope, 1, 'sen(0) + e^0');
  });
});

describe('Taylor of order 2, 3 and 4', () => {
  it('defaults to order 2 (the course) and reports the order used', () => {
    assert.equal(M.solve('taylor', a1()).order, 2);
    assert.equal(M.solve('taylor', a1(), { order: 3 }).order, 3);
    assert.equal(M.solve('euler', a1(), { order: 4 }).order, 1, 'order only applies to Taylor');
    assert.equal(M.solve('heun', a1()).order, 2);
  });

  it('adds the h^3/3! and h^4/4! terms with the exact higher derivatives of y\' = 2xy', () => {
    const t3 = M.solve('taylor', a1(), { order: 3 }).steps[0];
    assert.deepEqual(t3.detail.derivs, [2, 6, 20]);
    near(t3.yn1, 1 + 0.2 + 0.03 + (0.001 / 6) * 20, 1e-14);
    const t4 = M.solve('taylor', a1(), { order: 4 }).steps[0];
    assert.deepEqual(t4.detail.derivs, [2, 6, 20, 76]);
    near(t4.yn1, 1 + 0.2 + 0.03 + (0.001 / 6) * 20 + (0.0001 / 24) * 76, 1e-14);
    const exact = Math.exp(1.1 ** 2 - 1);
    assert.ok(Math.abs(t4.yn1 - exact) < Math.abs(t3.yn1 - exact));
    assert.ok(Math.abs(t3.yn1 - exact) < Math.abs(1.23 - exact));
  });

  it('computes y\' = f, y^(k+1) = D(y^(k)) for a free f', () => {
    const p = make({ fStr: 'x + y', xf: 0.5, h: 0.5 });
    // y'' = 1 + (x + y), at (0, 1): 1 + 1 = 2.
    const s = M.solve('taylor', p).steps[0];
    assert.deepEqual(s.detail.derivs, [1, 2]);
    near(s.yn1, 1 + 0.5 * 1 + (0.25 / 2) * 2, 1e-15);
  });

  it('rejects orders outside 2-4', () => {
    for (const order of [1, 5, 2.5, 'a', 0, -2]) {
      assert.throws(() => M.solve('taylor', a1(), { order }), (e) => e instanceof E.EDOError && /orden de Taylor/.test(e.message), String(order));
    }
  });
});

describe('cost convention (evaluations of f and of partial derivatives)', () => {
  const cases = [
    ['euler', undefined, 3, 0, 1], ['heun', undefined, 6, 0, 2], ['rk2', undefined, 6, 0, 2],
    ['taylor', 2, 3, 6, 3], ['taylor', 3, 3, 15, 6], ['taylor', 4, 3, 27, 10],
  ];
  for (const [id, order, fEvals, derivEvals, perStep] of cases) {
    it(`${id}${order ? `-${order}` : ''}: ${perStep} per step over 3 steps`, () => {
      const sol = M.solve(id, a1(), { order });
      assert.equal(sol.fEvals, fEvals);
      assert.equal(sol.derivEvals, derivEvals);
      assert.equal(sol.evalsPerStep, perStep);
      assert.equal(sol.fEvals + sol.derivEvals, perStep * sol.N);
    });
  }
});

describe('step options', () => {
  it('uses the problem\'s own h and N by default', () => {
    const sol = M.solve('euler', a1());
    assert.equal(sol.h, 0.1);
    assert.equal(sol.N, 3);
    assert.equal(sol.requestedN, 3);
  });

  it('derives N from h and h from N', () => {
    const byH = M.solve('euler', a1(), { h: 0.05 });
    assert.equal(byH.N, 6);
    assert.equal(byH.h, 0.05);
    const byN = M.solve('euler', a1(), { N: 6 });
    assert.equal(byN.N, 6);
    near(byN.h, 0.05, 1e-15);
    near(byN.xs[6], 1.3, 1e-14);
  });

  it('uses both as given when both are passed', () => {
    const sol = M.solve('euler', a1(), { h: 0.1, N: 2 });
    near(sol.xs[2], 1.2, 1e-15);
    assert.equal(sol.N, 2);
  });

  it('explains an h that does not divide the interval', () => {
    assert.throws(() => M.solve('euler', a1(), { h: 0.35 }), (e) => e instanceof E.EDOError && /múltiplo exacto/.test(e.message));
  });

  it('rejects invalid h and N with Spanish messages', () => {
    for (const h of [0, -0.1, NaN, Infinity, '0.1']) {
      assert.throws(() => M.solve('euler', a1(), { h }), (e) => e instanceof E.EDOError && /paso h|finitos/.test(e.message), String(h));
    }
    for (const N of [0, -1, 2.5, NaN, '3']) {
      assert.throws(() => M.solve('euler', a1(), { N }), (e) => e instanceof E.EDOError && /cantidad de pasos/.test(e.message), String(N));
    }
    assert.throws(() => M.solve('euler', a1(), { N: 1e7 }), (e) => e instanceof E.EDOError && /demasiado grande/.test(e.message));
  });

  it('rejects unknown methods, missing problems and non-finite initial data', () => {
    assert.throws(() => M.solve('rk4', a1()), (e) => e instanceof E.EDOError && /Método desconocido/.test(e.message));
    assert.throws(() => M.solve('euler'), E.EDOError);
    assert.throws(() => M.solve('euler', { f: () => 0, x0: 0, y0: NaN, h: 0.1, N: 3 }), E.EDOError);
  });
});

describe('divergence', () => {
  it('stops at the first non-finite value and returns the finite part', () => {
    const p = make({ fStr: 'y^2', xf: 2, h: undefined, N: 40 });
    const sol = M.solve('euler', p);
    assert.equal(sol.diverged, true);
    assert.match(sol.message, /dejó de ser finita en el paso \d+/);
    assert.equal(sol.requestedN, 40);
    assert.ok(sol.N < 40);
    assert.equal(sol.xs.length, sol.N + 1);
    assert.equal(sol.ys.length, sol.N + 1);
    assert.equal(sol.steps.length, sol.N);
    assert.ok(sol.ys.every(Number.isFinite));
    assert.equal(sol.fEvals, sol.N + 1, 'the failed attempt counts as work done');
  });

  it('does not flag solutions that merely grow', () => {
    const sol = M.solve('euler', P.fromPreset('ex_unstable'));
    assert.equal(sol.diverged, false);
    assert.ok(Math.abs(sol.ys[10]) > 1000);
  });
});

describe('purity', () => {
  it('gives identical results on repeated calls and leaves the problem untouched', () => {
    const p = a1();
    const before = JSON.stringify([p.x0, p.y0, p.xf, p.h, p.N, p.fStr]);
    for (const id of ['euler', 'taylor', 'heun', 'rk2']) {
      assert.deepEqual(M.solve(id, p), M.solve(id, p));
    }
    assert.equal(JSON.stringify([p.x0, p.y0, p.xf, p.h, p.N, p.fStr]), before);
  });
});
