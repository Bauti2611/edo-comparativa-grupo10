'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, prng, between, near, texIssues } = require('./helpers.js');

const E = load('expr');
const { N } = E;

const val = (src, env, opts) => E.evalNode(E.parse(src, opts), env);
const tex = (src, opts) => E.toTeX(E.parse(src, opts && opts.indep ? { indep: opts.indep } : undefined), opts);
const simp = (src) => E.simplify(E.parse(src));
const str = (node) => E.toString(node);

function parseError(src, opts) {
  try {
    E.parse(src, opts);
  } catch (err) {
    return err;
  }
  return assert.fail(`Expected a parse error for ${JSON.stringify(src)}`);
}

describe('parser: literals, precedence and grouping', () => {
  it('reads decimal literals, scientific notation and decimal commas', () => {
    assert.equal(val('.5'), 0.5);
    assert.equal(val('5.'), 5);
    assert.equal(val('1e-3'), 0.001);
    assert.equal(val('1.5E+2'), 150);
    assert.equal(val('2,5*x', { x: 2 }), 5);
  });

  it('gives unary minus lower precedence than ^', () => {
    assert.equal(val('-x^2', { x: 3 }), -9);
    assert.equal(val('(-x)^2', { x: 3 }), 9);
    assert.equal(val('-2^2'), -4);
    assert.equal(val('2^-x', { x: 3 }), 0.125);
    assert.equal(val('2^-x^2', { x: 2 }), 2 ** -4);
    assert.equal(val('x^-1', { x: 4 }), 0.25);
    assert.equal(val('e^-t', { x: 2 }, { indep: 't' }), Math.exp(-2));
    assert.equal(val('--x', { x: 5 }), 5);
    assert.equal(val('x*-y', { x: 2, y: 3 }), -6);
    assert.equal(val('x/-y', { x: 6, y: 3 }), -2);
  });

  it('is right-associative for ^ and **', () => {
    assert.equal(val('2^3^2'), 512);
    assert.equal(val('2**3**2'), 512);
    assert.equal(val('x**2', { x: 3 }), 9);
  });

  it('evaluates sums and products left to right', () => {
    assert.equal(val('2-3-4'), -5);
    assert.equal(val('8/2*4'), 16);
    assert.equal(val('2/4/2'), 0.25);
    assert.equal(val('1/2x', { x: 4 }), 2, 'implicit multiplication has the precedence of * and /');
  });

  it('accepts braces and brackets as grouping, matching their closers', () => {
    assert.equal(val('e^{-t}', { x: 1 }, { indep: 't' }), Math.exp(-1));
    assert.equal(val('2[x+1]', { x: 2 }), 6);
    assert.equal(val('sen{x}', { x: 1 }), Math.sin(1));
    assert.equal(parseError('(2]').pos, 2);
  });
});

describe('parser: implicit multiplication', () => {
  const at = { x: 2, y: 3 };
  const cases = [
    ['2xy', 12], ['-3x^2 y', -36], ['2(x+1)', 6], ['(x+1)(x-1)', 3], ['xy', 6], ['2x^2y', 24],
    ['x y', 6], ['x(y)', 6], ['(1/4)(1+y^2)', 2.5], ['2x(y+1)', 16], ['y(x+1)(x-1)', 9],
  ];
  for (const [src, expected] of cases) {
    it(`parses ${src}`, () => assert.equal(val(src, at), expected));
  }

  it('multiplies by functions and constants', () => {
    near(val('x sin(x)', at), 2 * Math.sin(2), 1e-15);
    near(val('xsin(x)', at), 2 * Math.sin(2), 1e-15);
    near(val('2sin(x)cos(x)', at), 2 * Math.sin(2) * Math.cos(2), 1e-15);
    near(val('2pi x', at), 4 * Math.PI, 1e-14);
    near(val('xe', at), 2 * Math.E, 1e-14);
    near(val('e^{-x}sen(x)', at), Math.exp(-2) * Math.sin(2), 1e-15);
  });

  it('splits letters that are not a function name into variables', () => {
    assert.equal(str(E.parse('xy')), 'x*y');
    assert.equal(str(E.parse('yxy')), 'y*x*y');
    assert.equal(val('exy', at), Math.E * 6, 'e times x times y');
  });
});

