// Parser + evaluator working directly on the expression tree.
// Priority follows the fx-991ES PLUS manual ("Calculation Priority Sequence").
import { SYM } from "./symbols";
import { SCI_CONSTS, UNIT_CONVS } from "../data/constants";
import { integrate, derivative, det, inverse, transpose, matMul, normCdf } from "./numeric";

export class CalcError extends Error {}
const err = (kind) => { throw new CalcError(kind); };
const syntaxErr = () => err("Syntax ERROR");
const mathErr = () => err("Math ERROR");
const dimErr = () => err("Dimension ERROR");

/* ============================ VALUES ============================ */
export const cx = (re, im) => ({ cx: true, re, im });
export const isCx = (v) => !!v && v.cx === true;
export const isMat = (v) => !!v && Array.isArray(v.mat);
export const isVec = (v) => !!v && Array.isArray(v.vec);
const isNum = (v) => typeof v === "number";
// Drop rounding noise in one part of a complex number (e.g. (2∠45)² = 8.9E-16+4i → 4i).
function norm(v) {
  if (!isCx(v)) return v;
  const ar = Math.abs(v.re), ai = Math.abs(v.im);
  if (ai <= 1e-15 * Math.max(1, ar) || ai <= 1e-13 * ar) return v.re;
  if (ar <= 1e-13 * ai) return cx(0, v.im);
  return v;
}
const toCx = (v) => (isCx(v) ? v : cx(v, 0));
// a ± b with cancellation noise removed: the calculator works in decimal, so 0.1+0.2−0.3 = 0.
function addNum(a, b) {
  const s = a + b;
  return s !== 0 && Math.abs(s) <= 1e-14 * Math.max(Math.abs(a), Math.abs(b)) ? 0 : s;
}

function checkNum(x) {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e100) mathErr();
  return x;
}
function realOnly(v) {
  if (isNum(v)) return v;
  if (isCx(v)) return v.im === 0 ? v.re : mathErr();
  return syntaxErr();
}

function add(a, b, sign = 1) {
  if (isNum(a) && isNum(b)) return checkNum(addNum(a, sign * b));
  if (isMat(a) && isMat(b)) {
    if (a.mat.length !== b.mat.length || a.mat[0].length !== b.mat[0].length) dimErr();
    return { mat: a.mat.map((r, i) => r.map((v, j) => addNum(v, sign * b.mat[i][j]))) };
  }
  if (isVec(a) && isVec(b)) {
    if (a.vec.length !== b.vec.length) dimErr();
    return { vec: a.vec.map((v, i) => addNum(v, sign * b.vec[i])) };
  }
  if (isMat(a) || isMat(b) || isVec(a) || isVec(b)) return syntaxErr();
  const x = toCx(a), y = toCx(b);
  return norm(cx(checkNum(addNum(x.re, sign * y.re)), checkNum(addNum(x.im, sign * y.im))));
}
function mul(a, b) {
  if (isNum(a) && isNum(b)) return checkNum(a * b);
  if (isMat(a) && isMat(b)) return { mat: matMul(a.mat, b.mat) };
  if (isMat(a) && isNum(b)) return { mat: a.mat.map((r) => r.map((v) => v * b)) };
  if (isNum(a) && isMat(b)) return mul(b, a);
  if (isVec(a) && isVec(b)) {
    // × between vectors = cross product
    if (a.vec.length !== b.vec.length) dimErr();
    if (a.vec.length === 3) {
      const [x1, y1, z1] = a.vec, [x2, y2, z2] = b.vec;
      return { vec: [y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2] };
    }
    return { vec: [0, 0, a.vec[0] * b.vec[1] - a.vec[1] * b.vec[0]] };
  }
  if (isVec(a) && isNum(b)) return { vec: a.vec.map((v) => v * b) };
  if (isNum(a) && isVec(b)) return mul(b, a);
  if (isMat(a) && isVec(b)) {
    if (a.mat[0].length !== b.vec.length) dimErr();
    return { vec: a.mat.map((r) => r.reduce((s, v, k) => s + v * b.vec[k], 0)) };
  }
  if (isMat(a) || isMat(b) || isVec(a) || isVec(b)) return syntaxErr();
  const x = toCx(a), y = toCx(b);
  return norm(cx(checkNum(addNum(x.re * y.re, -x.im * y.im)), checkNum(addNum(x.re * y.im, x.im * y.re))));
}
function div(a, b) {
  if (isNum(a) && isNum(b)) return b === 0 ? mathErr() : checkNum(a / b);
  if ((isMat(a) || isVec(a)) && isNum(b)) return b === 0 ? mathErr() : mul(a, 1 / b);
  if (isMat(a) || isMat(b) || isVec(a) || isVec(b)) return syntaxErr();
  const x = toCx(a), y = toCx(b);
  const d = y.re * y.re + y.im * y.im;
  if (d === 0) mathErr();
  return norm(cx(checkNum(addNum(x.re * y.re, x.im * y.im) / d), checkNum(addNum(x.im * y.re, -x.re * y.im) / d)));
}
function negate(a) {
  if (isNum(a)) return -a;
  if (isCx(a)) return cx(-a.re, -a.im);
  if (isMat(a)) return { mat: a.mat.map((r) => r.map((v) => -v)) };
  if (isVec(a)) return { vec: a.vec.map((v) => -v) };
  return syntaxErr();
}
function powInt(a, n) {
  // integer powers for complex / matrix values
  if (isMat(a)) {
    if (a.mat.length !== a.mat[0].length) dimErr();
    if (n < 0) return powInt({ mat: inverse(a.mat) }, -n);
    let r = { mat: a.mat.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))) };
    for (let k = 0; k < n; k++) r = mul(r, a);
    return r;
  }
  if (n < 0) return div(1, powInt(a, -n));
  let r = 1;
  for (let k = 0; k < n; k++) r = mul(r, a);
  return r;
}

