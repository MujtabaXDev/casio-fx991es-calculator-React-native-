// fx-991ES PLUS behaviour as a pure state machine: pressKey(state, keyId) -> new state.
// The UI only renders the state and forwards key presses, so every behaviour here
// can be tested without React (see tests/).
import {
  emptyTree, treeFrom, insertItem, insertTemplate, insertDigit, insertFraction, sym,
  moveLeft, moveRight, moveVertical, closeParen, backspace, getIn, isCompound,
} from "../engine/tree";
import { evaluateRow, makeFunction, usedVariables, isMat, isVec, isCx, CalcError } from "../engine/evaluate";
import { formatValue, exactDisplay, fractionDisplay, baseDisplay, toFraction, formatReal } from "../engine/format";
import { solve, quadraticRoots, cubicRoots, solveLinear, computeStats, STAT_TYPES } from "../engine/numeric";
import { SYM, VAR_NAMES } from "../engine/symbols";
import { SCI_CONSTS, UNIT_CONVS } from "../data/constants";

export const MODES = ["COMP", "CMPLX", "STAT", "BASE-N", "EQN", "MATRIX", "TABLE", "VECTOR"];

export function defaultSetup() {
  return { io: "math", angle: "D", disp: { type: "norm", n: 1 }, frac: "dc", cplx: "abi", freq: false, contrast: 5 };
}
const zeroVars = () => Object.fromEntries(VAR_NAMES.map((v) => [v, 0]));
const calcView = (tree = emptyTree()) => ({ kind: "calc", tree, shown: null, error: null, histIdx: -1 });

export function initialState() {
  return {
    power: true,
    mode: "COMP",
    setup: defaultSetup(),
    mod: null, // "S" (SHIFT) | "A" (ALPHA)
    pending: null, // "STO" | "RCL"
    vars: zeroVars(),
    ans: 0,
    preAns: 0,
    base: "DEC",
    overlay: null,
    view: calcView(),
    history: [],
    stat: { type: "1VAR", rows: [] },
    eqn: { type: "quad", coef: [[0, 0, 0]] },
    mats: { A: null, B: null, C: null, Ans: null },
    vcts: { A: null, B: null, C: null, Ans: null },
    table: { f: [], start: 1, end: 5, step: 1 },
  };
}

/* =================================================================== */
/*  Key → action                                                        */
/* =================================================================== */
const VAR_KEYS = { NEG: "A", DMS: "B", HYP: "C", SIN: "D", COS: "E", TAN: "F", RPAR: "X", SD: "Y", MPLUS: "M" };
const HEX_KEYS = { NEG: "A", DMS: "B", HYP: "C", SIN: "D", COS: "E", TAN: "F" };

const I = {
  digit: (v) => ({ a: "digit", v }),
  op: (v) => ({ a: "op", v, cont: true }),
  neg: () => ({ a: "neg" }),
  sym: (v, extra) => ({ a: "sym", v, extra, cont: ["postfix", "infix"].includes(SYM[v].kind) }),
  sep: (v) => ({ a: "sym", v, cont: v === "eq" }),
  tpl: (node, cont = false) => ({ a: "tpl", node, cont }),
  func: (name) => ({ a: "tpl", node: { t: "func", name, body: [] } }),
  frac: () => ({ a: "frac", cont: true }),
  close: () => ({ a: "close" }),
};
const cmd = (c, extra) => ({ cmd: c, ...extra });

function keyAction(key, mod, st) {
  const mode = st.mode;
  const baseN = mode === "BASE-N";
  if (mod === "A") {
    if (VAR_KEYS[key]) return I.sym(VAR_KEYS[key]);
    if (key === "CALC") return I.sep("eq");
    if (key === "INTEG") return I.sep("colon");
    if (key === "EXP") return I.sym("e");
    if (key === "DOT") return I.func("RanInt");
  }
  if (mod === "S") {
    switch (key) {
      case "MODE": return cmd("SETUP");
      case "CALC": return cmd("SOLVE");
      case "INTEG": return I.tpl({ t: "deriv", body: [], point: [] });
      case "INV": return I.sym("fact");
      case "LOGB": return I.tpl({ t: "sum", body: [], start: [], end: [] });
      case "FRAC": return I.tpl({ t: "mixed", whole: [], num: [], den: [] });
      case "SQRT": return I.tpl({ t: "root", index: [{ t: "digit", v: "3" }], body: [] });
      case "SQ": return I.sym("cube");
      case "POW": return I.tpl({ t: "root", index: [], body: [] });
      case "LOG": return I.tpl({ t: "tenpow", exp: [] });
      case "LN": return I.tpl({ t: "epow", exp: [] });
      case "NEG": return mode === "CMPLX" ? I.sym("angle") : cmd("NOP");
      case "DMS": return cmd("DMS_BACK");
      case "HYP": return I.tpl({ t: "abs", body: [] });
      case "SIN": return I.func("asin");
      case "COS": return I.func("acos");
      case "TAN": return I.func("atan");
      case "RCL": return cmd("STO");
      case "ENG": return cmd("ENG", { dir: -1 });
      case "LPAR": return I.sym("pct");
      case "RPAR": return I.sep("comma");
      case "SD": return cmd("MIXED");
      case "MPLUS": return cmd("MEM", { sign: -1 });
      case "7": return cmd("MENU", { id: "const" });
      case "8": return cmd("MENU", { id: "conv" });
      case "9": return cmd("MENU", { id: "clr" });
      case "DEL": return cmd("NOP"); // INS: Math I/O always inserts
      case "AC": return cmd("OFF");
      case "1": return mode === "STAT" ? cmd("MENU", { id: "stat" }) : cmd("NOP");
      case "2": return mode === "CMPLX" ? cmd("MENU", { id: "cmplx" }) : cmd("NOP");
      case "3": return baseN ? cmd("MENU", { id: "base" }) : cmd("NOP");
      case "4": return mode === "MATRIX" ? cmd("MENU", { id: "matrix" }) : cmd("NOP");
      case "5": return mode === "VECTOR" ? cmd("MENU", { id: "vector" }) : cmd("NOP");
      case "MUL": return I.sym("nPr");
      case "DIV": return I.sym("nCr");
      case "ADD": return I.func("Pol");
      case "SUB": return I.func("Rec");
      case "0": return I.func("Rnd");
      case "DOT": return I.sym("Ran");
      case "EXP": return I.sym("pi");
      case "ANS": return cmd("MENU", { id: "drg" });
      case "EQ": return cmd("NOP");
      default: break;
    }
  }
  if (/^[0-9]$/.test(key)) return I.digit(key);
  if (baseN && HEX_KEYS[key]) return I.digit(HEX_KEYS[key]);
  if (baseN) {
    if (key === "SQ") return cmd("BASE", { base: "DEC" });
    if (key === "POW") return cmd("BASE", { base: "HEX" });
    if (key === "LOG") return cmd("BASE", { base: "BIN" });
    if (key === "LN") return cmd("BASE", { base: "OCT" });
    if (["DOT", "EXP", "FRAC", "SQRT", "INV", "LOGB", "INTEG", "ENG", "SD"].includes(key)) return cmd("NOP");
  }
  switch (key) {
    case "MODE": return cmd("MODE");
    case "ON": return cmd("ON");
    case "CALC": return cmd("CALC");
    case "INTEG": return I.tpl({ t: "integral", body: [], lower: [], upper: [] });
    case "INV": return I.sym("inv");
    case "LOGB": return I.tpl({ t: "log", base: [], arg: [] });
    case "FRAC": return I.frac();
    case "SQRT": return I.tpl({ t: "sqrt", body: [] });
    case "SQ": return I.sym("sq");
    case "POW": return I.tpl({ t: "pow", exp: [] }, true);
    case "LOG": return I.func("log");
    case "LN": return I.func("ln");
    case "NEG": return I.neg();
    case "DMS": return cmd("DMS");
    case "HYP": return cmd("MENU", { id: "hyp" });
    case "SIN": return I.func("sin");
    case "COS": return I.func("cos");
    case "TAN": return I.func("tan");
    case "RCL": return cmd("RCL");
    case "ENG": return mode === "CMPLX" ? I.sym("i") : cmd("ENG", { dir: 1 });
    case "LPAR": return I.tpl({ t: "group", body: [] });
    case "RPAR": return I.close();
    case "SD": return cmd("SD");
    case "MPLUS": return cmd("MEM", { sign: 1 });
    case "DEL": return cmd("DEL");
    case "AC": return cmd("AC");
    case "MUL": return I.op("*");
    case "DIV": return I.op("/");
    case "ADD": return I.op("+");
    case "SUB": return I.op("-");
    case "DOT": return I.digit(".");
    case "EXP": return I.tpl({ t: "exp10", exp: [] }, true);
    case "ANS": return I.sym("Ans");
    case "EQ": return cmd("EXE");
    case "UP": case "DOWN": case "LEFT": case "RIGHT": return cmd(key);
    default: return cmd("NOP");
  }
}

