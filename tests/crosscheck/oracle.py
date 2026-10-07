# Independent high-precision oracle for the EDO numerics (50-digit mpmath arithmetic, sympy for the symbolic part).
# It was written BEFORE reading the JavaScript implementation, so the cross-check does not share its code or its bugs.
# Usage:  python oracle.py        -> writes oracle_cases.json and oracle_fuzz.json next to this file
#         node compare.js         -> compares web/js/numerics/* against those files
# Requires: python 3, sympy, mpmath  (pip install sympy mpmath).
import json
import os
import random

import sympy as sp
from mpmath import mp, mpf

mp.dps = 50
SEED = 12345

x, y, t = sp.symbols("x y t")
SYM = {"x": x, "y": y, "t": t}
NS = {"x": x, "y": y, "t": t, "sin": sp.sin, "cos": sp.cos, "exp": sp.exp, "ln": sp.log,
      "sqrt": sp.sqrt, "atan": sp.atan, "tanh": sp.tanh, "sinh": sp.sinh, "cosh": sp.cosh}


def parse(s):
    return sp.sympify(s, locals=NS)


def make_total_derivs(f, ind, upto):
    """y', y'', ... as expressions: D(g) = g_x + g_y * f applied repeatedly."""
    ds = [f]
    for _ in range(upto - 1):
        g = ds[-1]
        ds.append(sp.diff(g, ind) + sp.diff(g, y) * f)
    return ds


def lam(expr, ind):
    return sp.lambdify((ind, y), expr, "mpmath")


def integrate(method, fs, x0, y0, h, n_steps):
    """fs = lambdified [f, y'', y''', y'''']; returns the list of y_n (x_n = x0 + n*h, never accumulated)."""
    f = fs[0]
    ys = [mpf(y0)]
    X0, H = mpf(x0), mpf(h)
    for n in range(n_steps):
        xn, yn = X0 + n * H, ys[-1]
        if method == "euler":
            y1 = yn + H * f(xn, yn)
        elif method == "heun":  # Euler Mejorado: trapezoid with Euler predictor
            k = f(xn, yn)
            y1 = yn + H / 2 * (k + f(xn + H, yn + H * k))
        elif method == "rk2":  # RK2 punto medio; k1 already contains h
            k1 = H * f(xn, yn)
            y1 = yn + H * f(xn + H / 2, yn + k1 / 2)
        elif method.startswith("taylor"):
            p = int(method[-1])
            y1, fact = yn, mpf(1)
            for k in range(1, p + 1):
                fact *= k
                y1 += H**k / fact * fs[k - 1](xn, yn)
        else:
            raise ValueError(method)
        ys.append(y1)
    return ys


# (name, f, indep, x0, y0, h, N)
CASES = [
    ("a1_a4_2xy_N3", "2*x*y", "x", "1", "1", "0.1", 3),
    ("a2_euler_sint", "sin(t)+exp(-t)", "t", "0", "0", "0.5", 2),
    ("a3_heun_lin", "-y+x+1", "x", "0", "1", "0.5", 2),
    ("p5_1a", "-3*x**2*y", "x", "0", "3", "0.1", 5),
    ("p5_1b", "(1+y**2)/4", "x", "0", "1", "0.1", 5),
    ("p5_1d", "(y**2+y)/t", "t", "1", "-2", "0.5", 4),
    ("p5_2a", "-y+x+1", "x", "0", "1", "0.1", 10),
    ("p5_2c", "(x-y)**2", "x", "2", "0.5", "0.25", 3),
    ("p5_2d_a", "x*y**2-y/x", "x", "1", "1", "0.1", 5),
    ("p5_2d_b", "x*y**2-y/x", "x", "1", "1", "0.05", 5),
    ("p5_2e_a", "2*x-3*y+1", "x", "1", "5", "0.1", 5),
    ("p5_2e_b", "2*x-3*y+1", "x", "1", "5", "0.05", 5),
    ("p5_3a_2xy_N5", "2*x*y", "x", "1", "1", "0.1", 5),
    ("p5_3b", "(x+y-1)**2", "x", "0", "2", "0.1", 5),
    ("p5_3c", "x+y**2", "x", "0", "0", "0.1", 5),
    ("p5_3e", "-t*y+4*t/y", "t", "0", "1", "0.25", 4),
    ("lin_m2", "-2*y", "x", "0", "1", "0.1", 10),
    ("lin_m10_unstable", "-10*y", "x", "0", "1", "0.3", 4),
]
METHODS = ["euler", "taylor2", "heun", "rk2", "taylor3", "taylor4"]

