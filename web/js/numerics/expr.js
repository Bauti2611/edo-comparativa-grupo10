/**
 * EDO.expr - expression engine: parser, closure compiler, simplifier, symbolic
 * differentiation and printers (TeX and plain text). Pure logic: no DOM, and no
 * code is ever generated from user text (the parser builds an AST and `compile`
 * turns it into closures).
 *
 * Browser load order (classic scripts, each attaches to window.EDO.<name>):
 *   expr.js -> format.js -> problems.js -> methods.js -> analysis.js
 * Node: every file is a CommonJS module that require()s its dependencies.
 *
 * AST (plain objects; treat them as immutable):
 *   {t:'num', v}   {t:'const', name:'e'|'pi'}   {t:'var', name:'x'|'y'}
 *   {t:'add', terms[]}   {t:'mul', factors[]}   {t:'pow', base, exp}   {t:'fn', name, arg}
 * The independent variable is always stored as 'x', whatever letter was typed
 * (`x` or `t`); the printers take `indep` to render it back. Subtraction is an
 * addition of a (-1)-scaled term and division is a product with a pow(., -1)
 * factor, so the printers rebuild "a - b" and fractions from the structure.
 *
 * Parsing conventions worth knowing:
 *  - implicit multiplication has the same precedence as `*` and `/`, evaluated
 *    left to right: "1/2x" is (1/2)*x;
 *  - "2e-3" is scientific notation (0.002); write "2*e-3" for 2e minus 3;
 *  - function names need parentheses: sen(x), not "sen x";
 *  - ( ), { } and [ ] all group; "2,5" is a decimal comma; the symbols − × · ÷ π are accepted.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EDO = root.EDO || {};
    root.EDO.expr = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ======================================================================== */
  /* Errors                                                                    */
  /* ======================================================================== */

  /** Base class of every error raised by the numerics modules (Spanish messages). */
  class EDOError extends Error {
    /** @param {string} message Spanish, user-facing message. */
    constructor(message) {
      super(message);
      this.name = 'EDOError';
    }
  }

  /** Syntax error in an expression. `pos` is the 0-based index in the source text. */
  class EDOParseError extends EDOError {
    /**
     * @param {string} message Spanish message (it quotes the 1-based position).
     * @param {number} pos 0-based index of the offending character.
     */
    constructor(message, pos) {
      super(message);
      this.name = 'EDOParseError';
      this.pos = pos;
    }
  }

  /* ======================================================================== */
  /* Node constructors                                                         */
  /* ======================================================================== */

  const num = (v) => ({ t: 'num', v: v === 0 ? 0 : v });
  const constant = (name) => ({ t: 'const', name });
  const variable = (name) => ({ t: 'var', name });
  const add = (terms) => ({ t: 'add', terms });
  const mul = (factors) => ({ t: 'mul', factors });
  const pow = (base, exp) => ({ t: 'pow', base, exp });
  const fn = (name, arg) => ({ t: 'fn', name, arg });

  /** Negation that keeps literals and leading numeric coefficients readable. */
  function neg(n) {
    if (n.t === 'num') return num(-n.v);
    if (n.t === 'mul' && n.factors[0].t === 'num') {
      return mul([num(-n.factors[0].v)].concat(n.factors.slice(1)));
    }
    return mul([num(-1), n]);
  }
  const sub = (a, b) => add([a, neg(b)]);
  const div = (a, b) => mul([a, pow(b, num(-1))]);

  const ZERO = num(0);
  const ONE = num(1);
  const isZeroNode = (n) => n.t === 'num' && n.v === 0;

  /* ======================================================================== */
  /* Tokenizer and parser                                                      */
  /* ======================================================================== */

  const FUNC_ALIASES = {
    sin: 'sin', sen: 'sin', cos: 'cos', tan: 'tan',
    asin: 'asin', arcsin: 'asin', asen: 'asin', arcsen: 'asin',
    acos: 'acos', arccos: 'acos', atan: 'atan', arctan: 'atan',
    sinh: 'sinh', senh: 'sinh', cosh: 'cosh', tanh: 'tanh',
    exp: 'exp', ln: 'ln', log: 'log10', sqrt: 'sqrt', abs: 'abs',
  };
  // Longest names first so that "sinh" wins over "sin" and "arcsin" over "asin".
  const WORDS = Object.keys(FUNC_ALIASES).concat(['pi']).sort((a, b) => b.length - a.length);
  const UNSUPPORTED = new Set([
    'sec', 'csc', 'cot', 'asinh', 'acosh', 'atanh', 'cbrt', 'floor', 'ceil', 'round',
    'sign', 'max', 'min', 'pow', 'log2', 'mod', 'gamma', 'erf',
  ]);
  const FUNCTION_HELP = 'sen, cos, tan, asin, acos, atan, senh, cosh, tanh, exp, ln, log, sqrt y abs';
  const OPERATORS = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '^': '^' };
  const OPENERS = new Set(['(', '{', '[']);
  const CLOSER_OF = { '(': ')', '{': '}', '[': ']' };
  const CLOSERS = new Set([')', '}', ']']);

  const MAX_LENGTH = 500;
  const MAX_DEPTH = 64;

  const isDigit = (c) => c >= '0' && c <= '9';
  const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

  /**
   * Validates and normalizes the independent variable letter.
   * @param {string} [indep='x'] A single letter other than 'y'.
   * @returns {string} Lower-case letter.
   */
  function normalizeIndep(indep) {
    const v = indep === undefined || indep === null ? 'x' : String(indep).toLowerCase();
    if (!/^[a-z]$/.test(v) || v === 'y') {
      throw new EDOError("La variable independiente debe ser una sola letra distinta de 'y'.");
    }
    return v;
  }

  function parseError(message, pos) {
    return new EDOParseError(message, pos);
  }

  function readNumber(src, i, toks) {
    let j = i;
    while (isDigit(src[j])) j += 1;
    if (src[j] === '.') {
      j += 1;
      while (isDigit(src[j])) j += 1;
    } else if (src[j] === ',' && j > i && isDigit(src[j + 1])) {
      // Decimal comma, as typed on Spanish keyboards ("2,5").
      j += 1;
      while (isDigit(src[j])) j += 1;
    }
    if (src[j] === 'e' || src[j] === 'E') {
      let k = j + 1;
      if (src[k] === '+' || src[k] === '-') k += 1;
      if (isDigit(src[k])) {
        while (isDigit(src[k])) k += 1;
        j = k;
      }
    }
    const text = src.slice(i, j);
    toks.push({ type: 'num', value: Number(text.replace(',', '.')), pos: i, text });
    return j;
  }

  /** Splits a run of letters into functions, constants and single-letter variables. */
  function readWord(src, i, indep, toks) {
    let j = i;
    while (j < src.length && isLetter(src[j])) j += 1;
    const original = src.slice(i, j);
    const word = original.toLowerCase();
    if (UNSUPPORTED.has(word)) {
      throw parseError(`La función '${original}' no está disponible (posición ${i + 1}). Funciones admitidas: ${FUNCTION_HELP}.`, i);
    }
    let k = 0;
    while (k < word.length) {
      const rest = word.slice(k);
      const name = WORDS.find((w) => rest.startsWith(w));
      const pos = i + k;
      if (name === 'pi') {
        toks.push({ type: 'const', name: 'pi', pos, text: original.slice(k, k + 2) });
        k += 2;
      } else if (name) {
        let canonical = FUNC_ALIASES[name];
        let text = original.slice(k, k + name.length);
        if (name === 'log' && k + 3 === word.length && src.startsWith('10', j)) {
          canonical = 'log10';
          text = `${text}10`;
          j += 2;
        }
        toks.push({ type: 'func', name: canonical, pos, text });
        k += name.length;
      } else {
        const ch = word[k];
        if (ch === indep) toks.push({ type: 'var', name: 'x', pos, text: original[k] });
        else if (ch === 'y') toks.push({ type: 'var', name: 'y', pos, text: original[k] });
        else if (ch === 'e') toks.push({ type: 'const', name: 'e', pos, text: original[k] });
        else {
          const id = original.slice(k);
          const hint = /^[xt]/i.test(id) && id.length === 1
            ? `La variable independiente declarada es '${indep}'.`
            : `Variables admitidas: '${indep}' e 'y'.`;
          throw parseError(`Identificador desconocido '${id}' (posición ${pos + 1}). ${hint}`, pos);
        }
        k += 1;
      }
    }
    return j;
  }

  function tokenize(src, indep) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) {
        i += 1;
      } else if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1]))) {
        i = readNumber(src, i, toks);
      } else if (isLetter(ch)) {
        i = readWord(src, i, indep, toks);
      } else if (ch === 'π') {
        toks.push({ type: 'const', name: 'pi', pos: i, text: ch });
        i += 1;
      } else if (ch === '*' && src[i + 1] === '*') {
        toks.push({ type: 'op', op: '^', pos: i, text: '**' });
        i += 2;
      } else if (OPERATORS[ch]) {
        toks.push({ type: 'op', op: OPERATORS[ch], pos: i, text: ch });
        i += 1;
      } else if (OPENERS.has(ch)) {
        toks.push({ type: 'lp', ch, pos: i, text: ch });
        i += 1;
      } else if (CLOSERS.has(ch)) {
        toks.push({ type: 'rp', ch, pos: i, text: ch });
        i += 1;
      } else {
        throw parseError(`Carácter no válido '${ch}' (posición ${i + 1}).`, i);
      }
    }
    toks.push({ type: 'eof', pos: src.length, text: '' });
    return toks;
  }

  function unexpectedToken(t) {
    if (t.type === 'eof') {
      return parseError('La expresión termina de forma inesperada: falta un número, una variable o una función.', t.pos);
    }
    if (t.type === 'rp') {
      return parseError(`Se esperaba un valor pero se encontró '${t.ch}' (posición ${t.pos + 1}).`, t.pos);
    }
    return parseError(`Se esperaba un número, una variable o '(' pero se encontró '${t.text}' (posición ${t.pos + 1}).`, t.pos);
  }

  function missingOperator(t) {
    return parseError(`Falta un operador antes de '${t.text}' (posición ${t.pos + 1}). Use '*' para multiplicar.`, t.pos);
  }

  /** Recursive-descent parser over the token list (the grammar is documented on `parse`). */
  class Parser {
    constructor(toks, indep) {
      this.toks = toks;
      this.indep = indep;
      this.cursor = 0;
      this.depth = 0;
    }

    peek() {
      return this.toks[this.cursor];
    }

    next() {
      const t = this.toks[this.cursor];
      this.cursor += 1;
      return t;
    }

    isOp(op) {
      const t = this.peek();
      return t.type === 'op' && t.op === op;
    }

    /** Consumes a run of + and - signs; returns -1 for an odd number of minus signs, else 1. */
    readSigns() {
      let sign = 1;
      while (this.isOp('+') || this.isOp('-')) {
        if (this.isOp('-')) sign = -sign;
        this.next();
      }
      return sign;
    }

    expectClose(open) {
      const t = this.peek();
      if (t.type !== 'rp') {
        throw parseError(`Falta cerrar el '${open.ch}' abierto en la posición ${open.pos + 1}.`, open.pos);
      }
      if (t.ch !== CLOSER_OF[open.ch]) {
        throw parseError(
          `Se esperaba '${CLOSER_OF[open.ch]}' para cerrar el '${open.ch}' de la posición ${open.pos + 1}, pero se encontró '${t.ch}' (posición ${t.pos + 1}).`,
          t.pos,
        );
      }
      this.next();
    }

    parseCall(t) {
      const open = this.peek();
      if (open.type !== 'lp') {
        throw parseError(
          `La función '${t.text}' necesita su argumento entre paréntesis, por ejemplo ${t.text}(${this.indep}) (posición ${t.pos + 1}).`,
          t.pos,
        );
      }
      this.next();
      const arg = this.parseExpression();
      this.expectClose(open);
      return fn(t.name, arg);
    }

    parsePrimary() {
      const t = this.next();
      switch (t.type) {
        case 'num': return num(t.value);
        case 'var': return variable(t.name);
        case 'const': return constant(t.name);
        case 'func': return this.parseCall(t);
        case 'lp': {
          const inner = this.parseExpression();
          this.expectClose(t);
          return inner;
        }
        default: throw unexpectedToken(t);
      }
    }

    parsePower() {
      const base = this.parsePrimary();
      if (!this.isOp('^')) return base;
      this.next();
      return pow(base, this.parseSignedPower());
    }

    /** Operand after '*', '/' or '^': optional signs, then a power ("2^-x^2" is 2^(-(x^2))). */
    parseSignedPower() {
      const sign = this.readSigns();
      const p = this.parsePower();
      return sign < 0 ? neg(p) : p;
    }

    static startsOperand(t) {
      return t.type === 'var' || t.type === 'const' || t.type === 'func' || t.type === 'lp';
    }

    parseTerm() {
      const sign = this.readSigns();
      const factors = [this.parsePower()];
      for (;;) {
        const t = this.peek();
        if (this.isOp('*')) {
          this.next();
          factors.push(this.parseSignedPower());
        } else if (this.isOp('/')) {
          this.next();
          factors.push(pow(this.parseSignedPower(), num(-1)));
        } else if (Parser.startsOperand(t)) {
          factors.push(this.parsePower());
        } else if (t.type === 'num') {
          throw missingOperator(t);
        } else {
          break;
        }
      }
      if (sign < 0) {
        if (factors[0].t === 'num') factors[0] = num(-factors[0].v);
        else factors.unshift(num(-1));
      }
      return factors.length === 1 ? factors[0] : mul(factors);
    }

    parseExpression() {
      this.depth += 1;
      if (this.depth > MAX_DEPTH) throw parseError('Hay demasiados paréntesis anidados.', this.peek().pos);
      const terms = [this.parseTerm()];
      while (this.isOp('+') || this.isOp('-')) {
        const minus = this.next().op === '-';
        const t = this.parseTerm();
        terms.push(minus ? neg(t) : t);
      }
      this.depth -= 1;
      return terms.length === 1 ? terms[0] : add(terms);
    }

    /** Parses the whole token list and checks that nothing is left over. */
    parseAll() {
      const node = this.parseExpression();
      const rest = this.peek();
      if (rest.type === 'rp') {
        throw parseError(`Paréntesis de cierre '${rest.ch}' sin abrir (posición ${rest.pos + 1}).`, rest.pos);
      }
      if (rest.type !== 'eof') throw missingOperator(rest);
      return node;
    }
  }

  /**
   * Parses an expression in the independent variable (`x` by default) and `y`.
   * Grammar (lowest to highest precedence): sum, product (explicit or implicit),
   * unary sign, power (right-associative), primary (number, name, group, call).
   * @param {string} src Expression text, e.g. "-3x^2 y" or "sen(t)+e^{-t}".
   * @param {{indep?: string}} [opts] `indep`: 'x' (default) or 't' (or any other letter but 'y').
   * @returns {object} AST node (not simplified, so it still shows the typed structure).
   * @throws {EDOParseError} Spanish message with the character position.
   */
  function parse(src, opts) {
    const indep = normalizeIndep(opts && opts.indep);
    if (typeof src !== 'string') throw parseError('La expresión debe ser un texto.', 0);
    if (src.trim() === '') throw parseError('La expresión está vacía.', 0);
    if (src.length > MAX_LENGTH) throw parseError(`La expresión es demasiado larga (máximo ${MAX_LENGTH} caracteres).`, MAX_LENGTH);
    if (src.includes('=')) {
      throw parseError("Escriba solo la expresión de f, sin el signo '=' (por ejemplo 2*x*y).", src.indexOf('='));
    }
    return new Parser(tokenize(src, indep), indep).parseAll();
  }

  /* ======================================================================== */
  /* Evaluation (closure compiler)                                             */
  /* ======================================================================== */

  const FN_IMPL = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log10: Math.log10,
    abs: Math.abs, sqrt: Math.sqrt,
  };
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function buildPow(n) {
    const b = build(n.base);
    if (n.exp.t === 'num') {
      const k = n.exp.v;
      if (k === 2) return (x, y) => { const v = b(x, y); return v * v; };
      if (k === -1) return (x, y) => 1 / b(x, y);
      if (k === 0.5) return (x, y) => Math.sqrt(b(x, y));
      return (x, y) => Math.pow(b(x, y), k);
    }
    const e = build(n.exp);
    return (x, y) => Math.pow(b(x, y), e(x, y));
  }

  function build(n) {
    switch (n.t) {
      case 'num': { const v = n.v; return () => v; }
      case 'const': { const v = n.name === 'pi' ? Math.PI : Math.E; return () => v; }
      case 'var': return n.name === 'x' ? (x) => x : (x, y) => y;
      case 'add': {
        const fs = n.terms.map(build);
        return (x, y) => { let s = 0; for (let i = 0; i < fs.length; i += 1) s += fs[i](x, y); return s; };
      }
      case 'mul': {
        const fs = n.factors.map(build);
        return (x, y) => { let p = 1; for (let i = 0; i < fs.length; i += 1) p *= fs[i](x, y); return p; };
      }
      case 'pow': return buildPow(n);
      case 'fn': {
        if (!hasOwn(FN_IMPL, n.name)) throw new EDOError(`Función desconocida: ${n.name}.`);
        const g = FN_IMPL[n.name];
        const a = build(n.arg);
        return (x, y) => g(a(x, y));
      }
      default: throw new EDOError('Nodo de expresión desconocido.');
    }
  }

  /**
   * Compiles an AST into a closure; nothing is evaluated from strings.
   * The independent variable is always the first argument.
   * @param {object} node AST.
   * @returns {function(number, number): number} `(x, y) => value`.
   */
  function compile(node) {
    return build(node);
  }

  /**
   * One-off evaluation (compiles on every call; use `compile` in loops).
   * @param {object} node AST.
   * @param {{x?: number, y?: number}} [env] Values of the variables (missing ones are NaN).
   * @returns {number}
   */
  function evalNode(node, env) {
    const e = env || {};
    return build(node)(e.x === undefined ? NaN : e.x, e.y === undefined ? NaN : e.y);
  }

  /* ======================================================================== */
  /* Exact coefficients: {n, d} with d >= 1; n integer when exact, else a      */
  /* float and d = 1.                                                          */
  /* ======================================================================== */

  const MAX_SAFE = Number.MAX_SAFE_INTEGER;
  const Q1 = { n: 1, d: 1 };
  const Q0 = { n: 0, d: 1 };
  const qFrom = (v) => ({ n: v, d: 1 });

  function gcd(a, b) {
    let x = a;
    let y = b;
    while (y) { const t = x % y; x = y; y = t; }
    return x;
  }

  function qNorm(n, d) {
    if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0 || Math.abs(n) > MAX_SAFE || Math.abs(d) > MAX_SAFE) {
      return { n: n / d, d: 1 };
    }
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    const s = d < 0 ? -1 : 1;
    return { n: (s * n) / g, d: (s * d) / g };
  }
  const qMul = (a, b) => qNorm(a.n * b.n, a.d * b.d);
  const qAdd = (a, b) => qNorm(a.n * b.d + b.n * a.d, a.d * b.d);

  /* ======================================================================== */
  /* Canonical keys, ordering and the simplifier                               */
  /* ======================================================================== */

  // Key prefixes encode the factor class (constants < x < y < functions < exp < sums)
  // so a plain string comparison yields a readable, deterministic order.
  const keyCache = new WeakMap();

  /**
   * Canonical string key of a node: equal keys mean structurally equal nodes (exported as `nodeKey`).
   * @param {object} n AST node.
   * @returns {string}
   */
  function keyOf(n) {
    const cached = keyCache.get(n);
    if (cached !== undefined) return cached;
    let k;
    switch (n.t) {
      case 'num': k = `#${n.v}`; break;
      case 'const': k = `0${n.name}`; break;
      case 'var': k = n.name === 'x' ? '1x' : '2y'; break;
      case 'fn': k = `${n.name === 'exp' ? '4' : '3'}${n.name}(${keyOf(n.arg)})`; break;
      case 'pow': k = `${keyOf(n.base)}^${keyOf(n.exp)}`; break;
      case 'add': k = `5(${n.terms.map(keyOf).join('+')})`; break;
      case 'mul': k = `6(${n.factors.map(keyOf).join('*')})`; break;
      default: throw new EDOError('Nodo de expresión desconocido.');
    }
    keyCache.set(n, k);
    return k;
  }

  const canonical = new WeakSet();
  const mark = (n) => { canonical.add(n); return n; };
  mark(ZERO);
  mark(ONE);
  const E_CONST = mark(constant('e'));

  /** A coefficient as a node: integer, 1/D, or n*(1/D). */
  function nodeOfQ(q) {
    if (q.d === 1) return mark(num(q.n));
    const recip = mark(pow(num(q.d), num(-1)));
    return q.n === 1 ? recip : mark(mul([num(q.n), recip]));
  }

  const isFraction = (f) => f.t === 'pow' && f.base.t === 'num' && Number.isInteger(f.base.v) && f.base.v > 1
    && f.exp.t === 'num' && f.exp.v === -1;

  /** Splits a canonical term into its numeric coefficient and the remaining factors. */
  function splitTerm(t) {
    if (t.t === 'num') return { coef: qFrom(t.v), factors: [] };
    if (isFraction(t)) return { coef: { n: 1, d: t.base.v }, factors: [] };
    if (t.t !== 'mul') return { coef: Q1, factors: [t] };
    let coef = Q1;
    const factors = [];
    for (const f of t.factors) {
      if (f.t === 'num') coef = qMul(coef, qFrom(f.v));
      else if (isFraction(f)) coef = qMul(coef, { n: 1, d: f.base.v });
      else factors.push(f);
    }
    return { coef, factors };
  }

  /** Canonical product node from a coefficient and already-sorted factors. */
  function buildTerm(coef, factors) {
    if (factors.length === 0) return nodeOfQ(coef);
    const list = [];
    if (coef.n !== 1) list.push(mark(num(coef.n)));
    if (coef.d !== 1) list.push(mark(pow(num(coef.d), num(-1))));
    for (const f of factors) list.push(f);
    return list.length === 1 ? list[0] : mark(mul(list));
  }

  function factorWeight(f) {
    const base = f.t === 'pow' ? f.base : f;
    const e = f.t === 'pow' ? (f.exp.t === 'num' ? Math.abs(f.exp.v) : 2) : 1;
    let w = 3;
    if (base.t === 'var' || base.t === 'const') w = 1;
    else if (base.t === 'fn') w = 2;
    return e * w;
  }

  /** Builds the sum node: constants last, then by weight, leading minus avoided when possible. */
  function assembleSum(items) {
    if (items.length === 0) return ZERO;
    if (items.length === 1) return items[0].node;
    items.sort((a, b) => {
      if (a.weight !== b.weight) return a.weight < b.weight ? -1 : 1;
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      return 0;
    });
    if (items[0].coef.n < 0) {
      const j = items.findIndex((it) => it.coef.n > 0);
      if (j > 0) items.unshift(items.splice(j, 1)[0]);
    }
    return mark(add(items.map((it) => it.node)));
  }

  function simplifyAdd(inputs) {
    const flat = [];
    for (const t of inputs) {
      if (t.t === 'add') for (const u of t.terms) flat.push(u);
      else flat.push(t);
    }
    let constantTerm = Q0;
    const groups = new Map();
    for (const t of flat) {
      const { coef, factors } = splitTerm(t);
      if (factors.length === 0) {
        constantTerm = qAdd(constantTerm, coef);
      } else {
        const key = factors.map(keyOf).join('|');
        const g = groups.get(key);
        if (g) g.coef = qAdd(g.coef, coef);
        else groups.set(key, { coef, factors, key });
      }
    }
    const items = [];
    for (const g of groups.values()) {
      if (g.coef.n === 0) continue;
      items.push({
        node: buildTerm(g.coef, g.factors),
        coef: g.coef,
        weight: g.factors.reduce((s, f) => s + factorWeight(f), 0),
        key: g.key,
      });
    }
    if (constantTerm.n !== 0) {
      items.push({ node: nodeOfQ(constantTerm), coef: constantTerm, weight: Infinity, key: '' });
    }
    return assembleSum(items);
  }

  const isAtomFactor = (f) => f.t === 'var' || f.t === 'const'
    || (f.t === 'pow' && (f.base.t === 'var' || f.base.t === 'const') && f.exp.t === 'num');
  const isPolyLike = (sum) => sum.terms.every((t) => splitTerm(t).factors.every(isAtomFactor));
  const MAX_EXPANSION = 16;

  /**
   * Distributes monomials over sums only where it keeps results flat and readable:
   * a monomial times one sum, -(sum), or a product of small polynomial-like sums.
   */
  function tryDistribute(coef, others, sums) {
    if (!others.every(isAtomFactor)) return null;
    if (sums.length === 1) {
      const worthIt = others.length > 0 || (coef.n === -1 && coef.d === 1);
      if (!worthIt) return null;
      const rest = [nodeOfQ(coef)].concat(others);
      return simplifyAdd(sums[0].terms.map((t) => simplifyMul(rest.concat([t]))));
    }
    if (!sums.every(isPolyLike)) return null;
    if (sums.reduce((p, s) => p * s.terms.length, 1) > MAX_EXPANSION) return null;
    let acc = [simplifyMul([nodeOfQ(coef)].concat(others))];
    for (const s of sums) acc = acc.reduce((out, a) => out.concat(s.terms.map((t) => simplifyMul([a, t]))), []);
    return simplifyAdd(acc);
  }

  function simplifyMul(inputs) {
    let coef = Q1;
    const groups = new Map();
    const expArgs = [];
    const stack = inputs.slice().reverse();
    while (stack.length) {
      const f = stack.pop();
      if (f.t === 'num') {
        coef = qMul(coef, qFrom(f.v));
      } else if (f.t === 'mul') {
        for (let i = f.factors.length - 1; i >= 0; i -= 1) stack.push(f.factors[i]);
      } else if (isFraction(f)) {
        coef = qMul(coef, { n: 1, d: f.base.v });
      } else if (f.t === 'const' && f.name === 'e') {
        expArgs.push(ONE); // e = exp(1), so it merges with the other exponentials
      } else if (f.t === 'fn' && f.name === 'exp') {
        expArgs.push(f.arg);
      } else {
        const base = f.t === 'pow' ? f.base : f;
        const exp = f.t === 'pow' ? f.exp : ONE;
        const key = keyOf(base);
        const g = groups.get(key);
        if (g) g.exps.push(exp);
        else groups.set(key, { base, exps: [exp] });
      }
    }
    if (coef.n === 0) return ZERO;

    const items = [];
    for (const { base, exps } of groups.values()) {
      const e = exps.length === 1 ? exps[0] : simplifyAdd(exps);
      if (e.t === 'num' && e.v === 0) continue;
      items.push(e.t === 'num' && e.v === 1 ? base : mark(pow(base, e)));
    }
    if (expArgs.length) {
      // exp(u) * exp(v) = exp(u + v)
      const merged = simplifyFn('exp', expArgs.length === 1 ? expArgs[0] : simplifyAdd(expArgs));
      if (merged.t === 'fn' || merged.t === 'const') items.push(merged);
      else if (!(merged.t === 'num' && merged.v === 1)) return simplifyMul([nodeOfQ(coef), merged].concat(items));
    }
    items.sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    const sums = items.filter((it) => it.t === 'add');
    if (sums.length > 0) {
      const spread = tryDistribute(coef, items.filter((it) => it.t !== 'add'), sums);
      if (spread) return spread;
    }
    return buildTerm(coef, items);
  }

  /** Value of a purely numeric constant expression, or null. */
  function constValue(n) {
    if (n.t === 'num') return n.v;
    if (isFraction(n)) return 1 / n.base.v;
    if (n.t !== 'mul') return null;
    let p = 1;
    for (const f of n.factors) {
      const v = constValue(f);
      if (v === null) return null;
      p *= v;
    }
    return p;
  }

  function powOfNumbers(b, k) {
    if (b === 1) return ONE;
    if (Number.isInteger(b) && Number.isInteger(k) && Math.abs(k) <= 64) {
      const r = Math.pow(Math.abs(b), Math.abs(k));
      if (Number.isSafeInteger(r) && r > 0) {
        const sign = b < 0 && Math.abs(k) % 2 === 1 ? -1 : 1;
        return nodeOfQ(k > 0 ? qNorm(sign * r, 1) : qNorm(sign, r));
      }
    }
    const r = Math.pow(b, k);
    if (Number.isFinite(r) && Number.isInteger(k) && Math.abs(k) <= 64) {
      // Integer power of a decimal literal: fold it, as an exact fraction when it is one (1/1.5 -> 2/3).
      const q = asRational(r, 1000);
      return q ? nodeOfQ(qNorm(q[0], q[1])) : mark(num(r));
    }
    if (Number.isFinite(r) && Number.isInteger(r) && Math.abs(r) < MAX_SAFE) return mark(num(r));
    return mark(pow(num(b), num(k)));
  }

  function powNumeric(base, k) {
    switch (base.t) {
      case 'num': return powOfNumbers(base.v, k);
      case 'const':
        return base.name === 'e' ? simplifyFn('exp', num(k)) : mark(pow(base, num(k)));
      case 'fn':
        if (base.name === 'exp') return simplifyFn('exp', simplifyMul([num(k), base.arg]));
        break;
      case 'pow':
        if (Number.isInteger(k)) return simplifyPow(base.base, simplifyMul([base.exp, num(k)]));
        break;
      case 'mul':
        if (Number.isInteger(k)) return simplifyMul(base.factors.map((f) => simplifyPow(f, num(k))));
        break;
      default:
    }
    return mark(pow(base, num(k)));
  }

  function simplifyPow(base, exp) {
    const cv = exp.t === 'num' ? exp.v : constValue(exp);
    if (cv !== null) {
      if (cv === 0) return ONE;
      if (cv === 1) return base;
      return powNumeric(base, cv);
    }
    if (base.t === 'const' && base.name === 'e') return simplifyFn('exp', exp);
    if (base.t === 'num' && base.v === 1) return ONE;
    if (base.t === 'fn' && base.name === 'exp') return simplifyFn('exp', simplifyMul([exp, base.arg]));
    return mark(pow(base, exp));
  }

  const ZERO_AT_ZERO = new Set(['sin', 'tan', 'asin', 'atan', 'sinh', 'tanh']);
  const ONE_AT_ZERO = new Set(['cos', 'cosh']);

  function simplifyFn(name, arg) {
    switch (name) {
      case 'sqrt': return simplifyPow(arg, num(0.5));
      case 'exp':
        if (arg.t === 'num') return arg.v === 0 ? ONE : arg.v === 1 ? E_CONST : mark(fn('exp', arg));
        if (arg.t === 'fn' && arg.name === 'ln') return arg.arg;
        return mark(fn('exp', arg));
      case 'ln':
        if (arg.t === 'num' && arg.v === 1) return ZERO;
        if (arg.t === 'const' && arg.name === 'e') return ONE;
        if (arg.t === 'fn' && arg.name === 'exp') return arg.arg;
        return mark(fn('ln', arg));
      case 'log10':
        if (arg.t === 'num' && (arg.v === 1 || arg.v === 10)) return arg.v === 1 ? ZERO : ONE;
        return mark(fn('log10', arg));
      case 'abs':
        if (arg.t === 'num') return mark(num(Math.abs(arg.v)));
        if (arg.t === 'fn' && arg.name === 'abs') return arg;
        return mark(fn('abs', arg));
      default:
        if (arg.t === 'num' && arg.v === 0) {
          if (ZERO_AT_ZERO.has(name)) return ZERO;
          if (ONE_AT_ZERO.has(name)) return ONE;
        }
        return mark(fn(name, arg));
    }
  }

  /**
   * Simplifies an expression: flattens sums and products, folds numeric
   * coefficients (exactly, as fractions, when they are integers), merges equal
   * bases (x*x^2 -> x^3, exp(a)*exp(b) -> exp(a+b)), collects like terms and
   * applies 0/1 identities. Monomials are distributed over sums so polynomial
   * results come out expanded (2xy*(2+4x^2) -> 4xy + 8x^3 y); other products of
   * sums are left factored. The result is always numerically equal to the input.
   * @param {object} node AST.
   * @returns {object} Canonical AST (same object back when already canonical).
   */
  function simplify(node) {
    if (canonical.has(node)) return node;
    switch (node.t) {
      case 'num': return node.v === 0 ? ZERO : mark(node);
      case 'const':
      case 'var': return mark(node);
      case 'add': return simplifyAdd(node.terms.map(simplify));
      case 'mul': return simplifyMul(node.factors.map(simplify));
      case 'pow': return simplifyPow(simplify(node.base), simplify(node.exp));
      case 'fn': return simplifyFn(node.name, simplify(node.arg));
      default: throw new EDOError('Nodo de expresión desconocido.');
    }
  }

  /* ======================================================================== */
  /* Differentiation                                                           */
  /* ======================================================================== */

  /** Outer derivative g'(u) of a supported function g, as a raw (unsimplified) node. */
  function outerDerivative(node) {
    const u = node.arg;
    const oneMinusU2 = add([ONE, neg(pow(u, num(2)))]);
    switch (node.name) {
      case 'sin': return fn('cos', u);
      case 'cos': return neg(fn('sin', u));
      case 'tan': return pow(fn('cos', u), num(-2));
      case 'asin': return pow(oneMinusU2, num(-0.5));
      case 'acos': return neg(pow(oneMinusU2, num(-0.5)));
      case 'atan': return pow(add([ONE, pow(u, num(2))]), num(-1));
      case 'sinh': return fn('cosh', u);
      case 'cosh': return fn('sinh', u);
      case 'tanh': return pow(fn('cosh', u), num(-2));
      case 'exp': return node;
      case 'ln': return pow(u, num(-1));
      case 'log10': return pow(mul([u, fn('ln', num(10))]), num(-1));
      case 'abs': return mul([u, pow(fn('abs', u), num(-1))]);
      default: throw new EDOError(`No se puede derivar la función ${node.name}.`);
    }
  }

  function sumOf(parts) {
    if (parts.length === 0) return ZERO;
    return parts.length === 1 ? parts[0] : add(parts);
  }

  const isZeroConstant = (n) => isZeroNode(n) || (!dependsOn(n, 'x') && !dependsOn(n, 'y') && build(n)() === 0);

  /** Exponent used as a coefficient: 0.5 becomes the exact fraction 1/2 (so d(sqrt x) prints 1/(2 sqrt x)). */
  function coefficientNode(b) {
    if (b.t !== 'num' || Number.isInteger(b.v)) return b;
    const q = asRational(b.v, 16);
    return q ? nodeOfQ(qNorm(q[0], q[1])) : b;
  }

  /** Raw derivative of a canonical node; the caller simplifies the result. */
  function derive(n, v) {
    switch (n.t) {
      case 'num':
      case 'const': return ZERO;
      case 'var': return n.name === v ? ONE : ZERO;
      case 'add': return sumOf(n.terms.map((t) => derive(t, v)).filter((d) => !isZeroNode(d)));
      case 'mul': {
        const parts = [];
        n.factors.forEach((f, i) => {
          const df = derive(f, v);
          if (!isZeroNode(df)) parts.push(mul(n.factors.map((g, j) => (j === i ? df : g))));
        });
        return sumOf(parts);
      }
      case 'pow': {
        // (a^b)' = b a^(b-1) a' + a^b ln(a) b'  (a base that is the constant 0 gives 0^b = 0, derivative 0)
        if (isZeroConstant(n.base)) return ZERO;
        const da = derive(n.base, v);
        const db = derive(n.exp, v);
        const parts = [];
        if (!isZeroNode(da)) parts.push(mul([coefficientNode(n.exp), pow(n.base, add([n.exp, num(-1)])), da]));
        if (!isZeroNode(db)) parts.push(mul([n, fn('ln', n.base), db]));
        return sumOf(parts);
      }
      case 'fn': {
        const du = derive(n.arg, v);
        return isZeroNode(du) ? ZERO : mul([outerDerivative(n), du]);
      }
      default: throw new EDOError('Nodo de expresión desconocido.');
    }
  }

  function checkVar(v) {
    if (v !== 'x' && v !== 'y') throw new EDOError("Solo se puede derivar respecto de 'x' o 'y'.");
  }

  /**
   * Partial derivative, simplified.
   * @param {object} node AST.
   * @param {'x'|'y'} v Variable ('x' also stands for the typed independent variable, e.g. t).
   * @returns {object} Simplified AST.
   */
  function diff(node, v) {
    checkVar(v);
    return simplify(derive(simplify(node), v));
  }

  // Total derivatives remember the ODE right-hand side they were built from, so applying
  // `totalDerivative` repeatedly gives higher orders (a fresh node object carries the tag).
  const odeRhs = new WeakMap();

  /**
   * Total derivative along solutions of y' = f(x, y): D(g) = g_x + g_y * f, simplified.
   * With no `f` option, g itself is the right-hand side, so `totalDerivative(f)` is
   * y'' = f_x + f_y f. The result remembers f, so applying it again gives y''' and so on:
   * `totalDerivative(totalDerivative(f))`. Pass `f` explicitly for any other g.
   * @param {object} g Node to differentiate.
   * @param {{f?: object, indep?: string}} [opts] `f`: right-hand side of the ODE (default: the one
   *        remembered by g, else g itself). `indep` is accepted for symmetry and ignored (the AST
   *        stores the independent variable as 'x').
   * @returns {object} Simplified AST.
   */
  function totalDerivative(g, opts) {
    const gs = simplify(g);
    const f = simplify((opts && opts.f) || odeRhs.get(g) || odeRhs.get(gs) || g);
    const result = mark(Object.assign({}, simplify(add([derive(gs, 'x'), mul([derive(gs, 'y'), f])]))));
    odeRhs.set(result, f);
    return result;
  }

  /**
   * y', y'', ..., y^(order) as simplified nodes (y^(k+1) = D(y^(k)) with D the total derivative).
   * @param {object} f Right-hand side of y' = f(x, y).
   * @param {number} order Highest derivative wanted (>= 1).
   * @returns {object[]} `[y', y'', ...]`, length `order`.
   */
  function derivatives(f, order) {
    const fs = simplify(f);
    const out = [fs];
    for (let k = 2; k <= order; k += 1) out.push(totalDerivative(out[k - 2], { f: fs }));
    return out;
  }

  /**
   * Whether the expression contains the variable.
   * @param {object} node AST.
   * @param {'x'|'y'} v Variable name (canonical).
   * @returns {boolean}
   */
  function dependsOn(node, v) {
    switch (node.t) {
      case 'var': return node.name === v;
      case 'add': return node.terms.some((t) => dependsOn(t, v));
      case 'mul': return node.factors.some((t) => dependsOn(t, v));
      case 'pow': return dependsOn(node.base, v) || dependsOn(node.exp, v);
      case 'fn': return dependsOn(node.arg, v);
      default: return false;
    }
  }

  /**
   * Replaces variables by numbers or nodes WITHOUT evaluating or simplifying, so
   * the printed result keeps the structure (for "Reemplazando cada valor").
   * @param {object} node AST.
   * @param {{x?: number|object, y?: number|object}} map Replacements (`x` is the independent variable).
   * @returns {object} New AST.
   */
  function substitute(node, map) {
    const go = (n) => {
      switch (n.t) {
        case 'var': {
          const r = map[n.name];
          if (r === undefined) return n;
          return typeof r === 'number' ? num(r) : r;
        }
        case 'add': return add(n.terms.map(go));
        case 'mul': return mul(n.factors.map(go));
        case 'pow': return pow(go(n.base), go(n.exp));
        case 'fn': return fn(n.name, go(n.arg));
        default: return n;
      }
    };
    return go(node);
  }

  /* ======================================================================== */
  /* Printers (one generic printer, two dialects: TeX and plain text)          */
  /* ======================================================================== */

  // Precedence of a printed piece: 1 sum, 2 product / leading sign, 3 power, 4 atom.
  const negLead = (n) => (n.t === 'num' ? n.v < 0 : n.t === 'mul' && n.factors[0].t === 'num' && n.factors[0].v < 0);

  /** Node without its leading minus sign (call only when negLead(n)). */
  function stripSign(n) {
    if (n.t === 'num') return num(-n.v);
    const m = -n.factors[0].v;
    const list = m === 1 ? n.factors.slice(1) : [num(m)].concat(n.factors.slice(1));
    if (list.length === 0) return num(1);
    return list.length === 1 ? list[0] : mul(list);
  }

  /** Smallest denominator <= max for which v is p/q to 1e-12, or null. */
  function asRational(v, max) {
    for (let q = 1; q <= max; q += 1) {
      const p = Math.round(v * q);
      if (Math.abs(v - p / q) <= 1e-12 * Math.max(1, Math.abs(v))) return [p, q];
    }
    return null;
  }

  const startsNumeric = (n) => n.t === 'num' || (n.t === 'pow' && startsNumeric(n.base));

  function makePrinter(d) {
    const wrap = (r, minP) => (r.p < minP ? d.paren(r.s) : r.s);

    function prProduct(factors) {
      if (factors.length === 1) return pr(factors[0]);
      const items = factors.map((f) => ({ node: f, s: wrap(pr(f), 3) }));
      return { s: d.mulJoin(items), p: 2 };
    }

    function prMul(n) {
      if (negLead(n)) {
        const r = pr(stripSign(n));
        return { s: `-${wrap(r, 2)}`, p: 2 };
      }
      const top = [];
      const bottom = [];
      for (const f of n.factors) {
        if (f.t === 'pow' && f.exp.t === 'num' && f.exp.v < 0) bottom.push(f.exp.v === -1 ? f.base : pow(f.base, num(-f.exp.v)));
        else top.push(f);
      }
      if (bottom.length === 0) return prProduct(top);
      const numerator = top.length ? prProduct(top) : { s: d.num(1), p: 4 };
      return d.frac(numerator, prProduct(bottom), bottom, pr);
    }

    function prAdd(n) {
      let s = '';
      n.terms.forEach((t, i) => {
        const negative = negLead(t);
        const body = wrap(pr(negative ? stripSign(t) : t), negative ? 2 : 0);
        if (i === 0) s = negative ? `-${body}` : body;
        else s += negative ? ` - ${body}` : ` + ${body}`;
      });
      return { s, p: 1 };
    }

    function prPow(n) {
      const { base, exp } = n;
      if (exp.t === 'num') {
        if (exp.v < 0) return prMul(mul([n]));
        if (exp.v === 0.5) return { s: d.sqrt(pr(base).s), p: 4 };
        if (d.fnPower && base.t === 'fn' && base.name !== 'exp' && base.name !== 'abs'
          && Number.isInteger(exp.v) && exp.v > 1) {
          return { s: d.fnPower(base.name, exp.v, pr(base.arg).s), p: 3 };
        }
      }
      const b = pr(base);
      const bs = b.p >= 4 && !(d.parenNumberBase && base.t === 'num') ? b.s : d.paren(b.s);
      return { s: d.pow(bs, exp, pr), p: 3 };
    }

    function pr(n) {
      switch (n.t) {
        case 'num': return { s: d.num(n.v), p: n.v < 0 ? 1 : 4 };
        case 'const': return { s: d.constant(n.name), p: 4 };
        case 'var': return { s: d.variable(n.name), p: 4 };
        case 'add': return prAdd(n);
        case 'mul': return prMul(n);
        case 'pow': return prPow(n);
        case 'fn': return n.name === 'sqrt' ? { s: d.sqrt(pr(n.arg).s), p: 4 } : d.fnCall(n.name, pr(n.arg).s);
        default: throw new EDOError('Nodo de expresión desconocido.');
      }
    }
    return pr;
  }

  /** Default numeric literal: integers as is, others with 12 significant digits. */
  function plainNumber(v) {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    return String(Number(v.toPrecision(12)));
  }

  function texNumber(v) {
    const s = plainNumber(v);
    if (s === 'Infinity') return '\\infty';
    if (s === '-Infinity') return '-\\infty';
    if (s === 'NaN') return '\\mathrm{NaN}';
    const m = /^(-?[\d.]+)e([+-]?\d+)$/.exec(s);
    return m ? `${m[1]}\\times 10^{${parseInt(m[2], 10)}}` : s;
  }

  const TEX_FN = {
    sin: '\\operatorname{sen}', cos: '\\cos', tan: '\\tan', asin: '\\operatorname{arcsen}', acos: '\\arccos',
    atan: '\\arctan', sinh: '\\operatorname{senh}', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', log10: '\\log_{10}',
  };
  const texParen = (s) => (/\\frac|\\sqrt|\\left/.test(s) ? `\\left(${s}\\right)` : `(${s})`);

  function texDialect(o) {
    const slash = o.style === 'catedra';
    return {
      parenNumberBase: slash,
      fnPower: (name, k, argS) => `${TEX_FN[name]}^{${k}}${texParen(argS)}`,
      num: (v) => (o.numFmt ? String(o.numFmt(v)) : texNumber(v)),
      constant: (name) => (name === 'pi' ? '\\pi' : 'e'),
      variable: (name) => (name === 'x' ? o.indep : 'y'),
      paren: texParen,
      sqrt: (s) => `\\sqrt{${s}}`,
      frac: (top, bottom) => (slash
        ? { s: `${top.p < 2 ? texParen(top.s) : top.s}/${bottom.p < 3 ? texParen(bottom.s) : bottom.s}`, p: 2 }
        : { s: `\\frac{${top.s}}{${bottom.s}}`, p: 4 }),
      pow: (bs, exp, pr) => {
        let e = pr(exp).s;
        if (exp.t === 'num' && !Number.isInteger(exp.v)) {
          const q = asRational(exp.v, 16);
          if (q) e = `\\frac{${q[0]}}{${q[1]}}`;
        }
        return `${bs}^{${e}}`;
      },
      fnCall: (name, argS) => {
        if (name === 'exp') return { s: `e^{${argS}}`, p: 3 };
        if (name === 'abs') return { s: `\\left|${argS}\\right|`, p: 4 };
        return { s: `${TEX_FN[name]}${texParen(argS)}`, p: 3 };
      },
      mulJoin: (items) => items.reduce((acc, it, i) => {
        if (i === 0) return it.s;
        const needsDot = slash || startsNumeric(it.node)
          || (it.s.startsWith('\\frac') && startsNumeric(items[i - 1].node));
        // A control word such as \pi must be followed by a space before a letter ("\pi x", not "\pix").
        const needsSpace = !needsDot && /\\[A-Za-z]+$/.test(acc) && /^[A-Za-z]/.test(it.s);
        return `${acc}${needsDot ? '\\cdot ' : needsSpace ? ' ' : ''}${it.s}`;
      }, ''),
    };
  }

  function textDialect(o) {
    const wrapIf = (r, minP) => (r.p < minP ? `(${r.s})` : r.s);
    return {
      parenNumberBase: false,
      num: (v) => (o.numFmt ? String(o.numFmt(v)) : String(v)),
      constant: (name) => name,
      variable: (name) => (name === 'x' ? o.indep : 'y'),
      paren: (s) => `(${s})`,
      sqrt: (s) => `sqrt(${s})`,
      frac: (top, bottom, bottomFactors, pr) => {
        // A sum among several denominator factors is divided one factor at a time ("a/x^2/(y + 1)"),
        // because "a/(x^2*(y + 1))" would be re-expanded when parsed again.
        if (bottomFactors.length > 1 && bottomFactors.some((f) => f.t === 'add')) {
          return { s: bottomFactors.reduce((acc, f) => `${acc}/${wrapIf(pr(f), 3)}`, wrapIf(top, 2)), p: 2 };
        }
        return { s: `${wrapIf(top, 2)}/${wrapIf(bottom, 3)}`, p: 2 };
      },
      pow: (bs, exp, pr) => {
        const e = pr(exp);
        const plain = (exp.t === 'num' && exp.v >= 0) || exp.t === 'var' || exp.t === 'const';
        return `${bs}^${plain ? e.s : `(${e.s})`}`;
      },
      fnCall: (name, argS) => ({ s: `${name}(${argS})`, p: 4 }),
      mulJoin: (items) => items.map((it) => it.s).join('*'),
    };
  }

  function printerOptions(opts) {
    const o = opts || {};
    return { indep: normalizeIndep(o.indep), numFmt: typeof o.numFmt === 'function' ? o.numFmt : null, style: o.style };
  }

  /**
   * LaTeX of an expression. Spanish function names (sen), e^{...} for exp, \frac,
   * implicit products ("2xy", "4x^{2}y") with \cdot only before numbers, minimal
   * parentheses (negative numbers are always wrapped after a product or inside a power).
   * @param {object} node AST.
   * @param {{indep?: string, numFmt?: function(number): string, style?: 'math'|'catedra'}} [opts]
   *   `indep`: letter used for the independent variable (default 'x').
   *   `numFmt`: formats numeric literals (e.g. truncation to 4 decimals).
   *   `style: 'catedra'`: the handout's substitution style: explicit \cdot everywhere,
   *   inline a/b divisions and parenthesized numeric power bases, e.g. 2\cdot(1+0.1/2).
   * @returns {string}
   */
  function toTeX(node, opts) {
    const o = printerOptions(opts);
    return makePrinter(texDialect(o))(node).s;
  }

  /**
   * Plain-text form that parses back to an equivalent expression (uses `*`, `/`, `^`, exp(...)).
   * @param {object} node AST.
   * @param {{indep?: string, numFmt?: function(number): string}} [opts]
   * @returns {string}
   */
  function toString(node, opts) {
    const o = printerOptions(opts);
    return makePrinter(textDialect(o))(node).s;
  }

  return {
    EDOError,
    EDOParseError,
    parse,
    compile,
    evalNode,
    simplify,
    diff,
    totalDerivative,
    derivatives,
    substitute,
    dependsOn,
    toTeX,
    toString,
    normalizeIndep,
    nodeKey: keyOf,
    /** Node builders for code that composes expressions (`add([...])`, `div(a, b)`, `num(1)`, ...). */
    N: { num, constant, variable, add, mul, pow, fn, neg, sub, div },
  };
}));
