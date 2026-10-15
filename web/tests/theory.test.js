'use strict';
/**
 * The Teoría page (js/ui/pages/theory.js and theory/): the numbers and formulas it shows, checked against the
 * oracles of the ODD document (sections 5.4 to 5.7), and its ten sections built with a stand-in DOM (every math
 * delimiter closed, every TeX string with balanced braces, no errata of the handout, neutral Spanish, internal
 * links that exist). These are characterization tests of a complete module, so they were not written red-first;
 * a mutation check (perturbing the data module) shows that they fail when a value or a formula changes.
 * What needs a real browser (layout, scroll-spy, lazy diagrams, the display switch) is covered by the QA harness.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WEB_ROOT, load, near } = require('./helpers.js');

const THEORY_DIR = path.join(WEB_ROOT, 'js', 'ui', 'pages', 'theory');
const data = require(path.join(THEORY_DIR, 'data.js'));
const kitModule = require(path.join(THEORY_DIR, 'kit.js'));
const sections = [].concat(
  require(path.join(THEORY_DIR, 'sections-a.js')),
  require(path.join(THEORY_DIR, 'sections-b.js')),
  require(path.join(THEORY_DIR, 'sections-c.js')),
);
const route = require(path.join(WEB_ROOT, 'js', 'ui', 'route.js'));
const expr = load('expr');
const format = load('format');
const problems = load('problems');
const methods = load('methods');
const analysis = load('analysis');

const read = (...parts) => fs.readFileSync(path.join(WEB_ROOT, ...parts), 'utf8');
const SECOND_ORDER = ['taylor', 'heun', 'rk2'];

/** True when the braces of a TeX string pair up (`\{` and `\}` do not count) and \left/\right, \begin/\end match. */
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

/* ======================================================================================================
   EDO.theory.data: first iteration in the cátedra's layout (sections 5.1, 5.2 and 5.4)
   ====================================================================================================== */

describe('first iteration (n = 0) on y\' = 2xy, y(1) = 1, h = 0.1: Ejemplos 1 and 4 of the apunte', () => {
  const trunc = data.firstStep('trunc');
  const round = data.firstStep('round');

  it('runs on the cátedra\'s PVI: x0 = 1, y0 = 1, h = 0.1, y(1.3) in 3 iterations', () => {
    const p = data.example();
    assert.deepEqual([p.x0, p.y0, p.h, p.xf, p.N], [1, 1, 0.1, 1.3, 3]);
    assert.equal(expr.toString(p.fNode).replace(/\s+/g, ''), '2*x*y');
    assert.equal(trunc.problem.id, p.id);
  });

  it('gives y1 = 1.23 (Taylor), 1.232 (Euler Mejorado) and 1.231 (RK2), recomputed by hand', () => {
    near(trunc.taylor.y1, 1.23, 1e-12, 'Taylor');
    near(trunc.heun.y1, 1.232, 1e-12, 'Euler Mejorado');
    near(trunc.rk2.y1, 1.231, 1e-12, 'RK2');
    // the arithmetic of the apunte, written out independently of the engine
    near(1 + 0.1 * (2 * 1 * 1) + (0.1 ** 2 / 2) * (2 * 1 + 4 * 1 ** 2 * 1), 1.23, 1e-12);
    near(1 + (0.1 / 2) * (2 + 2 * 1.1 * (1 + 0.1 * 2)), 1.232, 1e-12);
    near(1 + 0.1 * (2 * (1 + 0.1 / 2) * (1 + 0.2 / 2)), 1.231, 1e-12);
  });

  it('prints them as the apunte does (no trailing zeros) in both display modes: they have at most 3 decimals', () => {
    [trunc, round].forEach((entries) => {
      assert.deepEqual(['taylor', 'heun', 'rk2'].map((id) => entries[id].y1Text), ['1.23', '1.232', '1.231']);
      assert.deepEqual(['taylor', 'heun', 'rk2'].map((id) => entries[id].y1TeX), [
        'y_1 = 1.23 = y(x_1) = y(1.1)', 'y_1 = 1.232 = y(x_1) = y(1.1)', 'y_1 = 1.231 = y(x_1) = y(1.1)',
      ]);
    });
  });

  it('writes the Ordenada Genérica of each method as the apunte defines it (section 5.1)', () => {
    assert.equal(trunc.taylor.generic, "y_{n+1} = y_n + h\\,y_n' + \\frac{h^{2}}{2!}\\,y_n''");
    assert.equal(trunc.heun.generic, "y_{n+1} = y_n + \\frac{h}{2!}\\Bigl[\\,y_n' + f\\bigl(x_{n+1},\\ y_n + h\\,y_n'\\bigr)\\Bigr]");
    assert.equal(trunc.rk2.generic, "y_{n+1} = y_n + h\\,f\\!\\left(x_n + \\frac{h}{2},\\ y_n + \\frac{k_1}{2}\\right), \\qquad k_1 = h\\,f(x_n, y_n)");
  });

  it('Taylor: the substitution is the one printed in Ejemplo 1, y1 = 1 + 0.1*[2*1*1] + ((0.1)^2/2!)[2*1 + 4*(1)^2*1]', () => {
    const [intro, where, replaced] = trunc.taylor.parts;
    assert.equal(intro.tex, "y_1 = y_0 + h\\,y_0' + \\frac{h^{2}}{2!}\\,y_0''");
    assert.equal(where.tex, "y_0' = f(x_0, y_0) = 2\\cdot 1\\cdot 1 = 2 \\qquad y_0'' = 2\\cdot 1 + 4\\cdot (1)^{2}\\cdot 1 = 6");
    assert.equal(replaced.tex, 'y_1 = 1 + 0.1\\cdot[2\\cdot 1\\cdot 1] + \\frac{(0.1)^{2}}{2!}\\cdot[2\\cdot 1 + 4\\cdot (1)^{2}\\cdot 1] = 1.23');
    assert.equal(trunc.taylor.parts.length, 3);
  });

  it('Euler Mejorado: prints y0\' apart and the predictor inline, as in Ejemplo 3 ("Donde: y0\' = ...")', () => {
    const [intro, where, predictor, replaced] = trunc.heun.parts;
    assert.equal(intro.tex, "y_1 = y_0 + \\frac{h}{2!}\\Bigl[\\,y_0' + f\\bigl(x_1,\\ y_0 + h\\,y_0'\\bigr)\\Bigr]");
    assert.equal(where.tex, "y_0' = f(x_0, y_0) = 2\\cdot 1\\cdot 1 = 2");
    assert.ok(predictor.say.includes('1 + 0.1\\cdot 2 = 1.2'), predictor.say);
    assert.equal(predictor.tex, 'f(x_1, 1.2) = 2\\cdot 1.1\\cdot 1.2 = 2.64');
    assert.equal(replaced.tex, "y_1 = 1 + \\frac{0.1}{2!}\\,[\\,2 + 2.64\\,] = 1.232");
    assert.equal(trunc.heun.parts.length, 4);
  });

  it('RK2: prints k1 apart with its factor h (k1 = 0.2) and the substitution of Ejemplo 4, 1 + 0.1*[2*(1 + 0.1/2)*(1 + 0.2/2)]', () => {
    const [intro, where, replaced] = trunc.rk2.parts;
    assert.equal(intro.tex, 'y_1 = y_0 + h\\,f\\!\\left(x_0 + \\frac{h}{2},\\ y_0 + \\frac{k_1}{2}\\right)');
    assert.equal(where.tex, 'k_1 = h\\cdot f(x_0, y_0) = 0.1\\cdot(2\\cdot 1\\cdot 1) \\;\\Rightarrow\\; k_1 = 0.2');
    assert.equal(replaced.tex, 'y_1 = 1 + 0.1\\cdot[2\\cdot (1 + 0.1/2)\\cdot (1 + 0.2/2)] = 1.231');
    assert.equal(trunc.rk2.parts.length, 3);
  });

  it('the intermediate values come from the engine: y0\' = 2, y0\'\' = 6, predictor 1.2, f(x1, predictor) = 2.64, k1 = 0.2', () => {
    const p = data.example();
    const taylor = methods.solve('taylor', p, { h: p.h, N: 1, order: 2 }).steps[0].detail;
    const heun = methods.solve('heun', p, { h: p.h, N: 1 }).steps[0].detail;
    const rk2 = methods.solve('rk2', p, { h: p.h, N: 1 }).steps[0].detail;
    near(taylor.derivs[0], 2, 1e-12);
    near(taylor.derivs[1], 6, 1e-12);
    near(heun.slope, 2, 1e-12);
    near(heun.yPred, 1.2, 1e-12);
    near(heun.slopeEnd, 2.64, 1e-12);
    near(rk2.k1, 0.2, 1e-12);
  });
});

