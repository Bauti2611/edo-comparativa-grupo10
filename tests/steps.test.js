'use strict';
/**
 * The step-by-step solution of the cátedra (js/ui/steps-model.js and js/ui/steps.js).
 *
 * Written red-first from the oracles of the ODD document (sections 5.2 to 5.5) and from the text of the apunte
 * itself: the four solved examples must come out with the values the handout prints (truncated to 4 decimals, the
 * apunte's convention) and, in "round" mode, with the standard roundings; Ejemplos 2 and 3 carry the CORRECT values
 * (1.0429 / 1.3906), never the printed errata. The expected strings below are written from the apunte, not
 * copied from the implementation; the hand arithmetic is recomputed here without the engine.
 * What needs a real browser (layout, KaTeX, dark and projection modes, the display switch) is covered by the QA harness.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WEB_ROOT, load, near } = require('./helpers.js');

const UI = path.join(WEB_ROOT, 'js', 'ui');
const sm = require(path.join(UI, 'steps-model.js'));
const steps = require(path.join(UI, 'steps.js'));
const expr = load('expr');
const format = load('format');
const problems = load('problems');
const methods = load('methods');
const analysis = load('analysis');

const T = String.raw;
const read = (...parts) => fs.readFileSync(path.join(WEB_ROOT, ...parts), 'utf8');
const ERRATA = ['1.4297', '1.4843'];
const METHOD_IDS = ['euler', 'taylor', 'heun', 'rk2'];

/* ---- helpers ---------------------------------------------------------------------------------------------- */

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

const KNOWN_COMMANDS = new Set([
  'frac', 'left', 'right', 'cdot', 'operatorname', 'cos', 'tan', 'ln', 'log', 'sqrt', 'pi', 'partial', 'Rightarrow', 'le', 'qquad', 'quad',
  'times', 'infty', 'mathrm', 'vdots', 'ldots', 'cosh', 'tanh', 'coth', 'arccos', 'arctan', 'text', 'approx',
  'Bigl', 'Bigr', 'bigl', 'bigr',
]);

/** Every piece of TeX of a model section: `tex` fields and the `$...$` spans inside `say` fields. */
function texOf(part) {
  const out = [];
  if (part.tex) out.push(part.tex);
  if (part.say) (part.say.match(/\$([^$]*)\$/g) || []).forEach((m) => out.push(m.slice(1, -1)));
  return out;
}

/** Every part of a model, in reading order (sections first, then iterations, summary headers and verification). */
function allParts(model) {
  return [].concat(
    model.statement.parts,
    model.initial.parts,
    model.domain.parts,
    model.abscissas.parts,
    model.generic.parts,
    ...model.iterations.map((it) => it.parts),
  );
}

function allTex(model) {
  const out = [];
  allParts(model).forEach((part) => out.push(...texOf(part)));
  model.summary.columns.forEach((c) => out.push(c.head));
  if (model.verification) {
    (model.verification.parts || []).forEach((part) => out.push(...texOf(part)));
  }
  return out;
}

const build = (id, method, opts) => sm.build(problems.fromPreset(id), method, opts);
const kinds = (it) => it.parts.map((p) => p.kind);
const byKind = (it, kind) => it.parts.find((p) => p.kind === kind);

/* ======================================================================================================
   Ejemplo 1 (Taylor de grado 2): the layout of the apunte, truncated to 4 decimals
   ====================================================================================================== */

describe('Ejemplo 1 (Taylor de grado 2), modo truncar: the layout and the values of the apunte', () => {
  const m = build('a1', 'taylor', { mode: 'trunc', number: 1 });

  it('opens with the title of the exercise and the statement: f, h, y(x0) and "Hallar y(1.3)"', () => {
    assert.equal(m.title, 'Ejercicio nro 1: Resolver el siguiente problema de Valor Inicial aplicando el método de Taylor de grado 2.');
    assert.deepEqual(m.statement.parts.map((p) => p.tex || p.say), [
      "f(x, y(x)) = y' = 2xy", 'h = 0.1', 'y(1) = 1', 'Hallar $y(1.3)$',
    ]);
    assert.deepEqual([m.method.id, m.method.order, m.method.extension], ['taylor', 2, false]);
  });

  it('states the initial condition, the domain with N = (xf - x0)/h = 3, and the abscissas x0 .. x3', () => {
    const [cond, then] = m.initial.parts;
    assert.equal(cond.say, 'La condición inicial:');
    assert.equal(cond.tex, T`y(x_0) = y_0 \;\Rightarrow\; y(1) = 1`);
    assert.equal(then.tex, T`x_0 = 1 \qquad y_0 = 1`);
    assert.equal(m.domain.N, 3);
    const [where, count] = m.domain.parts;
    assert.match(where.say, /^Nuestro dominio o intervalo de trabajo, si \$x_0 = 1\$ y queremos hallar \$y\(1\.3\)\$/);
    assert.equal(where.tex, T`1 \le x \le 1.3`);
    assert.match(count.say, /tendremos que realizar entonces \$3\$ iteraciones/);
    assert.equal(count.tex, T`N = \frac{x_f - x_0}{h} = \frac{1.3 - 1}{0.1} = 3`);
    assert.deepEqual(m.abscissas.parts.map((p) => p.tex), ['x_0 = 1', 'x_1 = x_0 + h = 1.1', 'x_2 = x_1 + h = 1.2', 'x_3 = x_2 + h = 1.3']);
  });

  it('defines the Ordenada Genérica twice, highlighted: the generic formula and the one particularized for 2xy', () => {
    const marked = m.generic.parts.filter((p) => p.highlight);
    assert.equal(marked.length, 2);
    assert.deepEqual(marked.map((p) => p.kind), ['generic', 'particular']);
    assert.equal(marked[0].tex, T`y_{n+1} = y_n + h\,y_n' + \frac{h^{2}}{2!}\,y_n''`);
    assert.equal(marked[1].tex, T`y_{n+1} = y_n + h\cdot[2\cdot x_n\cdot y_n] + \frac{h^{2}}{2!}\cdot[2\cdot y_n + 4\cdot x_n^{2}\cdot y_n]`);
    assert.equal(marked[1].label, 'Ordenada Genérica');
    assert.match(m.generic.parts[0].say, /^Por Taylor de grado 2 vamos a definir la Ordenada Genérica \$y_\{n\+1\}\$ para nuestro problema/);
  });

  it('shows the generic y\'\' formula once and derives y\'\' = 2y + 4x^2 y, as the handout does', () => {
    const tex = m.generic.parts.map((p) => p.tex).filter(Boolean);
    const generic = T`y_n'' = \frac{\partial f}{\partial x} + \frac{\partial f}{\partial y}\,y_n'`;
    assert.equal(tex.filter((t) => t === generic).length, 1);
    assert.ok(tex.includes(T`y_n'' = 2\cdot y_n + (2\cdot x_n)\cdot (2\cdot x_n\cdot y_n) = 2\cdot y_n + 4\cdot x_n^{2}\cdot y_n`), tex.join('\n'));
  });

  it('has three iterations labelled as the apunte labels them, each with its n', () => {
    assert.deepEqual(m.iterations.map((it) => it.label), ['Primer iteración', 'Segunda iteración', 'Tercer iteración']);
    assert.deepEqual(m.iterations.map((it) => it.n), [0, 1, 2]);
    assert.ok(m.iterations.every((it) => it.ordinal === true));
  });

  it('n = 0 reads like the apunte: "Si n=0 entonces", "Reemplazando cada valor", y1 = 1.23 = y(x1) = y(1.1)', () => {
    const it0 = m.iterations[0];
    assert.deepEqual(kinds(it0), ['intro', 'replace', 'result', 'note']);
    assert.equal(byKind(it0, 'intro').say, 'Si $n=0$ entonces:');
    assert.equal(byKind(it0, 'intro').tex, T`y_1 = y_0 + h\cdot[2\cdot x_0\cdot y_0] + \frac{h^{2}}{2!}\cdot[2\cdot y_0 + 4\cdot x_0^{2}\cdot y_0]`);
    assert.equal(byKind(it0, 'replace').say, 'Reemplazando cada valor:');
    assert.equal(byKind(it0, 'replace').tex, T`y_1 = 1 + 0.1\cdot[2\cdot 1\cdot 1] + \frac{(0.1)^{2}}{2!}\cdot[2\cdot 1 + 4\cdot (1)^{2}\cdot 1]`);
    const result = byKind(it0, 'result');
    assert.equal(result.tex, 'y_1 = 1.23 = y(x_1) = y(1.1)');
    assert.equal(result.highlight, true);
  });

  it('n = 1 and n = 2 substitute the values printed by the previous iteration (1.23, then 1.5426)', () => {
    assert.equal(byKind(m.iterations[1], 'replace').tex,
      T`y_2 = 1.23 + 0.1\cdot[2\cdot 1.1\cdot 1.23] + \frac{(0.1)^{2}}{2!}\cdot[2\cdot 1.23 + 4\cdot (1.1)^{2}\cdot 1.23]`);
    assert.equal(byKind(m.iterations[1], 'result').tex, 'y_2 = 1.5426 = y(x_2) = y(1.2)');
    assert.equal(byKind(m.iterations[2], 'replace').tex,
      T`y_3 = 1.5426 + 0.1\cdot[2\cdot 1.2\cdot 1.5426] + \frac{(0.1)^{2}}{2!}\cdot[2\cdot 1.5426 + 4\cdot (1.2)^{2}\cdot 1.5426]`);
    assert.equal(byKind(m.iterations[2], 'result').tex, 'y_3 = 1.9727 = y(x_3) = y(1.3)');
  });

  it('prints "Esto se lee así" once, on the first iteration only, and mentions the two iterations still missing', () => {
    const notes = m.iterations.flatMap((it) => it.parts.filter((p) => p.kind === 'note'));
    assert.equal(notes.length, 1);
    assert.equal(byKind(m.iterations[0], 'note').say,
      'Esto se lee así: el valor de $y_1$ es igual al valor de $y$ evaluado en el punto $x_1$, y como $x_1 = x_0 + h$ entonces $x_1 = 1 + 0.1 = 1.1$. '
      + 'Si debemos llegar hasta $1.3$, que nos pide el enunciado, aún nos faltan dos iteraciones más.');
    assert.ok(m.iterations.slice(1).every((it) => !it.parts.some((p) => /Esto se lee así/.test(p.say || ''))));
  });

  it('closes with the sentence of the apunte for a value asked by the statement', () => {
    assert.equal(m.closing, 'Hallamos el valor que nos pedía el enunciado, por lo tanto el ejercicio termina aquí.');
  });

  it('the y values come from the engine and equal the hand arithmetic of the handout: 1.23, 1.542666, 1.9727613', () => {
    let y = 1;
    const hand = [];
    for (let n = 0; n < 3; n += 1) {
      const x = 1 + n * 0.1;
      y = y + 0.1 * (2 * x * y) + ((0.1 * 0.1) / 2) * (2 * y + 4 * x * x * y);
      hand.push(y);
    }
    near(hand[1], 1.542666, 1e-9);
    near(hand[2], 1.9727612808, 1e-9);
    m.iterations.forEach((it, i) => near(it.y, hand[i], 1e-12, `y${i + 1}`));
    assert.deepEqual(m.iterations.map((it) => it.yText), ['1.23', '1.5426', '1.9727']);
  });

  it('carries the display notice: truncated to 4 decimals, as in the apunte, with full-precision arithmetic', () => {
    assert.equal(m.display.mode, 'trunc');
    assert.equal(m.display.decimals, 4);
    assert.match(m.display.notice, /truncados a 4 decimales, como en el apunte/);
    assert.match(m.display.notice, /precisión completa/);
  });
});

