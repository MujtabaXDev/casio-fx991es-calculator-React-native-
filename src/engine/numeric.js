// Numerical algorithms used by the evaluator and the mode screens.

/* ---------- integration: adaptive Gauss–Kronrod (7/15) ---------- */
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
  0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
  0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0.0,
];
const WGK = [
  0.022935322010529224963732008058970, 0.063092092629978553290700663189204,
  0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
  0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [
  0.129484966168869693270611432679082, 0.279705391489276667901467771423780,
  0.381830050505118944950369775488975, 0.417959183673469387755102040816327,
];

function gk15(f, a, b) {
  const c = (a + b) / 2, h = (b - a) / 2;
  const fc = f(c);
  let resK = fc * WGK[7], resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const f1 = f(c - dx), f2 = f(c + dx);
    resK += WGK[j] * (f1 + f2);
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (f1 + f2);
  }
  return { value: resK * h, err: Math.abs((resK - resG) * h) };
}

/* tanh-sinh (double exponential) quadrature: very accurate for smooth integrands and
   for singularities at the end points (∫₀¹ 1/√x, ∫₀¹ ln x). Returns null if it does not converge. */
function tanhSinh(f, a, b, tol) {
  const c = (a + b) / 2, h = (b - a) / 2;
  const HALF_PI = Math.PI / 2;
  // contribution of the node pair ±t (distance from the ends computed without cancellation)
  const pair = (t) => {
    const u = HALF_PI * Math.sinh(t);
    const e = Math.exp(-2 * u);
    const dist = (h * 2 * e) / (1 + e); // = h·(1 − tanh u)
    if (Math.abs(dist) < 1e-300) return null;
    const w = (HALF_PI * Math.cosh(t) * 4 * e) / ((1 + e) * (1 + e));
    // each end is followed while its node is still distinct from the end point
    // (near 0 that is far closer than near 1, which matters for ∫₀¹ 1/√x)
    const side = (x, end) => {
      if (x === end) return 0;
      try {
        return f(x);
      } catch (err) {
        // overflow right next to a singular end point (1/√x at 1E-200): the tail is negligible
        if (err.message !== "Time Out" && Math.abs(dist) < 1e-8 * Math.abs(h)) return 0;
        throw err;
      }
    };
    const xl = a + dist, xr = b - dist;
    if (xl === a && xr === b) return null;
    return w * (side(xl, a) + side(xr, b));
  };
  let step = 0.5;
  let sum = HALF_PI * f(c);
  for (let t = step; t <= 6.5; t += step) {
    const v = pair(t);
    if (v === null) break;
    sum += v;
  }
  let prev = sum * step * h;
  for (let level = 1; level <= 9; level++) {
    step /= 2;
    for (let t = step; t <= 6.5; t += 2 * step) {
      const v = pair(t);
      if (v === null) break;
      sum += v;
    }
    const cur = sum * step * h;
    if (level >= 3 && Math.abs(cur - prev) <= tol) return cur;
    prev = cur;
  }
  return null;
}

export function integrate(f, a, b, tol = 1e-11) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Math ERROR");
  if (a === b) return 0;
  let calls = 0;
  const safe = (x) => {
    calls++;
    if (calls > 200000) throw new Error("Time Out");
    const y = f(x);
    if (typeof y !== "number" || !Number.isFinite(y)) throw new Error("Math ERROR");
    return y;
  };
  try {
    const r = tanhSinh(safe, a, b, tol * 0.1 * Math.max(1, Math.abs(b - a)));
    if (r !== null) return r;
  } catch (e) {
    if (e.message === "Time Out") throw e;
    // e.g. undefined near an end point: let Gauss–Kronrod decide
  }
  calls = 0;
  const rec = (lo, hi, whole, depth, eps) => {
    const mid = (lo + hi) / 2;
    const L = gk15(safe, lo, mid), R = gk15(safe, mid, hi);
    const sum = L.value + R.value;
    if (depth > 40 || Math.abs(sum - whole.value) <= Math.max(eps, 1e-15 * Math.abs(sum)) || L.err + R.err <= eps * 0.5) {
      return sum;
    }
    return rec(lo, mid, L, depth + 1, eps / 2) + rec(mid, hi, R, depth + 1, eps / 2);
  };
  return rec(a, b, gk15(safe, a, b), 0, tol * Math.max(1, Math.abs(b - a)));
}

