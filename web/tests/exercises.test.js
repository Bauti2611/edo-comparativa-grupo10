'use strict';
/**
 * Ejercicios page: the pure data module (exercises/data.js) against the oracles of the ODD document
 * (sections 5.4 to 5.6), and the header and three sections (exercises/sections.js) built with a stand-in DOM.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const format = require('../js/numerics/format.js');
const data = require('../js/ui/pages/exercises/data.js');
const sections = require('../js/ui/pages/exercises/sections.js');
const kitModule = require('../js/ui/pages/theory/kit.js');

const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} != ${want} (tol ${tol})`);
const ERRATA = ['1.4297', '1.4843'];

describe('exercises data: the four solved examples of the apunte', () => {
  const entries = data.catedra();

  it('are a1..a4 with the method of each example and the card slugs ej1..ej4', () => {
    assert.deepEqual(entries.map((e) => e.id), ['a1', 'a2', 'a3', 'a4']);
    assert.deepEqual(entries.map((e) => e.methodId), ['taylor', 'euler', 'heun', 'rk2']);
    assert.deepEqual(entries.map((e) => e.slug), ['ej1', 'ej2', 'ej3', 'ej4']);
  });

  it('reproduce the apunte (Ej.1 and Ej.4) and the correct values of Ej.2 and Ej.3', () => {
    const [e1, e2, e3, e4] = entries;
    near(e1.solution.ys[3], 1.9727613, 5e-8);
    near(e4.solution.ys[3], 1.9779511, 5e-8);
    assert.equal(data.show(e1.solution.ys[3], 'trunc', 4), '1.9727');
    assert.equal(data.show(e4.solution.ys[3], 'trunc', 4), '1.9779');
    assert.equal(data.show(e1.solution.ys[3], 'round', 4), '1.9728');
    near(e2.solution.ys[2], 1.0429781, 5e-8);
    near(e3.solution.ys[2], 1.390625, 1e-12);
  });

  it('describe each PVI as TeX', () => {
    const e1 = entries[0];
    assert.equal(e1.pvi.ic, 'y(1) = 1');
    assert.equal(e1.pvi.h, 'h = 0.1');
    assert.equal(e1.pvi.ask, 'y(1.3)');
    assert.match(e1.pvi.f, /^y' = /);
    assert.equal(entries[1].series.indep, 't');
  });

  it('carry a dense exact curve for the figure', () => {
    const s = entries[0].series;
    assert.equal(s.reference, false);
    assert.ok(s.curve.length >= 41);
    near(s.curve[s.curve.length - 1].y, Math.exp(1.3 * 1.3 - 1), 1e-12);
  });
});

describe('exercises data: the comparative case', () => {
  const cmp = data.comparison();

  it('equals the table of section 5.6 at y(1.3)', () => {
    const y = Object.fromEntries(cmp.rows.map((r) => [r.id, r.y]));
    near(y.euler, 1.815360, 5e-7);
    near(y.taylor, 1.972761, 5e-7);
    near(y.heun, 1.983150, 5e-7);
    near(y.rk2, 1.977951, 5e-7);
    near(cmp.exact, 1.993716, 5e-7);
  });

  it('marks Euler Mejorado as the closest second-order method here, then RK2, then Taylor', () => {
    assert.equal(cmp.best, 'heun');
    assert.deepEqual(cmp.ranking, ['heun', 'rk2', 'taylor']);
    assert.equal(cmp.closing.closest.id, 'heun');
    assert.ok(cmp.closing.gainOverEuler > 1);
  });

  it('counts the evaluations per step as the theory does', () => {
    const evals = Object.fromEntries(cmp.rows.map((r) => [r.id, r.evals]));
    assert.deepEqual(evals, { euler: 1, taylor: 3, heun: 2, rk2: 2 });
  });
});

describe('exercises data: the practice bank', () => {
  const rows = data.bankRows();
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it('has one row per exercise of Práctica 05 and Práctica 06', () => {
    assert.equal(rows.length, 18);
    assert.ok(rows.every((r) => r.group === 'practica05' || r.group === 'practica06'));
  });

  it('solves each one with the method the sheet asks for (doc 5.5)', () => {
    const want = {
      p5_1a: 2.657994, p5_1b: 1.287109, p5_1c: 1.972761, p5_1d: -1.458885, p5_2a: 1.348678, p5_2b: 1.042978,
      p5_2c: 1.709324, p5_2d_1: 1.219446, p5_2d_2: 1.050555, p5_2e_1: 1.820740, p5_2e_2: 2.817867,
      p5_3a: 3.450929, p5_3b: 3.825415, p5_3c: 0.126556, p5_3e: 1.692289, p6_1a: 2.649143, p6_1b: 1.287218, p6_1c: 3.434843,
    };
    Object.keys(want).forEach((id) => near(byId[id].y, want[id], 5e-7));
  });

  it('compares with the exact value or, for 3c, with the RK4 reference', () => {
    near(byId.p5_1a.exact, 2.647491, 5e-7);
    assert.equal(byId.p5_3c.exactKind, 'referencia RK4');
    near(byId.p5_3c.exact, 0.126587, 5e-7);
    assert.ok(rows.filter((r) => r.exactKind !== 'exacta').length === 1);
  });

  it('offers filters for both practices and the four methods present', () => {
    const f = data.bankFilters(rows);
    assert.deepEqual(f.groups.map((g) => g.id), ['practica05', 'practica06']);
    assert.deepEqual(f.methods.map((m) => m.id), ['euler', 'taylor', 'heun', 'rk2']);
  });
});

describe('exercises data: deep links', () => {
  it('resolve sections, cards and bank rows to their element ids', () => {
    assert.deepEqual(data.resolveSub('banco'), { kind: 'section', id: 'banco', elementId: 'ejercicios-banco' });
    assert.deepEqual(data.resolveSub('ej3'), { kind: 'card', id: 'a3', elementId: 'ejercicios-ej3' });
    assert.deepEqual(data.resolveSub('p5_3a'), { kind: 'row', id: 'p5_3a', elementId: 'ejercicios-p5_3a' });
    assert.equal(data.resolveSub('cmp_2xy_13'), null);
    assert.equal(data.resolveSub('nada'), null);
    assert.equal(data.resolveSub(null), null);
  });
});

/* ---- Sections with a stand-in DOM ---- */