/* ======================================================================================================
   Taylor of grade 2 to 4
   ====================================================================================================== */

describe('Taylor on the example: derivatives and degrees 2, 3 and 4', () => {
  const t = data.taylorExample();

  it('shows the hand derivation of the apunte, y\'\' = 2y + 4x^2 y, and the next derivatives of the total-derivative operator', () => {
    assert.equal(t.fTeX, '2xy');
    assert.equal(t.fxTeX, '2y');
    assert.equal(t.fyTeX, '2x');
    assert.equal(t.y2TeX, '2y + 4x^{2}y');
    assert.equal(t.y3TeX, '12xy + 8x^{3}y');
    assert.equal(t.y4TeX, '12y + 48x^{2}y + 16x^{4}y');
  });

  it('degrees 2, 3 and 4 give 1.23, 1.2333.. and 1.23365 after one step (Taylor series recomputed by hand)', () => {
    assert.deepEqual(t.degrees.map((d) => d.order), [2, 3, 4]);
    const [d2, d3, d4] = t.degrees;
    near(d2.y1, 1 + 0.2 + 0.03, 1e-12);
    near(d3.y1, 1 + 0.2 + 0.03 + (0.001 / 6) * 20, 1e-12);
    near(d4.y1, 1 + 0.2 + 0.03 + (0.001 / 6) * 20 + (0.0001 / 24) * 76, 1e-12);
  });

  it('the error falls with every degree (3.678e-3, 3.447e-4, 2.806e-5, each at least 10 times smaller) against e^0.21', () => {
    near(t.exact, Math.exp(0.21), 1e-15);
    near(t.exact, 1.233678, 5e-7);
    const [d2, d3, d4] = t.degrees;
    near(d2.error, 3.678e-3, 5e-7);
    near(d3.error, 3.447e-4, 5e-8);
    near(d4.error, 2.806e-5, 5e-9);
    assert.ok(d2.error > 10 * d3.error && d3.error > 10 * d4.error, `${d2.error} ${d3.error} ${d4.error}`);
    t.degrees.forEach((d) => near(d.error, Math.abs(t.exact - d.y1), 1e-15));
  });

  it('honours a different step', () => {
    const wide = data.taylorExample(0.2);
    assert.equal(wide.h, 0.2);
    near(wide.exact, Math.exp(1.2 ** 2 - 1), 1e-15);
    assert.ok(wide.degrees[0].error > t.degrees[0].error);
  });
});

/* ======================================================================================================
   Local error constants (section 5.7)
   ====================================================================================================== */

describe('constants of the one-step local error (section 5.7)', () => {
  const le = data.localErrors();
  const row = (id, from) => (from || le).rows.find((r) => r.id === id);

  it('F2 = 8, D = 6 and fy*D = 12 at (1, 1) for y\' = 2xy', () => {
    assert.deepEqual([le.F2, le.D, le.fyD], [8, 6, 12]);
    assert.deepEqual([le.problem.x0, le.problem.y0, le.h], [1, 1, 0.1]);
  });

  it('the constants are 10/3 (Taylor), 7/3 (RK2) and 4/3 (Euler Mejorado), the formulas of the document evaluated', () => {
    near(row('taylor').c, 10 / 3, 1e-12);
    near(row('rk2').c, 7 / 3, 1e-12);
    near(row('heun').c, 4 / 3, 1e-12);
    near(row('taylor').c, (le.F2 + le.fyD) / 6, 1e-12);
    near(row('rk2').c, le.F2 / 24 + le.fyD / 6, 1e-12);
    near(row('heun').c, -le.F2 / 12 + le.fyD / 6, 1e-12);
    assert.deepEqual(le.rows.map((r) => r.id), ['taylor', 'rk2', 'heun']);
  });

  it('a single step of h = 0.1 from (1, 1) misses e^0.21 by 3.678e-3, 2.678e-3 and 1.678e-3', () => {
    near(le.exact, 1.233678, 5e-7);
    near(row('taylor').measured, 3.678e-3, 5e-7);
    near(row('rk2').measured, 2.678e-3, 5e-7);
    near(row('heun').measured, 1.678e-3, 5e-7);
    le.rows.forEach((r) => near(r.measured, le.exact - r.y1, 1e-15, r.id));
  });

  it('the measured error is close to c*h^3 (a little above it) and the ratio tends to 1 as h goes to 0', () => {
    const ratios = [0.2, 0.1, 0.05, 0.025, 0.0125].map((h) => {
      const r = data.localErrors(h);
      return SECOND_ORDER.map((id) => row(id, r).measured / row(id, r).predicted);
    });
    ratios.forEach((r, k) => r.forEach((value, j) => {
      assert.ok(value > 1 && value < 1.6, `h level ${k}, ${SECOND_ORDER[j]}: ${value}`);
      if (k > 0) assert.ok(value < ratios[k - 1][j], `ratio must fall as h falls (${SECOND_ORDER[j]}, level ${k})`);
    }));
    ratios[4].forEach((value) => near(value, 1, 0.04));
    near(row('taylor').predicted, (10 / 3) * 0.1 ** 3, 1e-15);
  });

  it('Euler misses the same step by 3.368e-2, about 20 times the Euler Mejorado error (its local error is O(h^2))', () => {
    near(le.euler.measured, 3.368e-2, 5e-6);
    near(le.euler.measured / row('heun').measured, 20, 0.2);
  });

  it('the best of the three depends on the problem: Euler Mejorado on y\' = 2xy, RK2 on y\' = -3x^2 y', () => {
    const smallest = (c) => SECOND_ORDER.reduce((a, b) => (Math.abs(c[b]) < Math.abs(c[a]) ? b : a));
    const a = analysis.localErrorConstants(problems.fromPreset('cmp_2xy_13'), 1, 1);
    const b = analysis.localErrorConstants(problems.fromPreset('cmp_3x2y'), 0, 3);
    assert.equal(smallest(a), 'heun');
    assert.equal(smallest(b), 'rk2');
    near(b.F2, -18, 1e-12);
    near(b.fyD, 0, 1e-12);
    near(b.taylor, -3, 1e-12);
    near(b.rk2, -0.75, 1e-12);
    near(b.heun, 1.5, 1e-12);
  });
});

