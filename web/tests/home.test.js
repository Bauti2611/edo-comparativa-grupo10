'use strict';
/**
 * Inicio page: the pure module (home/model.js) - the guiding question, the agenda with its time budget computed from
 * config.talk (and from the minutes edited by the user), the section cards and the optional members line.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../js/ui/pages/home/model.js');
const config = require('../js/config.js');
const route = require('../js/ui/route.js');

const NAV_PAGES = ['inicio', 'teoria', 'ejercicios', 'simulador', 'comparativa', 'audiencia', 'fuentes'];

describe('home model: agenda', () => {
  it('follows the order and labels of config.talk.agenda', () => {
    const a = M.agenda(20, config.talk.agenda);
    assert.deepEqual(a.rows.map((r) => r.id), config.talk.agenda.map((x) => x.id));
    assert.deepEqual(a.rows.map((r) => r.label), config.talk.agenda.map((x) => x.label));
    assert.deepEqual(a.rows.map((r) => r.n), [1, 2, 3, 4, 5, 6]);
  });

  it('budgets the minutes by share and adds up to the total, for the placeholder and for an edited length', () => {
    [config.talk.minutes, 13, 30].forEach((minutes) => {
      const a = M.agenda(minutes, config.talk.agenda);
      assert.equal(a.minutes, minutes);
      assert.equal(a.rows.reduce((s, r) => s + r.seconds, 0), minutes * 60);
    });
    const a = M.agenda(20, config.talk.agenda);
    assert.deepEqual(a.rows.map((r) => r.duration), ['2 min', '5 min', '4 min', '4 min', '3 min', '2 min']);
    assert.equal(a.rows[0].window, '00:00–02:00');
    assert.equal(a.rows[5].window, '18:00–20:00');
    assert.equal(a.totalText, '20 min');
  });

  it('gives every row a share for the proportional bar (adding up to 1)', () => {
    const a = M.agenda(15, config.talk.agenda);
    assert.ok(Math.abs(a.rows.reduce((s, r) => s + r.fraction, 0) - 1) < 1e-12);
  });

  it('links each row to its section, and lists the sections outside the agenda apart', () => {
    const a = M.agenda(20, config.talk.agenda);
    a.rows.forEach((r) => assert.equal(r.href, route.build(r.id)));
    assert.deepEqual(a.extras.map((r) => r.id), ['fuentes']);
    assert.equal(a.extras[0].href, '#/fuentes');
  });
});

describe('home model: content', () => {
  it('describes every navigable section in one line', () => {
    NAV_PAGES.forEach((id) => {
      const d = M.SECTIONS[id];
      assert.ok(d && typeof d.description === 'string' && d.description.length > 20, id);
      assert.ok(!/\n/.test(d.description), id);
    });
  });

  it('asks the guiding question in inline TeX', () => {
    assert.equal(M.QUESTION, '¿Cómo damos un paso de $x_n$ a $x_{n+1}$?');
  });

  it('renders the members only when the group configured them', () => {
    assert.equal(M.membersText([]), null);
    assert.equal(M.membersText(undefined), null);
    assert.equal(M.membersText(['Ana Pérez', ' ', 'Luis Gómez']), 'Ana Pérez · Luis Gómez');
  });

  it('leaves no stub marker on the page', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'pages', 'home.js'), 'utf8');
    assert.ok(!source.includes('Sección en preparación'));
    assert.ok(!source.includes('data-stub'));
  });
});
