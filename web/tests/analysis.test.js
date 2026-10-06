'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, near } = require('./helpers.js');

const E = load('expr');
const P = load('problems');
const M = load('methods');
const A = load('analysis');

/** Same ODE as a preset, without its closed form: forces the RK4 reference. */
const withoutExact = (id) => P.make(Object.assign({}, P.byId(id), { exact: null }));
const gridOf = (p) => Array.from({ length: p.N + 1 }, (_, n) => p.x0 + n * p.h);

describe('reference', () => {
  it('uses the exact solution when the problem has one', () => {
    const p = P.fromPreset('a1');
    assert.deepEqual(A.reference(p, [1, 1.1, 1.3]), [1, Math.exp(1.1 ** 2 - 1), Math.exp(1.3 ** 2 - 1)]);
  });

  it('falls back to a fine RK4 run (h/200) that agrees with the exact solution to 1e-12', () => {
    const exact = P.fromPreset('cmp_2xy_15');
    const p = withoutExact('cmp_2xy_15');
    assert.equal(p.exact, null);
    const xs = gridOf(p);
    const ref = A.reference(p, xs);
    ref.forEach((v, i) => near(v, exact.exact.fn(xs[i]), 1e-12, `reference at ${xs[i]}`));
    near(ref[0], 1, 0, 'starts at y0');
  });

  it('does not depend on the order of the abscissas and supports repeats and points before x0', () => {
    const p = withoutExact('a1');
    const ref = A.reference(p, [1.3, 1, 1.1, 1.1, 0.9]);
    const exact = P.fromPreset('a1').exact.fn;
    [1.3, 1, 1.1, 1.1, 0.9].forEach((x, i) => near(ref[i], exact(x), 1e-11, `x = ${x}`));
  });

  it('is self-consistent for a problem without closed form (Ej. 3c)', () => {
    const p = P.fromPreset('p5_3c');
    const fine = A.reference(p, [0.5])[0];
    const finer = A.reference(p, [0.5], { substeps: 800 })[0];
    near(fine, finer, 1e-13);
    near(fine, 0.126587, 5e-7, 'value printed in the practice bank');
  });
});

describe('errors', () => {
  it('returns absolute, relative and percentage errors per point', () => {
    const p = P.fromPreset('a1');
    const sol = M.solve('euler', p);
    const ref = A.reference(p, sol.xs);
    const e = A.errors(sol, ref);
    assert.equal(e.abs.length, sol.ys.length);
    assert.equal(e.abs[0], 0);
    sol.ys.forEach((y, i) => {
      assert.equal(e.abs[i], Math.abs(y - ref[i]));
      near(e.rel[i], e.abs[i] / Math.abs(ref[i]), 1e-15);
      near(e.pct[i], 100 * e.rel[i], 1e-13);
    });
    near(e.abs[3], 1.993716 - 1.8153, 5e-4);
  });

  it('uses null where the reference value is zero', () => {
    const e = A.errors({ ys: [1, 2, 3] }, [0, 4, 3]);
    assert.deepEqual(e.abs, [1, 2, 0]);
    assert.deepEqual(e.rel, [null, 0.5, 0]);
    assert.deepEqual(e.pct, [null, 50, 0]);
  });
});

