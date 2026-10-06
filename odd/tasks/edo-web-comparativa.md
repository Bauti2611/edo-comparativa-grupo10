# ODD feature: edo-web-comparativa

- Created: 2026-10-06 · Branch: `feat/edo-web-comparativa` (base `19c08be`, empty root commit) · Project: `edo_comparativa_taylor_euler_rk2-claude`
- Engram mirror: topic `odd/edo-web-comparativa/tasks` (full copy of this file; resync after every task)
- Status: IN PROGRESS · Current task: T2 · Next step: see section 13

## 1. Objective

Ship the Group 10 interactive web app in `web/` for **"Comparativa de los métodos: Taylor, Euler Mejorado y RK2"** (UTN FRLP, Análisis Numérico / Modelos Numéricos, Ronda 3 "Ecuaciones Diferenciales Ordinarias (PVI)", exposition Monday 2026-10-19, 6th slot). It must meet 100% of `Rubrica.pdf`; the web work is 30% of the grade. The user's brief is `PROMPT_Y_CONTEXTO.md`, which is truncated: only requirement 1 (ARQUITECTURA Y DISEÑO) exists. Everything else is derived from the rubric and the course PDFs.

Rubric text for the web item (verbatim target): "Sitio completamente funcional y navegable, con estructura clara. Presenta teoría correcta, procedimientos comprensibles, ejercicios resueltos paso a paso y fuentes consultadas. Se corresponde íntegramente con la versión entregada previamente." Other items the site should support: mastery of the topic by every member (25%), use of computing resources: simulators, demos, own data (15%), audience interaction: questions, checks of understanding (10%), time management (5%).

## 2. Problem and why

The group must present and defend a web deliverable that (a) is correct in its numerics and theory, (b) reproduces the cátedra's notation and step-by-step layout, (c) lets the audience interact, and (d) stays reliable when projected live. A static page cannot show the effect of h, f or the method; a single shared numerics engine can.

## 3. Scope

- In scope: everything under `web/`, `odd/`, root `PRODUCT.md`.
- Out of scope: boundary-value problems (PDF 07), systems and higher-order ODEs, stiff or adaptive solvers, backend, accounts, analytics, deployment, pull requests.
- Authorized: create/edit files in the three paths above; local commits on the feature branch; run node/python for verification; open `file://` pages in the built-in browser.
- NOT authorized without asking the user: push, PR, deploy, downloading vendor libraries (Chart.js/KaTeX) into `web/vendor/`, editing the PDFs or `PROMPT_Y_CONTEXTO.md`, global installs, staging the PDFs/prompt file into git.

## 4. Constraints (non-negotiable)

