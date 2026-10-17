// Key-sequence tests: each case presses real calculator keys and checks the LCD result.
// Run: npm test
import { initialState, pressKey, resultDisplay, gridData } from "../src/logic/machine.js";
import { dispText } from "../src/engine/format.js";
import { toLinear } from "../src/engine/tree.js";

const press = (st, seq) => seq.trim().split(/\s+/).reduce((s, k) => pressKey(s, k), st);
const out = (st) => {
  const v = st.view;
  if (v.error) return v.error;
  if (v.kind === "eqnResult") return v.items.map((i) => `${i.label}${dispText(i.disp)}`).join(" ");
  if (v.kind === "table") return v.rows.map(([x, y]) => `${x}:${y}`).join(" ");
  if (v.shown?.solve) return `${v.shown.solve.name}=${dispText(resultDisplay(st))}`;
  return dispText(resultDisplay(st));
};

let pass = 0, fail = 0;
function t(name, seq, expected, start = initialState()) {
  let got;
  try {
    got = out(press(start, seq));
  } catch (e) {
    got = `THROW ${e.stack}`;
  }
  if (got === expected) pass++;
  else {
    fail++;
    console.log(`✗ ${name}\n    keys: ${seq}\n    want: ${expected}\n    got:  ${got}`);
  }
}
const after = (seq, st = initialState()) => press(st, seq);

/* ---------- arithmetic & priority ---------- */
t("add", "1 2 ADD 3 4 EQ", "46");
t("priority", "2 ADD 3 MUL 4 EQ", "14");
t("divide sign is ÷ not fraction", "1 DIV 2 MUL 4 EQ", "2");
t("implicit mult same level as ÷", "1 DIV 2 SHIFT EXP EQ", "π/2");
t("fraction result", "1 DIV 3 EQ", "1/3");
t("0.1+0.2", "0 DOT 1 ADD 0 DOT 2 EQ", "3/10");
t("decimal input shows fraction", "0 DOT 5 EQ", "1/2");
t("neg square", "NEG 2 SQ EQ", "-4");
t("paren square", "LPAR NEG 2 RPAR SQ EQ", "4");
t("power", "2 POW 1 0 EQ", "1024");
t("power then continue", "2 POW 3 RIGHT ADD 1 EQ", "9");
t("x^y^z typed nested", "2 POW 3 POW 2 EQ", "512");
t("reciprocal", "4 INV EQ", "1/4");
t("factorial", "5 SHIFT INV EQ", "120");
t("big", "1 0 0 SHIFT INV EQ", "Math ERROR");
t("div zero", "1 DIV 0 EQ", "Math ERROR");
t("syntax", "1 ADD EQ", "Syntax ERROR");
t("sci notation large", "9 9 9 9 9 9 9 9 9 9 MUL 1 0 EQ", "9.999999999E10");
t("sci small", "1 DIV 2 0 0 0 0 EQ", "1/20000");
t("sci small decimal", "1 DIV 2 0 0 0 0 EQ SD", "5E-5");
t("x10 exp", "2 EXP 3 EQ", "2000");
t("x10 binds tight", "1 DIV 2 EXP 3 EQ", "1/2000");
t("percent", "1 5 0 0 MUL 1 2 SHIFT LPAR EQ", "180");
t("nCr", "5 SHIFT DIV 2 EQ", "10");
t("nPr", "5 SHIFT MUL 2 EQ", "20");
t("unclosed paren auto-closed", "2 MUL LPAR 3 ADD 4 EQ", "14");
t("double minus", "5 SUB SUB 3 EQ", "8");
t("times minus", "2 MUL SUB 3 EQ", "-6");

/* ---------- fraction template ---------- */
t("frac template", "FRAC 1 DOWN 3 RIGHT ADD FRAC 1 DOWN 6 EQ", "1/2");
t("frac captures number", "1 2 FRAC 8 EQ", "3/2");
t("mixed fraction", "SHIFT FRAC 1 RIGHT 1 RIGHT 2 EQ", "3/2");
t("S<>D", "1 DIV 3 EQ SD", "0.3333333333");
t("S<>D twice", "1 DIV 3 EQ SD SD", "1/3");
t("ab/c<>d/c", "7 DIV 2 EQ SHIFT SD", "3⌟1/2");
t("frac too long → decimal", "1 DIV 1 2 3 4 5 6 7 EQ", "8.100005913E-7");

