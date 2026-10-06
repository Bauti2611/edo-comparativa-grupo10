/**
 * EDO.route - pure hash-route parsing and building (no DOM, unit-tested in Node).
 *
 *   parse('#/simulador?f=2*x*y&h=0.1') -> {page: 'simulador', sub: null, query: {f: '2*x*y', h: '0.1'}}
 *   parse('#/teoria/rk2')              -> {page: 'teoria', sub: 'rk2', query: {}}
 *   build('simulador', null, {f: '2*x*y', h: 0.1}) -> '#/simulador?f=2*x*y&h=0.1'
 *
 * Rules:
 *  - The default page is 'inicio'. An unknown (or missing) page resolves to it, dropping sub and query.
 *  - `sub` is the optional second path segment, limited to [A-Za-z0-9_-]; anything else becomes null.
 *  - Query values round-trip: they are percent-encoded on build, and '+' is a literal plus on parse
 *    (never a space), so expressions such as "x+1" or "2*x^2" survive. Characters that are legal in a
 *    URL fragment and common in formulas (, ^ / : @ $ and the unreserved * ( ) ! ' ~) stay readable.
 *  - Malformed percent escapes are kept as typed instead of throwing.
 *  - Keys named __proto__, constructor or prototype are ignored.
 *
 * Load order: before app.js. Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EDO = root.EDO || {};
    root.EDO.route = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_PAGE = 'inicio';
  /** Pages known by default; '_ui' is the hidden living style guide. app.js passes the registered ids instead. */
  const PAGES = Object.freeze([
    'inicio', 'teoria', 'ejercicios', 'simulador', 'comparativa', 'audiencia', 'fuentes', '_ui',
  ]);
  const SUB_RE = /^[A-Za-z0-9_-]+$/;
  const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const KEEP_LITERAL = /%(2C|5E|2F|3A|40|24)/g;

  /** decodeURIComponent that never throws: valid escape runs are decoded, broken ones are kept. */
  function safeDecode(text) {
    try {
      return decodeURIComponent(text);
    } catch (err) {
      return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
        try {
          return decodeURIComponent(run);
        } catch (inner) {
          return run;
        }
      });
    }
  }

  /** Replaces unpaired surrogates (which make encodeURIComponent throw) with U+FFFD. */
  function wellFormed(text) {
    return Array.from(text, (ch) => {
      const code = ch.charCodeAt(0);
      return ch.length === 1 && code >= 0xD800 && code <= 0xDFFF ? '�' : ch;
    }).join('');
  }

  /** Percent-encodes one query key or value, keeping the formula-friendly characters readable. */
  function encodePart(text) {
    let encoded;
    try {
      encoded = encodeURIComponent(text);
    } catch (err) {
      encoded = encodeURIComponent(wellFormed(text));
    }
    return encoded.replace(KEEP_LITERAL, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function parseQuery(queryString) {
    const query = {};
    queryString.split('&').forEach((pair) => {
      if (!pair) return;
      const at = pair.indexOf('=');
      const key = safeDecode(at === -1 ? pair : pair.slice(0, at));
      if (!key || BLOCKED_KEYS.has(key)) return;
      query[key] = at === -1 ? '' : safeDecode(pair.slice(at + 1));
    });
    return query;
  }

  /** Splits a hash into its raw segments and query string ('#' and one leading '/' are optional). */
  function split(input) {
    let raw = typeof input === 'string' ? input.trim() : '';
    if (raw.charAt(0) === '#') raw = raw.slice(1);
    const at = raw.indexOf('?');
    const path = at === -1 ? raw : raw.slice(0, at);
    const queryString = at === -1 ? '' : raw.slice(at + 1);
    const segments = path.split('/').filter(Boolean).map((s) => safeDecode(s).trim());
    return { segments, queryString };
  }

  function listOf(opts) {
    return opts && Array.isArray(opts.pages) && opts.pages.length ? opts.pages : PAGES;
  }

  /**
   * Parses a location hash.
   * @param {string} hash e.g. '#/simulador?f=2*x*y&h=0.1' (the '#' and the first '/' are optional).
   * @param {{pages?: string[]}} [opts] Valid page ids (default: PAGES).
   * @returns {{page: string, sub: (string|null), query: Object<string, string>}}
   */
  function parse(hash, opts) {
    const pages = listOf(opts);
    const { segments, queryString } = split(hash);
    const first = (segments[0] || '').toLowerCase();
    if (!pages.includes(first)) return { page: DEFAULT_PAGE, sub: null, query: {} };
    const second = segments[1];
    return {
      page: first,
      sub: second && SUB_RE.test(second) ? second : null,
      query: parseQuery(queryString),
    };
  }

  /**
   * Builds the canonical hash of a route.
   * @param {string} page Page id (unknown ids become the default page).
   * @param {?string} [sub] Optional sub-route.
   * @param {Object<string, *>} [query] Values are stringified; null, undefined and '' are skipped,
   *   arrays are joined with ','.
   * @param {{pages?: string[]}} [opts]
   * @returns {string} Hash such as '#/simulador?f=2*x*y&h=0.1'.
   */
  function build(page, sub, query, opts) {
    const pages = listOf(opts);
    const id = typeof page === 'string' ? page.trim().toLowerCase() : '';
    const known = pages.includes(id);
    let hash = `#/${known ? id : DEFAULT_PAGE}`;
    if (known && typeof sub === 'string' && SUB_RE.test(sub)) hash += `/${sub}`;
    if (known && query && typeof query === 'object') {
      const pairs = [];
      Object.keys(query).forEach((key) => {
        const raw = query[key];
        if (!key || BLOCKED_KEYS.has(key) || raw === null || raw === undefined) return;
        const value = Array.isArray(raw) ? raw.join(',') : String(raw);
        if (value === '') return;
        pairs.push(`${encodePart(key)}=${encodePart(value)}`);
      });
      if (pairs.length) hash += `?${pairs.join('&')}`;
    }
    return hash;
  }

  /**
   * True when the hash is a route for the router (empty, '#', or starting with '#/'); false for
   * in-page anchors such as the skip link '#app', which the router must leave alone.
   */
  function isRouteHash(hash) {
    if (typeof hash !== 'string' || hash === '' || hash === '#') return true;
    return hash.charAt(0) === '#' && hash.charAt(1) === '/';
  }

  /** True when the first path segment of the hash is one of the (given) pages. */
  function isKnown(hash, opts) {
    const first = (split(hash).segments[0] || '').toLowerCase();
    return listOf(opts).includes(first);
  }

  /** Shallow equality of two query objects. */
  function sameQuery(a, b) {
    const left = a || {};
    const right = b || {};
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every((k) => Object.prototype.hasOwnProperty.call(right, k) && left[k] === right[k]);
  }

  /** Canonical form of any hash: build(parse(hash)). */
  function normalize(hash, opts) {
    const r = parse(hash, opts);
    return build(r.page, r.sub, r.query, opts);
  }

  return { DEFAULT_PAGE, PAGES, parse, build, isRouteHash, isKnown, sameQuery, normalize };
}));