/** Rational approximation p/q with small q (used for (−8)^(1/3)). */
function smallFraction(x, maxDen = 99) {
  for (let q = 1; q <= maxDen; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-12) return { p, q };
  }
  return null;
}
function power(a, b, flags) {
  if (isNum(a) && isNum(b)) {
    if (a === 0 && b <= 0) mathErr();
    if (!Number.isInteger(b)) flags.surd = true;
    if (a < 0 && !Number.isInteger(b)) {
      const f = smallFraction(b);
      if (!f || f.q % 2 === 0) mathErr();
      const mag = Math.pow(-a, b);
      return checkNum(f.p % 2 === 0 ? mag : -mag);
    }
    return checkNum(Math.pow(a, b));
  }
  const n = realOnly(b);
  if (!Number.isInteger(n) || Math.abs(n) > 1e4) mathErr();
  if (isVec(a)) syntaxErr();
  return powInt(a, n);
}
function nthRoot(n, x, flags) {
  flags.surd = true;
  n = realOnly(n); x = realOnly(x);
  if (n === 0) mathErr();
  if (x < 0) {
    if (!Number.isInteger(n) || n % 2 === 0) mathErr();
    return -Math.pow(-x, 1 / n);
  }
  const r = Math.pow(x, 1 / n);
  const rr = Math.round(r);
  return Math.abs(rr - r) < 1e-12 * Math.max(1, r) && Math.abs(Math.pow(rr, n) - x) < 1e-9 * Math.max(1, x) ? rr : r;
}
function factorial(x) {
  x = realOnly(x);
  if (!Number.isInteger(x) || x < 0 || x > 69) mathErr();
  let r = 1;
  for (let k = 2; k <= x; k++) r *= k;
  return r;
}
function perm(n, r) {
  n = realOnly(n); r = realOnly(r);
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < r || n >= 1e10) mathErr();
  let p = 1;
  for (let k = 0; k < r; k++) p = checkNum(p * (n - k));
  return p;
}
function comb(n, r) {
  n = realOnly(n); r = realOnly(r);
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < r || n >= 1e10) mathErr();
  r = Math.min(r, n - r);
  let c = 1;
  for (let k = 1; k <= r; k++) c = (c * (n - r + k)) / k;
  return checkNum(Math.round(c));
}

