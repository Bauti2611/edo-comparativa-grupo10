'use strict';
/**
 * Oracles of the feature document, sections 5.4-5.6: values recomputed from the
 * cátedra's own examples and practice sheets. Tolerance 5e-6 unless noted (the
 * documents print 6 decimals). The handout's printed Ej. 2 y2 (1.4297) and
 * Ej. 3 y2 (1.4843) are errata and are never used as expected values.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, near } = require('./helpers.js');

const P = load('problems');
const M = load('methods');
const A = load('analysis');
const F = load('format');

const TOL = 5e-6;
const trunc4 = (v) => F.num(v, { decimals: 4, mode: 'trunc' });
const course = (id, opts) => {
  const p = P.fromPreset(id);
  return M.solve(p.method, p, Object.assign({ order: p.order }, opts));
};
const last = (sol) => sol.ys[sol.N];

describe('[A] Ej. 1: Taylor grado 2 on y\' = 2xy, y(1) = 1, h = 0.1', () => {
  const sol = course('a1');

  it('gives 1.23, 1.542666, 1.9727613', () => {
    [1, 1.23, 1.542666, 1.9727613].forEach((v, n) => near(sol.ys[n], v, TOL, `y_${n}`));
  });

  it('truncated to 4 decimals prints 1.23, 1.5426, 1.9727 as in the handout', () => {
    assert.deepEqual(sol.ys.slice(1).map(trunc4), ['1.23', '1.5426', '1.9727']);
    assert.deepEqual(sol.ys.slice(1).map((v) => F.num(v, { decimals: 4, mode: 'round' })), ['1.23', '1.5427', '1.9728']);
  });

  it('runs at full precision: carrying the truncated y2 would print 1.9726 instead of 1.9727', () => {
    const carried = P.make({ fStr: '2*x*y', x0: 1.2, y0: 1.5426, xf: 1.3, h: 0.1 });
    assert.equal(trunc4(M.solve('taylor', carried).ys[1]), '1.9726');
  });

  it('uses y\' = 2 and y\'\' = 6 in the first step', () => {
    assert.deepEqual(sol.steps[0].detail.derivs, [2, 6]);
  });
});

describe('[A] Ej. 4: RK grado 2 on y\' = 2xy, y(1) = 1, h = 0.1', () => {
  const sol = course('a4');

  it('gives 1.231, 1.5452743, 1.9779511 with k1 = 0.2, 0.27082, 0.3708658', () => {
    [1, 1.231, 1.5452743, 1.9779511].forEach((v, n) => near(sol.ys[n], v, TOL, `y_${n}`));
    [0.2, 0.27082, 0.3708658].forEach((v, n) => near(sol.steps[n].detail.k1, v, TOL, `k1 of step ${n}`));
  });

  it('truncated to 4 decimals prints 1.231, 1.5452, 1.9779 and k1 = 0.3708', () => {
    assert.deepEqual(sol.ys.slice(1).map(trunc4), ['1.231', '1.5452', '1.9779']);
    assert.equal(trunc4(sol.steps[2].detail.k1), '0.3708');
    assert.equal(trunc4(sol.steps[1].detail.k1), '0.2708');
  });

  it('differs from Euler Mejorado at the first step (1.231 vs 1.232)', () => {
    near(M.solve('heun', P.fromPreset('a4')).ys[1], 1.232, 1e-14);
  });
});

describe('[A] Ej. 2: Euler on y\' = sen(t) + e^{-t}, y(0) = 0, h = 0.5', () => {
  const sol = course('a2');

  it('gives 0.5 and 1.0429781', () => {
    near(sol.ys[1], 0.5, TOL);
    near(sol.ys[2], 1.0429781, TOL);
  });

  it('does not use the handout\'s printed y2 = 1.4297 (an erratum)', () => {
    assert.ok(Math.abs(sol.ys[2] - 1.4297) > 0.3);
  });

  it('is close to the exact solution 2 - cos t - e^{-t}: y(1) = 1.091818', () => {
    near(P.fromPreset('a2').exact.fn(1), 1.091818, 5e-7);
  });
});

describe('[A] Ej. 3: Euler Mejorado on y\' = -y + x + 1, y(0) = 1, h = 0.5', () => {
  const sol = course('a3');

  it('gives y1 = 1.125 and y2 = 1.390625', () => {
    near(sol.ys[1], 1.125, TOL);
    near(sol.ys[2], 1.390625, TOL);
  });

  it('shows y0\' = 0, y1\' = 0.375, predictor 1.3125 and f(x2, predictor) = 0.6875', () => {
    assert.equal(sol.steps[0].detail.slope, 0);
    assert.equal(sol.steps[1].detail.slope, 0.375);
    near(sol.steps[1].detail.yPred, 1.3125, TOL);
    near(sol.steps[1].detail.slopeEnd, 0.6875, TOL);
  });

  it('does not use the handout\'s printed y2 = 1.4843 (an erratum)', () => {
    assert.ok(Math.abs(sol.ys[2] - 1.4843) > 0.09);
  });

  it('is close to the exact solution x + e^{-x}: y(1) = 1.367879', () => {
    near(P.fromPreset('a3').exact.fn(1), 1.367879, 5e-7);
  });
});

describe('practice bank (section 5.5): y_final with the course method, and the exact/reference value', () => {
  // [id, y_final, exact or RK4 reference]
  const ROWS = [
    ['p5_1a', 2.657994, 2.647491], ['p5_1b', 1.287109, 1.287427], ['p5_1c', 1.972761, 1.993716], ['p5_1d', -1.458885, -1.2],
    ['p5_2a', 1.348678, 1.367879], ['p5_2b', 1.042978, 1.091818], ['p5_2c', 1.709324, 1.656579],
    ['p5_2d_1', 1.219446, 1.333333], ['p5_2d_2', 1.050555, 1.066667],
    ['p5_2e_1', 1.820740, 2.053216], ['p5_2e_2', 2.817867, 2.938881],
    ['p5_3a', 3.450929, 3.490343], ['p5_3b', 3.825415, 3.908223], ['p5_3c', 0.126556, 0.126587], ['p5_3e', 1.692289, 1.701870],
    ['p6_1a', 2.649143, 2.647491], ['p6_1b', 1.287218, 1.287427], ['p6_1c', 3.434843, 3.490343],
  ];
  for (const [id, yFinal, reference] of ROWS) {
    it(`${id}: ${P.byId(id).method} gives ${yFinal}, reference ${reference}`, () => {
      const problem = P.fromPreset(id);
      const sol = course(id);
      assert.equal(sol.N, problem.N);
      near(last(sol), yFinal, TOL, `${id} y_final`);
      near(A.reference(problem, [problem.xf])[0], reference, 6e-7, `${id} reference`);
    });
  }

  it('covers every practice preset exactly once', () => {
    const practice = P.PRESETS.filter((p) => p.group === 'practica05' || p.group === 'practica06').map((p) => p.id);
    assert.deepEqual(ROWS.map((r) => r[0]), practice);
  });

  it('the two runs of 2d and 2e stop at different points (not comparable at the same x)', () => {
    assert.equal(P.byId('p5_2d_1').xf, 1.5);
    assert.equal(P.byId('p5_2d_2').xf, 1.25);
    assert.equal(P.byId('p5_2e_1').xf, 1.5);
    assert.equal(P.byId('p5_2e_2').xf, 1.25);
  });
});

describe('same PVI with the four methods (section 5.6, h = 0.1)', () => {
  // [id, Euler, Taylor-2, RK2, Euler Mejorado, exact]
  const CASES = [
    ['cmp_2xy_13', 1.815360, 1.972761, 1.977951, 1.983150, 1.993716],
    ['cmp_2xy_15', 2.927813, 3.418817, 3.434843, 3.450929, 3.490343],
    ['cmp_3x2y', 2.737305, 2.657994, 2.649143, 2.640502, 2.647491],
    ['cmp_quarter', 1.278470, 1.287109, 1.287218, 1.287328, 1.287427],
  ];
  for (const [id, euler, taylor, rk2, heun, exact] of CASES) {
    it(`${id}: Euler / Taylor-2 / RK2 / Euler Mejorado / exact`, () => {
      const p = P.fromPreset(id);
      const y = (method) => last(M.solve(method, p));
      near(y('euler'), euler, TOL, 'Euler');
      near(y('taylor'), taylor, TOL, 'Taylor-2');
      near(y('rk2'), rk2, TOL, 'RK2');
      near(y('heun'), heun, TOL, 'Euler Mejorado');
      near(p.exact.fn(p.xf), exact, 6e-7, 'exact');
    });
  }

  it('has no universal winner among the three second-order methods', () => {
    const best = (id) => {
      const p = P.fromPreset(id);
      const err = (m) => Math.abs(last(M.solve(m, p)) - p.exact.fn(p.xf));
      return ['taylor', 'rk2', 'heun'].reduce((a, b) => (err(b) < err(a) ? b : a));
    };
    assert.equal(best('cmp_2xy_13'), 'heun');
    assert.equal(best('cmp_2xy_15'), 'heun');
    assert.equal(best('cmp_quarter'), 'heun');
    assert.equal(best('cmp_3x2y'), 'rk2');
  });

  it('single-step errors from (1, 1) with h = 0.1 are 3.678e-3, 2.678e-3, 1.678e-3 (Taylor-2, RK2, Heun)', () => {
    const one = P.make({ fStr: '2*x*y', x0: 1, y0: 1, xf: 1.1, h: 0.1 });
    const exact = Math.exp(1.1 ** 2 - 1);
    near(exact, 1.233678, 5e-7);
    near(exact - M.solve('taylor', one).ys[1], 3.678e-3, 5e-7);
    near(exact - M.solve('rk2', one).ys[1], 2.678e-3, 5e-7);
    near(exact - M.solve('heun', one).ys[1], 1.678e-3, 5e-7);
  });
});

describe('linear problems y\' = lambda*y: the second-order methods coincide', () => {
  const stable = (lambda, h, N) => P.make({ fStr: `${lambda}*y`, x0: 0, y0: 1, xf: h * N, N });

  for (const [lambda, h, N] of [[-2, 0.1, 10], [-2, 0.25, 4], [-0.5, 0.1, 10], [1, 0.1, 10], [-7, 0.1, 10], [0.3, 0.5, 8]]) {
    it(`lambda = ${lambda}, h = ${h}: Taylor-2 = Euler Mejorado = RK2 = (1 + z + z^2/2)^n and Euler = (1 + z)^n`, () => {
      const p = stable(lambda, h, N);
      const z = p.h * lambda;
      const taylor = M.solve('taylor', p).ys;
      const heun = M.solve('heun', p).ys;
      const rk2 = M.solve('rk2', p).ys;
      const euler = M.solve('euler', p).ys;
      for (let n = 0; n <= N; n += 1) {
        const R = (1 + z + (z * z) / 2) ** n;
        const scale = Math.abs(R) || 1;
        near(taylor[n], heun[n], 1e-12 * scale, `Taylor vs Heun at n = ${n}`);
        near(taylor[n], rk2[n], 1e-12 * scale, `Taylor vs RK2 at n = ${n}`);
        near(taylor[n], R, 1e-12 * scale, `Taylor vs (1+z+z^2/2)^n at n = ${n}`);
        near(euler[n], (1 + z) ** n, 1e-12 * (Math.abs((1 + z) ** n) || 1), `Euler at n = ${n}`);
      }
    });
  }

  it('the preset y\' = -2y shows the coincidence too', () => {
    const p = P.fromPreset('ex_linear');
    const [t, h, r] = ['taylor', 'heun', 'rk2'].map((m) => M.solve(m, p).ys);
    t.forEach((v, n) => {
      near(v, h[n], 1e-12);
      near(v, r[n], 1e-12);
    });
  });
});

describe('stability on y\' = lambda*y', () => {
  const R2 = (z) => 1 + z + (z * z) / 2;
  const R1 = (z) => 1 + z;

  it('|R(-3)| = 2.5 > 1 for the second-order methods (and 2 for Euler): the demo grows instead of decaying', () => {
    assert.equal(R2(-3), 2.5);
    assert.equal(R1(-3), -2);
    const p = P.fromPreset('ex_unstable');
    for (const m of ['taylor', 'heun', 'rk2']) {
      const ys = M.solve(m, p).ys;
      for (let n = 1; n < ys.length; n += 1) near(ys[n] / ys[n - 1], 2.5, 1e-12, `${m} growth factor`);
      assert.ok(ys[10] > 9000 && ys[10] < 10000, `${m}: 2.5^10 = 9536.7`);
    }
    const euler = M.solve('euler', p).ys;
    for (let n = 1; n < euler.length; n += 1) near(euler[n] / euler[n - 1], -2, 1e-12, 'Euler growth factor');
    assert.ok(p.exact.fn(p.xf) < 1e-12, 'the exact solution decays');
  });

  it('the real stability interval is [-2, 0] for all four methods', () => {
    for (let z = -2; z <= 0; z += 0.01) {
      assert.ok(Math.abs(R2(z)) <= 1 + 1e-12 && Math.abs(R1(z)) <= 1 + 1e-12, `z = ${z}`);
    }
    for (const z of [-2.01, -2.5, -3, -5]) {
      assert.ok(Math.abs(R2(z)) > 1 && Math.abs(R1(z)) > 1, `z = ${z}`);
    }
  });

  it('the methods decay for h*lambda = -1.9 and grow for h*lambda = -2.1', () => {
    for (const [h, grows] of [[1.9, false], [2.1, true]]) {
      const p = P.make({ fStr: '-y', x0: 0, y0: 1, xf: h * 20, N: 20 });
      for (const m of ['euler', 'taylor', 'heun', 'rk2']) {
        const yEnd = Math.abs(M.solve(m, p).ys[20]);
        assert.equal(yEnd > 1, grows, `${m} with z = ${-h}: |y_20| = ${yEnd}`);
      }
    }
  });
});
