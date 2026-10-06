/**
 * EDO.tex - math rendering through KaTeX with a readable fallback.
 *
 *   EDO.tex.hydrate(root)             renders $...$, $$...$$, \(...\) and \[...\] found in the text of `root`
 *                                     (default document.body) with KaTeX auto-render (throwOnError false).
 *   EDO.tex.render(el, tex, {display}) renders one formula into an element.
 *   EDO.tex.node(tex, {display})      returns a new element with the formula.
 *   EDO.tex.html(tex, {display})      returns an HTML string (KaTeX markup or the fallback), for templates
 *                                     that are inserted with innerHTML. Only TeX goes in, never HTML.
 *   EDO.tex.available()               true when KaTeX and auto-render were loaded.
 *
 * Fallback: when KaTeX is not available (offline, ?nocdn=1, still loading) every formula is shown as its
 * raw TeX in <code class="tex-fallback" data-tex="..."> (monospace). If KaTeX arrives later the shell
 * upgrades those elements in place automatically. The delimiter scanner (`splitMath`) is pure and follows
 * the same rules as KaTeX auto-render, so both paths agree. Neither treats "\$" as an escape: text that
 * must keep a literal "$" goes inside an element with class "no-math" (also skipped: pre, code, textarea).
 *
 * Load order: after deps.js and dom.js.
 */
(function (root) {
  'use strict';

  const EDO = (root.EDO = root.EDO || {});
  const doc = root.document;

  const DELIMITERS = [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
    { left: '$', right: '$', display: false },
  ];
  const IGNORE_SELECTOR = 'script, noscript, style, textarea, pre, code, option, .tex-fallback, .katex, .no-math';
  const AUTO_OPTIONS = {
    delimiters: DELIMITERS,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
    ignoredClasses: ['tex-fallback', 'katex', 'no-math'],
  };

  function isLoaded() {
    const deps = EDO.deps;
    return Boolean(deps && deps.status && deps.status.katex === 'loaded'
      && root.katex && typeof root.katex.render === 'function' && typeof root.renderMathInElement === 'function');
  }

  const katexOptions = (display) => ({ displayMode: display, throwOnError: false, strict: 'ignore', trust: false });

  /* ---- Pure delimiter scanner (used by the fallback) --------------------------------------- */

  /**
   * Index of the closing delimiter at or after `from`, or -1. Same rules as KaTeX auto-render: a backslash
   * protects the next character, and a delimiter inside braces does not close the formula.
   */
  function findClose(text, from, delimiter) {
    let at = from;
    let depth = 0;
    while (at < text.length) {
      const ch = text.charAt(at);
      if (depth <= 0 && text.startsWith(delimiter.right, at)) return at;
      if (ch === '\\') at += 1;
      else if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      at += 1;
    }
    return -1;
  }

  /**
   * Splits text into plain and math segments.
   * @param {string} input
   * @returns {Array<{type: 'text'|'math', value: string, display?: boolean}>} `value` of a math segment is
   *   the TeX without its delimiters (possibly empty). An opener without a closer leaves the rest as text.
   */
  function splitMath(input) {
    const text = String(input);
    const out = [];
    let buffer = '';
    let i = 0;
    const flush = () => {
      if (buffer) out.push({ type: 'text', value: buffer });
      buffer = '';
    };
    while (i < text.length) {
      const delimiter = DELIMITERS.find((d) => text.startsWith(d.left, i));
      if (!delimiter) {
        buffer += text.charAt(i);
        i += 1;
      } else {
        const start = i + delimiter.left.length;
        const end = findClose(text, start, delimiter);
        if (end === -1) {
          buffer += text.slice(i); // like KaTeX: an unclosed opener leaves the rest of the text alone
          break;
        }
        flush();
        out.push({ type: 'math', value: text.slice(start, end), display: delimiter.display });
        i = end + delimiter.right.length;
      }
    }
    flush();
    return out;
  }

  /* ---- Fallback elements ---------------------------------------------------------------------- */

  function fallbackNode(tex, display) {
    const el = doc.createElement('code');
    el.className = 'tex-fallback';
    el.setAttribute('data-tex', tex);
    if (display) el.setAttribute('data-display', '1');
    el.textContent = tex;
    return el;
  }

  function fallbackScan(scope) {
    const walker = doc.createTreeWalker(scope, root.NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent && /[$\\]/.test(node.nodeValue) && !parent.closest(IGNORE_SELECTOR)) nodes.push(node);
    }
    nodes.forEach((node) => {
      const parts = splitMath(node.nodeValue);
      if (!parts.some((part) => part.type === 'math')) return;
      const fragment = doc.createDocumentFragment();
      parts.forEach((part) => {
        fragment.appendChild(part.type === 'text' ? doc.createTextNode(part.value) : fallbackNode(part.value, part.display));
      });
      node.parentNode.replaceChild(fragment, node);
    });
  }

  /** Replaces fallback <code> elements under `scope` with rendered math (requires KaTeX). */
  function upgrade(scope) {
    if (!isLoaded()) return 0;
    let count = 0;
    (scope || doc).querySelectorAll('code.tex-fallback[data-tex]').forEach((el) => {
      const holder = doc.createElement('span');
      try {
        root.katex.render(el.getAttribute('data-tex'), holder, katexOptions(el.getAttribute('data-display') === '1'));
      } catch (err) {
        return;
      }
      el.replaceWith(...Array.from(holder.childNodes));
      count += 1;
    });
    return count;
  }

  /* ---- Public API ----------------------------------------------------------------------------- */

  function hydrate(scope) {
    const target = scope || doc.body;
    if (isLoaded()) {
      upgrade(target);
      try {
        root.renderMathInElement(target, AUTO_OPTIONS);
      } catch (err) {
        fallbackScan(target); // keep the TeX readable if auto-render fails midway
      }
    } else {
      fallbackScan(target);
    }
    return target;
  }

  function render(el, tex, opts) {
    const display = Boolean(opts && opts.display);
    const source = String(tex);
    while (el.firstChild) el.removeChild(el.firstChild);
    if (isLoaded()) {
      try {
        root.katex.render(source, el, katexOptions(display));
        return el;
      } catch (err) {
        while (el.firstChild) el.removeChild(el.firstChild);
      }
    }
    el.appendChild(fallbackNode(source, display));
    return el;
  }

  function node(tex, opts) {
    const display = Boolean(opts && opts.display);
    return render(doc.createElement(display ? 'div' : 'span'), tex, opts);
  }

  function html(tex, opts) {
    const display = Boolean(opts && opts.display);
    const source = String(tex);
    if (isLoaded() && typeof root.katex.renderToString === 'function') {
      try {
        return root.katex.renderToString(source, katexOptions(display));
      } catch (err) {
        /* fall through to the raw TeX */
      }
    }
    const escape = EDO.dom.escapeHtml;
    return `<code class="tex-fallback" data-tex="${escape(source)}"${display ? ' data-display="1"' : ''}>${escape(source)}</code>`;
  }

  EDO.tex = { hydrate, render, node, html, available: isLoaded, upgrade, splitMath, DELIMITERS };

  // KaTeX that finishes loading after the first render upgrades every fallback already on the page.
  if (EDO.deps && EDO.deps.katex && typeof EDO.deps.katex.then === 'function') {
    EDO.deps.katex.then(() => { upgrade(doc); });
  }
}(typeof window !== 'undefined' ? window : this));
