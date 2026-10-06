'use strict';
/**
 * The numerics must work as classic scripts (no module system, no build step) and
 * must never turn text into code.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { NUMERICS, WEB_ROOT, near } = require('./helpers.js');

const ORDER = ['expr', 'format', 'problems', 'methods', 'analysis'];
const read = (file) => fs.readFileSync(file, 'utf8');

/** Runs the given numerics files as classic scripts in a fresh global with no `module`. */
function browserGlobal(names, seed) {
  const sandbox = Object.assign({}, seed);
  vm.createContext(sandbox);
  for (const name of names) {
    vm.runInContext(read(path.join(NUMERICS, `${name}.js`)), sandbox, { filename: `${name}.js` });
  }
  return sandbox;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** Source without block comments and full-line // comments (they may legitimately mention forbidden words). */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('classic-script (browser) loading', () => {
  it('attaches EDO.expr, format, problems, methods and analysis in the documented order', () => {
    const g = browserGlobal(ORDER);
    assert.deepEqual(Object.keys(g.EDO), ORDER);
    const sol = g.EDO.methods.solve('taylor', g.EDO.problems.fromPreset('a1'));
    near(sol.ys[3], 1.9727613, 5e-6);
    near(g.EDO.analysis.localErrorConstants(g.EDO.problems.fromPreset('a1'), 1, 1).taylor, 10 / 3, 1e-9);
    assert.equal(g.EDO.format.num(sol.ys[3], { decimals: 4, mode: 'trunc' }), '1.9727');
    assert.equal(g.EDO.expr.toTeX(g.EDO.expr.parse('2xy')), '2xy');
  });

  it('reuses an existing window.EDO namespace instead of replacing it', () => {
    const g = browserGlobal(ORDER, { EDO: { marker: 42 } });
    assert.equal(g.EDO.marker, 42);
    assert.ok(g.EDO.expr && g.EDO.analysis);
  });

  it('fails with a clear message when a dependency was not loaded first', () => {
    assert.throws(() => browserGlobal(['methods']), /EDO\.methods needs EDO\.expr and EDO\.problems/);
    assert.throws(() => browserGlobal(['problems']), /EDO\.problems needs EDO\.expr and EDO\.format/);
    assert.throws(() => browserGlobal(['expr', 'analysis']), /EDO\.analysis needs EDO\.expr and EDO\.methods/);
  });

  it('documents the browser load order in every file header', () => {
    for (const name of ORDER) {
      const text = read(path.join(NUMERICS, `${name}.js`));
      assert.match(text.slice(0, 1500), /load order[\s\S]*expr\.js -> format\.js -> problems\.js -> methods\.js -> analysis\.js/i, name);
    }
  });

  it('uses no ES module syntax and no DOM access', () => {
    for (const name of ORDER) {
      const text = code(read(path.join(NUMERICS, `${name}.js`)));
      assert.ok(!/^\s*(import|export)\b/m.test(text), `${name}.js uses import/export`);
      assert.ok(!/\b(document|window|localStorage|fetch)\b/.test(text), `${name}.js touches the DOM or the network`);
      assert.ok(/'use strict'/.test(text), `${name}.js is not strict`);
    }
  });
});

describe('source safety: text is never turned into code', () => {
  const FORBIDDEN = [
    [/\beval\s*\(/, 'eval'],
    [/\bnew\s+Function\b/, 'the Function constructor'],
    [/(^|[^.\w$])Function\s*\(/, 'Function(...)'],
    [/\bset(Timeout|Interval)\s*\(\s*['"`]/, 'setTimeout/setInterval with a string'],
    [/\bimportScripts\s*\(/, 'importScripts'],
  ];

  it('no file under web/js uses eval or the Function constructor', () => {
    const files = sourceFiles(path.join(WEB_ROOT, 'js'));
    assert.ok(files.length >= ORDER.length);
    for (const file of files) {
      const text = code(read(file));
      for (const [pattern, label] of FORBIDDEN) {
        assert.ok(!pattern.test(text), `${path.relative(WEB_ROOT, file)} contains ${label}`);
      }
    }
  });

  it('the scan itself detects what it is looking for', () => {
    // Built from pieces so that a plain-text search of this very file stays clean.
    const samples = [`${'ev'}al ("1")`, `x = ${'new'} ${'Func'}tion("return 1")`, `${'Func'}tion("a", "return a")`, 'setTimeout("f()", 1)'];
    for (const sample of samples) {
      assert.ok(FORBIDDEN.some(([pattern]) => pattern.test(code(sample))), sample);
    }
    assert.ok(!FORBIDDEN.some(([pattern]) => pattern.test(code('typeof f === "function"; isFunction(x); obj.Function(x)'))));
  });
});