/* ---------- roots, logs ---------- */
t("sqrt8", "SQRT 8 EQ", "2√2");
t("sqrt perfect", "SQRT 1 4 4 EQ", "12");
t("sqrt sum", "SQRT 2 RIGHT ADD SQRT 8 EQ", "3√2");
t("cbrt", "SHIFT SQRT 2 7 EQ", "3");
t("cbrt negative", "SHIFT SQRT NEG 8 EQ", "-2");
t("nth root", "SHIFT POW 4 RIGHT 1 6 EQ", "2");
t("sqrt negative", "SQRT NEG 4 EQ", "Math ERROR");
t("log key", "LOG 1 0 0 0 EQ", "3");
t("log base template", "LOGB 2 RIGHT 8 EQ", "3");
t("ln e", "LN ALPHA EXP EQ", "1");
t("ln 2", "LN 2 EQ", "0.6931471806");
t("10^x", "SHIFT LOG 3 EQ", "1000");
t("e^x", "SHIFT LN 1 EQ", "2.718281828");
t("ln 0", "LN 0 EQ", "Math ERROR");

/* ---------- trig ---------- */
t("sin30", "SIN 3 0 EQ", "1/2");
t("sin45", "SIN 4 5 EQ", "√2/2");
t("cos60", "COS 6 0 EQ", "1/2");
t("tan45", "TAN 4 5 EQ", "1");
t("tan90", "TAN 9 0 EQ", "Math ERROR");
t("sin180 exact zero", "SIN 1 8 0 EQ", "0");
t("asin 0.5", "SHIFT SIN 0 DOT 5 EQ", "30");
t("asin 2", "SHIFT SIN 2 EQ", "Math ERROR");
const rad = after("SHIFT MODE 4");
t("rad sin(pi/6)", "SIN SHIFT EXP DIV 6 EQ", "1/2", rad);
t("rad asin 1", "SHIFT SIN 1 EQ", "π/2", rad);
t("rad sin 1", "SIN 1 EQ", "0.8414709848", rad);
t("grad", "COS 1 0 0 EQ", "0", after("SHIFT MODE 5"));
t("hyp menu sinh", "HYP 1 1 EQ", "1.175201194");
t("hyp menu asinh", "HYP 4 1 EQ", "0.881373587");
t("abs", "SHIFT HYP NEG 5 EQ", "5");
t("pi", "SHIFT EXP EQ", "π");
t("2pi", "2 SHIFT EXP EQ", "2π");
t("drg rad→deg", "SHIFT EXP SHIFT ANS 2 EQ", "180");
t("dms input", "2 DMS 3 0 DMS 0 DMS EQ", "5/2");
t("dms display", "2 DOT 5 EQ DMS", "2°30°0°");

/* ---------- Ans, memory, variables ---------- */
t("Ans chaining with op", "3 ADD 4 EQ MUL 2 EQ", "14");
t("Ans new number replaces", "3 ADD 4 EQ 5 EQ", "5");
t("Ans key", "3 ADD 4 EQ ANS ADD 1 EQ", "8");
t("repeat EQ re-evaluates", "1 EQ ANS ADD 1 EQ EQ EQ", "4");
t("square after result uses Ans", "5 EQ SQ EQ", "25");
t("M+", "5 MPLUS 3 MPLUS RCL MPLUS", "8");
t("M-", "5 MPLUS 2 SHIFT MPLUS ALPHA MPLUS EQ", "3");
t("STO A", "7 SHIFT RCL NEG ALPHA NEG MUL 2 EQ", "14");
t("STO from result", "2 ADD 3 EQ SHIFT RCL HYP ALPHA HYP SQ EQ", "25");
t("RCL", "9 SHIFT RCL COS RCL COS", "9");
t("variables default 0", "ALPHA SIN ADD 1 EQ", "1");
t("clear memory", "5 SHIFT RCL NEG SHIFT 9 2 EQ ALPHA NEG EQ", "0");