describe('Ejemplo 1, modo redondear: it differs from the handout exactly where doc 5.3 says (1.5427, 1.9728)', () => {
  const m = build('a1', 'taylor', { mode: 'round', number: 1 });

  it('rounds y2 to 1.5427 and y3 to 1.9728, and substitutes the rounded y2 in the third iteration', () => {
    assert.deepEqual(m.iterations.map((it) => it.yText), ['1.23', '1.5427', '1.9728']);
    assert.equal(byKind(m.iterations[1], 'result').tex, 'y_2 = 1.5427 = y(x_2) = y(1.2)');
    assert.equal(byKind(m.iterations[2], 'result').tex, 'y_3 = 1.9728 = y(x_3) = y(1.3)');
    assert.match(byKind(m.iterations[2], 'replace').tex, /^y_3 = 1\.5427 \+ 0\.1\\cdot\[2\\cdot 1\.2\\cdot 1\.5427\]/);
    assert.match(m.display.notice, /redondeados a 4 decimales/);
  });

  it('is identical to the truncated version everywhere the two conventions agree (title, statement, iteration 1, layout)', () => {
    const t = build('a1', 'taylor', { mode: 'trunc', number: 1 });
    assert.equal(m.title, t.title);
    assert.deepEqual(m.statement, t.statement);
    assert.deepEqual(m.abscissas, t.abscissas);
    assert.deepEqual(m.generic, t.generic);
    assert.deepEqual(m.iterations[0], t.iterations[0]);
    assert.deepEqual(m.iterations.map(kinds), t.iterations.map(kinds));
  });
});

/* ======================================================================================================
   Ejemplo 4 (RK2, punto medio)
   ====================================================================================================== */

describe('Ejemplo 4 (Runge Kutta de grado 2), modo truncar: k1 apart, then the substitution with x + h/2 and y + k1/2', () => {
  const m = build('a4', 'rk2', { mode: 'trunc', number: 4 });

  it('titles the method as the apunte does and defines the Ordenada Genérica with k1', () => {
    assert.equal(m.title, 'Ejercicio nro 4: Resolver el siguiente problema de Valor Inicial aplicando el método de Runge Kutta de grado 2.');
    const marked = m.generic.parts.filter((p) => p.highlight);
    assert.equal(marked[0].tex, T`y_{n+1} = y_n + h\,f\!\left(x_n + \frac{h}{2},\ y_n + \frac{k_1}{2}\right)`);
    assert.equal(marked[1].tex, T`y_{n+1} = y_n + h\cdot[2\cdot (x_n + h/2)\cdot (y_n + k_1/2)]`);
    const texts = m.generic.parts.map((p) => p.tex).filter(Boolean);
    assert.ok(texts.includes(T`k_1 = h\,f(x_n, y(x_n)) = h\,y_n'`));
    assert.ok(texts.includes(T`k_1 = h\cdot(2\cdot x_n\cdot y_n)`));
  });

  it('prints k1 = 0.2, 0.27082 and 0.3708 as the handout does (an exact value is never cut short)', () => {
    assert.deepEqual(m.iterations.map((it) => it.valueTexts.k1), ['0.2', '0.27082', '0.3708']);
    assert.equal(byKind(m.iterations[0], 'where').tex, T`k_1 = h\cdot(2\cdot x_0\cdot y_0) = 0.1\cdot(2\cdot 1\cdot 1) = 0.2`);
    assert.equal(byKind(m.iterations[1], 'where').tex, T`k_1 = h\cdot(2\cdot x_1\cdot y_1) = 0.1\cdot(2\cdot 1.1\cdot 1.231) = 0.27082`);
    assert.equal(byKind(m.iterations[2], 'where').tex, T`k_1 = h\cdot(2\cdot x_2\cdot y_2) = 0.1\cdot(2\cdot 1.2\cdot 1.5452) = 0.3708`);
  });

  it('substitutes as in the apunte: 1 + 0.1*[2*(1 + 0.1/2)*(1 + 0.2/2)] and gives 1.231, 1.5452, 1.9779', () => {
    assert.equal(byKind(m.iterations[0], 'intro').tex, T`y_1 = y_0 + h\cdot[2\cdot (x_0 + h/2)\cdot (y_0 + k_1/2)]`);
    assert.equal(byKind(m.iterations[0], 'replace').tex, T`y_1 = 1 + 0.1\cdot[2\cdot (1 + 0.1/2)\cdot (1 + 0.2/2)]`);
    assert.equal(byKind(m.iterations[1], 'replace').tex, T`y_2 = 1.231 + 0.1\cdot[2\cdot (1.1 + 0.1/2)\cdot (1.231 + 0.27082/2)]`);
    assert.equal(byKind(m.iterations[2], 'replace').tex, T`y_3 = 1.5452 + 0.1\cdot[2\cdot (1.2 + 0.1/2)\cdot (1.5452 + 0.3708/2)]`);
    assert.deepEqual(m.iterations.map((it) => byKind(it, 'result').tex), [
      'y_1 = 1.231 = y(x_1) = y(1.1)', 'y_2 = 1.5452 = y(x_2) = y(1.2)', 'y_3 = 1.9779 = y(x_3) = y(1.3)',
    ]);
    assert.deepEqual(m.iterations.map(kinds), [['intro', 'where', 'replace', 'result', 'note'], ['intro', 'where', 'replace', 'result'], ['intro', 'where', 'replace', 'result']]);
  });

  it('matches the hand arithmetic without the engine (1.231, 1.5452743, 1.977951104; k1 0.2, 0.27082, 0.370865832)', () => {
    let y = 1;
    const h = 0.1;
    const hand = [];
    const ks = [];
    for (let n = 0; n < 3; n += 1) {
      const x = 1 + n * h;
      const k1 = h * (2 * x * y);
      ks.push(k1);
      y += h * (2 * (x + h / 2) * (y + k1 / 2));
      hand.push(y);
    }
    m.iterations.forEach((it, i) => {
      near(it.y, hand[i], 1e-12);
      near(it.values.k1, ks[i], 1e-12);
    });
    near(hand[2], 1.977951104, 1e-9);
  });
});

