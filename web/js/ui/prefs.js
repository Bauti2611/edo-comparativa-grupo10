/**
 * EDO.prefs - persistent user preferences with an in-memory fallback.
 *
 * Keys and values (anything invalid is replaced by the default, never thrown):
 *   theme        'auto' | 'light' | 'dark'                    default 'auto'
 *   mode         'normal' | 'projection'                       default 'normal'
 *   display      {decimals: 0..12, mode: 'round' | 'trunc'}    default {decimals: 4, mode: 'round'}
 *   talkMinutes  integer 1..240 | null (null = use config)     default null
 *
 * Storage: one JSON object under STORAGE_KEY in localStorage (the inline script in index.html reads
 * the same key before the first paint, keep both in sync). Every storage access is wrapped in
 * try/catch; when storage is unavailable (private window, blocked site data) values live in memory
 * for the session and `isPersistent()` reports false.
 *
 * URL overrides: `?theme=dark|light|auto` and `?mode=projection|normal` apply to the session only and
 * are never written. An explicit `set()` afterwards replaces the override and persists.
 *
 * Changes are announced as 'prefs:change' {key, value} on EDO.bus and through `onChange`.
 * `create(env)` builds an independent instance (used by the unit tests with a fake storage).
 *
 * Load order: after bus.js. Also `require`-able in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EDO = root.EDO || {};
    root.EDO.prefs = api.createBrowser(root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'edo.g10.prefs.v1';
  const DEFAULTS = Object.freeze({
    theme: 'auto',
    mode: 'normal',
    display: Object.freeze({ decimals: 4, mode: 'round' }),
    talkMinutes: null,
  });

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** One validator per key: returns the clean value, or undefined when the input cannot be used. */
  const VALIDATORS = {
    theme: (v) => (v === 'auto' || v === 'light' || v === 'dark' ? v : undefined),
    mode: (v) => (v === 'normal' || v === 'projection' ? v : undefined),
    display: (v) => {
      if (!isObject(v)) return undefined;
      const decimals = Number.isInteger(v.decimals) ? clamp(v.decimals, 0, 12) : DEFAULTS.display.decimals;
      const mode = v.mode === 'trunc' || v.mode === 'round' ? v.mode : DEFAULTS.display.mode;
      return { decimals, mode };
    },
    talkMinutes: (v) => {
      if (v === null) return null;
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      return clamp(Math.round(v), 1, 240);
    },
  };

  /** Keeps only the known keys of a stored object, validated. */
  function sanitizeAll(data) {
    const out = {};
    if (!isObject(data)) return out;
    Object.keys(VALIDATORS).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const clean = VALIDATORS[key](data[key]);
        if (clean !== undefined) out[key] = clean;
      }
    });
    return out;
  }

  function safeDecode(text) {
    try {
      return decodeURIComponent(text);
    } catch (err) {
      return text;
    }
  }

  /** Session overrides from a `location.search` string. */
  function parseOverrides(search) {
    const out = {};
    String(search || '').replace(/^\?/, '').split('&').forEach((pair) => {
      if (!pair) return;
      const at = pair.indexOf('=');
      const key = safeDecode(at === -1 ? pair : pair.slice(0, at));
      const value = safeDecode(at === -1 ? '' : pair.slice(at + 1));
      if (key === 'theme' || key === 'mode') {
        const clean = VALIDATORS[key](value);
        if (clean !== undefined) out[key] = clean;
      }
    });
    return out;
  }

  const copy = (v) => (isObject(v) ? Object.assign({}, v) : v);

  /**
   * Builds a preferences store.
   * @param {{storage?: {getItem: Function, setItem: Function}, search?: string, bus?: {emit: Function}}} [env]
   * @returns {object} get, set, getAll, reset, onChange, isPersistent, hasOverride, STORAGE_KEY.
   */
  function create(env) {
    const options = env || {};
    const storage = options.storage || null;
    const bus = options.bus || null;
    const listeners = new Set();
    let persistent = Boolean(storage);
    const overrides = parseOverrides(options.search);

    function readStored() {
      if (!storage) return {};
      let raw = null;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (err) {
        persistent = false;
        return {};
      }
      if (!raw) return {};
      try {
        return sanitizeAll(JSON.parse(raw));
      } catch (err) {
        return {}; // corrupted JSON: start clean, the next write replaces it
      }
    }

    const stored = readStored();

    function write() {
      if (!storage) return;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(stored));
        persistent = true;
      } catch (err) {
        persistent = false;
      }
    }

    function announce(key, value) {
      const payload = { key, value: copy(value) };
      listeners.forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          if (typeof console !== 'undefined') console.error('prefs: listener failed', err);
        }
      });
      if (bus && typeof bus.emit === 'function') bus.emit('prefs:change', payload);
    }

    /** Current value of a key (override, then stored, then default); undefined for unknown keys. */
    function get(key) {
      if (!VALIDATORS[key]) return undefined;
      if (Object.prototype.hasOwnProperty.call(overrides, key)) return copy(overrides[key]);
      if (Object.prototype.hasOwnProperty.call(stored, key)) return copy(stored[key]);
      return copy(DEFAULTS[key]);
    }

    /**
     * Validates, stores and announces a value. `display` accepts a partial object that is merged
     * into the current one. An explicit set replaces any URL override of the same key.
     * @returns {boolean} false when the value was rejected.
     */
    function set(key, value) {
      const validate = VALIDATORS[key];
      if (!validate) return false;
      let candidate = value;
      if (key === 'display') {
        if (!isObject(value)) return false;
        candidate = Object.assign({}, get('display'), value);
      }
      const clean = validate(candidate);
      if (clean === undefined) return false;
      delete overrides[key];
      stored[key] = clean;
      write();
      announce(key, clean);
      return true;
    }

    /** All keys with the current values. */
    function getAll() {
      const out = {};
      Object.keys(VALIDATORS).forEach((key) => { out[key] = get(key); });
      return out;
    }

    /** Forgets stored values (all, or one key) and announces the keys whose value changed. */
    function reset(key) {
      const keys = key ? [key] : Object.keys(VALIDATORS);
      keys.forEach((k) => {
        if (!VALIDATORS[k]) return;
        const before = JSON.stringify(get(k));
        delete stored[k];
        delete overrides[k];
        if (JSON.stringify(get(k)) !== before) announce(k, get(k));
      });
      write();
    }

    /** Subscribes to changes. Returns the unsubscribe function. */
    function onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    return {
      get,
      set,
      getAll,
      reset,
      onChange,
      isPersistent: () => persistent,
      hasOverride: (key) => Object.prototype.hasOwnProperty.call(overrides, key),
      STORAGE_KEY,
      DEFAULTS,
    };
  }

  /** The shared browser instance: real localStorage when it works, memory otherwise. */
  function createBrowser(win) {
    let storage = null;
    try {
      const candidate = win.localStorage;
      candidate.setItem('__edo_probe__', '1');
      candidate.removeItem('__edo_probe__');
      storage = candidate;
    } catch (err) {
      storage = null;
    }
    let search = '';
    try {
      search = win.location.search;
    } catch (err) {
      search = '';
    }
    return create({ storage, search, bus: win.EDO && win.EDO.bus });
  }

  return { create, createBrowser, STORAGE_KEY, DEFAULTS, VALIDATORS, parseOverrides };
}));
