/**
 * Page 'inicio': the title block from config, the hero "El paso" (the guiding question and the signature diagram of
 * js/ui/step-diagram.js), and the agenda: a proportional bar plus one card per section with its time budget,
 * computed from config.talk and the minutes edited here (stored in EDO.prefs 'talkMinutes').
 * Members are listed only when config.members has names. The content lives in home/model.js.
 *
 * Load order: after home/model.js (index.html).
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  const { h, uid } = EDO.dom;
  const cfg = EDO.config;
  const M = EDO.home.model;

  const TITLE = 'Comparativa de métodos para PVI: Taylor, Euler Mejorado y RK2';

  /** One "label: value" row of the metadata list; renders nothing when there is no value. */
  function metaRow(label, value) {
    if (!value) return null;
    return h('div', { class: 'meta-list__row' }, h('dt', null, label), h('dd', null, value));
  }

  const chip = (id, text) => h('span', { class: 'method-chip', 'data-method': id }, text);

  function titleBlock() {
    const g = cfg.group;
    return h('header', { class: 'title-block' },
      h('h1', { class: 'title-block__title' }, TITLE),
      h('p', { class: 'title-block__group' }, `Grupo ${g.number}`),
      h('p', { class: 'title-block__line' }, `${g.course} · ${g.school}`),
      h('p', { class: 'title-block__line' }, `${g.round} · ${g.dateLabel}`),
      h('dl', { class: 'meta-list' },
        metaRow('Docentes', (cfg.professors || []).join(' · ')),
        metaRow('Integrantes', M.membersText(cfg.members))));
  }

  function hero(signal) {
    const figure = h('div', { class: 'home-hero__figure' });
    const section = h('section', { class: 'home-hero', id: 'inicio-paso', 'aria-labelledby': 'inicio-paso-title' },
      h('div', { class: 'home-hero__lead' },
        h('p', { class: 'home-hero__eyebrow' }, 'El paso'),
        h('h2', { class: 'home-hero__question', id: 'inicio-paso-title' }, M.QUESTION),
        h('p', { class: 'home-hero__text' },
          'Todos los métodos parten del mismo punto $(x_n, y_n)$ y avanzan el mismo paso $h$. ',
          'Lo que cambia es la información que usan para estimar $y_{n+1}$:'),
        h('ul', { class: 'home-hero__ways' },
          h('li', null, chip('taylor', 'Taylor de grado 2'), h('span', null, 'sigue la curvatura: suma el término $\\tfrac{h^2}{2!}\\,y_n\'\'$.')),
          h('li', null, chip('heun', 'Euler Mejorado'), h('span', null, 'promedia la pendiente del inicio y la del final del paso.')),
          h('li', null, chip('rk2', 'RK2 (punto medio)'), h('span', null, 'usa la pendiente en el punto medio del paso.')))),
      figure,
      h('p', { class: 'home-hero__note' }, 'Mueva el control de $h$: con pasos grandes las tres construcciones se separan; con pasos chicos casi coinciden con la curva exacta.'));
    try {
      EDO.stepDiagram.mount(figure, { signal });
    } catch (err) {
      console.error(err);
      figure.appendChild(h('p', { class: 'chart-notice', role: 'status' }, 'No se pudo mostrar el diagrama.'));
    }
    return section;
  }

  function agendaSection(signal) {
    const inputId = uid('home-min');
    const bar = h('div', { class: 'home-agenda__bar', 'aria-hidden': 'true' });
    const list = h('ol', { class: 'home-agenda__list', role: 'list' });
    const extras = h('div', { class: 'home-agenda__extras' });
    const total = h('p', { class: 'home-agenda__total' });
    const input = h('input', {
      class: 'input home-agenda__input', id: inputId, type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': `${inputId}-hint`,
    });
    const error = h('p', { class: 'field__error', id: `${inputId}-error`, hidden: true }, 'Ingrese un número entero de minutos entre 1 y 240.');
    const restore = h('button', { class: 'btn', type: 'button', 'data-variant': 'ghost', 'data-size': 'sm' }, `Volver a ${cfg.talk.minutes} min`);

    const minutes = () => EDO.agenda.resolveMinutes(EDO.prefs.get('talkMinutes'), cfg.talk.minutes);

    function paint() {
      const a = M.agenda(minutes(), cfg.talk.agenda);
      const here = EDO.app.current();
      if (root.document.activeElement !== input) input.value = String(a.minutes);
      restore.hidden = a.minutes === cfg.talk.minutes;
      total.textContent = `${a.rows.length} partes, ${a.totalText} en total.`;
      bar.replaceChildren(...a.rows.map((r) => h('span', { class: 'home-agenda__seg', style: { '--f': String(r.fraction) } },
        h('span', { class: 'home-agenda__seg-n' }, String(r.n)),
        h('span', { class: 'home-agenda__seg-label' }, r.label))));
      list.replaceChildren(...a.rows.map((r) => {
        const isHere = here && here.page === r.id;
        const body = [
          h('span', { class: 'home-card__n', 'aria-hidden': 'true' }, String(r.n)),
          h('span', { class: 'home-card__main' },
            h('h3', { class: 'home-card__title' }, r.label),
            h('span', { class: 'home-card__desc' }, r.description)),
          h('span', { class: 'home-card__time' },
            h('span', { class: 'home-card__duration' }, r.duration),
            h('span', { class: 'home-card__window' }, h('span', { class: 'sr-only' }, 'del minuto '), r.window.replace('–', ' a ')),
            isHere ? h('span', { class: 'badge' }, 'Esta sección') : null),
        ];
        return h('li', null, isHere
          ? h('div', { class: 'home-card', 'data-here': 'true' }, body)
          : h('a', { class: 'home-card', href: r.href }, body));
      }));
      extras.replaceChildren(...a.extras.map((r) => h('p', { class: 'home-agenda__extra' },
        h('span', { class: 'muted' }, 'Fuera del tiempo de exposición: '), h('a', { href: r.href }, r.label), ` — ${r.description}`)));
    }

    function commit() {
      const m = EDO.agenda.parseMinutes(input.value);
      const bad = Number.isNaN(m);
      error.hidden = !bad;
      if (bad) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', `${inputId}-hint ${inputId}-error`);
        return;
      }
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', `${inputId}-hint`);
      input.value = String(m);
      EDO.prefs.set('talkMinutes', m);
    }

    input.addEventListener('change', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      }
    });
    restore.addEventListener('click', () => EDO.prefs.set('talkMinutes', null));
    const off = EDO.bus.on('prefs:change', (change) => { if (change && change.key === 'talkMinutes') paint(); });
    signal.addEventListener('abort', off, { once: true });

    const section = h('section', { class: 'home-agenda', id: 'inicio-agenda', 'aria-labelledby': 'inicio-agenda-title' },
      h('div', { class: 'home-agenda__head' },
        h('div', { class: 'stack', style: { '--gap': '0.35rem' } },
          h('h2', { id: 'inicio-agenda-title' }, 'Agenda'),
          total),
        h('div', { class: 'field home-agenda__field' },
          h('label', { class: 'field__label', for: inputId }, 'Duración de la exposición (minutos)'),
          h('div', { class: 'home-agenda__control' }, input, restore),
          h('p', { class: 'field__hint', id: `${inputId}-hint` }, 'El tiempo de cada parte se recalcula con el total.'),
          error)),
      bar, list, extras);
    paint();
    return section;
  }

  function render(page, ctx) {
    page.appendChild(h('div', { class: 'home' }, titleBlock(), hero(ctx.signal), agendaSection(ctx.signal)));
    EDO.tex.hydrate(page);
  }

  EDO.app.registerPage('inicio', {
    title: 'Inicio',
    nav: { label: 'Inicio', order: 10 },
    render,
  });
}(typeof window !== 'undefined' ? window : this));