/* ---------- angle helpers ---------- */
const toRad = (x, unit) => (unit === "D" ? (x * Math.PI) / 180 : unit === "G" ? (x * Math.PI) / 200 : x);
const fromRad = (x, unit) => (unit === "D" ? (x * 180) / Math.PI : unit === "G" ? (x * 200) / Math.PI : x);
const unitFull = (unit) => (unit === "D" ? 360 : unit === "G" ? 400 : 2 * Math.PI);
function trig(fn, x, unit) {
  x = realOnly(x);
  if (Math.abs(x) >= (unit === "R" ? 1e10 * Math.PI / 180 : unit === "G" ? 1e10 * 10 / 9 : 1e10)) mathErr();
  if (unit !== "R") {
    // exact values at multiples of a quarter turn
    const q = unitFull(unit) / 4;
    const k = x / q;
    if (Number.isInteger(k)) {
      const m = ((k % 4) + 4) % 4;
      if (fn === "sin") return [0, 1, 0, -1][m];
      if (fn === "cos") return [1, 0, -1, 0][m];
      if (m % 2 === 1) mathErr();
      return 0;
    }
  }
  const r = toRad(x, unit);
  if (fn === "tan" && Math.abs(Math.cos(r)) < 1e-15) mathErr();
  const v = Math[fn](r);
  return Math.abs(v) < 1e-15 ? 0 : v;
}

/* ============================ TOKENIZER ============================ */
function tokenize(row, ctx) {
  const toks = [];
  for (let i = 0; i < row.length; i++) {
    const it = row[i];
    if (it.t === "digit") {
      let s = it.v;
      while (i + 1 < row.length && row[i + 1].t === "digit") s += row[++i].v;
      toks.push({ type: "num", text: s });
    } else if (it.t === "op") toks.push({ type: "op", v: it.v });
    else if (it.t === "neg") toks.push({ type: "neg" });
    else if (it.t === "sym") {
      const k = SYM[it.v]?.kind;
      if (!k) syntaxErr();
      toks.push({ type: k === "var" ? "value" : k, v: it.v, node: it });
    } else if (it.t === "pow" || it.t === "exp10") toks.push({ type: "postfix", v: it.t, node: it });
    else if (it.t === "func") toks.push({ type: "func", node: it });
    else toks.push({ type: "atom", node: it });
  }
  return toks;
}
const startsOperand = (t) => t && (t.type === "num" || t.type === "value" || t.type === "atom" || t.type === "func" || t.type === "prefix");

