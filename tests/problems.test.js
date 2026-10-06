'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, prng, between, near } = require('./helpers.js');

const E = load('expr');
const P = load('problems');

describe('stepsFor', () => {
  const valid = [
    [1, 1.3, 0.1, 3], [0, 1, 0.1, 10], [0, 0.5, 0.1, 5], [2, 2.75, 0.25, 3], [1, 3, 0.5, 4],
    [0, 1, 0.05, 20], [0, 1, 0.3 / 3, 10], [1, 1.25, 0.05, 5], [0, 3, 0.3, 10], [0, 1, 1, 1],
  ];
  for (const [x0, xf, h, N] of valid) {
    it(`N = (${xf} - ${x0}) / ${h} = ${N}`, () => {
      const s = P.stepsFor(x0, xf, h);
      assert.equal(s.ok, true);
      assert.equal(s.N, N);
      assert.equal(s.message, '');
    });
  }

  it('accepts ratios within 1e-9 relative tolerance and rejects the rest', () => {
    assert.equal(P.stepsFor(0, 3 * (1 + 1e-10), 1).ok, true);
    assert.equal(P.stepsFor(0, 3 * (1 + 1e-7), 1).ok, false);
  });

  it('explains a non-integer ratio and suggests nearby valid steps', () => {
    const s = P.stepsFor(0, 1, 0.3);
    assert.equal(s.ok, false);
    assert.ok(Number.isNaN(s.N));
    assert.match(s.message, /no es un múltiplo exacto de h = 0\.3/);
    assert.match(s.message, /3\.333333/);
    assert.match(s.message, /h = 0\.25 \(N = 4\)/);
    assert.match(s.message, /h = 0\.333333 \(N = 3\)/);
    assert.equal(s.suggestions.length, 2);
    for (const h of s.suggestions) assert.equal(P.stepsFor(0, 1, h).ok, true, `suggested h = ${h} must be valid`);
  });

  it('suggests the whole interval when h is larger than it', () => {
    const s = P.stepsFor(0, 1, 2);
    assert.equal(s.ok, false);
    assert.deepEqual(s.suggestions, [1]);
    assert.match(s.message, /h = 1 \(N = 1\)/);
  });

  it('rejects invalid values with Spanish messages', () => {
    assert.match(P.stepsFor(0, 1, 0).message, /paso h debe ser un número positivo/);
    assert.match(P.stepsFor(0, 1, -0.1).message, /paso h debe ser un número positivo/);
    assert.match(P.stepsFor(1, 1, 0.1).message, /xf debe ser mayor que x0/);
    assert.match(P.stepsFor(2, 1, 0.1).message, /xf debe ser mayor que x0/);
    assert.match(P.stepsFor(NaN, 1, 0.1).message, /números finitos/);
    assert.match(P.stepsFor(0, Infinity, 0.1).message, /números finitos/);
    assert.equal(P.stepsFor(0, 1, '0.1').ok, false);
  });
});