/* ---------- derivative: central differences + Richardson extrapolation ---------- */
export function derivative(f, x) {
  if (!Number.isFinite(x)) throw new Error("Math ERROR");
  let h = 1e-2 * Math.max(1, Math.abs(x));
  const D = (step) => (f(x + step) - f(x - step)) / (2 * step);
  // Neville tableau
  const T = [[D(h)]];
  let best = T[0][0], bestErr = Infinity;
  for (let i = 1; i < 8; i++) {
    h /= 2;
    T[i] = [D(h)];
    let fac = 4;
    for (let j = 1; j <= i; j++) {
      T[i][j] = T[i][j - 1] + (T[i][j - 1] - T[i - 1][j - 1]) / (fac - 1);
      fac *= 4;
      const err = Math.max(Math.abs(T[i][j] - T[i][j - 1]), Math.abs(T[i][j] - T[i - 1][j - 1]));
      if (err < bestErr) { bestErr = err; best = T[i][j]; }
    }
    if (Math.abs(T[i][i] - T[i - 1][i - 1]) >= 2 * bestErr && i > 3) break;
  }
  if (!Number.isFinite(best)) throw new Error("Math ERROR");
  return best;
}

/* ---------- equation solver (SOLVE): Newton with secant / bisection fallback ---------- */
export function solve(F, x0) {
  const ok = (v) => typeof v === "number" && Number.isFinite(v);
  const tryF = (x) => { try { const v = F(x); return ok(v) ? v : NaN; } catch { return NaN; } };
  const starts = [x0, x0 + 1, x0 - 1, 0, 1, -1, 10, -10, 100, -100, 0.5, -0.5, 1000, -1000];
  for (const s of starts) {
    if (!ok(s)) continue;
    let x = s;
    let fx = tryF(x);
    for (let i = 0; i < 200 && ok(fx); i++) {
      if (fx === 0) return { x, lr: 0 };
      const h = 1e-7 * Math.max(1, Math.abs(x));
      const d = (tryF(x + h) - tryF(x - h)) / (2 * h);
      if (!ok(d) || d === 0) break;
      let step = fx / d;
      // damped step
      let nx = x - step, nfx = tryF(nx), k = 0;
      while ((!ok(nfx) || Math.abs(nfx) > Math.abs(fx)) && k < 30) { step /= 2; nx = x - step; nfx = tryF(nx); k++; }
      if (!ok(nfx)) break;
      const converged = Math.abs(nx - x) <= 1e-13 * Math.max(1, Math.abs(nx));
      x = nx; fx = nfx;
      if (converged) break;
    }
    if (ok(fx) && Math.abs(fx) < 1e-8 * Math.max(1, Math.abs(x))) return { x, lr: fx };
  }
  throw new Error("Can't Solve");
}

/* ---------- polynomial roots (degree 2 / 3) ---------- */
// returns roots as {re, im}
export function quadraticRoots(a, b, c) {
  if (a === 0) throw new Error("Math ERROR");
  const D = b * b - 4 * a * c;
  if (D >= 0) {
    const s = Math.sqrt(D);
    // numerically stable form
    const q = -0.5 * (b + (b >= 0 ? s : -s));
    let x1 = q / a, x2 = q !== 0 ? c / q : -b / (2 * a);
    if (x1 < x2) [x1, x2] = [x2, x1];
    if (D === 0) x1 = x2 = -b / (2 * a);
    return [{ re: x1, im: 0 }, { re: x2, im: 0 }];
  }
  const re = -b / (2 * a), im = Math.sqrt(-D) / (2 * Math.abs(a));
  return [{ re, im }, { re, im: -im }];
}

