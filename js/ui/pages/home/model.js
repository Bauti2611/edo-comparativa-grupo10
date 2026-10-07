/**
 * EDO.home.model - the content of the Inicio page with no DOM: the guiding question, a one-line description of each
 * section and the agenda with its time budget (EDO.timer.plan over config.talk), plus the optional members line.
 *
 *   QUESTION                          the guiding question, inline TeX
 *   SECTIONS {id: {label, description}}   every navigable section
 *   agenda(minutes, talkAgenda) -> {minutes, totalText, rows[], extras[]}
 *     rows[]   {n, id, label, description, href, seconds, duration, window, fraction} in the order of the agenda
 *     extras[] the sections that are not part of the talk (Fuentes), same fields without the budget
 *   membersText(members) -> 'A · B' | null   null (render nothing) while config.members is empty
 *
 * Load order: after js/ui/timer.js; before home.js. Also `require`-able in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../timer.js'));
  } else {
    const EDO = (root.EDO = root.EDO || {});
    EDO.home = EDO.home || {};
    EDO.home.model = factory(EDO.timer);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (timer) {
  'use strict';

  const QUESTION = '¿Cómo damos un paso de $x_n$ a $x_{n+1}$?';

  const SECTIONS = Object.freeze({
    inicio: { label: 'Inicio', description: 'La pregunta que guía la exposición, el paso de cada método y la agenda.' },
    teoria: { label: 'Teoría', description: 'PVI, Taylor de grado 2, Euler Mejorado y RK2: deducción, fórmulas, error y costo.' },
    ejercicios: { label: 'Ejercicios', description: 'Los ejemplos resueltos del apunte, el caso comparativo y la práctica, paso a paso.' },
    simulador: { label: 'Simulador', description: 'Cualquier PVI con los cuatro métodos: tablas, gráficos y la resolución paso a paso.' },
    comparativa: { label: 'Comparativa', description: 'El mismo problema con los cuatro métodos: error, orden de convergencia y costo.' },
    audiencia: { label: 'Audiencia', description: 'Cuestionario, predicción y un paso resuelto a mano para comprobar lo aprendido.' },
    fuentes: { label: 'Fuentes', description: 'Material de la cátedra, bibliografía sugerida y cómo se verificaron los cálculos.' },
  });
  const ORDER = Object.freeze(['inicio', 'teoria', 'ejercicios', 'simulador', 'comparativa', 'audiencia', 'fuentes']);

  const hrefOf = (id) => `#/${id}`;

  function agenda(minutes, talkAgenda) {
    const p = timer.plan(minutes, talkAgenda);
    const rows = p.items.map((item, k) => ({
      n: k + 1,
      id: item.id,
      label: item.label,
      description: SECTIONS[item.id] ? SECTIONS[item.id].description : '',
      href: hrefOf(item.id),
      seconds: item.seconds,
      duration: timer.durationText(item.seconds),
      window: timer.windowText(item),
      fraction: p.totalSec > 0 ? item.seconds / p.totalSec : 0,
    }));
    const inAgenda = new Set(rows.map((r) => r.id));
    const extras = ORDER.filter((id) => !inAgenda.has(id))
      .map((id) => ({ id, label: SECTIONS[id].label, description: SECTIONS[id].description, href: hrefOf(id) }));
    return {
      minutes: p.totalSec / 60, totalText: timer.durationText(p.totalSec), rows, extras,
    };
  }

  function membersText(members) {
    const names = (Array.isArray(members) ? members : [])
      .filter((m) => typeof m === 'string' && m.trim())
      .map((m) => m.trim());
    return names.length ? names.join(' · ') : null;
  }

  return {
    QUESTION, SECTIONS, ORDER, agenda, membersText,
  };
}));