describe('the RK2 family of section 5.8 (kit.familyMember)', () => {
  const { Q, familyMember } = kitModule;

  it('rational() keeps lowest terms and a positive denominator, and rejects what is not an integer', () => {
    assert.deepEqual({ ...kitModule.rational(2, 4) }, { n: 1, d: 2 });
    assert.deepEqual({ ...kitModule.rational(3, -6) }, { n: -1, d: 2 });
    assert.deepEqual({ ...kitModule.rational(0, 7) }, { n: 0, d: 1 });
    assert.throws(() => kitModule.rational(1.5, 2), RangeError);
    assert.throws(() => kitModule.rational(1, 0), RangeError);
    assert.equal(Q.tex(Q.of(-1, 12)), '-\\frac{1}{12}');
    assert.equal(Q.tex(Q.of(4, 2)), '2');
  });

  it('meets the order conditions a1 + a2 = 1 and a2*p = a2*q = 1/2 for every a2 other than 0', () => {
    [Q.of(1, 2), Q.of(1, 1), Q.of(2, 3), Q.of(3, 4), Q.of(5, 4), Q.of(-1, 2)].forEach((a2) => {
      const m = familyMember(a2);
      assert.equal(Q.value(Q.add(m.a1, m.a2)), 1);
      near(Q.value(Q.mul(m.a2, m.p)), 0.5, 1e-15);
      near(Q.value(Q.mul(m.a2, m.q)), 0.5, 1e-15);
    });
    assert.throws(() => familyMember(Q.of(0, 1)), RangeError);
  });

  it('Euler Mejorado (a2 = 1/2, p = 1), punto medio (a2 = 1, p = 1/2) and Ralston (a2 = 2/3, p = 3/4) as in section 5.8', () => {
    const heun = familyMember(Q.of(1, 2));
    const mid = familyMember(Q.of(1, 1));
    const ralston = familyMember(Q.of(2, 3));
    assert.deepEqual([Q.tex(heun.a1), Q.tex(heun.p)], ['\\frac{1}{2}', '1']);
    assert.deepEqual([Q.tex(mid.a1), Q.tex(mid.p)], ['0', '\\frac{1}{2}']);
    assert.deepEqual([Q.tex(ralston.a1), Q.tex(ralston.a2), Q.tex(ralston.p)], ['\\frac{1}{3}', '\\frac{2}{3}', '\\frac{3}{4}']);
  });

  it('its F2 coefficient is the one of section 5.7 (1/24 for punto medio, -1/12 for Euler Mejorado) and vanishes at p = 2/3', () => {
    assert.equal(Q.tex(familyMember(Q.of(1, 1)).f2), '\\frac{1}{24}');
    assert.equal(Q.tex(familyMember(Q.of(1, 2)).f2), '-\\frac{1}{12}');
    assert.equal(Q.tex(familyMember(Q.of(3, 4)).f2), '0');
    assert.equal(Q.tex(familyMember(Q.of(2, 3)).f2), '-\\frac{1}{48}');
    assert.equal(Q.tex(familyMember(Q.of(1, 1)).fyd), '\\frac{1}{6}');
  });
});

/* ======================================================================================================
   Linear test problem, stability, convergence (section 5.7)
   ====================================================================================================== */

describe('linear problem y\' = lambda*y and stability', () => {
  it('Euler multiplies by 1 + z and the three methods of order 2 by 1 + z + z^2/2 (the same polynomial)', () => {
    const table = data.stabilityTable();
    assert.ok(table.length >= 5);
    table.forEach((row) => {
      near(row.euler, 1 + row.z, 1e-12, `Euler z=${row.z}`);
      SECOND_ORDER.forEach((id) => near(row[id], 1 + row.z + row.z ** 2 / 2, 1e-12, `${id} z=${row.z}`));
    });
  });

  it('|R(-2.5)| > 1 for the four methods, |R(-2)| = 1 at the edge and |R| < 1 inside the real interval [-2, 0]', () => {
    const at = (z) => data.stabilityTable([z])[0];
    ['euler', 'taylor', 'heun', 'rk2'].forEach((id) => {
      assert.ok(Math.abs(at(-2.5)[id]) > 1, `${id}: ${at(-2.5)[id]}`);
      assert.ok(Math.abs(at(-3)[id]) > 1, id);
      near(Math.abs(at(-2)[id]), 1, 1e-9, `${id} at the edge`);
      [-1.99, -1, -0.5, -0.2, -0.01].forEach((z) => assert.ok(Math.abs(at(z)[id]) < 1, `${id} z=${z}`));
      assert.ok(Math.abs(at(-2.01)[id]) > 1, `${id} just outside`);
    });
  });

  it('the default table lists -2 and -2.5, and a custom list is honoured with lambda = z/h and h = 0.1', () => {
    const zs = data.stabilityTable().map((row) => row.z);
    assert.ok(zs.includes(-2) && zs.includes(-2.5));
    const custom = data.stabilityTable([-0.5, -1.5]);
    assert.deepEqual(custom.map((row) => row.z), [-0.5, -1.5]);
    near(custom[1].euler, -0.5, 1e-12);
    near(custom[1].rk2, 1 - 1.5 + 1.125, 1e-12);
  });

  it('linearStep(lambda, h) is one step of every method: y1 = R(h*lambda)', () => {
    const s = data.linearStep(-20, 0.1);
    near(s.z, -2, 1e-12);
    near(s.euler, -1, 1e-12);
    SECOND_ORDER.forEach((id) => near(s[id], 1, 1e-12, id));
  });
});