describe('parser: functions, constants and variables', () => {
  const x = 0.4;
  const table = [
    ['sin', Math.sin], ['sen', Math.sin], ['cos', Math.cos], ['tan', Math.tan],
    ['asin', Math.asin], ['arcsin', Math.asin], ['arcsen', Math.asin], ['acos', Math.acos], ['arccos', Math.acos],
    ['atan', Math.atan], ['arctan', Math.atan], ['sinh', Math.sinh], ['senh', Math.sinh], ['cosh', Math.cosh],
    ['tanh', Math.tanh], ['exp', Math.exp], ['ln', Math.log], ['log', Math.log10], ['log10', Math.log10],
    ['sqrt', Math.sqrt], ['abs', Math.abs],
  ];
  for (const [name, impl] of table) {
    it(`evaluates ${name}`, () => near(val(`${name}(x)`, { x }), impl(x), 1e-15));
  }

  it('uses ln as the natural logarithm and log as base 10', () => {
    near(val('ln(e)'), 1, 1e-15);
    near(val('log(100)'), 2, 1e-15);
    near(val('log10(1000)'), 3, 1e-15);
  });

  it('knows e and pi, except that e is the variable when it is declared independent', () => {
    assert.equal(val('pi'), Math.PI);
    assert.equal(val('e'), Math.E);
    assert.equal(val('e^2', { x: 3 }, { indep: 'e' }), 9);
    assert.equal(val('e^2', { x: 3 }), Math.E ** 2);
  });

  it('uses t as the independent variable when asked and stores it as x', () => {
    const node = E.parse('t*y', { indep: 't' });
    assert.equal(E.evalNode(node, { x: 3, y: 4 }), 12);
    assert.equal(E.toTeX(node, { indep: 't' }), 'ty');
    assert.equal(E.toString(node, { indep: 't' }), 't*y');
  });

  it('ignores case and accepts typographic symbols', () => {
    assert.equal(val('X*Y', { x: 2, y: 3 }), 6);
    near(val('SEN(X)', { x: 1 }), Math.sin(1), 1e-15);
    near(val('π*x', { x: 2 }), 2 * Math.PI, 1e-14);
    assert.equal(val('2×x', { x: 3 }), 6);
    assert.equal(val('3·x', { x: 3 }), 9);
    assert.equal(val('x−1', { x: 3 }), 2);
    assert.equal(val('6÷x', { x: 3 }), 2);
  });
});

describe('parser: errors (Spanish message with the position)', () => {
  const table = [
    ['2z', 1, /'z'.*posición 2/],
    ['2+', 2, /termina de forma inesperada/],
    ['(2', 0, /Falta cerrar.*posición 1/],
    ['', 0, /vacía/],
    ['   ', 0, /vacía/],
    ['2 3', 2, /Falta un operador antes de '3' \(posición 3\)/],
    ['sin x', 0, /necesita su argumento entre paréntesis/],
    ['x=2', 1, /sin el signo '='/],
    ['2)', 1, /sin abrir \(posición 2\)/],
    ['x^', 2, /termina de forma inesperada/],
    ['@', 0, /Carácter no válido '@' \(posición 1\)/],
    ['(2]', 2, /Se esperaba '\)'.*encontró '\]'/],
    ['sec(x)', 0, /función 'sec' no está disponible/],
    ['()', 1, /Se esperaba un valor/],
    ['2 x y z', 6, /Identificador desconocido 'z'/],
    ['x + foo(2)', 4, /'foo'/],
    ['2*', 2, /termina de forma inesperada/],
    ['2^*3', 2, /Se esperaba un número, una variable o '\('/],
  ];
  for (const [src, pos, pattern] of table) {
    it(`rejects ${JSON.stringify(src)}`, () => {
      const err = parseError(src);
      assert.ok(err instanceof E.EDOParseError);
      assert.ok(err instanceof E.EDOError);
      assert.equal(err.pos, pos);
      assert.match(err.message, pattern);
    });
  }

  it('explains a variable that is not the declared independent one', () => {
    const err = parseError('2x', { indep: 't' });
    assert.match(err.message, /'x'/);
    assert.match(err.message, /'t'/);
    assert.equal(err.pos, 1);
  });

  it('rejects absurdly long or deeply nested input instead of overflowing the stack', () => {
    assert.match(parseError('x+'.repeat(300)).message, /demasiado larga/);
    assert.match(parseError(`${'('.repeat(100)}x${')'.repeat(100)}`).message, /anidados/);
  });

  it('rejects non-string input and invalid independent variables', () => {
    assert.ok(parseError(5) instanceof E.EDOParseError);
    assert.throws(() => E.parse('x', { indep: 'y' }), E.EDOError);
    assert.throws(() => E.parse('x', { indep: 'xy' }), E.EDOError);
  });

  it('turns every code-like string into a parse error instead of running anything', () => {
    const hostile = ['process', 'require("fs")', 'constructor', '__proto__', 'globalThis', 'x;y', '`x`',
      'alert(1)', 'while(1)', 'x.y', 'a=>1', '{}', 'this', 'eval', 'Function', "x['a']"];
    for (const src of hostile) {
      assert.throws(() => E.parse(src), E.EDOParseError, src);
    }
  });
});

