'use strict';
/**
 * Inicio page: the pure module (home/model.js) - the comparative question, the PVI that threads the site with its
 * provenance, the guiding question and the optional members line.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../js/ui/pages/home/model.js');

describe('home model: content', () => {
  it('asks the guiding question in inline TeX', () => {
    assert.equal(M.QUESTION, '¿Cómo damos un paso de $x_n$ a $x_{n+1}$?');
  });

  it('states the comparative question the group was assigned, and where it is answered', () => {
    const t = M.THESIS;
    assert.match(t.question, /^¿Cuál de los tres métodos de segundo orden/);
    assert.equal(t.body.length, 2);
    assert.match(t.body[0], /O\(h\^2\)/);
    assert.match(t.body[0], /Taylor de grado 2/);
    assert.match(t.body[0], /Euler Mejorado y RK2/);
    assert.deepEqual(t.links.map((l) => l.href), ['#/comparativa', '#/ejercicios']);
    t.links.forEach((l) => assert.ok(l.label.length > 10, l.href));
  });

  it('names the PVI that threads the site and where the cátedra uses it', () => {
    const c = M.CASE;
    assert.equal(c.preset, 'a1');
    const text = c.body.join(' ');
    assert.match(text, /Ejemplo 1/);
    assert.match(text, /Ejemplo 4/);
    assert.match(text, /Pr\u00e1ctica 05/);
    assert.match(text, /Pr\u00e1ctica 06/);
  });

  it('lists the members the group configured', () => {
    assert.equal(M.membersText([]), null);
    assert.equal(M.membersText(undefined), null);
    assert.equal(M.membersText(['Ana Pérez', ' ', 'Luis Gómez']), 'Ana Pérez · Luis Gómez');
    assert.equal(
      M.membersText(require('../js/config.js').members),
      'Bautista Biscayart · Santino Maya · Milagros Belén Olivera · Zoe Ramljak',
    );
  });

  it('leaves no stub marker on the page', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'pages', 'home.js'), 'utf8');
    assert.ok(!source.includes('Sección en preparación'));
    assert.ok(!source.includes('data-stub'));
  });
});
