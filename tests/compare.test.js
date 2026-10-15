'use strict';
/**
 * Comparativa page: the pure module (compare/model.js) and its DOM builders (compare/views.js) - the same-problem
 * table, the order of the error, the live convergence study, the constants of the local error, the cost per step,
 * the work-precision points, the linear-case demo, the summary and the computed conclusions - checked against
 * section 5.6 of the ODD document and the theory of section 5.7.
 *
 * This page carries the assigned topic, so it owns the whole comparison: the material that used to be split
 * between Teoría ("Error y orden", "Costo computacional", "Resumen comparativo") and this page lives here, and
 * the decision guide «¿Cuál elegir?» exists in exactly one place, which the last suite of this file checks.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = require('../js/ui/route.js');
const M = require('../js/ui/pages/compare/model.js');
const V = require('../js/ui/pages/compare/views.js');
const kitModule = require('../js/ui/pages/theory/kit.js');
const format = require('../js/numerics/format.js');
const expr = require('../js/numerics/expr.js');

const WEB_ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(WEB_ROOT, ...parts), 'utf8');
const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} != ${want} (tol ${tol})`);
const viaHash = (query) => route.parse(route.build('comparativa', null, query)).query;

/** A DOM stand-in with the signature of EDO.dom.h: elements are plain objects, text children stay strings. */
function makeH() {
  const flatten = (list) => list.flatMap((child) => (Array.isArray(child) ? flatten(child) : [child]))
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true);
  return (tag, ...rest) => {
    const first = rest[0];
    const hasAttrs = first && typeof first === 'object' && !first.nodeType && !Array.isArray(first);
    return {
      nodeType: 1,
      tag,
      attrs: hasAttrs ? first : {},
      children: flatten(hasAttrs ? rest.slice(1) : (first === null || first === undefined ? rest.slice(1) : rest)),
    };
  };
}

function walk(node, visitor) {
  visitor(node);
  if (node && typeof node === 'object' && node.children) node.children.forEach((child) => walk(child, visitor));
}
const elementsOf = (node, predicate) => {
  const out = [];
  walk(node, (n) => { if (n && typeof n === 'object' && n.tag && predicate(n)) out.push(n); });
  return out;
};
const joinedText = (node) => {
  const out = [];
  walk(node, (n) => { if (typeof n === 'string' || typeof n === 'number') out.push(String(n)); });
  return out.join('');
};
const hasClass = (el, name) => String((el.attrs && el.attrs.class) || '').split(/\s+/).includes(name);
const rowsOf = (table) => elementsOf(table, (n) => n.tag === 'tr').slice(1);
const cellsOf = (tr) => elementsOf(tr, (n) => n.tag === 'td').map(joinedText);

/** The view environment the page hands to compare/views.js. */
function viewEnv() {
  const h = makeH();
  return { h, kit: kitModule.makeKit(h, format), fTeX: (p) => expr.toTeX(p.fNode, { indep: p.indep }) };
}