describe('compile and evalNode', () => {
  it('takes (x, y) in that order and builds independent closures', () => {
    const f = E.compile(E.parse('x - y'));
    const g = E.compile(E.parse('y - x'));
    assert.equal(f(5, 2), 3);
    assert.equal(g(5, 2), -3);
    assert.equal(f(1, 1), 0);
  });

  it('follows IEEE semantics outside the domain', () => {
    assert.equal(val('1/x', { x: 0 }), Infinity);
    assert.ok(Number.isNaN(val('sqrt(x)', { x: -1 })));
    assert.ok(Number.isNaN(val('ln(x)', { x: -1 })));
    assert.ok(Number.isNaN(val('x', {})));
  });

  it('evaluates x^2, 1/x and sqrt shortcuts like Math.pow', () => {
    assert.equal(val('x^2', { x: -3 }), 9);
    assert.equal(val('x^-1', { x: 8 }), 0.125);
    assert.equal(val('x^0.5', { x: 9 }), 3);
    assert.equal(val('x^1.5', { x: 4 }), 8);
  });

  it('refuses nodes that are not part of the AST (no dynamic lookup of function names)', () => {
    assert.throws(() => E.compile({ t: 'fn', name: 'constructor', arg: N.num(1) }), E.EDOError);
    assert.throws(() => E.compile({ t: 'fn', name: '__proto__', arg: N.num(1) }), E.EDOError);
    assert.throws(() => E.compile({ t: 'bogus' }), E.EDOError);
  });
});

describe('simplify', () => {
  const identities = [
    ['x + 0', 'x'], ['0 + x*1', 'x'], ['x*0', '0'], ['x^1', 'x'], ['x^0', '1'], ['x - x', '0'],
    ['2*x + 3*x', '5*x'], ['x*x', 'x^2'], ['x^2*x^3', 'x^5'], ['2*x*(2*x*y)', '4*x^2*y'],
    ['exp(x)*exp(y)', 'exp(x + y)'], ['exp(x)*exp(-x)', '1'], ['e^x*e^x', 'exp(2*x)'],
    ['sqrt(x)*sqrt(x)', 'x'], ['x/x', '1'], ['(x*y)/y', 'x'], ['x^2/x', 'x'], ['x*y/(y*x)', '1'],
    ['2*3*x', '6*x'], ['4^0.5', '2'], ['(-2)^3', '-8'], ['2^-2', '1/4'], ['1/2 + 1/3', '5/6'], ['2/4', '1/2'],
    ['x*y*x', 'x^2*y'], ['y*x', 'x*y'], ['--x', 'x'], ['y^2*x^2*y', 'x^2*y^3'], ['x^y*x^y', 'x^(2*y)'],
    ['x^y/x^y', '1'], ['2^x*2^x', '2^(2*x)'], ['(x^2)^3', 'x^6'], ['(x*y)^2', 'x^2*y^2'], ['(2*x)^2', '4*x^2'],
    ['(2*x)^-1', '1/(2*x)'], ['1/x + 1/x', '2/x'], ['0.5*x + 0.25*x', '0.75*x'], ['-2/4*x', '-x/2'],
    ['exp(ln(x))', 'x'], ['ln(exp(x))', 'x'], ['ln(e)', '1'], ['sin(0) + cos(0)', '1'], ['abs(-3)', '3'],
    ['abs(abs(x))', 'abs(x)'], ['sqrt(4)', '2'], ['log(10)', '1'], ['log(1)', '0'], ['sqrt(x^2)', 'sqrt(x^2)'],
  ];
  for (const [src, expected] of identities) {
    it(`${src} -> ${expected}`, () => assert.equal(str(simp(src)), expected));
  }

  it('merges equal bases, including sums and function calls', () => {
    assert.equal(str(simp('(x+1)^2*(x+1)')), '(x + 1)^3');
    assert.equal(str(simp('(x+y)*(x+y)')), '(x + y)^2');
    assert.equal(str(simp('sin(x)*sin(x)')), 'sin(x)^2');
    assert.equal(str(simp('3*(x + y) - 3*(x + y)')), '0');
  });

  it('expands polynomial products and keeps other products factored', () => {
    assert.equal(str(simp('(x+1)*(x-1)')), 'x^2 - 1');
    assert.equal(str(simp('2*x*y*(2 + 4*x^2)')), '4*x*y + 8*x^3*y');
    assert.equal(str(simp('x*(x+1) - x^2')), 'x');
    assert.equal(str(simp('(x+y)/x')), 'y/x + 1');
    assert.equal(str(simp('-(x+y)')), '-x - y');
    assert.equal(str(simp('2*(x+y)')), '2*(x + y)');
    assert.equal(str(simp('(x+y)^2')), '(x + y)^2');
    assert.equal(str(simp('sin(x)*(1+x)')), 'sin(x)*(x + 1)');
  });

  it('orders terms readably: constants last, leading minus avoided', () => {
    assert.equal(str(simp('-y + x + 1')), 'x - y + 1');
    assert.equal(str(simp('x^2 - 3*x + 2')), 'x^2 - 3*x + 2');
    assert.equal(str(simp('-x + y')), 'y - x');
    assert.equal(str(simp('-6*x*y + 9*x^4*y')), '9*x^4*y - 6*x*y');
  });

  it('keeps fractions exact (no 0.333... coefficients)', () => {
    assert.equal(E.toTeX(simp('1/2 + 1/3')), '\\frac{5}{6}');
    assert.equal(E.toTeX(simp('x/3 + x/6')), '\\frac{x}{2}');
    assert.equal(str(simp('x/3*3')), 'x');
  });

  it('returns the same object for an already simplified node', () => {
    const s = simp('x*y + 1');
    assert.equal(E.simplify(s), s);
  });
});