describe('Ejemplo 4, modo redondear: 1.5453 and 1.978 (the zero is dropped), and k1 = 0.3709', () => {
  const m = build('a4', 'rk2', { mode: 'round', number: 4 });

  it('rounds the way doc 5.3 lists', () => {
    assert.deepEqual(m.iterations.map((it) => it.yText), ['1.231', '1.5453', '1.978']);
    assert.deepEqual(m.iterations.map((it) => it.valueTexts.k1), ['0.2', '0.2708', '0.3709']);
    assert.equal(byKind(m.iterations[2], 'result').tex, 'y_3 = 1.978 = y(x_3) = y(1.3)');
  });
});

/* ======================================================================================================
   Ejemplo 2 (Euler, variable t) and Ejemplo 3 (Euler Mejorado): the CORRECT values, never the errata
   ====================================================================================================== */

describe('Ejemplo 2 (Euler, y\' = sen(t) + e^{-t}): the variable is t, the closing is the interval one', () => {
  const m = build('a2', 'euler', { mode: 'trunc', number: 2 });

  it('writes t, t_n and y(t) everywhere', () => {
    assert.equal(m.title, 'Ejercicio nro 2: Resolver el siguiente problema de Valor Inicial aplicando el método de Euler.');
    assert.deepEqual(m.statement.parts.map((p) => p.tex || p.say), [
      T`f(t, y(t)) = y' = \operatorname{sen}(t) + e^{-t}`, T`0 \le t \le 1`, 'h = 0.5', 'y(0) = 0',
    ]);
    assert.equal(m.initial.parts[0].tex, T`y(t_0) = y_0 \;\Rightarrow\; y(0) = 0`);
    assert.equal(m.initial.parts[1].tex, T`t_0 = 0 \qquad y_0 = 0`);
    assert.deepEqual(m.abscissas.parts.map((p) => p.tex), ['t_0 = 0', 't_1 = t_0 + h = 0.5', 't_2 = t_1 + h = 1']);
    assert.equal(m.domain.N, 2);
    assert.equal(m.domain.parts[0].tex, T`N = \frac{t_f - t_0}{h} = \frac{1 - 0}{0.5} = 2`);
    assert.match(m.domain.parts[0].say, /el intervalo es hasta \$1\$, con paso \$h = 0\.5\$, tendremos que realizar entonces \$2\$ iteraciones/);
  });

  it('defines the Ordenada Genérica y_{n+1} = y_n + h[sen(t_n) + e^{-t_n}] and iterates', () => {
    const marked = m.generic.parts.filter((p) => p.highlight);
    assert.equal(marked[0].tex, T`y_{n+1} = y_n + h\,y_n'`);
    assert.equal(marked[1].tex, T`y_{n+1} = y_n + h\cdot[\operatorname{sen}(t_n) + e^{-t_n}]`);
    assert.ok(m.generic.parts.some((p) => p.tex === T`y_n' = f(t_n, y(t_n))`));
    const [i0, i1] = m.iterations;
    assert.deepEqual(kinds(i0), ['intro', 'where', 'replace', 'result', 'note']);
    assert.equal(byKind(i0, 'intro').tex, T`y_1 = y_0 + h\cdot[\operatorname{sen}(t_0) + e^{-t_0}]`);
    assert.equal(byKind(i0, 'where').tex, T`y_0' = f(t_0, y_0) = \operatorname{sen}(0) + e^{-0} = 1`);
    assert.equal(byKind(i0, 'replace').tex, T`y_1 = 0 + 0.5\cdot[\operatorname{sen}(0) + e^{-0}]`);
    assert.equal(byKind(i0, 'result').tex, 'y_1 = 0.5 = y(t_1) = y(0.5)');
    assert.equal(byKind(i1, 'replace').tex, T`y_2 = 0.5 + 0.5\cdot[\operatorname{sen}(0.5) + e^{-0.5}]`);
  });

  it('gives y2 = 1.0429 (truncated) and 1.043 (rounded): the correct value 1.0429781, not the printed 1.4297', () => {
    near(m.iterations[1].y, 1.0429781, 5e-8);
    assert.equal(byKind(m.iterations[1], 'result').tex, 'y_2 = 1.0429 = y(t_2) = y(1)');
    assert.equal(build('a2', 'euler', { mode: 'round' }).iterations[1].yText, '1.043');
  });

  it('the first iteration explains the reading in t and the interval; the closing is the interval sentence', () => {
    assert.equal(byKind(m.iterations[0], 'note').say,
      'Esto se lee así: el valor de $y_1$ es igual al valor de $y$ evaluado en el punto $t_1$, y como $t_1 = t_0 + h$ entonces $t_1 = 0 + 0.5 = 0.5$. '
      + 'Si debemos llegar hasta un valor de $t$ que sea igual a "1", para llegar al final del intervalo, aún nos falta seguir haciendo iteraciones.');
    assert.equal(m.closing, 'Llegamos al valor de "y" correspondiente al final del intervalo, por lo tanto el ejercicio termina en este punto.');
  });
});