/** The F2 / f_y D coefficients the page builds from the order conditions of the RK2 family. */
function coefficients() {
  const { Q, familyMember } = kitModule;
  const fractions = (m) => ({ f2: Q.tex(m.f2), fyd: Q.tex(m.fyd) });
  return {
    taylor: { f2: Q.tex(Q.of(1, 6)), fyd: Q.tex(Q.of(1, 6)) },
    rk2: fractions(familyMember(Q.of(1, 1))),
    heun: fractions(familyMember(Q.of(1, 2))),
  };
}

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

  it('tables the error at x_f for every step, next to the chart that draws it', () => {
    const { h, kit } = viewEnv();
    const table = V.convergenceTable(h, kit, study);
    const rows = rowsOf(table);
    assert.equal(rows.length, M.LEVELS);
    // h and N of each level, then one error per method
    assert.deepEqual(rows.map((tr) => joinedText(elementsOf(tr, (n) => n.tag === 'th')[0])),
      study.hs.map((hh) => String(hh)));
    assert.deepEqual(rows.map((tr) => cellsOf(tr)[0]), study.Ns.map((n) => String(n)));
    rows.forEach((tr, k) => cellsOf(tr).slice(1).forEach((cell, i) => {
      const id = M.IDS[i];
      assert.equal(cell, kit.sci(study.errors[id][k], 3), `${id} at level ${k}`);
    }));
    // the errors fall with h, which is the whole point of the section
    M.IDS.forEach((id) => study.errors[id].forEach((e, k) => {
      if (k > 0) assert.ok(e < study.errors[id][k - 1], `${id} must fall at level ${k}`);
    }));
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

describe('compare model: the order of the error (moved from Teoría)', () => {
  it('gives the local order p+1, the global order p and the factor 2^p of halving h', () => {
    const rows = M.orderTable();
    assert.deepEqual(rows.map((r) => r.id), ['euler', 'taylor', 'heun', 'rk2']);
    assert.deepEqual(rows.map((r) => r.order), [1, 2, 2, 2]);
    assert.deepEqual(rows.map((r) => r.localOrder), [2, 3, 3, 3]);
    // halving h divides Euler's error by about 2 and the others' by about 4: this is where that claim is measured
    assert.deepEqual(rows.map((r) => r.halving), [2, 4, 4, 4]);
    rows.forEach((r) => assert.equal(r.halving, 2 ** r.order));
  });

  it('matches what the convergence study observes: p ≈ 1 for Euler and p ≈ 2 for the three others', () => {
    const study = M.convergenceStudy('cmp_2xy_13');
    M.orderTable().forEach((r) => near(study.estimate[r.id], r.order, 0.15));
  });

  it('builds the order table with the four methods and the computed halving factors', () => {
    const { h, kit } = viewEnv();
    const table = V.orderTable(h, kit, M.orderTable());
    assert.deepEqual(rowsOf(table).map((tr) => cellsOf(tr)[1]), ['$O(h)$', '$O(h^{2})$', '$O(h^{2})$', '$O(h^{2})$']);
    assert.deepEqual(rowsOf(table).map((tr) => cellsOf(tr)[2]), ['2', '4', '4', '4']);
  });
});

describe('compare model: cost per step (moved from Teoría)', () => {
  it('counts 1, 2, 2 evaluations and 3, 6, 10 for Taylor of degree 2, 3 and 4', () => {
    const rows = M.costTable();
    assert.deepEqual(rows.map((r) => r.key), ['euler', 'heun', 'rk2', 'taylor2', 'taylor3', 'taylor4']);
    assert.deepEqual(rows.map((r) => r.total), [1, 2, 2, 3, 6, 10]);
    assert.deepEqual(rows.map((r) => r.f), [1, 2, 2, 1, 1, 1]);
    assert.deepEqual(rows.map((r) => r.deriv), [0, 0, 0, 2, 5, 9]);
    assert.deepEqual(rows.map((r) => r.derivatives), [false, false, false, true, true, true]);
    // Taylor of degree p needs p(p+1)/2 evaluations in total
    M.TAYLOR_DEGREES.forEach((p) => {
      assert.equal(rows.find((r) => r.degree === p).total, (p * (p + 1)) / 2);
    });
  });

  it('builds the cost table with those totals and says which method needs derivatives', () => {
    const { h, kit } = viewEnv();
    const table = V.costTable(h, kit, M.costTable());
    assert.deepEqual(rowsOf(table).map((tr) => cellsOf(tr)[2]), ['1', '2', '2', '3', '6', '10']);
    assert.deepEqual(rowsOf(table).map((tr) => cellsOf(tr)[3]), ['No', 'No', 'No', 'Sí: $f_x$ y $f_y$', 'Sí: $f_x$ y $f_y$', 'Sí: $f_x$ y $f_y$']);
  });

  it('says what those extra evaluations buy: the error of one step falls at least ten times per degree', () => {
    const t = M.taylorDegrees();
    assert.deepEqual(t.rows.map((r) => r.order), [2, 3, 4]);
    near(t.exact, Math.exp(0.21), 1e-15);
    near(t.rows[0].error, 3.678e-3, 5e-7);
    near(t.rows[1].error, 3.447e-4, 5e-8);
    near(t.rows[2].error, 2.806e-5, 5e-9);
    assert.equal(t.rows[0].drop, null, 'the first degree has nothing to fall from');
    t.rows.slice(1).forEach((r) => assert.ok(r.drop > 10, `grade ${r.order}: ${r.drop}`));
    assert.equal(t.y3TeX, '12xy + 8x^{3}y');
    assert.equal(t.y4TeX, '12y + 48x^{2}y + 16x^{4}y');
  });

  it('builds the Taylor degrees table with the exact value below the three degrees', () => {
    const { h, kit } = viewEnv();
    const rows = rowsOf(V.taylorDegreesTable(h, kit, M.taylorDegrees()));
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((tr) => joinedText(elementsOf(tr, (n) => n.tag === 'th')[0])),
      ['Grado 2', 'Grado 3', 'Grado 4', 'Solución exacta']);
    assert.deepEqual(rows.map((tr) => cellsOf(tr)[0]), ['1.230000', '1.233333', '1.233650', '1.233678']);
  });
});

describe('compare views: the RK2 family (moved from Teoría)', () => {
  it('lists Euler Mejorado, punto medio and Ralston with the parameters of section 5.8', () => {
    const { h, kit } = viewEnv();
    const { Q, familyMember } = kitModule;
    const members = [
      { id: 'heun', label: 'Euler Mejorado (Heun)', a2: Q.of(1, 2), apunte: 'Euler Mejorado' },
      { id: 'rk2', label: 'Punto medio', a2: Q.of(1, 1), apunte: 'RK2 (Runge-Kutta de grado 2)' },
      { id: null, label: 'Ralston', a2: Q.of(2, 3), apunte: null },
    ].map((m) => {
      const member = familyMember(m.a2);
      return Object.assign({}, m, { a1: Q.tex(member.a1), a2: Q.tex(member.a2), p: Q.tex(member.p) });
    });
    const cells = rowsOf(V.familyTable(h, kit, members)).map((tr) => cellsOf(tr));
    assert.deepEqual(cells, [
      ['$\\frac{1}{2}$', '$\\frac{1}{2}$', '$1$', 'Euler Mejorado'],
      ['$0$', '$1$', '$\\frac{1}{2}$', 'RK2 (Runge-Kutta de grado 2)'],
      ['$\\frac{1}{3}$', '$\\frac{2}{3}$', '$\\frac{3}{4}$', 'No figura en el apunte'],
    ]);
  });
});

describe('compare model: the constant of the local error (moved from Teoría)', () => {
  const c = M.localConstants('cmp_2xy_13');

  it('evaluates F2 = 8, D = 6 and fy*D = 12 at (1, 1) with the case\'s own h', () => {
    assert.deepEqual([c.F2, c.D, c.fyD], [8, 6, 12]);
    assert.deepEqual([c.x0, c.y0, c.h], [1, 1, 0.1]);
  });

  it('puts the predicted C*h^3 next to the error a real step commits (3.678e-3, 2.678e-3, 1.678e-3)', () => {
    near(c.predicted.taylor, (10 / 3) * 0.1 ** 3, 1e-15);
    near(c.measured.taylor, 3.678e-3, 5e-7);
    near(c.measured.rk2, 2.678e-3, 5e-7);
    near(c.measured.heun, 1.678e-3, 5e-7);
    M.SECOND.forEach((id) => near(c.predicted[id], c.values[id] * c.h ** 3, 1e-15));
  });

  it('shows Euler missing the same step by 3.368e-2, about 20 times the Euler Mejorado error', () => {
    near(c.euler, 3.368e-2, 5e-6);
    near(c.euler / c.measured.heun, 20, 0.2);
  });

  it('shows the ratio measured / C*h^3 falling towards 1 as h halves', () => {
    assert.equal(c.ratios.length, 4);
    assert.deepEqual(c.ratios.map((r) => r.h), [0.1, 0.05, 0.025, 0.0125]);
    c.ratios.forEach((row, k) => M.SECOND.forEach((id) => {
      assert.ok(row[id] > 1 && row[id] < 1.6, `${id} at level ${k}: ${row[id]}`);
      if (k > 0) assert.ok(row[id] < c.ratios[k - 1][id], `${id} must fall at level ${k}`);
    }));
    M.SECOND.forEach((id) => near(c.ratios[3][id], 1, 0.05));
  });

  it('lists the same constants for every comparison case: the winner is a property of the problem', () => {
    const list = M.constantsOverview();
    assert.deepEqual(list.map((r) => r.id), ['cmp_2xy_13', 'cmp_2xy_15', 'cmp_3x2y', 'cmp_quarter']);
    assert.deepEqual(list.map((r) => r.smallest), ['heun', 'heun', 'rk2', 'heun']);
    assert.ok(new Set(list.map((r) => r.smallest)).size >= 2, 'the method with the smallest |C| changes');
    const hard = list.find((r) => r.id === 'cmp_3x2y');
    near(hard.F2, -18, 1e-12);
    near(hard.fyD, 0, 1e-12);
    near(hard.values.taylor, -3, 1e-12);
    near(hard.values.rk2, -0.75, 1e-12);
    near(hard.values.heun, 1.5, 1e-12);
    list.forEach((r) => assert.equal(r.smallest, r.best, `${r.id}: the smallest |C| is the closest method`));
  });

  it('writes the one-step error with the exact fractions of the RK2 family, 1/6, 1/24 and -1/12', () => {
    const { h, kit } = viewEnv();
    const text = joinedText(V.stepFormulaTable(h, kit, coefficients()));
    assert.ok(text.includes('\\frac{1}{6}\\,F_2'), text);
    assert.ok(text.includes('\\frac{1}{24}\\,F_2'), text);
    assert.ok(text.includes('-\\frac{1}{12}\\,F_2'), text);
    M.SECOND.forEach(() => assert.ok(text.includes('\\frac{1}{6}\\,f_y D')));
  });

  it('builds the constants and ratio tables with the computed values', () => {
    const { h, kit } = viewEnv();
    const text = joinedText(V.constantsTable(h, kit, c, coefficients()));
    assert.ok(text.includes('3.678e-3') && text.includes('2.678e-3') && text.includes('1.678e-3'), text);
    assert.ok(text.includes('\\frac{1}{6}\\cdot 8 + \\frac{1}{6}\\cdot 12 = 3.3333'), text);
    const ratios = rowsOf(V.ratiosTable(h, kit, c));
    assert.equal(ratios.length, 4);
    ratios.forEach((tr) => cellsOf(tr).forEach((cell) => assert.match(cell, /^1\.\d{3}$/)));
  });

  it('builds the per-case constants overview with F2, fy D and the method of smallest |C|', () => {
    const { h, kit, fTeX } = viewEnv();
    const table = V.constantsOverviewTable(h, kit, M.constantsOverview(), fTeX);
    assert.equal(elementsOf(table, (n) => n.tag === 'th' && n.attrs.scope === 'col').length, 8);
    const rows = rowsOf(table);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((tr) => elementsOf(tr, (n) => hasClass(n, 'method-chip')).map(joinedText).pop()),
      ['Euler Mejorado', 'Euler Mejorado', 'RK2', 'Euler Mejorado']);
    assert.ok(joinedText(table).includes('-18'));
  });
});