/** Expressions used by the simplifier and differentiation checks, with optional x and y ranges. */
const BATTERY = [
  ['2*x*y'], ['-3*x^2*y'], ['(x+y)^3'], ['x^y'], ['y^x'], ['sin(x*y)'], ['cos(x)+sin(y)'], ['tan(x*y)', [0.2, 0.9]],
  ['asin(x*y/2)', [0.1, 1.2]], ['acos(x/2)*y', [0.1, 1.5]], ['atan(x*y)'], ['sinh(x)*cosh(y)'], ['tanh(x+y)'],
  ['exp(-x*y)'], ['e^(-x^2)'], ['ln(x+y)'], ['ln(x*y)'], ['log(x^2+y)'], ['log10(x*y)'], ['sqrt(x^2+y^2)'],
  ['abs(x-2*y)', [0.2, 0.9], [1.2, 1.8]], ['(x+y)/(x-y)', [2, 3], [0.5, 1]], ['x/(1+y^2)'], ['1/(x*y)'],
  ['(x^2+y^2)^(3/2)'], ['x^2*y^3 - x*y'], ['exp(x)/(1+exp(x))'], ['sin(x)^2 + cos(y)^2'], ['2^x*y'],
  ['ln(1+x^2)*y'], ['x*sin(x)*exp(y)'], ['(1/4)*(1+y^2)'], ['sqrt(x)*y^(1/3)'], ['atan(x)/(1+y)'], ['cosh(x*y)/x'],
  ['sen(x)*cos(y)'], ['x^x'], ['(x*y)^(-2)'], ['abs(x)*y'], ['y*e^x'], ['x^(y*x)', [0.3, 1.2]], ['2*x*y*(1+x^2)'],
];

function randomPoints(rnd, dx, dy, count) {
  return Array.from({ length: count }, () => [between(rnd, dx[0], dx[1]), between(rnd, dy[0], dy[1])]);
}

describe('simplify is exact and stable over the battery', () => {
  const rnd = prng(2024);
  for (const [src, dx = [0.3, 1.7], dy = [0.3, 1.7]] of BATTERY) {
    it(`${src}: same value, idempotent, printable`, () => {
      const node = E.parse(src);
      const s = E.simplify(node);
      const f = E.compile(node);
      const g = E.compile(s);
      for (const [x, y] of randomPoints(rnd, dx, dy, 6)) {
        near(g(x, y), f(x, y), 1e-9 * (1 + Math.abs(f(x, y))), `${src} at (${x}, ${y})`);
      }
      assert.equal(E.nodeKey(E.simplify(s)), E.nodeKey(s), 'simplify(simplify(f)) must equal simplify(f)');
      assert.ok(E.toTeX(s).length > 0);
    });
  }
});

describe('differentiation against central finite differences', () => {
  const FUNCTION_NAMES = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'exp', 'ln', 'log', 'sqrt', 'abs'];

  it('the battery has at least 25 expressions and covers every supported function', () => {
    assert.ok(BATTERY.length >= 25);
    for (const name of FUNCTION_NAMES) {
      const re = new RegExp(`\\b${name}\\(`);
      assert.ok(BATTERY.some(([src]) => re.test(src)), `no battery expression uses ${name}`);
    }
  });

  const rnd = prng(777);
  const H = 1e-5;
  for (const [src, dx = [0.3, 1.7], dy = [0.3, 1.7]] of BATTERY) {
    for (const v of ['x', 'y']) {
      it(`d/d${v} of ${src}`, () => {
        const node = E.parse(src);
        const f = E.compile(node);
        const d = E.compile(E.diff(node, v));
        for (const [x, y] of randomPoints(rnd, dx, dy, 8)) {
          const numeric = v === 'x' ? (f(x + H, y) - f(x - H, y)) / (2 * H) : (f(x, y + H) - f(x, y - H)) / (2 * H);
          near(d(x, y), numeric, 1e-6 * (1 + Math.abs(numeric)), `${src} d/d${v} at (${x.toFixed(3)}, ${y.toFixed(3)})`);
        }
      });
    }
  }

  it('prints common derivatives readably', () => {
    const dx = (src) => E.toTeX(E.diff(E.parse(src), 'x'));
    assert.equal(dx('sin(x*y)'), 'y\\cos(xy)');
    assert.equal(dx('x^3'), '3x^{2}');
    assert.equal(dx('tan(x)'), '\\frac{1}{\\cos^{2}(x)}');
    assert.equal(dx('ln(x*y)'), '\\frac{1}{x}');
    assert.equal(dx('atan(x)'), '\\frac{1}{x^{2} + 1}');
    assert.equal(dx('exp(-x*y)'), '-ye^{-xy}');
    assert.equal(dx('sqrt(x)'), '\\frac{1}{2\\sqrt{x}}');
  });

  it('is zero for expressions that do not depend on the variable', () => {
    assert.equal(str(E.diff(E.parse('sin(y)*3'), 'x')), '0');
    assert.equal(str(E.diff(E.parse('5'), 'y')), '0');
    assert.equal(str(E.diff(E.parse('pi*e'), 'x')), '0');
  });

  it('differentiates the independent variable typed as t', () => {
    const node = E.parse('t*y', { indep: 't' });
    assert.equal(E.toTeX(E.diff(node, 'x'), { indep: 't' }), 'y');
    assert.equal(E.toTeX(E.diff(node, 'y'), { indep: 't' }), 't');
  });

  it('rejects other variables', () => {
    assert.throws(() => E.diff(E.parse('x'), 't'), E.EDOError);
  });
});

