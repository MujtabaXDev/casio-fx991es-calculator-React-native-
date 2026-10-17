// Renders expression trees (Natural Textbook Display) and result displays on the LCD.
import React, { createContext, useContext, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { SYM, FUNC_LABEL } from "../engine/symbols";
import { SCI_CONSTS, UNIT_CONVS } from "../data/constants";
import { LCD_FONT } from "../theme";

/* LCD context: font size, ink colour, linear (Line I/O) flag */
export const LcdCtx = createContext({ fs: 20, ink: "#1f241f", linear: false });
const useLcd = () => useContext(LcdCtx);
function Scale({ k, children }) {
  const c = useLcd();
  return <LcdCtx.Provider value={{ ...c, fs: Math.max(c.fs * k, 9) }}>{children}</LcdCtx.Provider>;
}

export function T({ children, italic, style, weight = "500" }) {
  const { fs, ink } = useLcd();
  return (
    <Text
      allowFontScaling={false}
      style={[{ fontFamily: LCD_FONT, fontSize: fs, lineHeight: Math.round(fs * 1.22), color: ink, fontWeight: weight, fontStyle: italic ? "italic" : "normal", includeFontPadding: false }, style]}
    >
      {children}
    </Text>
  );
}

/** Raised (superscript) content. */
function Sup({ children, k = 0.62 }) {
  const { fs } = useLcd();
  return (
    <View style={{ marginBottom: fs * 0.95, marginLeft: 0.5 }}>
      <Scale k={k}>{children}</Scale>
    </View>
  );
}
/** Lowered (subscript) content. */
function Sub({ children, k = 0.62 }) {
  const { fs } = useLcd();
  return (
    <View style={{ marginTop: fs * 0.75 }}>
      <Scale k={k}>{children}</Scale>
    </View>
  );
}
function Bar() {
  const { fs, ink } = useLcd();
  return <View style={{ height: Math.max(1, fs * 0.075), alignSelf: "stretch", backgroundColor: ink, marginVertical: fs * 0.08 }} />;
}
function Stack({ top, bottom }) {
  const { fs } = useLcd();
  return (
    <View style={{ alignItems: "center", marginHorizontal: fs * 0.12 }}>
      <View style={{ alignItems: "center", minWidth: fs * 0.6 }}>{top}</View>
      <Bar />
      <View style={{ alignItems: "center", minWidth: fs * 0.6 }}>{bottom}</View>
    </View>
  );
}
function RadicalSign({ height }) {
  const { fs, ink } = useLcd();
  const size = Math.max(fs, height * 0.95);
  return (
    <Text
      allowFontScaling={false}
      style={{ fontSize: size, lineHeight: height, height, color: ink, includeFontPadding: false, marginRight: -size * 0.04 }}
    >
      √
    </Text>
  );
}
function Radical({ children, index }) {
  const { fs, ink } = useLcd();
  const [h, setH] = useState(fs * 1.25);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", marginHorizontal: fs * 0.05 }}>
      {index ? <View style={{ marginRight: -fs * 0.25, marginBottom: h * 0.45 }}><Scale k={0.55}>{index}</Scale></View> : null}
      <RadicalSign height={h} />
      <View
        onLayout={(e) => setH(Math.max(fs * 1.1, e.nativeEvent.layout.height))}
        style={{ borderTopWidth: Math.max(1, fs * 0.075), borderColor: ink, paddingHorizontal: fs * 0.08, paddingTop: fs * 0.06, flexDirection: "row", alignItems: "center" }}
      >
        {children}
      </View>
    </View>
  );
}

/* ---------------- cursor & placeholders ---------------- */
function Cursor() {
  const { fs, ink } = useLcd();
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 500);
    return () => clearInterval(id);
  }, []);
  return <View style={{ width: Math.max(1.5, fs * 0.09), height: fs * 1.1, backgroundColor: on ? ink : "transparent" }} />;
}
function EmptyBox() {
  const { fs, ink } = useLcd();
  return <View style={{ width: fs * 0.5, height: fs * 0.72, borderWidth: 1, borderColor: ink, marginHorizontal: 1, opacity: 0.6 }} />;
}

/* ---------------- expression rows ---------------- */
const samePath = (a, b) => a.length === b.length && a.every((s, i) => s.index === b[i].index && s.field === b[i].field);

export function Row({ row, cursor, path = [] }) {
  const here = cursor && samePath(path, cursor.path);
  if (row.length === 0) {
    if (path.length === 0) return <View style={{ flexDirection: "row", alignItems: "center" }}>{here ? <Cursor /> : null}</View>;
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {here ? <Cursor /> : null}
        <EmptyBox />
      </View>
    );
  }
  const out = [];
  for (let i = 0; i <= row.length; i++) {
    if (here && cursor.pos === i) out.push(<Cursor key={`c${i}`} />);
    if (i < row.length) out.push(<Item key={i} it={row[i]} cursor={cursor} path={path} index={i} />);
  }
  return <View style={{ flexDirection: "row", alignItems: "center" }}>{out}</View>;
}

