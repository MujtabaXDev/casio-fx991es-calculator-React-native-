// Turn computed values into display descriptions the LCD can render.
//
// Display kinds:
//   {k:'dec', neg, mant, exp}           decimal (exp = power of ten or null)
//   {k:'frac', neg, whole, n, d}        fraction / mixed fraction (whole may be null)
//   {k:'surd', neg, a, b, c}            a√b / c
//   {k:'pi', neg, a, c}                 aπ / c
//   {k:'qsurd', neg, p, q, r, d}        (p ± q√r) / d   (q may be negative)
//   {k:'cplx', re, im}                  re / im are displays (im without the i), either may be null
//   {k:'polar', r, th}
//   {k:'dms', neg, d, m, s}
//   {k:'text', s}
//   {k:'list', items:[{label, disp}]}
import { isCx, isMat, isVec } from "./evaluate";

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const digits = (n) => String(Math.abs(n)).length;

/* ---------------- decimal formatting ---------------- */
function trimZeros(s) {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
function sciParts(x, sig, keepZeros = false) {
  const [m, e] = x.toExponential(sig - 1).split("e");
  return { mant: keepZeros ? m : trimZeros(m), exp: Number(e) };
}

export function formatDecimal(x, setup, eng = null) {
  const neg = x < 0 || Object.is(x, -0);
  const a = Math.abs(x);
  const out = (mant, exp = null) => ({ k: "dec", neg: neg && !(mant === "0" && exp === null), mant: mant.replace(/^-/, ""), exp });
  if (eng !== null && a !== 0) {
    // engineering notation, `eng` = extra shift (0 = normal ENG, +1 = one step left …)
    const base = Math.floor(Math.log10(a) / 3) * 3 - eng * 3;
    const m = Number((a / Math.pow(10, base)).toPrecision(10));
    const decimals = Math.max(0, Math.min(20, 9 - Math.floor(Math.log10(m))));
    return out(trimZeros(m.toFixed(decimals)), base);
  }
  const disp = setup?.disp || { type: "norm", n: 1 };
  if (a === 0) {
    if (disp.type === "fix") return out((0).toFixed(disp.n));
    if (disp.type === "sci") return out((0).toFixed(Math.max(0, (disp.n || 10) - 1)), 0);
    return out("0");
  }
  if (disp.type === "sci") {
    const { mant, exp } = sciParts(a, disp.n || 10, true);
    return out(mant, exp);
  }
  if (disp.type === "fix") {
    if (a >= 1e10) return out(sciParts(a, 10).mant, sciParts(a, 10).exp);
    const s = a.toFixed(disp.n);
    if (Number(s) === 0) {
      // too small for Fix: switch to exponent display like the calculator does
      const p = sciParts(a, Math.max(1, disp.n));
      return out(p.mant, p.exp);
    }
    return out(s);
  }
  const lo = disp.n === 2 ? 1e-9 : 1e-2;
  const r = Number(a.toPrecision(10));
  if (r < lo || r >= 1e10) {
    const p = sciParts(a, 10);
    return out(p.mant, p.exp);
  }
  // plain notation with at most 10 significant digits
  // the leading "0." of numbers below 1 does not count as a digit
  const decimals = Math.max(0, 10 - (Math.floor(Math.log10(r)) + 1));
  return out(trimZeros(r.toFixed(Math.min(decimals, 20))));
}

/* ---------------- exact forms ---------------- */
export function toFraction(x, maxDen = 1e6, tol = 1e-11) {
  if (!Number.isFinite(x)) return null;
  const v = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(v - h1 / k1) <= 1e-12 * Math.max(1, v)) break;
    const f = b - a;
    if (f < 1e-14) break;
    b = 1 / f;
  }
  if (k1 === 0 || Math.abs(v - h1 / k1) > tol * Math.max(1, v)) return null;
  return { n: (x < 0 ? -1 : 1) * h1, d: k1 };
}
function squareFree(n) {
  let a = 1, b = n;
  for (let k = 2; k * k <= b; k++) {
    while (b % (k * k) === 0) { b /= k * k; a *= k; }
  }
  return { a, b };
}
function fracDisp(f, setup) {
  if (digits(f.n) + digits(f.d) > 10 || f.d === 1) return null;
  const neg = f.n < 0;
  const n = Math.abs(f.n);
  if (setup?.frac === "abc" && n > f.d) {
    return { k: "frac", neg, whole: String(Math.floor(n / f.d)), n: String(n % f.d), d: String(f.d) };
  }
  return { k: "frac", neg, whole: null, n: String(n), d: String(f.d) };
}
function surdDisp(x) {
  const sq = toFraction(x * x, 10000);
  if (!sq || sq.n <= 0) return null;
  // √(p/q) = √(p·q)/q
  const radicand = sq.n * sq.d;
  if (radicand > 1e9) return null;
  const { a, b } = squareFree(radicand);
  if (b === 1) return null;
  let num = a, den = sq.d;
  const g = gcd(num, den);
  num /= g; den /= g;
  if (b > 9999 || num > 999 || den > 999) return null;
  const check = (num * Math.sqrt(b)) / den;
  if (Math.abs(check - Math.abs(x)) > 1e-10 * Math.abs(x)) return null;
  return { k: "surd", neg: x < 0, a: num === 1 ? "" : String(num), b: String(b), c: den === 1 ? null : String(den) };
}
// square-free radicands 2…99
const RADICANDS = Array.from({ length: 98 }, (_, i) => i + 2).filter((n) => squareFree(n).a === 1);
/** (p ± q√r) / d with small integers, e.g. 1+√2 or (1+√3)/2. */
function qsurdDisp(x) {
  for (let d = 1; d <= 50; d++) {
    const y = x * d;
    for (const r of RADICANDS) {
      const sr = Math.sqrt(r);
      for (let q = 1; q <= 50; q++) {
        for (const sgn of [1, -1]) {
          const p = y - sgn * q * sr;
          const pr = Math.round(p);
          if (pr === 0 || Math.abs(pr) > 9999) continue;
          if (Math.abs(p - pr) <= 5e-14 * Math.max(1, Math.abs(y), q * sr)) {
            // the first d found is the smallest, so the form is already reduced
            return { k: "qsurd", neg: false, p: pr, q: sgn * q, r, d };
          }
        }
      }
    }
  }
  return null;
}
function piDisp(x) {
  const f = toFraction(x / Math.PI, 1000);
  if (!f || f.n === 0 || Math.abs(f.n) > 9999) return null;
  if (Math.abs((f.n / f.d) * Math.PI - x) > 1e-10 * Math.abs(x)) return null;
  const a = Math.abs(f.n);
  return { k: "pi", neg: f.n < 0, a: a === 1 ? "" : String(a), c: f.d === 1 ? null : String(f.d) };
}

