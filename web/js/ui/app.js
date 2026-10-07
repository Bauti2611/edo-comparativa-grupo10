/**
 * EDO.app - the shell: hash router, page registry, theme, projection mode, navigation bar, keyboard and help.
 *
 * Pages register themselves before `EDO.app.start()` runs (see start.js):
 *   EDO.app.registerPage(id, { title, nav: {label, order}, render(root, ctx), onLeave(ctx) })
 *     - `render(root, ctx)` fills the empty `root` element (sync or async). `ctx` = {page, sub, query, signal}:
 *       `query` is a snapshot, `signal` (AbortSignal) aborts when the page is left (use it to stop timers,
 *       destroy charts, remove listeners). A page without `nav` is hidden from the bar (e.g. '#/_ui').
 *     - Put the page's <h1> inside `root`: focus moves to it on every navigation after the first load.
 *     - Sub-route '#/teoria/rk2' scrolls to the element with id 'teoria-rk2' (page id + '-' + sub).
 *
 *   EDO.app.navigate(page, {sub, query, replace})   change route (replace: no new history entry)
 *   EDO.app.setQuery(patch, {replace = true, merge = true})
 *                                                  update the query of the current route WITHOUT re-rendering
 *                                                  (shareable state); null/undefined/'' values remove a key.
 *   EDO.app.current()                              {page, sub, query} (a copy)
 *   EDO.app.announce(text)                         polite screen-reader announcement
 *   EDO.app.addHelp(keys, description)             adds a row to the '?' shortcuts dialog (keys: string or string[])
 *   EDO.app.fitBar()                               re-measure the top bar (call after changing the bar content)
 *   EDO.app.ready                                  false until the first route has been rendered, then true
 *
 * Shell behaviour: sets <html data-theme="auto|light|dark" data-scheme="light|dark" data-mode="normal|projection">,
 * sets document.title ("<Page> · Taylor, Euler Mejorado y RK2 · Grupo 10"), keys: P projection, ? help,
 * ArrowLeft/ArrowRight between sections (projection mode only, never while typing or on widgets that use arrows).
 * Bus topics emitted: 'theme:change' {theme, scheme}, 'mode:change' {mode}, 'app:ready'.
 *
 * Load order: after bus, prefs, route, dom, tex and charts; before the page files and start.js.
 */