describe('Ejemplo 3 (Euler Mejorado, y\' = -y + x + 1): y_n\' apart, the predictor and the slope at the predicted end', () => {
  const m = build('a3', 'heun', { mode: 'trunc', number: 3 });

  it('defines the Ordenada Genérica as the apunte does: the formula, "como y_n\' = f", and the problem\'s f twice', () => {
    assert.equal(m.title, 'Ejercicio nro 3: Resolver el siguiente problema de Valor Inicial aplicando el método de Euler Mejorado.');
    const texts = m.generic.parts.map((p) => p.tex).filter(Boolean);
    const marked = m.generic.parts.filter((p) => p.highlight);
    assert.equal(marked[0].tex, T`y_{n+1} = y_n + \frac{h}{2!}\Bigl[f(x_n, y(x_n)) + f\bigl(x_{n+1},\ y_n + h\,y_n'\bigr)\Bigr]`);
    assert.ok(texts.includes(T`y_{n+1} = y_n + \frac{h}{2!}\Bigl[y_n' + f\bigl(x_{n+1},\ y_n + h\,y_n'\bigr)\Bigr]`));
    assert.ok(texts.includes(T`y_n' = -y_n + x_n + 1`));
    assert.ok(texts.includes(T`f\bigl(x_{n+1},\ y_n + h\,y_n'\bigr) = -(y_n + h\cdot y_n') + x_{n+1} + 1`));
    assert.equal(marked[1].tex, T`y_{n+1} = y_n + \frac{h}{2!}\cdot[(-y_n + x_n + 1) + (-(y_n + h\cdot y_n') + x_{n+1} + 1)]`);
    assert.match(m.generic.parts.map((p) => p.say || '').join(' '), /donde en la ecuación diferencial original teníamos el valor "x" ahora usamos/);
  });

  it('n = 0: y0\' = (-1 + 0 + 1) = 0, predictor 1, slope 0.5, then y1 = 1.125 = y(x1) = y(0.5)', () => {
    const it0 = m.iterations[0];
    assert.deepEqual(kinds(it0), ['intro', 'where', 'predictor', 'replace', 'result', 'note']);
    assert.equal(byKind(it0, 'intro').tex, T`y_1 = y_0 + \frac{h}{2!}\cdot[(-y_0 + x_0 + 1) + (-(y_0 + h\cdot y_0') + x_1 + 1)]`);
    assert.equal(byKind(it0, 'where').tex, T`y_0' = f(x_0, y_0) = -1 + 0 + 1 = 0`);
    const predictor = byKind(it0, 'predictor');
    assert.equal(predictor.say, T`El predictor (paso de Euler) es $y_0 + h\,y_0' = 1 + 0.5\cdot 0 = 1$ y la pendiente en $x_1$ es:`);
    assert.equal(predictor.tex, 'f(x_1, 1) = -1 + 0.5 + 1 = 0.5');
    assert.equal(byKind(it0, 'replace').tex, T`y_1 = 1 + \frac{0.5}{2!}\cdot[(-1 + 0 + 1) + (-(1 + 0.5\cdot 0) + 0.5 + 1)]`);
    assert.equal(byKind(it0, 'result').tex, 'y_1 = 1.125 = y(x_1) = y(0.5)');
    assert.deepEqual([it0.values.slope, it0.values.yPred, it0.values.slopeEnd], [0, 1, 0.5]);
  });

  it('n = 1: y1\' = 0.375, predictor 1.3125, f(x2, 1.3125) = 0.6875, and y2 = 1.3906 (the correct value, not 1.4843)', () => {
    const it1 = m.iterations[1];
    assert.equal(byKind(it1, 'where').tex, T`y_1' = f(x_1, y_1) = -1.125 + 0.5 + 1 = 0.375`);
    assert.equal(byKind(it1, 'predictor').say, T`El predictor (paso de Euler) es $y_1 + h\,y_1' = 1.125 + 0.5\cdot 0.375 = 1.3125$ y la pendiente en $x_2$ es:`);
    assert.equal(byKind(it1, 'predictor').tex, 'f(x_2, 1.3125) = -1.3125 + 1 + 1 = 0.6875');
    assert.equal(byKind(it1, 'replace').tex, T`y_2 = 1.125 + \frac{0.5}{2!}\cdot[(-1.125 + 0.5 + 1) + (-(1.125 + 0.5\cdot 0.375) + 1 + 1)]`);
    assert.equal(byKind(it1, 'result').tex, 'y_2 = 1.3906 = y(x_2) = y(1)');
    near(it1.y, 1.390625, 1e-12);
    assert.deepEqual([it1.values.slope, it1.values.yPred, it1.values.slopeEnd], [0.375, 1.3125, 0.6875]);
    assert.equal(m.closing, 'Llegamos al valor de "y" correspondiente al final del intervalo, por lo tanto el ejercicio termina en este punto.');
  });
});

describe('the printed errata of the handout never appear (doc 5.4)', () => {
  it('no model of Ej. 2 or Ej. 3 contains 1.4297 or 1.4843, in any mode or number of decimals', () => {
    [['a2', 'euler'], ['a3', 'heun'], ['a2', 'taylor'], ['a3', 'rk2'], ['p5_2b', 'euler']].forEach(([id, method]) => {
      ['trunc', 'round'].forEach((mode) => {
        [2, 3, 4, 5, 6, 7].forEach((decimals) => {
          const text = JSON.stringify(build(id, method, { mode, decimals }));
          ERRATA.forEach((e) => assert.ok(!text.includes(e), `${id}/${method}/${mode}/${decimals} contains ${e}`));
        });
      });
    });
  });

  it('the sources of this feature mention them only in negative assertions (this file)', () => {
    ['steps-model.js', 'steps.js'].forEach((file) => {
      const source = read('js', 'ui', file);
      ERRATA.forEach((e) => assert.ok(!source.includes(e), `${file} contains ${e}`));
    });
  });
});

/* ======================================================================================================
   The display rule of the truncated mode, and the Euler baseline
   ====================================================================================================== */

describe('how a value is shown', () => {
  it('a result is truncated to the decimals asked, toward zero, ignoring the binary noise', () => {
    assert.equal(sm.showValue(0.27082000000000006, { mode: 'trunc', decimals: 4 }), '0.2708');
    assert.equal(sm.showValue(1.5426659999999999, { mode: 'trunc', decimals: 4 }), '1.5426');
    assert.equal(sm.showValue(1.9727612808, { mode: 'trunc', decimals: 4 }), '1.9727');
    assert.equal(sm.showValue(1.390625, { mode: 'trunc', decimals: 4 }), '1.3906');
    assert.equal(sm.showValue(1.23, { mode: 'trunc', decimals: 4 }), '1.23');
    assert.equal(sm.showValue(-1.2999999999999998, { mode: 'trunc', decimals: 4 }), '-1.3');
    assert.equal(sm.showValue(1.81536, { mode: 'trunc', decimals: 4 }), '1.8153');
  });

  it('rounds half away from zero in round mode', () => {
    assert.equal(sm.showValue(0.27082000000000006, { mode: 'round', decimals: 4 }), '0.2708');
    assert.equal(sm.showValue(1.5426659999999999, { mode: 'round', decimals: 4 }), '1.5427');
    assert.equal(sm.showValue(1.9779511040000004, { mode: 'round', decimals: 4 }), '1.978');
  });

  it('honours the decimals option', () => {
    assert.equal(sm.showValue(1.9727612808, { mode: 'trunc', decimals: 2 }), '1.97');
    assert.equal(sm.showValue(1.9727612808, { mode: 'trunc', decimals: 6 }), '1.972761');
    assert.equal(sm.showValue(1.9727612808, { mode: 'round', decimals: 6 }), '1.972761');
    assert.equal(sm.showValue(2, { mode: 'trunc', decimals: 0 }), '2');
  });

  it('an intermediate value (k1, a slope) that is exact with one more decimal is written whole, as the apunte does (k1 = 0.27082)', () => {
    const trunc = { mode: 'trunc', decimals: 4 };
    assert.equal(sm.showIntermediate(0.27082000000000006, trunc), '0.27082');
    assert.equal(sm.showIntermediate(0.37086583200000006, trunc), '0.3708');
    assert.equal(sm.showIntermediate(0.2, trunc), '0.2');
    assert.equal(sm.showIntermediate(2.706, trunc), '2.706');
    assert.equal(sm.showIntermediate(11.97108816, trunc), '11.971');
    assert.equal(sm.showIntermediate(0.27082000000000006, { mode: 'round', decimals: 4 }), '0.2708', 'rounding has no exception');
    assert.equal(sm.showIntermediate(0.37086583200000006, { mode: 'round', decimals: 4 }), '0.3709');
  });
});

describe('Euler (the baseline) follows the same layout with y_{n+1} = y_n + h y_n\'', () => {
  it('on y\' = 2xy: generic, y_n\' apart and the substitution of the first step, y1 = 1.4', () => {
    const m = build('cmp_2xy_13', 'euler', { mode: 'trunc', number: 1 });
    assert.equal(m.method.name, 'Euler');
    const marked = m.generic.parts.filter((p) => p.highlight);
    assert.equal(marked[0].tex, T`y_{n+1} = y_n + h\,y_n'`);
    assert.equal(marked[1].tex, T`y_{n+1} = y_n + h\cdot[2\cdot x_n\cdot y_n]`);
    const it0 = m.iterations[0];
    assert.deepEqual(kinds(it0), ['intro', 'where', 'replace', 'result', 'note']);
    assert.equal(byKind(it0, 'where').tex, T`y_0' = f(x_0, y_0) = 2\cdot 1\cdot 1 = 2`);
    assert.equal(byKind(it0, 'replace').tex, T`y_1 = 1 + 0.1\cdot[2\cdot 1\cdot 1]`);
    assert.equal(byKind(it0, 'result').tex, 'y_1 = 1.2 = y(x_1) = y(1.1)');
    near(m.iterations[2].y, methods.solve('euler', problems.fromPreset('cmp_2xy_13')).ys[3], 1e-12);
    assert.equal(m.iterations[2].yText, '1.8153', 'a result is truncated to the decimals asked');
  });
});

