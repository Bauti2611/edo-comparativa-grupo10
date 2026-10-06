# Comparativa de métodos para PVI: Taylor, Euler Mejorado y RK2

Group 10, U.T.N. Facultad Regional La Plata. Interactive web app: theory, worked exercises, a simulator and a
comparison of the methods, all on one numerics engine. Static site: no build step, no bundler, no server.

> Stub written in task T1 (shell and design system). T8 completes it (deploy, version bump, final checks).

## Open it

- Double-click `web/index.html`. It works on `file://` (classic `<script>` tags only: ES modules and `fetch()` of
  local files are blocked by browsers on `file://`).
- Or publish the `web/` folder unchanged on any static host (GitHub Pages, Vercel...).
- Internet is optional. KaTeX 0.16.x and Chart.js 4.x load from the jsDelivr CDN; if that fails, formulas show as
  raw TeX and charts become data tables. To work fully offline, copy the libraries into `web/vendor/` (see below)
  and set `deps.vendored` to `true` in `js/config.js`.

## Run the tests

```
node --test web/tests/
```

Node 22 or later. The numerics (`js/numerics/`), `route.js`, `prefs.js`, `bus.js` and `config.js` are UMD files, so
the same code runs in the browser and under test.

## QA flags and shortcuts

Put the flags in the URL query, before the `#` route, for example `index.html?nocdn=1#/inicio`.

| Flag | Effect |
|---|---|
| `?nocdn=1` | Skips KaTeX, Chart.js and web fonts without making any request (tests the degraded mode). |
| `?theme=dark`, `light`, `auto` | Theme for this session only; never saved. |
| `?mode=projection`, `normal` | Projection mode for this session only; never saved. |

Keys: `P` toggles the projection mode, `?` opens the shortcut list, `←` and `→` change section (projection mode
only, never while typing in a field). The theme button cycles auto, light and dark; both choices are saved in
`localStorage` (key `edo.g10.prefs.v1`), with an in-memory fallback when storage is blocked.

The hidden route `#/_ui` is a living style guide that renders every shared component in all its variants.

## File map

```
web/
  index.html            shell: skip link, top bar, <main id="app">, footer, scripts in load order
  css/
    tokens.css          colours (light, dark, projection), type scale, spacing, motion, layout tokens
    base.css            reset, bare elements, focus ring, reduced motion, print
    components.css      shell + every shared component (.card, .callout, .hl, .formula, .step-block, ...)
    pages.css           page-level layout (Inicio title block, "El paso" slot, style guide)
  js/
    config.js           EDO.config: group data, version/date, talk agenda, dependency switches
    deps.js             EDO.deps: KaTeX / Chart.js / web font loader with fallback and ?nocdn=1
    numerics/           expr, format, problems, methods, analysis (pure logic, T2)
    ui/
      bus.js prefs.js route.js   pub/sub, saved preferences, hash parsing/building
      dom.js            h() element builder, icons, tabs (no innerHTML with user text)
      tex.js            KaTeX with a raw-TeX fallback
      charts.js         Chart.js wrapper with a data-table fallback and method styles
      app.js            router, page registry, theme, projection mode, nav bar, shortcuts, help
      pages/            one file per section (inicio, teoria, ejercicios, simulador, comparativa, audiencia,
                        fuentes) plus styleguide.js (#/_ui)
      start.js          starts the shell once every page has registered
  tests/                node:test suites (run with the command above)
```

## Writing a page

```js
EDO.app.registerPage('teoria', {
  title: 'Teoría',
  nav: { label: 'Teoría', order: 20 },          // omit `nav` to keep a page out of the bar
  render(root, ctx) {                            // ctx = { page, sub, query, signal }
    root.appendChild(EDO.dom.h('h1', null, 'Teoría'));
    EDO.tex.hydrate(root);                       // renders $...$, $$...$$, \(...\), \[...\]
  },
});
```

- Sub-route `#/teoria/rk2` scrolls to the element with id `teoria-rk2`.
- Link with plain anchors (`<a href="#/simulador?f=2*x*y&h=0.1">`); use `EDO.app.setQuery({...})` for shareable state.
- Load order of the scripts matters; add a new page file to `index.html` before `start.js`.
- Colours always come from the CSS tokens; a method keeps its colour, dash and marker everywhere
  (`EDO.charts.methodStyle(id)`, `.method-chip[data-method]`).

## Vendoring the libraries (optional, offline use)

Needs the group's decision (the files are downloaded from npm). Expected layout:

```
web/vendor/katex/{katex.min.css, katex.min.js, contrib/auto-render.min.js, fonts/*.woff2}
web/vendor/chart/chart.umd.min.js
```