describe('convergence by step halving on y\' = 2xy over [1, 1.5]', () => {
  const c = data.convergence();
  const ids = ['euler', 'taylor', 'heun', 'rk2'];

  it('starts with N = 10 and doubles it four times while h halves from 0.05', () => {
    assert.deepEqual(Array.from(c.Ns), [10, 20, 40, 80]);
    near(c.hs[0], 0.05, 1e-15);
    c.hs.forEach((h, k) => near(h, 0.5 / c.Ns[k], 1e-15));
    assert.equal(c.problem.id, 'cmp_2xy_15');
  });

  it('observed orders are within 0.15 of 1 for Euler and of 2 for Taylor, Euler Mejorado and RK2', () => {
    assert.ok(c.orders.euler.length >= 3);
    c.orders.euler.forEach((p) => near(p, 1, 0.15, 'Euler order'));
    SECOND_ORDER.forEach((id) => c.orders[id].forEach((p) => near(p, 2, 0.15, `${id} order`)));
  });

  it('the orders are log2 of consecutive error ratios, and every error falls with h', () => {
    ids.forEach((id) => {
      c.errors[id].forEach((e, k) => {
        assert.ok(e > 0, `${id} ${k}`);
        if (k > 0) assert.ok(e < c.errors[id][k - 1], `${id} falls at level ${k}`);
      });
      c.orders[id].forEach((p, k) => near(p, Math.log2(c.errors[id][k] / c.errors[id][k + 1]), 1e-9, `${id} ${k}`));
    });
  });

  it('at the finest step Euler Mejorado has the smallest error of the three and Taylor the largest, Euler far above them', () => {
    const last = c.hs.length - 1;
    const e = (id) => c.errors[id][last];
    assert.ok(e('heun') < e('rk2') && e('rk2') < e('taylor'), `${e('heun')} ${e('rk2')} ${e('taylor')}`);
    assert.ok(e('euler') > 100 * e('taylor'));
  });
});

/* ======================================================================================================
   Same PVI, four methods (section 5.6) and costs (section 5.7)
   ====================================================================================================== */

describe('comparison of the four methods at h = 0.1 (the table of section 5.6)', () => {
  const TABLE = [
    ['cmp_2xy_13', 1.3, { euler: '1.815360', taylor: '1.972761', rk2: '1.977951', heun: '1.983150', exact: '1.993716' }, 'heun'],
    ['cmp_2xy_15', 1.5, { euler: '2.927813', taylor: '3.418817', rk2: '3.434843', heun: '3.450929', exact: '3.490343' }, 'heun'],
    ['cmp_3x2y', 0.5, { euler: '2.737305', taylor: '2.657994', rk2: '2.649143', heun: '2.640502', exact: '2.647491' }, 'rk2'],
    ['cmp_quarter', 0.5, { euler: '1.278470', taylor: '1.287109', rk2: '1.287218', heun: '1.287328', exact: '1.287427' }, 'heun'],
  ];
  const rows = data.comparison();

  it('has the four cases of the document, in order, with h = 0.1', () => {
    assert.deepEqual(rows.map((r) => r.id), TABLE.map((t) => t[0]));
    assert.deepEqual(Array.from(data.COMPARISON_IDS), TABLE.map((t) => t[0]));
    rows.forEach((r, k) => {
      assert.equal(r.xf, TABLE[k][1]);
      assert.equal(r.problem.h, 0.1);
    });
  });

  it('every value equals the printed 6 decimals: Euler, Taylor-2, RK2 punto medio, Euler Mejorado and the exact solution', () => {
    rows.forEach((r, k) => {
      const [id, , printed] = TABLE[k];
      ['euler', 'taylor', 'rk2', 'heun'].forEach((m) => assert.equal(r.values[m].toFixed(6), printed[m], `${id} ${m}`));
      assert.equal(r.exact.toFixed(6), printed.exact, `${id} exact`);
    });
  });

  it('marks the closest of the three second-order methods: RK2 on -3x^2 y and Euler Mejorado on the other three', () => {
    assert.deepEqual(rows.map((r) => r.best), TABLE.map((t) => t[3]));
    rows.forEach((r) => {
      const err = (m) => Math.abs(r.values[m] - r.exact);
      SECOND_ORDER.forEach((m) => assert.ok(err(r.best) <= err(m), `${r.id}: ${r.best} vs ${m}`));
    });
    assert.ok(new Set(rows.map((r) => r.best)).size >= 2, 'there is no universal winner');
  });

  it('Taylor is the farthest of the three at every case, and Euler is the farthest overall', () => {
    rows.forEach((r) => {
      const err = (m) => Math.abs(r.values[m] - r.exact);
      assert.ok(err('taylor') > err('heun') && err('taylor') > err('rk2'), r.id);
      assert.ok(err('euler') > err('taylor'), r.id);
    });
  });
});

describe('cost and order of each method', () => {
  it('costs() is 1 (Euler), 2 (Euler Mejorado), 2 (RK2) and 3, 6, 10 for Taylor of degree 2, 3, 4', () => {
    const c = data.costs();
    assert.deepEqual([c.euler.total, c.heun.total, c.rk2.total], [1, 2, 2]);
    assert.deepEqual([c.taylor2.total, c.taylor3.total, c.taylor4.total], [3, 6, 10]);
    assert.deepEqual([c.taylor2, c.taylor3, c.taylor4].map((x) => x.f), [1, 1, 1]);
    assert.deepEqual([c.taylor2, c.taylor3, c.taylor4].map((x) => x.deriv), [2, 5, 9]);
    assert.deepEqual([c.euler.deriv, c.heun.deriv, c.rk2.deriv], [0, 0, 0]);
    [2, 3, 4].forEach((p) => assert.equal(c[`taylor${p}`].total, (p * (p + 1)) / 2));
  });

  it('orders() is 1 for Euler and 2 for Taylor, Euler Mejorado and RK2', () => {
    assert.deepEqual({ ...data.orders() }, { euler: 1, taylor: 2, heun: 2, rk2: 2 });
  });

  it('all() gathers every table of the page', () => {
    const all = data.all('trunc');
    ['taylor', 'firstStep', 'localErrors', 'stability', 'convergence', 'comparison', 'costs', 'orders']
      .forEach((key) => assert.ok(all[key] !== undefined, key));
    assert.equal(all.comparison.length, 4);
  });
});

/* ======================================================================================================
   TeX of the data module and the errata of the handout
   ====================================================================================================== */