describe('total derivative and higher derivatives', () => {
  const rnd = prng(31337);

  it('y\'\' of y\' = 2xy prints as 2y + 4x^2 y', () => {
    const d = E.totalDerivative(E.parse('2*x*y'));
    assert.equal(E.toTeX(d), '2y + 4x^{2}y');
    assert.equal(str(d), '2*y + 4*x^2*y');
  });

  it('y\'\' of y\' = -3x^2 y prints as 9x^4 y - 6xy', () => {
    const d = E.totalDerivative(E.parse('-3x^2 y'));
    assert.equal(E.toTeX(d), '9x^{4}y - 6xy');
    assert.equal(str(d), '9*x^4*y - 6*x*y');
  });

  it('equals f_x + f_y f computed from finite differences of f', () => {
    const H = 1e-5;
    for (const src of ['2*x*y', 'sin(x)+y^2', 'exp(-x*y)', 'x/(1+y^2)', '(x+y-1)^2', 'x*y^2 - y/x', 'sqrt(1+x^2+y^2)']) {
      const node = E.parse(src);
      const f = E.compile(node);
      const d = E.compile(E.totalDerivative(node));
      for (const [x, y] of randomPoints(rnd, [0.4, 1.6], [0.4, 1.6], 6)) {
        const fx = (f(x + H, y) - f(x - H, y)) / (2 * H);
        const fy = (f(x, y + H) - f(x, y - H)) / (2 * H);
        const expected = fx + fy * f(x, y);
        near(d(x, y), expected, 1e-6 * (1 + Math.abs(expected)), `${src} at (${x}, ${y})`);
      }
    }
  });

  it('yields the exact derivatives y\'\', y\'\'\', y\'\'\'\' of y\' = 2xy', () => {
    const [d1, d2, d3, d4] = E.derivatives(E.parse('2*x*y'), 4).map((n) => E.compile(n));
    for (const [x, y] of randomPoints(rnd, [0.3, 2], [0.3, 2], 10)) {
      near(d1(x, y), 2 * x * y, 1e-12, 'y\'');
      near(d2(x, y), 2 * y + 4 * x * x * y, 1e-12, 'y\'\'');
      near(d3(x, y), 12 * x * y + 8 * x ** 3 * y, 1e-11, 'y\'\'\'');
      near(d4(x, y), 12 * y + 48 * x * x * y + 16 * x ** 4 * y, 1e-10, 'y\'\'\'\'');
    }
    assert.equal(E.toTeX(E.derivatives(E.parse('2*x*y'), 3)[2]), '12xy + 8x^{3}y');
  });

  it('applying totalDerivative repeatedly gives higher orders (it remembers f)', () => {
    const f = E.parse('2*x*y');
    const twice = E.totalDerivative(E.totalDerivative(f));
    assert.equal(E.nodeKey(twice), E.nodeKey(E.derivatives(f, 3)[2]));
    const explicit = E.totalDerivative(E.derivatives(f, 2)[1], { f });
    assert.equal(E.nodeKey(explicit), E.nodeKey(twice));
  });

  it('a second ODE does not inherit the right-hand side of the first', () => {
    const a = E.totalDerivative(E.parse('2*x*y'));
    const b = E.totalDerivative(E.parse('-y'));
    assert.equal(str(b), 'y');
    assert.equal(str(E.totalDerivative(b)), '-y', 'y\'\' of y\' = -y is y, so y\'\'\' is -y');
    assert.notEqual(E.nodeKey(a), E.nodeKey(b));
  });
});

