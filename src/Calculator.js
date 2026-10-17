// fx-991ES PLUS body, keyboard and LCD. All behaviour lives in src/logic/machine.js.
import React, { useCallback, useReducer, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Lcd from "./ui/Lcd";
import { initialState, pressKey, pickMenuItem, pickCode } from "./logic/machine";

/* ------------------------------------------------------------------ */
/*  Key glyphs                                                         */
/* ------------------------------------------------------------------ */
function Box({ s, filled, color }) {
  return (
    <View
      style={{
        width: s,
        height: s * 1.15,
        borderWidth: Math.max(1, s * 0.16),
        borderColor: color,
        backgroundColor: filled ? color : "transparent",
        borderRadius: 0.5,
      }}
    />
  );
}
function Glyph({ g, fs, color }) {
  const t = (s, extra) => <Text allowFontScaling={false} style={[{ color, fontSize: fs, fontWeight: "700", includeFontPadding: false }, extra]}>{s}</Text>;
  const b = fs * 0.42;
  const row = (children) => <View style={{ flexDirection: "row", alignItems: "center" }}>{children}</View>;
  const sup = (children) => <View style={{ marginBottom: fs * 0.55, marginLeft: 1 }}>{children}</View>;
  const sub = (children) => <View style={{ marginTop: fs * 0.45, marginHorizontal: 1 }}>{children}</View>;
  const frac = (filledTop = false, filledBottom = false) => (
    <View style={{ alignItems: "center" }}>
      <Box s={b} filled={filledTop} color={color} />
      <View style={{ height: Math.max(1, fs * 0.08), width: b * 1.55, backgroundColor: color, marginVertical: 1 }} />
      <Box s={b} filled={filledBottom} color={color} />
    </View>
  );
  switch (g) {
    case "frac": return frac(false, false);
    case "mixed": return row(<><Box s={b * 0.85} filled color={color} /><View style={{ width: 1.5 }} />{frac(false, false)}</>);
    case "sqrt": return row(<>{t("√")}<Box s={b} filled={false} color={color} /></>);
    case "cbrt": return row(<>{t("∛")}<Box s={b} filled={false} color={color} /></>);
    case "nroot": return row(<>{sup(<Box s={b * 0.75} filled={false} color={color} />)}{t("√", { marginLeft: -2 })}<Box s={b} filled={false} color={color} /></>);
    case "pow": return row(<>{t("x")}{sup(<Box s={b * 0.8} filled={false} color={color} />)}</>);
    case "sq": return row(<>{t("x")}{sup(t("2", { fontSize: fs * 0.62 }))}</>);
    case "cube": return row(<>{t("x")}{sup(t("3", { fontSize: fs * 0.62 }))}</>);
    case "inv": return row(<>{t("x")}{sup(t("−1", { fontSize: fs * 0.62 }))}</>);
    case "tenpow": return row(<>{t("10")}{sup(<Box s={b * 0.8} filled={false} color={color} />)}</>);
    case "epow": return row(<>{t("e")}{sup(<Box s={b * 0.8} filled={false} color={color} />)}</>);
    case "exp10": return row(<>{t("×10")}{sup(t("x", { fontSize: fs * 0.62 }))}</>);
    case "logb": return row(<>{t("log")}{sub(<Box s={b * 0.75} filled={false} color={color} />)}<Box s={b} filled={false} color={color} /></>);
    case "integ": return row(<>{t("∫")}<Box s={b} filled={false} color={color} />{t("dx", { fontSize: fs * 0.82 })}</>);
    case "asin": return row(<>{t("sin")}{sup(t("−1", { fontSize: fs * 0.62 }))}</>);
    case "acos": return row(<>{t("cos")}{sup(t("−1", { fontSize: fs * 0.62 }))}</>);
    case "atan": return row(<>{t("tan")}{sup(t("−1", { fontSize: fs * 0.62 }))}</>);
    default: return t(g);
  }
}
const isGlyph = (s) => typeof s === "string" && s.startsWith("@");
function Label({ value, fs, color }) {
  if (!value) return null;
  if (isGlyph(value)) return <Glyph g={value.slice(1)} fs={fs} color={color} />;
  return <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color, fontSize: fs, fontWeight: "700", includeFontPadding: false, flexShrink: 1, textAlign: "center" }}>{value}</Text>;
}

