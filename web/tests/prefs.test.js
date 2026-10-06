'use strict';
/**
 * EDO.prefs (persistent preferences with a memory fallback and session-only URL overrides) and EDO.bus
 * (the pub/sub it announces changes on). Both are UMD so they run here with an injected fake storage.
 */
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { WEB_ROOT } = require('./helpers.js');

const prefsModule = require(path.join(WEB_ROOT, 'js', 'ui', 'prefs.js'));
const bus = require(path.join(WEB_ROOT, 'js', 'ui', 'bus.js'));

const KEY = prefsModule.STORAGE_KEY;

/** Fake localStorage that counts writes. */
function memoryStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    data,
    writes: 0,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) { this.writes += 1; data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

const stored = (storage) => JSON.parse(storage.data.get(KEY));

describe('EDO.prefs defaults and validation', () => {
  it('starts with the documented defaults', () => {
    const p = prefsModule.create({ storage: memoryStorage() });
    assert.equal(p.get('theme'), 'auto');
    assert.equal(p.get('mode'), 'normal');
    assert.deepEqual(p.get('display'), { decimals: 4, mode: 'round' });
    assert.equal(p.get('talkMinutes'), null);
    assert.equal(p.get('nope'), undefined);
    assert.deepEqual(p.getAll(), { theme: 'auto', mode: 'normal', display: { decimals: 4, mode: 'round' }, talkMinutes: null });
  });

  it('accepts only valid values for theme and mode', () => {
    const p = prefsModule.create({ storage: memoryStorage() });
    ['light', 'dark', 'auto'].forEach((v) => assert.equal(p.set('theme', v), true));
    ['purple', '', null, 1, undefined].forEach((v) => assert.equal(p.set('theme', v), false));
    assert.equal(p.get('theme'), 'auto');
    assert.equal(p.set('mode', 'projection'), true);
    assert.equal(p.set('mode', 'PROJECTION'), false);
    assert.equal(p.get('mode'), 'projection');
    assert.equal(p.set('unknown', 1), false);
  });

  it('merges partial display settings and repairs bad fields', () => {
    const p = prefsModule.create({ storage: memoryStorage() });
    assert.equal(p.set('display', { decimals: 6 }), true);
    assert.deepEqual(p.get('display'), { decimals: 6, mode: 'round' });
    assert.equal(p.set('display', { mode: 'trunc' }), true);
    assert.deepEqual(p.get('display'), { decimals: 6, mode: 'trunc' });
    p.set('display', { decimals: 99 });
    assert.equal(p.get('display').decimals, 12);
    p.set('display', { decimals: -3 });
    assert.equal(p.get('display').decimals, 0);
    p.set('display', { decimals: 2.5, mode: 'floor' });
    assert.deepEqual(p.get('display'), { decimals: 4, mode: 'round' });
    assert.equal(p.set('display', 'round'), false);
    assert.equal(p.set('display', null), false);
  });

  it('clamps the talk length to whole minutes between 1 and 240, and accepts null to reset', () => {
    const p = prefsModule.create({ storage: memoryStorage() });
    assert.equal(p.set('talkMinutes', 25), true);
    assert.equal(p.get('talkMinutes'), 25);
    p.set('talkMinutes', 0);
    assert.equal(p.get('talkMinutes'), 1);
    p.set('talkMinutes', 999);
    assert.equal(p.get('talkMinutes'), 240);
    p.set('talkMinutes', 12.6);
    assert.equal(p.get('talkMinutes'), 13);
    assert.equal(p.set('talkMinutes', '20'), false);
    assert.equal(p.set('talkMinutes', NaN), false);
    assert.equal(p.set('talkMinutes', null), true);
    assert.equal(p.get('talkMinutes'), null);
  });

  it('returns copies, so callers cannot mutate the store', () => {
    const p = prefsModule.create({ storage: memoryStorage() });
    p.get('display').decimals = 9;
    assert.equal(p.get('display').decimals, 4);
    const all = p.getAll();
    all.display.mode = 'trunc';
    assert.equal(p.get('display').mode, 'round');
    assert.ok(Object.isFrozen(prefsModule.DEFAULTS.display));
  });
});

describe('EDO.prefs persistence', () => {
  it('writes one JSON object under the shared key and a new instance reads it back', () => {
    const storage = memoryStorage();
    const first = prefsModule.create({ storage });
    first.set('theme', 'dark');
    first.set('mode', 'projection');
    first.set('display', { decimals: 5, mode: 'trunc' });
    assert.deepEqual(stored(storage), { theme: 'dark', mode: 'projection', display: { decimals: 5, mode: 'trunc' } });
    const second = prefsModule.create({ storage });
    assert.equal(second.get('theme'), 'dark');
    assert.equal(second.get('mode'), 'projection');
    assert.deepEqual(second.get('display'), { decimals: 5, mode: 'trunc' });
    assert.equal(first.isPersistent(), true);
  });

  it('ignores corrupted JSON, unknown keys and invalid stored values', () => {
    assert.equal(prefsModule.create({ storage: memoryStorage({ [KEY]: '{not json' }) }).get('theme'), 'auto');
    const p = prefsModule.create({ storage: memoryStorage({ [KEY]: JSON.stringify({ theme: 'neon', mode: 'projection', evil: 1, display: { decimals: 50, mode: 'x' }, talkMinutes: 'a' }) }) });
    assert.deepEqual(p.getAll(), { theme: 'auto', mode: 'projection', display: { decimals: 12, mode: 'round' }, talkMinutes: null });
    assert.equal(prefsModule.create({ storage: memoryStorage({ [KEY]: '[1,2]' }) }).get('mode'), 'normal');
    assert.equal(prefsModule.create({ storage: memoryStorage({ [KEY]: 'null' }) }).get('mode'), 'normal');
  });

  it('keeps working in memory when storage is missing or throws', () => {
    const none = prefsModule.create({ storage: null });
    assert.equal(none.isPersistent(), false);
    assert.equal(none.set('theme', 'dark'), true);
    assert.equal(none.get('theme'), 'dark');

    const unreadable = prefsModule.create({ storage: { getItem() { throw new Error('blocked'); }, setItem() {} } });
    assert.equal(unreadable.isPersistent(), false);
    assert.equal(unreadable.get('theme'), 'auto');

    const full = prefsModule.create({ storage: { getItem: () => null, setItem() { throw new Error('quota'); } } });
    assert.equal(full.isPersistent(), true);
    assert.equal(full.set('mode', 'projection'), true);
    assert.equal(full.get('mode'), 'projection');
    assert.equal(full.isPersistent(), false);
  });

  it('browser factory survives a window whose localStorage throws', () => {
    const win = { get localStorage() { throw new Error('SecurityError'); }, location: { search: '' } };
    const p = prefsModule.createBrowser(win);
    assert.equal(p.isPersistent(), false);
    assert.equal(p.get('theme'), 'auto');
    const p2 = prefsModule.createBrowser({ localStorage: memoryStorage(), location: { get search() { throw new Error('x'); } } });
    assert.equal(p2.get('mode'), 'normal');
  });

  it('reset forgets stored values and announces what changed', () => {
    const storage = memoryStorage();
    const p = prefsModule.create({ storage });
    p.set('theme', 'dark');
    p.set('mode', 'normal');
    const seen = [];
    p.onChange((c) => seen.push(c.key));
    p.reset();
    assert.deepEqual(seen, ['theme']);
    assert.equal(p.get('theme'), 'auto');
    assert.deepEqual(stored(storage), {});
  });
});

describe('EDO.prefs URL overrides (session only)', () => {
  it('applies ?theme and ?mode without writing anything', () => {
    const storage = memoryStorage();
    const p = prefsModule.create({ storage, search: '?theme=dark&mode=projection' });
    assert.equal(p.get('theme'), 'dark');
    assert.equal(p.get('mode'), 'projection');
    assert.equal(p.hasOverride('theme'), true);
    assert.equal(storage.writes, 0);
    assert.equal(storage.data.size, 0);
  });

  it('keeps the stored value untouched underneath the override', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ mode: 'normal', theme: 'light' }) });
    const p = prefsModule.create({ storage, search: '?mode=projection' });
    assert.equal(p.get('mode'), 'projection');
    assert.equal(p.get('theme'), 'light');
    assert.deepEqual(stored(storage), { mode: 'normal', theme: 'light' });
  });

  it('an explicit set replaces the override and persists', () => {
    const storage = memoryStorage();
    const p = prefsModule.create({ storage, search: '?theme=dark' });
    p.set('theme', 'light');
    assert.equal(p.get('theme'), 'light');
    assert.equal(p.hasOverride('theme'), false);
    assert.equal(stored(storage).theme, 'light');
  });

  it('ignores invalid, unknown and malformed overrides', () => {
    const p = prefsModule.create({ storage: memoryStorage(), search: '?theme=neon&mode=&display=x&%E0%A4%A=1&=&&theme' });
    assert.equal(p.get('theme'), 'auto');
    assert.equal(p.get('mode'), 'normal');
    assert.equal(p.hasOverride('theme'), false);
    assert.deepEqual(prefsModule.parseOverrides('?theme=auto'), { theme: 'auto' });
    assert.deepEqual(prefsModule.parseOverrides(''), {});
    assert.deepEqual(prefsModule.parseOverrides(undefined), {});
  });
});

