/**
 * EDO.audience.quiz - the ten questions of the Audiencia page, their answer keys and explanations, and the grading.
 * No DOM. Every key agrees with section 5 of the ODD document; the ones with a number behind them are asserted against
 * the engine in web/tests/audience.test.js, and the numeric question takes its key from `methods.solve` at run time.
 *
 *   QUESTIONS[]  {id, topic, extension?, kind: 'choice'|'number', prompt, options?[{id, text}], answer?, explanation}
 *                prompt, option texts and explanation are Spanish with inline math in $...$
 *   numericKey(question) -> {value, step}         the engine's value for a 'number' question (and its step record)
 *   grade(question, response) -> {status, correct}
 *     status: 'correct' | 'close' (number within 0.01) | 'wrong' | 'invalid' (not a number / unknown option) | 'empty'
 *   score(results {id: status}) -> {answered, correct, total}
 *   gradeNumber(value, key) -> 'correct' | 'close' | 'wrong'   (shared with the mini-exercise of audience/model.js)
 *   TOLERANCE    a number is right when it differs from the key by less than 1e-4 (its 4-decimal value, truncated
 *                or rounded); CLOSE  within 0.01
 *
 * Load order: after the numerics (format, problems, methods). Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      format: require('../../../numerics/format.js'),
      problems: require('../../../numerics/problems.js'),
      methods: require('../../../numerics/methods.js'),
    });
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.audience = EDO.audience || {};
    EDO.audience.quiz = factory(EDO);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (EDO) {
  'use strict';

  const { format, problems, methods } = EDO;

  const TOLERANCE = 1e-4;
  const CLOSE = 1e-2;

  const num = (v) => format.num(v, { decimals: 6, mode: 'round' });

  /** The step of the numeric question: Euler Mejorado on the cátedra's y' = 2xy, y(1) = 1, h = 0.1 (first step). */
  const NUMERIC = Object.freeze({ preset: 'cmp_2xy_13', method: 'heun', h: 0.1, n: 1 });

  function numericKey(question) {
    const spec = (question && question.spec) || NUMERIC;
    const sol = methods.solve(spec.method, problems.fromPreset(spec.preset), { h: spec.h });
    return { value: sol.ys[spec.n], step: sol.steps[spec.n - 1] };
  }

  function numericExplanation() {
    const { value, step } = numericKey({ spec: NUMERIC });
    const d = step.detail;
    return `Pendiente inicial $y_0' = 2 \\cdot 1 \\cdot 1 = ${num(d.slope)}$. Predictor (un paso de Euler): $y_0 + h\\,y_0' = 1 + 0.1 \\cdot ${num(d.slope)} = ${num(d.yPred)}$. `
      + `Pendiente al final: $f(1.1,\\ ${num(d.yPred)}) = 2 \\cdot 1.1 \\cdot ${num(d.yPred)} = ${num(d.slopeEnd)}$. `
      + `Promedio y paso: $y_1 = 1 + \\tfrac{0.1}{2}\\,(${num(d.slope)} + ${num(d.slopeEnd)}) = ${num(value)}$. Se acepta el valor con 4 decimales, truncado o redondeado, con coma o con punto.`;
  }

  const QUESTIONS = Object.freeze([
    {
      id: 'pvi',
      topic: 'pvi',
      kind: 'choice',
      prompt: '¿Qué hace falta para tener un problema de valor inicial (PVI)?',
      options: [
        { id: 'a', text: 'La EDO $y\' = f(x, y)$ y su solución exacta.' },
        { id: 'b', text: 'La EDO, una condición en cada extremo del intervalo y el paso $h$.' },
        { id: 'c', text: 'La EDO $y\' = f(x, y)$, la condición inicial $y(x_0) = y_0$, el dominio de trabajo $x_0 \\le x \\le x_f$ y el paso $h$.' },
        { id: 'd', text: 'Solo la condición inicial y la cantidad de iteraciones.' },
      ],
      answer: 'c',
      explanation: 'Como dice el apunte, «con esas cuatro cosas tenemos un problema de valor inicial»: la ecuación, la condición inicial, el dominio de trabajo y el paso. Una condición en cada extremo corresponde a un problema de contorno.',
    },
    {
      id: 'orden-heun',
      topic: 'orden',
      extension: true,
      kind: 'choice',
      prompt: '¿Cómo se comporta el error global de Euler Mejorado al reducir el paso $h$?',
      options: [
        { id: 'h1', text: 'Como $O(h)$: es de orden 1, igual que Euler.' },
        { id: 'h2', text: 'Como $O(h^2)$: es de orden 2.' },
        { id: 'h3', text: 'Como $O(h^3)$: es de orden 3.' },
        { id: 'h4', text: 'No depende de $h$.' },
      ],
      answer: 'h2',
      explanation: 'El error local de un paso es $O(h^3)$ y, al acumularse en $N = (x_f - x_0)/h$ pasos, el global es $O(h^2)$. Lo mismo vale para Taylor de grado 2 y RK2; Euler es de orden 1.',
    },
    {
      id: 'orden-mitad',
      topic: 'orden',
      extension: true,
      kind: 'choice',
      prompt: 'Con RK2 (punto medio), si se divide el paso $h$ por 2, ¿por cuánto se divide aproximadamente el error en $x_f$?',
      options: [
        { id: '2', text: 'Por 2.' },
        { id: '4', text: 'Por 4.' },
        { id: '8', text: 'Por 8.' },
        { id: '1', text: 'No cambia.' },
      ],
      answer: '4',
      explanation: 'Si el error se comporta como $C\\,h^2$, al pasar de $h$ a $h/2$ queda $C\\,h^2/4$. Así se mide el orden en la Comparativa: $p = \\log_2\\big(e(h)/e(h/2)\\big) \\approx 2$.',
    },
    {
      id: 'formula-rk2',
      topic: 'formula',
      kind: 'choice',
      prompt: '¿Qué método usa la fórmula $y_{n+1} = y_n + h\\,f\\!\\left(x_n + \\tfrac{h}{2},\\ y_n + \\tfrac{k_1}{2}\\right)$, con $k_1 = h\\,f(x_n, y_n)$?',
      options: [
        { id: 'heun', text: 'Euler Mejorado.' },
        { id: 'rk2', text: 'Runge-Kutta de grado 2 (punto medio).' },
        { id: 'taylor', text: 'Taylor de grado 2.' },
        { id: 'euler', text: 'Euler.' },
      ],
      answer: 'rk2',
      explanation: 'Es el RK2 del curso: avanza medio paso con la pendiente inicial y usa la pendiente de ese punto medio para el paso completo. Observe que $k_1$ ya incluye a $h$. En $y\' = 2xy$, $y(1) = 1$, $h = 0.1$ da $y_1 = 1.231$.',
    },
    {
      id: 'formula-em',
      topic: 'formula',
      kind: 'choice',
      prompt: '¿Qué método usa la fórmula $y_{n+1} = y_n + \\tfrac{h}{2!}\\left[\\,y_n\' + f(x_{n+1},\\ y_n + h\\,y_n\')\\,\\right]$?',
      options: [
        { id: 'heun', text: 'Euler Mejorado.' },
        { id: 'rk2', text: 'RK2 (punto medio).' },
        { id: 'taylor', text: 'Taylor de grado 2.' },
        { id: 'euler', text: 'Euler.' },
      ],
      answer: 'heun',
      explanation: 'Promedia la pendiente al inicio, $y_n\'$, y la pendiente al final evaluada en el predictor de Euler $y_n + h\\,y_n\'$: es la regla del trapecio con predictor de Euler.',
    },
    {
      id: 'taylor-y2',
      topic: 'formula',
      kind: 'choice',
      prompt: 'Para aplicar Taylor de grado 2 a $y\' = 2xy$ hace falta $y\'\'$. ¿Cuánto vale?',
      options: [
        { id: 'a', text: '$y\'\' = 2y + 4x^2 y$' },
        { id: 'b', text: '$y\'\' = 2y$' },
        { id: 'c', text: '$y\'\' = 2x + 2y$' },
        { id: 'd', text: '$y\'\' = 4xy$' },
      ],
      answer: 'a',
      explanation: 'Se deriva respecto de $x$ teniendo en cuenta que $y$ depende de $x$: $y\'\' = \\tfrac{\\partial f}{\\partial x} + \\tfrac{\\partial f}{\\partial y}\\,y\' = 2y + 2x \\cdot 2xy = 2y + 4x^2 y$. Es la derivada que usa el Ejemplo 1 del apunte.',
    },
    {
      id: 'nombre-em',
      topic: 'nomenclatura',
      kind: 'choice',
      prompt: 'En este curso, ¿qué método se llama «Euler Mejorado»?',
      options: [
        { id: 'heun', text: 'El método de Heun: trapecio con predictor de Euler.' },
        { id: 'rk2', text: 'El método del punto medio.' },
        { id: 'taylor', text: 'Taylor de grado 2.' },
        { id: 'rk4', text: 'Runge-Kutta de orden 4.' },
      ],
      answer: 'heun',
      explanation: 'Euler Mejorado es Heun. Algunos libros llaman «Euler modificado» o «polígono mejorado» al punto medio; en este curso el punto medio es el RK2. Los dos son miembros de la familia de Runge-Kutta de dos etapas.',
    },
    {
      id: 'costo-taylor',
      topic: 'costo',
      kind: 'choice',
      prompt: '¿Cuántas evaluaciones por paso necesita Taylor de grado 2?',
      options: [
        { id: '1', text: 'Una: solo $f$.' },
        { id: '2', text: 'Dos evaluaciones de $f$.' },
        { id: '3', text: 'Tres: $f$, $f_x$ y $f_y$ (además de derivar a mano).' },
        { id: '4', text: 'Cuatro evaluaciones de $f$.' },
      ],
      answer: '3',
      explanation: 'Taylor de grado 2 evalúa $f$ y las derivadas parciales $f_x$ y $f_y$ (o la $y\'\'$ ya derivada). Euler Mejorado y RK2 alcanzan el mismo orden con dos evaluaciones de $f$ y sin derivar; Euler usa una.',
    },
    {
      id: 'lineal',
      topic: 'lineal',
      extension: true,
      kind: 'choice',
      prompt: 'En el problema lineal $y\' = \\lambda y$, ¿qué ocurre con Taylor de grado 2, Euler Mejorado y RK2?',
      options: [
        { id: 'taylor', text: 'Taylor de grado 2 es siempre el más preciso.' },
        { id: 'same', text: 'Dan exactamente los mismos valores: $y_{n+1} = \\left(1 + z + \\tfrac{z^2}{2}\\right) y_n$, con $z = h\\lambda$.' },
        { id: 'rk2', text: 'RK2 es el más preciso porque usa el punto medio.' },
        { id: 'none', text: 'Ninguno converge.' },
      ],
      answer: 'same',
      explanation: 'Los tres hacen la misma cuenta en cada paso, $\\left(1 + z + \\tfrac{z^2}{2}\\right) y_n$; Euler hace $(1 + z)\\,y_n$. Por eso, en un problema lineal, las diferencias entre los tres no aparecen.',
    },
    {
      id: 'calculo',
      topic: 'calculo',
      kind: 'number',
      spec: NUMERIC,
      prompt: 'Con $y\' = 2xy$, $y(1) = 1$ y $h = 0.1$, calcule $y_1$ por Euler Mejorado (4 decimales).',
      explanation: numericExplanation(),
    },
  ].map((q) => Object.freeze(q)));

  const byId = (id) => QUESTIONS.find((q) => q.id === id) || null;

  function gradeNumber(value, key) {
    const diff = Math.abs(value - key);
    // The margin keeps a typed neighbour such as 1.2321 for 1.232 out (their float difference may round below 1e-4).
    if (diff < TOLERANCE - 1e-9) return 'correct';
    return diff <= CLOSE ? 'close' : 'wrong';
  }

  function grade(question, response) {
    const text = response === undefined || response === null ? '' : String(response).trim();
    if (!text) return { status: 'empty', correct: false };
    if (question.kind === 'number') {
      const v = format.parseNumber(text);
      if (!Number.isFinite(v)) return { status: 'invalid', correct: false };
      const status = gradeNumber(v, numericKey(question).value);
      return { status, correct: status === 'correct', value: v };
    }
    if (!question.options.some((o) => o.id === text)) return { status: 'invalid', correct: false };
    const correct = text === question.answer;
    return { status: correct ? 'correct' : 'wrong', correct };
  }

  function score(results) {
    const values = Object.keys(results || {}).map((k) => results[k]).filter((s) => s === 'correct' || s === 'wrong' || s === 'close');
    return { answered: values.length, correct: values.filter((s) => s === 'correct').length, total: QUESTIONS.length };
  }

  return {
    QUESTIONS, TOLERANCE, CLOSE, byId, numericKey, grade, gradeNumber, score,
  };
}));