describe('convergence: observed orders (N0 = 10, 6 levels: N = 10 ... 320)', () => {
  const METHODS = ['euler', 'taylor', 'heun', 'rk2'];
  const EXPECTED = { euler: 1, taylor: 2, heun: 2, rk2: 2 };
  for (const [id, label] of [['cmp_2xy_15', "y' = 2xy on [1, 1.5]"], ['cmp_3x2y', "y' = -3x^2 y on [0, 0.5]"]]) {
    it(`${label}: orders within 0.15 of 1 (Euler) and 2 (Taylor-2, Euler Mejorado, RK2)`, () => {
      const conv = A.convergence(P.fromPreset(id), METHODS, { levels: 6, N0: 10 });
      assert.deepEqual(conv.Ns, [10, 20, 40, 80, 160, 320]);
      for (const m of METHODS) {
        assert.equal(conv.orders[m].length, 5);
        conv.orders[m].forEach((p, k) => {
          assert.ok(p !== null && Math.abs(p - EXPECTED[m]) <= 0.15, `${id} ${m} level ${k}: observed order ${p}`);
        });
      }
    });
  }

  it("Taylor-3 is about 3 and Taylor-4 about 4 on y' = 2xy (N0 = 10, 5 levels)", () => {
    const conv = A.convergence(P.fromPreset('cmp_2xy_15'), ['taylor3', 'taylor4'], { levels: 5, N0: 10 });
    conv.orders.taylor3.forEach((p) => near(p, 3, 0.15, 'Taylor-3 order'));
    conv.orders.taylor4.forEach((p) => near(p, 4, 0.15, 'Taylor-4 order'));
    assert.ok(Math.min(...conv.errors.taylor4) > 1e-10, 'errors stay well above round-off');
  });

  it('measures the order against the RK4 reference when there is no closed form', () => {
    const exact = A.convergence(P.fromPreset('cmp_2xy_15'), METHODS, { levels: 6, N0: 10 });
    const rk4 = A.convergence(withoutExact('cmp_2xy_15'), METHODS, { levels: 6, N0: 10 });
    for (const m of METHODS) {
      exact.errors[m].forEach((e, k) => near(rk4.errors[m][k], e, 1e-6 * e, `${m} level ${k}`));
    }
    const noClosedForm = A.convergence(P.fromPreset('p5_3c'), ['euler'], { levels: 6, N0: 10 });
    assert.ok(noClosedForm.orders.euler.every((p) => Math.abs(p - 1) <= 0.15));
  });

  it('can use the maximum error over the grid instead of the final error', () => {
    const final = A.convergence(P.fromPreset('cmp_2xy_15'), ['heun'], { levels: 4, N0: 10 });
    const max = A.convergence(P.fromPreset('cmp_2xy_15'), ['heun'], { levels: 4, N0: 10, norm: 'max' });
    max.errors.heun.forEach((e, k) => assert.ok(e >= final.errors.heun[k] - 1e-15));
    max.orders.heun.forEach((p) => near(p, 2, 0.15, 'order from max norm'));
  });

  it('reports the work of each level under the cost convention', () => {
    const conv = A.convergence(P.fromPreset('cmp_2xy_15'), ['euler', 'heun', 'rk2', 'taylor', 'taylor3', 'taylor4'], { levels: 4, N0: 5 });
    const scaled = (per) => conv.Ns.map((n) => n * per);
    assert.deepEqual(conv.evals.euler, scaled(1));
    assert.deepEqual(conv.evals.heun, scaled(2));
    assert.deepEqual(conv.evals.rk2, scaled(2));
    assert.deepEqual(conv.evals.taylor, scaled(3));
    assert.deepEqual(conv.evals.taylor3, scaled(6));
    assert.deepEqual(conv.evals.taylor4, scaled(10));
  });

  it('halves h at each level and defaults N0 to max(N, 4)', () => {
    const conv = A.convergence(P.fromPreset('a1'), ['euler'], { levels: 3 });
    assert.deepEqual(conv.Ns, [4, 8, 16]);
    near(conv.hs[0], 0.3 / 4, 1e-15);
    near(conv.hs[1], conv.hs[0] / 2, 1e-15);
    const finer = A.convergence(P.fromPreset('p5_2a'), ['euler'], { levels: 2 });
    assert.deepEqual(finer.Ns, [10, 20]);
  });

  it('returns null orders when an error is zero or not finite instead of inventing a number', () => {
    const flat = P.make({ fStr: '0*x', x0: 0, y0: 1, xf: 1, h: 0.1, exact: { fn: () => 1, tex: '1', str: '1' } });
    const zero = A.convergence(flat, ['euler', 'taylor'], { levels: 3, N0: 4 });
    assert.deepEqual(zero.errors.euler, [0, 0, 0]);
    assert.deepEqual(zero.orders.euler, [null, null]);
    assert.deepEqual(zero.orders.taylor, [null, null]);

    const blowUp = P.make({ fStr: 'y^2', x0: 0, y0: 1, xf: 2, N: 8 });
    const bad = A.convergence(blowUp, ['euler', 'heun'], { levels: 4, N0: 8 });
    for (const m of ['euler', 'heun']) {
      assert.deepEqual(bad.errors[m], [null, null, null, null]);
      assert.deepEqual(bad.orders[m], [null, null, null]);
    }
  });

  it('validates its arguments', () => {
    const p = P.fromPreset('a1');
    assert.throws(() => A.convergence(p, ['euler'], { levels: 1 }), E.EDOError);
    assert.throws(() => A.convergence(p, ['euler'], { levels: 2.5 }), E.EDOError);
    assert.throws(() => A.convergence(p, ['euler'], { N0: 0 }), E.EDOError);
    assert.throws(() => A.convergence(p, ['euler'], { N0: 100000, levels: 6 }), E.EDOError);
    assert.throws(() => A.convergence(p, ['rk4']), (e) => e instanceof E.EDOError && /Método desconocido/.test(e.message));
    assert.throws(() => A.convergence(p, ['taylor5']), E.EDOError);
  });
});