describe('EDO.prefs change events', () => {
  it('notifies onChange listeners and the bus with a copy of the value', () => {
    const emitted = [];
    const p = prefsModule.create({ storage: memoryStorage(), bus: { emit: (topic, payload) => emitted.push([topic, payload]) } });
    const heard = [];
    const off = p.onChange((c) => heard.push(c));
    p.set('theme', 'dark');
    p.set('display', { decimals: 3 });
    assert.deepEqual(heard[0], { key: 'theme', value: 'dark' });
    assert.deepEqual(emitted[0], ['prefs:change', { key: 'theme', value: 'dark' }]);
    heard[1].value.decimals = 99; // mutating the payload must not touch the store
    assert.equal(p.get('display').decimals, 3);
    off();
    p.set('mode', 'projection');
    assert.equal(heard.length, 2);
    assert.equal(emitted.length, 3);
  });

  it('does not announce rejected values and survives a throwing listener', () => {
    const p = prefsModule.create({ storage: memoryStorage() });
    let calls = 0;
    p.onChange(() => { calls += 1; });
    assert.equal(p.set('theme', 'bad'), false);
    assert.equal(calls, 0);
    const quiet = mock.method(console, 'error', () => {});
    p.onChange(() => { throw new Error('listener bug'); });
    assert.equal(p.set('theme', 'dark'), true);
    assert.equal(calls, 1);
    assert.equal(quiet.mock.callCount(), 1);
    quiet.mock.restore();
  });
});