/* ------------------------------------------------------------------ */
/*  Key layout (exactly as printed on the fx-991ES PLUS)               */
/* ------------------------------------------------------------------ */
// k: key id  l: key face  s: SHIFT label  a: ALPHA label  b: BASE-N label (blue)  st: style
const FN_ROWS = [
  [
    { k: "FRAC", l: "@frac", s: "@mixed" },
    { k: "SQRT", l: "@sqrt", s: "@cbrt" },
    { k: "SQ", l: "@sq", s: "@cube", b: "DEC" },
    { k: "POW", l: "@pow", s: "@nroot", b: "HEX" },
    { k: "LOG", l: "log", s: "@tenpow", b: "BIN" },
    { k: "LN", l: "ln", s: "@epow", b: "OCT" },
  ],
  [
    { k: "NEG", l: "(−)", s: "∠", a: "A" },
    { k: "DMS", l: "°'\"", s: "←", a: "B" },
    { k: "HYP", l: "hyp", s: "Abs", a: "C" },
    { k: "SIN", l: "sin", s: "@asin", a: "D" },
    { k: "COS", l: "cos", s: "@acos", a: "E" },
    { k: "TAN", l: "tan", s: "@atan", a: "F" },
  ],
  [
    { k: "RCL", l: "RCL", s: "STO" },
    { k: "ENG", l: "ENG", s: "←", a: "i", aColor: "#9b3fb5" },
    { k: "LPAR", l: "(", s: "%" },
    { k: "RPAR", l: ")", s: ",", a: "X" },
    { k: "SD", l: "S⇔D", s: "a b/c⇔d/c", a: "Y" },
    { k: "MPLUS", l: "M+", s: "M−", a: "M" },
  ],
];
const NUM_ROWS = [
  [
    { k: "7", l: "7", s: "CONST" },
    { k: "8", l: "8", s: "CONV" },
    { k: "9", l: "9", s: "CLR" },
    { k: "DEL", l: "DEL", s: "INS", st: "orange" },
    { k: "AC", l: "AC", s: "OFF", st: "orange" },
  ],
  [
    { k: "4", l: "4", s: "MATRIX" },
    { k: "5", l: "5", s: "VECTOR" },
    { k: "6", l: "6" },
    { k: "MUL", l: "×", s: "nPr" },
    { k: "DIV", l: "÷", s: "nCr" },
  ],
  [
    { k: "1", l: "1", s: "STAT" },
    { k: "2", l: "2", s: "CMPLX" },
    { k: "3", l: "3", s: "BASE" },
    { k: "ADD", l: "+", s: "Pol" },
    { k: "SUB", l: "−", s: "Rec" },
  ],
  [
    { k: "0", l: "0", s: "Rnd" },
    { k: "DOT", l: "•", s: "Ran#", a: "RanInt" },
    { k: "EXP", l: "@exp10", s: "π", a: "e" },
    { k: "ANS", l: "Ans", s: "DRG▶" },
    { k: "EQ", l: "=" },
  ],
];
const TOP_LEFT = [
  { k: "SHIFT", above: "SHIFT", aboveColor: "shiftLabel", st: "top" },
  { k: "ALPHA", above: "ALPHA", aboveColor: "alphaLabel", st: "top" },
];
const TOP_RIGHT = [
  { k: "MODE", above: "MODE", s: "SETUP", st: "top" },
  { k: "ON", above: "ON", st: "top" },
];
const SECOND_LEFT = [
  { k: "CALC", l: "CALC", s: "SOLVE", a: "=" },
  { k: "INTEG", l: "@integ", s: "d/dx", a: ":" },
];
const SECOND_RIGHT = [
  { k: "INV", l: "@inv", s: "x!" },
  { k: "LOGB", l: "@logb", s: "Σ" },
];

