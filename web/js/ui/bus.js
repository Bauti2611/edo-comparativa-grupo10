/**
 * EDO.bus - tiny publish/subscribe used to decouple the shell, preferences, charts and pages.
 *
 * Topics used by the shell: 'prefs:change' {key, value}, 'theme:change' {theme, scheme},
 * 'mode:change' {mode}, 'app:ready'. Listener errors are isolated: one failing listener never
 * stops the others (the error is logged).
 *
 * Load order: before prefs.js. Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EDO = root.EDO || {};
    root.EDO.bus = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Creates an independent bus (the shared one is the module itself).
   * @returns {{on: Function, once: Function, off: Function, emit: Function, count: Function}}
   */
  function createBus() {
    const topics = new Map();

    /**
     * Subscribes to a topic.
     * @param {string} topic
     * @param {function(*, string): void} fn Called with (payload, topic).
     * @returns {function(): void} Unsubscribe function.
     */
    function on(topic, fn) {
      if (typeof fn !== 'function') throw new TypeError('bus.on: the listener must be a function');
      if (!topics.has(topic)) topics.set(topic, new Set());
      topics.get(topic).add(fn);
      return () => off(topic, fn);
    }

    /** Subscribes for a single delivery. Returns the unsubscribe function. */
    function once(topic, fn) {
      const unsubscribe = on(topic, (payload, name) => {
        unsubscribe();
        fn(payload, name);
      });
      return unsubscribe;
    }

    /** Removes a listener (no-op when it is not subscribed). */
    function off(topic, fn) {
      const set = topics.get(topic);
      if (!set) return;
      set.delete(fn);
      if (set.size === 0) topics.delete(topic);
    }

    /**
     * Delivers a payload to the current listeners of a topic.
     * @returns {number} How many listeners were called.
     */
    function emit(topic, payload) {
      const set = topics.get(topic);
      if (!set) return 0;
      const listeners = Array.from(set);
      listeners.forEach((fn) => {
        try {
          fn(payload, topic);
        } catch (err) {
          if (typeof console !== 'undefined') console.error(`bus: listener for "${topic}" failed`, err);
        }
      });
      return listeners.length;
    }

    /** Number of listeners of a topic (for tests and cleanup checks). */
    function count(topic) {
      const set = topics.get(topic);
      return set ? set.size : 0;
    }

    return { on, once, off, emit, count };
  }

  const bus = createBus();
  bus.create = createBus;
  return bus;
}));
