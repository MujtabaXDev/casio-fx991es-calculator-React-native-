// Natural-display expression editor.
// The expression is a row (array) of items. Templates (fraction, √, log_□ …)
// own sub-rows ("fields"). The cursor is a path of {index, field} plus a position.
import { SYM } from "./symbols";

/* Field order = order the cursor visits the boxes of each template (as on the fx-991ES PLUS). */
export const FIELD_ORDER = {
  frac: ["num", "den"],
  mixed: ["whole", "num", "den"],
  sqrt: ["body"],
  root: ["index", "body"],
  pow: ["exp"], // superscript applied to whatever precedes it
  tenpow: ["exp"], // 10^□ (SHIFT log)
  epow: ["exp"], // e^□ (SHIFT ln)
  exp10: ["exp"], // ×10^□ (×10ˣ key: part of the number)
  log: ["base", "arg"], // log_□(□)
  abs: ["body"],
  group: ["body"],
  func: ["body"],
  integral: ["body", "lower", "upper"],
  deriv: ["body", "point"],
  sum: ["body", "start", "end"],
};
// Vertical level of every field, used by ▲ / ▼.
const LEVEL = {
  frac: { num: 1, den: -1 },
  mixed: { whole: 0, num: 1, den: -1 },
  root: { index: 1, body: 0 },
  log: { base: -1, arg: 0 },
  integral: { upper: 1, body: 0, lower: -1 },
  sum: { end: 1, body: 0, start: -1 },
  deriv: { body: 0, point: -1 },
};

export const isCompound = (it) => !!it && Object.prototype.hasOwnProperty.call(FIELD_ORDER, it.t);

export function emptyTree() {
  return { expr: [], path: [], pos: 0 };
}
export function treeFrom(items) {
  return { expr: items, path: [], pos: items.length };
}
export function getIn(row, path) {
  let r = row;
  for (const s of path) r = r[s.index][s.field];
  return r;
}
function setIn(row, path, newRow) {
  if (path.length === 0) return newRow;
  const [s, ...rest] = path;
  const copy = row.slice();
  copy[s.index] = { ...row[s.index], [s.field]: setIn(row[s.index][s.field], rest, newRow) };
  return copy;
}
const curRow = (st) => getIn(st.expr, st.path);
const withRow = (st, row, pos) => ({ expr: setIn(st.expr, st.path, row), path: st.path, pos });

/* ========================= INSERT ========================= */
export function insertItem(st, item, enterField = null, enterPos = 0) {
  const row = curRow(st);
  const next = [...row.slice(0, st.pos), item, ...row.slice(st.pos)];
  const s = withRow(st, next, st.pos + 1);
  if (enterField) return { ...s, path: [...st.path, { index: st.pos, field: enterField }], pos: enterPos };
  return s;
}
export function insertTemplate(st, item) {
  return insertItem(st, item, FIELD_ORDER[item.t][0]);
}

export function insertDigit(st, ch) {
  // Each digit is its own item (so the cursor can move between digits);
  // the parser joins adjacent digits into one number.
  const row = curRow(st);
  if (ch === ".") {
    let a = st.pos - 1;
    while (a >= 0 && row[a].t === "digit") { if (row[a].v === ".") return st; a--; }
    let b = st.pos;
    while (b < row.length && row[b].t === "digit") { if (row[b].v === ".") return st; b++; }
  }
  return insertItem(st, { t: "digit", v: ch });
}

export const sym = (v, extra) => ({ t: "sym", v, ...extra });
const VALUE_END = (it) => {
  if (!it) return false;
  if (it.t === "digit" || isCompound(it)) return true;
  if (it.t === "sym") {
    const k = SYM[it.v]?.kind;
    return k === "value" || k === "var" || k === "postfix" || k === "close";
  }
  return false;
};
export const endsWithValue = (row) => VALUE_END(row[row.length - 1]);