export function cubicRoots(a, b, c, d) {
  if (a === 0) throw new Error("Math ERROR");
  const B = b / a, Cc = c / a, Dd = d / a;
  // one real root via Newton on a good start (Cardano for start)
  const f = (x) => ((x + B) * x + Cc) * x + Dd;
  const df = (x) => (3 * x + 2 * B) * x + Cc;
  const p = Cc - (B * B) / 3, q = (2 * B * B * B) / 27 - (B * Cc) / 3 + Dd;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  // Multiple roots are ill-conditioned for the general method (error ≈ √ε or ∛ε),
  // so detect them and use the closed forms of the depressed cubic t³ + pt + q.
  const tiny = (v, ...scale) => Math.abs(v) <= 1e-12 * Math.max(...scale.map(Math.abs));
  const pZero = tiny(p, Cc, (B * B) / 3), qZero = tiny(q, (2 * B * B * B) / 27, (B * Cc) / 3, Dd);
  if (pZero && qZero) return [{ re: -B / 3, im: 0 }];
  if (!pZero && tiny(disc, (q * q) / 4, (p * p * p) / 27)) {
    const single = (3 * q) / p - B / 3, double = (-3 * q) / (2 * p) - B / 3;
    return [{ re: single, im: 0 }, { re: double, im: 0 }].sort((u, v) => v.re - u.re);
  }
  let x;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    x = Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) - B / 3;
  } else {
    const r = Math.sqrt(-(p * p * p) / 27);
    const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
    x = 2 * Math.cbrt(r) * Math.cos(phi / 3) - B / 3;
  }
  for (let i = 0; i < 60; i++) {
    const d1 = df(x);
    if (d1 === 0) break;
    const nx = x - f(x) / d1;
    if (Math.abs(nx - x) <= 1e-16 * Math.max(1, Math.abs(x))) { x = nx; break; }
    x = nx;
  }
  // deflate: x² + (B + x)·X + (Cc + x(B + x))
  const qb = B + x, qc = Cc + x * qb;
  const rest = quadraticRoots(1, qb, qc);
  const roots = [{ re: x, im: 0 }, ...rest];
  // order like the calculator: real roots descending first, then complex
  const reals = roots.filter((r) => r.im === 0).sort((u, v) => v.re - u.re);
  const cplx = roots.filter((r) => r.im !== 0);
  return [...reals, ...cplx];
}

/* ---------- linear systems (Gaussian elimination with pivoting) ---------- */
export function solveLinear(M) {
  const n = M.length;
  const A = M.map((r) => r.slice());
  const scale = Math.max(...A.flatMap((r) => r.slice(0, n).map(Math.abs)));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) <= 1e-12 * scale) throw new Error("No Solution");
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = A[r][col] / A[col][col];
      for (let c = col; c <= n; c++) A[r][c] -= k * A[col][c];
    }
  }
  return A.map((r, i) => r[n] / r[i]);
}

/* ---------- matrices ---------- */
export function det(m) {
  const n = m.length;
  if (n !== m[0].length) throw new Error("Dimension ERROR");
  if (n === 1) return m[0][0];
  let terms;
  if (n === 2) terms = [m[0][0] * m[1][1], -m[0][1] * m[1][0]];
  else terms = m[0].map((v, j) => (j % 2 ? -1 : 1) * v * det(m.slice(1).map((r) => r.filter((_, k) => k !== j))));
  const s = terms.reduce((a, b) => a + b, 0);
  // cancellation noise (e.g. det of [[0.1,0.2],[0.3,0.6]]) is an exact 0
  return Math.abs(s) <= 1e-13 * terms.reduce((a, b) => a + Math.abs(b), 0) ? 0 : s;
}
export function inverse(m) {
  const n = m.length;
  if (n !== m[0].length) throw new Error("Dimension ERROR");
  // singularity is judged relative to the size of the entries, so [[1E-8,0],[0,1E-8]] is invertible
  const scale = Math.max(...m.flat().map(Math.abs));
  if (scale === 0) throw new Error("Math ERROR");
  const A = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const p = A[col][col];
    if (Math.abs(p) <= 1e-12 * scale) throw new Error("Math ERROR");
    for (let c = 0; c < 2 * n; c++) A[col][c] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = A[r][col];
      for (let c = 0; c < 2 * n; c++) A[r][c] -= k * A[col][c];
    }
  }
  return A.map((r) => r.slice(n));
}
export const transpose = (m) => m[0].map((_, j) => m.map((r) => r[j]));
export function matMul(a, b) {
  if (a[0].length !== b.length) throw new Error("Dimension ERROR");
  return a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
}

