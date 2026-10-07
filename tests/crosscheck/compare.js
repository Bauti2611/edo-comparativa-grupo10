// Cross-check of web/js/numerics/* against the independent Python oracle (see oracle.py and README.md).
// Run:  python oracle.py   (once, writes oracle_cases.json and oracle_fuzz.json)  then  node compare.js
// This is a standalone script, not a node:test file: `node --test web/tests/` does not run it.
const path = require('path');
const R = path.join(__dirname, '..', '..', 'js', 'numerics') + path.sep;
const pick = (m, k) => (m && m[k] && typeof m[k] === 'object' ? m[k] : m);
const load = (file, key) => pick(require(R + file), key);
const expr = load('expr.js', 'expr');
const problems = load('problems.js', 'problems');
const methods = load('methods.js', 'methods');
const cases = require(path.join(__dirname, 'oracle_cases.json'));
const fuzz = require(path.join(__dirname, 'oracle_fuzz.json'));

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const close = (a, b, tol) => (Number.isFinite(a) && Number.isFinite(b) && (Math.abs(a - b) <= 1e-13 || rel(a, b) <= tol));
const fails = [];
let worst = 0, checks = 0;
const note = (label, a, b, tol) => {
  checks++;
  if (!close(a, b, tol)) fails.push(`${label}: got ${a} expected ${b}`);
  else worst = Math.max(worst, Math.abs(a - b) <= 1e-13 ? 0 : rel(a, b));
};

// ---- 1. integrators vs oracle (all methods, every step) ----
for (const c of cases) {
  let p;
  try {
    p = problems.make({ id: c.name, title: c.name, source: 'oracle', indep: c.indep, fStr: c.f, x0: c.x0, y0: c.y0, h: c.h, N: c.N, xf: c.x0 + c.N * c.h });
  } catch (e) { fails.push(`make(${c.name}) threw: ${e.message}`); continue; }
  for (const m of Object.keys(c.results)) {
    const id = m.startsWith('taylor') ? 'taylor' : m;
    const order = m.startsWith('taylor') ? Number(m.slice(-1)) : undefined;
    let sol;
    try { sol = methods.solve(id, p, { h: c.h, N: c.N, order }); }
    catch (e) { fails.push(`solve(${m}, ${c.name}) threw: ${e.message}`); continue; }
    const want = c.results[m];
    if (sol.ys.length !== want.length) { fails.push(`${c.name}/${m}: length ${sol.ys.length} vs ${want.length}`); continue; }
    want.forEach((w, i) => note(`${c.name}/${m}/y${i}`, sol.ys[i], w, 1e-11));
  }
}
const nInteg = checks;

// ---- 2. parser + symbolic engine fuzz ----
for (const f of fuzz) {
  let node;
  try { node = expr.parse(f.sJs, { indep: 'x' }); } catch (e) { fails.push(`parse(${f.sJs}) threw: ${e.message}`); continue; }
  const F = expr.compile(node, { indep: 'x' });
  const Fx = expr.compile(expr.diff(node, 'x'), { indep: 'x' });
  const Fy = expr.compile(expr.diff(node, 'y'), { indep: 'x' });
  const d1n = expr.totalDerivative(node, { indep: 'x' });
  const D1 = expr.compile(d1n, { indep: 'x' });
  const D2 = expr.compile(expr.totalDerivative(d1n, { indep: 'x' }), { indep: 'x' });
  const RT = expr.compile(expr.parse(expr.toString(node), { indep: 'x' }), { indep: 'x' });
  const tex = expr.toTeX(node, { indep: 'x' });
  if (typeof tex !== 'string' || !tex.length || (tex.match(/\{/g) || []).length !== (tex.match(/\}/g) || []).length) fails.push(`toTeX unbalanced/empty for ${f.s}: ${tex}`);
  for (const q of f.pts) {
    note(`f(${f.s})`, F(q.x, q.y), q.f, 1e-9);
    note(`fx(${f.s})`, Fx(q.x, q.y), q.fx, 1e-8);
    note(`fy(${f.s})`, Fy(q.x, q.y), q.fy, 1e-8);
    note(`D1(${f.s})`, D1(q.x, q.y), q.d1, 1e-7);
    note(`D2(${f.s})`, D2(q.x, q.y), q.d2, 1e-6);
    note(`roundtrip(${f.s})`, RT(q.x, q.y), q.f, 1e-9);
  }
}

// ---- 3. a few parser edge cases the course needs (compare with hand values) ----
const edge = [
  ['2xy', 'x', [1.1, 1.2], 2 * 1.1 * 1.2], ['-3x^2 y', 'x', [2, 3], -3 * 4 * 3], ['2(x+1)', 'x', [2, 0], 6],
  ['(x+1)(x-1)', 'x', [3, 0], 8], ['-x^2', 'x', [3, 0], -9], ['e^-t', 't', [2, 0], Math.exp(-2)],
  ['e^{-t}', 't', [2, 0], Math.exp(-2)], ['sen(t)+e^{-t}', 't', [0.5, 0], Math.sin(0.5) + Math.exp(-0.5)],
  ['2^-x', 'x', [3, 0], 0.125], ['x sin(x)', 'x', [2, 0], 2 * Math.sin(2)], ['(1/4)(1+y^2)', 'x', [0, 2], 1.25],
  ['x**2', 'x', [3, 0], 9], ['2^3^2', 'x', [0, 0], 512], ['log(100)', 'x', [0, 0], 2], ['ln(e)', 'x', [0, 0], 1],
  ['-t*y+4*t/y', 't', [0.25, 2], -0.25 * 2 + 4 * 0.25 / 2],
];
for (const [src, ind, [a, b], want] of edge) {
  try { note(`edge "${src}"`, expr.compile(expr.parse(src, { indep: ind }), { indep: ind })(a, b), want, 1e-12); }
  catch (e) { fails.push(`edge "${src}" threw: ${e.message}`); }
}
for (const bad of ['2*', '(x+1', 'foo(x)', 'x +* 2', '', '1..2']) {
  let threw = false; try { expr.parse(bad, { indep: 'x' }); } catch (e) { threw = true; }
  checks++; if (!threw) fails.push(`parse("${bad}") should throw`);
}

console.log(`integrator checks: ${nInteg}; total checks: ${checks}; worst relative deviation: ${worst.toExponential(2)}`);
if (fails.length) { console.log(`FAILURES (${fails.length}):`); fails.slice(0, 40).forEach((f) => console.log('  - ' + f)); process.exitCode = 1; }
else console.log('ALL CROSS-CHECKS PASSED');