# Closed forms (mpmath-evaluable strings) used for the residual self-check below.
EXACT = {
    "a1_a4_2xy_N3": ("exp(x**2-1)", "x"),
    "a2_euler_sint": ("2-cos(t)-exp(-t)", "t"),
    "a3_heun_lin": ("x+exp(-x)", "x"),
    "p5_1a": ("3*exp(-x**3)", "x"),
    "p5_1b": ("tan(x/4+pi/4)", "x"),
    "p5_1d": ("2*t/(1-2*t)", "t"),
    "p5_2a": ("x+exp(-x)", "x"),
    "p5_2c": ("x-coth(x+log(5)/2-2)", "x"),
    "p5_2d_a": ("1/(x*(2-x))", "x"),
    "p5_2e_a": ("2*x/3+mpf(1)/9+mpf(38)/9*exp(-3*(x-1))", "x"),
    "p5_3b": ("tan(x+pi/4)-x+1", "x"),
    "p5_3e": ("sqrt(4-3*exp(-t**2))", "t"),
    "lin_m2": ("exp(-2*x)", "x"),
    "lin_m10_unstable": ("exp(-10*x)", "x"),
}


def exact_residuals():
    """For each closed form: initial-condition error and the worst ODE residual at 7 points of the interval."""
    import mpmath
    rows = []
    for name, f, ind, x0, y0, h, n_steps in CASES:
        if name not in EXACT:
            continue
        src, _var = EXACT[name]
        fn = sp.lambdify((SYM[ind], y), sp.sympify(f, locals=NS), "mpmath")
        g = lambda v: eval(src, {**vars(mpmath), "x": v, "t": v, "mpf": mpf})  # noqa: E731 (trusted literals above)
        xs0 = mpf(x0)
        ic = abs(g(xs0) - mpf(y0))
        res = 0
        for k in range(1, 8):
            xv = xs0 + mpf(k) * mpf(h) * n_steps / 8
            res = max(res, abs(mpmath.diff(g, xv) - fn(xv, g(xv))))
        rows.append((name, float(ic), float(res)))
    return rows


def build_cases():
    out = []
    for name, f, ind, x0, y0, h, n_steps in CASES:
        ds = make_total_derivs(parse(f), SYM[ind], 4)
        fs = [lam(d, SYM[ind]) for d in ds]
        entry = {"name": name, "f": f, "indep": ind, "x0": float(x0), "y0": float(y0), "h": float(h), "N": n_steps, "results": {}}
        for m in METHODS:
            entry["results"][m] = [float(v) for v in integrate(m, fs, x0, y0, h, n_steps)]
        out.append(entry)
    return out


# ---------- fuzz corpus for parse / diff / totalDerivative ----------
def gen(rng, depth):
    if depth == 0 or rng.random() < 0.18:
        return rng.choice(["x", "y", "x", "y", "2", "0.5", "1.5", "3"])
    k = rng.random()
    a = lambda: gen(rng, depth - 1)  # noqa: E731
    if k < 0.18: return f"({a()}+{a()})"
    if k < 0.30: return f"({a()}-{a()})"
    if k < 0.48: return f"({a()}*{a()})"
    if k < 0.56: return f"({a()}/(1+({a()})**2))"
    if k < 0.64: return f"({a()})**{rng.choice([2, 3])}"
    if k < 0.70: return f"sin({a()})"
    if k < 0.76: return f"cos({a()})"
    if k < 0.81: return f"exp(0.3*({a()}))"
    if k < 0.86: return f"ln(1+({a()})**2)"
    if k < 0.90: return f"sqrt(1+({a()})**2)"
    if k < 0.94: return f"atan({a()})"
    if k < 0.97: return f"tanh({a()})"
    return f"sinh(0.4*({a()}))"


def build_fuzz(n=70):
    rng = random.Random(SEED)
    out = []
    while len(out) < n:
        s = gen(rng, 3)
        F = parse(s)
        if not (F.has(x) or F.has(y)):
            continue
        d1 = sp.diff(F, x) + sp.diff(F, y) * F
        d2 = sp.diff(d1, x) + sp.diff(d1, y) * F
        fn = [sp.lambdify((x, y), e, "mpmath") for e in (F, sp.diff(F, x), sp.diff(F, y), d1, d2)]
        pts = []
        for _ in range(3):
            xv, yv = mpf(rng.uniform(0.6, 1.6)), mpf(rng.uniform(0.6, 1.6))
            vals = [f_(xv, yv) for f_ in fn]
            pts.append({"x": float(xv), "y": float(yv), "f": float(vals[0]), "fx": float(vals[1]), "fy": float(vals[2]),
                        "d1": float(vals[3]), "d2": float(vals[4])})
        js = s.replace("**", "^") if rng.random() < 0.5 else s
        out.append({"s": s, "sJs": js, "pts": pts})
    return out


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    print("closed-form self-check (IC error, max ODE residual at 7 points):")
    for name, ic, res in exact_residuals():
        print(f"  {'OK ' if ic < 1e-25 and res < 1e-20 else 'BAD'} {name:18s} ic={ic:.1e} res={res:.1e}")
    cases = build_cases()
    with open(os.path.join(here, "oracle_cases.json"), "w") as fh:
        json.dump(cases, fh)
    print("cases:", len(cases), "x methods:", len(METHODS))
    fuzz = build_fuzz()
    with open(os.path.join(here, "oracle_fuzz.json"), "w") as fh:
        json.dump(fuzz, fh)
    print("fuzz expressions:", len(fuzz))
