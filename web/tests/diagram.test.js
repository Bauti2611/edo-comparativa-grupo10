'use strict';
/**
 * "El paso" (js/ui/step-diagram.js): the pure model and readout against the oracles of the ODD document
 * (sections 5.4-5.7), the geometry of each construction, the fixed frame, the spreading of the value labels,
 * the Chart.js plugin drawn on a recording canvas, and the datasets and options with a stub of EDO.charts.
 * `mount()` needs a DOM: it is covered by the browser QA. The last block guards the verbatim course strings
 * of the Fuentes page (section 5.9) and the script order of index.html.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  WEB_ROOT, load, near, prng, between,
} = require('./helpers.js');

const sd = require(path.join(WEB_ROOT, 'js', 'ui', 'step-diagram.js'));
const P = load('problems');
const M = load('methods');
const A = load('analysis');
const E = load('expr');

const ALL = ['euler', 'taylor', 'heun', 'rk2'];
const read = (...parts) => fs.readFileSync(path.join(WEB_ROOT, ...parts), 'utf8');
/** Source without block comments and full-line // comments (they may legitimately mention forbidden words). */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A stand-in for EDO.charts.methodStyle with the same shapes as charts.js (colours are only labels here). */
const SHAPES = {
  euler: 'rect', taylor: 'circle', heun: 'triangle', rk2: 'rectRot', exact: 'line',
};
const stubCharts = {
  methodStyle: (id) => ({
    id, color: `#${id}`, dash: id === 'exact' ? [] : [4, 3], pointStyle: SHAPES[id], width: id === 'exact' ? 1.5 : 2.25, radius: 4, order: id === 'exact' ? 0 : 2,
  }),
};

describe('module', () => {
  it('requires in Node without a DOM and exposes the documented API', () => {
    ['IDS', 'LABELS', 'DEFAULTS', 'model', 'readout', 'stepAt', 'frameFor', 'valueText', 'errorText', 'mount', 'plugin', 'buildDatasets', 'chartOptions', 'spreadLabels']
      .forEach((name) => assert.ok(name in sd, name));
    assert.deepEqual(Array.from(sd.IDS), ALL);
    assert.equal(typeof sd.mount, 'function');
  });

  it('mount() fails with a clear message instead of a TypeError when there is no browser', () => {
    assert.throws(() => sd.mount({}), /necesita un navegador/);
  });
});

describe('one step on y\' = 2xy from (1, 1): the oracles of sections 5.4-5.7', () => {
  const at = (h) => sd.model({ h });

  it('h = 0.1: Euler, Taylor-2, RK2 and Euler Mejorado give 1.2, 1.23, 1.231 and 1.232', () => {
    const m = at(0.1);
    near(m.methods.euler.y1, 1.2, 1e-12);
    near(m.methods.taylor.y1, 1.23, 1e-12);
    near(m.methods.rk2.y1, 1.231, 1e-12);
    near(m.methods.heun.y1, 1.232, 1e-12);
    near(m.exact, Math.exp(0.21), 1e-15);
    near(m.exact, 1.233678, 5e-7);
    assert.equal(m.reference, false);
  });

  it('h = 0.3: they give 1.6, 1.87, 1.897 and 1.924 and the exact value is e^0.69 = 1.99372', () => {
    const m = at(0.3);
    near(m.methods.euler.y1, 1.6, 1e-12);
    near(m.methods.taylor.y1, 1.87, 1e-12);
    near(m.methods.rk2.y1, 1.897, 1e-12);
    near(m.methods.heun.y1, 1.924, 1e-12);
    near(m.exact, 1.99372, 5e-6);
    near(m.exact, Math.exp(0.69), 1e-15);
    near(m.x1, 1.3, 1e-15);
  });

  it('the error of a method is |y_{n+1} - exact|', () => {
    const m = at(0.3);
    ALL.forEach((id) => near(m.methods[id].error, Math.abs(m.methods[id].y1 - m.exact), 1e-15, id));
  });

  it('single-step errors at h = 0.1 are 3.678e-3, 2.678e-3 and 1.678e-3 (Taylor, RK2, Euler Mejorado)', () => {
    const m = at(0.1);
    near(m.methods.taylor.error, 3.678e-3, 5e-7);
    near(m.methods.rk2.error, 2.678e-3, 5e-7);
    near(m.methods.heun.error, 1.678e-3, 5e-7);
    assert.ok(m.methods.taylor.error > m.methods.rk2.error && m.methods.rk2.error > m.methods.heun.error);
  });

  it('as h shrinks, error / h^3 tends to the constants 10/3, 7/3 and 4/3 of the ODD document', () => {
    const h = 0.002;
    const m = sd.model({ h, hMin: 0.001 }); // below the slider's own minimum, so widen the range
    assert.equal(m.h, h);
    const c = A.localErrorConstants(P.fromPreset('cmp_2xy_13'), 1, 1);
    [['taylor', 10 / 3], ['rk2', 7 / 3], ['heun', 4 / 3]].forEach(([id, expected]) => {
      const ratio = m.methods[id].error / h ** 3;
      near(c[id], expected, 1e-9, `constant of ${id}`);
      assert.ok(Math.abs(ratio - expected) / expected < 0.01, `${id}: error / h^3 = ${ratio}, expected about ${expected}`);
    });
  });

  it('every number is the engine\'s own: y_{n+1} equals methods.solve(..., {h, N: 1}) for several problems and steps', () => {
    ['cmp_2xy_13', 'cmp_3x2y', 'cmp_quarter', 'p5_1d', 'p5_2c', 'ex_linear'].forEach((id) => {
      [0.05, 0.25, 0.5].forEach((h) => {
        const m = sd.model({ problem: id, h });
        const p = P.fromPreset(id);
        const base = P.make({ id: p.id, indep: p.indep, fStr: p.fStr, x0: p.x0, y0: p.y0, xf: p.x0 + h, h, exact: p.exact });
        ALL.forEach((method) => {
          near(m.methods[method].y1, M.solve(method, base, { h, N: 1 }).steps[0].yn1, 1e-15, `${id} ${method} h=${h}`);
        });
      });
    });
  });
});