describe('TeX produced by the data module', () => {
  /** Every TeX string of the first iterations in both display modes, plus the math inside their sentences. */
  function texOfFirstSteps() {
    const out = [];
    ['trunc', 'round'].forEach((mode) => {
      const first = data.firstStep(mode);
      ['taylor', 'heun', 'rk2'].forEach((id) => {
        const entry = first[id];
        out.push(entry.generic, entry.y1TeX);
        entry.parts.forEach((part) => {
          if (part.tex) out.push(part.tex);
          (part.say.match(/\$[^$]+\$/g) || []).forEach((m) => out.push(m.slice(1, -1)));
        });
      });
    });
    return out;
  }

  it('has balanced braces, \\left/\\right and \\begin/\\end in every string, and no invalid text', () => {
    const t = data.taylorExample();
    const all = [...texOfFirstSteps(), t.fTeX, t.fxTeX, t.fyTeX, t.y2TeX, t.y3TeX, t.y4TeX, t.problem.exact.tex];
    data.COMPARISON_IDS.forEach((id) => all.push(expr.toTeX(problems.fromPreset(id).fNode, { indep: 'x' })));
    assert.ok(all.length > 30);
    all.forEach((tex) => {
      assert.ok(balanced(tex), `unbalanced: ${tex}`);
      assert.ok(!/undefined|NaN|Infinity|\[object/.test(tex), `invalid text: ${tex}`);
      assert.ok(tex.trim() !== '', 'empty TeX');
    });
  });

  it('the balance check itself notices a missing or extra brace', () => {
    assert.ok(balanced('\\frac{a}{b}'));
    assert.ok(!balanced('\\frac{a}{b'));
    assert.ok(!balanced('a}{b'));
    assert.ok(!balanced('\\left( x'));
    assert.ok(balanced('\\{ x \\}'));
  });
});

describe('the printed errata of the handout never reach the page (section 5.4)', () => {
  const ERRATA = ['1.4297', '1.4843'];

  /** Visits every number and string of a data tree (functions skipped, cycles safe). */
  function visit(value, onLeaf, seen = new WeakSet()) {
    if (typeof value === 'number' || typeof value === 'string') onLeaf(value);
    else if (value && typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
      Object.keys(value).forEach((key) => visit(value[key], onLeaf, seen));
    }
  }

  it('no number within 5e-5 of them and no string containing them is produced, in either display mode', () => {
    ['trunc', 'round'].forEach((mode) => {
      let leaves = 0;
      visit(data.all(mode), (leaf) => {
        leaves += 1;
        if (typeof leaf === 'number') ERRATA.forEach((e) => assert.ok(!(Math.abs(leaf - Number(e)) < 5e-5), `${leaf} is too close to ${e}`));
        else ERRATA.forEach((e) => assert.ok(!leaf.includes(e), `"${leaf.slice(0, 60)}" contains ${e}`));
      });
      assert.ok(leaves > 200, `only ${leaves} leaves were visited`);
    });
  });

  it('the text of the ten sections does not contain them, in either display mode', () => {
    ['trunc', 'round'].forEach((mode) => buildAll(mode).elements.forEach(({ spec, el }) => {
      const text = joinedText(el);
      ERRATA.forEach((e) => assert.ok(!text.includes(e), `${spec.id} (${mode}) contains ${e}`));
    }));
  });

  it('the page sources do not contain them either', () => {
    ['theory.js', path.join('theory', 'data.js'), path.join('theory', 'kit.js'), path.join('theory', 'sections-a.js'),
      path.join('theory', 'sections-b.js'), path.join('theory', 'sections-c.js')].forEach((file) => {
      const source = read('js', 'ui', 'pages', file);
      ERRATA.forEach((e) => assert.ok(!source.includes(e), `${file} contains ${e}`));
    });
  });

  it('the correct values of the two examples are 1.0429781 (Ej. 2) and 1.390625 (Ej. 3)', () => {
    // the oracles that replace the printed ones (the page does not show these two exercises, Ejercicios does)
    near(methods.solve('euler', problems.fromPreset('a2')).ys[2], 1.0429781, 5e-8);
    near(methods.solve('heun', problems.fromPreset('a3')).ys[2], 1.390625, 1e-12);
  });
});

/* ======================================================================================================
   The ten sections, built with a stand-in DOM
   ====================================================================================================== */

/** A DOM stand-in with the signature of EDO.dom.h: elements are plain objects, text children stay strings. */
function makeH() {
  const flatten = (list) => list.flatMap((child) => (Array.isArray(child) ? flatten(child) : [child]))
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true);
  return (tag, ...rest) => {
    const first = rest[0];
    const hasAttrs = first && typeof first === 'object' && !first.nodeType && !Array.isArray(first);
    const el = {
      nodeType: 1,
      tag,
      attrs: hasAttrs ? first : {},
      children: flatten(hasAttrs ? rest.slice(1) : (first === null || first === undefined ? rest.slice(1) : rest)),
      checked: false,
    };
    el.replaceChildren = (...nodes) => { el.children = flatten(nodes); };
    return el;
  };
}

/** The environment theory.js hands to the section builders, with the display mode fixed to `mode`. */
function makeEnv(mode) {
  const h = makeH();
  const diagrams = [];
  const displayHandlers = [];
  const env = {
    h,
    kit: kitModule.makeKit(h, format),
    data,
    expr,
    format,
    problems,
    methods,
    analysis,
    uid: (prefix) => `${prefix}-1`,
    hydrate: () => {},
    diagram(opts, label) {
      const host = h('div', {
        class: 'theory-diagram', role: 'group', 'aria-label': label, 'data-methods': opts.methods,
      });
      diagrams.push({ host, opts });
      return host;
    },
    displayMode: () => mode,
    setDisplayMode: () => {},
    onDisplay: (fn) => { displayHandlers.push(fn); },
  };
  return { env, diagrams, displayHandlers };
}

function buildAll(mode) {
  const built = makeEnv(mode);
  const order = kitModule.SECTION_ORDER;
  const specs = sections.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  built.elements = specs.map((spec) => ({ spec, el: spec.build(built.env) }));
  return built;
}

function walk(node, visitor) {
  visitor(node);
  if (node && typeof node === 'object' && node.children) node.children.forEach((child) => walk(child, visitor));
}
const textNodes = (node) => {
  const out = [];
  walk(node, (n) => { if (typeof n === 'string' || typeof n === 'number') out.push(String(n)); });
  return out;
};
const elementsOf = (node, predicate) => {
  const out = [];
  walk(node, (n) => { if (n && typeof n === 'object' && n.tag && predicate(n)) out.push(n); });
  return out;
};
const hasClass = (el, name) => String((el.attrs && el.attrs.class) || '').split(/\s+/).includes(name);
const joinedText = (node) => textNodes(node).join('');

/** The delimiter scanner of the page (EDO.tex.splitMath), loaded the way the browser loads tex.js. */
const splitMath = (() => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('js', 'ui', 'tex.js'), sandbox, { filename: 'tex.js' });
  return sandbox.EDO.tex.splitMath;
})();

