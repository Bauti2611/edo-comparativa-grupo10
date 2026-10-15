# Comparativa de métodos para PVI: Taylor, Euler Mejorado y RK2

Group 10, U.T.N. Facultad Regional La Plata. Interactive web app: theory, worked exercises, a simulator and a
comparison of the methods, all on one numerics engine. Static site: no build step, no bundler, no server.

Sections: Inicio (the assigned question, the PVI that threads the site and the hero "El paso"), Teoría (a recap: the recipe to solve an exercise by hand, then each
method), Comparativa (the assigned topic, so it carries the whole comparison: the four methods on one problem, order
of convergence, the constant of the local error, cost and precision, the linear case and the summary with the only
"¿Cuál elegir?" guide of the site), Ejercicios (the four solved examples of the apunte, a comparative case and the
practice bank), Simulador, Audiencia (quiz, prediction game, one step by hand) and Fuentes.

## Open it

- Double-click `web/index.html`. It works on `file://` (classic `<script>` tags only: ES modules and `fetch()` of
  local files are blocked by browsers on `file://`).
- Or publish the `web/` folder unchanged on any static host (GitHub Pages, Vercel...).
- Internet is optional. KaTeX 0.16.x, Chart.js 4.x and chartjs-plugin-zoom 2.x (with Hammer.js, for the pinch
  gesture) load from the jsDelivr CDN; if that fails, formulas show as raw TeX, charts become data tables and
  "El paso" is drawn without its zoom controls. To work fully offline, copy the libraries into `web/vendor/`
  (see below) and set `deps.vendored` to `true` in `js/config.js`.

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
| `?nocdn=1` | Skips KaTeX, Chart.js, the zoom plugin and web fonts without making any request (tests the degraded mode). |
| `?theme=dark`, `light`, `auto` | Theme for this session only; never saved. |
| `?mode=projection`, `normal` | Projection mode for this session only; never saved. |

Keys: `P` toggles the projection mode, `?` opens the shortcut list, `←` and `→` change section (projection mode
only, never while typing in a field). The theme button cycles auto, light and dark; both choices are saved in
`localStorage` (key `edo.g10.prefs.v1`), with an in-memory fallback when storage is blocked.

In the figure "El paso" (Inicio, Teoría and Comparativa) the end values of the four methods can be a handful of
pixels apart, so it can be zoomed in: **Ctrl + wheel** zooms (a plain wheel is left alone and keeps scrolling the
page), a **drag** selects the region to zoom to, two fingers **pinch**, and **Ctrl + drag** pans where there is no
touch pointer. The two buttons under the picture, "Ampliar el final del paso" and "Ver todo", do the same from the
keyboard and from a projector. The zoom goes back to the whole frame when the problem or `h` changes, and the
controls are not shown at all when chartjs-plugin-zoom did not load.

The hidden route `#/_ui` is a living style guide that renders every shared component in all its variants.

## File map

```
web/
  index.html            shell: skip link, top bar, <main id="app">, footer, scripts in load order
  css/
    tokens.css          colours (light, dark, projection), type scale, spacing, motion, layout tokens
    base.css            reset, bare elements, focus ring, reduced motion, print
    components.css      shell + every shared component (.card, .callout, .hl, .formula, .step-block, ...)
    pages.css           page-level layout, one delimited block per page
  js/
    config.js           EDO.config: group data, version/date, dependency switches
    deps.js             EDO.deps: KaTeX / Chart.js / zoom plugin / web font loader, with fallback and ?nocdn=1
    numerics/           expr, format, problems, methods, analysis (pure logic, T2)
    ui/
      bus.js prefs.js route.js   pub/sub, saved preferences, hash parsing/building
      dom.js            h() element builder, icons, tabs (no innerHTML with user text)
      tex.js            KaTeX with a raw-TeX fallback
      charts.js         Chart.js wrapper with a data-table fallback and method styles
      step-diagram.js   "El paso": one step drawn three ways on a slope field, zoomable (Inicio, Teoría, Comparativa)
      steps-model.js steps.js    step-by-step solutions in the cátedra's layout
      app.js            router, page registry, theme, projection mode, nav bar, shortcuts, help
      pages/            one file per section (home, theory, exercises, simulator, compare, audience, sources)
                        plus styleguide.js (#/_ui); a folder with the same name holds that page's modules
      start.js          starts the shell once every page has registered
  tests/                node:test suites (run with the command above)
    crosscheck/         independent 50-digit oracle and headless-browser QA (see its README)
```