describe('geometry of the constructions', () => {
  const f = (x, y) => 2 * x * y;
  const m = sd.model({ h: 0.3 });
  const slopeOf = (seg) => (seg[1].y - seg[0].y) / (seg[1].x - seg[0].x);
  const mid = (seg) => ({ x: (seg[0].x + seg[1].x) / 2, y: (seg[0].y + seg[1].y) / 2 });

  it('Euler: the tangent at (x_n, y_n) ends at y_{n+1} and its slope is f(x_n, y_n)', () => {
    const e = m.methods.euler;
    assert.deepEqual(e.line[0], { x: 1, y: 1 });
    near(e.line[1].x, 1.3, 1e-15);
    near(e.line[1].y, e.y1, 1e-15);
    near(slopeOf(e.line), f(1, 1), 1e-12);
  });

  it('Euler Mejorado: the predictor is an Euler step, the tick has the slope at the predictor and the result line ends at y_{n+1}', () => {
    const e = m.methods.heun;
    near(e.yPred, 1 + 0.3 * f(1, 1), 1e-15);
    assert.deepEqual(e.predLine[0], { x: 1, y: 1 });
    near(e.predLine[1].y, e.yPred, 1e-15);
    near(e.slopeEnd, f(1.3, e.yPred), 1e-12);
    const c = mid(e.tick);
    near(c.x, 1.3, 1e-12);
    near(c.y, e.yPred, 1e-12);
    near(slopeOf(e.tick), e.slopeEnd, 1e-9);
    near(e.slopeAvg, (e.slope + e.slopeEnd) / 2, 1e-15);
    near(e.line[1].y, e.y1, 1e-15);
    near(slopeOf(e.line), e.slopeAvg, 1e-12);
  });

  it('RK2: the half step reaches the midpoint, the tick has the slope there and the full step ends at y_{n+1}', () => {
    const e = m.methods.rk2;
    near(e.k1, 0.3 * f(1, 1), 1e-15);
    near(e.xMid, 1.15, 1e-15);
    near(e.yMid, 1 + e.k1 / 2, 1e-15);
    near(e.halfLine[1].x, e.xMid, 1e-15);
    near(e.halfLine[1].y, e.yMid, 1e-15);
    near(e.slopeMid, f(e.xMid, e.yMid), 1e-12);
    const c = mid(e.tick);
    near(c.x, e.xMid, 1e-12);
    near(c.y, e.yMid, 1e-12);
    near(slopeOf(e.tick), e.slopeMid, 1e-9);
    near(e.line[1].y, e.y1, 1e-15);
    near(slopeOf(e.line), e.slopeMid, 1e-12);
  });

  it('Taylor: the parabola passes through (x_n, y_n) with slope f and second derivative f_x + f_y f, and ends at y_{n+1}', () => {
    const e = m.methods.taylor;
    assert.deepEqual(e.curve[0], { x: 1, y: 1 });
    const last = e.curve[e.curve.length - 1];
    near(last.x, 1.3, 1e-12);
    near(last.y, e.y1, 1e-12);
    near(e.derivs[0], f(1, 1), 1e-15);
    // f_x = 2y, f_y = 2x: y'' = 2y + 2x * f = 6 at (1, 1)
    near(e.derivs[1], 2 * 1 + 2 * 1 * f(1, 1), 1e-12);
    const [a, b, c] = [e.curve[0], e.curve[1], e.curve[2]];
    near((b.y - a.y) / (b.x - a.x), e.derivs[0] + (e.derivs[1] * (b.x - a.x)) / 2, 1e-9, 'secant slope of the first interval');
    near((c.y - 2 * b.y + a.y) / (b.x - a.x) ** 2, e.derivs[1], 1e-9, 'second difference');
    assert.deepEqual(e.tangent[0], { x: 1, y: 1 });
    near(slopeOf(e.tangent), e.derivs[0], 1e-12);
  });

  it('Taylor y\'\' equals the hand-derived expression of every preset that has one', () => {
    P.PRESETS.filter((spec) => spec.hand && spec.method === 'taylor').forEach((spec) => {
      const p = P.fromPreset(spec.id);
      const step = sd.model({ problem: p, h: 0.1 }).methods.taylor;
      const hand = E.evalNode(p.handNode(), { x: p.x0, y: p.y0 });
      near(step.derivs[1], hand, 1e-9 * Math.max(1, Math.abs(hand)), spec.id);
    });
  });

  it('the slope ticks are short and centred: their half-width is a fraction of h', () => {
    const e = m.methods.heun;
    const w = Math.abs(e.tick[1].x - e.tick[0].x);
    assert.ok(w > 0 && w < 0.5 * 0.3, `tick width ${w}`);
  });
});

