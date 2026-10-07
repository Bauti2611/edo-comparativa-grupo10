/**
 * EDO.timer - the presentation timer of the top bar and the agenda budget computed from config.talk.
 *
 * Pure part (also `require`-able in Node, where it is unit-tested; no DOM, no clock of its own):
 *   DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES
 *   parseMinutes(input) -> integer 1..240 | NaN      what the user typed ('15,5' or '15.5' round to 16)
 *   resolveMinutes(stored, configured) -> integer    stored choice (prefs.talkMinutes), else config, else 20
 *   formatClock(ms) -> 'mm:ss'                       a started second counts whole; overtime is '−mm:ss'
 *   durationText(seconds) -> '4 min' | '3 min 45 s' | '45 s'
 *   plan(minutes, agenda) -> {totalSec, items[{id, label, share, seconds, startSec, endSec}]}
 *                                                    whole seconds by largest remainder, so they add up exactly
 *   windowText(item) -> '02:00–07:00'                the planned window of one agenda item
 *   segmentOf(plan, pageId), expectedAt(plan, elapsedSec), schedule(plan, pageId, elapsedSec) -> none|ahead|on|late
 *   phase(remainingMs, totalMs) -> normal|warning|final|over
 *                                                    warning: last 2 min (at most a quarter of the talk);
 *                                                    final: last minute (at most a tenth); over: time is up
 *   minuteMark(remainingMs), announcement(mark)      the whole-minute marks read by screen readers
 *   create({minutes, now}) -> {start, pause, toggle, reset, setMinutes, snapshot, tick}
 *     snapshot() = {status: idle|running|paused, totalMs, elapsedMs, remainingMs, text, phase, minuteMark}
 *
 * Browser part: `mount(slot)` builds the timer inside #timer-slot (start/pause, the remaining time, a panel with
 * reset, the total minutes and the agenda segment of the current section) and is called once on 'app:ready'.
 * The total is stored in EDO.prefs ('talkMinutes', persisted when storage works) and followed on 'prefs:change',
 * so the agenda of Inicio and the timer always agree. Key T starts or pauses (registered in the help dialog).
 * Screen readers hear the whole minutes only (polite live region), never every second. No sound.
 *
 * Load order: after dom.js and prefs.js, before app.js (it waits for 'app:ready' on EDO.bus to mount).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.timer = Object.assign(api, api.browser(root));
    delete EDO.timer.browser;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_MINUTES = 20;
  const MIN_MINUTES = 1;
  const MAX_MINUTES = 240;
  const MINUTE = 60000;
  const WARN_MS = 2 * MINUTE;
  const FINAL_MS = MINUTE;
  const MINUS = '−';

  const pad = (n) => String(n).padStart(2, '0');

  /* ---- Parsing and formatting ---------------------------------------------------------------------------- */

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

  function formatClock(ms) {
    if (ms > 0) return clockOf(Math.ceil(ms / 1000));
    const over = Math.floor(-ms / 1000);
    return over > 0 ? `${MINUS}${clockOf(over)}` : '00:00';
  }

  function durationText(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m === 0 && r > 0) return `${r} s`;
    return r === 0 ? `${m} min` : `${m} min ${r} s`;
  }

  /* ---- Agenda budget ------------------------------------------------------------------------------------------- */

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

  function segmentOf(p, pageId) {
    return (p && p.items.find((item) => item.id === pageId)) || null;
  }

  function expectedAt(p, elapsedSec) {
    return (p && p.items.find((item) => elapsedSec >= item.startSec && elapsedSec < item.endSec)) || null;
  }

  /** Where the talk stands for the section on screen: before its window, inside it, or past its end. */
  function schedule(p, pageId, elapsedSec) {
    const item = segmentOf(p, pageId);
    if (!item) return 'none';
    if (elapsedSec < item.startSec) return 'ahead';
    return elapsedSec > item.endSec ? 'late' : 'on';
  }

  /* ---- Phases and announcements ---------------------------------------------------------------------------- */

  function phase(remainingMs, totalMs) {
    if (remainingMs <= 0) return 'over';
    if (remainingMs <= Math.min(FINAL_MS, totalMs * 0.1)) return 'final';
    if (remainingMs <= Math.min(WARN_MS, totalMs * 0.25)) return 'warning';
    return 'normal';
  }

  /** Whole minutes left (rounded up); in overtime -1 for the first minute past zero, -2 for the second, ... */
  function minuteMark(remainingMs) {
    if (remainingMs > 0) return Math.ceil(remainingMs / MINUTE);
    if (remainingMs === 0) return 0;
    return -Math.ceil(-remainingMs / MINUTE);
  }

  function announcement(mark) {
    if (mark > 1) return `Quedan ${mark} minutos.`;
    if (mark === 1) return 'Queda 1 minuto.';
    if (mark >= -1) return 'Tiempo cumplido.';
    const extra = -mark - 1;
    return `Tiempo excedido: ${extra} ${extra === 1 ? 'minuto' : 'minutos'} de más.`;
  }

  /* ---- State machine ------------------------------------------------------------------------------------------ */

  function create(opts) {
    const o = opts || {};
    const now = typeof o.now === 'function' ? o.now : () => Date.now();
    let totalMs = resolveMinutes(o.minutes, DEFAULT_MINUTES) * MINUTE;
    let status = 'idle';
    let banked = 0; // elapsed time of the finished running stretches
    let since = 0; // clock value when the current running stretch began

    const elapsed = () => banked + (status === 'running' ? now() - since : 0);

    function snapshot() {
      const elapsedMs = elapsed();
      const remainingMs = totalMs - elapsedMs;
      return {
        status, totalMs, elapsedMs, remainingMs, text: formatClock(remainingMs), phase: phase(remainingMs, totalMs), minuteMark: minuteMark(remainingMs),
      };
    }

    function start() {
      if (status !== 'running') {
        since = now();
        status = 'running';
      }
      return snapshot();
    }

    function pause() {
      if (status === 'running') {
        banked += now() - since;
        status = 'paused';
      }
      return snapshot();
    }

    return {
      start,
      pause,
      toggle: () => (status === 'running' ? pause() : start()),
      reset() {
        status = 'idle';
        banked = 0;
        return snapshot();
      },
      setMinutes(minutes) {
        const m = parseMinutes(minutes);
        if (Number.isNaN(m)) return false;
        totalMs = m * MINUTE;
        return true;
      },
      snapshot,
      tick: snapshot,
    };
  }

  /* ---- Browser: the timer of the top bar ------------------------------------------------------------------ */

  function browser(win) {
    const doc = win.document;
    let mounted = null;

    /** Play, pause and reset glyphs in the stroke style of EDO.dom.icon (which has no media icons). */
    function glyph(svg, name) {
      const paths = {
        play: [['path', { d: 'M8 5.5v13l10.5-6.5z', fill: 'currentColor' }]],
        pause: [['path', { d: 'M8.5 5.5v13M15.5 5.5v13', 'stroke-width': '2.6' }]],
        reset: [['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }], ['path', { d: 'M4.5 4.5v4h4' }]],
      }[name];
      return svg('svg', {
        class: 'icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false', 'aria-hidden': 'true', 'data-icon': name,
      }, paths.map(([tag, attrs]) => svg(tag, attrs)));
    }

    function mount(slot) {
      const EDO = win.EDO;
      if (!slot || mounted) return mounted;
      const { h, svg, uid, isTextEntry } = EDO.dom;
      const { prefs, bus, config: cfg } = EDO;
      const clock = win.performance && typeof win.performance.now === 'function' ? () => win.performance.now() : () => Date.now();
      const configured = () => (cfg && cfg.talk ? cfg.talk.minutes : DEFAULT_MINUTES);
      const minutes = () => resolveMinutes(prefs ? prefs.get('talkMinutes') : null, configured());
      const agenda = () => (cfg && cfg.talk ? cfg.talk.agenda : []);
      const machine = create({ minutes: minutes(), now: clock });
      const panelId = uid('timer-panel');
      const inputId = uid('timer-min');
      let interval = 0;
      let lastText = '';
      let lastMark = null;

      const play = h('button', { class: 'icon-btn timer__play', type: 'button' });
      const time = h('span', { class: 'timer__time' }, '');
      const face = h('button', {
        class: 'timer__face', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId,
      }, h('span', { class: 'sr-only' }, 'Cronómetro, tiempo restante: '), time);
      const runBtn = h('button', { class: 'btn', type: 'button', 'data-size': 'sm' });
      const resetBtn = h('button', { class: 'btn', type: 'button', 'data-size': 'sm' }, glyph(svg, 'reset'), 'Reiniciar');
      const input = h('input', {
        class: 'input timer__input', id: inputId, type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': `${inputId}-hint`,
      });
      const error = h('p', { class: 'field__error', id: `${inputId}-error`, hidden: true }, 'Ingrese un número entero de minutos entre 1 y 240.');
      const segLine = h('p', { class: 'timer__line' });
      const planLine = h('p', { class: 'timer__line timer__line--muted' });
      const live = h('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
      const panel = h('div', {
        class: 'timer__panel', id: panelId, role: 'group', 'aria-label': 'Cronómetro de la exposición', hidden: true,
      },
      h('div', { class: 'timer__buttons' }, runBtn, resetBtn),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: inputId }, 'Duración total (minutos)'),
        input,
        h('p', { class: 'field__hint', id: `${inputId}-hint` }, `Se guarda en este navegador. Valor inicial: ${configured()} min (provisional, ajústelo al tiempo asignado).`),
        error),
      segLine, planLine);
      const element = h('div', {
        class: 'timer', 'data-status': 'idle', 'data-phase': 'normal', 'data-schedule': 'none',
      }, play, face, panel, live);

      const currentPage = () => {
        try {
          return EDO.route.parse(win.location.hash).page;
        } catch (err) {
          return null;
        }
      };

      function paintStatic(s) {
        const running = s.status === 'running';
        const verb = running ? 'Pausar' : (s.status === 'paused' ? 'Reanudar' : 'Iniciar');
        const label = `${verb} el cronómetro (tecla T)`;
        play.setAttribute('aria-label', label);
        play.title = label;
        play.replaceChildren(glyph(svg, running ? 'pause' : 'play'));
        runBtn.replaceChildren(glyph(svg, running ? 'pause' : 'play'), verb);
        resetBtn.disabled = s.status === 'idle';
        element.setAttribute('data-status', s.status);
        if (doc.activeElement !== input) input.value = String(Math.round(s.totalMs / MINUTE));
      }

      function paintSchedule(s) {
        const p = plan(Math.round(s.totalMs / MINUTE), agenda());
        const page = currentPage();
        const seg = segmentOf(p, page);
        const elapsedSec = s.elapsedMs / 1000;
        const state = s.status === 'idle' ? 'none' : schedule(p, page, elapsedSec);
        element.setAttribute('data-schedule', state);
        const where = seg ? `${seg.label}: ${durationText(seg.seconds)} previstos, de ${windowText(seg)}.` : 'Esta sección no tiene tiempo asignado en la agenda.';
        segLine.textContent = `Sección actual. ${where}`;
        const expected = s.status === 'idle' ? null : expectedAt(p, elapsedSec);
        planLine.textContent = s.status === 'idle'
          ? `Agenda de ${durationText(p.totalSec)} en ${p.items.length} partes (detalle en Inicio).`
          : (expected ? `Según la agenda, ahora corresponde: ${expected.label}.` : 'Se cumplió el tiempo de la agenda.');
        face.title = seg ? `${seg.label}: ${durationText(seg.seconds)} previstos (${windowText(seg)})` : 'Cronómetro de la exposición';
      }

      function paint(force) {
        const s = machine.snapshot();
        if (force || s.text !== lastText) {
          lastText = s.text;
          time.textContent = s.text;
          element.setAttribute('data-phase', s.status === 'idle' ? 'normal' : s.phase);
          paintSchedule(s);
        }
        if (s.status === 'running' && lastMark !== null && s.minuteMark !== lastMark) live.textContent = announcement(s.minuteMark);
        lastMark = s.minuteMark;
        return s;
      }

      function loop(on) {
        if (on && !interval) interval = win.setInterval(() => paint(false), 250);
        if (!on && interval) {
          win.clearInterval(interval);
          interval = 0;
        }
      }

      function act(name) {
        const s = machine[name]();
        loop(s.status === 'running');
        paintStatic(s);
        paint(true);
        return s;
      }

      function toggleRun(fromKey) {
        const s = act('toggle');
        if (fromKey && EDO.app) EDO.app.announce(s.status === 'running' ? 'Cronómetro en marcha' : 'Cronómetro en pausa');
      }

      function setOpen(open) {
        panel.hidden = !open;
        face.setAttribute('aria-expanded', String(open));
      }

      function commitMinutes() {
        const m = parseMinutes(input.value);
        if (Number.isNaN(m)) {
          input.setAttribute('aria-invalid', 'true');
          input.setAttribute('aria-describedby', `${inputId}-hint ${inputId}-error`);
          error.hidden = false;
          return;
        }
        input.removeAttribute('aria-invalid');
        input.setAttribute('aria-describedby', `${inputId}-hint`);
        error.hidden = true;
        input.value = String(m);
        if (!prefs || !prefs.set('talkMinutes', m)) applyMinutes(m);
      }

      function applyMinutes(m) {
        machine.setMinutes(m);
        lastMark = machine.snapshot().minuteMark;
        paintStatic(machine.snapshot());
        paint(true);
      }

      play.addEventListener('click', () => toggleRun(false));
      runBtn.addEventListener('click', () => toggleRun(false));
      resetBtn.addEventListener('click', () => {
        act('reset');
        face.focus();
      });
      face.addEventListener('click', () => setOpen(panel.hidden));
      input.addEventListener('change', commitMinutes);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitMinutes();
        }
      });
      element.addEventListener('focusout', (event) => {
        if (!panel.hidden && event.relatedTarget && !element.contains(event.relatedTarget)) setOpen(false);
      });
      doc.addEventListener('click', (event) => {
        if (!panel.hidden && !element.contains(event.target)) setOpen(false);
      });
      doc.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden && !doc.querySelector('dialog[open]')) {
          const inside = element.contains(doc.activeElement);
          setOpen(false);
          if (inside) face.focus();
          return;
        }
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
        if (event.key !== 't' && event.key !== 'T') return;
        if (doc.querySelector('dialog[open]') || isTextEntry(event.target)) return;
        event.preventDefault();
        toggleRun(true);
      });
      win.addEventListener('hashchange', () => paint(true));
      if (bus) {
        bus.on('prefs:change', (change) => {
          if (change && change.key === 'talkMinutes') applyMinutes(resolveMinutes(change.value, configured()));
        });
      }

      slot.replaceChildren(element);
      paintStatic(machine.snapshot());
      paint(true);
      if (EDO.app) {
        EDO.app.addHelp('T', 'Iniciar o pausar el cronómetro de la exposición.');
        EDO.app.fitBar();
      }
      mounted = {
        element,
        machine,
        open: () => setOpen(true),
        close: () => setOpen(false),
        snapshot: () => machine.snapshot(),
      };
      return mounted;
    }

    // Wire once the shell is up (app.js loads after this file and emits 'app:ready' after the first route).
    const EDO = win.EDO;
    if (EDO && EDO.bus && doc) {
      EDO.bus.once('app:ready', () => {
        try {
          mount(doc.getElementById('timer-slot'));
        } catch (err) {
          console.error(err);
        }
      });
    }

    return { mount, instance: () => mounted };
  }

  return {
    DEFAULT_MINUTES,
    MIN_MINUTES,
    MAX_MINUTES,
    parseMinutes,
    resolveMinutes,
    formatClock,
    durationText,
    plan,
    windowText,
    segmentOf,
    expectedAt,
    schedule,
    phase,
    minuteMark,
    announcement,
    create,
    browser,
  };
}));