function Item({ it, cursor, path, index }) {
  const { fs, linear, ink } = useLcd();
  const F = (field) => <Row row={it[field]} cursor={cursor} path={[...path, { index, field }]} />;
  const op = (s) => <T style={{ marginHorizontal: fs * 0.06 }}>{s}</T>;
  switch (it.t) {
    case "digit": return <T>{it.v}</T>;
    case "op": return op({ "+": "+", "-": "−", "*": "×", "/": "÷" }[it.v]);
    case "neg": return <T>−</T>;
    case "sym": {
      if (it.v === "sq" || it.v === "cube" || it.v === "inv") {
        const s = it.v === "sq" ? "2" : it.v === "cube" ? "3" : "−1";
        return linear ? <T>{it.v === "inv" ? "⁻¹" : it.v === "sq" ? "²" : "³"}</T> : <Sup><T>{s}</T></Sup>;
      }
      if (it.v === "const") {
        const c = SCI_CONSTS.find((k) => k.id === it.id);
        return <T italic>{c ? c.symbol : "?"}</T>;
      }
      if (it.v === "conv") {
        const c = UNIT_CONVS.find((k) => k.id === it.id);
        return <Scale k={0.8}><T>{c ? `${c.from}▶${c.to}` : "?"}</T></Scale>;
      }
      if (it.v === "comma") return <T>,</T>;
      if (it.v === "eq") return op("=");
      if (it.v === "drgR" || it.v === "drgG") return <Sup k={0.7}><T>{SYM[it.v].label}</T></Sup>;
      const label = SYM[it.v]?.label ?? it.v;
      const kind = SYM[it.v]?.kind;
      if (kind === "infix") return op(label.trim());
      return <T>{label}</T>;
    }
    case "frac":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}>{F("num")}<T>⌟</T>{F("den")}</View>;
      return <Stack top={F("num")} bottom={F("den")} />;
    case "mixed":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}>{F("whole")}<T>⌟</T>{F("num")}<T>⌟</T>{F("den")}</View>;
      return <View style={{ flexDirection: "row", alignItems: "center" }}>{F("whole")}<Stack top={F("num")} bottom={F("den")} /></View>;
    case "sqrt":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>√(</T>{F("body")}<T>)</T></View>;
      return <Radical>{F("body")}</Radical>;
    case "root":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}>{F("index")}<T>ˣ√(</T>{F("body")}<T>)</T></View>;
      return <Radical index={F("index")}>{F("body")}</Radical>;
    case "pow":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>^(</T>{F("exp")}<T>)</T></View>;
      return <Sup>{F("exp")}</Sup>;
    case "tenpow": case "epow": case "exp10": {
      const base = it.t === "tenpow" ? "10" : it.t === "epow" ? "e" : "×10";
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>{base}^(</T>{F("exp")}<T>)</T></View>;
      return <View style={{ flexDirection: "row", alignItems: "center" }}><T>{base}</T><Sup>{F("exp")}</Sup></View>;
    }
    case "log":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>log(</T>{F("base")}<T>,</T>{F("arg")}<T>)</T></View>;
      return <View style={{ flexDirection: "row", alignItems: "center" }}><T>log</T><Sub>{F("base")}</Sub><T>(</T>{F("arg")}<T>)</T></View>;
    case "abs":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>Abs(</T>{F("body")}<T>)</T></View>;
      return <View style={{ flexDirection: "row", alignItems: "stretch" }}><AbsBar />{F("body")}<AbsBar /></View>;
    case "group":
      return <View style={{ flexDirection: "row", alignItems: "center" }}><T>(</T>{F("body")}<T>)</T></View>;
    case "func":
      return <View style={{ flexDirection: "row", alignItems: "center" }}><T>{FUNC_LABEL[it.name] || `${it.name}(`}</T>{F("body")}<T>)</T></View>;
    case "integral":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>∫(</T>{F("body")}<T>,</T>{F("lower")}<T>,</T>{F("upper")}<T>)</T></View>;
      return (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <T style={{ fontSize: fs * 1.6, lineHeight: fs * 1.9 }}>∫</T>
          <View style={{ justifyContent: "space-between", alignSelf: "stretch", marginLeft: -fs * 0.1, marginRight: fs * 0.1 }}>
            <Scale k={0.55}>{F("upper")}</Scale>
            <Scale k={0.55}>{F("lower")}</Scale>
          </View>
          {F("body")}
          <T style={{ marginLeft: fs * 0.1 }}>dx</T>
        </View>
      );
    case "deriv":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>d/dx(</T>{F("body")}<T>,</T>{F("point")}<T>)</T></View>;
      return (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Stack top={<T>d</T>} bottom={<T>dx</T>} />
          <T>(</T>{F("body")}<T>)</T>
          <View style={{ flexDirection: "row", alignItems: "flex-end", alignSelf: "stretch" }}>
            <View style={{ width: Math.max(1, fs * 0.08), alignSelf: "stretch", backgroundColor: ink, marginHorizontal: fs * 0.05 }} />
            <Scale k={0.6}><View style={{ flexDirection: "row", alignItems: "center" }}><T>x=</T>{F("point")}</View></Scale>
          </View>
        </View>
      );
    case "sum":
      if (linear) return <View style={{ flexDirection: "row", alignItems: "center" }}><T>Σ(</T>{F("body")}<T>,</T>{F("start")}<T>,</T>{F("end")}<T>)</T></View>;
      return (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ alignItems: "center" }}>
            <Scale k={0.55}>{F("end")}</Scale>
            <T style={{ fontSize: fs * 1.35, lineHeight: fs * 1.4 }}>Σ</T>
            <Scale k={0.55}><View style={{ flexDirection: "row", alignItems: "center" }}><T>x=</T>{F("start")}</View></Scale>
          </View>
          <T>(</T>{F("body")}<T>)</T>
        </View>
      );
    default:
      return null;
  }
}
function AbsBar() {
  const { fs, ink } = useLcd();
  return <View style={{ width: Math.max(1, fs * 0.08), backgroundColor: ink, marginHorizontal: fs * 0.08, minHeight: fs * 1.1 }} />;
}