/* ======================================================================================================
   Summary table and the Verificación (an addition, labelled as such)
   ====================================================================================================== */

describe('the summary of results', () => {
  it('Taylor: n, x_n, y_n, y_n\' and y_n\'\' for n = 0..3, with the final value of the statement', () => {
    const m = build('a1', 'taylor', { mode: 'trunc' });
    assert.deepEqual(m.summary.columns.map((c) => c.key), ['slope', 'curvature']);
    assert.deepEqual(m.summary.columns.map((c) => c.head), ["y_n'", "y_n''"]);
    assert.deepEqual(m.summary.rows.map((r) => [r.n, r.xText, r.yText]), [[0, '1', '1'], [1, '1.1', '1.23'], [2, '1.2', '1.5426'], [3, '1.3', '1.9727']]);
    assert.deepEqual(m.summary.rows[0].cells.map((c) => c.text), ['2', '6']);
    assert.deepEqual(m.summary.rows[1].cells.map((c) => c.text), ['2.706', '8.4132']);
    assert.deepEqual(m.summary.rows[3].cells, [], 'the last point takes no step');
    assert.deepEqual([m.summary.final.n, m.summary.final.xText, m.summary.final.yText], [3, '1.3', '1.9727']);
    near(m.summary.final.y, 1.9727612808, 1e-9);
  });

  it('Euler Mejorado shows y_n\', the predictor and the slope at the predicted end; RK2 shows k1, the midpoint ordinate and its slope', () => {
    const e = build('a3', 'heun', { mode: 'trunc' });
    assert.deepEqual(e.summary.columns.map((c) => c.key), ['slope', 'yPred', 'slopeEnd']);
    assert.deepEqual(e.summary.rows[0].cells.map((c) => c.text), ['0', '1', '0.5']);
    assert.deepEqual(e.summary.rows[1].cells.map((c) => c.text), ['0.375', '1.3125', '0.6875']);
    const r = build('a4', 'rk2', { mode: 'trunc' });
    assert.deepEqual(r.summary.columns.map((c) => c.key), ['k1', 'yMid', 'slopeMid']);
    assert.deepEqual(r.summary.rows[0].cells.map((c) => c.text), ['0.2', '1.1', '2.31']);
  });
});

describe('Verificación: the exact value (or the RK4 reference), the absolute and the relative error', () => {
  it('Ej. 1: y(1.3) = e^{0.69} = 1.9937155; the error of 1.9727613 is 0.0209543 (1.051 %)', () => {
    const v = build('a1', 'taylor', { mode: 'trunc' }).verification;
    assert.equal(v.label, 'Verificación');
    assert.equal(v.extension, true);
    assert.equal(v.reference, false);
    assert.equal(v.x, 1.3);
    near(v.exact, Math.exp(1.3 * 1.3 - 1), 1e-12);
    near(v.exact, 1.9937155332, 1e-9);
    near(v.abs, Math.abs(Math.exp(0.69) - 1.9727612808), 1e-9);
    near(v.abs, 0.0209542524, 1e-9);
    near(v.rel, v.abs / v.exact, 1e-15);
    near(v.pct, 100 * v.rel, 1e-12);
    assert.equal(v.exactText, '1.9937');
    assert.equal(v.yText, '1.9727');
    assert.equal(v.absText, '0.02095');
    assert.equal(v.pctText, '1.051');
    assert.equal(v.exactTex, 'e^{x^{2}-1}');
  });

  it('Ej. 2 and 3 are verified against their closed forms too (1.091818 and 1.367879)', () => {
    near(build('a2', 'euler').verification.exact, 2 - Math.cos(1) - Math.exp(-1), 1e-12);
    near(build('a2', 'euler').verification.exact, 1.091818, 1e-6);
    near(build('a3', 'heun').verification.exact, 1 + Math.exp(-1), 1e-12);
    near(build('a3', 'heun').verification.exact, 1.367879, 1e-6);
    near(build('a3', 'heun').verification.abs, 1.390625 - 1.3678794412, 1e-9);
  });

  it('a problem without a closed form is checked against the RK4 reference and says so', () => {
    const p = problems.fromPreset('p5_3c');
    const v = sm.build(p, 'heun').verification;
    assert.equal(v.reference, true);
    assert.equal(v.extension, true);
    near(v.exact, analysis.reference(p, [0, 0.5])[1], 1e-9);
    near(v.exact, 0.126587, 5e-6);
    assert.match(v.say, /referencia/i);
    assert.equal(v.exactTex, null);
  });
});

/* ======================================================================================================
   Options: decimals, order, upTo, number, ask; and exercise()
   ====================================================================================================== */