describe('make', () => {
  const base = { fStr: '2*x*y', x0: 1, y0: 1, xf: 1.3 };

  it('derives N from h and h from N', () => {
    const byH = P.make(Object.assign({ h: 0.1 }, base));
    assert.equal(byH.N, 3);
    assert.equal(byH.h, 0.1);
    const byN = P.make(Object.assign({ N: 3 }, base));
    assert.equal(byN.N, 3);
    near(byN.h, 0.1, 1e-15);
  });

  it('checks that h and N agree when both are given', () => {
    assert.equal(P.make(Object.assign({ h: 0.1, N: 3 }, base)).N, 3);
    assert.throws(() => P.make(Object.assign({ h: 0.1, N: 4 }, base)), (e) => e instanceof E.EDOError && /no coincide/.test(e.message));
  });

  it('rejects an h that does not divide the interval, or a missing step', () => {
    assert.throws(() => P.make(Object.assign({ h: 0.25 }, base)), (e) => e instanceof E.EDOError && /múltiplo exacto/.test(e.message));
    assert.throws(() => P.make(base), (e) => e instanceof E.EDOError && /h o la cantidad de pasos/.test(e.message));
    assert.throws(() => P.make(Object.assign({ N: 0 }, base)), E.EDOError);
    assert.throws(() => P.make(Object.assign({ N: 2.5 }, base)), E.EDOError);
  });

  it('rejects invalid data', () => {
    assert.throws(() => P.make(null), E.EDOError);
    assert.throws(() => P.make(Object.assign({ h: 0.1 }, base, { xf: 1 })), (e) => /xf debe ser mayor/.test(e.message));
    assert.throws(() => P.make(Object.assign({ h: 0.1 }, base, { x0: NaN })), (e) => /x0/.test(e.message));
    assert.throws(() => P.make(Object.assign({ h: 0.1 }, base, { y0: '1' })), (e) => /y0/.test(e.message));
    assert.throws(() => P.make(Object.assign({ h: 0.1 }, base, { exact: { fn: 'x' } })), E.EDOError);
  });

  it('propagates parse errors of f, with the position', () => {
    assert.throws(() => P.make(Object.assign({ h: 0.1 }, base, { fStr: '2*z' })), (e) => e instanceof E.EDOParseError && e.pos === 2);
    assert.throws(() => P.make(Object.assign({ h: 0.1 }, base, { fStr: '2*t*y' })), E.EDOParseError);
  });

  it('defaults id, title, notes and independent variable', () => {
    const p = P.make(Object.assign({ h: 0.1 }, base));
    assert.equal(p.id, 'custom');
    assert.equal(p.title, '');
    assert.deepEqual(p.notes, []);
    assert.equal(p.indep, 'x');
  });

  it('compiles f from the typed expression and keeps the typed tree', () => {
    const p = P.make({ fStr: '(1/4)*(1+y^2)', x0: 0, y0: 1, xf: 0.5, h: 0.1 });
    assert.equal(p.f(0, 1), 0.5);
    assert.equal(E.toTeX(p.fNode), '\\frac{1}{4}(1 + y^{2})');
    const t = P.make({ fStr: 'sen(t) + e^{-t}', indep: 't', x0: 0, y0: 0, xf: 1, h: 0.5 });
    near(t.f(0.5, 123), Math.sin(0.5) + Math.exp(-0.5), 1e-15);
    assert.equal(t.indep, 't');
  });

  it('exposes lazy, cached partial derivatives', () => {
    const p = P.make(Object.assign({ h: 0.1 }, base));
    assert.equal(E.toTeX(p.fx()), '2y');
    assert.equal(E.toTeX(p.fy()), '2x');
    assert.equal(p.fx(), p.fx());
    assert.equal(p.fy(), p.fy());
  });

  it('exposes y\', y\'\', ... as nodes and as compiled closures', () => {
    const p = P.make(Object.assign({ h: 0.1 }, base));
    const nodes = p.derivNodes(3);
    assert.equal(nodes.length, 3);
    assert.equal(nodes[0], p.fNode);
    assert.equal(E.toTeX(nodes[1]), '2y + 4x^{2}y');
    assert.equal(E.toTeX(nodes[2]), '12xy + 8x^{3}y');
    assert.equal(p.derivNodes(1).length, 1);
    const fns = p.derivFns(4);
    assert.equal(fns[0], p.f);
    assert.deepEqual(fns.map((g) => g(1, 1)), [2, 6, 20, 76]);
    assert.deepEqual(p.derivFns(2).map((g) => g(2, 0.5)), [2, 2 * 0.5 + 4 * 4 * 0.5]);
    assert.throws(() => p.derivNodes(0), E.EDOError);
    assert.throws(() => p.derivFns(1.5), E.EDOError);
  });

  it('parses the hand-derived y\'\' when present', () => {
    const p = P.fromPreset('p5_1a');
    assert.equal(E.toTeX(p.handNode()), '9x^{4}y - 6xy');
    assert.equal(P.fromPreset('a2').handNode(), null);
    assert.equal(p.handNode(), p.handNode());
  });

  it('keeps independent problems independent', () => {
    const a = P.make(Object.assign({ h: 0.1 }, base));
    const b = P.make({ fStr: '-y', x0: 0, y0: 1, xf: 1, h: 0.1 });
    assert.equal(E.toTeX(a.derivNodes(2)[1]), '2y + 4x^{2}y');
    assert.equal(E.toTeX(b.derivNodes(2)[1]), 'y', 'y\'\' of y\' = -y');
    assert.equal(E.toTeX(b.derivNodes(3)[2]), '-y', 'y\'\'\' of y\' = -y');
  });
});