/** Exact (fraction / surd / π) display for a real value, or null. */
export function exactDisplay(x, flags, setup) {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (flags?.inexact) return null;
  if (Number.isInteger(x)) return null;
  if (flags?.numeric) {
    // ∫ / d/dx carry small numerical errors: accept only simple fractions
    const f = toFraction(x, 1000, 1e-10);
    return f && f.d !== 1 ? fracDisp(f, setup) : null;
  }
  const v = Number(x.toPrecision(14));
  const f = toFraction(v, 1e6, 1e-13);
  if (f && f.d !== 1) {
    const fd = fracDisp(f, setup);
    if (fd) return fd;
  }
  if (flags?.surd) {
    const s = surdDisp(v) || qsurdDisp(x);
    if (s) return s;
  }
  if (flags?.pi) {
    const pd = piDisp(v);
    if (pd) return pd;
  }
  return null;
}

/** Fraction-only conversion used by S⇔D on a decimal result. */
export function fractionDisplay(x, setup) {
  if (typeof x !== "number" || Number.isInteger(x)) return null;
  const f = toFraction(Number(x.toPrecision(10)), 1e9);
  return f ? fracDisp(f, setup) : null;
}

/* ---------------- DMS ---------------- */
export function dmsDisplay(x) {
  const neg = x < 0;
  let a = Math.abs(x);
  let d = Math.floor(a);
  let mFull = (a - d) * 60;
  let m = Math.floor(mFull + 1e-9);
  let s = Number(((mFull - m) * 60).toFixed(2));
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  if (d >= 1e7) return null;
  return { k: "dms", neg, d: String(d), m: String(m), s: String(Number(s.toFixed(2))) };
}

/* ---------------- BASE-N ---------------- */
export function baseDisplay(v, base) {
  if (!Number.isInteger(v)) v = Math.trunc(v);
  if (base === "DEC") {
    if (v > 2147483647 || v < -2147483648) return null;
    return { k: "text", s: String(v) };
  }
  if (base === "BIN") {
    if (v > 32767 || v < -32768) return null;
    return { k: "text", s: ((v + 0x10000) & 0xffff).toString(2).padStart(16, "0") };
  }
  // HEX / OCT are signed 32-bit like DEC: 7FFFFFFF + 1 overflows (FFFFFFFF is −1)
  if (v > 2147483647 || v < -2147483648) return null;
  const u = v >>> 0;
  return { k: "text", s: base === "HEX" ? u.toString(16).toUpperCase().padStart(8, "0") : u.toString(8).padStart(11, "0") };
}