/* ---------- CALC & SOLVE ---------- */
t("CALC", "ALPHA RPAR SQ ADD 1 CALC 3 EQ", "10");
t("CALC again", "ALPHA RPAR SQ ADD 1 CALC 3 EQ EQ 4 EQ", "17");
t("CALC keep value", "ALPHA RPAR ADD 1 CALC 5 EQ CALC EQ", "6");
t("CALC assignment", "ALPHA SD ALPHA CALC ALPHA RPAR MUL 2 CALC 4 EQ ALPHA SD EQ", "8");
t("SOLVE x^2=4 → 2", "ALPHA RPAR SQ ALPHA CALC 4 SHIFT CALC 1 EQ", "X=2");
t("SOLVE linear", "2 ALPHA RPAR ADD 3 ALPHA CALC 1 1 SHIFT CALC EQ", "X=4");
t("SOLVE no equals", "ALPHA RPAR SQ SUB 9 SHIFT CALC 5 EQ", "X=3");
t("SOLVE impossible", "ALPHA RPAR SQ ADD 1 SHIFT CALC EQ", "Can't Solve");

/* ---------- Pol / Rec, random, Rnd ---------- */
t("Pol", "SHIFT ADD 1 SHIFT RPAR 1 RPAR EQ", "r=√2, θ=45");
t("Rec", "SHIFT SUB 2 SHIFT RPAR 6 0 RPAR EQ", "X=1, Y=√3");
t("Pol stores X", "SHIFT ADD 3 SHIFT RPAR 4 EQ ALPHA RPAR EQ", "5");
t("Rnd", "SHIFT MODE 6 2 SHIFT 0 1 DIV 3 RPAR MUL 3 EQ", "0.99");
t("Ran# range", "SHIFT DOT MUL 0 EQ", "0");

/* ---------- integral, derivative, sum ---------- */
t("integral x^2 0..3", "INTEG ALPHA RPAR SQ RIGHT 0 RIGHT 3 EQ", "9");
t("integral sin rad 0..pi", "INTEG SIN ALPHA RPAR RIGHT RIGHT 0 RIGHT SHIFT EXP EQ", "2", rad);
t("integral 1/x", "INTEG FRAC 1 DOWN ALPHA RPAR RIGHT RIGHT 1 RIGHT 2 EQ", "0.6931471806");
t("integral sin 0..π/3 (box photo) = 1/2", "INTEG SIN ALPHA RPAR RIGHT RIGHT 0 RIGHT FRAC SHIFT EXP DOWN 3 EQ", "1/2", rad);
t("integral x 0..1 = 1/2", "INTEG ALPHA RPAR RIGHT 0 RIGHT 1 EQ", "1/2");
t("integral sqrt x 0..1 = 2/3", "INTEG SQRT ALPHA RPAR RIGHT RIGHT 0 RIGHT 1 EQ", "2/3");
t("integral e^x stays decimal", "INTEG SHIFT LN ALPHA RPAR RIGHT RIGHT 0 RIGHT 1 EQ", "1.718281828");
t("integral sin 0..1 stays decimal", "INTEG SIN ALPHA RPAR RIGHT RIGHT 0 RIGHT 1 EQ", "0.4596976941", rad);
t("derivative x^2 at 1/2 = 1", "SHIFT INTEG ALPHA RPAR SQ RIGHT 0 DOT 5 EQ", "1");
t("derivative x^3 at 1/2 = 3/4", "SHIFT INTEG ALPHA RPAR SHIFT SQ RIGHT 0 DOT 5 EQ", "3/4");
t("derivative x^3 at 2", "SHIFT INTEG ALPHA RPAR SHIFT SQ RIGHT 2 EQ", "12");
t("derivative sin rad at 0", "SHIFT INTEG SIN ALPHA RPAR RIGHT RIGHT 0 EQ", "1", rad);
t("sum 1..10", "SHIFT LOGB ALPHA RPAR RIGHT 1 RIGHT 1 0 EQ", "55");
t("sum fractions", "SHIFT LOGB FRAC 1 DOWN ALPHA RPAR RIGHT RIGHT 1 RIGHT 3 EQ", "11/6");