describe('exactFromString', () => {
  it('builds {fn, tex, str} from typed text', () => {
    const ex = P.exactFromString('exp(x^2-1)');
    near(ex.fn(1.3), Math.exp(1.3 * 1.3 - 1), 1e-15);
    assert.equal(ex.tex, 'e^{x^{2} - 1}');
    assert.equal(ex.str, 'exp(x^2 - 1)');
  });

  it('uses the declared independent variable', () => {
    const ex = P.exactFromString('2 - cos(t) - e^{-t}', { indep: 't' });
    near(ex.fn(1), 2 - Math.cos(1) - Math.exp(-1), 1e-15);
    assert.match(ex.tex, /\\cos\(t\)/);
  });

  it('rejects expressions of y and syntax errors', () => {
    assert.throws(() => P.exactFromString('x*y'), (e) => e instanceof E.EDOError && /solo de x|solo/.test(e.message));
    assert.throws(() => P.exactFromString('x +'), E.EDOParseError);
  });
});

/** The contract of section 5.5/5.6: [id, fStr, indep, x0, y0, xf, h, N, requested method]. */
const TABLE = [
  ['a1', '2*x*y', 'x', 1, 1, 1.3, 0.1, 3, 'taylor'],
  ['a2', 'sen(t) + e^{-t}', 't', 0, 0, 1, 0.5, 2, 'euler'],
  ['a3', '-y + x + 1', 'x', 0, 1, 1, 0.5, 2, 'heun'],
  ['a4', '2*x*y', 'x', 1, 1, 1.3, 0.1, 3, 'rk2'],
  ['p5_1a', '-3*x^2*y', 'x', 0, 3, 0.5, 0.1, 5, 'taylor'],
  ['p5_1b', '(1/4)*(1+y^2)', 'x', 0, 1, 0.5, 0.1, 5, 'taylor'],
  ['p5_1c', '2*x*y', 'x', 1, 1, 1.3, 0.1, 3, 'taylor'],
  ['p5_1d', '(1/t)*(y^2+y)', 't', 1, -2, 3, 0.5, 4, 'taylor'],
  ['p5_2a', '-y + x + 1', 'x', 0, 1, 1, 0.1, 10, 'euler'],
  ['p5_2b', 'sen(t) + e^{-t}', 't', 0, 0, 1, 0.5, 2, 'euler'],
  ['p5_2c', '(x-y)^2', 'x', 2, 0.5, 2.75, 0.25, 3, 'euler'],
  ['p5_2d_1', 'x*y^2 - y/x', 'x', 1, 1, 1.5, 0.1, 5, 'euler'],
  ['p5_2d_2', 'x*y^2 - y/x', 'x', 1, 1, 1.25, 0.05, 5, 'euler'],
  ['p5_2e_1', '2*x - 3*y + 1', 'x', 1, 5, 1.5, 0.1, 5, 'euler'],
  ['p5_2e_2', '2*x - 3*y + 1', 'x', 1, 5, 1.25, 0.05, 5, 'euler'],
  ['p5_3a', '2*x*y', 'x', 1, 1, 1.5, 0.1, 5, 'heun'],
  ['p5_3b', '(x+y-1)^2', 'x', 0, 2, 0.5, 0.1, 5, 'heun'],
  ['p5_3c', 'x + y^2', 'x', 0, 0, 0.5, 0.1, 5, 'heun'],
  ['p5_3e', '-t*y + 4*t/y', 't', 0, 1, 1, 0.25, 4, 'heun'],
  ['p6_1a', '-3*x^2*y', 'x', 0, 3, 0.5, 0.1, 5, 'rk2'],
  ['p6_1b', '(1/4)*(1+y^2)', 'x', 0, 1, 0.5, 0.1, 5, 'rk2'],
  ['p6_1c', '2*x*y', 'x', 1, 1, 1.5, 0.1, 5, 'rk2'],
  ['cmp_2xy_13', '2*x*y', 'x', 1, 1, 1.3, 0.1, 3, null],
  ['cmp_2xy_15', '2*x*y', 'x', 1, 1, 1.5, 0.1, 5, null],
  ['cmp_3x2y', '-3*x^2*y', 'x', 0, 3, 0.5, 0.1, 5, null],
  ['cmp_quarter', '(1+y^2)/4', 'x', 0, 1, 0.5, 0.1, 5, null],
  ['ex_linear', '-2*y', 'x', 0, 1, 1, 0.1, 10, null],
  ['ex_unstable', '-10*y', 'x', 0, 1, 3, 0.3, 10, null],
];