/* ---------------- main entry ---------------- */
/**
 * opts: { exact: bool (prefer exact form), eng: number|null, dms: bool, cplxFormat }
 */
export function formatValue(value, flags, setup, opts = {}) {
  if (isMat(value) || isVec(value)) return { k: "text", s: isMat(value) ? "MatAns" : "VctAns" };
  if (value && value.multi) {
    return {
      k: "list",
      items: value.multi.map(([label, v]) => ({ label, disp: formatReal(v, flags, setup, opts) })),
    };
  }
  // an explicit ▶r∠θ also converts a real result (−1 ▶r∠θ = 1∠180)
  if (typeof value === "number" && opts.cplxFormat === "polar") value = { cx: true, re: value, im: 0 };
  if (isCx(value)) {
    const polar = (opts.cplxFormat || setup?.cplx) === "polar";
    if (polar) {
      const r = Math.hypot(value.re, value.im);
      const unit = setup?.angle || "D";
      const k = unit === "D" ? 180 / Math.PI : unit === "G" ? 200 / Math.PI : 1;
      const th = Math.atan2(value.im, value.re) * k;
      return { k: "polar", r: formatReal(r, { ...flags, surd: true }, setup, opts), th: formatReal(th, { ...flags, pi: true, surd: true }, setup, opts) };
    }
    return {
      k: "cplx",
      re: value.re === 0 ? null : formatReal(value.re, flags, setup, opts),
      im: value.im === 0 ? null : formatReal(value.im, flags, setup, opts),
    };
  }
  return formatReal(value, flags, setup, opts);
}

export function formatReal(x, flags, setup, opts = {}) {
  if (opts.dms) {
    const d = dmsDisplay(x);
    if (d) return d;
  }
  if (opts.eng === null || opts.eng === undefined) {
    if (opts.exact !== false && setup?.io !== "line") {
      const ex = exactDisplay(x, flags, setup);
      if (ex) return ex;
    }
    if (opts.exact !== false && setup?.io === "line" && !flags?.inexact && !flags?.surd && !flags?.pi) {
      // Line I/O still shows simple fractions (as a⌟b)
      const f = toFraction(Number(x.toPrecision(14)));
      if (f && f.d !== 1 && !Number.isInteger(x)) {
        const fd = fracDisp(f, setup);
        if (fd) return fd;
      }
    }
    if (opts.forceFraction) {
      const fd = fractionDisplay(x, setup);
      if (fd) return fd;
    }
  }
  return formatDecimal(x, setup, opts.eng ?? null);
}

/** Linear text of a display (used for tests, Line I/O and table cells). */
export function dispText(d) {
  if (!d) return "";
  const sgn = (neg) => (neg ? "-" : "");
  switch (d.k) {
    case "dec": return `${sgn(d.neg)}${d.mant}${d.exp !== null && d.exp !== undefined ? `E${d.exp}` : ""}`;
    case "frac": return `${sgn(d.neg)}${d.whole ? `${d.whole}⌟` : ""}${d.n}/${d.d}`;
    case "surd": return `${sgn(d.neg)}${d.a}√${d.b}${d.c ? `/${d.c}` : ""}`;
    case "pi": return `${sgn(d.neg)}${d.a}π${d.c ? `/${d.c}` : ""}`;
    case "qsurd": {
      const s = `${d.p}${d.q < 0 ? "-" : "+"}${Math.abs(d.q) === 1 ? "" : Math.abs(d.q)}√${d.r}`;
      return `${sgn(d.neg)}${d.d !== 1 ? `(${s})/${d.d}` : s}`;
    }
    case "cplx": {
      if (!d.re && !d.im) return "0";
      const re = d.re ? dispText(d.re) : "";
      if (!d.im) return re;
      let im = dispText(d.im);
      const neg = im.startsWith("-");
      if (neg) im = im.slice(1);
      if (im === "1") im = "";
      return `${re}${re ? (neg ? "-" : "+") : neg ? "-" : ""}${im}i`;
    }
    case "polar": return `${dispText(d.r)}∠${dispText(d.th)}`;
    case "dms": return `${sgn(d.neg)}${d.d}°${d.m}°${d.s}°`;
    case "text": return d.s;
    case "list": return d.items.map((i) => `${i.label}=${dispText(i.disp)}`).join(", ");
    default: return "";
  }
}