const clone = (x) => JSON.parse(JSON.stringify(x));
function applyInput(tree, act) {
  switch (act.a) {
    case "digit": return insertDigit(tree, act.v);
    case "op": return insertItem(tree, { t: "op", v: act.v });
    case "neg": return insertItem(tree, { t: "neg" });
    case "sym": return insertItem(tree, sym(act.v, act.extra));
    case "frac": return insertFraction(tree);
    case "close": return closeParen(tree) || insertItem(tree, sym("close"));
    case "tpl": {
      const node = clone(act.node);
      if (node.t === "root" && node.index.length) return insertItem(tree, node, "body");
      if (node.t === "exp10" || node.t === "pow") return insertItem(tree, node, "exp");
      return insertTemplate(tree, node);
    }
    default: return tree;
  }
}

/* =================================================================== */
/*  Evaluation context                                                  */
/* =================================================================== */
function statsOf(st) {
  const rows = st.stat.rows.map((r) => ({ x: r[0], y: r[1], f: st.setup.freq ? r[2] ?? 1 : 1 }));
  return computeStats(st.stat.type, rows);
}
export function ctxOf(st, overrides = {}) {
  return {
    angle: st.setup.angle,
    complex: st.mode === "CMPLX",
    base: st.mode === "BASE-N" ? st.base : null,
    vars: st.vars,
    ans: st.ans,
    preAns: st.preAns,
    mats: st.mats,
    vcts: st.vcts,
    stats: st.mode === "STAT" ? statsOf(st) : null,
    setup: st.setup,
    ...overrides,
  };
}
const errMsg = (e) => (e instanceof CalcError ? e.message : /Dimension/.test(e?.message) ? "Dimension ERROR" : "Math ERROR");

// split a row at top-level separators (":" or "=")
function splitRow(row, sep) {
  const parts = [[]];
  for (const it of row) {
    if (it.t === "sym" && it.v === sep) parts.push([]);
    else parts[parts.length - 1].push(it);
  }
  return parts;
}
const hasTop = (row, v) => row.some((it) => it.t === "sym" && it.v === v);

/* =================================================================== */
/*  Result display selector (used by the UI)                            */
/* =================================================================== */
// The LCD asks for the display on every render and the exact-form search is not free,
// so cache it per result object (results are immutable; any change makes a new one).
const dispCache = new WeakMap();
export function resultDisplay(st, shown = st.view.shown) {
  if (!shown) return null;
  if (shown.disp) return shown.disp;
  const key = `${st.mode}|${st.base}|${JSON.stringify(st.setup)}`;
  const hit = dispCache.get(shown);
  if (hit && hit.key === key) return hit.d;
  const d = computeResultDisplay(st, shown);
  dispCache.set(shown, { key, d });
  return d;
}
function computeResultDisplay(st, shown) {
  const { value, flags } = shown;
  if (st.mode === "BASE-N" && typeof value === "number") {
    return baseDisplay(value, st.base) || { k: "text", s: "Math ERROR" };
  }
  const opts = { eng: shown.eng ?? null, dms: !!shown.dms, cplxFormat: shown.cplxFormat };
  if (shown.exact === false) opts.exact = false;
  if (shown.exact === true && flags?.inexact) opts.forceFraction = true;
  const setup = shown.mixed !== undefined ? { ...st.setup, frac: shown.mixed ? "abc" : "dc" } : st.setup;
  return formatValue(value, flags, setup, opts);
}

/* =================================================================== */
/*  pressKey                                                            */
/* =================================================================== */
export function pressKey(st, key) {
  if (!st.power) {
    if (key !== "ON") return st;
    return { ...st, power: true, mod: null, overlay: null, view: modeHomeView(st) };
  }
  if (key === "SHIFT") return { ...st, mod: st.mod === "S" ? null : "S" };
  if (key === "ALPHA") return { ...st, mod: st.mod === "A" ? null : "A" };
  const mod = st.mod;
  st = { ...st, mod: null };

  if (key === "ON") {
    return { ...st, overlay: null, pending: null, view: modeHomeView(st) };
  }
  if (st.overlay) return overlayKey(st, key, mod);
  if (st.pending) return pendingKey(st, key, mod);

  const v = st.view;
  if (v.kind === "grid") return gridKey(st, key, mod);
  if (v.kind === "eqnResult") return eqnResultKey(st, key, mod);
  if (v.kind === "table") return tableKey(st, key, mod);
  if (v.kind === "prompt") return promptKey(st, key, mod);
  return calcKey(st, key, mod);
}

function modeHomeView(st) {
  if (st.mode === "EQN") return gridViewFor(st, "eqn");
  return calcView();
}

/* ------------------------------------------------------------------- */
/*  Main calculation screen                                             */
/* ------------------------------------------------------------------- */
function setView(st, patch) {
  return { ...st, view: { ...st.view, ...patch } };
}

function calcKey(st, key, mod) {
  const v = st.view;
  const act = keyAction(key, mod, st);

  // Error screen: only AC, ◀, ▶ (and ON/SHIFT handled above) work.
  if (v.error) {
    if (act.cmd === "AC") return setView(st, { error: null, tree: emptyTree(), shown: null });
    if (act.cmd === "LEFT" || act.cmd === "RIGHT") {
      const t = v.tree;
      return setView(st, { error: null, shown: null, tree: { expr: t.expr, path: [], pos: t.expr.length } });
    }
    if (act.cmd === "MODE" || act.cmd === "SETUP") return commonCommand(setView(st, { error: null }), act);
    return st;
  }

  if (act.a) {
    // inserting into the expression
    let tree = v.tree;
    if (v.shown) {
      tree = emptyTree();
      if (act.cont) tree = insertItem(tree, sym(isMatAnsMode(st) ? (st.mode === "MATRIX" ? "MatAns" : "VctAns") : "Ans"));
    }
    if (st.mode === "BASE-N" && act.a === "tpl" && !["group"].includes(act.node.t) && !(act.node.t === "func" && ["Not", "Neg"].includes(act.node.name))) {
      return st; // scientific functions are unavailable in BASE-N
    }
    tree = applyInput(tree, act);
    return setView(st, { tree, shown: null, histIdx: -1, label: null, calcLoop: false, stmts: null });
  }

  switch (act.cmd) {
    case "EXE": return execute(st);
    case "AC": return setView(st, { tree: emptyTree(), shown: null, histIdx: -1, label: null, calcLoop: false, stmts: null });
    case "DEL": {
      if (v.shown) return setView(st, { shown: null, tree: { expr: v.tree.expr, path: [], pos: v.tree.expr.length } });
      return setView(st, { tree: backspace(v.tree) });
    }
    case "LEFT": case "RIGHT": {
      if (v.shown) {
        const expr = v.tree.expr;
        return setView(st, { shown: null, tree: { expr, path: [], pos: act.cmd === "LEFT" ? expr.length : 0 } });
      }
      return setView(st, { tree: act.cmd === "LEFT" ? moveLeft(v.tree) : moveRight(v.tree) });
    }
    case "UP": case "DOWN": {
      if (!v.shown && v.tree.expr.length) {
        const moved = moveVertical(v.tree, act.cmd === "UP" ? "up" : "down");
        if (moved) return setView(st, { tree: moved });
        if (v.tree.path.length) return st;
      }
      if (v.shown || v.tree.expr.length === 0) return replay(st, act.cmd === "UP" ? 1 : -1);
      return st;
    }
    case "CALC": return startCalc(st);
    case "SOLVE": return startSolve(st);
    case "SD": return toggleSD(st);
    case "MIXED": {
      if (!v.shown) return st;
      const d = resultDisplay(st);
      if (!d || d.k !== "frac") return st;
      const D = Number(d.d);
      let disp;
      if (d.whole) disp = { ...d, whole: null, n: String(Number(d.whole) * D + Number(d.n)) };
      else if (Number(d.n) > D) disp = { ...d, whole: String(Math.floor(Number(d.n) / D)), n: String(Number(d.n) % D) };
      else return st;
      return setView(st, { shown: { ...v.shown, disp } });
    }
    case "ENG": {
      if (!v.shown || typeof v.shown.value !== "number" || st.mode === "BASE-N") return st;
      const cur = v.shown.eng;
      const eng = cur === null || cur === undefined ? (act.dir > 0 ? 0 : 1) : cur - act.dir;
      return setView(st, { shown: { ...v.shown, eng, dms: false, disp: null } });
    }
    case "DMS": {
      if (v.shown) {
        if (typeof v.shown.value !== "number") return st;
        return setView(st, { shown: { ...v.shown, dms: !v.shown.dms, eng: null, disp: null } });
      }
      return setView(st, { tree: applyInput(v.tree, I.sym("dms")) });
    }
    case "DMS_BACK": {
      if (v.shown && v.shown.dms) return setView(st, { shown: { ...v.shown, dms: false } });
      return st;
    }
    case "MEM": return memoryOp(st, act.sign);
    case "STO": return { ...st, pending: "STO" };
    case "RCL": return { ...st, pending: "RCL" };
    case "BASE": {
      return { ...st, base: act.base };
    }
    default: return commonCommand(st, act);
  }
}

