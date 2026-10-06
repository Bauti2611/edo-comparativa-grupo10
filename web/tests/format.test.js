'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, prng } = require('./helpers.js');

const F = load('format');
const trunc = (v, decimals = 4) => F.num(v, { decimals, mode: 'trunc' });
const round = (v, decimals = 4) => F.num(v, { decimals, mode: 'round' });

describe('format.num: truncation as printed in the handout', () => {
  const required = [
    [1.542666, '1.5426'],
    [1.9727613, '1.9727'],
    [1.5452743, '1.5452'],
    [1.9779511, '1.9779'],
    [0.3708658, '0.3708'],
    [0.5, '0.5'],
    [1.125, '1.125'],
    [-1.99999, '-1.9999'],
  ];
  for (const [v, expected] of required) {
    it(`trunc(${v}) = ${expected}`, () => assert.equal(trunc(v), expected));
  }

  it('round(1.9727613) = 1.9728 where truncation gives 1.9727', () => {
    assert.equal(round(1.9727613), '1.9728');
    assert.equal(trunc(1.9727613), '1.9727');
  });

  it('is robust to float noise: 1.2299999999999998 truncates to 1.23, never 1.2299', () => {
    assert.equal(trunc(1.2299999999999998), '1.23');
    assert.equal(trunc(1.5426659999999999), '1.5426');
    assert.equal(trunc(0.30000000000000004), '0.3');
    assert.equal(trunc(0.1 + 0.2), '0.3');
    assert.equal(trunc(1.9999999999999998), '2');
    assert.equal(trunc(-1.2299999999999998), '-1.23');
  });

  it('truncates toward zero for negatives', () => {
    assert.equal(trunc(-1.99999), '-1.9999');
    assert.equal(trunc(-0.99999), '-0.9999');
    assert.equal(round(-1.99999), '-2');
  });

  it('reproduces the four-decimal strings printed for Ej. 1 and Ej. 4', () => {
    assert.deepEqual([1.23, 1.542666, 1.9727613].map((v) => trunc(v)), ['1.23', '1.5426', '1.9727']);
    assert.deepEqual([1.231, 1.5452743, 1.9779511].map((v) => trunc(v)), ['1.231', '1.5452', '1.9779']);
  });
});

describe('format.num: rounding and layout', () => {
  it('rounds half away from zero on the decimal value', () => {
    assert.equal(round(1.00005), '1.0001');
    assert.equal(round(1.005, 2), '1.01');
    assert.equal(round(-1.005, 2), '-1.01');
    assert.equal(round(0.5, 0), '1');
    assert.equal(round(2.5, 0), '3');
    assert.equal(round(1234.5678, 0), '1235');
  });

  it('carries into the integer part', () => {
    assert.equal(round(0.99996), '1');
    assert.equal(round(9.99996), '10');
  });

  it('trims trailing zeros and a trailing dot by default, and keeps them with trim:false', () => {
    assert.equal(round(3), '3');
    assert.equal(round(3.1), '3.1');
    assert.equal(F.num(3, { decimals: 4, trim: false }), '3.0000');
    assert.equal(F.num(3.14159, { decimals: 2, trim: false }), '3.14');
    assert.equal(F.num(0, { decimals: 3, trim: false }), '0.000');
  });

  it('never returns -0', () => {
    assert.equal(trunc(-0.00001), '0');
    assert.equal(round(-0.00001), '0');
    assert.equal(round(-0), '0');
    assert.equal(F.num(-0, { decimals: 2, trim: false }), '0.00');
  });

  it('uses the defaults 4 decimals and rounding', () => {
    assert.equal(F.num(1.23456789), '1.2346');
    assert.equal(F.num(2), '2');
  });

  it('handles small magnitudes and zero decimals', () => {
    assert.equal(round(0.00004), '0');
    assert.equal(round(0.00005), '0.0001');
    assert.equal(trunc(0.00009), '0');
    assert.equal(trunc(1234.5678, 0), '1234');
    assert.equal(round(0.04, 1), '0');
    assert.equal(round(0.05, 1), '0.1');
  });

  it('clamps decimals and uses a dot as the decimal separator', () => {
    assert.equal(F.num(1.5, { decimals: -3 }), '2');
    assert.equal(F.num(0.1, { decimals: 99, trim: false }).length, 22);
    assert.ok(!F.num(1234.5).includes(','));
  });

  it('formats very large magnitudes in scientific notation and special values readably', () => {
    assert.equal(F.num(1e20), '1e20');
    assert.equal(F.num(NaN), 'NaN');
    assert.equal(F.num(Infinity), '∞');
    assert.equal(F.num(-Infinity), '-∞');
  });
});

