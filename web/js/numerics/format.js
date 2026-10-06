/**
 * EDO.format - number formatting and parsing (pure logic, no DOM).
 *
 * Browser load order: expr.js -> format.js -> problems.js -> methods.js -> analysis.js
 *
 * Display modes:
 *  - 'round': standard rounding (half away from zero on the decimal value);
 *  - 'trunc': truncation toward zero, as printed in the cátedra's handout
 *    (1.9727613 -> "1.9727" where rounding would give "1.9728").
 * Both work on a 12-significant-digit decimal normalization of the float, so
 * binary noise never changes a result (1.2299999999999998 truncates to "1.23",
 * not "1.2299"). Computations elsewhere stay at full float64; format only at display time.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EDO = root.EDO || {};
    root.EDO.format = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIG_DIGITS = 12;
  const MAX_DECIMALS = 20;
  const SCI_THRESHOLD = 1e15;
  const CHAR_FIVE = 53;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const trimZeros = (s) => s.replace(/0+$/, '').replace(/\.$/, '');

  function special(v) {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
    return null;
  }

  /** 12 significant digits of a positive finite number: digit string and decimal exponent. */
  function normalize(av) {
    const [mantissa, exp] = av.toExponential(SIG_DIGITS - 1).split('e');
    return { digits: mantissa.replace('.', ''), exp10: parseInt(exp, 10) };
  }

  /** Adds one to a string of decimal digits ("1999" -> "2000", "999" -> "1000"). */
  function incrementDigits(s) {
    const a = s.split('');
    let i = a.length - 1;
    while (i >= 0 && a[i] === '9') {
      a[i] = '0';
      i -= 1;
    }
    if (i < 0) return `1${a.join('')}`;
    a[i] = String(Number(a[i]) + 1);
    return a.join('');
  }

  /** Digit string K such that |v| is approximately K / 10^decimals, rounded or truncated. */
  function scaled(av, decimals, mode) {
    const { digits, exp10 } = normalize(av);
    const kept = exp10 + 1 + decimals;
    if (kept < 0) return '0';
    if (kept >= SIG_DIGITS) return digits + '0'.repeat(kept - SIG_DIGITS);
    let k = kept === 0 ? '0' : digits.slice(0, kept);
    if (mode !== 'trunc' && digits.charCodeAt(kept) >= CHAR_FIVE) k = incrementDigits(k);
    return k;
  }

  /**
   * Scientific notation with `digits` significant digits (rounded), e.g. "3.5e-9".
   * Meant for errors that a fixed number of decimals would show as 0.
   * @param {number} v
   * @param {{digits?: number, trim?: boolean}} [opts] `digits` default 3; `trim` drops trailing zeros (default true).
   * @returns {string}
   */
  function sci(v, opts) {
    const o = opts || {};
    const sp = special(v);
    if (sp) return sp;
    if (v === 0) return '0';
    const keep = clamp(Math.floor(o.digits === undefined ? 3 : o.digits), 1, SIG_DIGITS - 1);
    const { digits, exp10 } = normalize(Math.abs(v));
    let ds = digits.slice(0, keep);
    if (digits.charCodeAt(keep) >= CHAR_FIVE) ds = incrementDigits(ds);
    let e = exp10;
    if (ds.length > keep) { ds = ds.slice(0, keep); e += 1; }
    let mantissa = keep > 1 ? `${ds[0]}.${ds.slice(1)}` : ds;
    if (o.trim !== false && keep > 1) mantissa = trimZeros(mantissa);
    return `${v < 0 ? '-' : ''}${mantissa}e${e}`;
  }

  /**
   * Formats a number with a fixed number of decimals.
   * @param {number} v
   * @param {{decimals?: number, mode?: 'round'|'trunc', trim?: boolean}} [opts]
   *   `decimals` default 4; `mode` 'round' (default) or 'trunc' (toward zero); `trim` drops
   *   trailing zeros and a trailing '.' (default true). Never returns "-0"; NaN -> "NaN",
   *   +-Infinity -> "∞" / "-∞"; magnitudes >= 1e15 fall back to scientific notation.
   * @returns {string} '.' is always the decimal separator.
   */
  function num(v, opts) {
    const o = opts || {};
    const x = Number(v);
    const sp = special(x);
    if (sp) return sp;
    if (Math.abs(x) >= SCI_THRESHOLD) return sci(x, { digits: 6 });
    const decimals = clamp(Math.floor(o.decimals === undefined ? 4 : o.decimals), 0, MAX_DECIMALS);
    const k = scaled(Math.abs(x), decimals, o.mode);
    const s = k.padStart(decimals + 1, '0');
    const intPart = s.slice(0, s.length - decimals);
    let frac = s.slice(s.length - decimals);
    if (o.trim !== false) frac = frac.replace(/0+$/, '');
    const body = frac ? `${intPart}.${frac}` : intPart;
    return k === '0' ? body : `${x < 0 ? '-' : ''}${body}`;
  }

  /**
   * LaTeX-safe number: same rules as `num`, with infinity, NaN and exponents as TeX.
   * @param {number} v
   * @param {{decimals?: number, mode?: 'round'|'trunc', trim?: boolean, sci?: boolean, digits?: number}} [opts]
   *   `sci: true` forces scientific notation (`digits` significant digits).
   * @returns {string}
   */
  function tex(v, opts) {
    const o = opts || {};
    const s = o.sci ? sci(Number(v), o) : num(v, o);
    if (s === '∞') return '\\infty';
    if (s === '-∞') return '-\\infty';
    if (s === 'NaN') return '\\mathrm{NaN}';
    const m = /^(-?[\d.]+)e(-?\d+)$/.exec(s);
    return m ? `${m[1]}\\times 10^{${m[2]}}` : s;
  }

  const NUMBER_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

  /**
   * Parses a user-typed number. Accepts '.' or ',' as the decimal separator
   * (Spanish keyboards), an optional sign and an optional exponent.
   * @param {string|number} str
   * @returns {number} The value, or NaN when the text is not a plain number.
   */
  function parseNumber(str) {
    if (typeof str === 'number') return Number.isFinite(str) ? str : NaN;
    if (typeof str !== 'string') return NaN;
    const s = str.trim().replace(/−/g, '-');
    if (!NUMBER_RE.test(s)) return NaN;
    const v = Number(s.replace(',', '.'));
    return Number.isFinite(v) ? v : NaN;
  }

  return { num, tex, sci, parseNumber };
}));