describe('the seven sections of the page', () => {
  const built = buildAll('trunc');
  const byId = new Map(built.elements.map(({ spec, el }) => [spec.id, el]));

  it('are the seven of the recap, in reading order, each a <section id="teoria-<slug>"> with its title', () => {
    assert.deepEqual(built.elements.map((x) => x.spec.id), ['pvi', 'receta', 'taylor', 'heun', 'rk2', 'familia', 'glosario']);
    assert.deepEqual(Array.from(kitModule.SECTION_ORDER), built.elements.map((x) => x.spec.id));
    assert.equal(new Set(sections.map((s) => s.id)).size, sections.length, 'no section id is registered twice');
    built.elements.forEach(({ spec, el }) => {
      assert.equal(el.tag, 'section');
      assert.equal(el.attrs.id, `teoria-${spec.id}`);
      assert.equal(el.attrs['aria-labelledby'], `teoria-${spec.id}-title`);
      const [heading] = elementsOf(el, (n) => n.tag === 'h2');
      assert.equal(heading.attrs.id, `teoria-${spec.id}-title`);
      assert.equal(joinedText(heading), spec.title);
      assert.ok(spec.toc && spec.toc.length > 0, `${spec.id} has a contents entry`);
    });
  });

  it('keep the apunte apart from the additions: no whole section is an Ampliación any more, the three methods carry "Del apunte"', () => {
    // The two sections that were wholly beyond the apunte (error and costo) are now part of the Comparativa.
    assert.deepEqual(sections.filter((s) => s.extension).map((s) => s.id), []);
    ['pvi', 'taylor', 'familia'].forEach((id) => {
      const badges = elementsOf(byId.get(id), (n) => hasClass(n, 'badge')).map(joinedText);
      assert.ok(badges.includes('Ampliación'), `${id} labels what goes beyond the apunte`);
      const extensions = elementsOf(byId.get(id), (n) => n.attrs && n.attrs['data-kind'] === 'extension');
      assert.ok(extensions.length >= 1, id);
    });
    ['taylor', 'heun', 'rk2'].forEach((id) => {
      const badges = elementsOf(byId.get(id), (n) => hasClass(n, 'badge')).map(joinedText);
      assert.ok(badges.includes('Del apunte'), `${id} marks the Ordenada Genérica as the apunte's`);
      assert.equal(elementsOf(byId.get(id), (n) => hasClass(n, 'formula') && hasClass(n, 'hl')).length, 1, `${id} highlights one formula`);
    });
  });

  it('no longer carry the comparative sections: error, costo and the comparative summary are gone', () => {
    const ids = new Set(sections.map((s) => s.id));
    ['error', 'costo', 'resumen'].forEach((id) => assert.ok(!ids.has(id), `${id} must not be a section of Teoría`));
    assert.ok(!Array.from(kitModule.SECTION_ORDER).some((slug) => ['error', 'costo', 'resumen'].includes(slug)));
    const titles = built.elements.flatMap(({ el }) => elementsOf(el, (n) => /^h[234]$/.test(n.tag)).map(joinedText));
    ['Error y orden', 'Costo computacional', 'Resumen comparativo'].forEach((title) => {
      assert.ok(!titles.includes(title), `"${title}" belongs to the Comparativa`);
    });
  });

  it('carry no decision guide: "¿Cuál elegir" lives only on the Comparativa, and Teoría links to it', () => {
    built.elements.forEach(({ spec, el }) => {
      assert.ok(!joinedText(el).includes('¿Cuál elegir'), `${spec.id} must not repeat the decision guide`);
    });
    const hrefs = built.elements.flatMap(({ el }) => elementsOf(el, (n) => n.tag === 'a').map((a) => a.attrs.href));
    assert.ok(hrefs.some((href) => href.startsWith('#/comparativa')), 'Teoría points at the Comparativa');
  });

  it('frame Euler as the baseline in the PVI section, with the halving factors the engine computes', () => {
    const [result] = elementsOf(byId.get('pvi'), (n) => n.attrs && n.attrs['data-kind'] === 'result');
    assert.ok(result, 'the PVI section carries a result callout');
    const text = joinedText(result);
    assert.match(text, /Euler no es un cuarto método: es la línea de base/);
    assert.match(text, /predictor de Euler Mejorado/);
    assert.match(text, /y_n \+ h\\,y_n'/);
    assert.match(text, /k_1 = h\\,f\(x_n, y_n\)/);
    assert.match(text, /Taylor de grado 2 es Euler más el término cuadrático/);
    assert.match(text, /Euler es Taylor de grado 1/);
    // "halving h divides Euler's error by 2 and the others' by 4": 2^1 and 2^2, from data.orders().
    const orders = data.orders();
    assert.deepEqual([orders.euler, orders.taylor], [1, 2]);
    assert.ok(text.includes(`por unas ${2 ** orders.euler} veces`), text);
    assert.ok(text.includes(`por unas ${2 ** orders.taylor}`), text);
    // The site still has no Euler section of its own: Euler is a statement, not a topic.
    const headings = built.elements.flatMap(({ el }) => elementsOf(el, (n) => /^h[1234]$/.test(n.tag)).map(joinedText));
    headings.forEach((title) => assert.ok(!/^Euler\b/.test(title) || title.startsWith('Euler Mejorado'), title));
  });

  it('open each method with "Lo esencial" and keep its derivation folded (the page is a recap)', () => {
    ['taylor', 'heun', 'rk2'].forEach((id) => {
      const el = byId.get(id);
      const labels = elementsOf(el, (n) => hasClass(n, 'callout__label')).map(joinedText);
      assert.ok(labels.includes('Lo esencial'), `${id} opens with the fast path`);
      const folds = elementsOf(el, (n) => hasClass(n, 'theory-fold'));
      assert.ok(folds.length >= 1, `${id} folds its derivation`);
      folds.forEach((fold) => {
        assert.equal(fold.tag, 'details');
        assert.ok(!fold.attrs.open, `${id}: the fold starts closed`);
        assert.ok(joinedText(elementsOf(fold, (n) => n.tag === 'summary')[0]).length > 10, id);
      });
      const text = joinedText(el);
      assert.match(text, /Qué necesita/, id);
      assert.match(text, /Costo por paso/, id);
      assert.match(text, /Error global/, id);
    });
  });

  it('keep one sentence about the family, with the weights computed, and link to where it is proved', () => {
    const text = joinedText(byId.get('familia'));
    assert.match(text, /dos casos de una misma familia/);
    // The weights are printed from the family parametrization, not typed in the prose.
    assert.match(text, /a_1 = a_2 = \\frac\{1\}\{2\}/);
    assert.match(text, /a_1 = 0/);
    // The thesis callout and the derivation of the order conditions live on the Comparativa.
    assert.ok(!text.includes('El punto de la comparación'), 'the comparison thesis belongs to the Comparativa');
    const hrefs = elementsOf(byId.get('familia'), (n) => n.tag === 'a').map((a) => a.attrs.href);
    assert.ok(hrefs.includes('#/comparativa/constantes'), hrefs.join(' '));
    // the nomenclature stays: it is what a reader needs to read any table of the site
    assert.match(text, /Nomenclatura/);
    assert.match(text, /identificar cada método por su fórmula/);
  });

  it('mount four "El paso" diagrams, one per method: the one with the three together moved to the Comparativa', () => {
    assert.deepEqual(built.diagrams.map((d) => d.opts.methods), ['euler', 'taylor', 'heun', 'rk2']);
    built.diagrams.forEach((d) => assert.ok(d.host.attrs['aria-label'].startsWith('Diagrama de un paso')));
  });

  it('close every math delimiter, and every formula has balanced braces and no raw TeX outside the delimiters', () => {
    let formulas = 0;
    built.elements.forEach(({ spec, el }) => {
      textNodes(el).forEach((text) => {
        splitMath(text).forEach((part) => {
          if (part.type === 'math') {
            formulas += 1;
            assert.ok(part.value.trim() !== '', `${spec.id}: empty formula in "${text.slice(0, 60)}"`);
            assert.ok(balanced(part.value), `${spec.id}: unbalanced TeX ${part.value}`);
            assert.ok(!/undefined|NaN|Infinity|\[object/.test(part.value), `${spec.id}: invalid text in ${part.value}`);
          } else {
            assert.ok(!/[$\\]/.test(part.value), `${spec.id}: stray delimiter or raw TeX in "${part.value.slice(0, 80)}"`);
          }
        });
      });
    });
    assert.ok(formulas > 200, `only ${formulas} formulas`);
  });

  it('show no invalid text (undefined, NaN, Infinity, [object ...]) anywhere', () => {
    built.elements.forEach(({ spec, el }) => {
      const text = joinedText(el);
      assert.ok(!/undefined|NaN|Infinity|\[object/.test(text), `${spec.id}: ${(text.match(/.{20}(undefined|NaN|Infinity|\[object).{20}/) || [''])[0]}`);
    });
  });

  it('link only to sections of this page and to pages the router knows', () => {
    const slugs = new Set(kitModule.SECTION_ORDER);
    let links = 0;
    built.elements.forEach(({ spec, el }) => {
      elementsOf(el, (n) => n.tag === 'a').forEach((a) => {
        links += 1;
        const href = a.attrs.href;
        const match = /^#\/([^/]+)(?:\/(.+))?$/.exec(href);
        assert.ok(match, `${spec.id}: ${href}`);
        assert.ok(route.PAGES.includes(match[1]), `${spec.id}: unknown page in ${href}`);
        if (match[1] === 'teoria') assert.ok(slugs.has(match[2]), `${spec.id}: no section for ${href}`);
      });
    });
    assert.ok(links >= 10, `${links} links`);
  });

  it('read as neutral professional Spanish: no voseo, no regional words, no missing accents', () => {
    const VOSEO = /(?<!\p{L})(?:vos|tenés|podés|querés|sabés|hacés|decís|mirá|fijate|elegí|ingresá|usá|probá|escribí|derivá|calculá|reemplazá|resolvé|anotá|vení|acá)(?!\p{L})/iu;
    const REGIONAL = /(?<!\p{L})(?:chic[oa]s?|achic\p{L}*|nomás|recién|ahorita|che)(?!\p{L})/iu;
    const NO_ACCENT = /(?<!\p{L})(?:\p{L}*(?:ci|si)on|teoria|metodos?|numerica|numerico|numericos|numericas|grafico|grafica|analisis|tambien|ademas|util|facil|dificil|unico|unica|algun|segun)(?!\p{L})/iu;
    built.elements.forEach(({ spec, el }) => {
      textNodes(el).forEach((text) => splitMath(text).filter((part) => part.type === 'text').forEach((part) => {
        [[VOSEO, 'voseo'], [REGIONAL, 'regional word'], [NO_ACCENT, 'missing accent']].forEach(([re, what]) => {
          const found = re.exec(part.value);
          assert.ok(!found, `${spec.id}: ${what} "${found && found[0]}" in "${part.value.slice(0, 80)}"`);
        });
      }));
    });
  });

  it('carry only the tables a recap needs: the eleven comparative ones moved to the Comparativa', () => {
    const tables = built.elements.flatMap(({ spec, el }) => elementsOf(el, (n) => n.tag === 'table').map(() => spec.id));
    assert.equal(tables.length, 0, `Teoría still prints a table in ${tables.join(', ')}`);
  });

  it('keep the data module that the Comparativa now reads: the constants, the stability scan and the four cases', () => {
    // Teoría no longer prints these, but the pure module still computes them and compare/model.js uses it.
    const le = data.localErrors();
    assert.deepEqual([le.F2, le.D, le.fyD], [8, 6, 12]);
    assert.ok(data.stabilityTable().some((row) => row.z === -2));
    assert.equal(data.comparison().length, 4);
  });
});

describe('the Receta and its display setting', () => {
  const marks = (host) => elementsOf(host, (n) => n.tag === 'mark').map(joinedText);

  it('comes second, right after the PVI and before every method section', () => {
    const order = Array.from(kitModule.SECTION_ORDER);
    assert.equal(order[1], 'receta');
    ['taylor', 'heun', 'rk2'].forEach((id) => {
      assert.ok(order.indexOf('receta') < order.indexOf(id), `receta must come before ${id}`);
    });
    assert.ok(order.indexOf('pvi') < order.indexOf('receta'));
  });

  it('states, per method, the Ordenada Genérica and the order of the operations to apply it by hand', () => {
    const { elements } = buildAll('trunc');
    const receta = elements.find((x) => x.spec.id === 'receta').el;
    const blocks = elementsOf(receta, (n) => n.tag === 'article');
    assert.deepEqual(blocks.map((b) => b.attrs['data-method']), ['taylor', 'heun', 'rk2']);
    const generics = data.firstStep('trunc');
    blocks.forEach((block) => {
      const id = block.attrs['data-method'];
      // the Ordenada Genérica, highlighted as the apunte highlights it
      const [highlighted] = elementsOf(block, (n) => hasClass(n, 'formula') && hasClass(n, 'hl'));
      assert.ok(highlighted, `${id} prints its Ordenada Genérica`);
      assert.equal(joinedText(highlighted), `$$${generics[id].generic}$$`);
      // and the ordered list of the operations of one iteration
      const [ops] = elementsOf(block, (n) => n.tag === 'ol' && hasClass(n, 'theory-recipe--ops'));
      assert.ok(ops, `${id} lists the order of its operations`);
      assert.ok(elementsOf(ops, (n) => n.tag === 'li').length >= 3, `${id} has at least three operations`);
    });
    const text = joinedText(receta);
    assert.match(text, /Orden de las operaciones de cada iteración/);
    // each method's own operations, not a generic recipe repeated three times
    assert.match(text, /Pendiente al inicio/);
    assert.match(text, /Predictor \(un paso de Euler\)/);
    assert.match(text, /Armar el punto medio/);
    assert.match(text, /Derivar \$f\$ una sola vez, antes de iterar/);
  });

  it('writes y1 and y3 of each method truncated to 4 decimals, as the apunte does (1.9727, 1.9831, 1.9779)', () => {
    const { elements } = buildAll('trunc');
    const receta = elements.find((x) => x.spec.id === 'receta').el;
    const [host] = elementsOf(receta, (n) => hasClass(n, 'theory-steps'));
    assert.deepEqual(marks(host), [
      '$y_1 = 1.23 = y(x_1) = y(1.1)$', '$y_3 = 1.9727 = y(x_3) = y(1.3)$',
      '$y_1 = 1.232 = y(x_1) = y(1.1)$', '$y_3 = 1.9831 = y(x_3) = y(1.3)$',
      '$y_1 = 1.231 = y(x_1) = y(1.1)$', '$y_3 = 1.9779 = y(x_3) = y(1.3)$',
    ]);
    assert.deepEqual(elementsOf(host, (n) => n.tag === 'article').map((a) => a.attrs['data-method']), ['taylor', 'heun', 'rk2']);
  });

  it('rounds them in the other mode (1.9728, 1.9832, 1.978), and the exact y3 would be 1.9937', () => {
    const { elements } = buildAll('round');
    const receta = elements.find((x) => x.spec.id === 'receta').el;
    const [host] = elementsOf(receta, (n) => hasClass(n, 'theory-steps'));
    assert.deepEqual(marks(host).filter((m) => m.startsWith('$y_3')), [
      '$y_3 = 1.9728 = y(x_3) = y(1.3)$', '$y_3 = 1.9832 = y(x_3) = y(1.3)$', '$y_3 = 1.978 = y(x_3) = y(1.3)$',
    ]);
    near(problems.fromPreset('a1').exact.fn(1.3), 1.993716, 5e-7);
  });

  it('rebuilds the three blocks when the display handler fires, and keeps the radio buttons in step', () => {
    const { elements, displayHandlers } = buildAll('trunc');
    const receta = elements.find((x) => x.spec.id === 'receta').el;
    const [host] = elementsOf(receta, (n) => hasClass(n, 'theory-steps'));
    const radios = elementsOf(receta, (n) => n.tag === 'input' && n.attrs.type === 'radio');
    assert.deepEqual(radios.map((r) => r.attrs.value), ['trunc', 'round']);
    assert.deepEqual(radios.map((r) => r.checked), [true, false]);
    assert.equal(displayHandlers.length, 1);
    displayHandlers[0]('round');
    assert.deepEqual(marks(host).filter((m) => m.startsWith('$y_3')), [
      '$y_3 = 1.9728 = y(x_3) = y(1.3)$', '$y_3 = 1.9832 = y(x_3) = y(1.3)$', '$y_3 = 1.978 = y(x_3) = y(1.3)$',
    ]);
    assert.deepEqual(radios.map((r) => r.checked), [false, true]);
    assert.equal(elementsOf(host, (n) => n.tag === 'article').length, 3);
    displayHandlers[0]('trunc');
    assert.ok(marks(host).includes('$y_3 = 1.9727 = y(x_3) = y(1.3)$'));
  });

  it('explains the truncation with the numbers of section 5.3: 1.9727613 is written 1.9727 (it would round to 1.9728)', () => {
    const { elements } = buildAll('trunc');
    const text = joinedText(elements.find((x) => x.spec.id === 'receta').el);
    assert.ok(text.includes('1.9727613'));
    assert.ok(text.includes('se escribe 1.9727 (redondeado sería 1.9728)'));
  });

  it('shows the first value of each method in the sentence above the blocks (1.23, 1.232, 1.231)', () => {
    const { elements } = buildAll('trunc');
    const text = joinedText(elements.find((x) => x.spec.id === 'receta').el);
    assert.ok(text.includes('1.23 (Taylor), 1.232 (Euler Mejorado) y 1.231 (RK2)'));
  });
});

/* ======================================================================================================
   Module integrity
   ====================================================================================================== */

describe('how the theory modules are loaded and written', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
  /** Source without block comments and full-line // comments (they may legitimately mention forbidden words). */
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const FILES = ['theory.js', path.join('theory', 'data.js'), path.join('theory', 'kit.js'), path.join('theory', 'sections-a.js'),
    path.join('theory', 'sections-b.js'), path.join('theory', 'sections-c.js')];

  it('index.html loads data, kit, the three section files and then theory.js, after the numerics and before start.js', () => {
    const chain = ['js/ui/pages/theory/data.js', 'js/ui/pages/theory/kit.js', 'js/ui/pages/theory/sections-a.js',
      'js/ui/pages/theory/sections-b.js', 'js/ui/pages/theory/sections-c.js', 'js/ui/pages/theory.js'];
    chain.forEach((file, i) => {
      assert.ok(scripts.includes(file), `${file} is loaded`);
      if (i > 0) assert.ok(scripts.indexOf(file) > scripts.indexOf(chain[i - 1]), `${file} comes after ${chain[i - 1]}`);
    });
    assert.ok(scripts.indexOf(chain[0]) > scripts.indexOf('js/numerics/analysis.js'));
    assert.ok(scripts.indexOf(chain[0]) > scripts.indexOf('js/ui/app.js'));
    assert.ok(scripts.indexOf(chain[5]) < scripts.indexOf('js/ui/start.js'));
  });

  it('the section files register themselves in EDO.theory.sections when loaded as classic scripts', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    ['kit.js', 'sections-a.js', 'sections-b.js', 'sections-c.js'].forEach((file) => {
      vm.runInContext(read('js', 'ui', 'pages', 'theory', file), sandbox, { filename: file });
    });
    // Array.from: arrays made inside the vm context have another prototype than the ones of this realm
    assert.deepEqual(Array.from(sandbox.EDO.theory.sections, (s) => s.id).sort(), Array.from(kitModule.SECTION_ORDER).sort());
    assert.equal(typeof sandbox.EDO.theory.kit.makeKit, 'function');
  });

  it('never evaluates strings or writes markup: no eval, new Function or innerHTML in the page code', () => {
    FILES.forEach((file) => {
      const source = code(read('js', 'ui', 'pages', file));
      assert.doesNotMatch(source, /\beval\s*\(|new\s+Function|\.innerHTML|insertAdjacentHTML|document\.write/, file);
    });
  });
});
