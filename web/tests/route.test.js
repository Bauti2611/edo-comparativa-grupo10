'use strict';
/**
 * EDO.route: pure hash parsing and building. The important property is that formula text typed into the
 * simulator (with *, ^, +, commas, spaces, accents...) survives a build/parse round trip.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { WEB_ROOT, prng } = require('./helpers.js');

const route = require(path.join(WEB_ROOT, 'js', 'ui', 'route.js'));

describe('route.parse', () => {
  it('parses page, sub-route and query as documented', () => {
    assert.deepStrictEqual(route.parse('#/simulador?f=2*x*y&h=0.1'), { page: 'simulador', sub: null, query: { f: '2*x*y', h: '0.1' } });
    assert.deepStrictEqual(route.parse('#/teoria/rk2'), { page: 'teoria', sub: 'rk2', query: {} });
    assert.deepStrictEqual(route.parse('#/teoria/rk2?x=1'), { page: 'teoria', sub: 'rk2', query: { x: '1' } });
  });

  it('accepts hashes without the leading # or /, any letter case and a trailing slash', () => {
    const expected = { page: 'comparativa', sub: null, query: {} };
    ['#/comparativa', '/comparativa', 'comparativa', '#comparativa', '#/Comparativa', '#/COMPARATIVA/', '  #/comparativa  '].forEach((hash) => {
      assert.deepStrictEqual(route.parse(hash), expected, hash);
    });
  });

  it('defaults to inicio for empty, bare and non-string input', () => {
    const home = { page: 'inicio', sub: null, query: {} };
    ['', '#', '#/', '/', '#/inicio', '#/inicio/'].forEach((hash) => assert.deepStrictEqual(route.parse(hash), home, JSON.stringify(hash)));
    [undefined, null, 42, {}, []].forEach((value) => assert.deepStrictEqual(route.parse(value), home));
  });

  it('sends unknown pages to inicio and drops their sub-route and query', () => {
    assert.deepStrictEqual(route.parse('#/nada'), { page: 'inicio', sub: null, query: {} });
    assert.deepStrictEqual(route.parse('#/nada/rk2?f=1'), { page: 'inicio', sub: null, query: {} });
    assert.deepStrictEqual(route.parse('#app'), { page: 'inicio', sub: null, query: {} });
  });

  it('knows the seven sections and the hidden style guide by default', () => {
    ['inicio', 'teoria', 'ejercicios', 'simulador', 'comparativa', 'audiencia', 'fuentes', '_ui'].forEach((id) => {
      assert.equal(route.parse(`#/${id}`).page, id);
      assert.ok(route.PAGES.includes(id), id);
    });
    assert.equal(route.DEFAULT_PAGE, 'inicio');
    assert.ok(Object.isFrozen(route.PAGES));
  });

  it('honours a custom list of pages', () => {
    assert.equal(route.parse('#/extra', { pages: ['extra', 'inicio'] }).page, 'extra');
    assert.equal(route.parse('#/teoria', { pages: ['extra', 'inicio'] }).page, 'inicio');
  });

  it('keeps only safe sub-routes', () => {
    assert.equal(route.parse('#/teoria/rk2-familia_2').sub, 'rk2-familia_2');
    ['a.b', 'a b', '%3Cb%3E', '..', 'ñ'].forEach((bad) => assert.equal(route.parse(`#/teoria/${bad}`).sub, null, bad));
    assert.equal(route.parse('#/teoria/rk2/extra').sub, 'rk2');
    assert.equal(route.parse('#/teoria//rk2').sub, 'rk2');
  });

  it('decodes percent escapes and keeps "+" as a literal plus (never a space)', () => {
    assert.equal(route.parse('#/simulador?f=x+1').query.f, 'x+1');
    assert.equal(route.parse('#/simulador?f=x%2B1').query.f, 'x+1');
    assert.equal(route.parse('#/simulador?f=a%20b').query.f, 'a b');
    assert.equal(route.parse('#/simulador?f=a b').query.f, 'a b');
    assert.equal(route.parse('#/simulador?f=2*x^2,sin(x)/3').query.f, '2*x^2,sin(x)/3');
    assert.equal(route.parse('#/simulador?f=%CF%80').query.f, 'π');
    assert.equal(route.parse('#/simulador?%66=1').query.f, '1');
  });

  it('never throws on malformed percent escapes', () => {
    assert.equal(route.parse('#/simulador?f=100%').query.f, '100%');
    assert.equal(route.parse('#/simulador?f=%E0%A4%A').query.f, '%E0%A4%A');
    assert.equal(route.parse('#/simulador?f=a%2Bb%ZZ').query.f, 'a+b%ZZ');
    assert.deepStrictEqual(route.parse('#/%E0%A4%A'), { page: 'inicio', sub: null, query: {} });
  });

  it('handles empty values, valueless keys, "=" inside values and duplicate keys', () => {
    assert.deepStrictEqual(route.parse('#/simulador?a=&b').query, { a: '', b: '' });
    assert.deepStrictEqual(route.parse('#/simulador?=x&&y=1').query, { y: '1' });
    assert.equal(route.parse('#/simulador?f=a=b').query.f, 'a=b');
    assert.equal(route.parse('#/simulador?m=a&m=b').query.m, 'b');
    assert.deepStrictEqual(route.parse('#/simulador?').query, {});
  });

  it('ignores keys that could pollute prototypes', () => {
    const r = route.parse('#/simulador?__proto__=x&constructor=y&prototype=z&ok=1');
    assert.deepStrictEqual(r.query, { ok: '1' });
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf(r.query), Object.prototype);
  });
});

describe('route.build', () => {
  it('builds the canonical hash', () => {
    assert.equal(route.build('simulador', null, { f: '2*x*y', h: 0.1 }), '#/simulador?f=2*x*y&h=0.1');
    assert.equal(route.build('teoria', 'rk2'), '#/teoria/rk2');
    assert.equal(route.build('teoria', 'rk2', { x: 1 }), '#/teoria/rk2?x=1');
    assert.equal(route.build('inicio'), '#/inicio');
    assert.equal(route.build('  Teoria '), '#/teoria');
  });

  it('falls back to inicio for unknown pages and ignores invalid sub-routes', () => {
    assert.equal(route.build('nada', 'rk2', { f: 1 }), '#/inicio');
    assert.equal(route.build(undefined), '#/inicio');
    assert.equal(route.build('teoria', 'no valido'), '#/teoria');
    assert.equal(route.build('teoria', 5), '#/teoria');
  });

  it('skips null, undefined and empty values, and stringifies the rest', () => {
    assert.equal(route.build('simulador', null, { a: null, b: undefined, c: '', d: 0, e: false, f: 'x' }), '#/simulador?d=0&e=false&f=x');
    assert.equal(route.build('simulador', null, { m: ['taylor', 'heun', 'rk2'] }), '#/simulador?m=taylor,heun,rk2');
    assert.equal(route.build('simulador', null, null), '#/simulador');
    assert.equal(route.build('simulador', null, {}), '#/simulador');
  });

  it('encodes the characters that would break the URL and keeps formula characters readable', () => {
    assert.equal(route.build('simulador', null, { f: 'a&b=c#d?e%f+g h' }), '#/simulador?f=a%26b%3Dc%23d%3Fe%25f%2Bg%20h');
    assert.equal(route.build('simulador', null, { f: 'x^2+1, sin(x)/2' }), '#/simulador?f=x^2%2B1,%20sin(x)/2');
    assert.equal(route.build('simulador', null, { f: "2*(x-y)!:@$~'" }), "#/simulador?f=2*(x-y)!:@$~'");
  });

  it('never throws on unpaired surrogates', () => {
    const hash = route.build('simulador', null, { f: 'a\uD800b' });
    assert.equal(route.parse(hash).query.f, 'a�b');
  });

  it('ignores blocked keys and empty keys', () => {
    assert.equal(route.build('simulador', null, { __proto__x: 1, constructor: 'a', '': 'b', ok: 1 }), '#/simulador?__proto__x=1&ok=1');
  });
});

describe('route round trip', () => {
  const ALPHABET = Array.from('xy2^*+-/,.()=&?#% :;@$!\'"\\<>[]{}|~`_ñáéíóúüπ·−×²').concat(['sin(x)', '%41', '%', '+', '😀', '\n', '\t']);

  function randomText(rnd) {
    const length = 1 + Math.floor(rnd() * 24);
    let out = '';
    for (let i = 0; i < length; i += 1) out += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
    return out;
  }

  it('parse(build(...)) returns the same text for 2000 adversarial values', () => {
    const rnd = prng(20261019);
    for (let i = 0; i < 2000; i += 1) {
      const value = randomText(rnd);
      const hash = route.build('simulador', 'sub', { f: value });
      const parsed = route.parse(hash);
      assert.deepStrictEqual(parsed, { page: 'simulador', sub: 'sub', query: { f: value } }, JSON.stringify(value));
      assert.equal(/\s/.test(hash), false, `unencoded whitespace in ${JSON.stringify(hash)}`);
    }
  });

  it('round-trips several keys at once, including formula-like keys', () => {
    const query = { f: '2*x*y', x0: '1', y0: '1', xf: '1.3', h: '0.1', m: 'taylor,heun,rk2', 'a b': 'c&d' };
    assert.deepStrictEqual(route.parse(route.build('simulador', null, query)).query, query);
  });

  it('normalize is idempotent and stable under build(parse())', () => {
    const rnd = prng(7);
    for (let i = 0; i < 500; i += 1) {
      const hash = `#/${['inicio', 'simulador', 'teoria', 'zzz', ''][i % 5]}${i % 2 ? '/rk2' : ''}?f=${encodeURIComponent(randomText(rnd))}&x=${randomText(rnd).replace(/[&#]/g, '')}`;
      const once = route.normalize(hash);
      assert.equal(route.normalize(once), once, hash);
    }
  });
});

describe('route helpers', () => {
  it('isRouteHash tells routes from in-page anchors', () => {
    ['', '#', '#/', '#/teoria', '#/simulador?f=1'].forEach((hash) => assert.equal(route.isRouteHash(hash), true, hash));
    ['#app', '#inicio', '#el-paso', 'x'].forEach((hash) => assert.equal(route.isRouteHash(hash), false, hash));
  });

  it('isKnown looks only at the first segment', () => {
    assert.equal(route.isKnown('#/teoria/rk2'), true);
    assert.equal(route.isKnown('#/Teoria'), true);
    assert.equal(route.isKnown('#/nada'), false);
    assert.equal(route.isKnown(''), false);
    assert.equal(route.isKnown('#/extra', { pages: ['extra'] }), true);
  });

  it('sameQuery compares shallowly', () => {
    assert.equal(route.sameQuery({ a: '1' }, { a: '1' }), true);
    assert.equal(route.sameQuery({}, undefined), true);
    assert.equal(route.sameQuery({ a: '1' }, { a: '2' }), false);
    assert.equal(route.sameQuery({ a: '1' }, { a: '1', b: '2' }), false);
    assert.equal(route.sameQuery({ a: '1', b: '2' }, { a: '1', c: '2' }), false);
  });
});