describe('compare model: the stability scan (moved from Teoría)', () => {
  it('measures R(z) by running the methods and says where the values grow', () => {
    const rows = M.stabilityScan();
    assert.ok(rows.length >= 5);
    rows.forEach((row) => {
      near(row.euler, 1 + row.z, 1e-12, `Euler z=${row.z}`);
      M.SECOND.forEach((id) => near(row[id], 1 + row.z + row.z ** 2 / 2, 1e-12, `${id} z=${row.z}`));
    });
    const at = (z) => M.stabilityScan([z])[0].verdict;
    assert.equal(at(-1), 'decae');
    assert.equal(at(-2), 'limite');
    assert.equal(at(-2.5), 'crece');
    assert.equal(at(-3), 'crece');
  });

  it('builds the table with the verdict of each row', () => {
    const { h, kit } = viewEnv();
    const text = joinedText(V.stabilityTable(h, kit, M.stabilityScan()));
    assert.ok(text.includes('decae (estable)') && text.includes('en el límite') && text.includes('crece (inestable)'), text);
  });
});

describe('compare model: summary and conclusions', () => {
  it('summarises the Ordenada Genérica, order, cost, derivatives, hand work and apunte example per method', () => {
    const rows = M.summaryMatrix();
    assert.deepEqual(rows.map((r) => r.id), ['euler', 'taylor', 'heun', 'rk2']);
    assert.deepEqual(rows.map((r) => r.order), [1, 2, 2, 2]);
    assert.deepEqual(rows.map((r) => r.perStep), [1, 3, 2, 2]);
    assert.deepEqual(rows.map((r) => r.derivatives), [false, true, false, false]);
    assert.deepEqual(rows.map((r) => r.apunte), ['Ejemplo 2', 'Ejemplo 1', 'Ejemplo 3', 'Ejemplo 4']);
    rows.forEach((r) => assert.ok(r.byHand.length > 10));
    // the Ordenadas Genéricas have one source: the pure module that already writes them for the apunte's example
    const generics = require('../js/ui/pages/theory/data.js').firstStep('trunc');
    ['taylor', 'heun', 'rk2'].forEach((id) => {
      assert.equal(rows.find((r) => r.id === id).generic, generics[id].generic);
    });
    assert.equal(rows.find((r) => r.id === 'euler').generic, "y_{n+1} = y_n + h\\,y_n'");
  });

  it('builds the summary table with the seven merged columns', () => {
    const { h, kit } = viewEnv();
    const table = V.summaryTable(h, kit, M.summaryMatrix());
    const head = elementsOf(table, (n) => n.tag === 'th' && n.attrs.scope === 'col').map(joinedText);
    assert.deepEqual(head, ['Método', 'Ordenada Genérica', 'Orden global', 'Evaluaciones por paso',
      '¿Necesita derivadas de f?', 'Trabajo a mano', 'En el apunte']);
    const rows = rowsOf(table);
    assert.deepEqual(rows.map((tr) => cellsOf(tr)[1]), ['$O(h)$', '$O(h^{2})$', '$O(h^{2})$', '$O(h^{2})$']);
    assert.deepEqual(rows.map((tr) => cellsOf(tr)[2]), ['1', '3', '2', '2']);
    assert.deepEqual(rows.map((tr) => cellsOf(tr)[5]), ['Ejemplo 2', 'Ejemplo 1', 'Ejemplo 3', 'Ejemplo 4']);
    // RK2's k1 is defined on a second line instead of widening the column
    assert.ok(joinedText(rows[3]).includes('con $k_1 = h\\,f(x_n, y_n)$'), joinedText(rows[3]));
  });

  it('builds the catalogue overview with the values of section 5.6 and the closest method of each row', () => {
    const { h, kit, fTeX } = viewEnv();
    const table = V.overviewTable(h, kit, M.winners(), fTeX);
    assert.equal(elementsOf(table, (n) => n.tag === 'th' && n.attrs.scope === 'col').length, 7);
    const rows = rowsOf(table);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((tr) => elementsOf(tr, (n) => hasClass(n, 'method-chip')).map(joinedText).pop()),
      ['Euler Mejorado', 'Euler Mejorado', 'RK2', 'Euler Mejorado']);
    const text = joinedText(table);
    ['1.815360', '1.972761', '1.977951', '1.983150', '1.993716', '3.450929', '2.649143', '1.287328']
      .forEach((v) => assert.ok(text.includes(v), v));
  });

  it('counts how often Taylor is the farthest of the three: in every case of this catalogue', () => {
    const t = M.taylorFarthest();
    assert.deepEqual([t.count, t.total, t.always], [4, 4, true]);
    M.winners().forEach((w) => assert.equal(w.worstId, 'taylor', w.id));
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

  it('counts the winner of every catalogue case and says the winner changes', () => {
    const list = M.winners();
    assert.equal(list.length, 4);
    assert.ok(list.every((w) => w.exact), 'every comparison case has a known exact solution');
    assert.deepEqual(list.map((w) => w.bestId), ['heun', 'heun', 'rk2', 'heun']);
    const line = M.noUniversalWinner();
    assert.match(line, /4 casos/);
    assert.match(line, /Euler Mejorado en 3/);
    assert.match(line, /RK2 \(punto medio\) en 1/);
    assert.match(line, /no hay uno universal/);
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

describe('compare views: the TeX of the tables that moved here', () => {
  /** True when the braces of a TeX string pair up (`\{` and `\}` do not count) and \left/\right match. */
  function balanced(tex) {
    let depth = 0;
    for (let i = 0; i < tex.length; i += 1) {
      const ch = tex[i];
      if (ch === '\\') i += 1;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth < 0) return false;
      }
    }
    const count = (re) => (tex.match(re) || []).length;
    return depth === 0 && count(/\\left\b/g) === count(/\\right\b/g) && count(/\\begin\{/g) === count(/\\end\{/g);
  }

  it('closes every delimiter and shows no invalid text in any of the new tables', () => {
    const { h, kit, fTeX } = viewEnv();
    const c = M.localConstants('cmp_2xy_13');
    const tables = [
      V.convergenceTable(h, kit, M.convergenceStudy('cmp_2xy_13')),
      V.orderTable(h, kit, M.orderTable()),
      V.costTable(h, kit, M.costTable()),
      V.taylorDegreesTable(h, kit, M.taylorDegrees()),
      V.summaryTable(h, kit, M.summaryMatrix()),
      V.overviewTable(h, kit, M.winners(), fTeX),
      V.stepFormulaTable(h, kit, coefficients()),
      V.constantsTable(h, kit, c, coefficients()),
      V.ratiosTable(h, kit, c),
      V.constantsOverviewTable(h, kit, M.constantsOverview(), fTeX),
      V.stabilityTable(h, kit, M.stabilityScan()),
    ];
    let formulas = 0;
    tables.forEach((table, k) => {
      const text = joinedText(table);
      assert.ok(!/undefined|NaN|Infinity|\[object/.test(text), `table ${k}: ${text.slice(0, 120)}`);
      (text.match(/\$[^$]+\$/g) || []).forEach((raw) => {
        const tex = raw.slice(1, -1);
        formulas += 1;
        assert.ok(tex.trim() !== '', `table ${k}: empty formula`);
        assert.ok(balanced(tex), `table ${k}: unbalanced TeX ${tex}`);
      });
    });
    assert.ok(formulas > 40, `only ${formulas} formulas`);
  });
});

/* ======================================================================================================
   One comparison, one decision guide: the shape of the site after the comparative material was moved
   ====================================================================================================== */

describe('the comparison lives on one page', () => {
  /** Every page module of the site, by the page it renders. */
  const PAGES = Object.freeze({
    comparativa: ['pages/compare.js', 'pages/compare/model.js', 'pages/compare/views.js'],
    teoria: ['pages/theory.js', 'pages/theory/data.js', 'pages/theory/kit.js',
      'pages/theory/sections-a.js', 'pages/theory/sections-b.js', 'pages/theory/sections-c.js'],
    ejercicios: ['pages/exercises.js', 'pages/exercises/data.js', 'pages/exercises/sections.js'],
    simulador: ['pages/simulator.js', 'pages/simulator/state.js', 'pages/simulator/views.js'],
    inicio: ['pages/home.js', 'pages/home/model.js'],
    audiencia: ['pages/audience.js', 'pages/audience/model.js', 'pages/audience/quiz.js'],
    fuentes: ['pages/sources.js'],
  });
  /** Source without block comments and full-line // comments (a comment may legitimately name what moved away). */
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const sourceOf = (page) => PAGES[page].map((file) => code(read('js', 'ui', file))).join('\n');

  it('has the "¿Cuál elegir" guide on exactly one page, and it is the Comparativa', () => {
    const carrying = Object.keys(PAGES).filter((page) => /¿Cuál elegir/.test(sourceOf(page)));
    assert.deepEqual(carrying, ['comparativa']);
    const guides = [...sourceOf('comparativa').matchAll(/¿Cuál elegir/g)];
    assert.equal(guides.length, 1, 'the Comparativa itself states it once');
    assert.match(read('js', 'ui', 'pages', 'compare.js'), /h\('h3', null, '¿Cuál elegir, dado un problema\?'\)/);
  });

  it('keeps the comparative headings out of Teoría: they are the Comparativa\'s sections', () => {
    const theory = sourceOf('teoria');
    ['Error y orden', 'Costo computacional', 'Resumen comparativo'].forEach((title) => {
      assert.ok(!theory.includes(`'${title}'`), `"${title}" is no longer a Teoría section`);
    });
    const compare = read('js', 'ui', 'pages', 'compare.js');
    ['convergencia', 'constantes', 'costo', 'lineal', 'resumen'].forEach((slug) => {
      assert.ok(compare.includes(`section('${slug}'`), `the Comparativa has a ${slug} section`);
    });
  });

  it('builds the Comparativa sections in reading order, each with its own id and heading', () => {
    const compare = read('js', 'ui', 'pages', 'compare.js');
    const slugs = [...compare.matchAll(/\n\s{6}section\('([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(slugs, ['tabla', 'graficos', 'convergencia', 'constantes', 'costo', 'lineal', 'resumen']);
  });

  it('is linked from the pages that used to carry the comparison', () => {
    ['pages/theory/sections-a.js', 'pages/theory/sections-b.js', 'pages/theory/sections-c.js', 'pages/exercises/sections.js']
      .forEach((file) => assert.match(read('js', 'ui', file), /#\/comparativa/, file));
    // and nothing links to the sections that no longer exist
    Object.keys(PAGES).forEach((page) => {
      ['#/teoria/error', '#/teoria/costo', '#/teoria/resumen'].forEach((href) => {
        assert.ok(!sourceOf(page).includes(href), `${page} links to the removed ${href}`);
      });
    });
  });

  it('provides zoom buttons to magnify the final interval in the solution chart', () => {
    const compare = read('js', 'ui', 'pages', 'compare.js');
    assert.match(compare, /id:\s*'cmp-btn-zoom-in'/);
    assert.match(compare, /id:\s*'cmp-btn-zoom-out'/);
    assert.match(compare, /Ampliar el final \(separar curvas\)/);
    assert.match(compare, /Vista completa/);
    assert.match(compare, /solutionZoomWindow/);
  });

  it('provides zoom buttons to magnify second-order methods in the convergence chart', () => {
    const compare = read('js', 'ui', 'pages', 'compare.js');
    assert.match(compare, /id:\s*'cmp-btn-conv-zoom-in'/);
    assert.match(compare, /id:\s*'cmp-btn-conv-zoom-out'/);
    assert.match(compare, /Ampliar métodos de orden 2 \(separar curvas\)/);
    assert.match(compare, /convergenceZoomWindow/);
  });
});
