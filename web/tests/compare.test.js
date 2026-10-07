'use strict';
/**
 * Comparativa page: the pure module (compare/model.js) - the same-problem table, the live convergence study, the
 * work-precision points, the linear-case demo and the computed conclusions - checked against section 5.6 of the
 * ODD document and the theory of section 5.7.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const route = require('../js/ui/route.js');
const M = require('../js/ui/pages/compare/model.js');

const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} != ${want} (tol ${tol})`);
const viaHash = (query) => route.parse(route.build('comparativa', null, query)).query;

describe('compare model: cases and step choices', () => {
  it('starts on y\' = 2xy, y(1) = 1, y(1.3) with h = 0.1', () => {
    const s = M.defaultState();
    assert.equal(s.caseId, 'cmp_2xy_13');
    assert.equal(s.h, 0.1);
    assert.equal(M.DEFAULT_CASE, 'cmp_2xy_13');
  });

  it('offers only steps that divide the interval, around the case\'s own h', () => {
    const hs = M.hOptions('cmp_2xy_13').map((o) => o.h);
    assert.ok(hs.includes(0.1) && hs.includes(0.05) && hs.includes(0.025));
    assert.ok(!hs.includes(0.2), '0.3 / 0.2 is not an integer');
    M.hOptions('cmp_2xy_13').forEach((o) => assert.ok(Number.isInteger(o.N) && o.N >= 1));
    assert.ok(M.hOptions('ex_linear').map((o) => o.h).includes(0.2));
  });

  it('groups every preset for the case selector', () => {
    const ids = M.caseGroups().flatMap((g) => g.cases.map((c) => c.id));
    assert.ok(ids.includes('cmp_2xy_13') && ids.includes('cmp_3x2y') && ids.includes('a1') && ids.includes('ex_linear'));
    assert.equal(M.caseGroups()[0].id, 'comparativa');
  });

  it('round-trips its state through the hash query and rejects unknown values', () => {
    const s = M.fromQuery(viaHash(M.toQuery({ caseId: 'cmp_3x2y', h: 0.05 })));
    assert.deepEqual(s, { caseId: 'cmp_3x2y', h: 0.05 });
    assert.deepEqual(M.fromQuery({ caso: 'nope', h: 'x' }), M.defaultState());
    assert.deepEqual(M.fromQuery({ caso: 'cmp_2xy_13', h: '0.2' }), M.defaultState(), 'invalid h falls back to the case h');
    assert.deepEqual(M.toQuery(M.defaultState()), {});
  });
});

describe('compare model: same problem, four methods (doc 5.6)', () => {
  const r = M.sameProblem('cmp_2xy_13', 0.1);
  const row = (id) => r.rows.find((x) => x.id === id);

  it('reproduces the verified values at x_f = 1.3 with h = 0.1', () => {
    assert.equal(r.N, 3);
    near(row('euler').y, 1.815360, 5e-7);
    near(row('taylor').y, 1.972761, 5e-7);
    near(row('heun').y, 1.983150, 5e-7);
    near(row('rk2').y, 1.977951, 5e-7);
    near(r.reference.value, 1.993716, 5e-7);
    assert.equal(r.reference.kind, 'exact');
  });

  it('lists Euler first as the labelled baseline and the methods in a fixed order', () => {
    assert.deepEqual(r.rows.map((x) => x.id), ['euler', 'taylor', 'heun', 'rk2']);
    assert.equal(row('euler').baseline, true);
    assert.equal(r.rows.filter((x) => x.baseline).length, 1);
  });

  it('marks Euler Mejorado as the closest and computes abs/rel errors', () => {
    assert.equal(r.bestId, 'heun');
    assert.equal(r.rows.filter((x) => x.best).map((x) => x.id).join(), 'heun');
    near(row('heun').abs, Math.abs(1.98315000576 - Math.exp(0.69)), 1e-12);
    near(row('euler').rel, row('euler').abs / Math.exp(0.69), 1e-15);
    assert.equal(r.worstId, 'euler');
  });

  it('counts evaluations per step and in total', () => {
    assert.deepEqual(r.rows.map((x) => x.perStep), [1, 3, 2, 2]);
    assert.deepEqual(r.rows.map((x) => x.total), [3, 9, 6, 6]);
  });

  it('follows the step: halving h reduces every error', () => {
    const half = M.sameProblem('cmp_2xy_13', 0.05);
    assert.equal(half.N, 6);
    half.rows.forEach((x, i) => assert.ok(x.abs < r.rows[i].abs));
  });

  it('agrees with the other comparison cases of doc 5.6', () => {
    const at = (id, m) => M.sameProblem(id, 0.1).rows.find((x) => x.id === m).y;
    near(at('cmp_2xy_15', 'heun'), 3.450929, 5e-7);
    near(at('cmp_3x2y', 'rk2'), 2.649143, 5e-7);
    near(at('cmp_quarter', 'taylor'), 1.287109, 5e-7);
    assert.equal(M.sameProblem('cmp_3x2y', 0.1).bestId, 'rk2', 'no universal winner');
  });

  it('uses an RK4 reference when the case has no closed form', () => {
    const ref = M.sameProblem('p5_3c', 0.1);
    assert.equal(ref.reference.kind, 'reference');
    near(ref.reference.value, 0.126587, 5e-7);
  });

  it('builds the chart series: a dense exact curve, the numerical points and the errors along x', () => {
    const series = M.solutionSeries(r);
    assert.ok(series.reference.points.length > 20);
    near(series.reference.points[series.reference.points.length - 1].y, Math.exp(0.69), 1e-12);
    assert.equal(series.methods.length, 4);
    assert.equal(series.methods[0].points.length, 4);
    const errs = M.errorSeries(r);
    assert.equal(errs.length, 4);
    errs.forEach((s) => s.points.forEach((p) => assert.ok(p.y > 0, 'log scale: no zero errors')));
    near(errs[0].points[errs[0].points.length - 1].y, row('euler').abs, 1e-15);
  });
});

describe('compare model: convergence study computed live', () => {
  const study = M.convergenceStudy('cmp_2xy_13');

  it('halves h from the case\'s own step', () => {
    assert.equal(study.hs[0], 0.1);
    study.hs.slice(1).forEach((hh, k) => near(hh, study.hs[k] / 2, 1e-15));
    assert.equal(study.hs.length, M.LEVELS);
  });

  it('estimates p close to 1 for Euler and to 2 for the three others', () => {
    near(study.estimate.euler, 1, 0.1);
    ['taylor', 'heun', 'rk2'].forEach((id) => near(study.estimate[id], 2, 0.15));
    study.orders.euler.slice(1).forEach((p) => assert.ok(p >= 0.9 && p <= 1.1, `euler p = ${p}`));
    ['taylor', 'heun', 'rk2'].forEach((id) => study.orders[id].slice(1)
      .forEach((p) => assert.ok(p >= 1.85 && p <= 2.15, `${id} p = ${p}`)));
  });

  it('draws the reference slopes 1 and 2 as straight lines in log-log', () => {
    const lines = M.slopeLines(study);
    assert.deepEqual(lines.map((l) => l.p), [1, 2]);
    lines.forEach((l) => {
      const [a, b] = [l.points[0], l.points[l.points.length - 1]];
      near(Math.log(a.y / b.y) / Math.log(a.x / b.x), l.p, 1e-12);
    });
  });

  it('gives the work-precision points (total evaluations, error)', () => {
    const wp = M.workPrecision(study);
    assert.equal(wp.length, 4);
    const euler = wp.find((s) => s.id === 'euler');
    assert.deepEqual(euler.points.map((p) => p.x), study.Ns.map((N) => N));
    const taylor = wp.find((s) => s.id === 'taylor');
    assert.deepEqual(taylor.points.map((p) => p.x), study.Ns.map((N) => 3 * N));
  });
});

describe('compare model: linear case y\' = λy (ampliación)', () => {
  it('Taylor-2, Euler Mejorado and RK2 give identical values, R(z) = 1 + z + z²/2', () => {
    const d = M.linearDemo({ lambda: -2, h: 0.1 });
    const z = -0.2;
    near(d.z, z, 1e-15);
    near(d.R.second, 1 + z + (z * z) / 2, 1e-15);
    near(d.R.euler, 1 + z, 1e-15);
    d.ys.taylor.forEach((y, n) => {
      near(y, d.ys.heun[n], 1e-14);
      near(y, d.ys.rk2[n], 1e-14);
      near(y, (1 + z + (z * z) / 2) ** n, 1e-14);
    });
    assert.ok(d.maxSpread <= 1e-14);
    assert.equal(d.unstable.second, false);
    assert.equal(d.unstable.euler, false);
  });

  it('flags the instability when hλ < −2 (|R(hλ)| > 1)', () => {
    const d = M.linearDemo({ lambda: -10, h: 0.3 });
    near(d.z, -3, 1e-15);
    assert.equal(d.unstable.second, true);
    assert.equal(d.unstable.euler, true);
    near(d.R.second, 2.5, 1e-15);
    assert.ok(Math.abs(d.ys.heun[d.ys.heun.length - 1]) > 1, 'the numbers grow while the exact solution decays');
    assert.equal(M.linearDemo({ lambda: -10, h: 0.2 }).unstable.second, false, 'hλ = −2 is the edge, still bounded');
  });
});

describe('compare model: summary and conclusions', () => {
  it('summarises order, cost, derivatives and hand work per method', () => {
    const rows = M.summaryMatrix();
    assert.deepEqual(rows.map((r) => r.id), ['euler', 'taylor', 'heun', 'rk2']);
    assert.deepEqual(rows.map((r) => r.order), [1, 2, 2, 2]);
    assert.deepEqual(rows.map((r) => r.perStep), [1, 3, 2, 2]);
    assert.deepEqual(rows.map((r) => r.derivatives), [false, true, false, false]);
    rows.forEach((r) => assert.ok(r.byHand.length > 10));
  });

  it('writes conclusions from the computed numbers only', () => {
    const r = M.sameProblem('cmp_2xy_13', 0.1);
    const lines = M.conclusions(r, M.convergenceStudy('cmp_2xy_13'));
    const text = lines.join(' ');
    assert.ok(lines.length >= 3);
    assert.match(text, /Euler Mejorado/);
    assert.match(text, /1\.98315/);
    assert.doesNotMatch(text, /1\.4297|1\.4843/);
  });

  it('explains the ranking with the one-step error constants (ampliación)', () => {
    const c = M.localConstants('cmp_2xy_13');
    near(c.values.taylor, 10 / 3, 1e-12);
    near(c.values.rk2, 7 / 3, 1e-12);
    near(c.values.heun, 4 / 3, 1e-12);
    assert.deepEqual(c.ranking, ['heun', 'rk2', 'taylor']);
    assert.equal(c.matchesObserved, true);
  });
});