/* ---------- display settings ---------- */
t("Fix 3", "SHIFT MODE 6 3 1 DIV 3 EQ SD", "0.333");
t("Sci 3", "SHIFT MODE 7 3 1 2 3 4 5 EQ", "1.23E4");
t("Norm 2", "SHIFT MODE 8 2 1 DIV 2 0 0 EQ SD", "0.005");
t("ENG", "1 2 3 4 5 EQ ENG", "12.345E3");
t("ENG twice", "1 2 3 4 5 EQ ENG ENG", "0.012345E6");
t("ENG left", "1 2 3 4 5 EQ SHIFT ENG", "12345E0");
t("LineIO fraction", "SHIFT MODE 2 1 DIV 3 EQ", "1/3");
t("LineIO surd → decimal", "SHIFT MODE 2 SQRT 2 EQ", "1.414213562");
t("ab/c setup", "SHIFT MODE DOWN 1 7 DIV 2 EQ", "3⌟1/2");

/* ---------- editing ---------- */
t("DEL", "1 2 3 DEL ADD 1 EQ", "13");
t("left insert", "1 3 LEFT 2 EQ", "123");
t("edit after result", "1 ADD 2 EQ LEFT DEL 5 EQ", "6");
t("replay", "2 ADD 2 EQ 3 ADD 3 EQ UP UP EQ", "4");
t("error goto", "1 ADD EQ LEFT 1 EQ", "2");
t("AC after error", "1 ADD EQ AC 2 EQ", "2");

/* ---------- CMPLX ---------- */
const cmplx = after("MODE 2");
t("complex mult", "LPAR 1 ADD 2 ENG RPAR MUL LPAR 3 SUB ENG RPAR EQ", "5+5i", cmplx);
t("complex divide", "1 DIV ENG EQ", "-i", cmplx);
t("i squared", "ENG SQ EQ", "-1", cmplx);
t("complex abs", "SHIFT HYP 3 ADD 4 ENG EQ", "5", cmplx);
t("conjugate", "SHIFT 2 2 2 ADD 3 ENG EQ", "2-3i", cmplx);
t("arg", "SHIFT 2 1 1 ADD ENG EQ", "45", cmplx);
t("polar input", "2 SHIFT NEG 9 0 EQ", "2i", cmplx);
t("to polar", "1 ADD ENG SHIFT 2 3 EQ", "√2∠45", cmplx);
t("complex in COMP is error", "SQRT NEG 1 EQ", "Math ERROR");

/* ---------- BASE-N ---------- */
const baseN = after("MODE 4");
t("base add", "1 2 ADD 3 EQ", "15", baseN);
t("base to hex", "2 5 5 EQ POW", "000000FF", baseN);
t("base to bin", "1 0 EQ LOG", "0000000000001010", baseN);
t("hex input", "POW NEG ADD 1 EQ", "0000000B", baseN);
t("int division", "7 DIV 2 EQ", "3", baseN);
t("and", "1 2 SHIFT 3 1 1 0 EQ", "8", baseN);
t("Neg", "SHIFT 3 6 5 RPAR EQ", "-5", baseN);
t("neg in hex", "1 SUB 2 EQ POW", "FFFFFFFF", baseN);
t("bin overflow", "LOG 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 EQ", "Math ERROR", baseN);
t("prefix", "SHIFT 3 DOWN 2 1 0 ADD 1 EQ", "17", baseN);