function makeH() {
  const flatten = (list) => list.flatMap((child) => (Array.isArray(child) ? flatten(child) : [child]))
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true);
  return (tag, ...rest) => {
    const first = rest[0];
    const hasAttrs = first && typeof first === 'object' && !first.nodeType && !Array.isArray(first);
    const el = {
      nodeType: 1, tag, attrs: hasAttrs ? first : {}, children: flatten(hasAttrs ? rest.slice(1) : (first === null || first === undefined ? rest.slice(1) : rest)), checked: false,
    };
    el.replaceChildren = (...nodes) => { el.children = flatten(nodes); };
    el.setAttribute = (k, v) => { el.attrs[k] = v; };
    return el;
  };
}

function makeEnv(mode) {
  const h = makeH();
  const calls = { solutions: [], charts: [], rows: new Map(), modeFns: [] };
  const env = {
    h,
    kit: kitModule.makeKit(h, format),
    data,
    mode: () => mode,
    setMode: () => {},
    onMode: (fn) => calls.modeFns.push(fn),
    uid: (p) => `${p}-1`,
    hydrate: () => {},
    whenOpen: (details, fn) => fn(),
    afterMount: (fn) => fn(),
    solution: (host, id, method, opts) => calls.solutions.push({ id, method, opts }),
    chart: (canvas, series, title) => calls.charts.push({ series, title }),
    tabs: (items) => { items[0].mount(); return h('div', { class: 'tabs' }, items.map((i) => i.host)); },
    onRow: (id, open) => calls.rows.set(id, open),
  };
  return { env, calls };
}

