'use strict';
/**
 * EDO.config (the editable facts of the deliverable) and the integrity of the page shell that loads it:
 * script order, referenced files, registered pages and the storage key shared with the inline script.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WEB_ROOT } = require('./helpers.js');

const read = (...parts) => fs.readFileSync(path.join(WEB_ROOT, ...parts), 'utf8');
const config = require(path.join(WEB_ROOT, 'js', 'config.js'));
const prefs = require(path.join(WEB_ROOT, 'js', 'ui', 'prefs.js'));
const route = require(path.join(WEB_ROOT, 'js', 'ui', 'route.js'));
const problems = require(path.join(WEB_ROOT, 'js', 'numerics', 'problems.js'));
const methods = require(path.join(WEB_ROOT, 'js', 'numerics', 'methods.js'));

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NAV_PAGES = ['inicio', 'teoria', 'ejercicios', 'simulador', 'comparativa', 'audiencia', 'fuentes'];

describe('EDO.config', () => {
  it('has a semantic version and a valid ISO build date', () => {
    assert.match(config.version, /^\d+\.\d+\.\d+$/);
    assert.match(config.buildDate, /^\d{4}-\d{2}-\d{2}$/);
    const date = new Date(`${config.buildDate}T00:00:00Z`);
    assert.equal(date.toISOString().slice(0, 10), config.buildDate);
  });

  it('carries the group facts exactly as given in the brief', () => {
    assert.deepEqual({ ...config.group }, {
      number: 10,
      course: 'Cátedras de Modelos Numéricos, Análisis Numérico y Cálculo Avanzado',
      school: 'U.T.N. Facultad Regional La Plata',
      round: 'Ronda 3: Ecuaciones Diferenciales Ordinarias (PVI)',
      topic: 'Comparativa de los métodos: Taylor, Euler Mejorado y RK2',
      dateISO: '2026-10-19',
      dateLabel: 'Lunes 19 de octubre de 2026',
      slot: 6,
    });
    assert.deepEqual([...config.professors], ['Ing. Diego Amiconi', 'Germán Céspedes']);
  });

  it('keeps dateLabel consistent with dateISO (weekday, day and month)', () => {
    const [year, month, day] = config.group.dateISO.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    assert.equal(config.group.dateLabel, `${weekday} ${day} de ${MONTHS[month - 1]} de ${year}`);
  });

  it('lists the four members of the group, in the order they expose', () => {
    assert.deepEqual([...config.members], [
      'Bautista Biscayart',
      'Santino Maya',
      'Milagros Belén Olivera',
      'Zoe Ramljak',
    ]);
    config.members.forEach((name) => {
      assert.equal(typeof name, 'string');
      assert.ok(name.length > 0 && name === name.trim(), JSON.stringify(name));
    });
  });

  it('has an editable talk length and an agenda whose shares add up to 1', () => {
    assert.ok(Number.isInteger(config.talk.minutes) && config.talk.minutes > 0);
    const ids = config.talk.agenda.map((item) => item.id);
    assert.deepEqual(ids, ['inicio', 'teoria', 'ejercicios', 'simulador', 'comparativa', 'audiencia']);
    assert.equal(new Set(ids).size, ids.length);
    config.talk.agenda.forEach((item) => {
      assert.equal(typeof item.label, 'string');
      assert.ok(item.label.length > 0);
      assert.ok(item.share > 0 && item.share < 1, `${item.id}: ${item.share}`);
      assert.ok(NAV_PAGES.includes(item.id), item.id);
    });
    const total = config.talk.agenda.reduce((sum, item) => sum + item.share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `shares add up to ${total}`);
  });

  it('pins the dependency versions the project allows', () => {
    assert.equal(typeof config.deps.vendored, 'boolean');
    assert.equal(typeof config.deps.fonts, 'boolean');
    assert.match(config.deps.katex, /^0\.16\.\d+$/);
    assert.match(config.deps.chart, /^4\.\d+\.\d+$/);
    // chartjs-plugin-zoom and the Hammer.js its pinch gesture needs, both pinned to an exact version.
    assert.match(config.deps.zoom, /^2\.\d+\.\d+$/);
    assert.match(config.deps.hammer, /^2\.\d+\.\d+$/);
  });

  it('keeps the verification of the apunte off by default', () => {
    assert.equal(config.apunte.mostrarVerificacion, false);
  });

  it('points every example of the apunte at a preset and a method that exist, with its published values', () => {
    const keys = Object.keys(config.apunte.examples);
    assert.deepEqual(keys, ['ej1', 'ej2', 'ej3', 'ej4']);
    keys.forEach((key) => {
      const example = config.apunte.examples[key];
      const preset = problems.byId(example.preset);
      assert.ok(preset, `${key}: unknown preset ${example.preset}`);
      assert.equal(preset.group, 'amiconi', key);
      assert.ok(methods.byId(example.method), `${key}: unknown method ${example.method}`);
      assert.equal(example.method, preset.method, `${key}: the method is the one the apunte uses`);
      // One published value per iteration of the example, all finite and written with at most 4 decimals.
      assert.equal(example.published.length, preset.N, key);
      example.published.forEach((value) => {
        assert.ok(Number.isFinite(value), `${key}: ${value}`);
        assert.match(String(value), /^\d+(\.\d{1,4})?$/, `${key}: ${value}`);
      });
    });
  });

  it('is frozen except for the parts that are edited or adjusted at runtime', () => {
    assert.ok(Object.isFrozen(config));
    assert.ok(Object.isFrozen(config.group));
    assert.ok(Object.isFrozen(config.professors));
    assert.ok(Object.isFrozen(config.deps));
    assert.ok(!Object.isFrozen(config.talk));
    // The group flips `apunte.mostrarVerificacion` in this file, and the tests flip it to check the rendered line.
    assert.ok(!Object.isFrozen(config.apunte));
  });

  it('loads as a classic script (no module system) and attaches EDO.config', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(read('js', 'config.js'), sandbox, { filename: 'config.js' });
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.EDO.config)), JSON.parse(JSON.stringify(config)));
  });
});

describe('index.html shell', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]);

  it('declares the language, the charset (early) and the viewport', () => {
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="es"/);
    assert.ok(html.indexOf('<meta charset="utf-8">') > -1 && html.indexOf('<meta charset="utf-8">') < 1024);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/);
  });

  it('references only local files that exist, as classic scripts', () => {
    assert.ok(scripts.length > 20);
    [...scripts, ...styles].forEach((file) => {
      assert.ok(!/^[a-z]+:\/\//i.test(file), `${file} must be local (CDN loading lives in deps.js)`);
      assert.ok(fs.existsSync(path.join(WEB_ROOT, file)), `${file} does not exist`);
    });
    assert.doesNotMatch(html, /type="module"/);
    assert.doesNotMatch(html, /\b(?:defer|async)\b[^>]*src=/);
  });

  it('loads scripts in the documented order', () => {
    const order = [
      'js/config.js', 'js/deps.js',
      'js/numerics/expr.js', 'js/numerics/format.js', 'js/numerics/problems.js', 'js/numerics/methods.js', 'js/numerics/analysis.js',
      'js/ui/bus.js', 'js/ui/prefs.js', 'js/ui/route.js', 'js/ui/dom.js', 'js/ui/tex.js', 'js/ui/charts.js', 'js/ui/step-diagram.js',
      'js/ui/steps-model.js', 'js/ui/steps.js', 'js/ui/agenda.js', 'js/ui/app.js',
    ];
    assert.deepEqual(scripts.slice(0, order.length), order);
    const pages = scripts.slice(order.length, -1);
    assert.ok(pages.length >= 8 && pages.every((file) => file.startsWith('js/ui/pages/')), pages.join(', '));
    assert.equal(scripts[scripts.length - 1], 'js/ui/start.js');
  });

  it('loads the stylesheets as tokens, base, components and pages', () => {
    assert.deepEqual(styles, ['css/tokens.css', 'css/base.css', 'css/components.css', 'css/pages.css']);
  });

  it('has the landmarks, the skip link and the placeholders the shell needs', () => {
    assert.match(html, /<a class="skip-link" href="#app">Saltar al contenido<\/a>/);
    ['<header class="site-header" id="site-header">', '<nav class="site-nav" id="site-nav" aria-label="Secciones">',
      '<main id="app" class="app container" tabindex="-1">', '<footer class="site-footer">',
      'id="route-announcer"', 'aria-live="polite"', 'id="theme-btn"', 'id="mode-btn"', 'id="help-btn"', 'id="menu-btn"',
    ].forEach((fragment) => assert.ok(html.includes(fragment), fragment));
    assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
  });

  it('uses the same storage key as prefs.js in the inline pre-paint script', () => {
    assert.ok(html.includes(`'${prefs.STORAGE_KEY}'`), prefs.STORAGE_KEY);
    assert.match(html, /setAttribute\('data-theme'/);
    assert.match(html, /setAttribute\('data-mode'/);
    assert.match(html, /setAttribute\('data-scheme'/);
  });
});

describe('page registry', () => {
  const pagesDir = path.join(WEB_ROOT, 'js', 'ui', 'pages');
  const registered = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.js')).flatMap((file) => {
    const source = fs.readFileSync(path.join(pagesDir, file), 'utf8');
    const match = /registerPage\('([^']+)',\s*\{([\s\S]*?)\}\);/.exec(source);
    assert.ok(match, `${file} registers a page`);
    const nav = /nav:\s*\{\s*label:\s*'([^']+)',\s*order:\s*(\d+)/.exec(match[2]);
    return [{ file, id: match[1], label: nav && nav[1], order: nav && Number(nav[2]) }];
  });

  it('registers the seven sections plus the hidden style guide, all known to the router', () => {
    assert.deepEqual(registered.map((p) => p.id).sort(), [...NAV_PAGES, '_ui'].sort());
    registered.forEach((p) => assert.ok(route.PAGES.includes(p.id), p.id));
  });

  it('labels and orders the navigation as specified, and keeps the style guide out of it', () => {
    const nav = registered.filter((p) => p.label).sort((a, b) => a.order - b.order);
    assert.deepEqual(nav.map((p) => p.label), ['Inicio', 'Teoría', 'Ejercicios', 'Simulador', 'Comparativa', 'Audiencia', 'Fuentes']);
    assert.deepEqual(nav.map((p) => p.id), NAV_PAGES);
    assert.equal(registered.find((p) => p.id === '_ui').label, null);
  });
});
