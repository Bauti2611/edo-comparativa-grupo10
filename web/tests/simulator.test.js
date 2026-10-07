'use strict';
/**
 * Simulador page: the pure module (simulator/state.js) - state, validation, h/N linking, the shareable query,
 * the result and error rows and the CSV text - checked against the oracles of the ODD document (section 5.4).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const route = require('../js/ui/route.js');
const S = require('../js/ui/pages/simulator/state.js');

const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} != ${want} (tol ${tol})`);
const withMethods = (state, methods) => Object.assign({}, state, { methods });
const viaHash = (query) => route.parse(route.build('simulador', null, query)).query;

describe('simulator state: presets and defaults', () => {
  it('starts on the comparative case with the four methods, rounded to 4 decimals', () => {
    const s = S.defaultState();
    assert.equal(s.preset, 'cmp_2xy_13');
    assert.deepEqual(s.methods, ['euler', 'taylor', 'heun', 'rk2']);
    assert.equal(s.order, 2);
    assert.equal(s.decimals, 4);
    assert.equal(s.mode, 'round');
    assert.equal(s.errType, 'abs');
  });

  it('loads a preset as typed text', () => {
    const s = S.stateFromPreset('a1');
    assert.equal(s.f, '2*x*y');
    assert.equal(s.indep, 'x');
    assert.deepEqual([s.x0, s.y0, s.xf, s.h, s.N], ['1', '1', '1.3', '0.1', '3']);
    assert.equal(s.exact, '');
    assert.equal(S.stateFromPreset('a2').indep, 't');
  });

  it('ignores an unknown preset id', () => {
    assert.equal(S.stateFromPreset('nope').preset, S.defaultState().preset);
  });
});

describe('simulator state: the shareable query', () => {
  it('serializes an unchanged preset as preset= alone', () => {
    assert.deepEqual(S.toQuery(S.stateFromPreset('a1')), { preset: 'a1' });
  });

  it('restores preset=a1 as exactly that preset, with its closed form', () => {
    const restored = S.fromQuery({ preset: 'a1' });
    assert.deepEqual(restored, S.stateFromPreset('a1'));
    const run = S.run(restored);
    assert.equal(run.ok, true);
    assert.equal(run.preset.id, 'a1');
    assert.equal(run.reference.kind, 'exact');
    near(run.problem.exact.fn(1.3), Math.exp(0.69), 1e-12);
  });

  it('adds m and ord to the preset form only when they are not the defaults', () => {
    const s = withMethods(S.stateFromPreset('a1'), ['taylor', 'rk2']);
    assert.deepEqual(S.toQuery(Object.assign({}, s, { order: 3 })), { preset: 'a1', m: 'taylor,rk2', ord: '3' });
    assert.deepEqual(S.fromQuery({ preset: 'a1', m: 'taylor,rk2', ord: '3' }).methods, ['taylor', 'rk2']);
    assert.equal(S.fromQuery({ preset: 'a1', m: 'taylor,rk2', ord: '3' }).order, 3);
  });

  it('serializes a changed problem with f, indep, x0, y0, xf, h, m, ord (and ex) and no preset', () => {
    const s = S.edit(S.stateFromPreset('a1'), 'f', '2*x*y + 1');
    assert.equal(s.preset, 'custom');
    const q = S.toQuery(s);
    assert.deepEqual(Object.keys(q), ['f', 'indep', 'x0', 'y0', 'xf', 'h', 'm', 'ord']);
    assert.equal(q.f, '2*x*y + 1');
    assert.equal(q.m, 'euler,taylor,heun,rk2');
    assert.equal(q.ord, '2');
    assert.equal(S.toQuery(Object.assign({}, s, { exact: 'exp(x^2-1)' })).ex, 'exp(x^2-1)');
  });

  const cases = [
    { name: 'powers and products', f: '2*x*y - x^2*y^3', indep: 'x', x0: '1', y0: '1', xf: '1.3', h: '0.1' },
    { name: 'plus signs and decimals', f: '(x+1)*y + 0.25*x + 1.5', indep: 'x', x0: '0', y0: '0.5', xf: '2', h: '0.25' },
    { name: 'independent variable t', f: 'sen(t) + e^{-t}', indep: 't', x0: '0', y0: '0', xf: '1', h: '0.5' },
    { name: 'double star, brackets and a closed form', f: 'y**2 + x', indep: 'x', x0: '-1', y0: '2', xf: '0', h: '0.1', exact: 'tan(x+pi/4)' },
  ];
  cases.forEach((c) => {
    it(`round-trips ${c.name} through the hash`, () => {
      const base = S.fromQuery({});
      let s = base;
      ['indep', 'f', 'x0', 'y0', 'xf', 'h', 'exact'].forEach((field) => { if (c[field] !== undefined) s = S.edit(s, field, c[field]); });
      s = withMethods(s, ['euler', 'rk2']);
      const q = S.toQuery(s);
      const back = S.fromQuery(viaHash(q));
      assert.equal(back.f, c.f);
      assert.equal(back.indep, c.indep);
      assert.deepEqual([back.x0, back.y0, back.xf, back.h], [c.x0, c.y0, c.xf, c.h]);
      assert.equal(back.exact, c.exact || '');
      assert.deepEqual(back.methods, ['euler', 'rk2']);
      assert.deepEqual(S.toQuery(back), q);
    });
  });

  it('normalizes a decimal comma and keeps N when it was the last thing edited', () => {
    let s = S.edit(S.stateFromPreset('a1'), 'N', '6');
    assert.equal(s.stepMode, 'N');
    const q = S.toQuery(s);
    assert.equal(q.n, '6');
    assert.equal(q.h, undefined);
    s = S.fromQuery(viaHash(q));
    assert.equal(s.stepMode, 'N');
    assert.equal(S.validate(s).values.N, 6);
    const comma = S.edit(S.edit(S.stateFromPreset('a1'), 'x0', '0,5'), 'f', 'x');
    assert.equal(S.toQuery(comma).x0, '0.5');
  });

  it('survives garbage: unknown methods, orders and an empty query', () => {
    assert.deepEqual(S.fromQuery({ m: 'foo' }).methods, S.defaultState().methods);
    assert.equal(S.fromQuery({ ord: '9' }).order, 2);
    assert.deepEqual(S.fromQuery({ m: 'taylor3,heun' }).methods, ['taylor', 'heun']);
    assert.equal(S.fromQuery({ m: 'taylor3,heun' }).order, 3);
    assert.equal(S.fromQuery({ indep: 'z', f: 'x' }).indep, 'x');
    assert.equal(S.fromQuery(null).preset, S.defaultState().preset);
  });
});

describe('simulator state: h and N are linked', () => {
  it('editing h recomputes N', () => {
    const s = S.edit(S.stateFromPreset('a1'), 'h', '0.05');
    assert.equal(s.N, '6');
    assert.equal(s.stepMode, 'h');
    assert.equal(s.preset, 'custom');
  });

  it('editing N recomputes h from the interval', () => {
    const s = S.edit(S.stateFromPreset('a1'), 'N', '5');
    assert.equal(s.h, '0.06');
    assert.equal(s.stepMode, 'N');
    assert.equal(S.validate(s).values.N, 5);
    near(S.validate(s).values.h, 0.06, 1e-15);
  });

  it('editing the interval keeps the field that was edited last', () => {
    const viaH = S.edit(S.stateFromPreset('a1'), 'xf', '1.5');
    assert.equal(viaH.N, '5');
    const viaN = S.edit(S.edit(S.stateFromPreset('a1'), 'N', '3'), 'xf', '1.6');
    assert.equal(viaN.h, '0.2');
  });

  it('an invalid h explains why and suggests valid steps; N is left alone', () => {
    const s = S.edit(S.stateFromPreset('a1'), 'h', '0.07');
    assert.equal(s.N, '3');
    const v = S.validate(s);
    assert.equal(v.ok, false);
    assert.match(v.errors.h.message, /no es un múltiplo exacto/);
    assert.match(v.errors.h.message, /Pruebe con/);
    assert.match(v.errors.h.message, /N = 5/);
  });

  it('rejects a non-positive or non-numeric h and N', () => {
    assert.match(S.validate(S.edit(S.stateFromPreset('a1'), 'h', '-0.1')).errors.h.message, /positivo/);
    assert.ok(S.validate(S.edit(S.stateFromPreset('a1'), 'h', 'abc')).errors.h);
    assert.ok(S.validate(S.edit(S.stateFromPreset('a1'), 'N', '2.5')).errors.N);
    assert.ok(S.validate(S.edit(S.stateFromPreset('a1'), 'N', '0')).errors.N);
  });

  it('caps N at 2000 for both ways of giving the step', () => {
    assert.equal(S.MAX_N, 2000);
    const tooMany = S.validate(S.edit(S.stateFromPreset('a1'), 'N', '2001'));
    assert.equal(tooMany.ok, false);
    assert.match(tooMany.errors.N.message, /2000/);
    const tiny = S.validate(S.edit(S.stateFromPreset('a1'), 'h', '0.00001'));
    assert.equal(tiny.ok, false);
    assert.match(tiny.errors.h.message, /2000/);
    const limit = S.validate(S.edit(S.edit(S.stateFromPreset('a1'), 'xf', '3'), 'N', '2000'));
    assert.equal(limit.ok, true);
    assert.equal(limit.values.N, 2000);
  });
});

describe('simulator state: validation', () => {
  it('accepts a decimal comma in every number', () => {
    let s = S.stateFromPreset('a1');
    s = S.edit(s, 'x0', '0,5');
    s = S.edit(s, 'y0', '1,25');
    s = S.edit(s, 'xf', '1,5');
    s = S.edit(s, 'h', '0,25');
    const v = S.validate(s);
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    assert.deepEqual([v.values.x0, v.values.y0, v.values.xf, v.values.h, v.values.N], [0.5, 1.25, 1.5, 0.25, 4]);
  });

  it('reports a malformed expression with the Spanish message and its position', () => {
    const v = S.validate(S.edit(S.stateFromPreset('a1'), 'f', '2*x*'));
    assert.equal(v.ok, false);
    assert.match(v.errors.f.message, /termina de forma inesperada/);
    assert.equal(v.errors.f.pos, 4);
    assert.equal(S.run(S.edit(S.stateFromPreset('a1'), 'f', '2*x*')).ok, false);
  });

  it('rejects an empty f, a variable that is not the independent one and a y-dependent closed form', () => {
    assert.ok(S.validate(S.edit(S.stateFromPreset('a1'), 'f', '  ')).errors.f);
    const wrongVar = S.validate(S.edit(S.stateFromPreset('a1'), 'indep', 't'));
    assert.match(wrongVar.errors.f.message, /Identificador desconocido/);
    const exact = S.validate(S.edit(S.stateFromPreset('a1'), 'exact', 'y+1'));
    assert.match(exact.errors.exact.message, /solo de x/);
    assert.ok(S.validate(S.edit(S.stateFromPreset('a1'), 'exact', 'sen(')).errors.exact);
  });

  it('rejects xf <= x0, a non-numeric start and an empty method list', () => {
    assert.match(S.validate(S.edit(S.stateFromPreset('a1'), 'xf', '0.5')).errors.xf.message, /mayor que x0/);
    assert.ok(S.validate(S.edit(S.stateFromPreset('a1'), 'x0', 'uno')).errors.x0);
    assert.ok(S.validate(withMethods(S.stateFromPreset('a1'), [])).errors.methods);
  });
});

describe('simulator results: the cátedra oracle (Ej. 1, Taylor de grado 2)', () => {
  const state = withMethods(S.stateFromPreset('a1'), ['taylor']);
  const run = S.run(state);

  it('computes 1.23, 1.542666 and 1.9727613 at full precision', () => {
    const { ys } = run.solutions[0].solution;
    near(ys[1], 1.23, 1e-12);
    near(ys[2], 1.542666, 1e-9);
    near(ys[3], 1.9727613, 5e-8);
  });

  it('shows 1.9728 rounded and 1.9727 truncated', () => {
    const last = (opts) => S.resultsTable(run, opts).rows[3];
    assert.deepEqual(last({ decimals: 4, mode: 'round' }), ['3', '1.3', '1.9728']);
    assert.deepEqual(last({ decimals: 4, mode: 'trunc' }), ['3', '1.3', '1.9727']);
    assert.deepEqual(S.resultsTable(run, { decimals: 4, mode: 'trunc' }).rows[1], ['1', '1.1', '1.23']);
  });

  it('builds the CSV with a header and full-precision rows', () => {
    const csv = S.csv(run);
    const lines = csv.trimEnd().split('\r\n');
    assert.equal(lines[0], 'n,x,exacta,taylor2_y,taylor2_error_abs,taylor2_error_rel');
    assert.equal(lines.length, 5);
    const rows = lines.slice(1).map((line) => line.split(','));
    assert.deepEqual(rows.map((r) => r[0]), ['0', '1', '2', '3']);
    assert.deepEqual(rows.map((r) => r[1]), ['1', '1.1', '1.2', '1.3']);
    assert.equal(rows[1][3], '1.23');
    assert.equal(rows[2][3], '1.542666');
    assert.equal(rows[3][3], '1.9727612808');
    near(Number(rows[3][3]), 1.9727613, 5e-8);
    near(Number(rows[3][2]), 1.993716, 5e-7);
    near(Number(rows[3][4]), Math.exp(0.69) - 1.9727613, 5e-8);
  });

  it('measures the error against the exact solution at every x_n', () => {
    assert.equal(run.reference.kind, 'exact');
    const { abs, rel, pct } = run.solutions[0].errors;
    assert.equal(abs[0], 0);
    near(abs[3], 0.0209542, 1e-6);
    near(rel[3], abs[3] / Math.exp(0.69), 1e-12);
    near(pct[3], 100 * rel[3], 1e-9);
    const table = S.errorsTable(run, { decimals: 4, errType: 'abs' });
    assert.equal(table.rows[3][2], '0.020954');
    assert.equal(S.errorsTable(run, { decimals: 4, errType: 'pct' }).rows[3][2], '1.051');
  });
});

describe('simulator results: methods, intermediate values and references', () => {
  it('lists the intermediate values the cátedra prints (k1 and the midpoint of RK2)', () => {
    const run = S.run(withMethods(S.stateFromPreset('a4'), ['rk2']));
    const plain = S.resultsTable(run, { decimals: 4, mode: 'trunc' });
    const full = S.resultsTable(run, { decimals: 4, mode: 'trunc', intermediate: true });
    assert.ok(full.columns.length > plain.columns.length);
    const k1 = full.columns.findIndex((c) => c.text === 'k' && c.sub === '1');
    assert.ok(k1 > 0);
    assert.equal(full.rows[0][k1], '0.2');
    assert.equal(full.rows[3][k1], '', 'the last row has no step after it');
    assert.equal(full.rows[1][2], '1.231');
  });

  it('adds y\' and y\'\' for Taylor and the predictor and slopes for Euler Mejorado', () => {
    const run = S.run(withMethods(S.stateFromPreset('a3'), ['taylor', 'heun']));
    const full = S.resultsTable(run, { decimals: 4, mode: 'round', intermediate: true });
    const labels = full.columns.map((c) => `${c.text}${c.sub || ''}${c.sup || ''}`);
    assert.ok(labels.includes("yn'") && labels.includes("yn''"), labels.join(' '));
    assert.ok(labels.some((l) => /predictor/.test(l)), labels.join(' '));
    assert.equal(full.groups.reduce((total, g) => total + g.span, 0), full.columns.length);
  });

  it('uses an RK4 reference when there is no closed form and says so', () => {
    const run = S.run(withMethods(S.stateFromPreset('p5_3c'), ['heun']));
    assert.equal(run.reference.kind, 'reference');
    assert.match(run.reference.label, /[Rr]eferencia/);
    assert.equal(S.csv(run).split('\r\n')[0].split(',')[2], 'referencia');
  });

  it('prefers the typed closed form over the preset\'s', () => {
    const run = S.run(S.edit(withMethods(S.stateFromPreset('a1'), ['euler']), 'exact', 'exp(x^2-1)'));
    assert.equal(run.reference.kind, 'exact');
    near(run.refYs[3], Math.exp(0.69), 1e-12);
  });

  it('plots the solutions and the closed form, and drops zero errors from a log axis', () => {
    const run = S.run(S.stateFromPreset('a1'));
    const series = S.chartSeries(run);
    assert.equal(series.methods.length, 4);
    assert.equal(series.methods[0].points.length, 4);
    assert.ok(series.reference.points.length > 50);
    assert.equal(series.indep, 'x');
    const linear = S.errorSeries(run, { errType: 'abs', log: false });
    const log = S.errorSeries(run, { errType: 'abs', log: true });
    assert.equal(linear[0].points.length, 4);
    assert.equal(log[0].points.length, 3);
    assert.ok(log.every((s) => s.points.every((p) => p.y > 0)));
  });

  it('keeps going when a method diverges and reports it', () => {
    let s = S.stateFromPreset('a1');
    s = S.edit(s, 'f', 'exp(y^2)');
    s = S.edit(s, 'y0', '3');
    s = S.edit(s, 'x0', '0');
    s = S.edit(s, 'xf', '5');
    s = S.edit(s, 'h', '1');
    const run = S.run(withMethods(s, ['euler', 'rk2']));
    assert.equal(run.ok, true);
    assert.ok(run.diverged.length >= 1);
    assert.match(run.diverged[0].message, /dejó de ser finita/);
    const table = S.resultsTable(run, { decimals: 4, mode: 'round' });
    assert.equal(table.rows.length, 6);
    assert.ok(table.rows[5].includes('—'));
  });

  it('limits the step-by-step panel to the first 20 iterations', () => {
    assert.equal(S.STEPS_SHOWN, 20);
    assert.equal(S.stepsUpTo(15), null);
    assert.equal(S.stepsUpTo(20), null);
    assert.equal(S.stepsUpTo(21), 20);
  });

  it('runs the Taylor orders 3 and 4 and flags them as an extension', () => {
    const run = S.run(Object.assign(withMethods(S.stateFromPreset('a1'), ['taylor']), { order: 4 }));
    assert.equal(run.solutions[0].order, 4);
    assert.equal(run.solutions[0].key, 'taylor4');
    assert.equal(run.solutions[0].extension, true);
    assert.equal(S.run(withMethods(S.stateFromPreset('a1'), ['taylor'])).solutions[0].extension, false);
  });
});