(function (root) {
  'use strict';

  const EDO = (root.EDO = root.EDO || {});
  const doc = root.document;
  const { h, icon, isTextEntry, claimsArrows } = EDO.dom;
  const { route, prefs, bus } = EDO;
  const cfg = EDO.config;

  const TITLE_SUFFIX = 'Taylor, Euler Mejorado y RK2';
  const THEME_ORDER = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: 'automático', light: 'claro', dark: 'oscuro' };
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const pages = new Map();
  const helpEntries = [];
  const state = {
    started: false,
    current: null, // {page, sub, query} of the route being shown
    active: null, // {id, def, controller, ctx}
    token: 0, // increments on every render, to ignore results of superseded async renders
    lastScroll: null, // scrollY right after scrolling to a sub-route target
    menuOpen: false,
    announceTimer: null,
    fitFrame: 0,
  };
  const els = {};

  const $ = (selector, scope) => (scope || doc).querySelector(selector);
  /** Route helpers bound to the registered page ids (so pages that are not in route.PAGES also work). */
  const routeOpts = () => ({ pages: Array.from(pages.keys()) });
  const buildHash = (page, sub, query) => route.build(page, sub, query, routeOpts());
  const reducedMotion = () => Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** '2026-10-06' -> '6 de octubre de 2026' (manual, so it does not depend on ICU locale data). */
  function formatDateEs(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!m || !MONTHS[Number(m[2]) - 1]) return String(iso);
    return `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}`;
  }

  /* ---- Announcements ------------------------------------------------------------------------- */

  function announce(message) {
    if (!els.announcer) return;
    els.announcer.textContent = '';
    clearTimeout(state.announceTimer);
    state.announceTimer = setTimeout(() => { els.announcer.textContent = String(message); }, 60);
  }

  /* ---- Theme and projection mode ------------------------------------------------------------- */

  const darkQuery = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolveScheme(theme) {
    return theme === 'dark' || (theme === 'auto' && darkQuery && darkQuery.matches) ? 'dark' : 'light';
  }

  const nextTheme = (theme) => THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  function syncControls() {
    if (!els.themeBtn) return;
    const theme = prefs.get('theme');
    const mode = prefs.get('mode');
    const themeLabel = `Tema: ${THEME_LABEL[theme]}. Cambiar a ${THEME_LABEL[nextTheme(theme)]}.`;
    els.themeBtn.setAttribute('aria-label', themeLabel);
    els.themeBtn.title = themeLabel;
    els.themeBtn.replaceChildren(icon(theme === 'auto' ? 'auto' : theme === 'light' ? 'sun' : 'moon'));
    const modeLabel = mode === 'projection' ? 'Modo proyección activado (tecla P)' : 'Modo proyección (tecla P)';
    els.modeBtn.setAttribute('aria-pressed', String(mode === 'projection'));
    els.modeBtn.setAttribute('aria-label', 'Modo proyección');
    els.modeBtn.title = modeLabel;
    els.modeBtn.replaceChildren(icon('present'));
  }

  function applyTheme() {
    const theme = prefs.get('theme');
    const scheme = resolveScheme(theme);
    doc.documentElement.setAttribute('data-theme', theme);
    doc.documentElement.setAttribute('data-scheme', scheme);
    syncControls();
    bus.emit('theme:change', { theme, scheme });
  }

  function applyMode() {
    const mode = prefs.get('mode');
    doc.documentElement.setAttribute('data-mode', mode);
    syncControls();
    fitBar();
    bus.emit('mode:change', { mode });
  }

  function cycleTheme() {
    prefs.set('theme', nextTheme(prefs.get('theme')));
    announce(`Tema: ${THEME_LABEL[prefs.get('theme')]}`);
  }

  function toggleMode() {
    prefs.set('mode', prefs.get('mode') === 'projection' ? 'normal' : 'projection');
    announce(prefs.get('mode') === 'projection' ? 'Modo proyección activado' : 'Modo proyección desactivado');
  }

  /* ---- Navigation bar ---------------------------------------------------------------------------- */

  function navPages() {
    return Array.from(pages.entries())
      .filter((entry) => entry[1].nav)
      .sort((a, b) => (a[1].nav.order || 0) - (b[1].nav.order || 0));
  }

  function markCurrent() {
    const page = state.current && state.current.page;
    if (!els.navList) return;
    els.navList.querySelectorAll('a[data-page]').forEach((a) => {
      if (a.getAttribute('data-page') === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function buildNav() {
    if (!els.navList) return;
    els.navList.replaceChildren(...navPages().map(([id, def]) => h('li', null,
      h('a', { class: 'site-nav__link', href: buildHash(id), 'data-page': id }, def.nav.label || def.title))));
    markCurrent();
    fitBar();
  }

  function setMenu(open) {
    if (!els.menuBtn) return;
    state.menuOpen = Boolean(open);
    if (state.menuOpen) els.nav.setAttribute('data-open', '');
    else els.nav.removeAttribute('data-open');
    els.menuBtn.setAttribute('aria-expanded', String(state.menuOpen));
    const label = state.menuOpen ? 'Cerrar el menú de secciones' : 'Abrir el menú de secciones';
    els.menuBtn.setAttribute('aria-label', label);
    els.menuBtn.title = label;
    els.menuBtn.replaceChildren(icon(state.menuOpen ? 'close' : 'menu'));
  }

  /**
   * Measures the bar in its widest layout and degrades only as far as needed: first the brand text is
   * hidden (data-tight), then the section links move into the menu (data-compact). Content-based, so
   * it also holds with the system font fallback, web fonts and projection mode.
   */
  function fitBar() {
    const header = els.header;
    if (!header) return;
    const inner = header.firstElementChild;
    header.removeAttribute('data-compact');
    header.removeAttribute('data-tight');
    // The nav may shrink (min-width: 0) and spill over the buttons without growing the bar, so check both.
    const overflows = () => inner.scrollWidth - inner.clientWidth > 1 || els.nav.scrollWidth - els.nav.clientWidth > 1;
    if (overflows()) {
      header.setAttribute('data-tight', '');
      if (overflows()) header.setAttribute('data-compact', '');
    }
    if (!header.hasAttribute('data-compact') && state.menuOpen) setMenu(false);
  }

  function scheduleFit() {
    if (state.fitFrame) return;
    state.fitFrame = root.requestAnimationFrame(() => {
      state.fitFrame = 0;
      fitBar();
    });
  }

  /* ---- Help dialog ---------------------------------------------------------------------------------- */

  const key = (label, spoken) => h('kbd', { class: 'kbd' },
    spoken ? [h('span', { 'aria-hidden': 'true' }, label), h('span', { class: 'sr-only' }, spoken)] : label);

  function helpRows() {
    const rows = [
      [[key('P')], 'Activar o desactivar el modo proyección.'],
      [[key('?')], 'Mostrar esta ayuda.'],
      [[key('←', 'Flecha izquierda'), key('→', 'Flecha derecha')], 'Pasar a la sección anterior o siguiente (solo en modo proyección).'],
      [[key('Tab')], 'Avanzar entre los controles; con Mayús, retroceder.'],
      [[key('Esc')], 'Cerrar esta ayuda o el menú.'],
    ];
    helpEntries.forEach((entry) => rows.push([entry.keys.map((k) => key(k)), entry.description]));
    return rows;
  }

  function buildHelp() {
    const close = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar la ayuda', title: 'Cerrar' }, icon('close'));
    const list = h('dl', { class: 'help__list' });
    const dialog = h('dialog', { class: 'help', id: 'help-dialog', 'aria-labelledby': 'help-title' },
      h('div', { class: 'help__panel' },
        h('div', { class: 'help__head' }, h('h2', { id: 'help-title' }, 'Atajos de teclado'), close),
        list,
        h('p', { class: 'help__note' }, 'El tema y el modo proyección se guardan en este navegador.')));
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.refresh = () => {
      list.replaceChildren(...helpRows().flatMap(([keys, text]) => [h('dt', null, keys), h('dd', null, text)]));
    };
    return dialog;
  }

  function openHelp() {
    if (!els.help) {
      els.help = buildHelp();
      doc.body.appendChild(els.help);
    }
    els.help.refresh();
    if (!els.help.open) els.help.showModal();
  }

  function closeHelp() {
    if (els.help && els.help.open) els.help.close();
  }

  function addHelp(keys, description) {
    helpEntries.push({ keys: Array.isArray(keys) ? keys : [String(keys)], description: String(description) });
  }

  /* ---- Keyboard ---------------------------------------------------------------------------------------- */

  function stepSection(direction) {
    const ids = navPages().map((entry) => entry[0]);
    const at = state.current ? ids.indexOf(state.current.page) : -1;
    if (at === -1) return;
    const target = ids[at + direction];
    if (target) navigate(target);
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' && state.menuOpen) {
      setMenu(false);
      if (els.menuBtn) els.menuBtn.focus();
      return;
    }
    if (doc.querySelector('dialog[open]')) return;
    const target = event.target;
    if ((event.key === 'p' || event.key === 'P') && !event.repeat) {
      if (isTextEntry(target)) return;
      event.preventDefault();
      toggleMode();
    } else if (event.key === '?') {
      if (isTextEntry(target)) return;
      event.preventDefault();
      openHelp();
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.shiftKey && prefs.get('mode') === 'projection') {
      if (claimsArrows(target)) return;
      event.preventDefault();
      stepSection(event.key === 'ArrowRight' ? 1 : -1);
    }
  }

  /* ---- Routing -------------------------------------------------------------------------------------------- */

  function registerPage(id, def) {
    if (typeof id !== 'string' || !id) throw new Error('registerPage: falta el identificador de la página.');
    if (!def || typeof def.render !== 'function') throw new Error(`registerPage("${id}"): render(root, ctx) es obligatorio.`);
    pages.set(id, Object.freeze(Object.assign({ title: id, nav: null, onLeave: null }, def)));
    if (state.started) buildNav();
  }

  function setTitle(def) {
    doc.title = `${def.title} · ${TITLE_SUFFIX} · Grupo ${cfg.group.number}`;
  }

  /** Scrolls to the element 'page-sub' (below the sticky bar thanks to scroll-padding). Returns false if absent. */
  function scrollToSub(sub, focus) {
    const page = state.current && state.current.page;
    const target = sub && page ? doc.getElementById(`${page}-${sub}`) : null;
    if (!target) return false;
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (focus) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
    state.lastScroll = root.scrollY;
    return true;
  }

  /** Layout can still shift after a deep link (fonts, KaTeX): re-align if the user has not scrolled since. */
  function realign() {
    const r = state.current;
    if (!r || !r.sub || state.lastScroll === null) return;
    if (Math.abs(root.scrollY - state.lastScroll) < 4) scrollToSub(r.sub, false);
  }

  function teardown() {
    const active = state.active;
    if (!active) return;
    state.active = null;
    try {
      if (typeof active.def.onLeave === 'function') active.def.onLeave(active.ctx);
    } catch (err) {
      console.error(err);
    }
    active.controller.abort();
  }

  function errorPanel(err) {
    return h('div', { class: 'stack' },
      h('h1', null, 'No se pudo mostrar la sección'),
      h('div', { class: 'callout', 'data-kind': 'warning', role: 'alert' },
        h('p', { class: 'callout__label' }, 'Error'),
        h('p', null, err && err.message ? err.message : String(err))),
      h('p', null, h('a', { class: 'btn', href: buildHash(route.DEFAULT_PAGE) }, 'Volver al inicio')));
  }

  function focusAfterRender(pageEl, r) {
    const sub = r.sub ? doc.getElementById(`${r.page}-${r.sub}`) : null;
    const target = sub || pageEl.querySelector('h1') || els.app;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      /* not focusable in this state */
    }
  }

  async function renderPage(r, opts) {
    const o = opts || {};
    const token = ++state.token;
    const def = pages.get(r.page);
    teardown();
    const controller = new root.AbortController();
    const pageEl = h('div', { class: 'page', 'data-page': r.page });
    els.app.replaceChildren(pageEl);
    markCurrent();
    setMenu(false);
    if (!def) {
      pageEl.appendChild(errorPanel(new Error(`La sección «${r.page}» no está disponible.`)));
    } else {
      setTitle(def);
      const ctx = { page: r.page, sub: r.sub, query: Object.assign({}, r.query), signal: controller.signal };
      state.active = { id: r.page, def, controller, ctx };
      try {
        await def.render(pageEl, ctx);
      } catch (err) {
        if (token !== state.token) return;
        console.error(err);
        pageEl.replaceChildren(errorPanel(err));
      }
    }
    if (token !== state.token) return;
    state.lastScroll = null;
    if (!(r.sub && scrollToSub(r.sub, false))) root.scrollTo(0, 0);
    if (!o.initial) {
      focusAfterRender(pageEl, r);
      announce(def ? def.title : r.page);
    }
  }

  function go(r, opts) {
    const o = opts || {};
    const previous = state.current;
    state.current = r;
    if (previous && state.active && previous.page === r.page && route.sameQuery(previous.query, r.query)) {
      if (previous.sub !== r.sub || o.forceScroll) {
        if (!scrollToSub(r.sub, !o.forceScroll)) root.scrollTo(0, 0);
      }
      markCurrent();
      return undefined;
    }
    return renderPage(r, o);
  }

  function handleLocation(opts) {
    const o = opts || {};
    const hash = root.location.hash;
    if (!o.initial && !route.isRouteHash(hash)) return undefined; // in-page anchor such as the skip link
    const parsed = route.parse(hash, routeOpts());
    if (!hash || hash === '#' || hash === '#/' || !route.isKnown(hash, routeOpts())) {
      try {
        root.history.replaceState(null, '', buildHash(parsed.page));
      } catch (err) {
        /* history may be unavailable in sandboxed contexts: the route still renders */
      }
    }
    return go(parsed, o);
  }

  function navigate(page, opts) {
    const o = opts || {};
    const hash = buildHash(page, o.sub, o.query);
    if (o.replace) {
      root.history.replaceState(null, '', hash);
      handleLocation({});
    } else if (hash === root.location.hash) {
      handleLocation({ forceScroll: true });
    } else {
      root.location.hash = hash;
    }
  }

  function setQuery(patch, opts) {
    const o = opts || {};
    const here = state.current || { page: route.DEFAULT_PAGE, sub: null, query: {} };
    const merged = o.merge === false ? {} : Object.assign({}, here.query);
    Object.keys(patch || {}).forEach((k) => {
      if (patch[k] === null || patch[k] === undefined || patch[k] === '') delete merged[k];
      else merged[k] = patch[k];
    });
    const hash = buildHash(here.page, here.sub, merged);
    state.current = { page: here.page, sub: here.sub, query: route.parse(hash, routeOpts()).query };
    if (o.replace === false) root.history.pushState(null, '', hash);
    else root.history.replaceState(null, '', hash);
  }

  function current() {
    const r = state.current;
    return r ? { page: r.page, sub: r.sub, query: Object.assign({}, r.query) } : null;
  }

  /** Links to a route that is already current must still scroll (no hashchange fires for them). */
  function onDocumentClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest ? event.target.closest('a[href^="#/"]') : null;
    if (link && link.getAttribute('href') === root.location.hash) {
      event.preventDefault();
      handleLocation({ forceScroll: true });
    }
    if (state.menuOpen && !(event.target.closest && event.target.closest('#menu-btn'))) {
      if (link || !els.header.contains(event.target)) setMenu(false);
    }
  }

  /* ---- Start-up ------------------------------------------------------------------------------------------- */

  function cacheElements() {
    els.header = $('#site-header');
    els.nav = $('#site-nav');
    els.navList = $('#nav-list');
    els.app = $('#app');
    els.announcer = $('#route-announcer');
    els.themeBtn = $('#theme-btn');
    els.modeBtn = $('#mode-btn');
    els.helpBtn = $('#help-btn');
    els.menuBtn = $('#menu-btn');
    els.skip = $('.skip-link');
    els.footerMeta = $('#footer-meta');
  }

  function fillFooter() {
    if (!els.footerMeta) return;
    els.footerMeta.replaceChildren(
      h('p', null, `Grupo ${cfg.group.number} · ${cfg.group.school}`),
      h('p', null, h('span', { class: 'num' }, `Versión ${cfg.version}`), ` · ${formatDateEs(cfg.buildDate)}`),
    );
  }

  function wireControls() {
    els.themeBtn.addEventListener('click', cycleTheme);
    els.modeBtn.addEventListener('click', toggleMode);
    els.helpBtn.setAttribute('aria-label', 'Ayuda y atajos de teclado');
    els.helpBtn.title = 'Ayuda y atajos de teclado (?)';
    els.helpBtn.replaceChildren(icon('help'));
    els.helpBtn.addEventListener('click', () => (els.help && els.help.open ? closeHelp() : openHelp()));
    els.menuBtn.addEventListener('click', () => setMenu(!state.menuOpen));
    setMenu(false);
    els.header.addEventListener('focusout', (event) => {
      if (state.menuOpen && event.relatedTarget && !els.header.contains(event.relatedTarget)) setMenu(false);
    });
    els.skip.addEventListener('click', (event) => {
      event.preventDefault();
      els.app.focus({ preventScroll: true });
      els.app.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    bus.on('prefs:change', (change) => {
      if (change.key === 'theme') applyTheme();
      else if (change.key === 'mode') applyMode();
    });
    if (darkQuery && typeof darkQuery.addEventListener === 'function') {
      darkQuery.addEventListener('change', () => { if (prefs.get('theme') === 'auto') applyTheme(); });
    }
  }

  function observeLayout() {
    if (typeof root.ResizeObserver === 'function') {
      const observer = new root.ResizeObserver(scheduleFit);
      observer.observe(els.header.firstElementChild);
    } else {
      root.addEventListener('resize', scheduleFit);
    }
    if (doc.fonts && typeof doc.fonts.addEventListener === 'function') {
      doc.fonts.addEventListener('loadingdone', () => { scheduleFit(); realign(); });
    }
    if (EDO.deps && EDO.deps.ready) EDO.deps.ready.then(() => { scheduleFit(); realign(); });
  }

  function markReady() {
    app.ready = true;
    bus.emit('app:ready', {});
  }

  /** Wires the shell and renders the first route. Called once by start.js after every page has registered. */
  function start() {
    if (state.started) return;
    state.started = true;
    cacheElements();
    if ('scrollRestoration' in root.history) root.history.scrollRestoration = 'manual';
    fillFooter();
    wireControls();
    applyTheme();
    applyMode();
    buildNav();
    observeLayout();
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('click', onDocumentClick);
    root.addEventListener('hashchange', () => { handleLocation({}); });
    Promise.resolve(handleLocation({ initial: true })).then(markReady, markReady);
  }

  const app = {
    ready: false,
    registerPage,
    navigate,
    setQuery,
    current,
    announce,
    addHelp,
    openHelp,
    closeHelp,
    fitBar,
    start,
    formatDateEs,
    reducedMotion,
    pageIds: () => Array.from(pages.keys()),
  };
  EDO.app = app;
}(typeof window !== 'undefined' ? window : this));