describe('options', () => {
  it('number is optional: without it the title has no "Ejercicio nro"', () => {
    const m = build('a1', 'taylor');
    assert.equal(m.title, 'Resolver el siguiente problema de Valor Inicial aplicando el método de Taylor de grado 2.');
    assert.equal(m.options.mode, 'trunc', 'the default mode is the apunte\'s');
    assert.equal(m.options.decimals, 4);
  });

  it('decimals changes the display and the notice (and singular/plural)', () => {
    const m = build('a1', 'taylor', { decimals: 2 });
    assert.deepEqual(m.iterations.map((it) => it.yText), ['1.23', '1.54', '1.97']);
    assert.match(m.display.notice, /truncados a 2 decimales/);
    assert.match(build('a1', 'taylor', { decimals: 1 }).display.notice, /a 1 decimal\b/);
  });

  it('upTo renders only the first iterations: no closing, a partial summary and the verification at the last point', () => {
    const m = build('cmp_2xy_15', 'rk2', { upTo: 2 });
    assert.equal(m.partial, true);
    assert.equal(m.iterations.length, 2);
    assert.equal(m.closing, null);
    assert.equal(m.domain.N, 5);
    assert.equal(m.summary.rows.length, 3);
    assert.equal(m.summary.final.n, 2);
    assert.equal(m.verification.n, 2);
    near(m.verification.x, 1.2, 1e-12);
    assert.match(m.iterations[0].parts.find((p) => p.kind === 'note').say, /nos faltan cuatro iteraciones más/);
    const full = build('cmp_2xy_15', 'rk2');
    assert.equal(full.partial, false);
    assert.equal(full.iterations.length, 5);
    assert.deepEqual(full.iterations.slice(0, 2).map((it) => it.yText), m.iterations.map((it) => it.yText));
  });

  it('upTo is clamped to 1..N', () => {
    assert.equal(build('a1', 'taylor', { upTo: 99 }).iterations.length, 3);
    assert.equal(build('a1', 'taylor', { upTo: 0 }).iterations.length, 1);
  });

  it('ask decides between "Hallar y(xf)" and the interval, for the statement and for the closing', () => {
    const asValue = build('a2', 'euler', { ask: 'value' });
    assert.equal(asValue.statement.parts.at(-1).say, 'Hallar $y(1)$');
    assert.equal(asValue.closing, 'Hallamos el valor que nos pedía el enunciado, por lo tanto el ejercicio termina aquí.');
    const asInterval = build('a1', 'taylor', { ask: 'interval' });
    assert.deepEqual(asInterval.statement.parts.map((p) => p.tex), ["f(x, y(x)) = y' = 2xy", T`1 \le x \le 1.3`, 'h = 0.1', 'y(1) = 1']);
    assert.match(asInterval.closing, /^Llegamos al valor de "y"/);
    // the cátedra's choice for its own examples, and "Hallar y(xf)" for everything else
    assert.equal(build('a3', 'heun').problem.ask, 'interval');
    assert.equal(build('p5_3a', 'heun').problem.ask, 'value');
    assert.equal(sm.build(problems.make({ fStr: 'x+y', x0: 0, y0: 1, xf: 1, h: 0.5 }), 'euler').problem.ask, 'value');
  });

  it('the remaining-iterations clause counts in words, and a single iteration has none', () => {
    const one = sm.build(problems.make({ fStr: 'x+y', x0: 0, y0: 1, xf: 0.5, h: 0.5 }), 'euler');
    assert.equal(one.iterations.length, 1);
    assert.doesNotMatch(one.iterations[0].parts.find((p) => p.kind === 'note').say, /faltan?\b/);
    assert.match(one.domain.parts.at(-1).say, /\$1\$ iteración,/);
    assert.match(build('p5_2a', 'euler').iterations[0].parts.find((p) => p.kind === 'note').say, /nos faltan nueve iteraciones más/);
  });

  it('Taylor of degree 3 and 4 is an extension: y\'\'\' appears in the formulas and the engine\'s values are used', () => {
    const p = problems.fromPreset('a1');
    const m = sm.build(p, 'taylor', { order: 3, mode: 'trunc', number: 1 });
    assert.deepEqual([m.method.order, m.method.extension], [3, true]);
    assert.match(m.title, /Taylor de grado 3\.$/);
    assert.match(m.generic.parts.find((x) => x.kind === 'generic').tex, /\\frac\{h\^\{3\}\}\{3!\}\\,y_n'''/);
    const sol = methods.solve('taylor', p, { order: 3 });
    m.iterations.forEach((it, i) => near(it.y, sol.ys[i + 1], 1e-12));
    assert.match(byKind(m.iterations[0], 'replace').tex, /\\frac\{\(0\.1\)\^\{3\}\}\{3!\}/);
    const m4 = sm.build(p, 'taylor', { order: 4 });
    assert.match(m4.generic.parts.find((x) => x.kind === 'generic').tex, /y_n\^\{\(4\)\}/);
    assert.deepEqual(m4.summary.columns.map((c) => c.head), ["y_n'", "y_n''", "y_n'''", 'y_n^{(4)}']);
  });

  it('beyond the tenth iteration the label is "Iteración n=..."', () => {
    const m = sm.build(problems.make({ fStr: 'y', x0: 0, y0: 1, xf: 1.2, h: 0.1 }), 'euler');
    assert.equal(m.iterations.length, 12);
    assert.deepEqual(m.iterations.slice(0, 10).map((it) => it.label), [
      'Primer iteración', 'Segunda iteración', 'Tercer iteración', 'Cuarta iteración', 'Quinta iteración',
      'Sexta iteración', 'Séptima iteración', 'Octava iteración', 'Novena iteración', 'Décima iteración',
    ]);
    assert.deepEqual(m.iterations.slice(10).map((it) => [it.label, it.ordinal]), [['Iteración n=10', false], ['Iteración n=11', false]]);
    assert.equal(byKind(m.iterations[10], 'result').tex, 'y_{11} = 2.8531 = y(x_{11}) = y(1.1)');
  });

  it('a long list of abscissas is abbreviated with dots', () => {
    const m = build('p5_2a', 'euler');
    assert.equal(m.domain.N, 10);
    assert.equal(m.abscissas.truncated, true);
    const tex = m.abscissas.parts.map((p) => p.tex);
    assert.equal(tex[0], 'x_0 = 0');
    assert.ok(tex.includes(T`\vdots`));
    assert.equal(tex.at(-1), 'x_{10} = x_9 + h = 1');
    assert.equal(build('a1', 'taylor').abscissas.truncated, false);
  });

  it('wrong methods and orders fail with the engine\'s Spanish message', () => {
    assert.throws(() => build('a1', 'nope'), /Método desconocido/);
    assert.throws(() => sm.build(problems.fromPreset('a1'), 'taylor', { order: 7 }), /orden de Taylor/);
  });

  it('a run that stops being finite explains it and keeps the finite part', () => {
    const p = problems.make({ fStr: 'y^2', x0: 0, y0: 3, xf: 10, h: 1 });
    const m = sm.build(p, 'euler');
    assert.equal(m.diverged, true);
    assert.ok(m.message.length > 0);
    assert.ok(m.iterations.length < 10 && m.iterations.length >= 5);
    assert.equal(m.closing, null);
    assert.equal(m.verification, null);
  });
});

describe('exercise(idOrProblem, methodId, opts)', () => {
  it('resolves a preset and uses its own method when none is given', () => {
    const r = sm.exercise('a4', undefined, { number: 4 });
    assert.equal(r.problem.id, 'a4');
    assert.equal(r.solution.method, 'rk2');
    assert.equal(r.model.method.id, 'rk2');
    assert.match(r.model.title, /^Ejercicio nro 4:/);
    near(r.solution.ys[3], r.model.iterations[2].y, 0);
  });

  it('takes an explicit method, the preset\'s Taylor order, a Problem object or a spec', () => {
    assert.equal(sm.exercise('a4', 'heun').solution.method, 'heun');
    assert.equal(sm.exercise('p5_1a').solution.method, 'taylor');
    assert.equal(sm.exercise('p5_1a').model.method.order, 2);
    assert.equal(sm.exercise(problems.fromPreset('p6_1c')).model.method.id, 'rk2');
    const spec = { fStr: '2*x*y', x0: 1, y0: 1, xf: 1.3, h: 0.1 };
    assert.equal(sm.exercise(spec, 'rk2').model.iterations.length, 3);
    assert.throws(() => sm.exercise('no_existe', 'rk2'), /No existe el ejemplo/);
  });

  it('falls back to Taylor for a case without its own method (the comparison cases)', () => {
    const r = sm.exercise('cmp_2xy_13');
    assert.equal(r.solution.method, 'taylor');
    assert.equal(r.model.method.id, 'taylor');
  });
});

/* ======================================================================================================
   Every preset, every method: the model builds, and its text is well-formed
   ====================================================================================================== */

describe('all presets x all four methods', () => {
  const cases = [];
  problems.PRESETS.forEach((spec) => {
    METHOD_IDS.forEach((id) => cases.push([spec.id, id]));
  });

  it('builds for the 28 presets with the method each one requests, in both modes, without throwing', () => {
    assert.equal(problems.PRESETS.length, 28);
    let built = 0;
    problems.PRESETS.filter((s) => s.method).forEach((s) => {
      ['trunc', 'round'].forEach((mode) => {
        const m = build(s.id, s.method, { mode, order: s.order });
        assert.equal(m.method.id, s.method);
        assert.equal(m.iterations.length, problems.fromPreset(s.id).N, s.id);
        built += 1;
      });
    });
    assert.ok(built >= 40, `built ${built}`);
  });

  it('builds for every preset with every one of the four methods (including t problems and Taylor presets)', () => {
    cases.forEach(([pid, method]) => {
      const m = build(pid, method, { mode: 'trunc', number: 1 });
      assert.ok(m.iterations.length >= 1, `${pid}/${method}`);
      assert.equal(m.diverged, false, `${pid}/${method} diverged`);
    });
  });

  it('every TeX string is well-formed: braces and \\left/\\right pair up, only known commands, no leaked sentinels, NaN or undefined', () => {
    cases.forEach(([pid, method]) => {
      const m = build(pid, method, { mode: pid.length % 2 ? 'trunc' : 'round' });
      allTex(m).forEach((tex) => {
        assert.ok(balanced(tex), `${pid}/${method}: unbalanced ${tex}`);
        assert.ok(!/undefined|NaN|Infinity|\[object|e\+\d|\\times|10\^\{/.test(tex), `${pid}/${method}: bad text ${tex}`);
        (tex.match(/\\([A-Za-z]+)/g) || []).forEach((c) => assert.ok(KNOWN_COMMANDS.has(c.slice(1)), `${pid}/${method}: unknown command ${c} in ${tex}`));
        assert.doesNotMatch(tex, /\d{9,}/, `${pid}/${method}: a number leaked ${tex}`);
      });
    });
  });

  it('every say text closes its math delimiters ($...$ pairs) and has no TeX outside them', () => {
    cases.forEach(([pid, method]) => {
      const m = build(pid, method);
      allParts(m).forEach((part) => {
        if (!part.say) return;
        assert.equal((part.say.match(/\$/g) || []).length % 2, 0, `${pid}/${method}: ${part.say}`);
        assert.doesNotMatch(part.say.replace(/\$[^$]*\$/g, ''), /\\[A-Za-z]|[_^{}]/, `${pid}/${method}: raw TeX outside $ in ${part.say}`);
      });
    });
  });

  it('every iteration result equals the engine value formatted in the asked mode, and the summary agrees', () => {
    cases.forEach(([pid, method]) => {
      ['trunc', 'round'].forEach((mode) => {
        const problem = problems.fromPreset(pid);
        const m = sm.build(problem, method, { mode });
        const sol = methods.solve(method, problem);
        m.iterations.forEach((it, i) => {
          assert.equal(it.y, sol.ys[i + 1]);
          assert.equal(it.yText, sm.showValue(sol.ys[i + 1], { mode, decimals: 4 }), `${pid}/${method}/${mode}`);
          assert.ok(byKind(it, 'result').tex.includes(` = ${it.yText} = `), byKind(it, 'result').tex);
          assert.equal(m.summary.rows[i + 1].yText, it.yText);
        });
        assert.equal(m.summary.rows.length, sol.N + 1);
        assert.equal(m.summary.final.yText, m.iterations.at(-1).yText);
      });
    });
  });

  it('keeps the layout parts in order for each method', () => {
    const order = { euler: ['intro', 'where', 'replace', 'result'], taylor: ['intro', 'replace', 'result'], heun: ['intro', 'where', 'predictor', 'replace', 'result'], rk2: ['intro', 'where', 'replace', 'result'] };
    METHOD_IDS.forEach((id) => {
      const m = build('a1', id);
      m.iterations.forEach((it, i) => assert.deepEqual(kinds(it).filter((k) => k !== 'note'), order[id], `${id} n=${i}`));
    });
  });

  it('uses the independent variable the problem declares (t problems print t and never x)', () => {
    ['a2', 'p5_1d', 'p5_3e'].forEach((pid) => {
      METHOD_IDS.forEach((method) => {
        const m = build(pid, method);
        const text = allTex(m).join('\n');
        assert.ok(!/x_|\bx\b/.test(text.replace(/\\operatorname\{[a-z]+\}|\\exp|\\max/g, '')), `${pid}/${method}: x in ${text.slice(0, 200)}`);
        assert.ok(/t_0/.test(text), `${pid}/${method}`);
      });
    });
  });
});

/* ======================================================================================================
   EDO.steps.render with a stand-in DOM
   ====================================================================================================== */

/** A tiny DOM: elements are objects with children (strings stay strings), with the calls the renderer makes. */
class El {
  constructor(tag, attrs, children) {
    this.nodeType = 1;
    this.tag = tag;
    this.attrs = attrs || {};
    this.children = children || [];
    this.parent = null;
    this.children.forEach((c) => { if (c && c.nodeType) c.parent = this; });
  }

  get firstChild() { return this.children[0] || null; }

  get parentNode() { return this.parent; }

  appendChild(node) {
    if (node && node.parent) node.parent.removeChild(node);
    this.children.push(node);
    if (node && node.nodeType) node.parent = this;
    return node;
  }

  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    if (node && node.nodeType) node.parent = null;
    return node;
  }

  setAttribute(k, v) { this.attrs[k] = v; }

  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }

  addEventListener() {}
}

function makeDom() {
  const flatten = (list) => list.flatMap((child) => (Array.isArray(child) ? flatten(child) : [child]))
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true);
  let counter = 0;
  return {
    h(tag, ...rest) {
      const first = rest[0];
      const hasAttrs = first && typeof first === 'object' && !first.nodeType && !Array.isArray(first);
      return new El(tag, hasAttrs ? first : {}, flatten(hasAttrs ? rest.slice(1) : (first === null || first === undefined ? rest.slice(1) : rest)));
    },
    clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; },
    uid(prefix) { counter += 1; return `${prefix || 'edo'}-${counter}`; },
  };
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
const joinedText = (node) => textNodes(node).join('');
const find = (node, predicate) => {
  const out = [];
  walk(node, (n) => { if (n && typeof n === 'object' && n.tag && predicate(n)) out.push(n); });
  return out;
};
const hasClass = (el, name) => String((el.attrs && el.attrs.class) || '').split(/\s+/).includes(name);