const isMatAnsMode = (st) =>
  (st.mode === "MATRIX" && st.view.shown && isMat(st.view.shown.value)) ||
  (st.mode === "VECTOR" && st.view.shown && isVec(st.view.shown.value));

function commonCommand(st, act) {
  switch (act.cmd) {
    case "MODE": return { ...st, overlay: { kind: "menu", id: "mode", page: 0 } };
    case "SETUP": return { ...st, overlay: { kind: "menu", id: "setup", page: 0 } };
    case "MENU":
      if (act.id === "const" || act.id === "conv") return { ...st, overlay: { kind: "code", id: act.id, buf: "", page: 0 } };
      return { ...st, overlay: { kind: "menu", id: act.id, page: 0 } };
    case "OFF": return { ...st, power: false, overlay: null, pending: null };
    default: return st;
  }
}

function pushHistory(st, entry) {
  return [entry, ...st.history].slice(0, 30);
}

function replay(st, dir) {
  const idx = st.view.histIdx + dir;
  if (idx < 0) {
    if (st.view.histIdx >= 0) return setView(st, { tree: emptyTree(), shown: null, histIdx: -1 });
    return st;
  }
  const h = st.history.filter((e) => e.mode === st.mode)[idx];
  if (!h) return st;
  return setView(st, { tree: { expr: h.expr, path: [], pos: h.expr.length }, shown: h.shown, histIdx: idx, error: null, label: null });
}

function showError(st, msg, tree = st.view.tree) {
  return { ...st, view: { ...calcView(tree), kind: st.view.kind === "calc" ? "calc" : "calc", error: msg } };
}

function execute(st) {
  const v = st.view;
  if (v.calcLoop) return startCalc(st);
  let expr = v.tree.expr;
  if (expr.length === 0) {
    if (st.mode === "TABLE") return st;
    return st;
  }
  if (st.mode === "TABLE") return startTable(st);
  // multi-statements: "A:B:C" shows each result in turn (Disp)
  const stmts = splitRow(expr, "colon");
  let stmtIdx = 0;
  if (stmts.length > 1) {
    stmtIdx = v.shown && v.stmts ? v.stmtIdx + 1 : 0;
    if (stmtIdx >= stmts.length) stmtIdx = 0;
    // statements before the one displayed are executed for their side effects
    if (stmtIdx === 0) {
      // fresh run
    }
    expr = stmts[stmtIdx];
  }
  if (hasTop(expr, "eq")) {
    // "Y=X+1" style assignment is only for CALC; plain = is a syntax error
    return showError(st, "Syntax ERROR");
  }
  let res;
  try {
    res = evaluateRow(expr, ctxOf(st));
  } catch (e) {
    return showError(st, errMsg(e));
  }
  const multi = stmts.length > 1 ? { stmts: true, stmtIdx, stmtCount: stmts.length } : { stmts: null };
  return finishResult(st, res, v.tree.expr, multi);
}

function finishResult(st, res, expr, extra = {}) {
  let { value, flags } = res;
  let next = { ...st };
  if (value && value.multi) {
    // Pol / Rec store their results in X and Y
    next.vars = { ...st.vars, X: value.store[0], Y: value.store[1] };
    next.preAns = st.ans;
    next.ans = value.store[0];
  } else if (isMat(value)) {
    next.mats = { ...st.mats, Ans: value.mat };
  } else if (isVec(value)) {
    next.vcts = { ...st.vcts, Ans: value.vec };
  } else {
    if (st.mode === "BASE-N") {
      value = Math.trunc(value);
      if (!baseDisplay(value, st.base)) return showError(st, "Math ERROR");
    }
    next.preAns = st.ans;
    next.ans = value;
  }
  const shown = { value, flags, cplxFormat: res.cplxFormat };
  next.history = pushHistory(st, { expr, shown, mode: st.mode });
  next.view = {
    ...calcView({ expr, path: [], pos: expr.length }),
    shown,
    stmts: extra.stmts ?? null,
    stmtIdx: extra.stmtIdx ?? 0,
    stmtCount: extra.stmtCount ?? 0,
    label: extra.label ?? null,
  };
  if (isMat(value) || isVec(value)) {
    // show MatAns / VctAns
    next.view = { ...next.view, ansGrid: true };
    return { ...next, view: gridViewFor(next, isMat(value) ? "mat" : "vct", "Ans", next.view) };
  }
  return next;
}

function toggleSD(st) {
  const v = st.view;
  if (!v.shown) return st;
  const { value, flags } = v.shown;
  if (typeof value !== "number" && !isCx(value)) return st;
  if (st.mode === "BASE-N") return st;
  const cur = resultDisplay(st);
  const isExact = cur && ["frac", "surd", "pi", "qsurd"].includes(cur.k);
  if (isExact || (cur && cur.k === "cplx" && [cur.re, cur.im].some((p) => p && p.k !== "dec"))) {
    return setView(st, { shown: { ...v.shown, exact: false, eng: null, dms: false, disp: null } });
  }
  // decimal -> exact if possible
  if (typeof value === "number") {
    const ex = exactDisplay(value, { ...flags, inexact: false }, st.setup) || fractionDisplay(value, st.setup);
    if (!ex) return st;
    return setView(st, { shown: { ...v.shown, exact: true, eng: null, dms: false, disp: ex } });
  }
  return setView(st, { shown: { ...v.shown, exact: true, eng: null } });
}