function Key({ def, w, h, u, ux, uy, labelH, onPress, active, numeric, C }) {
  const isTop = def.st === "top";
  const styleType = def.st || (numeric ? "num" : "fn");
  const style = styleType === "fn"
    ? { colors: [C.fnKeyTop, C.fnKey], edge: C.fnKeyEdge, text: C.keyText, border: "rgba(255,255,255,0.18)" }
    : styleType === "num"
      ? { colors: [C.numKeyTop, C.numKey], edge: C.numKeyEdge, text: C.numText, border: "rgba(255,255,255,0.4)" }
      : styleType === "orange"
        ? { colors: [C.orangeTop, C.orange], edge: C.orangeEdge, text: C.orangeText, border: "rgba(255,255,255,0.4)" }
        : { colors: [C.topKeyTop, C.topKey], edge: C.topKeyEdge, text: C.keyText, border: "rgba(255,255,255,0.3)" };
  const face = def.l || "";
  const faceFs = numeric ? u * (face.length > 2 ? 11.5 : 15.5) : u * (face.length > 3 ? 8.6 : 10.5);
  const labelFs = u * 8.2;
  const shiftL = def.s ? <Label value={def.s} fs={labelFs} color={C.shiftLabel} /> : null;
  const alphaL = def.a ? <Label value={def.a} fs={labelFs} color={def.aColor || C.alphaLabel} /> : null;
  // fx-991ES PLUS shapes: purple ovals on top, dark capsule pills for functions, rounded rectangular number keys
  const radius = isTop ? h / 2 : numeric ? u * 6.5 : h * 0.44;
  const keyW = isTop ? w * 0.88 : w;
  return (
    <View style={{ width: w, alignItems: "center" }}>
      <View style={{ height: labelH, width: w, flexDirection: "row", alignItems: "flex-end", justifyContent: def.above ? "center" : def.b ? "space-between" : shiftL && alphaL ? "space-around" : "center", paddingHorizontal: ux * 0.8, paddingBottom: uy * 1.5, overflow: "hidden" }}>
        {def.above ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <Text allowFontScaling={false} style={{ color: (def.aboveColor && C[def.aboveColor]) || C.faceText, fontSize: u * 7.8, fontWeight: "900", letterSpacing: u * 0.2 }}>{def.above}</Text>
            {def.s ? <Text allowFontScaling={false} style={{ color: C.shiftLabel, fontSize: u * 8.2, fontWeight: "800", marginLeft: u * 2.2 }}>{def.s}</Text> : null}
          </View>
        ) : (
          <>
            {shiftL}
            {def.b ? <Text allowFontScaling={false} style={{ color: C.baseLabel, fontSize: labelFs * 0.95, fontWeight: "800" }}>{def.b}</Text> : null}
            {alphaL}
          </>
        )}
      </View>
      <Pressable
        testID={`key-${def.k}`}
        accessibilityLabel={def.k}
        onPress={() => onPress(def.k)}
        hitSlop={{ top: u * 2, bottom: u * 2, left: u * 2, right: u * 2 }}
        style={({ pressed }) => ({
          width: keyW,
          height: h,
          borderRadius: radius,
          backgroundColor: style.edge,
          paddingBottom: pressed ? uy * 0.6 : (numeric ? uy * 2.2 : uy * 1.7),
          transform: [{ translateY: pressed ? (numeric ? uy * 2.5 : uy * 1.6) : 0 }],
          shadowColor: "#000",
          shadowOpacity: pressed ? 0.08 : (numeric ? 0.28 : 0.22),
          shadowRadius: pressed ? u * 0.6 : u * 1.6,
          shadowOffset: { width: 0, height: pressed ? 1 : uy * 1.4 },
          elevation: pressed ? 1 : (numeric ? 4 : 3),
          borderWidth: active ? u * 1.4 : 0,
          borderColor: "#fff",
        })}
      >
        {({ pressed }) => (
          <LinearGradient
            colors={pressed ? [style.colors[1], style.colors[1]] : style.colors}
            style={{
              flex: 1,
              borderRadius: Math.max(1, radius - (pressed ? 0 : u * 1)),
              alignItems: "center",
              justifyContent: "center",
              borderTopWidth: pressed ? 0 : u * (numeric ? 0.35 : 0.6),
              borderColor: pressed ? "transparent" : style.border,
            }}
          >
            {def.l ? <Label value={def.l} fs={faceFs} color={style.text} /> : null}
          </LinearGradient>
        )}
      </Pressable>
    </View>
  );
}

