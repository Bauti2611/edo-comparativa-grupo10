# Independent verification and browser QA

Standalone scripts, kept apart from the `node:test` suite (`node --test web/tests/` does not run them).

## Independent numeric cross-check

`oracle.py` re-implements Euler, Taylor (orders 2 to 4), Euler Mejorado (Heun) and RK2 (punto medio) in 50-digit
arithmetic (`mpmath`) with symbolic derivatives from `sympy`. It was written without reading the JavaScript code, so it
shares neither its code nor its bugs. It also checks every closed-form solution used by the site (initial condition
and ODE residual) and builds a fuzz corpus of 70 random expressions with their exact values and derivatives.

```
pip install sympy mpmath
python oracle.py      # writes oracle_cases.json and oracle_fuzz.json (generated, not tracked)
node compare.js       # runs web/js/numerics/* against them
```

`compare.js` checks 18 problems with 6 methods at every step, the parser and the symbolic differentiation
(partial and total derivatives up to order 2, text round-trip, balanced TeX) and several parser edge cases. Expected
result: `ALL CROSS-CHECKS PASSED` with a worst relative deviation around 4e-16 (double precision).

## Browser QA

`qa.mjs` drives a headless Chrome or Edge over the DevTools protocol on a real `file://` page (no relaxed security
flags), so it sees what a user sees when double-clicking `web/index.html`: console errors, uncaught exceptions,
failed requests, screenshots and arbitrary `--eval` probes. See the header of the file for the options.

```
node qa.mjs --url "file:///<path>/web/index.html#/teoria" --wait-for "window.EDO&&EDO.app&&EDO.app.ready" \
  --eval "document.documentElement.scrollWidth<=innerWidth" --shot teoria.png
```