describe('PRESETS: structure and contract', () => {
  it('has exactly the presets of the contract, in unique ids', () => {
    assert.deepEqual(P.PRESETS.map((p) => p.id), TABLE.map((r) => r[0]));
    assert.equal(new Set(P.PRESETS.map((p) => p.id)).size, P.PRESETS.length);
    assert.equal(P.PRESETS.length, 28);
  });

  for (const [id, fStr, indep, x0, y0, xf, h, N, method] of TABLE) {
    it(`${id} matches the course data`, () => {
      const p = P.byId(id);
      assert.ok(p, `missing preset ${id}`);
      assert.equal(p.fStr, fStr);
      assert.equal(p.indep, indep);
      assert.equal(p.x0, x0);
      assert.equal(p.y0, y0);
      assert.equal(p.xf, xf);
      assert.equal(p.h, h);
      assert.equal(p.N, N);
      assert.equal(p.method, method);
      const s = P.stepsFor(x0, xf, h);
      assert.equal(s.ok, true);
      assert.equal(s.N, N, 'N must equal (xf - x0)/h');
    });
  }

  it('gives every preset the required fields and a buildable Problem', () => {
    const groupIds = P.GROUPS.map((g) => g.id);
    for (const spec of P.PRESETS) {
      assert.equal(typeof spec.id, 'string');
      assert.ok(groupIds.includes(spec.group), `${spec.id}: group ${spec.group}`);
      assert.ok(typeof spec.title === 'string' && spec.title.length > 0, `${spec.id}: title`);
      assert.ok(typeof spec.source === 'string' && spec.source.length > 0, `${spec.id}: source`);
      assert.ok(['x', 't'].includes(spec.indep), `${spec.id}: indep`);
      assert.ok(spec.method === null || ['euler', 'taylor', 'heun', 'rk2'].includes(spec.method), `${spec.id}: method`);
      assert.ok(Array.isArray(spec.notes) && spec.notes.every((n) => typeof n === 'string'), `${spec.id}: notes`);
      if (spec.exact) {
        assert.equal(typeof spec.exact.fn, 'function');
        assert.ok(spec.exact.tex.length > 0 && spec.exact.str.length > 0, `${spec.id}: exact strings`);
      }
      if (spec.method === 'taylor') assert.equal(spec.order, 2, `${spec.id}: Taylor order`);
      const problem = P.make(spec);
      assert.equal(problem.N, spec.N);
      assert.ok(E.toTeX(problem.fNode, { indep: spec.indep }).length > 0);
    }
  });

  it('assigns groups by origin', () => {
    const group = (id) => P.byId(id).group;
    assert.deepEqual(P.PRESETS.filter((p) => p.group === 'amiconi').map((p) => p.id), ['a1', 'a2', 'a3', 'a4']);
    assert.equal(P.PRESETS.filter((p) => p.group === 'practica05').length, 15);
    assert.equal(P.PRESETS.filter((p) => p.group === 'practica06').length, 3);
    assert.equal(P.PRESETS.filter((p) => p.group === 'comparativa').length, 4);
    assert.equal(P.PRESETS.filter((p) => p.group === 'extra').length, 2);
    assert.equal(group('p5_2d_2'), 'practica05');
    assert.equal(group('ex_unstable'), 'extra');
  });

  it('cites the source of each practice-bank preset', () => {
    assert.equal(P.byId('p5_1a').source, 'Práctica 05 · Ej. 1a');
    assert.equal(P.byId('p6_1c').source, 'Práctica 06 · Ej. 1c');
    assert.match(P.byId('a1').source, /Amiconi/);
  });

  it('records the ambiguities of the sheets in the notes', () => {
    const notes = (id) => P.byId(id).notes.join(' ');
    assert.match(notes('p5_1a'), /grado 2/);
    assert.match(notes('p5_1b'), /x0 = 0/);
    assert.match(notes('p5_1d'), /t0 = 1/);
    assert.match(notes('p5_1d'), /N = \(xf − x0\)\/h = 4/);
    assert.match(notes('p5_1c'), /y\(1\.5\)/);
    assert.match(notes('p6_1c'), /y\(1\.3\)/);
    assert.match(notes('p6_1a'), /2º orden/);
    assert.match(notes('p5_2d_1'), /dos corridas/);
    assert.match(notes('p5_3c'), /RK4/);
  });

  it('never mentions the handout\'s printed errors', () => {
    const all = JSON.stringify(P.PRESETS.map((p) => [p.title, p.notes]));
    assert.ok(!all.includes('1.4297'));
    assert.ok(!all.includes('1.4843'));
    assert.ok(!/errata|error del apunte|equivoc/i.test(all));
  });

  it('is frozen (presets are data, not state)', () => {
    assert.ok(Object.isFrozen(P.PRESETS));
    assert.ok(Object.isFrozen(P.PRESETS[0]));
    assert.throws(() => { P.PRESETS[0].x0 = 5; }, TypeError);
    assert.ok(Object.isFrozen(P.PRESETS[0].notes));
  });

  it('exposes display groups in order', () => {
    assert.deepEqual(P.GROUPS.map((g) => g.id), ['amiconi', 'practica05', 'practica06', 'comparativa', 'extra']);
    assert.ok(P.GROUPS.every((g) => g.label.length > 0));
  });
});