function memoryOp(st, sign) {
  const v = st.view;
  let value;
  let expr = v.tree.expr;
  if (v.shown) value = typeof v.shown.value === "number" ? v.shown.value : NaN;
  else {
    if (!expr.length) return st;
    try {
      value = evaluateRow(expr, ctxOf(st)).value;
    } catch (e) {
      return showError(st, errMsg(e));
    }
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return showError(st, "Math ERROR");
  const M = st.vars.M + sign * value;
  if (Math.abs(M) >= 1e100) return showError(st, "Math ERROR");
  const next = { ...st, vars: { ...st.vars, M }, preAns: st.ans, ans: value };
  const shown = { value, flags: v.shown?.flags || { inexact: true } };
  return { ...next, view: { ...calcView({ expr, path: [], pos: expr.length }), shown, label: sign > 0 ? "M+" : "M−" } };
}

/* ---------------- STO / RCL ---------------- */
function pendingKey(st, key, mod) {
  const which = st.pending;
  st = { ...st, pending: null };
  const name = VAR_KEYS[key];
  if (!name) return pressKey(st, key); // any other key cancels STO/RCL and acts normally
  const v = st.view;
  if (which === "RCL") {
    const value = st.vars[name];
    const expr = [sym(name)];
    return { ...st, view: { ...calcView(treeFrom(expr)), shown: { value, flags: {} }, label: null } };
  }
  // STO
  let value, flags = {};
  let expr = v.kind === "calc" ? v.tree.expr : [];
  if (v.kind === "calc" && v.shown && typeof v.shown.value === "number") {
    value = v.shown.value;
    flags = v.shown.flags;
  } else if (v.kind === "calc" && expr.length) {
    try {
      const r = evaluateRow(expr, ctxOf(st));
      value = r.value; flags = r.flags;
    } catch (e) {
      return showError(st, errMsg(e));
    }
  } else {
    value = st.ans;
    expr = [sym("Ans")];
  }
  if (typeof value !== "number" && !isCx(value)) return showError(st, "Math ERROR");
  const vars = { ...st.vars, [name]: value };
  return {
    ...st, vars, preAns: st.ans, ans: value,
    view: { ...calcView({ expr, path: [], pos: expr.length }), shown: { value, flags }, label: `→${name}` },
  };
}

/* ---------------- CALC ---------------- */
function startCalc(st) {
  const v = st.view;
  const expr = v.tree.expr;
  if (!expr.length || st.mode === "BASE-N" && false) return st;
  let target = null, rhs = expr;
  if (hasTop(expr, "eq")) {
    const parts = splitRow(expr, "eq");
    if (parts.length !== 2) return showError(st, "Syntax ERROR");
    const lhs = parts[0];
    if (lhs.length === 1 && lhs[0].t === "sym" && SYM[lhs[0].v]?.kind === "var") {
      target = lhs[0].v;
      rhs = parts[1];
    }
  }
  const vars = usedVariables(rhs);
  if (!vars.length) return finishCalc(st, expr, rhs, target);
  return {
    ...st,
    view: { kind: "prompt", purpose: "calc", vars, idx: 0, tree: emptyTree(), expr, rhs, target },
  };
}
function finishCalc(st, expr, rhs, target) {
  if (hasTop(rhs, "eq")) {
    // CALC on an equation shows L−R
    const [l, r] = splitRow(rhs, "eq");
    try {
      const a = evaluateRow(l, ctxOf(st)).value, b = evaluateRow(r, ctxOf(st)).value;
      if (typeof a !== "number" || typeof b !== "number") throw new CalcError("Math ERROR");
      return { ...st, view: { ...calcView(treeFrom(expr)), shown: { value: a - b, flags: { inexact: true } }, label: null, calcLoop: true, lrLabel: true } };
    } catch (e) {
      return showError({ ...st, view: calcView(treeFrom(expr)) }, errMsg(e));
    }
  }
  let res;
  try {
    res = evaluateRow(rhs, ctxOf(st));
  } catch (e) {
    return showError({ ...st, view: calcView(treeFrom(expr)) }, errMsg(e));
  }
  let next = st;
  if (target && typeof res.value === "number") next = { ...st, vars: { ...st.vars, [target]: res.value } };
  const out = finishResult(next, res, expr);
  return { ...out, view: { ...out.view, calcLoop: true } };
}

/* ---------------- SOLVE ---------------- */
function startSolve(st) {
  const v = st.view;
  const expr = v.tree.expr;
  if (!expr.length || !["COMP"].includes(st.mode)) return st;
  if (splitRow(expr, "eq").length > 2) return showError(st, "Syntax ERROR");
  const vars = usedVariables(expr);
  const solveVar = vars.includes("X") ? "X" : vars[0];
  if (!solveVar) return showError(st, "Variable ERROR");
  const order = [...vars.filter((x) => x !== solveVar), solveVar];
  return { ...st, view: { kind: "prompt", purpose: "solve", vars: order, idx: 0, tree: emptyTree(), expr, solveVar } };
}
function finishSolve(st, view) {
  const { expr, solveVar } = view;
  const [l, r] = hasTop(expr, "eq") ? splitRow(expr, "eq") : [expr, [{ t: "digit", v: "0" }]];
  try {
    const ctx = ctxOf(st);
    const L = makeFunction(l, ctx, solveVar), R = makeFunction(r, ctx, solveVar);
    const F = (x) => L(x) - R(x);
    const { x, lr } = solve(F, st.vars[solveVar] || 0);
    const xr = Math.abs(x) < 1e-13 ? 0 : x;
    const vars = { ...st.vars, [solveVar]: xr };
    const shown = { value: xr, flags: { inexact: true }, solve: { name: solveVar, lr } };
    return { ...st, vars, view: { ...calcView(treeFrom(expr)), shown, label: null } };
  } catch (e) {
    const msg = e instanceof CalcError ? e.message : e?.message === "Can't Solve" ? "Can't Solve" : "Can't Solve";
    return showError({ ...st, view: calcView(treeFrom(expr)) }, msg);
  }
}

/* ---------------- prompts (CALC / SOLVE / TABLE ranges) ---------------- */
function promptLabel(view, st) {
  if (view.purpose === "table") return ["Start?", "End?", "Step?"][view.idx];
  return `${view.vars[view.idx]}?`;
}
export { promptLabel };
export function promptCurrent(st, view = st.view) {
  if (view.purpose === "table") return st.table[["start", "end", "step"][view.idx]];
  return st.vars[view.vars[view.idx]];
}

function promptKey(st, key, mod) {
  const v = st.view;
  const act = keyAction(key, mod, st);
  if (act.a) {
    if (act.a === "sym" && (act.v === "eq" || act.v === "colon")) return st;
    return setView(st, { tree: applyInput(v.tree, act) });
  }
  switch (act.cmd) {
    case "AC":
      if (v.purpose === "table") return { ...st, view: calcView(treeFrom(st.table.f)) };
      return { ...st, view: calcView(treeFrom(v.expr)) };
    case "DEL": return setView(st, { tree: backspace(v.tree) });
    case "LEFT": return setView(st, { tree: moveLeft(v.tree) });
    case "RIGHT": return setView(st, { tree: moveRight(v.tree) });
    case "UP": case "DOWN": {
      const m = moveVertical(v.tree, act.cmd === "UP" ? "up" : "down");
      return m ? setView(st, { tree: m }) : st;
    }
    case "EXE": case "CALC": case "SOLVE": {
      if (act.cmd === "CALC" && v.purpose !== "calc") return st;
      if (act.cmd === "SOLVE" && v.purpose !== "solve") return st;
      let next = st;
      if (v.tree.expr.length) {
        let value;
        try {
          value = evaluateRow(v.tree.expr, ctxOf(st)).value;
        } catch (e) {
          return { ...st, view: { ...v, error: errMsg(e) } };
        }
        if (typeof value !== "number" && !(isCx(value) && v.purpose === "calc")) return { ...st, view: { ...v, error: "Math ERROR" } };
        if (v.purpose === "table") next = { ...st, table: { ...st.table, [["start", "end", "step"][v.idx]]: value } };
        else next = { ...st, vars: { ...st.vars, [v.vars[v.idx]]: value } };
      }
      const count = v.purpose === "table" ? 3 : v.vars.length;
      if (act.cmd === "SOLVE" && v.purpose === "solve") return finishSolve(next, v);
      if (v.idx + 1 < count) return { ...next, view: { ...v, idx: v.idx + 1, tree: emptyTree(), error: null } };
      if (v.purpose === "calc") return finishCalc(next, v.expr, v.rhs, v.target);
      if (v.purpose === "solve") return finishSolve(next, v);
      return buildTable(next);
    }
    default: return commonCommand(st, act);
  }
}

/* ---------------- TABLE ---------------- */
function startTable(st) {
  const f = st.view.tree.expr;
  return { ...st, table: { ...st.table, f }, view: { kind: "prompt", purpose: "table", idx: 0, tree: emptyTree() } };
}
function buildTable(st) {
  const { f, start, end, step } = st.table;
  if (step === 0 || (end - start) / step < 0) return { ...st, view: { ...calcView(treeFrom(f)), error: "Math ERROR" } };
  const count = Math.floor((end - start) / step + 1e-9) + 1;
  if (count > 30) return { ...st, view: { ...calcView(treeFrom(f)), error: "Insufficient MEM" } };
  const rows = [];
  for (let k = 0; k < count; k++) {
    const x = Number((start + k * step).toPrecision(12));
    let y;
    try {
      const r = evaluateRow(f, ctxOf(st, { vars: { ...st.vars, X: x } }));
      y = typeof r.value === "number" ? r.value : null;
    } catch {
      y = null; // shown as ERROR
    }
    rows.push([x, y]);
  }
  return { ...st, view: { kind: "table", rows, cur: 0, col: 1 } };
}
function tableKey(st, key, mod) {
  const v = st.view;
  const act = keyAction(key, mod, st);
  switch (act.cmd) {
    case "UP": return setView(st, { cur: Math.max(0, v.cur - 1) });
    case "DOWN": return setView(st, { cur: Math.min(v.rows.length - 1, v.cur + 1) });
    case "LEFT": return setView(st, { col: 0 });
    case "RIGHT": return setView(st, { col: 1 });
    case "AC": case "EXE": return { ...st, view: calcView(treeFrom(st.table.f)) };
    default: return act.a ? st : commonCommand(st, act);
  }
}

/* =================================================================== */
/*  Grid editors (STAT data, EQN coefficients, MATRIX, VECTOR)          */
/* =================================================================== */
const EQN_TYPES = {
  lin2: { rows: 2, cols: 3, labels: ["a", "b", "c"] },
  lin3: { rows: 3, cols: 4, labels: ["a", "b", "c", "d"] },
  quad: { rows: 1, cols: 3, labels: ["a", "b", "c"] },
  cubic: { rows: 1, cols: 4, labels: ["a", "b", "c", "d"] },
};
export { EQN_TYPES };

function gridViewFor(st, target, name = null, back = null) {
  return { kind: "grid", target, name, cur: { r: 0, c: 0 }, top: 0, edit: null, back, error: null };
}

/** Cells, labels and size of the grid currently shown. */
export function gridData(st, view = st.view) {
  switch (view.target) {
    case "stat": {
      const twoVar = STAT_TYPES.find((t) => t.id === st.stat.type)?.twoVar;
      const cols = ["X", ...(twoVar ? ["Y"] : []), ...(st.setup.freq ? ["FREQ"] : [])];
      const cells = st.stat.rows.map((r) => cols.map((c, i) => (c === "FREQ" ? r[2] ?? 1 : c === "Y" ? r[1] : r[0])));
      const max = st.setup.freq ? (twoVar ? 26 : 40) : twoVar ? 40 : 80;
      const rows = Math.min(cells.length + 1, max);
      return { cols, cells, rows, rowLabels: true };
    }
    case "eqn": {
      const t = EQN_TYPES[st.eqn.type];
      return { cols: t.labels, cells: st.eqn.coef, rows: t.rows, rowLabels: t.rows > 1 };
    }
    case "mat": {
      const m = st.mats[view.name] || [[0]];
      return { cols: m[0].map((_, j) => String(j + 1)), cells: m, rows: m.length, rowLabels: true, readOnly: view.name === "Ans" };
    }
    case "vct": {
      const vct = st.vcts[view.name] || [0];
      return { cols: vct.map((_, j) => String(j + 1)), cells: [vct], rows: 1, rowLabels: false, readOnly: view.name === "Ans" };
    }
    default: return { cols: [], cells: [], rows: 0 };
  }
}
export function gridTitle(st, view = st.view) {
  if (view.target === "mat") return `Mat${view.name}`;
  if (view.target === "vct") return `Vct${view.name}`;
  return null;
}

function writeCell(st, view, r, c, value) {
  switch (view.target) {
    case "stat": {
      const twoVar = STAT_TYPES.find((t) => t.id === st.stat.type)?.twoVar;
      const cols = ["X", ...(twoVar ? ["Y"] : []), ...(st.setup.freq ? ["FREQ"] : [])];
      const rows = st.stat.rows.map((row) => row.slice());
      while (rows.length <= r) rows.push([0, twoVar ? 0 : null, 1]);
      const col = cols[c];
      if (col === "X") rows[r][0] = value;
      else if (col === "Y") rows[r][1] = value;
      else rows[r][2] = value;
      return { ...st, stat: { ...st.stat, rows } };
    }
    case "eqn": {
      const coef = st.eqn.coef.map((row) => row.slice());
      coef[r][c] = value;
      return { ...st, eqn: { ...st.eqn, coef } };
    }
    case "mat": {
      const m = st.mats[view.name].map((row) => row.slice());
      m[r][c] = value;
      return { ...st, mats: { ...st.mats, [view.name]: m } };
    }
    case "vct": {
      const vct = st.vcts[view.name].slice();
      vct[c] = value;
      return { ...st, vcts: { ...st.vcts, [view.name]: vct } };
    }
    default: return st;
  }
}

function gridKey(st, key, mod) {
  const v = st.view;
  const g = gridData(st, v);
  const act = keyAction(key, mod, st);
  const move = (r, c) => {
    r = Math.max(0, Math.min(g.rows - 1, r));
    c = Math.max(0, Math.min(g.cols.length - 1, c));
    let top = v.top;
    if (r < top) top = r;
    if (r > top + 2) top = r - 2;
    return setView(st, { cur: { r, c }, top, edit: null, error: null });
  };
  if (v.error) {
    if (act.cmd === "AC" || act.cmd === "LEFT" || act.cmd === "RIGHT") return setView(st, { error: null });
    return st;
  }
  if (g.readOnly) {
    // MatAns / VctAns: browse, AC goes back, operators continue the calculation
    if (act.a) {
      const back = v.back || calcView();
      const calc = { ...back, shown: back.shown || { value: 0, flags: {} } };
      return calcKey({ ...st, view: calc }, key, mod);
    }
    switch (act.cmd) {
      case "UP": return move(v.cur.r - 1, v.cur.c);
      case "DOWN": return move(v.cur.r + 1, v.cur.c);
      case "LEFT": return move(v.cur.r, v.cur.c - 1);
      case "RIGHT": return move(v.cur.r, v.cur.c + 1);
      case "AC": case "EXE": return { ...st, view: { ...(v.back || calcView()), shown: null, tree: emptyTree() } };
      default: return commonCommand(st, act);
    }
  }
  if (act.a) {
    if (act.a === "sym" && ["eq", "colon"].includes(act.v)) return st;
    if (v.target !== "eqn" && st.mode === "STAT" && act.a === "sym" && SYM[act.v]?.kind === "var") return st;
    return setView(st, { edit: applyInput(v.edit || emptyTree(), act) });
  }
  if (v.edit) {
    switch (act.cmd) {
      case "DEL": return setView(st, { edit: backspace(v.edit) });
      case "AC": return setView(st, { edit: null });
      case "LEFT": return setView(st, { edit: moveLeft(v.edit) });
      case "RIGHT": return setView(st, { edit: moveRight(v.edit) });
      case "EXE": case "UP": case "DOWN": {
        if (act.cmd !== "EXE") {
          // ▲ / ▼ first move between the boxes of a fraction etc. being typed
          const moved = moveVertical(v.edit, act.cmd === "UP" ? "up" : "down");
          if (moved) return setView(st, { edit: moved });
        }
        if (v.edit.expr.length === 0) return setView(st, { edit: null });
        let value;
        try {
          value = evaluateRow(v.edit.expr, ctxOf(st, { complex: false, base: null, stats: null })).value;
        } catch (e) {
          return setView(st, { error: errMsg(e), edit: null });
        }
        if (typeof value !== "number") return setView(st, { error: "Math ERROR", edit: null });
        let next = writeCell(st, v, v.cur.r, v.cur.c, value);
        next = { ...next, view: { ...v, edit: null } };
        const g2 = gridData(next, next.view);
        // = moves to the next cell (down in STAT, right/wrap otherwise)
        let { r, c } = v.cur;
        if (act.cmd === "UP") r--;
        else if (v.target === "stat" || act.cmd === "DOWN") r++;
        else if (c + 1 < g2.cols.length) c++;
        else if (r + 1 < g2.rows) { r++; c = 0; }
        r = Math.max(0, Math.min(g2.rows - 1, r));
        let top = v.top;
        if (r < top) top = r;
        if (r > top + 2) top = r - 2;
        return { ...next, view: { ...next.view, cur: { r, c }, top } };
      }
      default: return st;
    }
  }
  switch (act.cmd) {
    case "UP": return move(v.cur.r - 1, v.cur.c);
    case "DOWN": return move(v.cur.r + 1, v.cur.c);
    case "LEFT": return move(v.cur.r, v.cur.c - 1);
    case "RIGHT": return move(v.cur.r, v.cur.c + 1);
    case "DEL":
      if (v.target === "stat" && v.cur.r < st.stat.rows.length) {
        const rows = st.stat.rows.filter((_, i) => i !== v.cur.r);
        return { ...st, stat: { ...st.stat, rows }, view: { ...v, cur: { r: Math.min(v.cur.r, rows.length), c: v.cur.c } } };
      }
      return st;
    case "EXE":
      if (v.target === "eqn") return solveEqn(st);
      return st;
    case "AC":
      if (v.target === "eqn") return st;
      return { ...st, view: calcView() };
    default: return commonCommand(st, act);
  }
}

/* ---------------- EQN solving ---------------- */
function exactQuadratic(a, b, c) {
  // All coefficients rational? scale to integers A, B, C
  const fr = [a, b, c].map((x) => toFraction(x, 10000, 1e-12));
  if (fr.some((f) => !f)) return null;
  const lcm = fr.reduce((l, f) => { const g = gcd(l, f.d); return (l / g) * f.d; }, 1);
  const [A, B, C] = fr.map((f) => (f.n * lcm) / f.d);
  if (![A, B, C].every(Number.isSafeInteger) || Math.abs(B) > 1e6 || Math.abs(A) > 1e6 || Math.abs(C) > 1e6) return null;
  const D = B * B - 4 * A * C;
  const absD = Math.abs(D);
  let s = 1, t = absD;
  for (let k = 2; k * k <= t; k++) while (t % (k * k) === 0) { t /= k * k; s *= k; }
  if (t > 9999) return null; // radicand too long for the √ form: show decimals
  const den = 2 * A;
  const rat = (n, d) => {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    n /= g; d /= g;
    if (d === 1) return { k: "dec", neg: n < 0, mant: String(Math.abs(n)), exp: null };
    return { k: "frac", neg: n < 0, whole: null, n: String(Math.abs(n)), d: String(d) };
  };
  const surd = (q, d) => {
    // q√t / d
    if (d < 0) { q = -q; d = -d; }
    const g = gcd(q, d) || 1;
    q /= g; d /= g;
    return { k: "surd", neg: q < 0, a: Math.abs(q) === 1 ? "" : String(Math.abs(q)), b: String(t), c: d === 1 ? null : String(d) };
  };
  if (D === 0) return [rat(-B, den)];
  if (D > 0 && t === 1) {
    const r1 = (-B + s) / den, r2 = (-B - s) / den;
    const [hi, lo] = r1 >= r2 ? [[-B + s, den], [-B - s, den]] : [[-B - s, den], [-B + s, den]];
    return [rat(hi[0], hi[1]), rat(lo[0], lo[1])];
  }
  if (D > 0) {
    // (−B ± s√t) / 2A
    let p = -B, q = s, d = den;
    if (d < 0) { p = -p; q = -q; d = -d; }
    const g = gcd(gcd(p, q), d) || 1;
    p /= g; q /= g; d /= g;
    const mk = (sign) => {
      const qq = q * sign;
      if (p === 0) return surd(qq, d);
      return { k: "qsurd", neg: false, p, q: qq, r: t, d };
    };
    const plusFirst = q > 0; // larger root first
    return plusFirst ? [mk(1), mk(-1)] : [mk(-1), mk(1)];
  }
  // complex: re = −B/2A, im = ±s√t/2A
  const re = -B === 0 ? null : rat(-B, den);
  const im1 = t === 1 ? rat(Math.abs(s), Math.abs(den)) : surd(Math.abs(s), Math.abs(den));
  return [
    { k: "cplx", re, im: im1 },
    { k: "cplx", re, im: { ...im1, neg: true } },
  ];
}
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

function solveEqn(st) {
  const { type, coef } = st.eqn;
  const setup = st.setup;
  const fmt = (x) => formatReal(Math.abs(x) < 1e-13 ? 0 : x, { surd: true }, setup);
  const fmtDec = (x) => formatReal(Math.abs(x) < 1e-13 ? 0 : x, { inexact: true }, setup);
  const fmtRoot = (r) => (Math.abs(r.im) < 1e-13 ? fmt(r.re) : { k: "cplx", re: Math.abs(r.re) < 1e-13 ? null : fmt(r.re), im: fmt(r.im) });
  try {
    let items;
    if (type === "lin2" || type === "lin3") {
      const sol = solveLinear(coef);
      const names = ["X", "Y", "Z"];
      items = sol.map((x, i) => ({ label: `${names[i]}=`, disp: formatReal(Math.abs(x) < 1e-13 ? 0 : x, {}, setup), value: x }));
    } else if (type === "quad") {
      const [a, b, c] = coef[0];
      if (a === 0) throw new CalcError("Math ERROR");
      const roots = quadraticRoots(a, b, c);
      let exact = exactQuadratic(a, b, c);
      // Line I/O has no √ display: keep only rational exact roots
      if (exact && setup.io !== "math" && !exact.every((d) => d.k === "dec" || d.k === "frac")) exact = null;
      // no exact form: show decimals rather than guessing a fraction / surd from the float
      const show = (r) => (exact ? null : Math.abs(r.im) < 1e-13 ? fmtDec(r.re) : { k: "cplx", re: Math.abs(r.re) < 1e-13 ? null : fmtDec(r.re), im: fmtDec(r.im) });
      if (roots[0].re === roots[1].re && roots[0].im === roots[1].im) {
        items = [{ label: "X=", disp: exact ? exact[0] : show(roots[0]) }];
      } else {
        items = roots.map((r, i) => ({ label: `X${i + 1}=`, disp: exact ? exact[i] : show(r) }));
      }
    } else {
      const [a, b, c, d] = coef[0];
      if (a === 0) throw new CalcError("Math ERROR");
      // repeated roots are listed once (like X= for a double quadratic root)
      const roots = cubicRoots(a, b, c, d);
      items = roots.map((r, i) => ({ label: roots.length === 1 ? "X=" : `X${i + 1}=`, disp: fmtRoot(r) }));
    }
    return { ...st, view: { kind: "eqnResult", items, idx: 0, back: st.view } };
  } catch (e) {
    const msg = e instanceof CalcError ? e.message : /No Solution/.test(e?.message) ? "No Solution" : "Math ERROR";
    return { ...st, view: { ...st.view, error: msg } };
  }
}
function eqnResultKey(st, key, mod) {
  const v = st.view;
  const act = keyAction(key, mod, st);
  switch (act.cmd) {
    case "DOWN": return setView(st, { idx: Math.min(v.items.length - 1, v.idx + 1) });
    case "UP": return setView(st, { idx: Math.max(0, v.idx - 1) });
    case "EXE":
      if (v.idx + 1 < v.items.length) return setView(st, { idx: v.idx + 1 });
      return { ...st, view: { ...v.back, edit: null } };
    case "AC": return { ...st, view: { ...v.back, edit: null } };
    default: return act.a ? st : commonCommand(st, act);
  }
}

/* =================================================================== */
/*  Overlays: menus, code entry, confirmations                          */
/* =================================================================== */
const item = (label, act) => ({ label, act });
const insertSymAct = (v, extra) => (st) => insertIntoCalc(st, I.sym(v, extra));
const insertFuncAct = (name) => (st) => insertIntoCalc(st, I.func(name));
function insertIntoCalc(st, act) {
  // menus that insert something always go to the calculation screen
  let view = st.view.kind === "calc" ? st.view : calcView();
  if (view.error) view = calcView();
  return calcKeyAction({ ...st, view }, act);
}
function calcKeyAction(st, act) {
  const v = st.view;
  let tree = v.tree;
  if (v.shown) {
    tree = emptyTree();
    if (act.cont) tree = insertItem(tree, sym("Ans"));
  }
  return setView(st, { tree: applyInput(tree, act), shown: null, histIdx: -1, label: null, calcLoop: false });
}

function enterMode(st, mode) {
  const base = { ...st, mode, overlay: null, view: calcView(), base: mode === "BASE-N" ? "DEC" : st.base };
  if (mode === "STAT") return { ...base, overlay: { kind: "menu", id: "statType", page: 0 } };
  if (mode === "EQN") return { ...base, overlay: { kind: "menu", id: "eqnType", page: 0 } };
  if (mode === "MATRIX") return { ...base, overlay: { kind: "menu", id: "matSelect", page: 0, purpose: "dim" } };
  if (mode === "VECTOR") return { ...base, overlay: { kind: "menu", id: "vctSelect", page: 0, purpose: "dim" } };
  return base;
}

const MAT_DIMS = [[3, 3], [3, 2], [3, 1], [2, 3], [2, 2], [2, 1], [1, 3], [1, 2], [1, 1]];

export function menuDef(st, ov = st.overlay) {
  const twoVar = STAT_TYPES.find((t) => t.id === st.stat.type)?.twoVar;
  switch (ov.id) {
    case "mode":
      return { cols: 2, items: MODES.map((m) => item(m, (s) => enterMode(s, m))) };
    case "setup":
      return {
        cols: 2,
        pages: [
          [
            item("MthIO", (s) => ({ ...s, setup: { ...s.setup, io: "math" } })),
            item("LineIO", (s) => ({ ...s, setup: { ...s.setup, io: "line" } })),
            item("Deg", (s) => ({ ...s, setup: { ...s.setup, angle: "D" } })),
            item("Rad", (s) => ({ ...s, setup: { ...s.setup, angle: "R" } })),
            item("Gra", (s) => ({ ...s, setup: { ...s.setup, angle: "G" } })),
            item("Fix", (s) => ({ ...s, overlay: { kind: "num", id: "fix" } })),
            item("Sci", (s) => ({ ...s, overlay: { kind: "num", id: "sci" } })),
            item("Norm", (s) => ({ ...s, overlay: { kind: "num", id: "norm" } })),
          ],
          [
            item("ab/c", (s) => ({ ...s, setup: { ...s.setup, frac: "abc" } })),
            item("d/c", (s) => ({ ...s, setup: { ...s.setup, frac: "dc" } })),
            item("CMPLX", (s) => ({ ...s, overlay: { kind: "menu", id: "setupCmplx", page: 0 } })),
            item("STAT", (s) => ({ ...s, overlay: { kind: "menu", id: "setupStat", page: 0 } })),
            item("CONT▶", (s) => ({ ...s, overlay: { kind: "contrast" } })),
          ],
        ],
      };
    case "setupCmplx":
      return { cols: 1, items: [item("a+bi", (s) => ({ ...s, setup: { ...s.setup, cplx: "abi" } })), item("r∠θ", (s) => ({ ...s, setup: { ...s.setup, cplx: "polar" } }))] };
    case "setupStat":
      return {
        title: "Frequency?", cols: 1,
        items: [
          item("ON", (s) => ({ ...s, setup: { ...s.setup, freq: true } })),
          item("OFF", (s) => ({ ...s, setup: { ...s.setup, freq: false } })),
        ],
      };
    case "hyp":
      return {
        cols: 2,
        items: ["sinh", "cosh", "tanh", "asinh", "acosh", "atanh"].map((f) =>
          item(f.startsWith("a") ? `${f.slice(1)}⁻¹` : f, insertFuncAct(f))),
      };
    case "drg":
      return { cols: 3, items: [item("°", insertSymAct("drgD")), item("r", insertSymAct("drgR")), item("g", insertSymAct("drgG"))] };
    case "clr":
      return {
        title: "Clear?", cols: 1,
        items: [
          item("Setup", (s) => ({ ...s, overlay: { kind: "confirm", text: "Reset Setup?", id: "setup" } })),
          item("Memory", (s) => ({ ...s, overlay: { kind: "confirm", text: "Clear Memory?", id: "memory" } })),
          item("All", (s) => ({ ...s, overlay: { kind: "confirm", text: "Reset All?", id: "all" } })),
        ],
      };
    case "cmplx":
      return {
        cols: 2,
        items: [item("arg", insertFuncAct("arg")), item("Conjg", insertFuncAct("Conjg")), item("▶r∠θ", insertSymAct("toPolar")), item("▶a+bi", insertSymAct("toRect"))],
      };
    case "base":
      return {
        cols: 2,
        pages: [
          [
            item("and", insertSymAct("and")), item("or", insertSymAct("or")), item("xnor", insertSymAct("xnor")),
            item("xor", insertSymAct("xor")), item("Not", insertFuncAct("Not")), item("Neg", insertFuncAct("Neg")),
          ],
          [item("d", insertSymAct("pd")), item("h", insertSymAct("ph")), item("b", insertSymAct("pb")), item("o", insertSymAct("po"))],
        ],
      };
    case "statType":
      return { cols: 2, items: STAT_TYPES.map((t) => item(t.label, (s) => ({ ...s, stat: { type: t.id, rows: [] }, view: gridViewFor(s, "stat") }))) };
    case "stat": {
      const items = [
        item("Type", (s) => ({ ...s, overlay: { kind: "menu", id: "statType", page: 0 } })),
        item("Data", (s) => ({ ...s, view: gridViewFor(s, "stat") })),
        item("Sum", (s) => ({ ...s, overlay: { kind: "menu", id: "statSum", page: 0 } })),
        item("Var", (s) => ({ ...s, overlay: { kind: "menu", id: "statVar", page: 0 } })),
      ];
      if (twoVar) items.push(item("Reg", (s) => ({ ...s, overlay: { kind: "menu", id: "statReg", page: 0 } })));
      else items.push(item("Distr", (s) => ({ ...s, overlay: { kind: "menu", id: "statDistr", page: 0 } })));
      items.push(item("MinMax", (s) => ({ ...s, overlay: { kind: "menu", id: "statMinMax", page: 0 } })));
      return { cols: 2, items };
    }
    case "statSum":
      return { cols: 2, items: (twoVar ? ["sumx2", "sumx", "sumy2", "sumy", "sumxy", "sumx3", "sumx2y", "sumx4"] : ["sumx2", "sumx"]).map((k) => item(SYM[k].label, insertSymAct(k))) };
    case "statVar":
      return { cols: 2, items: (twoVar ? ["n", "xbar", "sigx", "sx", "ybar", "sigy", "sy"] : ["n", "xbar", "sigx", "sx"]).map((k) => item(SYM[k].label, insertSymAct(k))) };
    case "statMinMax":
      return { cols: 2, items: (twoVar ? ["minX", "maxX", "minY", "maxY"] : ["minX", "maxX"]).map((k) => item(SYM[k].label, insertSymAct(k))) };
    case "statDistr":
      return { cols: 2, items: [item("P(", insertFuncAct("P")), item("Q(", insertFuncAct("Q")), item("R(", insertFuncAct("R")), item("▶t", insertSymAct("toT"))] };
    case "statReg": {
      const keys = st.stat.type === "QUAD" ? ["regA", "regB", "regC", "xhat1", "xhat2", "yhat"] : ["regA", "regB", "regr", "xhat", "yhat"];
      return { cols: 2, items: keys.map((k) => item(SYM[k].label, insertSymAct(k))) };
    }
    case "eqnType":
      return {
        cols: 1,
        items: [
          item("anX+bnY=cn", (s) => setEqnType(s, "lin2")),
          item("anX+bnY+cnZ=dn", (s) => setEqnType(s, "lin3")),
          item("aX²+bX+c=0", (s) => setEqnType(s, "quad")),
          item("aX³+bX²+cX+d=0", (s) => setEqnType(s, "cubic")),
        ],
      };
    case "matrix":
      return {
        cols: 2,
        items: [
          item("Dim", (s) => ({ ...s, overlay: { kind: "menu", id: "matSelect", page: 0, purpose: "dim" } })),
          item("Data", (s) => ({ ...s, overlay: { kind: "menu", id: "matSelect", page: 0, purpose: "data" } })),
          item("MatA", insertSymAct("MatA")), item("MatB", insertSymAct("MatB")), item("MatC", insertSymAct("MatC")),
          item("MatAns", insertSymAct("MatAns")), item("det", insertFuncAct("det")), item("Trn", insertFuncAct("Trn")),
        ],
      };
    case "matSelect":
      return {
        title: "Matrix?", cols: 3,
        items: ["A", "B", "C"].map((n) => item(`Mat${n}`, (s) => {
          if (ov.purpose === "data" && s.mats[n]) return { ...s, view: gridViewFor(s, "mat", n) };
          return { ...s, overlay: { kind: "menu", id: "matDim", page: 0, name: n } };
        })),
      };
    case "matDim":
      return {
        title: `Mat${ov.name}(m×n) m×n?`, cols: 3,
        pages: [MAT_DIMS.slice(0, 6), MAT_DIMS.slice(6)].map((p) => p.map(([r, c]) => item(`${r}×${c}`, (s) => {
          const m = Array.from({ length: r }, () => Array(c).fill(0));
          const next = { ...s, mats: { ...s.mats, [ov.name]: m } };
          return { ...next, view: gridViewFor(next, "mat", ov.name) };
        }))),
      };
    case "vector":
      return {
        cols: 2,
        items: [
          item("Dim", (s) => ({ ...s, overlay: { kind: "menu", id: "vctSelect", page: 0, purpose: "dim" } })),
          item("Data", (s) => ({ ...s, overlay: { kind: "menu", id: "vctSelect", page: 0, purpose: "data" } })),
          item("VctA", insertSymAct("VctA")), item("VctB", insertSymAct("VctB")), item("VctC", insertSymAct("VctC")),
          item("VctAns", insertSymAct("VctAns")), item("Dot", insertSymAct("dot")),
        ],
      };
    case "vctSelect":
      return {
        title: "Vector?", cols: 3,
        items: ["A", "B", "C"].map((n) => item(`Vct${n}`, (s) => {
          if (ov.purpose === "data" && s.vcts[n]) return { ...s, view: gridViewFor(s, "vct", n) };
          return { ...s, overlay: { kind: "menu", id: "vctDim", page: 0, name: n } };
        })),
      };
    case "vctDim":
      return {
        title: `Vct${ov.name}(m) m?`, cols: 2,
        items: [3, 2].map((k) => item(String(k), (s) => {
          const next = { ...s, vcts: { ...s.vcts, [ov.name]: Array(k).fill(0) } };
          return { ...next, view: gridViewFor(next, "vct", ov.name) };
        })),
      };
    default:
      return { cols: 1, items: [] };
  }
}
function setEqnType(st, type) {
  const t = EQN_TYPES[type];
  const eqn = { type, coef: Array.from({ length: t.rows }, () => Array(t.cols).fill(0)) };
  const next = { ...st, eqn };
  return { ...next, view: gridViewFor(next, "eqn") };
}
export function menuPages(def) {
  return def.pages || [def.items];
}

function overlayKey(st, key, mod) {
  const ov = st.overlay;
  const close = { ...st, overlay: null };
  if (key === "AC") {
    // leaving the first menu of a mode keeps the calculator usable
    if (ov.kind === "menu" && ov.id === "statType" && st.view.kind !== "grid") return { ...close, view: gridViewFor(st, "stat") };
    if (ov.kind === "menu" && ov.id === "eqnType" && st.view.kind !== "grid") return setEqnType(close, st.eqn.type);
    return close;
  }
  if (ov.kind === "confirm") {
    if (key !== "EQ") return st;
    if (ov.id === "setup") return { ...close, setup: defaultSetup() };
    if (ov.id === "memory") return { ...close, vars: zeroVars(), ans: 0, preAns: 0 };
    const fresh = initialState();
    return { ...fresh };
  }
  if (ov.kind === "num") {
    if (!/^[0-9]$/.test(key)) return st;
    const n = Number(key);
    if (ov.id === "fix") return { ...close, setup: { ...st.setup, disp: { type: "fix", n } } };
    if (ov.id === "sci") return { ...close, setup: { ...st.setup, disp: { type: "sci", n } } };
    if (n !== 1 && n !== 2) return st;
    return { ...close, setup: { ...st.setup, disp: { type: "norm", n } } };
  }
  if (ov.kind === "contrast") {
    if (key === "LEFT") return { ...st, setup: { ...st.setup, contrast: Math.max(1, st.setup.contrast - 1) } };
    if (key === "RIGHT") return { ...st, setup: { ...st.setup, contrast: Math.min(9, st.setup.contrast + 1) } };
    return st;
  }
  if (ov.kind === "code") {
    const list = ov.id === "const" ? SCI_CONSTS : UNIT_CONVS;
    const pages = Math.ceil(list.length / 8);
    if (key === "DOWN") return { ...st, overlay: { ...ov, page: (ov.page + 1) % pages } };
    if (key === "UP") return { ...st, overlay: { ...ov, page: (ov.page + pages - 1) % pages } };
    if (key === "DEL") return { ...st, overlay: { ...ov, buf: ov.buf.slice(0, -1) } };
    if (!/^[0-9]$/.test(key)) return st;
    const buf = ov.buf + key;
    if (buf.length < 2) return { ...st, overlay: { ...ov, buf } };
    return pickCode(close, ov.id, Number(buf));
  }
  // list menus
  const def = menuDef(st, ov);
  const pages = menuPages(def);
  if (key === "DOWN" || key === "UP") {
    if (pages.length < 2) return st;
    const page = (ov.page + (key === "DOWN" ? 1 : pages.length - 1)) % pages.length;
    return { ...st, overlay: { ...ov, page } };
  }
  if (!/^[1-9]$/.test(key)) return st;
  const it = pages[ov.page][Number(key) - 1];
  if (!it) return st;
  return it.act(close);
}

/** Apply a constant / conversion chosen from the CONST / CONV list. */
export function pickCode(st, id, n) {
  st = { ...st, overlay: null };
  if (id === "const") {
    if (!SCI_CONSTS.some((c) => c.id === n)) return st;
    return insertIntoCalc(st, I.sym("const", { id: n }));
  }
  if (!UNIT_CONVS.some((c) => c.id === n)) return st;
  return insertIntoCalc(st, { ...I.sym("conv", { id: n }), cont: true });
}
/** Tap on a menu item (touch convenience; same effect as pressing its number). */
export function pickMenuItem(st, index) {
  const ov = st.overlay;
  if (!ov || ov.kind !== "menu") return st;
  const pages = menuPages(menuDef(st, ov));
  const it = pages[ov.page][index];
  return it ? it.act({ ...st, overlay: null, mod: null }) : st;
}

export { getIn, isCompound };
