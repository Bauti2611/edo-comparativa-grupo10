/**
 * Hidden route '#/_ui': living style guide used for QA. It renders every shared component in all its
 * variants with the real tokens, math, charts and numerics (nothing here is part of the deliverable's
 * content). Sub-routes ('#/_ui/color') also exercise deep-link scrolling.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h, icon, tabset, uid } = EDO.dom;
  const T = String.raw;

  const SECTIONS = [
    ['tipografia', 'Tipografía'],
    ['color', 'Color y métodos'],
    ['bloques', 'Bloques de contenido'],
    ['pasos', 'Bloque de pasos'],
    ['tablas', 'Tablas'],
    ['controles', 'Controles'],
    ['navegacion', 'Pestañas y detalles'],
    ['graficos', 'Gráficos'],
    ['layout', 'Layout y estados'],
  ];

  const METHOD_LABELS = [
    ['euler', 'Euler'],
    ['taylor', 'Taylor'],
    ['heun', 'Euler Mejorado'],
    ['rk2', 'RK2 (punto medio)'],
    ['exact', 'Exacta o referencia'],
  ];

  const section = (id, title, ...children) => h('section', { id: `_ui-${id}`, class: 'sg-section' }, h('h2', null, title), children);
  const demo = (label, ...nodes) => h('div', { class: 'sg-demo' }, h('p', { class: 'sg-demo__label' }, label), h('div', { class: 'sg-demo__body' }, nodes));

  /* ---- Pieces ------------------------------------------------------------------------------------ */

  function swatch(token, name) {
    return h('div', { class: 'sg-swatch' },
      h('span', { class: 'sg-swatch__chip', style: { background: `var(${token})` } }),
      h('span', null, h('strong', null, name), h('br'), h('code', null, token)));
  }

  /** Legend row: the line style and the marker shape that `EDO.charts.methodStyle` gives each method. */
  function legendRow(id, label) {
    const style = EDO.charts.methodStyle(id);
    const svg = EDO.dom.svg;
    const marker = (cx) => {
      const c = `var(--m-${id})`;
      if (id === 'taylor') return svg('circle', { cx, cy: 12, r: 4.5, fill: c });
      if (id === 'euler') return svg('rect', { x: cx - 4, y: 8, width: 8, height: 8, fill: c });
      if (id === 'heun') return svg('polygon', { points: `${cx},7 ${cx + 5},16 ${cx - 5},16`, fill: c });
      if (id === 'rk2') return svg('polygon', { points: `${cx},6.5 ${cx + 5.5},12 ${cx},17.5 ${cx - 5.5},12`, fill: c });
      return null;
    };
    return h('div', { class: 'sg-legend__row' },
      svg('svg', { width: 132, height: 24, viewBox: '0 0 132 24', 'aria-hidden': 'true' },
        svg('line', {
          x1: 4, x2: 128, y1: 12, y2: 12, stroke: `var(--m-${id})`, 'stroke-width': style.width, 'stroke-dasharray': style.dash.join(' ') || 'none',
        }),
        marker(26), marker(66), marker(106)),
      h('span', null, label));
  }

  function numbersTable() {
    const { problems, methods, format } = EDO;
    const problem = problems.fromPreset('a1');
    const ids = ['euler', 'taylor', 'heun', 'rk2'];
    const sols = ids.map((id) => methods.solve(id, problem));
    const num = (v) => format.num(v, { decimals: 4, mode: 'round' });
    const chip = (id, label) => h('span', { class: 'method-chip', 'data-method': id }, label);
    const short = (id) => methods.byId(id).label.replace(' (punto medio)', '');
    const heads = ids.map((id) => chip(id, short(id)));
    const caption = 'y\' = 2xy, y(1) = 1, h = 0.1 (valores redondeados a 4 decimales)';
    const th = (content) => h('th', { scope: 'col', class: 'num' }, content);
    const row = (n) => {
      const exact = problem.exact.fn(sols[0].xs[n]);
      return h('tr', { 'data-hl': n === 3 ? '' : null },
        h('td', { class: 'num' }, n),
        h('td', { class: 'num' }, num(sols[0].xs[n])),
        sols.map((s) => h('td', { class: 'num' }, num(s.ys[n]))),
        h('td', { class: 'num' }, num(exact)),
        sols.map((s) => h('td', { class: 'num' }, format.sci(Math.abs(s.ys[n] - exact), { digits: 3 }))));
    };
    // The visible caption sits outside the scroller (a <caption> would scroll away on narrow screens).
    const table = h('table', null,
      h('caption', { class: 'sr-only' }, caption),
      h('thead', null, h('tr', null,
        th('n'), th('x_n'), heads.map(th), th('Exacta'), ids.map((id) => th(`|error| ${short(id)}`)))),
      h('tbody', null, [0, 1, 2, 3].map(row)));
    return h('div', { class: 'stack', style: { '--gap': '0.5rem' } },
      h('p', { class: 'muted' }, caption),
      h('div', {
        class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': 'Valores de y_n por método y error absoluto',
      }, table));
  }

  function chartDemo(ctx) {
    const { problems, methods } = EDO;
    const problem = problems.fromPreset('a1', { h: 0.025 });
    const dense = Array.from({ length: 61 }, (v, i) => {
      const x = problem.x0 + (i * (problem.xf - problem.x0)) / 60;
      return { x, y: problem.exact.fn(x) };
    });
    const datasets = [EDO.charts.dataset('exact', 'Exacta', dense)];
    ['euler', 'taylor', 'heun', 'rk2'].forEach((id) => {
      const sol = methods.solve(id, problem);
      datasets.push(EDO.charts.dataset(id, methods.byId(id).label, sol.xs.map((x, i) => ({ x, y: sol.ys[i] }))));
    });
    const canvas = h('canvas');
    const figure = h('figure', { class: 'chart' },
      h('div', { class: 'chart-box' }, canvas),
      h('figcaption', null, 'Solución de y\' = 2xy, y(1) = 1 con h = 0.025 (12 pasos) y la curva exacta.'));
    root.setTimeout(() => {
      EDO.charts.create(canvas, {
        type: 'line',
        data: { datasets },
        options: {
          scales: {
            x: { type: 'linear', title: { display: true, text: 'x' } },
            y: { title: { display: true, text: 'y' } },
          },
        },
      }, { title: 'Soluciones numéricas y exacta de y\' = 2xy', signal: ctx.signal });
    }, 0);
    return figure;
  }

  /* ---- Sections ------------------------------------------------------------------------------------- */

  function typography() {
    const solTaylor = EDO.methods.solve('taylor', EDO.problems.fromPreset('a1'));
    return section('tipografia', 'Tipografía',
      h('div', { class: 'stack' },
        h('p', { class: 'lead' }, 'Párrafo introductorio: una frase corta que dice de qué trata la sección y qué se puede hacer en ella.'),
        h('div', { class: 'prose' },
          h('h3', null, 'Subtítulo de nivel 3'),
          h('p', null, 'Texto de párrafo con ', h('a', { href: '#/_ui/tipografia' }, 'un enlace'), ', ', h('strong', null, 'énfasis fuerte'),
            ', ', h('em', null, 'énfasis'), ', ', h('code', null, 'f(x, y) = 2*x*y'), ' y la tecla ', h('kbd', { class: 'kbd' }, 'P'),
            '. Acentos y eñes: camión, acción, ñandú, ¿qué? ¡Listo!'),
          h('h4', null, 'Subtítulo de nivel 4'),
          h('ul', null, h('li', null, 'Elemento de lista con texto de ejemplo.'), h('li', null, 'Otro elemento, algo más largo, que ocupa más de una línea en pantallas angostas para verificar el interlineado.')),
          h('ol', null, h('li', null, 'Primer paso.'), h('li', null, 'Segundo paso.')),
          h('p', null, T`Fórmula en línea: $y_{n+1} = y_n + h\,y_n'$ dentro de una frase, y una fórmula en bloque:`)),
        h('div', { class: 'formula' }, T`$$y_{n+1} = y_n + \frac{h}{2}\Bigl[f(x_n,y_n) + f\bigl(x_{n+1},\,y_n + h\,f(x_n,y_n)\bigr)\Bigr]$$`),
        demo('Cifras tabulares (las tres líneas deben tener el mismo ancho)',
          h('p', { class: 'num sg-nums' }, '1111.1111', h('br'), '0000.0000', h('br'), '8888.8888')),
        demo('Valor calculado por el motor', h('p', null, 'y(1.3) con Taylor de grado 2: ', h('strong', { class: 'num' }, EDO.format.num(solTaylor.ys[3], { decimals: 4, mode: 'trunc' })), ' (truncado a 4 decimales).'))));
  }

  function colors() {
    const tokens = [
      ['--paper', 'Fondo de página'], ['--surface', 'Superficie'], ['--sunken', 'Hundido'], ['--border', 'Borde'],
      ['--border-strong', 'Borde de controles'], ['--ink', 'Tinta'], ['--ink-2', 'Tinta secundaria'], ['--ink-3', 'Tinta atenuada'],
      ['--hl', 'Resaltado'], ['--hl-soft', 'Resaltado suave'], ['--danger', 'Error'],
    ];
    return section('color', 'Color y métodos',
      h('div', { class: 'stack' },
        h('div', { class: 'sg-swatches' }, tokens.map(([token, name]) => swatch(token, name))),
        demo('Color, trazo y marcador de cada método (codificación redundante)', h('div', { class: 'sg-legend' }, METHOD_LABELS.map(([id, label]) => legendRow(id, label)))),
        demo('Etiquetas de método', h('div', { class: 'cluster' }, METHOD_LABELS.map(([id, label]) => h('span', { class: 'method-chip', 'data-method': id }, label))))));
  }

  function blocks() {
    const labels = { note: 'Nota', extension: 'Ampliación', warning: 'Atención', result: 'Resultado' };
    const sample = {
      note: 'Aclaración breve que acompaña al contenido principal.',
      extension: 'Contenido que no figura en el curso y se agrega como ampliación.',
      warning: 'Advertencia sobre un error frecuente al aplicar el método.',
      result: 'El valor que se debe anotar como resultado del ejercicio.',
    };
    const stats = [
      ['y(1.3), Taylor', EDO.methods.solve('taylor', EDO.problems.fromPreset('a1')).ys[3], 'taylor'],
      ['y(1.3), Euler Mejorado', EDO.methods.solve('heun', EDO.problems.fromPreset('a1')).ys[3], 'heun'],
      ['y(1.3), RK2', EDO.methods.solve('rk2', EDO.problems.fromPreset('a1')).ys[3], 'rk2'],
    ];
    return section('bloques', 'Bloques de contenido',
      h('div', { class: 'stack' },
        h('div', { class: 'grid' }, Object.keys(labels).map((kind) => h('div', { class: 'callout', 'data-kind': kind },
          h('p', { class: 'callout__label' }, labels[kind]), h('p', null, sample[kind])))),
        demo('Resaltado en línea', h('p', null, 'El valor pedido es ', h('mark', { class: 'hl' }, 'y(1.3) ≈ 1.9727'), ' y se anota en el resultado.')),
        demo('Fórmula genérica resaltada',
          h('div', { class: 'formula hl' }, T`$$y_{n+1} = y_n + h\,y_n' + \frac{h^2}{2!}\,y_n''$$`)),
        demo('Etiquetas', h('div', { class: 'cluster' },
          h('span', { class: 'badge' }, 'Ampliación'), h('span', { class: 'badge', 'data-kind': 'course' }, 'Del apunte'))),
        demo('Valores destacados', h('div', { class: 'cluster', style: { '--gap': '2rem' } }, stats.map(([label, value, method]) => h('div', { class: 'stat' },
          h('span', { class: 'stat__label' }, h('span', { class: 'method-chip', 'data-method': method }, label)),
          h('span', { class: 'stat__value' }, EDO.format.num(value, { decimals: 4, mode: 'round' })),
          h('span', { class: 'stat__note' }, 'redondeado a 4 decimales'))))),
        demo('Tarjeta', h('article', { class: 'card stack', style: { '--gap': '0.5rem' } },
          h('h3', { class: 'card__title' }, 'Título de la tarjeta'),
          h('p', null, 'Contenido agrupado en una superficie con borde y sombra suave.')))));
  }

  function steps() {
    return section('pasos', 'Bloque de pasos',
      h('article', { class: 'step-block' },
        h('header', { class: 'step-block__head' }, h('h3', { class: 'step-block__title' }, 'Primera iteración'), h('span', { class: 'step-block__n' }, 'n = 0')),
        h('div', { class: 'step-block__body' },
          h('p', null, T`Por Taylor de grado 2, si $n=0$ entonces:`),
          h('div', { class: 'formula' }, T`$$y_1 = y_0 + h\,y_0' + \frac{h^2}{2!}\,y_0''$$`),
          h('p', null, 'Reemplazando cada valor:'),
          h('div', { class: 'formula' }, T`$$y_1 = 1 + 0.1\,[2\cdot 1\cdot 1] + \frac{0.1^2}{2!}\,[2\cdot 1 + 4\cdot 1^2\cdot 1] = 1.23$$`),
          h('p', null, h('mark', { class: 'hl' }, T`$y_1 = 1.23 = y(x_1) = y(1.1)$`)),
          h('p', { class: 'step-block__note' }, T`Esto se lee así: el valor de $y_1$ es igual al valor de $y$ evaluado en el punto $x_1$, y como $x_1 = x_0 + h$ entonces $x_1 = 1 + 0.1 = 1.1$.`))));
  }

  function tables() {
    return section('tablas', 'Tablas',
      h('div', { class: 'stack' },
        numbersTable(),
        h('p', { class: 'muted' }, 'La tabla es ancha a propósito: en pantallas angostas se desplaza dentro de su contenedor y la página no se desborda.')));
  }

  function controls() {
    const ids = { f: uid('f'), err: uid('err'), method: uid('m'), note: uid('n'), h: uid('h'), fmt: uid('fmt') };
    const output = h('output', { class: 'num', for: ids.h }, '0.10');
    return section('controles', 'Controles',
      h('div', { class: 'stack' },
        demo('Botones',
          h('div', { class: 'cluster' },
            h('button', { class: 'btn', type: 'button', 'data-variant': 'primary' }, 'Resolver'),
            h('button', { class: 'btn', type: 'button' }, 'Restablecer'),
            h('button', { class: 'btn', type: 'button', 'data-variant': 'ghost' }, 'Cancelar'),
            h('button', { class: 'btn', type: 'button', 'data-size': 'sm' }, 'Pequeño'),
            h('button', { class: 'btn', type: 'button', disabled: true }, 'Deshabilitado'),
            h('button', { class: 'btn', type: 'button', 'aria-busy': 'true' }, 'Calculando'),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ayuda', title: 'Solo icono' }, icon('help')))),
        demo('Grupo de botones y control segmentado',
          h('div', { class: 'cluster' },
            h('div', { class: 'btn-group', role: 'group', 'aria-label': 'Paso' },
              h('button', { class: 'btn', type: 'button' }, 'Anterior'), h('button', { class: 'btn', type: 'button' }, 'Siguiente')),
            h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Formato de los valores' },
              ['Redondeo', 'Truncado'].map((label, i) => h('label', null,
                h('input', { type: 'radio', name: ids.fmt, checked: i === 0, value: label }), h('span', null, label)))))),
        demo('Campos',
          h('div', { class: 'grid' },
            h('div', { class: 'field' },
              h('label', { class: 'field__label', for: ids.f }, 'Ecuación f(x, y)'),
              h('input', { class: 'input', id: ids.f, type: 'text', 'data-mono': true, value: '2*x*y', autocomplete: 'off', spellcheck: 'false' }),
              h('p', { class: 'field__hint' }, 'Use * para multiplicar y ^ para potencias.')),
            h('div', { class: 'field' },
              h('label', { class: 'field__label', for: ids.err }, 'Ecuación con error'),
              h('input', { class: 'input', id: ids.err, type: 'text', 'data-mono': true, value: '2*x*', 'aria-invalid': 'true', 'aria-describedby': `${ids.err}-msg` }),
              h('p', { class: 'field__error', id: `${ids.err}-msg` }, icon('alert'), h('span', null, 'La expresión está incompleta: falta un operando después de «*».'))),
            h('div', { class: 'field' },
              h('label', { class: 'field__label', for: ids.method }, 'Método'),
              h('select', { class: 'select', id: ids.method }, METHOD_LABELS.slice(0, 4).map(([id, label]) => h('option', { value: id }, label)))),
            h('div', { class: 'field' },
              h('label', { class: 'field__label', for: ids.note }, 'Campo deshabilitado'),
              h('input', { class: 'input', id: ids.note, type: 'text', value: 'No editable', disabled: true })))),
        demo('Casillas y deslizador',
          h('div', { class: 'grid' },
            h('fieldset', { class: 'sg-fieldset' }, h('legend', { class: 'field__label' }, 'Métodos a comparar'),
              h('div', { class: 'stack', style: { '--gap': '0.25rem' } }, METHOD_LABELS.slice(0, 4).map(([id, label], i) => h('label', { class: 'checkbox' },
                h('input', { type: 'checkbox', checked: i !== 0 }), h('span', { class: 'method-chip', 'data-method': id }, label))))),
            h('div', { class: 'field' },
              h('label', { class: 'field__label', for: ids.h }, 'Paso h'),
              h('input', {
                class: 'range', id: ids.h, type: 'range', min: '0.01', max: '0.5', step: '0.01', value: '0.1',
                oninput: (event) => { output.textContent = Number(event.target.value).toFixed(2); },
              }),
              output)))));
  }

  function navigation() {
    const tabs = tabset([
      { id: 'a', label: 'Fórmula', content: h('p', null, T`Contenido de la primera pestaña: $y_{n+1} = y_n + h\,y_n'$.`) },
      { id: 'b', label: 'Geometría', content: h('p', null, 'Contenido de la segunda pestaña.') },
      { id: 'c', label: 'Costo', content: h('p', null, 'Contenido de la tercera pestaña.') },
    ], { label: 'Ejemplo de pestañas' });
    return section('navegacion', 'Pestañas y detalles',
      h('div', { class: 'stack' },
        tabs,
        h('details', { class: 'disclosure' },
          h('summary', null, 'Detalle desplegable'),
          h('div', { class: 'disclosure__body' }, h('p', null, 'Contenido que se muestra al abrir el detalle.'))),
        h('p', null, 'Teclas: ', h('kbd', { class: 'kbd' }, 'P'), ' ', h('kbd', { class: 'kbd' }, '?'), ' ', h('kbd', { class: 'kbd' }, 'Esc'))));
  }

  function layout() {
    const box = (text) => h('div', { class: 'card', 'data-tone': 'flat' }, text);
    return section('layout', 'Layout y estados',
      h('div', { class: 'stack' },
        demo('.grid', h('div', { class: 'grid' }, box('Uno'), box('Dos'), box('Tres'))),
        demo('.cluster', h('div', { class: 'cluster' }, box('Uno'), box('Dos'), box('Tres'))),
        demo('Estado vacío', h('div', { class: 'empty' }, h('p', null, 'Todavía no hay resultados.'), h('p', { class: 'muted' }, 'Ingrese una ecuación y elija «Resolver».'))),
        demo('Texto de respaldo cuando KaTeX no está disponible', h('p', null, h('code', { class: 'tex-fallback' }, 'y_{n+1} = y_n + h f(x_n, y_n)'))),
        demo('Solo para lectores de pantalla', h('p', { class: 'muted' }, 'Hay un texto invisible a continuación (clase sr-only).', h('span', { class: 'sr-only' }, ' Este texto solo se anuncia con lector de pantalla.')))));
  }

  function render(page, ctx) {
    page.appendChild(h('div', { class: 'stack sg' },
      h('header', { class: 'stack', style: { '--gap': '0.5rem' } },
        h('h1', null, 'Guía de estilo'),
        h('p', { class: 'lead' }, 'Ruta interna para revisar los componentes compartidos. No forma parte del contenido entregado.'),
        h('nav', { 'aria-label': 'Secciones de la guía', class: 'sg-toc' },
          h('ul', { class: 'cluster', role: 'list' }, SECTIONS.map(([id, label]) => h('li', null, h('a', { href: `#/_ui/${id}` }, label)))))),
      typography(), colors(), blocks(), steps(), tables(), controls(), navigation(),
      section('graficos', 'Gráficos', chartDemo(ctx)),
      layout()));
    EDO.tex.hydrate(page);
  }

  EDO.app.registerPage('_ui', { title: 'Guía de estilo', render });
}(typeof window !== 'undefined' ? window : this));