function mountSteps(model, opts) {
  const hydrated = [];
  steps._env.dom = makeDom();
  steps._env.tex = { hydrate: (el) => { hydrated.push(el); } };
  const container = new El('div');
  const handle = steps.render(container, model, opts);
  return { container, handle, hydrated };
}

describe('EDO.steps.render', () => {
  const taylor = build('a1', 'taylor', { mode: 'trunc', number: 1 });

  it('renders the apunte\'s layout: a title, the statement, the planteo, the Ordenada Genérica, one .step-block per iteration, the summary and the Verificación', () => {
    const { container, handle, hydrated } = mountSteps(taylor);
    const root = handle.element;
    assert.equal(container.children[0], root);
    assert.equal(root.tag, 'article');
    assert.ok(hasClass(root, 'steps-solution'));
    assert.equal(root.attrs['data-method'], 'taylor');
    const [title] = find(root, (n) => n.tag === 'h2');
    assert.equal(joinedText(title), taylor.title);
    assert.equal(root.attrs['aria-labelledby'], title.attrs.id);
    const blocks = find(root, (n) => hasClass(n, 'step-block'));
    assert.equal(blocks.length, 2 + 3, 'planteo + Ordenada Genérica + three iterations');
    const heads = find(root, (n) => hasClass(n, 'step-block__title')).map(joinedText);
    assert.deepEqual(heads, ['Condición inicial y dominio', 'Ordenada Genérica', 'Primer iteración', 'Segunda iteración', 'Tercer iteración']);
    assert.deepEqual(find(root, (n) => hasClass(n, 'step-block__n')).map(joinedText), ['n = 0', 'n = 1', 'n = 2']);
    assert.ok(hydrated.includes(root), 'math is hydrated');
    handle.destroy();
  });

  it('puts every formula in a .formula (display math in $$) and the generic and the results in the highlighter', () => {
    const { handle } = mountSteps(taylor);
    const root = handle.element;
    const formulas = find(root, (n) => hasClass(n, 'formula'));
    assert.ok(formulas.length > 15);
    formulas.forEach((f) => assert.match(joinedText(f), /^\$\$[\s\S]+\$\$$/));
    assert.equal(find(root, (n) => hasClass(n, 'formula') && hasClass(n, 'hl')).length, 2, 'the two Ordenada Genérica formulas');
    const marks = find(root, (n) => n.tag === 'mark' && hasClass(n, 'hl'));
    assert.deepEqual(marks.map(joinedText), ['$y_1 = 1.23 = y(x_1) = y(1.1)$', '$y_2 = 1.5426 = y(x_2) = y(1.2)$', '$y_3 = 1.9727 = y(x_3) = y(1.3)$']);
    handle.destroy();
  });

  it('shows "Esto se lee así" once, the closing, and the display notice', () => {
    const { handle } = mountSteps(taylor);
    const root = handle.element;
    const text = joinedText(root);
    assert.equal((text.match(/Esto se lee así/g) || []).length, 1);
    assert.ok(text.includes(taylor.closing));
    assert.ok(text.includes(taylor.display.notice));
    handle.destroy();
  });

  it('adds a compact summary table with numeric cells, and the Verificación inside the extension callout with the Ampliación badge', () => {
    const { handle } = mountSteps(taylor);
    const root = handle.element;
    const [wrap] = find(root, (n) => hasClass(n, 'table-wrap'));
    assert.equal(wrap.attrs.role, 'region');
    assert.equal(wrap.attrs.tabindex, '0');
    const [table] = find(wrap, (n) => n.tag === 'table');
    assert.equal(find(table, (n) => n.tag === 'tr').length, 1 + 4, 'header + n = 0..3');
    const nums = find(table, (n) => n.tag === 'td' && hasClass(n, 'num')).map(joinedText);
    assert.ok(nums.includes('1.9727') && nums.includes('1.5426'));
    assert.ok(find(table, (n) => n.tag === 'th' && n.attrs.scope === 'col').length >= 5);
    assert.equal(find(table, (n) => n.tag === 'tr' && n.attrs['data-hl']).length, 1, 'the final row is highlighted');
    const [callout] = find(root, (n) => hasClass(n, 'callout') && n.attrs['data-kind'] === 'extension');
    const label = joinedText(callout);
    assert.match(label, /Verificación/);
    assert.ok(find(callout, (n) => hasClass(n, 'badge')).map(joinedText).includes('Ampliación'));
    assert.ok(label.includes(taylor.verification.exactText) && label.includes(taylor.verification.absText));
    handle.destroy();
  });

  it('headingLevel moves every heading (default 2: title, 3: the blocks)', () => {
    const a = mountSteps(taylor).handle;
    assert.ok(find(a.element, (n) => n.tag === 'h2').length === 1);
    assert.ok(find(a.element, (n) => n.tag === 'h3').length >= 5);
    a.destroy();
    const b = mountSteps(taylor, { headingLevel: 3 }).handle;
    assert.ok(find(b.element, (n) => n.tag === 'h3').length === 1);
    assert.ok(find(b.element, (n) => n.tag === 'h4').length >= 5);
    assert.equal(find(b.element, (n) => n.tag === 'h2').length, 0);
    b.destroy();
  });

  it('collapsible makes every iteration a <details open> with its heading inside the summary', () => {
    const { handle } = mountSteps(taylor, { collapsible: true });
    const details = find(handle.element, (n) => n.tag === 'details');
    assert.equal(details.length, 3);
    details.forEach((d) => {
      assert.equal(d.attrs.open, true);
      assert.ok(hasClass(d, 'step-block'));
      assert.equal(find(d, (n) => n.tag === 'summary').length, 1);
    });
    assert.deepEqual(details.map((d) => joinedText(find(d, (n) => hasClass(n, 'step-block__title'))[0])), ['Primer iteración', 'Segunda iteración', 'Tercer iteración']);
    const plain = mountSteps(taylor).handle;
    assert.equal(find(plain.element, (n) => n.tag === 'details').length, 0);
    plain.destroy();
    handle.destroy();
  });

  it('update(model) re-renders in place: same element, new numbers (round mode), hydrated again', () => {
    const { container, handle, hydrated } = mountSteps(taylor);
    const root = handle.element;
    const before = joinedText(root);
    assert.ok(before.includes('y_3 = 1.9727'));
    const rounded = build('a1', 'taylor', { mode: 'round', number: 1 });
    handle.update(rounded);
    assert.equal(handle.element, root);
    assert.equal(container.children.length, 1);
    const after = joinedText(root);
    assert.ok(after.includes('y_3 = 1.9728'));
    assert.ok(!after.includes('y_3 = 1.9727'));
    assert.ok(after.includes('redondeados a 4 decimales'));
    assert.equal(root.attrs['data-mode'], 'round');
    assert.ok(hydrated.filter((e) => e === root).length >= 2);
    // a different method on the same handle
    handle.update(build('a3', 'heun', { number: 3 }));
    assert.equal(root.attrs['data-method'], 'heun');
    assert.match(joinedText(root), /Ejercicio nro 3/);
    handle.destroy();
  });

  it('destroy() removes the element and makes the handle inert; an aborted signal does the same', () => {
    const { container, handle } = mountSteps(taylor);
    assert.equal(container.children.length, 1);
    handle.destroy();
    assert.equal(container.children.length, 0);
    assert.doesNotThrow(() => handle.destroy());
    assert.doesNotThrow(() => handle.update(taylor));
    assert.equal(container.children.length, 0);

    const controller = new AbortController();
    const live = mountSteps(taylor, { signal: controller.signal });
    assert.equal(live.container.children.length, 1);
    controller.abort();
    assert.equal(live.container.children.length, 0);

    const gone = new AbortController();
    gone.abort();
    const inert = mountSteps(taylor, { signal: gone.signal });
    assert.equal(inert.container.children.length, 0);
    assert.equal(inert.handle.element, null);
    assert.doesNotThrow(() => inert.handle.update(taylor));
  });

  it('renders every method and a partial model (no closing, no summary final claim) without throwing', () => {
    METHOD_IDS.forEach((id) => {
      const { handle } = mountSteps(build('a1', id, { number: 1 }));
      assert.match(joinedText(handle.element), /Ejercicio nro 1/);
      handle.destroy();
    });
    const partial = mountSteps(build('cmp_2xy_15', 'heun', { upTo: 2 })).handle;
    const text = joinedText(partial.element);
    assert.ok(!text.includes('termina aquí'));
    assert.match(text, /Primer iteración/);
    assert.ok(!/Tercer iteración/.test(text));
    partial.destroy();
  });

  it('refuses a missing container or DOM with a clear message', () => {
    steps._env.dom = makeDom();
    steps._env.tex = { hydrate() {} };
    assert.throws(() => steps.render(null, taylor), /falta el elemento contenedor/);
    steps._env.dom = null;
    assert.throws(() => steps.render(new El('div'), taylor), /EDO\.dom/);
  });
});