describe('toTeX', () => {
  const cases = [
    ['2xy', '2xy'],
    ['-3x^2 y', '-3x^{2}y'],
    ['x/y', '\\frac{x}{y}'],
    ['(x+1)/(y-1)', '\\frac{x + 1}{y - 1}'],
    ['(1/4)(1+y^2)', '\\frac{1}{4}(1 + y^{2})'],
    ['x/y/e', '\\frac{x}{ye}'],
    ['sqrt(x)', '\\sqrt{x}'],
    ['exp(-x)', 'e^{-x}'],
    ['e^{-x}', 'e^{-x}'],
    ['sen(x)', '\\operatorname{sen}(x)'],
    ['sin(x)^2', '\\operatorname{sen}^{2}(x)'],
    ['cos(x*y)^2', '\\cos^{2}(xy)'],
    ['2^-x', '2^{-x}'],
    ['(-x)^2', '(-x)^{2}'],
    ['x^(1/3)', 'x^{\\frac{1}{3}}'],
    ['abs(x-y)', '\\left|x - y\\right|'],
    ['ln(x)+log(y)', '\\ln(x) + \\log_{10}(y)'],
    ['tan(x)', '\\tan(x)'],
    ['-(x+y)', '-(x + y)'],
    ['-y + x + 1', '-y + x + 1'],
    ['pi*x', '\\pi x'],
    ['x - (y + 1)', 'x - (y + 1)'],
    ['2*(x+0.05)*(y+0.1)', '2(x + 0.05)(y + 0.1)'],
    ['asin(x)+acos(x)+atan(x)', '\\operatorname{arcsen}(x) + \\arccos(x) + \\arctan(x)'],
    ['sinh(x)+cosh(x)+tanh(x)', '\\operatorname{senh}(x) + \\cosh(x) + \\tanh(x)'],
  ];
  for (const [src, expected] of cases) {
    it(`${src}  =>  ${expected}`, () => assert.equal(tex(src), expected));
  }

  it('uses the declared independent variable', () => {
    assert.equal(tex('sen(t)+e^{-t}', { indep: 't' }), '\\operatorname{sen}(t) + e^{-t}');
    assert.equal(tex('t*y', { indep: 't' }), 'ty');
  });

  it('wraps tall arguments in \\left( \\right)', () => {
    assert.equal(tex('sin(x/y)'), '\\operatorname{sen}\\left(\\frac{x}{y}\\right)');
  });

  it('prints fractional and decimal exponents sensibly', () => {
    assert.equal(tex('x^1.5'), 'x^{\\frac{3}{2}}');
    assert.equal(tex('x^0.3'), 'x^{\\frac{3}{10}}');
    assert.equal(tex('x^2.7182818'), 'x^{2.7182818}');
  });

  it('separates numbers with \\cdot and parenthesizes negative numbers after a product or in a power', () => {
    const f = E.parse('2*x*y');
    assert.equal(E.toTeX(E.substitute(f, { x: 1, y: 1 })), '2\\cdot 1\\cdot 1');
    assert.equal(E.toTeX(E.substitute(f, { x: -3, y: 2 })), '2\\cdot (-3)\\cdot 2');
    assert.equal(E.toTeX(E.substitute(E.parse('x^2'), { x: -3 })), '(-3)^{2}');
    assert.equal(E.toTeX(E.substitute(E.parse('x*y'), { x: 2, y: -3 })), '2\\cdot (-3)');
    assert.equal(E.toTeX(E.substitute(E.parse('x*y'), { x: -2, y: 3 })), '-2\\cdot 3');
    assert.equal(E.toTeX(E.substitute(E.parse('x - y'), { x: 1, y: -3 })), '1 - (-3)', 'the substituted structure stays visible');
  });

  it('formats numeric literals through numFmt', () => {
    const node = E.substitute(E.parse('x + y/3'), { x: 1.98765, y: 2.5 });
    const trunc = (v) => String(Math.trunc(v * 10) / 10);
    assert.equal(E.toTeX(node, { numFmt: trunc }), '1.9 + \\frac{2.5}{3}');
    assert.equal(E.toString(node, { numFmt: trunc }), '1.9 + 2.5/3');
  });

  it('prints default literals with at most 12 significant digits', () => {
    assert.equal(E.toTeX(N.num(0.30000000000000004)), '0.3');
    assert.equal(E.toTeX(N.num(1e-7)), '1\\times 10^{-7}');
    assert.equal(E.toTeX(N.num(12)), '12');
  });

  it('has a handout style: explicit \\cdot, inline divisions and parenthesized numeric bases', () => {
    const f = E.parse('2*x*y');
    const half = (h) => N.add([N.num(1), N.div(N.num(h), N.num(2))]);
    const s = E.substitute(f, { x: half(0.1), y: half(0.2) });
    assert.equal(E.toTeX(s), '2\\left(1 + \\frac{0.1}{2}\\right)\\left(1 + \\frac{0.2}{2}\\right)');
    assert.equal(E.toTeX(s, { style: 'catedra' }), '2\\cdot (1 + 0.1/2)\\cdot (1 + 0.2/2)');
    const hand = E.substitute(E.parse('2*y + 4*x^2*y'), { x: 1, y: 1 });
    assert.equal(E.toTeX(hand, { style: 'catedra' }), '2\\cdot 1 + 4\\cdot (1)^{2}\\cdot 1');
  });
});