/** The operand just before the cursor (digit run / value / template, plus trailing postfix ops). */
function captureOperand(row, pos) {
  let start = pos;
  while (start > 0) {
    const it = row[start - 1];
    if (it.t === "pow" || it.t === "exp10" || (it.t === "sym" && SYM[it.v]?.kind === "postfix")) start--;
    else break;
  }
  if (start === 0) return null;
  const it = row[start - 1];
  if (it.t === "digit") {
    while (start > 0 && row[start - 1].t === "digit") start--;
  } else if (isCompound(it) && it.t !== "pow" && it.t !== "exp10") start--;
  else if (it.t === "sym" && (SYM[it.v]?.kind === "value" || SYM[it.v]?.kind === "var")) start--;
  else return null;
  return { start, items: row.slice(start, pos) };
}

export function insertFraction(st) {
  const row = curRow(st);
  const cap = captureOperand(row, st.pos);
  if (!cap) return insertTemplate(st, { t: "frac", num: [], den: [] });
  const item = { t: "frac", num: cap.items, den: [] };
  const next = [...row.slice(0, cap.start), item, ...row.slice(st.pos)];
  return { expr: setIn(st.expr, st.path, next), path: [...st.path, { index: cap.start, field: "den" }], pos: 0 };
}

/* ========================= CURSOR ========================= */
export function moveRight(st) {
  const row = curRow(st);
  if (st.pos < row.length) {
    const it = row[st.pos];
    if (isCompound(it)) return { ...st, path: [...st.path, { index: st.pos, field: FIELD_ORDER[it.t][0] }], pos: 0 };
    return { ...st, pos: st.pos + 1 };
  }
  if (st.path.length === 0) return { ...st, pos: 0 }; // wrap to start (as on the real calculator)
  const last = st.path[st.path.length - 1];
  const parentPath = st.path.slice(0, -1);
  const parent = getIn(st.expr, parentPath)[last.index];
  const fields = FIELD_ORDER[parent.t];
  const fi = fields.indexOf(last.field);
  if (fi < fields.length - 1) return { ...st, path: [...parentPath, { index: last.index, field: fields[fi + 1] }], pos: 0 };
  return { ...st, path: parentPath, pos: last.index + 1 };
}

export function moveLeft(st) {
  if (st.pos > 0) {
    const row = curRow(st);
    const it = row[st.pos - 1];
    if (isCompound(it)) {
      const fields = FIELD_ORDER[it.t];
      const f = fields[fields.length - 1];
      return { ...st, path: [...st.path, { index: st.pos - 1, field: f }], pos: it[f].length };
    }
    return { ...st, pos: st.pos - 1 };
  }
  if (st.path.length === 0) return { ...st, pos: curRow(st).length }; // wrap to end
  const last = st.path[st.path.length - 1];
  const parentPath = st.path.slice(0, -1);
  const parent = getIn(st.expr, parentPath)[last.index];
  const fields = FIELD_ORDER[parent.t];
  const fi = fields.indexOf(last.field);
  if (fi > 0) {
    const pf = fields[fi - 1];
    return { ...st, path: [...parentPath, { index: last.index, field: pf }], pos: parent[pf].length };
  }
  return { ...st, path: parentPath, pos: last.index };
}

/** Leave the innermost bracket-like template to the right (the ")" key). Returns null if not inside one. */
export function closeParen(st) {
  for (let d = st.path.length - 1; d >= 0; d--) {
    const parentPath = st.path.slice(0, d);
    const node = getIn(st.expr, parentPath)[st.path[d].index];
    if (["group", "func", "abs", "log", "sqrt", "root", "deriv"].includes(node.t)) {
      // for log/root only leave when in the final field
      const fields = FIELD_ORDER[node.t];
      if (st.path[d].field !== fields[fields.length - 1]) continue;
      return { ...st, path: parentPath, pos: st.path[d].index + 1 };
    }
  }
  return null;
}

export function moveVertical(st, dir) {
  for (let d = st.path.length - 1; d >= 0; d--) {
    const step = st.path[d];
    const parentPath = st.path.slice(0, d);
    const node = getIn(st.expr, parentPath)[step.index];
    const levels = LEVEL[node.t];
    if (!levels) continue;
    const cur = levels[step.field];
    let best = null;
    for (const [f, lv] of Object.entries(levels)) {
      if (dir === "up" ? lv > cur : lv < cur) {
        if (best === null || (dir === "up" ? lv < levels[best] : lv > levels[best])) best = f;
      }
    }
    if (best) {
      return { ...st, path: [...parentPath, { index: step.index, field: best }], pos: Math.min(st.pos, node[best].length) };
    }
  }
  return null;
}