describe('workPrecision', () => {
  it('pairs work with error per level, increasing in work, positive errors only', () => {
    const conv = A.convergence(P.fromPreset('cmp_2xy_15'), ['euler', 'taylor', 'rk2'], { levels: 5, N0: 5 });
    const wp = A.workPrecision(conv);
    assert.deepEqual(Object.keys(wp), ['euler', 'taylor', 'rk2']);
    for (const id of Object.keys(wp)) {
      assert.equal(wp[id].length, 5);
      wp[id].forEach((pt, k) => {
        assert.equal(pt.evals, conv.evals[id][k]);
        assert.equal(pt.error, conv.errors[id][k]);
        assert.equal(pt.h, conv.hs[k]);
        if (k > 0) assert.ok(pt.evals > wp[id][k - 1].evals && pt.error < wp[id][k - 1].error);
      });
    }
  });

  it('drops zero and missing errors', () => {
    const wp = A.workPrecision({ hs: [0.1, 0.05], errors: { a: [0, 1e-3], b: [null, 1e-3] }, evals: { a: [10, 20], b: [10, 20] } });
    assert.deepEqual(wp.a, [{ evals: 20, error: 1e-3, h: 0.05 }]);
    assert.deepEqual(wp.b, [{ evals: 20, error: 1e-3, h: 0.05 }]);
  });
});

describe('localErrorConstants (section 5.7)', () => {
  const p = P.fromPreset('cmp_2xy_13');

  it('gives F2 = 8, D = 6 and the constants 10/3, 7/3, 4/3 for f = 2xy at (1, 1)', () => {
    const k = A.localErrorConstants(p, 1, 1);
    near(k.F2, 8, 1e-9);
    near(k.D, 6, 1e-9);
    near(k.fyD, 12, 1e-9);
    near(k.taylor, 10 / 3, 1e-9);
    near(k.rk2, 7 / 3, 1e-9);
    near(k.heun, 4 / 3, 1e-9);
  });

  it('matches the measured one-step error / h^3 as h -> 0 (h = 1e-3, within 1%)', () => {
    const h = 1e-3;
    const one = P.make({ fStr: '2*x*y', x0: 1, y0: 1, xf: 1 + h, h, exact: p.exact });
    const k = A.localErrorConstants(one, 1, 1);
    const exactStep = one.exact.fn(1 + h);
    for (const [id, constant] of [['taylor', k.taylor], ['rk2', k.rk2], ['heun', k.heun]]) {
      const measured = (exactStep - M.solve(id, one).ys[1]) / h ** 3;
      assert.ok(Math.abs(measured / constant - 1) < 0.01, `${id}: measured ${measured} vs constant ${constant}`);
    }
  });

  it('also predicts the one-step errors of other right-hand sides (RK4 reference)', () => {
    const h = 1e-3;
    for (const [fStr, x, y] of [['x + y^2', 0.2, 0.5], ['sin(x)*y', 0.7, 1.3]]) {
      const one = P.make({ fStr, x0: x, y0: y, xf: x + h, h });
      const k = A.localErrorConstants(one, x, y);
      const exactStep = A.reference(one, [one.xf])[0];
      for (const [id, constant] of [['taylor', k.taylor], ['rk2', k.rk2], ['heun', k.heun]]) {
        const measured = (exactStep - M.solve(id, one).ys[1]) / h ** 3;
        assert.ok(Math.abs(constant) > 0.1);
        assert.ok(Math.abs(measured / constant - 1) < 0.01, `${fStr} ${id}: measured ${measured} vs constant ${constant}`);
      }
    }
  });

  it('shows why the ranking changes between problems: the constants differ in size and sign pattern', () => {
    const a = A.localErrorConstants(p, 1, 1);
    assert.ok(a.heun < a.rk2 && a.rk2 < a.taylor, 'on 2xy Euler Mejorado has the smallest constant');
    const b = A.localErrorConstants(P.fromPreset('cmp_3x2y'), 0.25, 2);
    assert.ok(Math.abs(b.rk2) < Math.abs(b.heun), 'on -3x^2 y the midpoint constant is smaller');
  });

  it('gives equal constants for every linear problem y\' = lambda*y (the three methods coincide)', () => {
    const k = A.localErrorConstants(P.fromPreset('ex_linear'), 0.3, 1.7);
    near(k.F2, 0, 1e-12);
    near(k.taylor, k.rk2, 1e-12);
    near(k.taylor, k.heun, 1e-12);
    near(k.taylor, (-2 * 4 * 1.7) / 6, 1e-12, '(f_y * D) / 6 with f_y = -2, D = 4y');
  });

  it('can be evaluated at many points without interference (cached partials)', () => {
    const first = A.localErrorConstants(p, 1, 1);
    A.localErrorConstants(p, 2, 3);
    assert.deepEqual(A.localErrorConstants(p, 1, 1), first);
  });
});