/* ---------------- results ---------------- */
function Dec({ d }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <T>{`${d.neg ? "−" : ""}${d.mant}`}</T>
      {d.exp !== null && d.exp !== undefined ? (
        <>
          <T>×10</T>
          <Sup k={0.6}><T>{d.exp < 0 ? `−${Math.abs(d.exp)}` : String(d.exp)}</T></Sup>
        </>
      ) : null}
    </View>
  );
}
function SurdTerm({ a, b }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {a ? <T>{a}</T> : null}
      <Radical><T>{b}</T></Radical>
    </View>
  );
}

export function Disp({ d }) {
  const { linear } = useLcd();
  if (!d) return null;
  const minus = (neg) => (neg ? <T>−</T> : null);
  const row = (children) => <View style={{ flexDirection: "row", alignItems: "center" }}>{children}</View>;
  switch (d.k) {
    case "dec": return <Dec d={d} />;
    case "frac":
      if (linear) return <T>{`${d.neg ? "−" : ""}${d.whole ? `${d.whole}⌟` : ""}${d.n}⌟${d.d}`}</T>;
      return row(<>{minus(d.neg)}{d.whole ? <T>{d.whole}</T> : null}<Stack top={<T>{d.n}</T>} bottom={<T>{d.d}</T>} /></>);
    case "surd": {
      const top = <SurdTerm a={d.a} b={d.b} />;
      return row(<>{minus(d.neg)}{d.c ? <Stack top={top} bottom={<T>{d.c}</T>} /> : top}</>);
    }
    case "pi": {
      const top = <T>{`${d.a}π`}</T>;
      return row(<>{minus(d.neg)}{d.c ? <Stack top={top} bottom={<T>{d.c}</T>} /> : top}</>);
    }
    case "qsurd": {
      const q = Math.abs(d.q);
      const top = row(<><T>{d.p < 0 ? `−${-d.p}` : String(d.p)}</T><T>{d.q < 0 ? "−" : "+"}</T><SurdTerm a={q === 1 ? "" : String(q)} b={String(d.r)} /></>);
      return d.d !== 1 ? <Stack top={top} bottom={<T>{d.d}</T>} /> : top;
    }
    case "cplx": {
      if (!d.re && !d.im) return <T>0</T>;
      const imNeg = d.im && d.im.neg;
      const imAbs = d.im ? { ...d.im, neg: false } : null;
      const imIsOne = imAbs && imAbs.k === "dec" && imAbs.mant === "1" && imAbs.exp === null;
      return row(
        <>
          {d.re ? <Disp d={d.re} /> : null}
          {d.im ? <T>{imNeg ? "−" : d.re ? "+" : ""}</T> : null}
          {d.im && !imIsOne ? <Disp d={imAbs} /> : null}
          {d.im ? <T italic>i</T> : null}
        </>,
      );
    }
    case "polar": return row(<><Disp d={d.r} /><T>∠</T><Disp d={d.th} /></>);
    case "dms": return <T>{`${d.neg ? "−" : ""}${d.d}°${d.m}°${d.s}°`}</T>;
    case "text": return <T>{d.s}</T>;
    case "list":
      return row(d.items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center" }}>
          {i > 0 ? <T>, </T> : null}
          <T>{it.label}=</T>
          <Disp d={it.disp} />
        </View>
      )));
    default: return null;
  }
}