1. Static and portable: no build step, no bundler, no npm runtime dependency. Must work by double-clicking `web/index.html` (`file://`) AND from any static host. Therefore: classic `<script>` tags only (ES modules and `fetch()` of local files are blocked on `file://`). Hash router (`#/ruta`).
2. External dependencies only Chart.js 4.x and KaTeX 0.16.x (+ its `contrib/auto-render`), from a CDN, behind a loader that (a) first tries `web/vendor/<file>` if present, (b) falls back to the CDN, (c) degrades gracefully if both fail: raw TeX in monospace, charts replaced by the data table plus a one-line notice. A `?nocdn=1` URL flag must simulate total failure for testing. Web fonts (Google Fonts) are optional progressive enhancement; layout must be correct with the system stack.
3. Never `eval`, `new Function` or `innerHTML` with user-provided text. The expression parser is our own (closure compilation). Escape every error message.
4. Language: UI copy and all user-visible text in **neutral professional Spanish** (no voseo, no regional slang; formal imperative like "Ingrese", "Elija"; impersonal where possible). Code identifiers and code comments in English. Persona/chat style never leaks into artifacts.
5. No fabricated facts: member names, time limit, bibliography page numbers, logos. Use `web/js/config.js` placeholders that render nothing visible when empty, and list them in section 14.
6. Accessibility: WCAG AA contrast (4.5:1 text, 3:1 graphics), semantic landmarks, keyboard reachable, `:focus-visible`, `prefers-reduced-motion`, charts have a data-table alternative.
7. Required by the brief: modern responsive clean design, light and dark mode (auto + manual, persisted), **modo proyección** (larger type and controls, persisted, toggle key `P`).
8. Work-unit commits are Conventional Commits with NO "Co-Authored-By" or AI attribution lines (user's global rule).
9. The ~400 authored changed lines per task is an advisory heuristic only; do not shrink code, remove tests or split artificially to fit it.

## 5. Course facts (source of truth)

Sources: `06 - Ejemplos resueltos (Ecuaciones diferenciales ordinarias) - Amiconi.pdf` ([A], 18 pp), `05 - Práctica de Ecuaciones Diferenciales Ordinarias.pdf` ([P5], 3 pp), `06 - Práctica de EDO y Contorno.pdf` ([P6], 2 pp). Digest produced by a mapper subagent and spot-verified by the orchestrator (all numeric oracles below were recomputed in Node: ALL CONFIRMED, 2026-10-06).

### 5.1 Methods exactly as taught ([A], notation verbatim)

- Notation: step `h`; `x_{n+1} = x_n + h`; `x_0` "Valor inicial", `x_f` "Valor final"; `y_n` approximates `y(x_n)`; `y_n' = f(x_n, y(x_n))`; "Ordenada Genérica" is the `y_{n+1}` formula; iterations `n = 0, 1, 2, …`; `N = (x_f − x_0)/h`. PVI = EDO `y' = f(x, y(x))` + condición inicial `y(x_0) = y_0` + dominio de trabajo `x_0 ≤ x ≤ x_f` + paso `h` ("con esas cuatro cosas tenemos un problema de valor inicial"). Methods are "de paso simple" (all four here) vs "de paso múltiple" (e.g. Adams-Bashforth, needs a single-step start). The independent variable may be `t`.
- Euler: `y_{n+1} = y_n + h·y_n'`.
- Taylor "de grado 2": `y_{n+1} = y_n + h·y_n' + (h²/2!)·y_n''`, with `y_n'' = ∂f/∂x + ∂f/∂y · y_n'` (derived by hand, e.g. `f = 2xy ⇒ y'' = 2y + 4x²y`). Only grado 2 appears in the course; [P5] Ej.1 says just "método de Taylor": assume grado 2. [P6] calls RK "Runge Kutta de 2º Orden".
- Euler Mejorado = **Heun (trapezoid, Euler predictor)**: `y_{n+1} = y_n + (h/2!)[ f(x_n, y(x_n)) + f(x_{n+1}, y_n + h·y_n') ] = y_n + (h/2!)[ y_n' + f(x_{n+1}, y_n + h·y_n') ]`.
- Runge-Kutta de grado 2 = **punto medio**: `y_{n+1} = y_n + h·f(x_n + h/2, y_n + k1/2)`, `k1 = h·f(x_n, y(x_n)) = h·y_n'` (note: `k1` already contains `h`). Check: on `y'=2xy, y0=1, h=0.1` midpoint gives `y1 = 1.231` (printed) while Heun would give `1.232`.
- Some textbooks call the midpoint method "Euler modificado" or "polígono mejorado"; this course does not. Heun and midpoint are both members of the 2-stage RK2 family (see 5.8).

### 5.2 Presentation format of the solved examples ([A]; there are NO tables, only step blocks)

```
Ejercicio nro k: Resolver el siguiente problema de Valor Inicial aplicando el método de <M>.
f(x,y(x)) = y' = ...   h = ...   y(x0) = y0   Hallar y(xf)   (or an interval 0 <= x <= 1)
La condición inicial: y(x0)=y0 -> x0 = .., y0 = ..
Nuestro dominio o intervalo de trabajo ... tendremos que realizar entonces N iteraciones.
x0 = ..  x1 = x0 + h = ..  x2 = x1 + h = ..
Por <M> vamos a definir la Ordenada Genérica y_{n+1} para nuestro problema     [generic formula, then particularized; highlighted yellow]
 • Primer iteración: n=0   -> "Si n=0 entonces:" [formula with n=0] / [Donde: y0' = ... | con k1 = ...] / "Reemplazando cada valor:" [numbers]
     y1 = 1.23 = y(x1) = y(1.1)                       [highlighted yellow]
     "Esto se lee así: el valor de y1 es igual al valor de y evaluado en el punto x1 y como x1 = x0 + h entonces x1 = 1 + 0.1 = 1.1"  (first iteration only)
 • Segunda iteración: n=1 ...   • Tercer iteración: n=2 ...
Close: "Hallamos el valor que nos pedía el enunciado, por lo tanto el ejercicio termina aquí."
       / "Llegamos al valor de "y" correspondiente al final del intervalo, por lo tanto el ejercicio termina en este punto."
```

- Intermediates shown: Taylor shows none (y', y'' substituted analytically); Euler Mejorado prints `y_n'` separately ("Donde: y0' = (-1+0+1) = 0", predictor inline `(1+0.5*0)`); RK2 prints `k1` separately ("con k1 = h*(2x0y0) = 0.1*(2*1*1); k1 = 0.2").
- Notation details: `sen`, `*` for product, decimal point, `y(1.1)` style; variable may be `t`. No exact solution and no error columns appear anywhere (those are our additions and must be labeled "verificación" / extension).
- First-step substitutions as printed: Ej.1 `y1 = 1 + 0.1*[2*1*1] + ((0.1)^2/2!)[2*1 + 4*(1)^2*1]`; Ej.4 `y1 = 1 + 0.1*[2*(1 + 0.1/2)*(1 + 0.2/2)]`.

### 5.3 Truncation convention (inferred from data, fits all 7 checked values)

Every printed `y` and `k` in [A] equals the full-precision value **truncated** (not rounded) to 4 decimals, trailing zeros dropped (`1.542666 → 1.5426`, `1.9727613 → 1.9727`, `1.5452743 → 1.5452`, `1.9779511 → 1.9779`, `k1 = 0.3708658 → 0.3708`). Rounding would show 1.5427 / 1.9728 / 1.5453 / 1.9780. The calculation itself runs at full precision (verified: carrying the truncated y2 would give 1.9726, not the printed 1.9727). The site must offer both display modes (`trunc` as in the apunte, `round` standard) and say so.

### 5.4 Verified oracles for the solved examples ([A], full-precision recomputation)

| Ej | Method | PVI | Printed in [A] | Correct full precision |
|---|---|---|---|---|
| 1 (pp.6-9) | Taylor grado 2 | y'=2xy, x0=1, y0=1, h=0.1, y(1.3), 3 it. | y1=1.23, y2=1.5426, y3=1.9727 | 1.23; 1.542666; 1.9727613 |
| 2 (pp.9-11) | Euler | y'=sen(t)+e^{-t}, 0≤t≤1, h=0.5, y(0)=0, 2 it. | y1=0.5, **y2=1.4297 (ERRATA)** | 0.5; **1.0429781** |
| 3 (pp.12-14) | Euler Mejorado | y'=-y+x+1, 0≤x≤1, h=0.5, y(0)=1, 2 it. | y0'=0, y1=1.125, y1'=0.375, **y2=1.4843 (ERRATA)** | 1.125; **1.390625** (predictor 1.3125, f(x2,pred)=0.6875) |
| 4 (pp.15-18) | RK grado 2 | y'=2xy, x0=1, y0=1, h=0.1, y(1.3), 3 it. | k1=0.2,y1=1.231; k1=0.27082,y2=1.5452; k1=0.3708,y3=1.9779 | 1.231; 1.5452743; 1.9779511 (k1 0.2, 0.27082, 0.3708658) |

Exact solutions: `y'=2xy ⇒ y=e^{x²−1}` (y(1.1)=1.233678, y(1.2)=1.552707, y(1.3)=1.993716); Ej.2: `y = 2 − cos t − e^{−t}`, y(1)=1.091818; Ej.3: `y = x + e^{−x}`, y(1)=1.367879.

**Errata (orchestrator-verified in Node):** the printed Ej.2 y2 (1.4297) is `1.0429781` with the zero dropped; the printed Ej.3 y2 (1.4843) is wrong (correct 1.390625). **Do NOT use the two printed values as test oracles.** The site shows the correct values and says nothing about the handout's mistakes; the user decides whether to mention them to the professor (section 14).

### 5.5 Practice bank ([P5] and [P6]; PVI only) with reference values

`y_final` = our computation with the course's method (verified in Node for all rows marked ✓; the rest by mapper only). `exact` = closed form derived by the mapper and checked vs RK4 to 1e-12 (T2 must re-verify every closed form by derivative residual and initial condition). Taylor `y''`: 1a `9x⁴y−6xy`; 1b `y(1+y²)/8`; 1c `2y+4x²y`; 1d `2y²(y+1)/t²`.

| Ex | Method | ODE | x0, y0 | h | n | Target | y_final | exact |
|---|---|---|---|---|---|---|---|---|
| P5 1a | Taylor | y'=-3x²y | 0, 3 | 0.1 | 5 | y(0.5) | 2.657994 ✓ | 2.647491 (3e^{-x³}) |
| P5 1b | Taylor | y'=(1/4)(1+y²) | 0, 1 (x0 implied by 0≤x≤0.5) | 0.1 | 5 | y(0.5) | 1.287109 ✓ | 1.287427 (tan(x/4+π/4)) |
| P5 1c | Taylor | y'=2xy | 1, 1 | 0.1 | 3 | y(1.3) | 1.972761 ✓ | 1.993716 |
| P5 1d | Taylor | y'=(1/t)(y²+y) | 1, −2 (t0 implied; sheet writes "y(t0) = −2" with domain 1≤x≤3) | 0.5 | 4 | y(3); sheet also asks "¿Cuántas iteraciones son necesarias…?" | −1.458885 ✓ | −1.2 (2t/(1−2t)) |
| P5 2a | Euler | y'=-y+x+1 | 0, 1 | 0.1 | 10 | y(1) | 1.348678 ✓ | 1.367879 |
| P5 2b | Euler | y'=sen(t)+e^{-t} (= [A] Ej.2) | 0, 0 | 0.5 | 2 | y(1) | 1.042978 ✓ | 1.091818 |
| P5 2c | Euler | y'=(x−y)² | 2, 0.5 | 0.25 | 3 | y(2.75) | 1.709324 | 1.656579 (x − coth(x+0.5 ln5 − 2)) |
| P5 2d | Euler | y'=xy²−y/x | 1, 1 | 0.1 / 0.05 | 5 / 5 | y(1.5) / y(1.25) | 1.219446 / 1.050555 | 1.333333 / 1.066667 (1/(x(2−x))) |
| P5 2e | Euler | y'=2x−3y+1 | 1, 5 | 0.1 / 0.05 | 5 / 5 | y(1.5) / y(1.25) | 1.820740 / 2.817867 | 2.053216 / 2.938881 (2x/3+1/9+(38/9)e^{−3(x−1)}) |
| P5 3a | Euler Mejorado | y'=2xy | 1, 1 | 0.1 | 5 | y(1.5) | 3.450929 ✓ | 3.490343 |
| P5 3b | Euler Mejorado | y'=(x+y−1)² | 0, 2 | 0.1 | 5 | y(0.5) | 3.825415 ✓ | 3.908223 (tan(x+π/4)−x+1) |
| P5 3c | Euler Mejorado | y'=x+y² | 0, 0 | 0.1 | 5 | y(0.5) | 0.126556 ✓ | 0.126587 (no closed form; RK4 reference) |
| P5 3e | Euler Mejorado | y'=−ty+4t/y, 0≤t≤1 | 0, 1 | 0.25 | 4 | y(1) | 1.692289 ✓ | 1.701870 (√(4−3e^{−t²})) |
| P6 1a | RK 2º orden | y'=-3x²y | 0, 3 | 0.1 | 5 | y(0.5) | 2.649143 ✓ | 2.647491 |
| P6 1b | RK 2º orden | y'=(1/4)(1+y²) | 0, 1 | 0.1 | 5 | y(0.5) | 1.287218 ✓ | 1.287427 |
| P6 1c | RK 2º orden | y'=2xy | 1, 1 | 0.1 | 5 | y(1.5) | 3.434843 ✓ | 3.490343 |

Notes: [P5] has no 3d (lettering a, b, c, e). 2d/2e each ask two runs with different h AND different endpoints (not comparable at the same x). [P6] Ej.2 a-d are boundary-value problems: out of scope. [P5] 1c asks y(1.3); [P6] 1c asks y(1.5) with RK2.

### 5.6 Same PVI, four methods (h = 0.1; verified ✓) for the comparison page

| PVI | Euler | Taylor-2 | RK2 punto medio | Euler Mejorado | exact |
|---|---|---|---|---|---|
| y'=2xy, y(1)=1, y(1.3) | 1.815360 ✓ | 1.972761 ✓ | 1.977951 ✓ | 1.983150 ✓ | 1.993716 |
| same, y(1.5) | 2.927813 ✓ | 3.418817 ✓ | 3.434843 ✓ | 3.450929 ✓ | 3.490343 |
| y'=−3x²y, y(0)=3, y(0.5) | 2.737305 | 2.657994 ✓ | 2.649143 ✓ | 2.640502 | 2.647491 |
| y'=(1+y²)/4, y(0)=1, y(0.5) | 1.278470 | 1.287109 ✓ | 1.287218 ✓ | 1.287328 | 1.287427 |

There is no universal winner among the three 2nd-order methods (RK2 is best on `−3x²y`; Euler Mejorado is best on the other two). The headline case study is `y'=2xy, y(1)=1`: [A] Ej.1 (Taylor) and Ej.4 (RK2) are the same PVI, so adding Euler Mejorado gives a 3-way comparison in the cátedra's own example.

### 5.7 Items the course does NOT contain (our additions, must be labeled "ampliación")

No tables or error columns, no error order, no stability, no cost analysis, no bibliography, no Taylor beyond grado 2. Standard facts we add (all must be verified by tests):

- Global error: Euler O(h); Taylor-2, Euler Mejorado, RK2 all O(h²) (local O(h³)).
- Let `D = f_x + f·f_y` (= y''), `F2 = f_xx + 2 f f_xy + f² f_yy`, so `y''' = F2 + f_y·D`. One-step local error, exact minus numerical, as h→0:
  - Taylor-2: `(h³/6)(F2 + f_y D)`
  - RK2 punto medio: `h³(F2/24 + f_y D/6)`
  - Euler Mejorado (Heun): `h³(−F2/12 + f_y D/6)`
  - Check on `f=2xy` at (1,1): `F2=8`, `f_y D=12` → constants 10/3, 7/3, 4/3 (single-step errors at h=0.1 from (1,1): 3.678e-3, 2.678e-3, 1.678e-3 vs exact 1.233678). This is why the ranking changes between problems.
- All three agree with the Taylor series through h². RK methods are derivative-free: they match Taylor-2 using extra f evaluations instead of `f_x`, `f_y`.
- Cost per step (evaluations of expressions): Euler 1 `f`; Euler Mejorado 2 `f`; RK2 2 `f`; Taylor-2 `f`, `f_x`, `f_y` (3, plus the analytic derivation by hand). Taylor-p needs partial derivatives up to order p−1 of f.
- On the linear test problem `y'=λy` all three coincide: `y_{n+1} = (1 + z + z²/2) y_n`, `z = hλ`; Euler gives `1 + z`. Real stability interval is `[−2, 0]` for all four methods.
- Taylor orders 3 and 4 are an **extension** (total derivative operator `D(g) = g_x + g_y·f` applied repeatedly), clearly labeled as beyond the course.

### 5.8 RK2 family (unifying theory)

`y_{n+1} = y_n + h(a1·k1 + a2·k2)`, `k1 = f(x_n, y_n)`, `k2 = f(x_n + p·h, y_n + q·h·k1)`, with order conditions `a1 + a2 = 1`, `a2·p = 1/2`, `a2·q = 1/2`. Heun (course's "Euler Mejorado"): `a2=1/2, p=q=1`. Punto medio (course's "RK2"): `a2=1, p=q=1/2`. Ralston: `a2=2/3, p=q=3/4`. Derive the conditions by matching the Taylor expansion of `k2`.

### 5.9 Citable sources (verbatim strings from the PDFs)

- "Cátedras de Modelos Numéricos, Análisis Numérico y Cálculo Avanzado - U.T.N. Facultad Regional La Plata" (header of [A], [P6]; [P5] header omits "Análisis Numérico").
- "Apunte creado por Ing. Amiconi Diego Federico" (footer of [A]). Titles: "Ejercicios resueltos. Tema: Ecuaciones Diferenciales Ordinarias (EDO´s): Problemas de valor Inicial" ([A] p.1); "Práctica de Ecuaciones Diferenciales Ordinarias (Problemas de Valor Inicial)" ([P5]); "Práctica de Ecuaciones Diferenciales Ordinarias (2º Parte) y Problemas de Contorno" ([P6]). No dates are printed. Germán Céspedes is not named in these PDFs. The embedded metadata title "TRABAJO PRACTICO N° 1 - TEORIA DE ERRORES" is a template leftover: do not cite.
- No textbook is named in the course PDFs. Suggested reference books (the group must verify edition and chapter before citing): Burden & Faires, *Numerical Analysis*, chapter on initial-value problems for ODEs (Taylor methods, Runge-Kutta, Modified Euler, Midpoint); Chapra & Canale, *Métodos numéricos para ingenieros*, part on ordinary differential equations (Euler, Heun, punto medio, Runge-Kutta). Do not invent page numbers or editions.

### 5.10 Other ambiguities to surface in the UI notes

(i) "grado 2" ([A]) vs "2º Orden" ([P6]); (ii) [P5] Ej.1 does not state the Taylor order; (iii) [P5] 1b x0 and 1d t0 are implied by the domain; (iv) [A] p.15 says "x_0 = 0" in the domain sentence although x_0 = 1 (typo in the handout; ignore); (v) 1c asks y(1.3) in [P5]/[A] but y(1.5) in [P6].

## 6. Architecture

### 6.1 Layout (all under `web/`)

```
web/
  index.html
  css/        tokens.css  base.css  components.css  (pages.css if needed)
  js/
    config.js                 group, version/date, members[], talk {minutes, agenda[]}
    deps.js                   loader for KaTeX/Chart.js (vendor/ -> CDN -> fallback), ?nocdn=1
    numerics/ expr.js  format.js  methods.js  problems.js  analysis.js      (pure logic, UMD)
    ui/ app.js (router, state, theme, projection)  tex.js  charts.js  steps.js (Amiconi renderer)
    ui/pages/ home.js theory.js exercises.js simulator.js compare.js audience.js sources.js
  tests/      *.test.js   (node:test, run: node --test web/tests/)
  README.md   (run, deploy, test, how to bump version)
```

Every JS file is a classic script that attaches to `window.EDO.<name>`; numerics files are UMD (`module.exports` when `require`d in Node) so the same code is unit-tested in Node. Page files register with `EDO.app.registerPage(id, { title, render(root, ctx), onLeave? })`. Hash routes: `#/inicio`, `#/teoria`, `#/ejercicios`, `#/simulador`, `#/comparativa`, `#/audiencia`, `#/fuentes`, optional sub-routes `#/teoria/rk2` and query state such as `#/simulador?f=2*x*y&x0=1&y0=1&xf=1.3&h=0.1&m=taylor,heun,rk2`.

### 6.2 Numerics API contract (T2 implements exactly this; later tasks consume it)

```
EDO.expr
  parse(src, {indep='x'}) -> Node                  throws EDOParseError {message, pos}  (message in Spanish)
  compile(node, {indep='x'}) -> (x,y)=>number      closure-built, no eval/Function
  diff(node, 'x'|'y') -> Node                      simplified
  totalDerivative(fNode, {indep}) -> Node          f_x + f_y*f, simplified; apply repeatedly for higher orders
  simplify(node) -> Node
  toTeX(node, {indep='x'}) -> string               'sen' for sin, e^{..} for exp, \frac, implicit products
  toString(node) -> string                         round-trips through parse
  substitute(node, {x: number|Node, y: number|Node}) -> Node
  evalNode(node, {x,y}) -> number
  Parser: implicit multiplication ("2xy", "-3x^2 y", "2(x+1)"), "^" and "**", unary minus ("-x^2" = -(x^2); "e^-t"),
  functions sin|sen cos tan asin|arcsin acos|arccos atan|arctan sinh cosh tanh exp ln (natural) log|log10 (base 10) sqrt abs,
  constants e, pi (never when 'e' is the declared independent variable), variables: indep (x or t) and y.
EDO.format
  num(v, {decimals=4, mode:'round'|'trunc', trim=true}) -> string      '.' decimal separator; Amiconi style via mode 'trunc'
  tex(v, opts) -> string                                              LaTeX-safe number
  parseNumber(str) -> number|NaN                                      accepts ',' or '.' decimal separators
EDO.methods
  METHODS = [ {id:'euler', label:'Euler', order:1, baseline:true, evalsPerStep:1},
              {id:'taylor', label:'Taylor', order:2, orderRange:[2,4], ...},
              {id:'heun', label:'Euler Mejorado', alias:'Heun', order:2, evalsPerStep:2},
              {id:'rk2', label:'RK2 (punto medio)', order:2, evalsPerStep:2} ]
  solve(methodId, problem, {h, N, order}) -> Solution
Solution = { method, order, h, N, xs[N+1], ys[N+1], steps[N], fEvals, derivEvals }     x_n = x0 + n*h (never accumulate)
steps[n] = { n, xn, yn, xn1, yn1, detail }
  detail.euler  = { slope }                                      slope = y_n'
  detail.taylor = { derivs:[y', y'', ...], terms:[h*y', h^2/2!*y'', ...] }
  detail.heun   = { slope, yPred, slopeEnd, slopeAvg }           yPred = y_n + h*slope; slopeEnd = f(x_{n+1}, yPred)
  detail.rk2    = { k1, xMid, yMid, slopeMid }                   k1 = h*f(x_n,y_n); yMid = y_n + k1/2; slopeMid = f(xMid,yMid)
EDO.problems
  make(spec) -> Problem      spec: { id, title, source, indep, fStr, x0, y0, xf, h|N, exact?:{fn, tex, str}, notes, method? }
  Problem  = spec + { f, fNode, fx(), fy(), derivNodes(order) (lazy), indep }
  stepsFor(x0, xf, h) -> {N, ok, message}                         N = (xf-x0)/h must be an integer (tolerance 1e-9)
  PRESETS (amiconi a1..a4, practice p5_1a … p6_1c exactly as in 5.5, extras: linear y'=λy, comparison cases of 5.6), byId(id)
EDO.analysis
  reference(problem, xs) -> number[]            exact fn when present, else RK4 with h/200 (documented as 'referencia')
  errors(sol, refYs) -> {abs[], rel[], pct[]}
  convergence(problem, methodIds, {levels=6, N0}) -> {hs[], errors:{id:number[]}, orders:{id:number[]}, evals:{id:number[]}}
  localErrorConstants(problem, x, y) -> {taylor, rk2, heun, F2, D}          the 5.7 constants (theory page, quiz)
```

Everything numerically relevant runs at full float64; formatting happens only at display time.

## 7. Design direction (pinned by the brief; Operate + Read surface)

- The brief pins the look: "limpio, moderno y responsivo", light/dark, modo proyección. The skill's decision-round/concept-roll ceremony was skipped on purpose (brief-pinned direction; user said to proceed). Disclose this in the final report.
- Color strategy **Restrained**: cool near-white paper and blue-black ink, neutral UI, NO cream/terracotta, NO neon-on-black, NO broadsheet hairline look. One functional accent: a **highlighter yellow** used only to mark a result or a generic formula, echoing the cátedra's yellow marks in the handout (so it encodes information: "this is the value/formula you write down"). Data colors are separate and fixed per method, derived from the Okabe-Ito palette, with redundant encodings (marker shape + dash) so they survive grayscale and projection: Taylor = vermillion, Euler Mejorado = bluish green, RK2 = blue, Euler = neutral gray dashed, exact/reference = ink, thin. Define dark-theme variants. UI controls are ink/neutral, not the method blue.
- Type: body in a legible humanist sans (progressive enhancement from Google Fonts, e.g. Atkinson Hyperlegible, justified by projection legibility) with a robust system fallback; math in KaTeX (Computer Modern); numbers use tabular figures; expression inputs in a monospace. Clear scale; projection mode raises root size ≥ 30%.
- Signature (the one memorable thing): **"El paso"**, an interactive one-step diagram on a slope field showing the same step from (x_n, y_n) built three ways (Taylor curvature, Euler Mejorado average slope, RK2 midpoint slope) against the exact curve, with an `h` slider. It is the Home hero and is reused in the theory.
- Restraint: no gradient text, no glassmorphism, no emoji as icons, no decorative motion; one orchestrated page-load/transition at most; respect reduced motion. Structure markers (numbers, eyebrows) only where order carries meaning (e.g. n = 0, 1, 2 iterations).
- UI writers MUST read `C:\Users\bisca\.claude\skills\impeccable\reference\craft-floor.md` (quality floor, absolute bans) and apply `frontend-design` guidance before editing UI, then run `node C:\Users\bisca\.claude\skills\impeccable\scripts/detect.mjs --json <changed targets>` once at the end of a UI task and fix what is mechanical.

## 8. Content outline per page

1. **Inicio** `#/inicio`: title "Comparativa de métodos para PVI: Taylor, Euler Mejorado y RK2"; Grupo 10; cátedra line; "Ronda 3: Ecuaciones Diferenciales Ordinarias (PVI) · Lunes 19 de octubre de 2026"; members only if configured; hero "El paso"; the guiding question "¿Cómo damos un paso de x_n a x_{n+1}?"; agenda with time budget; section cards; version/date in footer.
2. **Teoría** `#/teoria` (sticky table of contents): PVI (the "cuatro cosas", why numerical, unicidad one-liner, notation, paso simple vs múltiple); Taylor grado 2 (derivation, formula, `y''` recipe, extension to grados 3 and 4); Euler Mejorado (trapezoid derivation, predictor-corrector, geometry); RK2 punto medio (derivation, `k1`, geometry); RK2 family and nomenclature note (5.8, 5.1 last bullet); Error y orden (local vs global, constants of 5.7 as "ampliación", linear coincidence, stability note, measuring p by step halving); Costo computacional; "Receta para resolver a mano" (the cátedra's procedure as numbered steps: identify f, x0, y0, h, xf; compute N; list x_n; write Ordenada Genérica; iterate; state result); summary table of the three methods; glossary.
3. **Ejercicios** `#/ejercicios`: (a) the four solved examples of [A] reproduced in the Amiconi layout (5.2), generated by the engine, default display `trunc` 4 decimals with a notice; Ej.2 and Ej.3 show the correct values; (b) **caso comparativo** `y'=2xy, y(1)=1, h=0.1, y(1.3)` solved step by step with the three methods side by side, check against `e^{x²−1}`; (c) practice bank of 5.5 as a table with "Resolver paso a paso" (generated solution) and "Abrir en el simulador". Each solution has a summary table, chart, and the "verificación" line (exact solution/reference), labeled as an addition.
4. **Simulador** `#/simulador`: preset picker (5.5, 5.6, [A]) + free `f(x,y)` input (with live TeX preview and friendly parse errors), `x0, y0, xf` and `h` or `N` (linked), independent variable x/t, method checkboxes (Euler as baseline, Taylor with order 2-4 selector flagged "ampliación", Euler Mejorado, RK2), optional exact solution input, display options (decimals, trunc/round, abs/rel/% error), outputs: results table (n, x_n, y_n per method plus intermediate columns: `y'`, `y''`, `k1`, predictor, midpoint), error table, solution chart with exact/reference, error chart (log toggle), "Paso a paso" panel using the Amiconi renderer with an iteration selector, CSV export, shareable URL state, data-table alternative for charts.
5. **Comparativa** `#/comparativa`: case selector and `h` slider; same-problem table at `x_f` (methods vs exact, abs/rel error, evaluations); overlaid solutions and error chart; convergence study (log-log error vs h with reference slopes, estimated order p per method, computed live); work-precision chart (error vs evaluations); linear-case coincidence demo (`y'=λy`) and sensitivity to h (instability when `hλ < −2`); summary matrix and "¿Cuál elegir?" with caveat "no hay ganador universal"; short conclusions.
6. **Audiencia** `#/audiencia`: quiz of 10 questions (definition, order, formula recognition, nomenclature, cost, coincidence on linear problems, a numeric one-step calculation with tolerance), immediate feedback with explanation and score; "Predecí" game (pick a preset and h, guess which method ends closest, then reveal); live mini-exercise (one step by hand with answer check, then reveal steps); closing questions for the audience.
7. **Fuentes** `#/fuentes`: course sources (5.9 verbatim), reference books flagged "verificar edición y capítulo", software used (KaTeX, Chart.js with versions and licenses), "cómo verificamos" (tests, oracles, independent RK4 reference), version and date (`config.js`).
8. **Chrome**: sticky top bar with section links, theme toggle (auto/light/dark), projection toggle, timer; keyboard help overlay (`?`), left/right arrows move between sections in projection mode; footer with version/date.

## 9. Tasks

Delegation route for substantial work: one fresh bounded writer per task (mandatory writer/preparation triggers: 2+ non-trivial files, reading that prepares a write). Parent keeps: this document, spot-check re-runs, commits, review gating.

| ID | Task | Route | Acceptance (summary) |
|---|---|---|---|
| T0 | Feature document, `PRODUCT.md`, repo hygiene | inline | [x] files exist, committed |
| T2 | Numerics core + tests (`expr`, `format`, `methods`, `problems`, `analysis`) | delegated writer | all oracles of 5.4-5.6 pass; closed forms verified; orders ≈ 1/2/2/2; linear coincidence; parser safe; `node --test web/tests/` green |
| T1 | Shell and design system: `index.html`, CSS tokens/base/components, router, deps loader, theme, projection, nav, page stubs, README stub | delegated writer | opens on `file://`; no console errors; nav/deep links; light/dark/projection; `?nocdn=1` fallback; responsive 360-1920 |
| T3 | Theory + Fuentes pages, "El paso" diagram component | delegated writer | all of section 8 items 2 and 7; math correct (tests for constants); KaTeX renders; fallback readable |
| T4 | Amiconi step renderer (`steps.js`) + Ejercicios page | delegated writer | reproduces [A] Ej.1-4 values; comparative case; practice bank; trunc/round toggle |
| T5 | Simulator page | delegated writer | section 8 item 4; free input safe; shareable URL; CSV; charts + tables |
| T6 | Comparativa page | delegated writer | section 8 item 5; orders estimated live match theory |
| T7 | Audiencia page, Home hero, timer/agenda, projection polish, help overlay | delegated writer | section 8 items 1 and 6; timer works; projection legible |
| T8 | QA, hardening, README (run/deploy/test/bump version), final report | writer + parent + independent verifier | all acceptance criteria in section 10 evidenced |

Per-task closure: writer reports `<command>: <observed result>`; parent re-runs one command as a spot check; checkbox flipped only after observation; one or more work-unit commits (Conventional Commits, no attribution); `gentle-ai review assess --cwd . --agent claude-code --base-ref <last reviewed boundary> --committed-only --json` read for `review_due`; update this file and the Engram mirror.

Checklist: [x] T0 · [ ] T2 · [ ] T1 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8

## 10. Global acceptance criteria

- AC1 Opens by double-click on `web/index.html` with no build and no server; zero console errors online; graceful degradation with `?nocdn=1`.
- AC2 Clear structure, hash routes with deep links and back/forward, keyboard accessible, responsive 360-1920 px.
- AC3 Light/dark (auto + manual, persisted) and projection mode (type scale ≥ 1.3x, bigger controls, persisted, `P`).
- AC4 Theory correct and complete for PVI, Taylor grado 2, Euler Mejorado, RK2, family and nomenclature, error order, constants, cost, stability note; course content clearly separated from labeled extensions.
- AC5 Exercises solved step by step in the cátedra's format; Ej.1 and Ej.4 values equal [A] when truncated to 4 decimals; Ej.2 and Ej.3 show the verified correct values; comparative case; practice bank.
- AC6 Simulator with safe free input, intermediate values, error tables, charts, step-by-step, CSV, shareable state.
- AC7 Comparativa with convergence study, estimated orders, work-precision, linear coincidence, conclusions.
- AC8 Audience interaction (quiz, prediction, live exercise) and a presentation timer with agenda.
- AC9 Fuentes page with verbatim course sources and flagged references; version/date visible.
- AC10 Numerics verified: unit tests green with the oracles; independent cross-check (a separate Python/mpmath or Node high-precision computation) of the headline numbers.
- AC11 Spanish neutral UI copy, English code; no fabricated names, limits or citations; placeholders listed in section 14.

## 11. Applicable checks (commands)

- `node --test web/tests/` (numerics + content-math tests).
- `rg -n "eval\(|new Function|innerHTML" web/js` reviewed: no unsafe use with user text.
- Browser QA in the built-in browser at `file:///C:/Users/bisca/Documents/EDO_Comparativa_Taylor_Euler_RK2-claude/web/index.html`: console clean, routes, theme, projection, keyboard, widths 375/768/1280, `?nocdn=1`.
- `node C:\Users\bisca\.claude\skills\impeccable\scripts/detect.mjs --json web/index.html web/css` once after UI tasks.
- Independent verifier (fresh agent) at T2 and T8.

## 12. Workflow state

- TDD: mode unknown (no project/session configuration found; no explicit user choice). Treated as OFF: ordinary functional checks plus tests written alongside the code, no mandatory RED-first. Source: none. Runner: `node --test` (Node v24.15.0 built-in), Python 3.13.5 available for cross-checks. Disclosed to the user in the final report.
- RDD (receipt-driven development): ON, decided by default (`gentle-ai review mode status`; global unset, clone-local unset). `gentle-ai review assess` without a declaration returns `risk: high / unassessable` because untracked files (the PDFs) need an explicit declaration; always pass `--untracked-scope=exclude --expected-untracked-inventory=sha256:be3f6162857dd7d9ce0e2542a45c2dcde72a33a1600d9f532f60008cbf21f01e` (the canonical inventory reported by `gentle-ai review status`; it changes only if the untracked files change, then re-read it). Per commit, read `review_due`; relay consent envelopes losslessly to the user; if the user declines for a candidate, follow the RDD-off verification path (assess tier, writer self-verification plus independent verifier for high). Never toggle the mode on the user's behalf. First boundary: `19c08be`.
- Delivery: forecast ≈ 5,500 authored lines (additions+deletions, no generated files) across T1-T8, far above the ~400 heuristic. No remote and no PR requested, so no PR chain is planned; slices are the per-task work-unit commits on the feature branch. Ask the user at the end whether they want a PR chain/merge. Never push.
- Git: an empty repo appeared in the folder during this session (created 15:27:07, about when `gentle-ai review assess` ran; it was not present at session start). The orchestrator made the root commit `19c08be` and the branch `feat/edo-web-comparativa`. PDFs and `PROMPT_Y_CONTEXTO.md` stay untracked on purpose (course material; not to be published by accident). Stage explicit paths only (`git add web odd PRODUCT.md`).
- Language: chat in the user's language (Rioplatense Spanish); artifacts follow constraint 4.
- Skills applied: `frontend-design`, `impeccable` (setup + init/new-work read; interview substituted by the brief because the user said to proceed; decision-round skipped because the brief pins the direction), `work-unit-commits` conventions.

## 13. Progress log and verification evidence

| When | Item | Evidence |
|---|---|---|
| 2026-10-06 | Rubric read inline; 3 course PDFs + out-of-scope PDF mapped by a subagent | digest in section 5 |
| 2026-10-06 | Digest oracles recomputed in Node (Ej.1-4, practice rows marked ✓, comparison table) | `ALL DIGEST VALUES CONFIRMED` |
| 2026-10-06 | T0 files written and committed | commit `0c40da8` (`docs: add ODD feature document and product context`) |
| 2026-10-06 | T0 review gating | `gentle-ai review assess --cwd . --agent claude-code --base-ref 19c08be --committed-only --untracked-scope=exclude --expected-untracked-inventory=sha256:be3f6162857dd7d9ce0e2542a45c2dcde72a33a1600d9f532f60008cbf21f01e --json`: `risk: passive`, `review_due: false` (non_executable_only). Reviewed boundary advances to `0c40da8`. |
| 2026-10-06 | T2 delegated | one fresh writer (sonnet) launched in background; scope `web/js/numerics/`, `web/tests/` |

Next step: when the T2 writer returns: spot-check re-run of `node --test web/tests/`, independent verifier (fresh agent: high-precision cross-check of the headline numbers and a code read of the parser/diff), commit (`feat(numerics): ...`), assess with the flags above (base-ref = last reviewed boundary), then T1.

## 14. Open items for the user (do not invent)

- Group members' names (`web/js/config.js: members`).
- The talk's time limit (default placeholder 20 min in the timer; editable).
- Whether to vendor Chart.js and KaTeX into `web/vendor/` for 100% offline use (needs the user's OK to download).
- Whether to mention the two printed errors in the handout (Ej.2 y2, Ej.3 y2) to the professor.
- Whether to add a `.gitignore`, a remote, a PR chain, and how to deploy (Vercel/GitHub Pages).
- Reference books: verify edition and chapter before citing.
- The delivered version must be the one presented (version/date shown in the footer; consider a git tag).