describe('the fixed frame', () => {
  const grid = Array.from({ length: 10 }, (v, i) => 0.05 * (i + 1));

  it('does not change with h: the same frame for every position of the slider', () => {
    const frames = grid.map((h) => sd.model({ h }).frame);
    frames.forEach((fr) => assert.deepEqual(fr, frames[0]));
  });

  it('is computed from the largest step, whatever the step on screen is', () => {
    const wide = sd.model({ h: 0.1, hMax: 0.5 }).frame;
    const narrow = sd.model({ h: 0.1, hMax: 0.2 }).frame;
    assert.ok(wide.xMax > narrow.xMax && wide.yMax > narrow.yMax);
    assert.deepEqual(sd.frameFor(P.fromPreset('cmp_2xy_13'), 1, 1, 0.5), wide);
  });

  it('contains every point of the picture for every step, on several problems', () => {
    ['cmp_2xy_13', 'cmp_3x2y', 'cmp_quarter', 'p5_1d', 'p5_2c', 'p5_3c', 'ex_linear'].forEach((id) => {
      const frame = sd.model({ problem: id }).frame;
      [0.05, 0.3, 0.5].forEach((h) => {
        const m = sd.model({ problem: id, h });
        const ys = [m.y0, m.exact];
        ALL.forEach((method) => {
          const e = m.methods[method];
          ys.push(e.y1);
          if (Number.isFinite(e.yPred)) ys.push(e.yPred);
          if (Number.isFinite(e.yMid)) ys.push(e.yMid);
        });
        ys.forEach((y) => assert.ok(y >= frame.yMin && y <= frame.yMax, `${id} h=${h}: y = ${y} outside [${frame.yMin}, ${frame.yMax}]`));
        assert.ok(m.x0 >= frame.xMin && m.x1 <= frame.xMax, `${id} h=${h}: x range`);
      });
    });
  });

  it('is finite and non-degenerate even when the curve is flat', () => {
    const fr = sd.model({ problem: P.make({ id: 'flat', fStr: '0*y', x0: 0, y0: 2, xf: 1, h: 1 }) }).frame;
    assert.ok([fr.xMin, fr.xMax, fr.yMin, fr.yMax].every(Number.isFinite));
    assert.ok(fr.yMax > fr.yMin && fr.xMax > fr.xMin);
  });

  it('the dense curve covers the whole frame in x and has only finite points', () => {
    const m = sd.model({ h: 0.3 });
    near(m.curve[0].x, m.frame.xMin, 1e-12);
    near(m.curve[m.curve.length - 1].x, m.frame.xMax, 1e-12);
    assert.ok(m.curve.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  });
});

describe('options and the reference curve', () => {
  it('clamps h into the slider range and applies the defaults', () => {
    const o = sd.model({ h: 9 }).options;
    assert.equal(o.h, sd.DEFAULTS.hMax);
    assert.equal(sd.model({ h: -1 }).options.h, sd.DEFAULTS.hMin);
    assert.equal(sd.model({}).options.h, sd.DEFAULTS.h);
    assert.equal(sd.DEFAULTS.h, 0.4); // large enough for the three constructions to be told apart at first sight
    assert.equal(sd.model({}).options.showField, true);
    assert.equal(sd.model({ showField: false }).options.showField, false);
  });

  it('starts with the three course methods visible and Euler one click away', () => {
    const o = sd.model({}).options;
    assert.equal(o.mode, 'all');
    assert.deepEqual(o.visible, ['taylor', 'heun', 'rk2']);
    assert.deepEqual(sd.model({ visible: ['rk2', 'euler', 'nope'] }).options.visible, ['euler', 'rk2']);
    assert.deepEqual(sd.model({ visible: [] }).options.visible, []);
  });

  it('a single method shows only that method; an unknown id falls back to "all"', () => {
    const o = sd.model({ methods: 'rk2', visible: ['euler'] }).options;
    assert.equal(o.mode, 'rk2');
    assert.deepEqual(o.visible, ['rk2']);
    assert.equal(sd.model({ methods: 'nope' }).options.mode, 'all');
  });

  it('a different starting point has no closed form: the curve is the RK4 reference through it', () => {
    const m = sd.model({ x0: 1.2, y0: 1.5, h: 0.2 });
    assert.equal(m.reference, true);
    // independent RK4 with a small step, from (1.2, 1.5) to 1.4
    const f = (x, y) => 2 * x * y;
    let y = 1.5;
    const n = 20000;
    const dt = 0.2 / n;
    for (let i = 0; i < n; i += 1) {
      const x = 1.2 + i * dt;
      const k1 = f(x, y);
      const k2 = f(x + dt / 2, y + (dt / 2) * k1);
      const k3 = f(x + dt / 2, y + (dt / 2) * k2);
      const k4 = f(x + dt, y + dt * k3);
      y += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    near(m.exact, y, 1e-9);
    // it is a different solution from y = e^{x^2 - 1}
    assert.ok(Math.abs(m.exact - Math.exp(1.4 ** 2 - 1)) > 0.01);
    near(m.curve.find((p) => Math.abs(p.x - 1.2) < 1e-9 || p.x > 1.2).y, 1.5, 0.05);
  });

  it('a problem without closed form (p5_3c) uses the reference too and the methods stay close to it', () => {
    const m = sd.model({ problem: 'p5_3c', h: 0.1 });
    assert.equal(m.reference, true);
    ALL.forEach((id) => assert.ok(m.methods[id].error < 0.01, id));
  });

  it('keeps the closed form only at the problem\'s own initial condition', () => {
    assert.equal(sd.model({ x0: 1, y0: 1 }).reference, false);
    assert.equal(sd.model({ x0: 1, y0: 1.0001 }).reference, true);
  });

  it('reuses the frame and the curve through a cache while only h changes, and recomputes when the start changes', () => {
    const problem = P.fromPreset('cmp_2xy_13');
    const cache = {};
    const a = sd.model({ problem, h: 0.1 }, cache);
    const b = sd.model({ problem, h: 0.4 }, cache);
    assert.equal(a.frame, b.frame);
    assert.equal(a.curve, b.curve);
    near(b.methods.taylor.y1, 1 + 0.4 * 2 + (0.4 ** 2 / 2) * 6, 1e-12);
    const c = sd.model({ problem, h: 0.4, y0: 1.5 }, cache);
    assert.notEqual(c.frame, a.frame);
    assert.equal(c.reference, true);
  });

  it('handles a run that is not finite without throwing: the readout shows dashes', () => {
    const problem = P.make({ id: 'boom', fStr: 'exp(y)', x0: 0, y0: 1000, xf: 0.5, h: 0.5 });
    const m = sd.model({ problem, h: 0.5 });
    ALL.forEach((id) => assert.equal(m.methods[id].valid, false, id));
    const r = sd.readout(m, ALL);
    assert.ok(r.rows.every((row) => row.y1Text === '—' && row.errorText === '—'));
    assert.ok(Object.values(m.frame).every(Number.isFinite));
  });

  it('works with the independent variable t', () => {
    const m = sd.model({ problem: 'p5_1d', h: 0.25 });
    assert.equal(m.base.indep, 't');
    assert.match(sd.readout(m, ['taylor']).sentence, / en t = 1\.25: /);
  });
});

describe('readout', () => {
  const m = sd.model({ h: 0.3 });

  it('has one row per requested method, in that order, and ignores unknown ids', () => {
    const r = sd.readout(m, ['rk2', 'nope', 'taylor']);
    assert.deepEqual(r.rows.map((row) => row.id), ['rk2', 'taylor']);
    assert.deepEqual(sd.readout(m).rows.map((row) => row.id), ALL);
  });

  it('writes the values at the display settings (default 4 decimals, trailing zeros dropped)', () => {
    const r = sd.readout(m, ALL);
    assert.deepEqual(r.rows.map((row) => row.y1Text), ['1.6', '1.87', '1.924', '1.897']);
    assert.deepEqual(r.rows.map((row) => row.errorText), ['0.3937', '0.1237', '0.0697', '0.0967']);
    assert.equal(r.exactText, '1.9937');
    assert.equal(r.exactLabel, 'Exacta');
  });

  it('truncates or rounds as the display setting says, with its decimals', () => {
    assert.equal(sd.valueText(1.233678, { decimals: 4, mode: 'trunc' }), '1.2336');
    assert.equal(sd.valueText(1.233678, { decimals: 4, mode: 'round' }), '1.2337');
    assert.equal(sd.valueText(1.233678, { decimals: 2, mode: 'round' }), '1.23');
    assert.equal(sd.valueText(1.233678, { decimals: 6, mode: 'round' }), '1.233678');
    assert.equal(sd.valueText(1.233678), '1.2337');
    assert.equal(sd.valueText(1.9937155, { decimals: 'x', mode: 'weird' }), '1.9937');
    const trunc = sd.readout(sd.model({ h: 0.1 }), ['rk2'], { decimals: 6, mode: 'trunc' });
    assert.equal(trunc.exactText, '1.233678');
    assert.equal(sd.readout(sd.model({ h: 0.1 }), ['rk2'], { decimals: 4, mode: 'trunc' }).exactText, '1.2336');
  });

  it('writes errors with 4 decimals, or in scientific form when a fixed format would show 0', () => {
    assert.equal(sd.errorText(0.12371), '0.1237');
    assert.equal(sd.errorText(0.001), '0.001');
    assert.equal(sd.errorText(2.5e-4), '2.5e-4');
    assert.equal(sd.errorText(3.678e-3), '0.0037');
    assert.equal(sd.errorText(0), '0');
    assert.equal(sd.errorText(NaN), '—');
    assert.equal(sd.errorText(Infinity), '—');
  });

  it('writes the step with the decimals of the slider\'s step (at least 2)', () => {
    assert.equal(sd.stepText(0.3), '0.30');
    assert.equal(sd.stepText(0.05, 0.05), '0.05');
    assert.equal(sd.stepText(0.125, 0.125), '0.125');
    assert.equal(sd.stepText(0.5, 0.5), '0.50');
  });

  it('describes every method\'s construction with its own numbers', () => {
    const rows = Object.fromEntries(sd.readout(m, ALL).rows.map((row) => [row.id, row.construction]));
    assert.equal(rows.euler, 'pendiente 2');
    assert.equal(rows.taylor, 'y\' = 2; y\'\' = 6');
    assert.equal(rows.heun, 'pendientes 2 y 4.16; promedio 3.08');
    assert.equal(rows.rk2, 'k1 = 0.6; pendiente en el punto medio: 2.99');
  });

  it('has a one-sentence summary with the step, the start, the exact value and each method', () => {
    const s = sd.readout(m, ['taylor', 'heun', 'rk2']).sentence;
    assert.ok(s.startsWith('Paso h = 0.30 desde (1, 1). Valor exacto en x = 1.3: 1.9937.'));
    assert.ok(s.includes('Taylor (grado 2): 1.87 (error 0.1237)'));
    assert.ok(s.includes('Euler Mejorado: 1.924 (error 0.0697)'));
    assert.ok(s.includes('RK2 (punto medio): 1.897 (error 0.0967)'));
    assert.ok(!s.includes('Euler:'));
  });

  it('says "referencia" when the curve is the RK4 reference', () => {
    const r = sd.readout(sd.model({ x0: 1.2, y0: 1.5, h: 0.2 }), ['rk2']);
    assert.equal(r.exactLabel, 'Referencia (RK4)');
    assert.match(r.sentence, /Valor de referencia en x = 1\.4: /);
  });

  it('keeps a sentence that makes sense when no method is shown', () => {
    const r = sd.readout(m, []);
    assert.deepEqual(r.rows, []);
    assert.match(r.sentence, /^Paso h = 0\.30 desde \(1, 1\)\. Valor exacto en x = 1\.3: 1\.9937\.$/);
  });
});

describe('spreadLabels', () => {
  it('leaves labels that do not collide where they are', () => {
    assert.deepEqual(sd.spreadLabels([20, 60, 100], 16, 0, 200), [20, 60, 100]);
  });

  it('pushes colliding labels apart, keeping their order', () => {
    assert.deepEqual(sd.spreadLabels([100, 101, 102, 150], 16, 0, 300), [100, 116, 132, 150]);
    assert.deepEqual(sd.spreadLabels([102, 100, 101], 16, 0, 300), [132, 100, 116]);
  });

  it('keeps the column inside the limits', () => {
    assert.deepEqual(sd.spreadLabels([290, 291, 292], 16, 0, 300), [268, 284, 300]);
    assert.deepEqual(sd.spreadLabels([-5, -4], 16, 0, 300), [0, 16]);
  });

  it('holds for random inputs: order kept, gap respected, limits respected (when the column fits)', () => {
    const rnd = prng(20261019);
    for (let k = 0; k < 300; k += 1) {
      const n = 1 + Math.floor(rnd() * 5);
      const ys = Array.from({ length: n }, () => between(rnd, -20, 340));
      const out = sd.spreadLabels(ys, 16, 0, 320);
      const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
      for (let i = 1; i < n; i += 1) {
        assert.ok(out[order[i]] - out[order[i - 1]] >= 16 - 1e-9, `gap in ${JSON.stringify(ys)} -> ${JSON.stringify(out)}`);
      }
      out.forEach((y) => assert.ok(y >= -1e-9 && y <= 320 + 1e-9, `limits in ${JSON.stringify(ys)} -> ${JSON.stringify(out)}`));
    }
  });
});

/* ---- The Chart.js plugin on a recording canvas ----------------------------------------------------------- */

function recordingCtx() {
  const ops = [];
  const ctx = { ops, measureText: (t) => ({ width: String(t).length * 7 }) };
  ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'rect', 'arc', 'clip', 'stroke', 'fill', 'fillRect', 'setLineDash'].forEach((name) => {
    ctx[name] = (...args) => { ops.push({ op: name, args, lineWidth: ctx.lineWidth, strokeStyle: ctx.strokeStyle }); };
  });
  ['fillText', 'strokeText'].forEach((name) => {
    ctx[name] = (text, x, y) => { ops.push({ op: name, text, x, y, fillStyle: ctx.fillStyle, font: ctx.font }); };
  });
  return ctx;
}

/** A chart-like object with linear scales mapped onto a plot area, enough for the plugin's hooks. */
function fakeChart(frame, geometry) {
  const g = Object.assign({
    width: 700, height: 400, left: 50, top: 30, right: 650, bottom: 330,
  }, geometry);
  const area = {
    left: g.left, top: g.top, right: g.right, bottom: g.bottom, width: g.right - g.left, height: g.bottom - g.top,
  };
  const scale = (min, max, p0, p1) => ({ min, max, getPixelForValue: (v) => p0 + ((v - min) / (max - min)) * (p1 - p0) });
  return {
    width: g.width,
    height: g.height,
    chartArea: area,
    ctx: recordingCtx(),
    options: { font: { size: 13, family: 'sans-serif' } },
    scales: { x: scale(frame.xMin, frame.xMax, area.left, area.right), y: scale(frame.yMin, frame.yMax, area.bottom, area.top) },
  };
}

/** Consecutive moveTo/lineTo pairs as segments. */
function segments(ops) {
  const out = [];
  for (let i = 0; i + 1 < ops.length; i += 1) {
    if (ops[i].op === 'moveTo' && ops[i + 1].op === 'lineTo') {
      out.push({
        x1: ops[i].args[0], y1: ops[i].args[1], x2: ops[i + 1].args[0], y2: ops[i + 1].args[1], lineWidth: ops[i + 1].lineWidth, strokeStyle: ops[i + 1].strokeStyle,
      });
    }
  }
  return out;
}

describe('the Chart.js plugin', () => {
  let m;
  let options;
  let o;
  beforeEach(() => {
    sd._env.charts = stubCharts;
    m = sd.model({ h: 0.3 });
    options = sd.chartOptions(m, m.options, { decimals: 4, mode: 'round' });
    o = options.plugins.edoStep;
  });

  it('is registered under the id "edoStep" and does nothing when it is not active', () => {
    assert.equal(sd.plugin.id, 'edoStep');
    const chart = fakeChart(m.frame);
    sd.plugin.beforeDatasetsDraw(chart, {}, { active: false });
    sd.plugin.afterDatasetsDraw(chart, {}, undefined);
    assert.equal(chart.ctx.ops.length, 0);
  });

  it('draws the slope field inside the plot area, with the slope of f at each tick, and the two guides', () => {
    const chart = fakeChart(m.frame);
    sd.plugin.beforeDatasetsDraw(chart, {}, o);
    const segs = segments(chart.ctx.ops);
    const area = chart.chartArea;
    const guides = segs.filter((s) => s.x1 === s.x2 && s.y1 === area.top && s.y2 === area.bottom);
    assert.equal(guides.length, 2);
    near(guides[0].x1, chart.scales.x.getPixelForValue(1), 1e-9);
    near(guides[1].x1, chart.scales.x.getPixelForValue(1.3), 1e-9);
    const ticks = segs.filter((s) => s.x1 !== s.x2);
    assert.ok(ticks.length >= 30, `${ticks.length} ticks`);
    const ppx = area.width / (m.frame.xMax - m.frame.xMin);
    const ppy = area.height / (m.frame.yMax - m.frame.yMin);
    ticks.forEach((s) => {
      assert.ok(s.x1 >= area.left && s.x2 <= area.right && Math.min(s.y1, s.y2) >= area.top && Math.max(s.y1, s.y2) <= area.bottom, 'tick inside the plot area');
      const cx = (s.x1 + s.x2) / 2;
      const cy = (s.y1 + s.y2) / 2;
      const x = m.frame.xMin + (cx - area.left) / ppx;
      const y = m.frame.yMax - (cy - area.top) / ppy;
      const visual = -(s.y2 - s.y1) / (s.x2 - s.x1); // slope as drawn, in pixels, with the y axis up
      near(visual / (ppy / ppx), 2 * x * y, 1e-9 * Math.max(1, Math.abs(2 * x * y)), 'slope of a tick');
    });
    assert.ok(chart.ctx.ops.some((op) => op.op === 'clip'), 'the field is clipped to the plot area');
  });

  it('draws no field when it is switched off (only the guides remain)', () => {
    const chart = fakeChart(m.frame);
    const off = sd.chartOptions(sd.model({ h: 0.3, showField: false }), { visible: ['rk2'], showField: false }, {}).plugins.edoStep;
    sd.plugin.beforeDatasetsDraw(chart, {}, off);
    assert.equal(segments(chart.ctx.ops).length, 2);
  });

  it('draws one bracket per shown method from its y_{n+1} to the exact value, side by side without overlapping', () => {
    const chart = fakeChart(m.frame);
    sd.plugin.afterDatasetsDraw(chart, {}, o);
    const px1 = chart.scales.x.getPixelForValue(o.x1);
    const stems = segments(chart.ctx.ops).filter((s) => s.x1 === s.x2 && s.x1 > px1 + 1);
    assert.equal(stems.length, o.brackets.length);
    const gap = Math.max(6, 13 * 0.5);
    stems.forEach((s, i) => {
      if (i > 0) assert.ok(s.x1 - stems[i - 1].x1 >= gap - 1e-9, 'horizontal offset between brackets');
      near(s.y1, chart.scales.y.getPixelForValue(o.brackets[i].y1), 1e-9, `start of bracket ${i}`);
      near(s.y2, chart.scales.y.getPixelForValue(o.brackets[i].y2), 1e-9, `end of bracket ${i}`);
      assert.equal(s.strokeStyle, o.brackets[i].color);
    });
    assert.ok(stems[0].x1 >= px1 + o.clear - 1e-9, 'the first bracket clears the markers at x_{n+1}');
  });

  it('writes the exact value and every y_{n+1} in one column, each label at least a line apart', () => {
    const chart = fakeChart(m.frame);
    sd.plugin.afterDatasetsDraw(chart, {}, o);
    const labels = chart.ctx.ops.filter((op) => op.op === 'fillText' && (op.text === 'exacto 1.9937' || /^\d\.\d+$/.test(op.text)));
    assert.deepEqual(labels.map((l) => l.text).sort(), ['1.87', '1.897', '1.924', 'exacto 1.9937']);
    const ys = labels.map((l) => l.y).sort((a, b) => a - b);
    ys.forEach((y, i) => { if (i) assert.ok(y - ys[i - 1] >= 13 * 1.3 - 1e-9, `labels ${i - 1} and ${i} overlap`); });
    const xs = new Set(labels.map((l) => l.x));
    assert.equal(xs.size, 1, 'one column');
    assert.ok(labels.every((l) => l.y >= chart.chartArea.top && l.y <= chart.chartArea.bottom));
  });

  it('keeps labels apart even when the methods land on the same pixel row', () => {
    const chart = fakeChart(m.frame);
    const close = Object.assign({}, o, {
      brackets: ALL.map((id, i) => ({
        y1: 1.9 + i * 1e-5, y2: 2.0, color: `#${id}`, width: 2, shape: SHAPES[id], label: `1.9${i}`,
      })),
    });
    sd.plugin.afterDatasetsDraw(chart, {}, close);
    const ys = chart.ctx.ops.filter((op) => op.op === 'fillText' && /^1\.9\d$/.test(op.text)).map((op) => op.y).sort((a, b) => a - b);
    assert.equal(ys.length, 4);
    ys.forEach((y, i) => { if (i) assert.ok(y - ys[i - 1] >= 13 * 1.3 - 1e-9); });
  });

  it('leaves the labels out, not cut, when the chart is too narrow for them (the brackets stay)', () => {
    const chart = fakeChart(m.frame, { width: 330, right: 300 });
    sd.plugin.afterDatasetsDraw(chart, {}, o);
    const px1 = chart.scales.x.getPixelForValue(o.x1);
    assert.ok(segments(chart.ctx.ops).filter((s) => s.x1 === s.x2 && s.x1 > px1 + 1).length === o.brackets.length);
    const widest = chart.ctx.ops.filter((op) => op.op === 'fillText' && /\d/.test(op.text) && op.x > px1).map((op) => op.x + op.text.length * 7);
    widest.forEach((right) => assert.ok(right <= chart.width - 2, 'a drawn label must fit'));
  });

  it('shortens "exacto 1.9937" to "exacto" when only the word fits', () => {
    const chart = fakeChart(m.frame, { width: 330, right: 258 });
    const only = Object.assign({}, o, { brackets: [] });
    sd.plugin.afterDatasetsDraw(chart, {}, only);
    const texts = chart.ctx.ops.filter((op) => op.op === 'fillText').map((op) => op.text);
    assert.ok(texts.includes('exacto') || texts.includes('exacto 1.9937'), texts.join('|'));
    texts.filter((t) => t.startsWith('exacto')).forEach((t) => assert.ok(t.length <= 13));
  });

  it('labels x_n, x_{n+1} and the step h, and draws a marker with each value label', () => {
    const chart = fakeChart(m.frame);
    sd.plugin.afterDatasetsDraw(chart, {}, o);
    const texts = chart.ctx.ops.filter((op) => op.op === 'fillText').map((op) => op.text);
    ['x', 'n', 'h'].forEach((t) => assert.ok(texts.includes(t), t));
    assert.ok(chart.ctx.ops.filter((op) => op.op === 'fill').length >= 4, 'a glyph per label');
  });
});

describe('datasets and chart options (with a stub of EDO.charts)', () => {
  beforeEach(() => { sd._env.charts = stubCharts; });
  const labelsOf = (sets) => sets.map((s) => s.label);

  it('draws the exact curve, the start point, the exact point and, per shown method, its construction and its result', () => {
    const m = sd.model({ h: 0.3 });
    const sets = sd.buildDatasets(m, m.options);
    assert.equal(sets[0].label, 'Solución exacta');
    assert.equal(sets[0].data, m.curve);
    assert.equal(sets.filter((s) => s.label.startsWith('Taylor')).length, 1);
    assert.equal(sets.filter((s) => s.label.startsWith('Euler Mejorado')).length, 3);
    assert.equal(sets.filter((s) => s.label.startsWith('RK2')).length, 3);
    assert.ok(!labelsOf(sets).some((l) => l.startsWith('Euler:')), 'Euler is not shown by default');
    assert.deepEqual(sets.find((s) => s.label === 'Punto de partida').data, [{ x: 1, y: 1 }]);
    const exactPoint = sets.find((s) => s.label.startsWith('Valor exacto'));
    near(exactPoint.data[0].y, m.exact, 1e-15);
    near(exactPoint.data[0].x, 1.3, 1e-15);
  });

  it('without the construction every method is one dataset', () => {
    const m = sd.model({ h: 0.3, construction: false, visible: ALL });
    const sets = sd.buildDatasets(m, m.options);
    assert.equal(sets.length, 1 + 4 + 2);
    ['Euler', 'Taylor', 'Euler Mejorado', 'RK2'].forEach((name) => assert.equal(sets.filter((s) => s.label.startsWith(`${name}:`)).length, 1, name));
  });

  it('every result ends exactly at (x_{n+1}, y_{n+1}) with a marker on the last point only', () => {
    const m = sd.model({ h: 0.3, visible: ALL });
    const sets = sd.buildDatasets(m, m.options);
    const result = {
      euler: 'Euler: tangente en el punto inicial',
      taylor: 'Taylor: parábola de grado 2',
      heun: 'Euler Mejorado: pendiente promedio',
      rk2: 'RK2: paso completo con la pendiente del punto medio',
    };
    ALL.forEach((id) => {
      const set = sets.find((s) => s.label === result[id]);
      const last = set.data[set.data.length - 1];
      near(last.x, 1.3, 1e-12, id);
      near(last.y, m.methods[id].y1, 1e-12, id);
      assert.ok(Array.isArray(set.pointRadius) && set.pointRadius.length === set.data.length);
      assert.ok(set.pointRadius[set.data.length - 1] > 0 && set.pointRadius.slice(0, -1).every((r) => r === 0), id);
      assert.equal(set.pointStyle, SHAPES[id]);
      assert.equal(set.borderColor, `#${id}`);
    });
  });

  it('a single Taylor instance adds the tangent (the degree-1 term); all-methods does not', () => {
    const single = sd.model({ h: 0.3, methods: 'taylor' });
    assert.ok(labelsOf(sd.buildDatasets(single, single.options)).some((l) => l.startsWith('Taylor: tangente')));
    const all = sd.model({ h: 0.3, visible: ['taylor'] });
    assert.ok(!labelsOf(sd.buildDatasets(all, all.options)).some((l) => l.startsWith('Taylor: tangente')));
  });

  it('labels the reference curve as such', () => {
    const m = sd.model({ x0: 1.2, y0: 1.5, h: 0.2 });
    const sets = sd.buildDatasets(m, m.options);
    assert.equal(sets[0].label, 'Referencia (RK4)');
    assert.equal(sd.chartOptions(m, m.options, {}).plugins.edoStep.exactLabel, 'referencia');
  });

  it('chart options: fixed frame, no interaction, no legend, plugin options as documented', () => {
    const m = sd.model({ h: 0.3 });
    const opt = sd.chartOptions(m, m.options, { decimals: 4, mode: 'trunc' });
    assert.deepEqual(opt.events, []);
    assert.equal(opt.plugins.legend.display, false);
    assert.equal(opt.plugins.tooltip.enabled, false);
    assert.equal(opt.scales.x.min, m.frame.xMin);
    assert.equal(opt.scales.x.max, m.frame.xMax);
    assert.equal(opt.scales.y.min, m.frame.yMin);
    assert.equal(opt.scales.y.max, m.frame.yMax);
    assert.equal(opt.scales.x.ticks.includeBounds, false);
    const p = opt.plugins.edoStep;
    assert.equal(p.active, true);
    near(p.x0, 1, 1e-15);
    near(p.x1, 1.3, 1e-12);
    assert.equal(p.exactLabel, 'exacto');
    near(p.exactY, m.exact, 1e-15);
    assert.equal(p.exactText, '1.9937');
    assert.equal(p.field.enabled, true);
    near(p.field.f(1, 1), 2, 1e-15);
    assert.deepEqual(p.brackets.map((b) => b.color), ['#taylor', '#heun', '#rk2']);
    // truncation works on the 12-digit decimal value, so binary noise (1.8969999999999998) still reads 1.897
    assert.deepEqual(p.brackets.map((b) => b.label), ['1.87', '1.924', '1.897']);
    assert.deepEqual(p.brackets.map((b) => b.shape), ['circle', 'triangle', 'rectRot']);
    p.brackets.forEach((b) => near(b.y2, m.exact, 1e-15));
    assert.ok(p.clear > 0);
  });

  it('brackets follow the shown methods only, and the field flag follows the state', () => {
    const m = sd.model({ h: 0.3, methods: 'heun', showField: false });
    const p = sd.chartOptions(m, m.options, {}).plugins.edoStep;
    assert.equal(p.brackets.length, 1);
    assert.equal(p.brackets[0].color, '#heun');
    assert.equal(p.field.enabled, false);
  });
});

/* ---- Source guards ----------------------------------------------------------------------------------------- */

describe('Fuentes page: the course strings are verbatim (section 5.9 of the ODD document)', () => {
  const text = read('js', 'ui', 'pages', 'sources.js');

  it('quotes the header, the author line and the three document titles exactly', () => {
    [
      'Cátedras de Modelos Numéricos, Análisis Numérico y Cálculo Avanzado - U.T.N. Facultad Regional La Plata',
      'Apunte creado por Ing. Amiconi Diego Federico',
      'Ejercicios resueltos. Tema: Ecuaciones Diferenciales Ordinarias (EDO´s): Problemas de valor Inicial',
      'Práctica de Ecuaciones Diferenciales Ordinarias (Problemas de Valor Inicial)',
      'Práctica de Ecuaciones Diferenciales Ordinarias (2º Parte) y Problemas de Contorno',
    ].forEach((s) => assert.ok(text.includes(s), s));
  });

  it('does not cite the template-leftover title of the PDF metadata nor any person who is not named in the PDFs', () => {
    assert.ok(!/TRABAJO PRACTICO|TEORIA DE ERRORES/i.test(text));
    assert.ok(!/C[ée]spedes/.test(text));
  });

  it('flags the reference books for verification, with no edition or page number', () => {
    assert.ok(text.includes('verificar edición y capítulo antes de citar'));
    assert.ok(text.includes('Burden y Faires') && text.includes('Numerical Analysis'));
    assert.ok(text.includes('Chapra y Canale') && text.includes('Métodos numéricos para ingenieros'));
    assert.ok(!/\b(19|20)\d\d\b/.test(code(text)), 'no year (and so no invented edition) in the page code');
    assert.ok(!/\bp\.\s*\d|\bpp\.\s*\d|\bpágina\s+\d/i.test(text));
  });

  it('takes the versions and the date from EDO.config and lists members only when there are any', () => {
    assert.ok(/cfg\.deps/.test(text) && /deps\.katex/.test(text) && /deps\.chart/.test(text));
    assert.ok(/cfg\.version/.test(text) && /cfg\.buildDate/.test(text));
    assert.ok(/members\.length\s*\?/.test(text), 'the members line is conditional');
    assert.ok(!/innerHTML/.test(code(text)));
  });

  it('does not mention the errata of the handout', () => {
    assert.ok(!/errata|erratas|error del apunte|1\.4297|1\.4843/i.test(text));
  });
});

describe('page wiring', () => {
  it('index.html loads step-diagram.js after charts.js and before app.js', () => {
    const html = read('index.html');
    const at = (name) => html.indexOf(`js/ui/${name}.js`);
    assert.ok(at('charts') > 0 && at('charts') < at('step-diagram') && at('step-diagram') < at('app'));
  });

  it('step-diagram.js and the Fuentes page never turn text into markup', () => {
    ['step-diagram.js', path.join('pages', 'sources.js')].forEach((name) => {
      assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(code(read('js', 'ui', name))), name);
    });
  });
});
