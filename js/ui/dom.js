/**
 * EDO.dom - small DOM helpers shared by the shell and the pages. Everything is built with
 * createElement/textContent, so text never turns into markup: use these instead of innerHTML.
 *
 *   h(tag, attrs?, ...children)      HTML element. `attrs`: class, dataset {k: v}, style (string or
 *                                    {'--custom': v}), on<event> handlers, value/checked/selected as
 *                                    properties, any other key as an attribute (true -> '', false/null skipped).
 *                                    A first argument that is a string, Node or array is treated as a child.
 *   svg(tag, attrs?, ...children)    SVG element (same rules).
 *   icon(name, {size, label})        Authored 24x24 stroke icon (see ICON_NAMES). Decorative unless `label`.
 *   tabset(items, {label, initial})  Accessible tabs ({id, label, content}) with roving tabindex and arrow keys.
 *   isTextEntry(el) / claimsArrows(el)  Keyboard-shortcut guards (typing in a field, widgets that use arrows).
 *   escapeHtml(s), uid(prefix), clear(el), text(s), frag(...children)
 *
 * Load order: before tex.js, charts.js and app.js (browser only).
 */
(function (root) {
  'use strict';

  const EDO = (root.EDO = root.EDO || {});
  const doc = root.document;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PROPERTY_ATTRS = new Set(['value', 'checked', 'selected', 'indeterminate']);

  let counter = 0;
  /** Unique id for ARIA relationships (not stable between runs). */
  function uid(prefix) {
    counter += 1;
    return `${prefix || 'edo'}-${counter}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function text(value) {
    return doc.createTextNode(String(value));
  }

  function appendChildren(parent, children) {
    children.forEach((child) => {
      if (child === null || child === undefined || child === false || child === true) return;
      if (Array.isArray(child)) {
        appendChildren(parent, child);
      } else if (typeof child === 'object' && child.nodeType) {
        parent.appendChild(child);
      } else {
        parent.appendChild(text(child));
      }
    });
  }

  /** Splits (attrs, ...children): a non-plain-object second argument is a child. */
  function normalize(args) {
    const first = args[0];
    const isAttrs = first && typeof first === 'object' && !first.nodeType && !Array.isArray(first);
    return isAttrs ? { attrs: first, children: args.slice(1) } : { attrs: null, children: first === null || first === undefined ? args.slice(1) : args };
  }

  function applyAttrs(el, attrs, isSvg) {
    const pending = {};
    Object.keys(attrs || {}).forEach((key) => {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class' || key === 'className') {
        el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value));
      } else if (key === 'dataset') {
        Object.keys(value).forEach((name) => {
          if (value[name] !== null && value[name] !== undefined) el.dataset[name] = String(value[name]);
        });
      } else if (key === 'style') {
        if (typeof value === 'string') {
          el.setAttribute('style', value);
        } else {
          Object.keys(value).forEach((name) => el.style.setProperty(name, String(value[name])));
        }
      } else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (!isSvg && PROPERTY_ATTRS.has(key)) {
        pending[key] = value; // applied after the children exist (select.value needs its options)
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    });
    return pending;
  }

  function h(tag, ...rest) {
    const el = doc.createElement(tag);
    const { attrs, children } = normalize(rest);
    const pending = applyAttrs(el, attrs, false);
    appendChildren(el, children);
    Object.keys(pending).forEach((key) => { el[key] = pending[key]; });
    return el;
  }

  function svg(tag, ...rest) {
    const el = doc.createElementNS(SVG_NS, tag);
    const { attrs, children } = normalize(rest);
    applyAttrs(el, attrs, true);
    appendChildren(el, children);
    return el;
  }

  function frag(...children) {
    const fragment = doc.createDocumentFragment();
    appendChildren(fragment, children);
    return fragment;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /* ---- Icons: authored 24x24 paths, one stroke weight, currentColor ------------------------- */

  const ICONS = {
    sun: [['circle', { cx: 12, cy: 12, r: 4 }],
      ['path', { d: 'M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6' }]],
    moon: [['path', { d: 'M20.5 13.3A8.6 8.6 0 0 1 10.7 3.5a8.6 8.6 0 1 0 9.8 9.8z' }]],
    auto: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 3.5a8.5 8.5 0 0 1 0 17z', fill: 'currentColor' }]],
    present: [['rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }], ['path', { d: 'M8 20.5h8M12 16v4.5' }]],
    help: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4.2' }],
      ['path', { d: 'M12 17.7h.01' }]],
    menu: [['path', { d: 'M4 7h16M4 12h16M4 17h16' }]],
    close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
    alert: [['path', { d: 'M12 3.8 2.9 19.5h18.2z' }], ['path', { d: 'M12 10v4.2M12 17.2h.01' }]],
    check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  };
  const ICON_NAMES = Object.freeze(Object.keys(ICONS));

  /**
   * Builds an inline SVG icon.
   * @param {string} name One of ICON_NAMES.
   * @param {{size?: string, label?: string}} [opts] `size` is a CSS length (default '1.25em');
   *   `label` makes the icon an image with that accessible name (default: decorative, aria-hidden).
   * @returns {SVGElement}
   */
  function icon(name, opts) {
    const o = opts || {};
    const parts = ICONS[name] || [];
    const attrs = {
      class: 'icon',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.75',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
      'data-icon': name,
    };
    if (o.size) attrs.style = { width: o.size, height: o.size };
    if (o.label) {
      attrs.role = 'img';
      attrs['aria-label'] = o.label;
    } else {
      attrs['aria-hidden'] = 'true';
    }
    return svg('svg', attrs, parts.map(([tag, a]) => svg(tag, a)));
  }

  /* ---- Keyboard guards ------------------------------------------------------------------------ */

  const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image', 'hidden']);
  const ARROW_ROLES = new Set([
    'slider', 'tab', 'radio', 'listbox', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox',
    'tree', 'treeitem', 'grid', 'gridcell', 'scrollbar', 'spinbutton', 'textbox', 'searchbox', 'combobox',
  ]);

  /** True when typing letters into the element would produce text (so letter shortcuts must not fire). */
  function isTextEntry(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(el.type || 'text').toLowerCase());
    if (el.isContentEditable) return true;
    const role = el.getAttribute('role');
    return role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton';
  }

  /** True when the element uses the arrow keys itself (fields, sliders, tabs, radios, scrollable regions). */
  function claimsArrows(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isTextEntry(el) || el.tagName === 'INPUT') return true;
    if (ARROW_ROLES.has(el.getAttribute('role'))) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = root.getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    return false;
  }

  /* ---- Tabs ------------------------------------------------------------------------------------ */

  /**
   * Accessible tabs: roving tabindex, ArrowLeft/ArrowRight/Home/End, automatic activation.
   * @param {Array<{id: string, label: string, content: (Node|Node[])}>} items
   * @param {{label?: string, initial?: number}} [opts] `label` is the tablist's accessible name.
   * @returns {HTMLElement} The `.tabs` element; it has `.select(index)` and dispatches a 'tabchange'
   *   CustomEvent ({detail: {index, id}}).
   */
  function tabset(items, opts) {
    const o = opts || {};
    const base = uid('tabs');
    const list = h('div', { role: 'tablist', 'aria-label': o.label || null });
    const panels = [];
    const buttons = items.map((item, i) => {
      const tabId = `${base}-tab-${i}`;
      const panelId = `${base}-panel-${i}`;
      const button = h('button', {
        type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId, 'aria-selected': 'false', tabindex: '-1',
        dataset: { tab: item.id },
      }, item.label);
      list.appendChild(button);
      panels.push(h('div', { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, tabindex: '0', hidden: true }, item.content));
      return button;
    });
    const container = h('div', { class: 'tabs' }, list, panels);
    let current = -1;

    function select(index, moveFocus) {
      const next = Math.max(0, Math.min(buttons.length - 1, index));
      const changed = next !== current;
      current = next;
      buttons.forEach((button, i) => {
        const on = i === current;
        button.setAttribute('aria-selected', String(on));
        button.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (moveFocus) buttons[current].focus();
      if (changed) container.dispatchEvent(new root.CustomEvent('tabchange', { detail: { index: current, id: items[current].id } }));
    }

    buttons.forEach((button, i) => button.addEventListener('click', () => select(i, false)));
    list.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const keys = { ArrowRight: 1, ArrowLeft: -1 };
      let target = null;
      if (event.key in keys) target = (current + keys[event.key] + buttons.length) % buttons.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = buttons.length - 1;
      if (target === null) return;
      event.preventDefault();
      select(target, true);
    });

    container.select = (index) => select(index, false);
    container.index = () => current;
    select(Number.isInteger(o.initial) ? o.initial : 0, false);
    return container;
  }

  EDO.dom = { h, svg, text, frag, clear, icon, ICON_NAMES, tabset, isTextEntry, claimsArrows, escapeHtml, uid };
}(typeof window !== 'undefined' ? window : this));