/* ============================ PARSER ============================ */
// Produces closures: node(env) -> value. env = { vars } (vars may be overridden for ∫ / Σ).
export function compileRow(row, ctx) {
  const toks = tokenize(row, ctx);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const flags = ctx.flags;

  const parseExpr = () => parseOr();
  const binLoop = (sub, ops) => {
    let left = sub();
    for (;;) {
      const t = peek();
      if (!t || t.type !== "infix" || !ops.includes(t.v)) return left;
      next();
      const right = sub();
      const l = left, op = t.v;
      left = (env) => logic(op, l(env), right(env));
    }
  };
  const logic = (op, a, b) => {
    a = baseInt(a); b = baseInt(b);
    const r = op === "and" ? a & b : op === "or" ? a | b : op === "xor" ? a ^ b : ~(a ^ b);
    return r | 0;
  };
  const baseInt = (v) => {
    v = realOnly(v);
    if (!Number.isInteger(v)) mathErr();
    return v | 0;
  };
  const parseOr = () => binLoop(parseAnd, ["or", "xor", "xnor"]);
  const parseAnd = () => binLoop(parseAdd, ["and"]);
  const parseAdd = () => {
    let left = parseMul();
    for (;;) {
      const t = peek();
      if (!t || t.type !== "op" || (t.v !== "+" && t.v !== "-")) return left;
      next();
      const right = parseMul();
      const l = left, sign = t.v === "+" ? 1 : -1;
      left = (env) => add(l(env), right(env), sign);
    }
  };
  const parseMul = () => {
    let left = parseDot();
    for (;;) {
      const t = peek();
      if (t && t.type === "op" && (t.v === "*" || t.v === "/")) {
        next();
        const right = parseDot();
        const l = left;
        if (t.v === "*") left = (env) => mul(l(env), right(env));
        else if (ctx.base) left = (env) => Math.trunc(realOnly(div(l(env), right(env)))); // BASE-N: integer division
        else left = (env) => div(l(env), right(env));
      } else if (startsOperand(t)) {
        // omitted multiplication sign: same priority as × ÷
        const right = parseDot();
        const l = left;
        left = (env) => mul(l(env), right(env));
      } else return left;
    }
  };
  const parseDot = () => {
    let left = parsePerm();
    for (;;) {
      const t = peek();
      if (!t || t.type !== "infix" || t.v !== "dot") return left;
      next();
      const right = parsePerm();
      const l = left;
      left = (env) => {
        const a = l(env), b = right(env);
        if (!isVec(a) || !isVec(b)) syntaxErr();
        if (a.vec.length !== b.vec.length) dimErr();
        return a.vec.reduce((s, v, i) => s + v * b.vec[i], 0);
      };
    }
  };
  const parsePerm = () => {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (!t || t.type !== "infix" || !["nPr", "nCr", "angle"].includes(t.v)) return left;
      next();
      const right = parseUnary();
      const l = left, op = t.v;
      if (op === "angle") flags.surd = flags.pi = true;
      left = (env) => {
        const a = l(env), b = right(env);
        if (op === "nPr") return perm(a, b);
        if (op === "nCr") return comb(a, b);
        if (!ctx.complex) syntaxErr();
        const r = realOnly(a), th = toRad(realOnly(b), ctx.angle);
        const re = Math.abs(Math.cos(th)) < 1e-15 ? 0 : r * Math.cos(th);
        const im = Math.abs(Math.sin(th)) < 1e-15 ? 0 : r * Math.sin(th);
        return norm(cx(re, im));
      };
    }
  };
  const parseUnary = () => {
    const t = peek();
    if (t && (t.type === "neg" || (t.type === "op" && t.v === "-"))) {
      next();
      const a = parseUnary();
      return (env) => negate(a(env));
    }
    if (t && t.type === "op" && t.v === "+") {
      next();
      return parseUnary();
    }
    if (t && t.type === "prefix") {
      next();
      const n = peek();
      if (!n || n.type !== "num") syntaxErr();
      next();
      const base = { pd: 10, ph: 16, pb: 2, po: 8 }[t.v];
      const v = parseBaseLiteral(n.text, base);
      return parsePostfixOps(() => v);
    }
    return parsePostfix();
  };
  const parsePostfix = () => parsePostfixOps(parsePrimary());

  const parsePostfixOps = (base) => {
    let a = base;
    for (;;) {
      const t = peek();
      if (!t || t.type !== "postfix") return a;
      next();
      const prev = a;
      switch (t.v) {
        case "sq": a = (env) => power(prev(env), 2, flags); break;
        case "cube": a = (env) => power(prev(env), 3, flags); break;
        case "inv": a = (env) => {
          const v = prev(env);
          if (isMat(v)) return { mat: inverse(v.mat) };
          return div(1, v);
        }; break;
        case "fact": a = (env) => factorial(prev(env)); break;
        case "pct": a = (env) => div(prev(env), 100); break;
        case "pow": {
          const e = compileField(t.node.exp);
          a = (env) => power(prev(env), e(env), flags);
          break;
        }
        case "exp10": {
          const e = compileField(t.node.exp);
          a = (env) => {
            const k = realOnly(e(env));
            if (!Number.isInteger(k)) syntaxErr();
            return mul(prev(env), Number(`1e${k}`));
          };
          break;
        }
        case "dms": {
          // d° m° s°  (each part followed by the ° mark)
          const parts = [prev];
          while (parts.length < 3 && peek()?.type === "num" && toks[p + 1]?.type === "postfix" && toks[p + 1].v === "dms") {
            const lit = parseNumberLiteral(next().text);
            next();
            parts.push(() => lit);
          }
          a = (env) => {
            const [d, m = () => 0, s = () => 0] = parts;
            const dv = realOnly(d(env));
            const sign = dv < 0 || Object.is(dv, -0) ? -1 : 1;
            return dv + sign * (realOnly(m(env)) / 60 + realOnly(s(env)) / 3600);
          };
          break;
        }
        case "drgD": case "drgR": case "drgG": {
          const from = t.v === "drgD" ? "D" : t.v === "drgR" ? "R" : "G";
          if (from !== ctx.angle) flags.pi = flags.surd = true;
          a = (env) => fromRad(toRad(realOnly(prev(env)), from), ctx.angle);
          break;
        }
        case "conv": {
          flags.inexact = true;
          const c = UNIT_CONVS.find((u) => u.id === t.node.id);
          a = (env) => {
            const v = realOnly(prev(env));
            if (c.from === "°F") return ((v - 32) * 5) / 9;
            if (c.from === "°C") return (v * 9) / 5 + 32;
            return v * c.factor;
          };
          break;
        }
        case "toPolar": case "toRect":
          if (!ctx.complex) syntaxErr();
          ctx.cplxFormat = t.v === "toPolar" ? "polar" : "rect";
          break;
        case "xhat": case "xhat1": case "xhat2": case "yhat": {
          flags.inexact = true;
          const name = t.v;
          a = (env) => {
            const fn = ctx.stats?.[name];
            if (typeof fn !== "function") mathErr();
            return checkNum(fn(realOnly(prev(env))));
          };
          break;
        }
        case "toT":
          flags.inexact = true;
          a = (env) => {
            const S = ctx.stats;
            if (!S || !S.sigx) mathErr();
            return (realOnly(prev(env)) - S.xbar) / S.sigx;
          };
          break;
        default: syntaxErr();
      }
    }
  };

  const parseNumberLiteral = (text) => {
    if (ctx.base && ctx.base !== "DEC") return parseBaseLiteral(text, { HEX: 16, BIN: 2, OCT: 8 }[ctx.base]);
    if (ctx.base === "DEC") return parseBaseLiteral(text, 10);
    if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) syntaxErr();
    return Number(text);
  };
  const parseBaseLiteral = (text, base) => {
    const valid = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9A-F]+$/ }[base];
    if (!valid.test(text)) syntaxErr();
    const n = parseInt(text, base);
    if (base === 10) {
      if (n > 2147483647) mathErr();
      return n;
    }
    if (base === 2) {
      if (n > 0xffff) mathErr();
      return n >= 0x8000 ? n - 0x10000 : n;
    }
    if (n > 0xffffffff) mathErr();
    return n | 0;
  };

  const compileField = (r) => compileRow(r, ctx).fn;
  const compileArgs = (r) => {
    // split a function body at top-level commas
    const parts = [[]];
    for (const it of r) {
      if (it.t === "sym" && it.v === "comma") parts.push([]);
      else parts[parts.length - 1].push(it);
    }
    return parts.map((part) => {
      if (part.length === 0) syntaxErr();
      return compileField(part);
    });
  };

  const parsePrimary = () => {
    const t = next();
    if (!t) syntaxErr();
    if (t.type === "num") {
      const v = parseNumberLiteral(t.text);
      return () => v;
    }
    if (t.type === "value") return compileValue(t.node);
    if (t.type === "func") return compileFunc(t.node);
    if (t.type === "atom") return compileAtom(t.node);
    return syntaxErr();
  };

  const compileValue = (node) => {
    const v = node.v;
    if (SYM[v]?.kind === "var") return (env) => env.vars[v] ?? 0;
    switch (v) {
      case "Ans": return () => ctx.ans ?? 0;
      case "PreAns": return () => ctx.preAns ?? 0;
      case "pi": flags.pi = true; flags.surd = true; return () => Math.PI;
      case "e": flags.inexact = true; return () => Math.E;
      case "i": if (!ctx.complex) syntaxErr(); return () => cx(0, 1);
      case "Ran": flags.inexact = true; return () => Math.floor(Math.random() * 1000) / 1000;
      case "const": {
        flags.inexact = true;
        const c = SCI_CONSTS.find((k) => k.id === node.id);
        return () => c.value;
      }
      case "MatA": case "MatB": case "MatC": case "MatAns": {
        const key = v.slice(3);
        return () => {
          const m = ctx.mats?.[key];
          if (!m) dimErr();
          return { mat: m };
        };
      }
      case "VctA": case "VctB": case "VctC": case "VctAns": {
        const key = v.slice(3);
        return () => {
          const m = ctx.vcts?.[key];
          if (!m) dimErr();
          return { vec: m };
        };
      }
      default: {
        // statistical variables
        return () => {
          const val = ctx.stats?.[v];
          if (typeof val !== "number" || !Number.isFinite(val)) mathErr();
          return val;
        };
      }
    }
  };

  const compileFunc = (node) => {
    const args = compileArgs(node.body);
    const one = () => { if (args.length !== 1) syntaxErr(); return args[0]; };
    const name = node.name;
    const unit = ctx.angle;
    switch (name) {
      case "sin": case "cos": case "tan": {
        flags.surd = flags.pi = true;
        const a = one();
        return (env) => trig(name, a(env), unit);
      }
      case "asin": case "acos": case "atan": {
        flags.surd = flags.pi = true;
        const a = one();
        return (env) => {
          const x = realOnly(a(env));
          if (name !== "atan" && Math.abs(x) > 1) mathErr();
          return fromRad(Math[name](x), unit);
        };
      }
      case "sinh": case "cosh": case "tanh": case "asinh": case "acosh": case "atanh": {
        flags.inexact = true;
        const a = one();
        return (env) => {
          const x = realOnly(a(env));
          if (name === "acosh" && x < 1) mathErr();
          if (name === "atanh" && Math.abs(x) >= 1) mathErr();
          return checkNum(Math[name](x));
        };
      }
      case "log": case "ln": {
        flags.inexact = true;
        const a = one();
        return (env) => {
          const x = realOnly(a(env));
          if (x <= 0) mathErr();
          if (name === "ln") return Math.log(x);
          const l = Math.log10(x);
          const r = Math.round(l);
          return Math.abs(l - r) < 1e-14 ? r : l;
        };
      }
      case "Pol": case "Rec": {
        flags.surd = flags.pi = true;
        if (args.length !== 2) syntaxErr();
        const [a, b] = args;
        return (env) => {
          const x = realOnly(a(env)), y = realOnly(b(env));
          let r1, r2;
          if (name === "Pol") {
            if (x === 0 && y === 0) mathErr();
            r1 = Math.hypot(x, y);
            r2 = fromRad(Math.atan2(y, x), unit);
          } else {
            r1 = x * trig("cos", y, unit);
            r2 = x * trig("sin", y, unit);
          }
          return { multi: name === "Pol" ? [["r", r1], ["θ", r2]] : [["X", r1], ["Y", r2]], store: [r1, r2] };
        };
      }
      case "Rnd": {
        flags.inexact = true;
        const a = one();
        return (env) => roundToDisplay(realOnly(a(env)), ctx.setup);
      }
      case "RanInt": {
        flags.inexact = true;
        if (args.length !== 2) syntaxErr();
        return (env) => {
          const lo = realOnly(args[0](env)), hi = realOnly(args[1](env));
          if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo >= hi) mathErr();
          return lo + Math.floor(Math.random() * (hi - lo + 1));
        };
      }
      case "arg": case "Conjg": {
        if (!ctx.complex) syntaxErr();
        if (name === "arg") flags.surd = flags.pi = true;
        const a = one();
        return (env) => {
          const z = toCx(a(env));
          if (name === "Conjg") return norm(cx(z.re, -z.im));
          if (z.re === 0 && z.im === 0) mathErr();
          return fromRad(Math.atan2(z.im, z.re), unit);
        };
      }
      case "det": case "Trn": {
        const a = one();
        return (env) => {
          const m = a(env);
          if (!isMat(m)) syntaxErr();
          return name === "det" ? det(m.mat) : { mat: transpose(m.mat) };
        };
      }
      case "Not": case "Neg": {
        const a = one();
        return (env) => {
          const v = baseInt(a(env));
          return name === "Not" ? ~v : -v | 0;
        };
      }
      case "P": case "Q": case "R": {
        flags.inexact = true;
        const a = one();
        return (env) => {
          const t = realOnly(a(env));
          const P = normCdf(t);
          return name === "P" ? P : name === "Q" ? Math.abs(P - 0.5) : 1 - P;
        };
      }
      default:
        return syntaxErr();
    }
  };

  const compileAtom = (node) => {
    switch (node.t) {
      case "group": {
        if (node.body.length === 0) syntaxErr();
        return compileField(node.body);
      }
      case "frac": {
        const n = compileField(node.num), d = compileField(node.den);
        return (env) => div(n(env), d(env));
      }
      case "mixed": {
        const w = compileField(node.whole), n = compileField(node.num), d = compileField(node.den);
        return (env) => {
          const wv = realOnly(w(env)), nv = realOnly(n(env)), dv = realOnly(d(env));
          if (dv === 0) mathErr();
          return wv < 0 ? wv - nv / dv : wv + nv / dv;
        };
      }
      case "sqrt": {
        flags.surd = true;
        const b = compileField(node.body);
        return (env) => {
          const x = b(env);
          if (isCx(x)) mathErr();
          const v = realOnly(x);
          if (v < 0) mathErr();
          return Math.sqrt(v);
        };
      }
      case "root": {
        const n = compileField(node.index), b = compileField(node.body);
        return (env) => nthRoot(n(env), b(env), flags);
      }
      case "tenpow": case "epow": {
        const e = compileField(node.exp);
        if (node.t === "epow") flags.inexact = true;
        return (env) => {
          const x = realOnly(e(env));
          if (node.t === "tenpow") {
            if (!Number.isInteger(x)) flags.inexact = true;
            return checkNum(Number.isInteger(x) ? Number(`1e${x}`) : Math.pow(10, x));
          }
          return checkNum(Math.exp(x));
        };
      }
      case "log": {
        flags.inexact = true;
        const b = compileField(node.base), a = compileField(node.arg);
        return (env) => {
          const bv = realOnly(b(env)), av = realOnly(a(env));
          if (bv <= 0 || bv === 1 || av <= 0) mathErr();
          const r = Math.log(av) / Math.log(bv);
          const rr = Math.round(r);
          return Math.abs(r - rr) < 1e-13 * Math.max(1, Math.abs(r)) ? rr : r;
        };
      }
      case "abs": {
        const b = compileField(node.body);
        return (env) => {
          const v = b(env);
          if (isNum(v)) return Math.abs(v);
          if (isCx(v)) { flags.surd = true; return Math.hypot(v.re, v.im); }
          if (isVec(v)) { flags.surd = true; return Math.hypot(...v.vec); }
          if (isMat(v)) return { mat: v.mat.map((r) => r.map(Math.abs)) };
          return syntaxErr();
        };
      }
      case "integral": {
        // Numerical result: the formatter may still show a simple fraction
        // (e.g. ∫₀^π/3 sin x dx = 1/2) like the real fx-991ES PLUS.
        flags.numeric = true;
        const f = compileField(node.body), lo = compileField(node.lower), hi = compileField(node.upper);
        return (env) => {
          const a = realOnly(lo(env)), b = realOnly(hi(env));
          const vars = { ...env.vars };
          const g = (x) => { vars.X = x; return realOnly(f({ vars })); };
          try {
            const r = integrate(g, a, b);
            return Math.abs(r) < 1e-12 ? 0 : r;
          } catch (e) {
            if (e instanceof CalcError && e.message !== "Math ERROR") throw e;
            if (e.message === "Time Out") throw new CalcError("Time Out");
            return mathErr();
          }
        };
      }
      case "deriv": {
        flags.numeric = true;
        const f = compileField(node.body), pt = compileField(node.point);
        return (env) => {
          const x0 = realOnly(pt(env));
          const vars = { ...env.vars };
          const g = (x) => { vars.X = x; return realOnly(f({ vars })); };
          g(x0); // must be defined at the point
          const d = derivative(g, x0);
          return Math.abs(d) < 1e-11 ? 0 : d;
        };
      }
      case "sum": {
        const f = compileField(node.body), s = compileField(node.start), e = compileField(node.end);
        return (env) => {
          const a = realOnly(s(env)), b = realOnly(e(env));
          if (!Number.isInteger(a) || !Number.isInteger(b) || b < a || b - a > 1e5) mathErr();
          const vars = { ...env.vars };
          let total = 0;
          for (let x = a; x <= b; x++) {
            vars.X = x;
            total = add(total, f({ vars }));
          }
          return total;
        };
      }
      default:
        return syntaxErr();
    }
  };

  if (toks.length === 0) syntaxErr();
  const fn = parseExpr();
  if (p < toks.length) syntaxErr();
  return { fn, flags };
}