describe('format.num against an exact integer oracle (fixed seed)', () => {
  /** Expected string for the decimal value k / 1e8, computed with integer arithmetic only. */
  function expected(k, decimals, mode) {
    const a = k < 0n ? -k : k;
    const scale = 10n ** BigInt(8 - decimals);
    const q = mode === 'trunc' ? a / scale : (2n * a + scale) / (2n * scale);
    const s = q.toString().padStart(decimals + 1, '0');
    const int = s.slice(0, s.length - decimals);
    const frac = s.slice(s.length - decimals).replace(/0+$/, '');
    const body = frac ? `${int}.${frac}` : int;
    return q === 0n || k >= 0n ? body : `-${body}`;
  }

  it('matches for 4000 random decimals, both modes and 0-8 decimals', () => {
    const rnd = prng(99);
    for (let i = 0; i < 4000; i += 1) {
      const magnitude = BigInt(Math.floor(rnd() * 1e11));
      const k = rnd() < 0.5 ? -magnitude : magnitude;
      const v = Number(k) / 1e8;
      const decimals = Math.floor(rnd() * 9);
      for (const mode of ['trunc', 'round']) {
        assert.equal(F.num(v, { decimals, mode }), expected(k, decimals, mode), `${v} ${mode} ${decimals}`);
      }
    }
  });
});

describe('format.sci and format.tex', () => {
  it('formats small errors in scientific notation', () => {
    assert.equal(F.sci(3.5e-9), '3.5e-9');
    assert.equal(F.sci(0.000123456), '1.23e-4');
    assert.equal(F.sci(0.000123456, { digits: 2 }), '1.2e-4');
    assert.equal(F.sci(9.999e-5), '1e-4');
    assert.equal(F.sci(-2.5e-3), '-2.5e-3');
    assert.equal(F.sci(0), '0');
    assert.equal(F.sci(5, { digits: 3, trim: false }), '5.00e0');
  });

  it('returns LaTeX-safe strings', () => {
    assert.equal(F.tex(1.23456, { decimals: 2 }), '1.23');
    assert.equal(F.tex(Infinity), '\\infty');
    assert.equal(F.tex(-Infinity), '-\\infty');
    assert.equal(F.tex(NaN), '\\mathrm{NaN}');
    assert.equal(F.tex(3.5e-9, { sci: true }), '3.5\\times 10^{-9}');
    assert.equal(F.tex(-2), '-2');
  });
});

describe('format.parseNumber', () => {
  it('accepts both decimal separators, signs and exponents', () => {
    assert.equal(F.parseNumber('1.5'), 1.5);
    assert.equal(F.parseNumber('1,5'), 1.5);
    assert.equal(F.parseNumber(' -2.5e-3 '), -0.0025);
    assert.equal(F.parseNumber('+4'), 4);
    assert.equal(F.parseNumber('.5'), 0.5);
    assert.equal(F.parseNumber(',5'), 0.5);
    assert.equal(F.parseNumber('3.'), 3);
    assert.equal(F.parseNumber('−2,5'), -2.5, 'typographic minus');
    assert.equal(F.parseNumber(7), 7);
  });

  it('returns NaN for anything that is not a plain number', () => {
    const garbage = ['', '  ', 'abc', '1.2.3', '1,2,3', '1,234.5', '--1', '1e', 'e5', '1 2', '0x10', 'Infinity', 'NaN', '1/2', '2x', null, undefined, {}, [], NaN, Infinity];
    for (const g of garbage) assert.ok(Number.isNaN(F.parseNumber(g)), `parseNumber(${String(g)}) should be NaN`);
  });
});