/* ========================= DELETE ========================= */
export function backspace(st) {
  const row = curRow(st);
  if (st.pos > 0) {
    const it = row[st.pos - 1];
    if (isCompound(it) && FIELD_ORDER[it.t].some((f) => it[f].length > 0) && it.t !== "pow" && it.t !== "exp10") {
      const fields = FIELD_ORDER[it.t];
      const f = fields[fields.length - 1];
      return { ...st, path: [...st.path, { index: st.pos - 1, field: f }], pos: it[f].length };
    }
    const next = [...row.slice(0, st.pos - 1), ...row.slice(st.pos)];
    return withRow(st, next, st.pos - 1);
  }
  if (st.path.length === 0) return st;
  // At the start of a box: in the first box the template is removed and its
  // contents are kept; otherwise jump to the end of the previous box.
  const last = st.path[st.path.length - 1];
  const parentPath = st.path.slice(0, -1);
  const parentRow = getIn(st.expr, parentPath);
  const node = parentRow[last.index];
  const fields = FIELD_ORDER[node.t];
  const fi = fields.indexOf(last.field);
  if (fi > 0) {
    const pf = fields[fi - 1];
    return { ...st, path: [...parentPath, { index: last.index, field: pf }], pos: node[pf].length };
  }
  const keep = node.t === "frac" ? [...node.num, ...node.den] : fields.flatMap((f) => node[f]);
  const keepPrefix = node.t === "tenpow" ? [{ t: "digit", v: "1" }, { t: "digit", v: "0" }] : node.t === "epow" ? [sym("e")] : [];
  const contents = [...keepPrefix, ...keep];
  const next = [...parentRow.slice(0, last.index), ...contents, ...parentRow.slice(last.index + 1)];
  return { expr: setIn(st.expr, parentPath, next), path: parentPath, pos: Math.min(last.index + keepPrefix.length, next.length) };
}

/* ========================= LINEAR TEXT ========================= */
// Used for Line I/O display, tests and debugging.
export function toLinear(row) {
  return row.map(itemLinear).join("");
}
function itemLinear(it) {
  const L = toLinear;
  switch (it.t) {
    case "digit": return it.v;
    case "op": return { "+": "+", "-": "−", "*": "×", "/": "÷" }[it.v];
    case "neg": return "−";
    case "sym":
      if (it.v === "const") return `[c${it.id}]`;
      if (it.v === "conv") return `[conv${it.id}]`;
      if (it.v === "sq") return "²";
      if (it.v === "cube") return "³";
      if (it.v === "inv") return "⁻¹";
      return SYM[it.v]?.label ?? it.v;
    case "frac": return `${L(it.num)}⌟${L(it.den)}`;
    case "mixed": return `${L(it.whole)}⌟${L(it.num)}⌟${L(it.den)}`;
    case "sqrt": return `√(${L(it.body)})`;
    case "root": return `${L(it.index)}x√(${L(it.body)})`;
    case "pow": return `^(${L(it.exp)})`;
    case "tenpow": return `10^(${L(it.exp)})`;
    case "epow": return `e^(${L(it.exp)})`;
    case "exp10": return `×10^(${L(it.exp)})`;
    case "log": return `log(${L(it.base)},${L(it.arg)})`;
    case "abs": return `Abs(${L(it.body)})`;
    case "group": return `(${L(it.body)})`;
    case "func": return `${it.label || it.name}(${L(it.body)})`.replace("((", "(");
    case "integral": return `∫(${L(it.body)},${L(it.lower)},${L(it.upper)})`;
    case "deriv": return `d/dx(${L(it.body)},${L(it.point)})`;
    case "sum": return `Σ(${L(it.body)},${L(it.start)},${L(it.end)})`;
    default: return "?";
  }
}