function walk(node, visit) {
  visit(node);
  if (node && typeof node === 'object' && node.children) node.children.forEach((c) => walk(c, visit));
}
const text = (node) => {
  const out = [];
  walk(node, (n) => { if (typeof n === 'string' || typeof n === 'number') out.push(String(n)); });
  return out.join('');
};
const find = (node, pred) => {
  const out = [];
  walk(node, (n) => { if (n && typeof n === 'object' && n.tag && pred(n)) out.push(n); });
  return out;
};
const balanced = (s) => {
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

describe('exercises sections (stand-in DOM)', () => {
  const { env, calls } = makeEnv('trunc');
  const head = sections.header(env);
  const built = sections.SECTIONS.map((spec) => ({ spec, el: spec.build(env) }));

  it('are the three sections, each <section id="ejercicios-<slug>"> with its h2', () => {
    assert.deepEqual(built.map((b) => b.spec.id), ['catedra', 'comparativo', 'banco']);
    built.forEach(({ spec, el }) => {
      assert.equal(el.tag, 'section');
      assert.equal(el.attrs.id, `ejercicios-${spec.id}`);
      const [h2] = find(el, (n) => n.tag === 'h2');
      assert.equal(text(h2), spec.title);
    });
    assert.equal(find(head, (n) => n.tag === 'h1').length, 1);
  });

  it('build the four cards (the first open) and mount their solutions and charts', () => {
    const cards = find(built[0].el, (n) => n.tag === 'details');
    assert.deepEqual(cards.map((c) => c.attrs.id), ['ejercicios-ej1', 'ejercicios-ej2', 'ejercicios-ej3', 'ejercicios-ej4']);
    assert.equal(cards[0].attrs.open, true);
    assert.equal(cards[1].attrs.open, null);
    const mounted = calls.solutions.filter((s) => ['a1', 'a2', 'a3', 'a4'].includes(s.id));
    assert.deepEqual(mounted.map((s) => s.opts.number), [1, 2, 3, 4]);
    assert.ok(calls.charts.length >= 5);
    const links = find(built[0].el, (n) => n.tag === 'a').map((a) => a.attrs.href);
    assert.ok(links.includes('#/simulador?preset=a1'));
  });

  it('show the comparison table with the closest method highlighted', () => {
    const rows = find(built[1].el, (n) => n.tag === 'tr' && n.attrs['data-hl'] === 'true');
    assert.equal(rows.length, 1);
    assert.match(text(rows[0]), /Euler Mejorado/);
    assert.match(text(built[1].el), /1\.983150|1\.983149/);
    assert.ok(calls.solutions.some((s) => s.id === 'cmp_2xy_13' && s.method === 'taylor'));
  });

  it('list the 18 bank rows, each with its opener and simulator link', () => {
    const rows = find(built[2].el, (n) => n.tag === 'tr' && String(n.attrs.class).includes('exercises-bank__row'));
    assert.equal(rows.length, 18);
    assert.equal(calls.rows.size, 18);
    assert.ok(rows.every((r) => /^ejercicios-/.test(r.attrs.id)));
    const links = find(built[2].el, (n) => n.tag === 'a').map((a) => a.attrs.href);
    assert.ok(links.includes('#/simulador?preset=p6_1c'));
  });

  it('never print the handout errata and keep every formula balanced', () => {
    const all = [head, ...built.map((b) => b.el)].map(text).join('\n');
    ERRATA.forEach((v) => assert.ok(!all.includes(v), v));
    const formulas = all.match(/\$[^$]+\$/g) || [];
    assert.ok(formulas.length > 50);
    formulas.forEach((f) => assert.ok(balanced(f), f));
  });

  it('switch the bank results between truncated and rounded values', () => {
    const { env: env2, calls: c2 } = makeEnv('trunc');
    let mode = 'trunc';
    env2.mode = () => mode;
    const el = sections.banco(env2);
    const before = text(el);
    mode = 'round';
    c2.modeFns.forEach((fn) => fn('round'));
    const after = text(el);
    assert.notEqual(before, after);
  });
});