/* ---------- EQN ---------- */
const eqn = (type) => after(`MODE 5 ${type}`);
t("lin2", "2 EQ 3 EQ 8 EQ 1 EQ SUB 1 EQ 1 EQ EQ EQ", "X=11/5 Y=6/5", eqn(1));
t("lin3", "1 EQ 1 EQ 1 EQ 6 EQ 0 EQ 2 EQ 5 EQ SUB 4 EQ 2 EQ 5 EQ SUB 1 EQ 2 7 EQ EQ", "X=5 Y=3 Z=-2", eqn(2));
t("quad rational", "1 EQ SUB 3 EQ 2 EQ EQ", "X1=2 X2=1", eqn(3));
t("quad surd", "1 EQ 1 EQ SUB 1 EQ EQ", "X1=(-1+√5)/2 X2=(-1-√5)/2", eqn(3));
t("quad pure surd", "1 EQ 0 EQ SUB 2 EQ EQ", "X1=√2 X2=-√2", eqn(3));
t("quad complex", "1 EQ 2 EQ 5 EQ EQ", "X1=-1+2i X2=-1-2i", eqn(3));
t("quad double", "1 EQ SUB 4 EQ 4 EQ EQ", "X=2", eqn(3));
t("cubic", "1 EQ SUB 6 EQ 1 1 EQ SUB 6 EQ EQ", "X1=3 X2=2 X3=1", eqn(4));
t("cubic complex", "1 EQ 0 EQ 0 EQ SUB 1 EQ EQ", "X1=1 X2=-1/2+√3/2i X3=-1/2-√3/2i", eqn(4));
t("lin no solution", "1 EQ 1 EQ 1 EQ 1 EQ 1 EQ 2 EQ EQ", "No Solution", eqn(1));

/* ---------- STAT ---------- */
{
  let s = after("MODE 3 1 1 EQ 2 EQ 3 EQ 4 EQ AC");
  t("stat n", "SHIFT 1 4 1 EQ", "4", s);
  t("stat mean", "SHIFT 1 4 2 EQ", "5/2", s);
  t("stat sigma x", "SHIFT 1 4 3 EQ", "1.118033989", s);
  t("stat sx", "SHIFT 1 4 4 EQ", "1.290994449", s);
  t("stat sum", "SHIFT 1 3 2 EQ", "10", s);
  t("stat sumx2", "SHIFT 1 3 1 EQ", "30", s);
  t("stat max", "SHIFT 1 6 2 EQ", "4", s);
  const lin = after("MODE 3 2 1 EQ 2 EQ 3 EQ UP UP UP RIGHT 2 EQ 4 EQ 6 EQ AC");
  t("reg B", "SHIFT 1 5 2 EQ", "2", lin);
  t("reg A", "SHIFT 1 5 1 EQ", "0", lin);
  t("reg r", "SHIFT 1 5 3 EQ", "1", lin);
  t("y hat", "5 SHIFT 1 5 5 EQ", "10", lin);
  const g = after("MODE 3 1 1 EQ 2 EQ 3 EQ");
  t("stat rows", "", "", g);
  if (gridData(g).cells.length !== 3) { fail++; console.log("✗ stat grid rows", gridData(g).cells); } else pass++;
}

/* ---------- MATRIX / VECTOR ---------- */
{
  let m = after("MODE 6 1 5 1 EQ 2 EQ 3 EQ 4 EQ AC"); // MatA 2x2 = [[1,2],[3,4]]
  t("det", "SHIFT 4 7 SHIFT 4 3 EQ", "-2", m);
  m = press(m, "SHIFT 4 1 2 5 5 EQ 6 EQ 7 EQ 8 EQ AC"); // MatB = [[5,6],[7,8]]
  const prod = press(m, "SHIFT 4 3 MUL SHIFT 4 4 EQ");
  const cells = JSON.stringify(gridData(prod).cells);
  if (cells === "[[19,22],[43,50]]") pass++; else { fail++; console.log("✗ MatA×MatB", cells); }
  const inv = press(m, "SHIFT 4 3 INV EQ");
  const ic = JSON.stringify(gridData(inv).cells.map((r) => r.map((x) => Math.round(x * 100) / 100)));
  if (ic === "[[-2,1],[1.5,-0.5]]") pass++; else { fail++; console.log("✗ MatA⁻¹", ic); }
  const tr = press(m, "SHIFT 4 8 SHIFT 4 3 EQ");
  if (JSON.stringify(gridData(tr).cells) === "[[1,3],[2,4]]") pass++; else { fail++; console.log("✗ Trn", gridData(tr).cells); }
  t("dim error", "SHIFT 4 3 ADD SHIFT 4 5 EQ", "Dimension ERROR", m);

  let v = after("MODE 8 1 1 1 EQ 2 EQ 3 EQ AC SHIFT 5 1 2 1 4 EQ 5 EQ 6 EQ AC");
  t("dot", "SHIFT 5 3 SHIFT 5 7 SHIFT 5 4 EQ", "32", v);
  const cross = press(v, "SHIFT 5 3 MUL SHIFT 5 4 EQ");
  if (JSON.stringify(gridData(cross).cells) === "[[-3,6,-3]]") pass++; else { fail++; console.log("✗ cross", gridData(cross).cells); }
  t("vector abs", "SHIFT HYP SHIFT 5 3 EQ", "√14", v);
}