/* REPLAY cursor pad */
function ReplayPad({ size, u, onPress, C }) {
  const padSize = size * 0.96;
  const btnSize = padSize * 0.18;

  const arrow = (k, ch, pos) => (
    <Pressable
      testID={`key-${k}`}
      accessibilityLabel={k}
      onPress={() => onPress(k)}
      hitSlop={{ top: u * 3, bottom: u * 3, left: u * 3, right: u * 3 }}
      style={({ pressed }) => ({
        position: "absolute",
        width: btnSize,
        height: btnSize,
        borderRadius: btnSize / 2,
        backgroundColor: pressed ? `${C.padTop}55` : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.8 : 1,
        ...pos,
      })}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: C.padText,
          fontSize: btnSize * 0.62,
          fontWeight: "800",
          includeFontPadding: false,
        }}
      >
        {ch}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: padSize,
          height: padSize,
          borderRadius: padSize / 2,
          backgroundColor: C.pad,
          borderWidth: Math.max(1, u * 0.8),
          borderColor: C.padTop,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: u * 1.5,
          shadowOffset: { width: 0, height: u * 0.7 },
          elevation: 2,
        }}
      >
        <Text
          allowFontScaling={false}
          style={{
            color: C.padText,
            fontSize: padSize * 0.105,
            fontWeight: "700",
            letterSpacing: u * 0.18,
          }}
        >
          REPLAY
        </Text>
        {arrow("UP", "▲", { top: padSize * 0.055, left: (padSize - btnSize) / 2 })}
        {arrow("DOWN", "▼", { bottom: padSize * 0.055, left: (padSize - btnSize) / 2 })}
        {arrow("LEFT", "◀", { left: padSize * 0.055, top: (padSize - btnSize) / 2 })}
        {arrow("RIGHT", "▶", { right: padSize * 0.055, top: (padSize - btnSize) / 2 })}
      </View>
    </View>
  );
}