describe('toString', () => {
  it('uses * and ^ and never relies on implicit products', () => {
    assert.equal(str(E.parse('2xy')), '2*x*y');
    assert.equal(str(E.parse('-3x^2 y')), '-3*x^2*y');
    assert.equal(str(E.parse('x**2')), 'x^2');
    assert.equal(str(E.parse('e^{-x}')), 'e^(-x)');
    assert.equal(E.toString(E.parse('e^{-t}', { indep: 't' }), { indep: 't' }), 'e^(-t)');
  });

  const roundTrip = [
    '2*x*y', '-3*x^2*y', '(x+1)*(x-1)', 'sin(x)^2', 'x/(y+1)', '2^-x', 'exp(-x^2)', 'x^(1/2)', 'sqrt(x*y)', 'x/y/e',
    '-(x+y)^2', 'ln(x)*y', 'log(x)+log10(y)', 'abs(x-y)/2', 'x^y^2', '(x+y)^(x-y)', 'atan(x)*acosh_not', '1e-7*x', '0.1*x+1e21*y',
  ].filter((s) => !s.includes('acosh_not'));
  for (const src of roundTrip) {
    it(`round-trips ${src}`, () => {
      const node = E.parse(src);
      const back = E.parse(E.toString(node));
      assert.equal(E.nodeKey(E.simplify(back)), E.nodeKey(E.simplify(node)));
      const f = E.compile(node);
      const g = E.compile(back);
      near(g(1.3, 0.7), f(1.3, 0.7), 1e-12 * (1 + Math.abs(f(1.3, 0.7))), src);
    });
  }

  it('round-trips every simplified battery expression', () => {
    for (const [src] of BATTERY) {
      const s = simp(src);
      assert.equal(E.nodeKey(E.simplify(E.parse(str(s)))), E.nodeKey(s), src);
    }
  });
});

describe('substitute', () => {
  it('replaces variables without evaluating or simplifying', () => {
    const node = E.substitute(E.parse('2*x*y'), { x: 1, y: 2 });
    assert.equal(node.t, 'mul');
    assert.deepEqual(node.factors.map((f) => f.v), [2, 1, 2]);
    assert.equal(E.evalNode(node), 4);
  });

  it('accepts nodes, leaves other variables alone and does not mutate its input', () => {
    const f = E.parse('x + y');
    const key = E.nodeKey(f);
    const out = E.substitute(f, { x: N.mul([N.num(2), N.variable('y')]) });
    assert.equal(E.toString(out), '2*y + y');
    assert.equal(E.nodeKey(f), key);
    assert.equal(E.toString(E.substitute(f, {})), 'x + y');
  });

  it('shows the structure of the substituted expression', () => {
    const f = E.parse('(1/4)*(1+y^2)');
    assert.equal(E.toString(E.substitute(f, { y: 0.5 })), '(1/4)*(1 + 0.5^2)');
  });
});

describe('utilities', () => {
  it('dependsOn reports the variables an expression uses', () => {
    assert.equal(E.dependsOn(E.parse('sin(x)*2'), 'x'), true);
    assert.equal(E.dependsOn(E.parse('sin(x)*2'), 'y'), false);
    assert.equal(E.dependsOn(E.parse('x^y'), 'y'), true);
  });

  it('normalizeIndep lower-cases and validates', () => {
    assert.equal(E.normalizeIndep('T'), 't');
    assert.equal(E.normalizeIndep(undefined), 'x');
    assert.throws(() => E.normalizeIndep('y'), E.EDOError);
  });
});

describe('printed LaTeX is well-formed and KaTeX-safe', () => {
  it('has balanced braces, matching left/right pairs and only known commands, for every battery expression', () => {
    for (const [src] of BATTERY) {
      const node = E.parse(src);
      for (const n of [node, E.simplify(node), E.diff(node, 'x'), E.diff(node, 'y'), E.totalDerivative(node)]) {
        assert.deepEqual(texIssues(E.toTeX(n)), [], `${src}: ${E.toTeX(n)}`);
        assert.deepEqual(texIssues(E.toTeX(n, { style: 'catedra' })), [], `${src} (catedra)`);
      }
    }
  });

  it('flags what the checker is meant to flag', () => {
    assert.ok(texIssues('\\frac{1}{2').length > 0);
    assert.ok(texIssues('\\bogus{x}').length > 0);
    assert.ok(texIssues('\\left(x').length > 0);
    assert.deepEqual(texIssues('\\frac{x}{2}\\cdot\\left(y\\right)'), []);
  });
});

