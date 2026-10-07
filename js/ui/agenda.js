/**
 * EDO.agenda - the time budget of the talk computed from config.talk (shown on Inicio).
 *
 * Pure (also `require`-able in Node, where it is unit-tested; no DOM):
 *   DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES
 *   parseMinutes(input) -> integer 1..240 | NaN      what the user typed ('15,5' or '15.5' round to 16)
 *   resolveMinutes(stored, configured) -> integer    stored choice (prefs.talkMinutes), else config, else 20
 *   durationText(seconds) -> '4 min' | '3 min 45 s' | '45 s'
 *   plan(minutes, agenda) -> {totalSec, items[{id, label, share, seconds, startSec, endSec}]}
 *                                                    whole seconds by largest remainder, so they add up exactly
 *   windowText(item) -> '02:00–07:00'                the planned window of one agenda item
 *
 * Load order: before app.js (no dependencies).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.agenda = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_MINUTES = 20;
  const MIN_MINUTES = 1;
  const MAX_MINUTES = 240;

  const pad = (n) => String(n).padStart(2, '0');

  function parseMinutes(input) {
    let v = NaN;
    if (typeof input === 'number') v = input;
    else if (typeof input === 'string' && /^\s*\d+(?:[.,]\d+)?\s*$/.test(input)) v = Number(input.trim().replace(',', '.'));
    if (!Number.isFinite(v)) return NaN;
    const m = Math.round(v);
    return m >= MIN_MINUTES && m <= MAX_MINUTES ? m : NaN;
  }

  function resolveMinutes(stored, configured) {
    const a = parseMinutes(stored);
    if (!Number.isNaN(a)) return a;
    const b = parseMinutes(configured);
    return Number.isNaN(b) ? DEFAULT_MINUTES : b;
  }

  /** Whole seconds as 'mm:ss' (minutes are not wrapped into hours). */
  function clockOf(seconds) {
    return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  }

  function durationText(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m === 0 && r > 0) return `${r} s`;
    return r === 0 ? `${m} min` : `${m} min ${r} s`;
  }

  function plan(minutes, agenda) {
    const totalSec = resolveMinutes(minutes, DEFAULT_MINUTES) * 60;
    const valid = (Array.isArray(agenda) ? agenda : [])
      .filter((a) => a && typeof a.id === 'string' && Number.isFinite(a.share) && a.share > 0);
    const shareSum = valid.reduce((s, a) => s + a.share, 0);
    if (!valid.length) return { totalSec, items: [] };
    const exact = valid.map((a) => (a.share / shareSum) * totalSec);
    const seconds = exact.map(Math.floor);
    let left = totalSec - seconds.reduce((s, v) => s + v, 0);
    // Largest remainder: the leftover seconds go to the items that lost the most when rounded down.
    exact.map((v, k) => ({ k, r: v - seconds[k] }))
      .sort((a, b) => b.r - a.r || a.k - b.k)
      .forEach(({ k }) => {
        if (left > 0) {
          seconds[k] += 1;
          left -= 1;
        }
      });
    let at = 0;
    const items = valid.map((a, k) => {
      const item = {
        id: a.id, label: String(a.label || a.id), share: a.share / shareSum, seconds: seconds[k], startSec: at, endSec: at + seconds[k],
      };
      at += seconds[k];
      return item;
    });
    return { totalSec, items };
  }

  const windowText = (item) => `${clockOf(item.startSec)}–${clockOf(item.endSec)}`;

  return { DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES, parseMinutes, resolveMinutes, durationText, plan, windowText };
}));
