'use strict';
/**
 * Shared test helpers (not a test file). Every random choice in the suite goes
 * through `prng` with a fixed seed, so runs are deterministic.
 */
const path = require('node:path');
const assert = require('node:assert/strict');

const WEB_ROOT = path.join(__dirname, '..');
const NUMERICS = path.join(WEB_ROOT, 'js', 'numerics');

/** Loads one numerics module by file name without extension. */
const load = (name) => require(path.join(NUMERICS, `${name}.js`));

/**
 * Seeded PRNG (mulberry32).
 * @param {number} seed Integer seed.
 * @returns {function(): number} Uniform generator in [0, 1).
 */
function prng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform number in [lo, hi) from a generator. */
const between = (rnd, lo, hi) => lo + (hi - lo) * rnd();

/** Asserts |actual - expected| <= tol, with a readable message. */
function near(actual, expected, tol, label) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
    `${label || 'value'}: expected ${expected} +- ${tol}, got ${actual}`,
  );
}

const TEX_COMMANDS = new Set([
  '\\frac', '\\sqrt', '\\left', '\\right', '\\cdot', '\\pi', '\\operatorname', '\\cos', '\\tan', '\\arccos', '\\arctan',
  '\\cosh', '\\tanh', '\\coth', '\\ln', '\\log', '\\times', '\\infty', '\\mathrm',
]);

/**
 * Problems found in a LaTeX string produced by the printers (empty array when it looks
 * well-formed and only uses commands that KaTeX renders).
 * @param {string} tex
 * @returns {string[]}
 */
function texIssues(tex) {
  const issues = [];
  let depth = 0;
  for (const ch of tex) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth < 0) break;
  }
  if (depth !== 0) issues.push('unbalanced braces');
  if ((tex.match(/\\left/g) || []).length !== (tex.match(/\\right/g) || []).length) issues.push('unbalanced \\left/\\right');
  for (const command of tex.match(/\\[A-Za-z]+/g) || []) {
    if (!TEX_COMMANDS.has(command)) issues.push(`unexpected command ${command}`);
  }
  if (/undefined|NaN|Infinity|\[object/.test(tex)) issues.push('invalid text in output');
  if (tex.trim() === '') issues.push('empty output');
  return issues;
}

module.exports = { WEB_ROOT, NUMERICS, load, prng, between, near, texIssues };