describe('PRESETS: closed forms are verified', () => {
  const D4 = (g, x, h) => (g(x - 2 * h) - 8 * g(x - h) + 8 * g(x + h) - g(x + 2 * h)) / (12 * h);

  for (const spec of P.PRESETS.filter((p) => p.exact)) {
    it(`${spec.id}: y(x0) = y0 and the ODE residual is below 1e-7`, () => {
      const problem = P.make(spec);
      const g = spec.exact.fn;
      near(g(spec.x0), spec.y0, 1e-12, `${spec.id} initial condition`);
      const POINTS = 21;
      for (let i = 0; i < POINTS; i += 1) {
        const x = spec.x0 + (i * (spec.xf - spec.x0)) / (POINTS - 1);
        const residual = D4(g, x, 1e-3) - problem.f(x, g(x));
        assert.ok(Math.abs(residual) < 1e-7, `${spec.id}: residual ${residual} at x = ${x}`);
      }
    });
  }

  it('only Ej. 3c of the Práctica 05 has no closed form (it uses the RK4 reference)', () => {
    assert.deepEqual(P.PRESETS.filter((p) => !p.exact).map((p) => p.id), ['p5_3c']);
  });

  it('checks the exact solution against its own typed form', () => {
    for (const spec of P.PRESETS.filter((p) => p.exact)) {
      const node = E.parse(spec.exact.str, { indep: spec.indep });
      const g = E.compile(node);
      for (let i = 0; i <= 4; i += 1) {
        const x = spec.x0 + (i * (spec.xf - spec.x0)) / 4;
        near(g(x, NaN), spec.exact.fn(x), 1e-12 * (1 + Math.abs(spec.exact.fn(x))), `${spec.id}.str at ${x}`);
      }
    }
  });
});

