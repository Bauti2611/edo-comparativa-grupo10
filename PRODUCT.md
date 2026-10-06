# Product

<!-- impeccable:product-schema 1 -->

> Written without an interview: the user said to proceed ("lee todo y arranca"), so every fact below comes from the explicit brief (`PROMPT_Y_CONTEXTO.md`, `Rubrica.pdf`, the course PDFs). Items marked [inferred] are assumptions, not confirmed answers.

## Platform

web

## Stack

Pinned by the user's brief, not chosen by the agent: static HTML5 + modern CSS + vanilla JavaScript, Chart.js and KaTeX. No install or build step. It must open by double-click on `web/index.html` (file://) and deploy unchanged to Vercel or GitHub Pages. It must support light and dark themes and a "modo proyección" with larger type and controls.

## Users

- Primary: Group 10 of the UTN FRLP course (Análisis Numérico / Modelos Numéricos) presenting live on Monday 2026-10-19, 6th slot of Ronda 3 (Ecuaciones Diferenciales Ordinarias, problemas de valor inicial). The page is projected in a classroom and driven by the presenters. Every member must be able to explain any part of it.
- Evaluators: Ing. Diego Amiconi and Germán Céspedes. The web work is 30% of the grade: functional and navigable site with clear structure, correct theory, understandable procedures, exercises solved step by step, consulted sources, and fidelity to the version delivered beforehand.
- Audience: classmates the presenters must engage with questions (10% of the grade is audience interaction). [inferred]
- Secondary: students reopening the site later to study the topic. [inferred]

## Product Purpose

Teach and compare three one-step methods for initial value problems y' = f(x, y), y(x0) = y0: Taylor (grado 2), Euler Mejorado and Runge-Kutta de grado 2 (RK2). The site gives correct theory, worked solutions in the format the cátedra requires, an interactive simulator and a rigorous comparison of accuracy, order of convergence and cost. Success means a top rubric score and a site that stays usable live in front of the class.

## Positioning

Every number in the worked exercises comes from the same code the simulator runs, so the audience can change f, h or the method live and watch the step-by-step solution, the error and the convergence update, in the cátedra's own notation. A PDF handout or static slides cannot do that.

## Operating Context

- Delivered before the deadline and presented unchanged: the rubric requires the exposition to use the same version sent beforehand, so the build shows a version and date.
- Projected on a classroom screen, possibly with unreliable internet; live presenters need large type, a visible timer and quick navigation between sections.
- Course conventions to preserve (from `06 - Ejemplos resueltos (EDO) - Amiconi.pdf`): "Euler Mejorado" is Heun's trapezoid method, "RK2" is the midpoint method, Taylor appears only at grado 2, results are shown truncated to 4 decimals, and solutions follow the "Ordenada Genérica" step layout.

## Capabilities and Constraints

- Methods: Euler (baseline), Taylor grado 2 (higher orders only as a labeled extension), Euler Mejorado, RK2 punto medio.
- Interactive: free f(x, y) input parsed safely (no eval), step-by-step generator, error tables, convergence study, audience quiz, presentation timer.
- Offline resilience: KaTeX and Chart.js are loaded from a CDN with graceful degradation; vendoring them locally is a pending user decision.
- Undecided and not to be invented: group member names, the talk's time limit, a textbook bibliography (the course PDFs name none).

## Brand Commitments

- Institutional naming: "Cátedras de Modelos Numéricos, Análisis Numérico y Cálculo Avanzado, U.T.N. Facultad Regional La Plata"; handout author credit "Ing. Amiconi Diego Federico".
- No logo or institutional visual asset was provided; do not fabricate one.
- Aesthetic pinned by the brief: "limpio, moderno y responsivo", light/dark, projection mode.

## Evidence on Hand

- `Rubrica.pdf`: grading rubric. `05 - Práctica de Ecuaciones Diferenciales Ordinarias.pdf` and `06 - Práctica de EDO y Contorno.pdf`: practice exercises. `06 - Ejemplos resueltos (Ecuaciones diferenciales ordinarias) - Amiconi.pdf`: four solved examples. `07 - Ejemplos resueltos (Problemas de Contorno) - Amiconi.pdf`: out of scope (boundary-value problems).
- Verified numeric oracles live in `odd/tasks/edo-web-comparativa.md`.
- Absent: member names, time limit, bibliography, institutional logo. Future work must not fabricate them.

## Product Principles

1. Correctness before polish: every formula and number is checked by tests against the course examples and an independent computation.
2. Course notation wins: use the cátedra's vocabulary and layout, and mark clearly anything that is an extension.
3. One engine: exercises, simulator, comparison and quiz share the same numerics.
4. Built for the room: projection legibility, keyboard navigation and a visible clock outrank decoration.
5. No invented facts: placeholders are explicit and listed for the group to fill.

## Accessibility & Inclusion

WCAG AA contrast, visible keyboard focus, reduced-motion support, text alternatives (data tables) for charts, and a projection mode legible from the back of a classroom.