function ThemePicker({ visible, onClose, onSelect, themes, selectedTheme, C }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "rgba(8,10,14,0.72)" }}>
        <Pressable
          accessibilityLabel="Close theme picker"
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ width: "100%", maxWidth: 360, maxHeight: "82%", backgroundColor: C.faceTop, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: C.faceEdge }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: C.brand, fontSize: 20, fontWeight: "800" }}>Choose a theme</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close theme picker"
              onPress={onClose}
              hitSlop={8}
              style={{ paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ color: C.faceText, fontSize: 16, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {themes.map((item) => {
              const selected = item.name === selectedTheme;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} theme${selected ? ", selected" : ""}`}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => ({
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    marginVertical: 4,
                    borderRadius: 12,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? item.colors.topKey : C.faceEdge,
                    backgroundColor: pressed ? C.faceBottom : C.face,
                    opacity: pressed ? 0.82 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 50,
                      height: 38,
                      padding: 3,
                      borderRadius: 7,
                      marginRight: 12,
                      backgroundColor: item.colors.frameEdge,
                      borderWidth: 1,
                      borderColor: item.colors.frameShadow,
                    }}
                  >
                    <LinearGradient
                      colors={[item.colors.frameLight, item.colors.frame, item.colors.frameEdge]}
                      style={{ flex: 1, padding: 2, borderRadius: 4 }}
                    >
                      <LinearGradient
                        colors={[item.colors.faceTop, item.colors.face, item.colors.faceBottom]}
                        style={{ flex: 1, padding: 2, borderRadius: 3 }}
                      >
                        <View style={{ height: 10, borderRadius: 2, backgroundColor: item.colors.bezel, padding: 1 }}>
                          <LinearGradient colors={[item.colors.lcdTop, item.colors.lcd, item.colors.lcdBottom]} style={{ flex: 1, borderRadius: 1 }} />
                        </View>
                        <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                          {[item.colors.topKey, item.colors.numKey, item.colors.fnKey, item.colors.orange].map((color, index) => (
                            <View key={index} style={{ width: 7, height: 5, borderRadius: 1.5, backgroundColor: color }} />
                          ))}
                        </View>
                      </LinearGradient>
                    </LinearGradient>
                  </View>
                  <Text style={{ flex: 1, color: C.brand, fontSize: 16, fontWeight: selected ? "800" : "600" }}>
                    {item.name}
                  </Text>
                  {selected ? <Text style={{ color: C.faceText, fontSize: 18, fontWeight: "800" }}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* Header: CASIO logo, model name, solar panel */
function Header({ u, ux, uy, h, C, themeName, onOpenThemes }) {
  return (
    <View style={{ height: h, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: ux * 6, paddingTop: uy * 6 }}>
      <View>
        <Text allowFontScaling={false} style={{ color: C.brand, fontSize: u * 15.5, fontWeight: "900", letterSpacing: u * 1.5, lineHeight: u * 17 }}>CASIO</Text>
        <Text allowFontScaling={false} style={{ color: C.model, fontSize: u * 9.6, fontWeight: "600", fontStyle: "italic", fontFamily: "serif", marginTop: u * 3.5 }}>fx-991ES PLUS</Text>
        <Text allowFontScaling={false} style={{ color: C.natural, fontSize: u * 7.5, fontWeight: "900", fontStyle: "italic", letterSpacing: u * 0.8, marginTop: u * 0.8 }}>NATURAL-V.P.A.M.</Text>
      </View>
      <View style={{ alignItems: "flex-end", paddingTop: uy * 1 }}>
        <Pressable
          testID="theme-button"
          accessibilityRole="button"
          accessibilityLabel={`Change calculator theme. Current theme: ${themeName}`}
          accessibilityHint="Opens the calculator theme choices"
          onPress={onOpenThemes}
          hitSlop={6}
          style={({ pressed }) => ({
            borderRadius: u * 2,
            paddingHorizontal: ux * 1,
            paddingVertical: uy * 1,
            backgroundColor: C.solarRim,
            shadowColor: "#000",
            shadowOpacity: pressed ? 0.1 : 0.2,
            shadowRadius: u * 1,
            shadowOffset: { width: 0, height: 1 },
            opacity: pressed ? 0.86 : 1,
          })}
        >
          <LinearGradient
            colors={[C.solarDark, C.solarCell, C.solarDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: ux * 148, height: uy * 34, borderRadius: u * 1.5, flexDirection: "row", overflow: "hidden" }}
          >
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1, borderRightWidth: i < 3 ? u * 0.8 : 0, borderColor: C.solarDivider }} />
            ))}
            <LinearGradient
              colors={[C.solarGloss, "rgba(255,255,255,0.02)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 0.8 }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: "55%" }}
            />
            <View
              pointerEvents="none"
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
            >
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  color: C.solarText,
                  width: "100%",
                  textAlign: "center",
                  fontSize: u * 11,
                  fontWeight: "900",
                  letterSpacing: u * 1.2,
                }}
              >
                THEME
              </Text>
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Calculator                                                         */
/* ------------------------------------------------------------------ */
// Design canvas: 360 units wide. Fixed heights below, LCD takes what is left.
const DW = 360;
const FRAME = 5, FRAME_BOTTOM = 5, FACE_PAD = 16;
const HEADER = 48, BEZEL = 9, GAP = 7;
const TOP_KEY_H = 21, TOP_LABEL = 12, SECOND_KEY_H = 21, SECOND_LABEL = 12;
const FN_KEY_H = 21, FN_LABEL = 10.5, NUM_KEY_H = 31, NUM_LABEL = 10.5, ROW_GAP = 2;
const BOTTOM = 12;
const CONTROL_ROW_GAP = 3;
const CTRL_KEY_AREA = TOP_KEY_H + CONTROL_ROW_GAP + SECOND_LABEL + SECOND_KEY_H;
const PAD_DIAMETER = 90;
const CTRL_H = Math.max(TOP_LABEL + CTRL_KEY_AREA, PAD_DIAMETER + TOP_LABEL * 0.6);
const FIXED = FRAME + FRAME_BOTTOM + HEADER + GAP + BEZEL * 2 + GAP + CTRL_H + 3 * (FN_LABEL + FN_KEY_H + ROW_GAP) + 4 * (NUM_LABEL + NUM_KEY_H + ROW_GAP) + BOTTOM;
const LCD_MIN = 94, LCD_MAX = 104;

export default function Calculator({ theme, themeName, themes, onSelectTheme }) {
  const C = theme;
  const [st, dispatch] = useReducer((s, a) => {
    if (a.type === "key") return pressKey(s, a.key);
    if (a.type === "menu") return pickMenuItem(s, a.index);
    if (a.type === "code") return pickCode(s, a.id, a.n);
    return s;
  }, undefined, initialState);
  const [area, setArea] = useState(null);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const onKey = useCallback((key) => dispatch({ type: "key", key }), []);

  let body = null;
  if (area) {
    const uy = area.h / (FIXED + LCD_MIN);
    const ux = Math.min(area.w / DW, uy);
    const u = Math.min(ux, uy);
    const lcdH = Math.max(LCD_MIN, Math.min(LCD_MAX, area.h / uy - FIXED));
    const W = DW * ux;
    const inner = DW - 2 * FRAME - 2 * FACE_PAD; // design units
    const fnGap = 7, numGap = 8;
    const fnW = (inner - 5 * fnGap) / 6;
    const numW = (inner - 4 * numGap) / 5;
    const sideW = (inner - PAD_DIAMETER - 16) / 2; // left/right blocks around the replay pad
    const topW = (sideW - fnGap) / 2;
    const sideTop = 15 * uy;
    const replayTop = sideTop + ((TOP_LABEL + CTRL_KEY_AREA) * uy) / 2 - (PAD_DIAMETER * ux) / 2;

    const keyRow = (defs, kw, kh, lh, numeric, gap) => (
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: ROW_GAP * uy }}>
        {defs.map((d) => (
          <Key key={d.k} def={d} w={kw * ux} h={kh * uy} u={u} ux={ux} uy={uy} labelH={lh * uy} numeric={numeric} onPress={onKey} C={C} />
        ))}
      </View>
    );
    const side = (defs, kh, lh) => (
      <View style={{ width: sideW * ux, flexDirection: "row", justifyContent: "space-between" }}>
        {defs.map((d) => (
          <Key
            key={d.k} def={d} w={topW * ux} h={kh * uy} u={u} ux={ux} uy={uy} labelH={lh * uy} onPress={onKey} C={C}
            active={(d.k === "SHIFT" && st.mod === "S") || (d.k === "ALPHA" && st.mod === "A")}
          />
        ))}
      </View>
    );

    body = (
      <View
        style={{
          width: W,
          borderRadius: u * 32,
          backgroundColor: C.frameShadow,
          paddingBottom: FRAME_BOTTOM * uy,
        }}
      >
        <LinearGradient
          // plastic shell: authentic multi-stop gradient highlighting the 3D curved case
          colors={[C.frameEdge, C.frame, C.frameLight, C.frameHighlight, C.frameLight, C.frame, C.frameEdge]}
          locations={[0, 0.08, 0.25, 0.5, 0.75, 0.92, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            width: W,
            borderRadius: u * 32,
            paddingTop: FRAME * uy,
            paddingHorizontal: FRAME * ux,
            paddingBottom: uy * 3,
            borderTopWidth: u * 0.6,
            borderColor: "rgba(255,255,255,0.22)",
          }}
        >
          {/* Inner metallic silver faceplate */}
          <LinearGradient
            colors={[C.faceTop, C.face, C.faceBottom]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.25, y: 1 }}
            style={{
              borderRadius: u * 24,
              paddingHorizontal: FACE_PAD * ux,
              paddingBottom: BOTTOM * uy,
              borderWidth: u * 0.9,
              borderColor: C.faceEdge,
              borderTopColor: C.faceHighlight,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: u * 2,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Header u={u} ux={ux} uy={uy} h={HEADER * uy} C={C} themeName={themeName} onOpenThemes={() => setThemePickerVisible(true)} />
            {/* LCD with bezel */}
            <View style={{ marginTop: GAP * uy * 0.3, borderRadius: u * 8, backgroundColor: C.bezelRim, padding: u * 0.9 }}>
              <LinearGradient
                colors={[C.bezel, C.bezelDark]}
                style={{ padding: BEZEL * u, borderRadius: u * 7, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: u * 2, shadowOffset: { width: 0, height: u * 1 } }}
              >
                <View style={{ borderRadius: u * 4, overflow: "hidden", borderWidth: u * 0.6, borderColor: "rgba(0,0,0,0.35)" }}>
                  <Lcd
                    st={st}
                    C={C}
                    u={u}
                    height={lcdH * uy}
                    onPickMenu={(index) => dispatch({ type: "menu", index })}
                    onPickCode={(id, n) => dispatch({ type: "code", id, n })}
                  />
                </View>
              </LinearGradient>
            </View>
            <View style={{ height: GAP * uy }} />
            {/* control block: SHIFT ALPHA [REPLAY] MODE ON / CALC ∫ [ ] x⁻¹ log */}
            <View style={{ height: CTRL_H * uy, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ paddingTop: sideTop }}>
                {side(TOP_LEFT, TOP_KEY_H, TOP_LABEL)}
                <View style={{ height: CONTROL_ROW_GAP * uy }} />
                {side(SECOND_LEFT, SECOND_KEY_H, SECOND_LABEL)}
              </View>
              <View style={{ flex: 1, alignItems: "center", paddingTop: replayTop }}>
                <ReplayPad size={PAD_DIAMETER * ux} u={u} onPress={onKey} C={C} />
              </View>
              <View style={{ paddingTop: sideTop }}>
                {side(TOP_RIGHT, TOP_KEY_H, TOP_LABEL)}
                <View style={{ height: CONTROL_ROW_GAP * uy }} />
                {side(SECOND_RIGHT, SECOND_KEY_H, SECOND_LABEL)}
              </View>
            </View>
            {FN_ROWS.map((r, i) => (
              <View key={`f${i}`}>
                {keyRow(r, fnW, FN_KEY_H, FN_LABEL, false, fnGap)}
              </View>
            ))}
            {NUM_ROWS.map((r, i) => <View key={`n${i}`}>{keyRow(r, numW, NUM_KEY_H, NUM_LABEL, true, numGap)}</View>)}
          </LinearGradient>
        </LinearGradient>
      </View>
    );
  }

  return (
    <>
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
          setArea((a) => (a && a.w === width && a.h === height ? a : { w: width, h: height }));
        }}
      >
        {body}
      </View>
      <ThemePicker
        visible={themePickerVisible}
        onClose={() => setThemePickerVisible(false)}
        onSelect={(nextTheme) => {
          onSelectTheme(nextTheme);
          setThemePickerVisible(false);
        }}
        themes={themes}
        selectedTheme={themeName}
        C={C}
      />
    </>
  );
}