/* ---------- statistics ---------- */
export const STAT_TYPES = [
  { id: "1VAR", label: "1-VAR", twoVar: false },
  { id: "LIN", label: "A+BX", twoVar: true },
  { id: "QUAD", label: "_+CX²", twoVar: true },
  { id: "LOG", label: "ln X", twoVar: true },
  { id: "EXP", label: "e^X", twoVar: true },
  { id: "ABX", label: "A·B^X", twoVar: true },
  { id: "POW", label: "A·X^B", twoVar: true },
  { id: "INV", label: "1/X", twoVar: true },
];

function linFit(xs, ys, ws) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  xs.forEach((x, i) => {
    const w = ws[i], y = ys[i];
    n += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y; syy += w * y * y;
  });
  const Sxx = sxx - (sx * sx) / n, Sxy = sxy - (sx * sy) / n, Syy = syy - (sy * sy) / n;
  if (Sxx === 0) throw new Error("Math ERROR");
  const B = Sxy / Sxx, A = (sy - B * sx) / n;
  const r = Syy === 0 ? NaN : Sxy / Math.sqrt(Sxx * Syy);
  return { A, B, r };
}

/** Compute every statistic the STAT menus can recall. rows: [{x, y, f}] */
export function computeStats(type, rows) {
  const data = rows.filter((r) => r.x !== null && r.x !== undefined);
  const twoVar = STAT_TYPES.find((t) => t.id === type)?.twoVar;
  const xs = data.map((r) => r.x), ys = data.map((r) => (twoVar ? r.y ?? 0 : 0)), ws = data.map((r) => r.f ?? 1);
  const S = {};
  const sum = (fn) => data.reduce((s, _, i) => s + ws[i] * fn(xs[i], ys[i]), 0);
  S.n = ws.reduce((a, b) => a + b, 0);
  S.sumx = sum((x) => x); S.sumx2 = sum((x) => x * x);
  S.sumy = sum((x, y) => y); S.sumy2 = sum((x, y) => y * y); S.sumxy = sum((x, y) => x * y);
  S.sumx3 = sum((x) => x * x * x); S.sumx2y = sum((x, y) => x * x * y); S.sumx4 = sum((x) => x ** 4);
  if (S.n > 0) {
    S.xbar = S.sumx / S.n;
    S.sigx = Math.sqrt(Math.max(0, S.sumx2 / S.n - S.xbar * S.xbar));
    S.sx = S.n > 1 ? Math.sqrt(Math.max(0, (S.sumx2 - S.n * S.xbar * S.xbar) / (S.n - 1))) : undefined;
    S.minX = Math.min(...xs); S.maxX = Math.max(...xs);
    if (twoVar) {
      S.ybar = S.sumy / S.n;
      S.sigy = Math.sqrt(Math.max(0, S.sumy2 / S.n - S.ybar * S.ybar));
      S.sy = S.n > 1 ? Math.sqrt(Math.max(0, (S.sumy2 - S.n * S.ybar * S.ybar) / (S.n - 1))) : undefined;
      S.minY = Math.min(...ys); S.maxY = Math.max(...ys);
    }
  }
  if (!twoVar || S.n < 2) return S;
  try {
    if (type === "LIN") {
      const { A, B, r } = linFit(xs, ys, ws);
      Object.assign(S, { regA: A, regB: B, regr: r });
      S.yhat = (x) => A + B * x;
      S.xhat = (y) => { if (B === 0) throw new Error("Math ERROR"); return (y - A) / B; };
    } else if (type === "QUAD") {
      // least squares for y = A + Bx + Cx²
      const n = S.n;
      const Sxx = S.sumx2 - (S.sumx ** 2) / n, Sxy = S.sumxy - (S.sumx * S.sumy) / n;
      const Sxx2 = S.sumx3 - (S.sumx * S.sumx2) / n, Sx2x2 = S.sumx4 - (S.sumx2 ** 2) / n;
      const Sx2y = S.sumx2y - (S.sumx2 * S.sumy) / n;
      const den = Sxx * Sx2x2 - Sxx2 * Sxx2;
      if (den === 0) throw new Error("Math ERROR");
      const B = (Sxy * Sx2x2 - Sx2y * Sxx2) / den;
      const C = (Sx2y * Sxx - Sxy * Sxx2) / den;
      const A = S.sumy / n - B * (S.sumx / n) - C * (S.sumx2 / n);
      Object.assign(S, { regA: A, regB: B, regC: C });
      S.yhat = (x) => A + B * x + C * x * x;
      const roots = (y) => {
        if (C === 0) throw new Error("Math ERROR");
        const D = B * B - 4 * C * (A - y);
        if (D < 0) throw new Error("Math ERROR");
        return [(-B + Math.sqrt(D)) / (2 * C), (-B - Math.sqrt(D)) / (2 * C)];
      };
      S.xhat1 = (y) => roots(y)[0];
      S.xhat2 = (y) => roots(y)[1];
    } else {
      const tf = {
        LOG: { fx: Math.log, fy: (y) => y },
        EXP: { fx: (x) => x, fy: Math.log },
        ABX: { fx: (x) => x, fy: Math.log },
        POW: { fx: Math.log, fy: Math.log },
        INV: { fx: (x) => 1 / x, fy: (y) => y },
      }[type];
      const tx = xs.map(tf.fx), ty = ys.map(tf.fy);
      if (![...tx, ...ty].every(Number.isFinite)) throw new Error("Math ERROR");
      const fit = linFit(tx, ty, ws);
      let A = fit.A, B = fit.B;
      if (type === "EXP") A = Math.exp(fit.A);
      if (type === "ABX") { A = Math.exp(fit.A); B = Math.exp(fit.B); }
      if (type === "POW") A = Math.exp(fit.A);
      Object.assign(S, { regA: A, regB: B, regr: fit.r });
      const model = {
        LOG: [(x) => A + B * Math.log(x), (y) => Math.exp((y - A) / B)],
        EXP: [(x) => A * Math.exp(B * x), (y) => Math.log(y / A) / B],
        ABX: [(x) => A * B ** x, (y) => Math.log(y / A) / Math.log(B)],
        POW: [(x) => A * x ** B, (y) => (y / A) ** (1 / B)],
        INV: [(x) => A + B / x, (y) => B / (y - A)],
      }[type];
      S.yhat = model[0];
      S.xhat = model[1];
    }
  } catch {
    /* regression not available for this data */
  }
  return S;
}

/* ---------- normal distribution ---------- */
export function normCdf(t) {
  // Abramowitz–Stegun 7.1.26 is too coarse; use erfc with high-precision series/continued fraction
  return 0.5 * erfc(-t / Math.SQRT2);
}
function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 3) {
    // series for erf
    let sum = x, term = x;
    for (let n = 1; n < 200; n++) {
      term *= (-x * x) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  // continued fraction (Lentz)
  let f = x, C = x, D = 0;
  for (let n = 1; n < 300; n++) {
    const an = n / 2;
    D = x + an * D; D = 1 / D;
    C = x + an / C;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (f * Math.sqrt(Math.PI));
}