describe('PRESETS: hand-derived second derivatives', () => {
  const rnd = prng(4242);
  const withHand = P.PRESETS.filter((p) => p.hand);

  it('exist for the Taylor presets 1a-1d and Ej. 1 of the apunte', () => {
    assert.deepEqual(withHand.map((p) => p.id), ['a1', 'p5_1a', 'p5_1b', 'p5_1c', 'p5_1d']);
    assert.ok(withHand.every((p) => p.method === 'taylor'));
  });

  for (const spec of withHand) {
    it(`${spec.id}: hand y'' equals the engine's total derivative at 20 random points`, () => {
      const problem = P.make(spec);
      const hand = E.compile(problem.handNode());
      const engine = E.compile(problem.derivNodes(2)[1]);
      for (let i = 0; i < 20; i += 1) {
        const x = between(rnd, 0.4, 2.5);
        const y = between(rnd, -2.5, 2.5);
        near(hand(x, y), engine(x, y), 1e-12 * (1 + Math.abs(engine(x, y))), `${spec.id} at (${x}, ${y})`);
      }
    });
  }

  it('the engine prints the hand forms of the handout for 1a and 1c', () => {
    assert.equal(E.toTeX(P.fromPreset('p5_1a').derivNodes(2)[1]), '9x^{4}y - 6xy');
    assert.equal(E.toTeX(P.fromPreset('p5_1c').derivNodes(2)[1]), '2y + 4x^{2}y');
  });

  it('the whole chain y\' ... y\'\'\'\' is consistent along every exact solution: d/dx y^(k)(x, y(x)) = y^(k+1)(x, y(x))', () => {
    const D4 = (g, x, h) => (g(x - 2 * h) - 8 * g(x - h) + 8 * g(x + h) - g(x + 2 * h)) / (12 * h);
    for (const spec of P.PRESETS.filter((p) => p.exact)) {
      const problem = P.make(spec);
      const y = spec.exact.fn;
      const chain = problem.derivFns(4);
      for (let i = 1; i <= 5; i += 1) {
        const x = spec.x0 + (i * (spec.xf - spec.x0)) / 6;
        for (let k = 0; k < 3; k += 1) {
          const along = (t) => chain[k](t, y(t));
          const expected = D4(along, x, 1e-3);
          near(chain[k + 1](x, y(x)), expected, 1e-5 * (1 + Math.abs(expected)), `${spec.id}: y^(${k + 2}) at ${x}`);
        }
      }
    }
  });

  it('y\'\' matches the second derivative of the exact solution', () => {
    for (const spec of P.PRESETS.filter((p) => p.exact && p.method === 'taylor')) {
      const problem = P.make(spec);
      const g = spec.exact.fn;
      const d2 = E.compile(problem.derivNodes(2)[1]);
      const h = 1e-4;
      for (let i = 0; i <= 4; i += 1) {
        const x = spec.x0 + (i * (spec.xf - spec.x0)) / 4;
        const numeric = (g(x + h) - 2 * g(x) + g(x - h)) / (h * h);
        near(d2(x, g(x)), numeric, 1e-4 * (1 + Math.abs(numeric)), `${spec.id} y'' at ${x}`);
      }
    }
  });
});

describe('fromPreset', () => {
  it('builds a Problem from an id, optionally overriding fields', () => {
    assert.equal(P.fromPreset('a1').N, 3);
    const finer = P.fromPreset('a1', { h: 0.05 });
    assert.equal(finer.N, 6);
    assert.equal(finer.h, 0.05);
    const byN = P.fromPreset('a1', { N: 6 });
    assert.equal(byN.N, 6);
    near(byN.h, 0.05, 1e-15);
    assert.equal(P.fromPreset('a1', { y0: 2 }).y0, 2);
    assert.equal(P.fromPreset('a1', { fStr: '3*x*y' }).f(1, 1), 3);
  });

  it('accepts a spec and reports unknown ids', () => {
    assert.equal(P.fromPreset(P.byId('a2')).indep, 't');
    assert.throws(() => P.fromPreset('nope'), (e) => e instanceof E.EDOError && /No existe/.test(e.message));
    assert.equal(P.byId('nope'), undefined);
  });

  it('keeps the preset itself untouched', () => {
    P.fromPreset('a1', { h: 0.05 });
    assert.equal(P.byId('a1').h, 0.1);
    assert.equal(P.byId('a1').N, 3);
  });
});