describe('randomized expressions (fixed seed): simplify, differentiate, print', () => {
  const rnd = prng(20261006);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const FUNCS = ['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt', 'abs', 'atan', 'sinh', 'cosh', 'tanh', 'asin', 'acos'];

  function gen(depth) {
    if (depth === 0 || rnd() < 0.12) return pick(['x', 'y', 'x', 'y', '2', '3', '0.5', '1.5', '1', '4', 'pi', 'e']);
    const r = rnd();
    if (r < 0.28) return `(${gen(depth - 1)}+${gen(depth - 1)})`;
    if (r < 0.40) return `(${gen(depth - 1)}-${gen(depth - 1)})`;
    if (r < 0.58) return `(${gen(depth - 1)}*${gen(depth - 1)})`;
    if (r < 0.68) return `(${gen(depth - 1)}/${gen(depth - 1)})`;
    if (r < 0.78) return `(${gen(depth - 1)})^${pick(['2', '3', '-1', '0.5', '-2', '4'])}`;
    if (r < 0.82) return `(${gen(depth - 1)})^(${gen(depth - 1)})`;
    if (r < 0.87) return `-(${gen(depth - 1)})`;
    return `${pick(FUNCS)}(${gen(depth - 1)})`;
  }

  const SAMPLES = Array.from({ length: 400 }, () => gen(3));
  const central4 = (g, x, y, v, h) => {
    const at = (s) => (v === 'x' ? g(x + s * h, y) : g(x, y + s * h));
    return (8 * (at(1) - at(-1)) - (at(2) - at(-2))) / (12 * h);
  };

  // Division by a literal zero has no useful canonical text form (0^2 folds before the reciprocal does).
  const dividesByZero = (n) => (n.t === 'pow' && n.base.t === 'num' && n.base.v === 0 && n.exp.t === 'num' && n.exp.v < 0)
    || (n.t === 'add' && n.terms.some(dividesByZero)) || (n.t === 'mul' && n.factors.some(dividesByZero))
    || (n.t === 'pow' && (dividesByZero(n.base) || dividesByZero(n.exp))) || (n.t === 'fn' && dividesByZero(n.arg));

  it('simplify keeps the value, is idempotent and prints/parses back to the same form', () => {
    let compared = 0;
    for (const src of SAMPLES) {
      const node = E.parse(src);
      const s = E.simplify(node);
      assert.equal(E.nodeKey(E.simplify(s)), E.nodeKey(s), `idempotence: ${src}`);
      if (!dividesByZero(s)) {
        assert.equal(E.nodeKey(E.simplify(E.parse(E.toString(s)))), E.nodeKey(s), `round trip: ${src} -> ${E.toString(s)}`);
      }
      assert.deepEqual(texIssues(E.toTeX(s)), [], `TeX of ${src}`);
      const f = E.compile(node);
      const g = E.compile(s);
      for (let i = 0; i < 5; i += 1) {
        const x = between(rnd, 0.4, 1.8);
        const y = between(rnd, 0.4, 1.8);
        const expected = f(x, y);
        if (!Number.isFinite(expected) || Math.abs(expected) > 1e5) continue;
        // 1e-7: expressions such as acos(y/y) are ill-conditioned in floating point before simplification.
        near(g(x, y), expected, 1e-7 * (1 + Math.abs(expected)), `${src} at (${x}, ${y}) simplified to ${E.toString(s)}`);
        compared += 1;
      }
    }
    assert.ok(compared > 800, `only ${compared} comparisons were made`);
  });

  it('diff agrees with fourth-order central differences wherever the difference quotient is well conditioned', () => {
    let compared = 0;
    for (const src of SAMPLES) {
      const node = E.parse(src);
      const f = E.compile(node);
      for (const v of ['x', 'y']) {
        const d = E.compile(E.diff(node, v));
        for (let i = 0; i < 3; i += 1) {
          const x = between(rnd, 0.4, 1.8);
          const y = between(rnd, 0.4, 1.8);
          const value = f(x, y);
          if (!Number.isFinite(value) || Math.abs(value) > 1e3) continue;
          const coarse = central4(f, x, y, v, 1e-4);
          const fine = central4(f, x, y, v, 1e-5);
          // Skip kinks, poles and steep regions where a difference quotient is not a reliable oracle.
          if (!Number.isFinite(fine) || Math.abs(fine) > 1e3 || Math.abs(coarse - fine) > 1e-5 * (1 + Math.abs(fine))) continue;
          near(d(x, y), fine, 1e-5 * (1 + Math.abs(fine)), `d/d${v} of ${src} at (${x}, ${y})`);
          compared += 1;
        }
      }
    }
    assert.ok(compared > 600, `only ${compared} derivative comparisons were made`);
  });
});