// Matrix / vector results: remove floating-point noise so MatA×MatA⁻¹ shows exact 1 and 0.
function cleanEntries(all, rows) {
  const scale = Math.max(...all.map(Math.abs));
  return rows.map((r) => r.map((x) => {
    checkNum(x);
    if (Math.abs(x) <= 1e-13 * scale) return 0;
    return Number(x.toPrecision(13));
  }));
}

/** Round a value as the current display setting would show it (Rnd function). */
export function roundToDisplay(x, setup) {
  if (!setup || x === 0) return x;
  const d = setup.disp;
  if (d.type === "fix") return Number(x.toFixed(d.n));
  if (d.type === "sci") return Number(x.toExponential((d.n || 10) - 1));
  return Number(x.toPrecision(10));
}

/**
 * Evaluate a row. ctx: { angle, complex, base, vars, ans, preAns, mats, vcts, stats, setup }
 * Returns { value, flags }.
 */
export function evaluateRow(row, ctx) {
  const c = { ...ctx, flags: { inexact: false, surd: false, pi: false } };
  try {
    const { fn, flags } = compileRow(row, c);
    let value = fn({ vars: { ...(ctx.vars || {}) } });
    if (isCx(value)) value = norm(value);
    if (isMat(value)) value = { mat: cleanEntries(value.mat.flat(), value.mat) };
    if (isVec(value)) value = { vec: cleanEntries(value.vec, [value.vec])[0] };
    if (isNum(value)) checkNum(value);
    if (isCx(value) && !ctx.complex) mathErr();
    return { value, flags, cplxFormat: c.cplxFormat };
  } catch (e) {
    if (e instanceof CalcError) throw e;
    const msg = String(e?.message || "");
    if (/Dimension/.test(msg)) throw new CalcError("Dimension ERROR");
    if (/Can't Solve|Time Out/.test(msg)) throw new CalcError(msg);
    if (e instanceof RangeError) throw new CalcError("Stack ERROR");
    throw new CalcError("Math ERROR");
  }
}

/** Build F(x) = value of row with X = x (used by SOLVE). */
export function makeFunction(row, ctx, varName = "X") {
  const c = { ...ctx, flags: { inexact: false, surd: false, pi: false } };
  const { fn } = compileRow(row, c);
  return (x) => realOnly(fn({ vars: { ...(ctx.vars || {}), [varName]: x } }));
}

/** Variables referenced by a row (for CALC / SOLVE prompts), in calculator order. */
export function usedVariables(row) {
  const found = new Set();
  const walk = (r) => {
    for (const it of r) {
      if (it.t === "sym" && SYM[it.v]?.kind === "var") found.add(it.v);
      for (const k of Object.keys(it)) if (Array.isArray(it[k])) walk(it[k]);
    }
  };
  walk(row);
  // ∫ d/dx Σ bind X internally, but the calculator still asks for other variables
  return ["A", "B", "C", "D", "E", "F", "M", "X", "Y"].filter((v) => found.has(v));
}
