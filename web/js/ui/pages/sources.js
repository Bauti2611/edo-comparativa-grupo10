/**
 * Page 'fuentes': the course documents (cited verbatim), software and licences, how the numbers were verified,
 * scope and criteria, and the delivered version.
 *
 * Nothing here is invented: the quoted strings are the ones printed in the course PDFs (odd/tasks/
 * edo-web-comparativa.md, section 5.9), the versions and the date come from EDO.config, and the members are listed only when
 * `EDO.config.members` has names in it. Sections have the ids `fuentes-<name>` so that `#/fuentes/<name>` scrolls to them.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h } = EDO.dom;
  const cfg = EDO.config;

  /** Verbatim strings of the course documents. Do not retype them: the accents and signs are part of the quote. */
  const COURSE = Object.freeze({
    header: 'Cátedras de Modelos Numéricos, Análisis Numérico y Cálculo Avanzado - U.T.N. Facultad Regional La Plata',
    author: 'Apunte creado por Ing. Amiconi Diego Federico',
    docs: Object.freeze([
      {
        title: 'Ejercicios resueltos. Tema: Ecuaciones Diferenciales Ordinarias (EDO´s): Problemas de valor Inicial',
        role: 'Ejemplos resueltos.',
        text: 'Cuatro problemas de valor inicial resueltos paso a paso con Taylor, Euler, Euler Mejorado y Runge-Kutta de grado 2. De aquí salen las definiciones de los métodos, la notación y el formato de los ejercicios resueltos.',
      },
      {
        title: 'Práctica de Ecuaciones Diferenciales Ordinarias (Problemas de Valor Inicial)',
        role: 'Práctica de PVI.',
        text: 'Ejercicios con los métodos de Taylor, de Euler y de Euler Mejorado. Forman parte del banco de ejercicios del sitio.',
      },
      {
        title: 'Práctica de Ecuaciones Diferenciales Ordinarias (2º Parte) y Problemas de Contorno',
        role: 'Práctica, segunda parte.',
        text: 'Se usan sus ejercicios de valor inicial con Runge-Kutta de segundo orden. Los problemas de contorno de esta práctica quedan fuera de este trabajo.',
      },
    ]),
  });

  const SECTIONS = Object.freeze([
    ['catedra', 'Fuentes de la cátedra'],
    ['software', 'Software y licencias'],
    ['verificacion', 'Cómo se verificó'],
    ['alcance', 'Alcance y criterios'],
    ['version', 'Versión'],
  ]);

  /** Title of a section by its id. */
  const titleOf = (id) => SECTIONS.find((entry) => entry[0] === id)[1];

  const section = (id, title, ...content) => h('section', {
    id: `fuentes-${id}`, class: 'sources-section', 'aria-labelledby': `fuentes-${id}-title`,
  }, h('h2', { id: `fuentes-${id}-title` }, title), content);

  const list = (items) => h('ul', null, items.map((item) => h('li', null, item)));

  /* ---- Sections ------------------------------------------------------------------------------------ */

  function courseSources() {
    return section('catedra', titleOf('catedra'),
      h('div', { class: 'prose' },
        h('p', null, 'Los métodos, la notación y los ejemplos de este sitio siguen tres documentos de las cátedras. Se citan tal como figuran en ellos.')),
      h('div', { class: 'callout', 'data-kind': 'note' },
        h('p', { class: 'callout__label' }, 'Citas textuales'),
        h('dl', { class: 'sources-quotes' },
          h('dt', null, 'Encabezado de los documentos'),
          h('dd', null, `«${COURSE.header}»`),
          h('dt', null, 'Autoría del apunte'),
          h('dd', null, `«${COURSE.author}»`))),
      h('dl', { class: 'sources-docs' }, COURSE.docs.map((doc) => h('div', { class: 'sources-doc' },
        h('dt', null, h('cite', null, doc.title)),
        h('dd', null, h('strong', null, doc.role), ' ', doc.text)))),
      h('p', { class: 'muted' }, 'Los documentos no llevan fecha impresa. El encabezado de la práctica de problemas de valor inicial omite «Análisis Numérico».'));
  }

  function software() {
    const deps = cfg.deps;
    const where = deps.vendored
      ? 'desde copias locales de la carpeta vendor o, si faltan, desde la red de distribución jsDelivr'
      : 'desde la red de distribución jsDelivr';
    return section('software', titleOf('software'),
      h('div', { class: 'prose' },
        list([
          [h('strong', null, 'KaTeX'), ' ', h('span', { class: 'num' }, deps.katex), ' · licencia MIT. Muestra las fórmulas.'],
          [h('strong', null, 'Chart.js'), ' ', h('span', { class: 'num' }, deps.chart), ' · licencia MIT. Dibuja los gráficos.'],
          [h('strong', null, 'chartjs-plugin-zoom'), ' ', h('span', { class: 'num' }, deps.zoom), ' · licencia MIT. Permite acercar la figura del paso.'],
          [h('strong', null, 'Hammer.js'), ' ', h('span', { class: 'num' }, deps.hammer), ' · licencia MIT. Reconoce el gesto de pinza de ese acercamiento.'],
          [h('strong', null, 'Public Sans'), ' · licencia SIL Open Font License 1.1. Es la tipografía del texto.'],
        ]),
        h('p', null, `Estas bibliotecas se cargan ${where}. Si no están disponibles, el sitio sigue funcionando: las fórmulas se muestran como texto TeX, los gráficos como tablas y la figura del paso se dibuja sin sus controles de acercamiento. Public Sans se carga desde Google Fonts; sin ella se usa la tipografía del sistema.`),
        h('p', null, 'Los métodos numéricos, el analizador de expresiones y la derivación simbólica son código propio, sin bibliotecas externas y sin evaluación dinámica de código.')));
  }

  function verification() {
    return section('verificacion', titleOf('verificacion'),
      h('div', { class: 'prose' },
        h('p', null, 'Los números del sitio salen de un único motor de cálculo, que se comprobó de cuatro maneras:'),
        list([
          'Pruebas automáticas del motor numérico (analizador de expresiones, derivación simbólica, formato de los números y los cuatro métodos), que se ejecutan con Node.js.',
          'Reproducción de los cuatro ejemplos resueltos del apunte y de los ejercicios de las prácticas de PVI, recalculados con precisión completa. Cuando un problema no tiene solución en forma cerrada, la verificación usa una referencia numérica (RK4 con paso $h/200$), rotulada como «referencia». Las soluciones exactas se comprobaron derivándolas y verificando la condición inicial.',
          'Comprobación independiente: las cifras principales se recalcularon con un programa aparte, en aritmética de alta precisión, y coinciden con las del sitio hasta el error de redondeo de la doble precisión.',
          'Constantes del error de un paso y órdenes de convergencia comprobados numéricamente. El orden observado se mide reduciendo el paso a la mitad: resulta 1 para Euler y 2 para Taylor de grado 2, Euler Mejorado y RK2.',
        ])));
  }

  function scope() {
    return section('alcance', titleOf('alcance'),
      h('div', { class: 'prose' },
        list([
          [h('strong', null, 'Nomenclatura.'), ' Euler Mejorado es el método de Heun (trapecio con predictor de Euler) y RK2 es Runge-Kutta de grado 2 en su forma de punto medio, como los define el apunte. La nomenclatura varía de un libro a otro (por ejemplo, «Euler modificado» o «polígono mejorado»): aquí se sigue la del apunte.'],
          [h('strong', null, 'Grado y orden.'), ' El apunte dice «grado 2» y la práctica de la segunda parte dice «2º orden» para el mismo método de Runge-Kutta. Taylor se presenta solo de grado 2, el único del curso; cuando una consigna dice solo «método de Taylor», se asume grado 2. Los grados 3 y 4 son una Ampliación y están rotulados así.'],
          [h('strong', null, 'Formato de los valores.'), ' Los valores se muestran truncados a 4 decimales, como en el apunte; también se puede elegir redondeo. Los cálculos se hacen siempre con precisión completa: el formato se aplica solo al mostrar.'],
          [h('strong', null, 'Lo que agrega este trabajo.'), ' Las soluciones exactas y las referencias, los errores, el orden de convergencia, la estabilidad y el costo no figuran en el apunte: se rotulan «Verificación» o «Ampliación».'],
          [h('strong', null, 'Fuera de alcance.'), ' Problemas de contorno, sistemas y ecuaciones de orden superior, métodos de paso múltiple, y métodos para problemas rígidos o con paso adaptativo.'],
        ])));
  }

  function version(app) {
    const members = Array.isArray(cfg.members) ? cfg.members.filter(Boolean) : [];
    return section('version', titleOf('version'),
      h('div', { class: 'prose' },
        h('p', null, h('strong', { class: 'num' }, `Versión ${cfg.version}`), ` · ${app.formatDateEs(cfg.buildDate)}`),
        h('p', null, 'La versión que se presenta es la versión entregada: el contenido que se expone es el mismo que se envió previamente.'),
        members.length ? h('p', null, `Integrantes del grupo ${cfg.group.number}: ${members.join(', ')}.`) : null));
  }

  /* ---- Page ----------------------------------------------------------------------------------------- */

  function render(page) {
    page.appendChild(h('div', { class: 'stack sources' },
      h('header', { class: 'stack', style: { '--gap': '0.75rem' } },
        h('h1', null, 'Fuentes'),
        h('p', { class: 'lead' }, 'Fuentes consultadas, software utilizado y verificaciones realizadas.'),
        h('nav', { 'aria-label': 'En esta página', class: 'sources__toc' },
          h('ul', { class: 'cluster', role: 'list' }, SECTIONS.map(([id, label]) => h('li', null, h('a', { href: `#/fuentes/${id}` }, label)))))),
      courseSources(), software(), verification(), scope(), version(EDO.app)));
    EDO.tex.hydrate(page);
  }

  EDO.app.registerPage('fuentes', {
    title: 'Fuentes',
    nav: { label: 'Fuentes', order: 70 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