/* ---------- TABLE ---------- */
t("table", "MODE 7 ALPHA RPAR SQ ADD 1 EQ 1 EQ 4 EQ 1 EQ", "1:2 2:5 3:10 4:17");
t("table too long", "MODE 7 ALPHA RPAR EQ 1 EQ 1 0 0 EQ 1 EQ", "Insufficient MEM");

/* ---------- CONST / CONV / misc ---------- */
t("const c0", "SHIFT 7 2 8 EQ", "299792458");
t("conv in→cm", "1 SHIFT 8 0 1 EQ", "2.54");
t("conv °C→°F", "1 0 0 SHIFT 8 3 8 EQ", "212");
t("OFF/ON keeps memory", "5 SHIFT RCL NEG SHIFT AC ON ALPHA NEG EQ", "5");
t("multi statement", "1 ADD 1 ALPHA INTEG 2 ADD 2 EQ EQ", "4");
t("reset all", "SHIFT MODE 4 SHIFT 9 3 EQ SIN 3 0 EQ", "1/2");

/* ---------- regressions (full-mode audit) ---------- */
// COMP: cancellation noise, a+b√c forms, singular-endpoint integrals
t("0.1+0.2-0.3 = 0", "0 DOT 1 ADD 0 DOT 2 SUB 0 DOT 3 EQ", "0");
t("1-0.9-0.1 = 0", "1 SUB 0 DOT 9 SUB 0 DOT 1 EQ", "0");
t("sqrt2+1", "SQRT 2 RIGHT ADD 1 EQ", "1+√2");
t("(1+sqrt3)/2", "FRAC 1 ADD SQRT 3 RIGHT DOWN 2 EQ", "(1+√3)/2");
t("tan15 = 2-√3", "TAN 1 5 EQ", "2-√3");
t("sqrt2+sqrt3 stays decimal", "SQRT 2 RIGHT ADD SQRT 3 EQ", "3.14626437");
t("integral 1/sqrt x 0..1 = 2", "INTEG FRAC 1 DOWN SQRT ALPHA RPAR RIGHT RIGHT RIGHT 0 RIGHT 1 EQ", "2");
t("integral ln x 0..1 = -1", "INTEG LN ALPHA RPAR RPAR RIGHT 0 RIGHT 1 EQ", "-1");
// CMPLX: noise in one part, ▶r∠θ of a real result
t("(2∠45)² = 4i", "LPAR 2 SHIFT NEG 4 5 RPAR SQ EQ", "4i", cmplx);
t("1∠120+1∠240+1 = 0", "1 SHIFT NEG 1 2 0 ADD 1 SHIFT NEG 2 4 0 ADD 1 EQ", "0", cmplx);
t("-1 ▶r∠θ", "NEG 1 SHIFT 2 3 EQ", "1∠180", cmplx);
// BASE-N: signed 32-bit overflow
t("hex 7FFFFFFF+1 overflow", "POW 7 TAN TAN TAN TAN TAN TAN TAN ADD 1 EQ", "Math ERROR", baseN);
t("hex FFFFFFFF+1 = 0", "POW TAN TAN TAN TAN TAN TAN TAN TAN ADD 1 EQ", "00000000", baseN);
// EQN: repeated cubic roots, a+b√c display, long radicands
t("cubic triple root", "1 EQ SUB 3 EQ 3 EQ SUB 1 EQ EQ", "X=1", eqn(4));
t("cubic triple root 0.1", "1 EQ SUB 0 DOT 3 EQ 0 DOT 0 3 EQ SUB 0 DOT 0 0 1 EQ EQ", "X=1/10", eqn(4));
t("cubic double root", "1 EQ SUB 4 EQ 5 EQ SUB 2 EQ EQ", "X1=2 X2=1", eqn(4));
t("cubic double root x³-3x+2", "1 EQ 0 EQ SUB 3 EQ 2 EQ EQ", "X1=1 X2=-2", eqn(4));
t("quad 1+√2", "1 EQ SUB 2 EQ SUB 1 EQ EQ", "X1=1+√2 X2=1-√2", eqn(3));
t("quad long radicand → decimal", "1 EQ 1 0 0 0 EQ 1 EQ EQ", "X1=-1.000001E-3 X2=-999.999", eqn(3));
t("quad coefficient as fraction", "1 EQ FRAC 1 DOWN 2 EQ SUB FRAC 1 DOWN 2 EQ EQ", "X1=1/2 X2=-1", eqn(3));
t("lin2 small coefficients", "1 EXP NEG 1 4 EQ 0 EQ 1 EXP NEG 1 4 EQ 0 EQ 1 EXP NEG 1 4 EQ 2 EXP NEG 1 4 EQ EQ", "X=1 Y=2", eqn(1));
// STAT: fraction typed into a data cell
t("stat fraction cell", "SHIFT 1 4 2 EQ", "3/4", after("MODE 3 1 FRAC 1 DOWN 2 EQ 1 EQ AC"));
// MATRIX / VECTOR: fraction cells, noise-free results, scaled singularity test
{
  const m = after("MODE 6 1 5 1 EQ 2 EQ 3 EQ 4 EQ AC");
  const id = press(m, "SHIFT 4 3 MUL SHIFT 4 3 INV EQ");
  if (JSON.stringify(gridData(id).cells) === "[[1,0],[0,1]]") pass++; else { fail++; console.log("✗ MatA×MatA⁻¹", gridData(id).cells); }
  const inv = press(m, "SHIFT 4 3 INV EQ");
  if (JSON.stringify(gridData(inv).cells) === "[[-2,1],[1.5,-0.5]]") pass++; else { fail++; console.log("✗ MatA⁻¹ exact", gridData(inv).cells); }
  const fr = press(initialState(), "MODE 6 1 5 FRAC 1 DOWN 2 EQ 0 EQ 0 EQ 3 EQ AC SHIFT 4 3 EQ");
  if (JSON.stringify(gridData(fr).cells) === "[[0.5,0],[0,3]]") pass++; else { fail++; console.log("✗ matrix fraction cell", gridData(fr).cells); }
  const small = press(initialState(), "MODE 6 1 5 1 EXP NEG 8 EQ 0 EQ 0 EQ 1 EXP NEG 8 EQ AC SHIFT 4 3 INV EQ");
  if (JSON.stringify(gridData(small).cells) === "[[100000000,0],[0,100000000]]") pass++; else { fail++; console.log("✗ small matrix inverse", out(small)); }
  t("singular inverse", "SHIFT 4 3 INV EQ", "Math ERROR", after("MODE 6 1 5 1 EQ 2 EQ 2 EQ 4 EQ AC"));
  t("det cancellation = 0", "SHIFT 4 7 SHIFT 4 3 EQ", "0", after("MODE 6 1 5 0 DOT 1 EQ 0 DOT 2 EQ 0 DOT 3 EQ 0 DOT 6 EQ AC"));
  const v = press(initialState(), "MODE 8 1 1 1 EQ 2 EQ 3 EQ AC SHIFT 5 1 2 1 0 DOT 1 EQ 0 DOT 2 EQ 0 DOT 3 EQ AC SHIFT 5 3 SUB 1 0 SHIFT 5 4 EQ");
  if (JSON.stringify(gridData(v).cells) === "[[0,0,0]]") pass++; else { fail++; console.log("✗ VctA−10VctB", gridData(v).cells); }
}

const tree = after("FRAC 1 DOWN 2").view.tree;
if (toLinear(tree.expr) === "1⌟2") pass++; else { fail++; console.log("✗ linear", toLinear(tree.expr)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