describe('EDO.bus', () => {
  it('delivers payloads to subscribers in subscription order and reports how many', () => {
    const b = bus.create();
    const log = [];
    b.on('t', (payload, topic) => log.push(['a', payload, topic]));
    b.on('t', (payload) => log.push(['b', payload]));
    assert.equal(b.emit('t', 42), 2);
    assert.deepEqual(log, [['a', 42, 't'], ['b', 42]]);
    assert.equal(b.emit('other', 1), 0);
  });

  it('supports unsubscribe, once and listener counts', () => {
    const b = bus.create();
    let n = 0;
    const off = b.on('t', () => { n += 1; });
    const fn = () => { n += 10; };
    b.on('t', fn);
    b.once('t', () => { n += 100; });
    assert.equal(b.count('t'), 3);
    b.emit('t');
    assert.equal(n, 111);
    off();
    b.off('t', fn);
    assert.equal(b.count('t'), 0);
    b.emit('t');
    assert.equal(n, 111);
    b.off('missing', fn);
    assert.throws(() => b.on('t', 'not a function'), TypeError);
  });

  it('isolates listener errors and tolerates listeners that unsubscribe while being called', () => {
    const b = bus.create();
    const quiet = mock.method(console, 'error', () => {});
    const seen = [];
    b.on('t', () => { throw new Error('boom'); });
    const off = b.on('t', () => { seen.push('second'); off(); });
    b.on('t', () => seen.push('third'));
    b.emit('t');
    b.emit('t');
    assert.deepEqual(seen, ['second', 'third', 'third']);
    assert.equal(quiet.mock.callCount(), 2);
    quiet.mock.restore();
  });

  it('exposes a shared instance and independent ones', () => {
    assert.equal(typeof bus.on, 'function');
    const a = bus.create();
    const b = bus.create();
    a.on('x', () => {});
    assert.equal(b.count('x'), 0);
  });
});