/* ======================================================================================================
   Loading and source safety
   ====================================================================================================== */

describe('how the two modules are loaded and written', () => {
  const sandboxWith = (files) => {
    const sandbox = {};
    vm.createContext(sandbox);
    files.forEach((file) => vm.runInContext(read(...file), sandbox, { filename: file.at(-1) }));
    return sandbox;
  };
  const numerics = ['expr', 'format', 'problems', 'methods', 'analysis'].map((n) => ['js', 'numerics', `${n}.js`]);

  it('steps-model.js is pure: as a classic script it attaches EDO.stepsModel with no DOM, window or document', () => {
    const g = sandboxWith(numerics.concat([['js', 'ui', 'steps-model.js']]));
    assert.equal(typeof g.EDO.stepsModel.build, 'function');
    assert.equal(typeof g.EDO.stepsModel.exercise, 'function');
    const model = g.EDO.stepsModel.exercise('a1', 'taylor', { number: 1 }).model;
    assert.equal(model.iterations[2].yText, '1.9727');
    const code = read('js', 'ui', 'steps-model.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\b(document|window|localStorage|fetch|innerHTML)\b/.test(code), 'steps-model.js touches the DOM');
  });

  it('steps.js attaches EDO.steps as a classic script and reads EDO.dom and EDO.tex only when it renders', () => {
    const g = sandboxWith(numerics.concat([['js', 'ui', 'steps-model.js'], ['js', 'ui', 'steps.js']]));
    assert.equal(typeof g.EDO.steps.render, 'function');
    assert.equal(typeof g.EDO.steps.build, 'function');
    assert.throws(() => g.EDO.steps.render({ nodeType: 1 }, {}), /EDO\.dom/);
  });

  it('index.html loads steps-model.js and then steps.js after step-diagram.js and before app.js and the pages', () => {
    const scripts = [...read('index.html').matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
    const at = (f) => scripts.indexOf(f);
    assert.ok(at('js/ui/steps-model.js') > at('js/ui/step-diagram.js'));
    assert.equal(at('js/ui/steps.js'), at('js/ui/steps-model.js') + 1);
    assert.ok(at('js/ui/steps.js') < at('js/ui/app.js'));
    assert.ok(at('js/ui/steps-model.js') > at('js/numerics/analysis.js'));
    assert.ok(at('js/ui/steps.js') > at('js/ui/tex.js') && at('js/ui/steps.js') > at('js/ui/dom.js'));
  });

  it('never evaluates strings or writes markup: no eval, new Function or innerHTML in either module', () => {
    ['steps-model.js', 'steps.js'].forEach((file) => {
      const code = read('js', 'ui', file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.ok(!/\beval\s*\(/.test(code), `${file} uses eval`);
      assert.ok(!/\bnew\s+Function\b|(^|[^.\w$])Function\s*\(/.test(code), `${file} uses the Function constructor`);
      assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code), `${file} writes markup`);
    });
  });

  it('puts its own styles in a marked block of pages.css, every selector under .steps-solution', () => {
    const css = read('css', 'pages.css');
    const begin = css.indexOf('/* ==== steps-solution: begin ==== */');
    const end = css.indexOf('/* ==== steps-solution: end ==== */');
    assert.ok(begin > -1 && end > begin, 'pages.css has the marked steps-solution block');
    const block = css.slice(begin, end);
    assert.ok(block.length > 800, 'the block has content');
    const selectors = [...block.matchAll(/^([^\s@/}][^{]*)\{/gm)].map((m) => m[1].trim());
    assert.ok(selectors.length > 15);
    selectors.forEach((s) => s.split(',').forEach((one) => assert.match(one.trim(), /^(\.steps-solution|html\[[^\]]+\] \.steps-solution)/, `selector ${one.trim()} is outside the namespace`)));
  });
});