## Publish it

The site is the `web/` folder as is; there is nothing to build.

- **Vercel:** import the repository, set *Root Directory* to `web`, framework preset *Other*, no build command and no
  output directory.
- **GitHub Pages:** Pages serves only the repository root or `/docs` from a branch, so either publish `web/` with a
  GitHub Actions workflow (`actions/upload-pages-artifact` with `path: web`) or copy its contents to `docs/`.
- Any other static host: upload the contents of `web/`.

## New version

Everything editable lives in `js/config.js`. Run `node --test web/tests/` afterwards.

| Item | What it does |
| --- | --- |
| `version`, `buildDate` | Semantic version and ISO date shown in the footer and in Fuentes. |
| `members` | The names listed on Inicio and in Fuentes. Nothing is rendered while the array is empty. |
| `apunte.mostrarVerificacion` | `false` by default; see below. |
| `deps.vendored` | `true` only after vendoring KaTeX, Chart.js and the zoom plugin (see the last section). |

### `apunte.mostrarVerificacion`

Under `apunte.examples`, `js/config.js` holds the values the apunte of the cátedra publishes for each of its four
worked examples. They are the only hand-typed numbers of the site: everything the pages show is recomputed by the
engine from the same preset and the same method, so each published value can be checked against it.

- `false` (the default): the site shows only its own computed values and says nothing about any difference.
- `true`: in the Ejercicios page, under the examples whose published value does not follow from the apunte's own
  expression, one neutral line is added — `Valor publicado en el apunte: X · Valor recalculado con la misma
  fórmula: Y`. The second number comes from the engine at runtime. Nothing else changes.

## How the numbers were verified

- `node --test web/tests/`: unit tests of the engine against the values of the apunte and the practice sheets, and of
  every page's pure module.
- `web/tests/crosscheck/`: an independent re-implementation in 50-digit arithmetic and a headless-browser QA run on
  `file://` (console errors, overflow at 360 to 1920 px, light, dark and projection modes, `?nocdn=1`).
- Two printed values of the apunte do not follow from its own expressions and are never shown as results: Ej. 2
  prints y₂ = 1.4297 (recomputed 1.042978) and Ej. 3 prints y₂ = 1.4843 (recomputed 1.390625). The site uses only the
  recomputed values; `apunte.mostrarVerificacion` decides whether it also names the published ones.

## Writing a page

```js
EDO.app.registerPage('teoria', {
  title: 'Teoría',
  nav: { label: 'Teoría', order: 20 },          // omit `nav` to keep a page out of the bar
  render(root, ctx) {                            // ctx = { page, sub, query, signal (aborts on leave) }
    root.appendChild(EDO.dom.h('h1', null, 'Teoría'));
    EDO.tex.hydrate(root);                       // renders $...$, $$...$$, \(...\), \[...\]
  },
});
```

- Sub-route `#/teoria/rk2` scrolls to the element with id `teoria-rk2`; the same holds for
  `#/comparativa/constantes` and the other sections of the Comparativa.
- Link with plain anchors (`<a href="#/simulador?f=2*x*y&h=0.1">`); use `EDO.app.setQuery({...})` for shareable state.
- Load order of the scripts matters; add a new page file to `index.html` before `start.js`.
- Colours always come from the CSS tokens; a method keeps its colour, dash and marker everywhere
  (`EDO.charts.methodStyle(id)`, `.method-chip[data-method]`).

## Vendoring the libraries (optional, offline use)

Needs the group's decision (the files are downloaded from npm). Expected layout:

```
web/vendor/katex/{katex.min.css, katex.min.js, contrib/auto-render.min.js, fonts/*.woff2}
web/vendor/chart/chart.umd.min.js
web/vendor/zoom/{hammer.min.js, chartjs-plugin-zoom.min.js}
```
