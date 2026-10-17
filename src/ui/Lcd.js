// The LCD: status indicators + whatever screen the state machine is showing.
import React, { useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LcdCtx, Row, Disp, T } from "./MathView";
import {
  resultDisplay, menuDef, menuPages, gridData, gridTitle, promptLabel, promptCurrent,
} from "../logic/machine";
import { formatReal } from "../engine/format";
import { SCI_CONSTS, UNIT_CONVS } from "../data/constants";
import { LCD_FONT } from "../theme";

function ink(contrast, color) {
  // contrast 1..9 → ink darkness, like the real CONT setting
  const a = 0.6 + contrast * 0.05;
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, a)})`;
}

/* ---------------- status bar ---------------- */
function StatusBar({ st, u, ink: color, hasMore }) {
  const v = st.view;
  const disp = st.setup.disp.type;
  const on = {
    S: st.mod === "S",
    A: st.mod === "A",
    M: st.vars.M !== 0,
    STO: st.pending === "STO",
    RCL: st.pending === "RCL",
    STAT: st.mode === "STAT",
    CMPLX: st.mode === "CMPLX",
    MAT: st.mode === "MATRIX",
    VCT: st.mode === "VECTOR",
    D: st.setup.angle === "D",
    R: st.setup.angle === "R",
    G: st.setup.angle === "G",
    FIX: disp === "fix",
    SCI: disp === "sci",
    Math: st.setup.io === "math",
    "▼": hasMore === "down" || hasMore === "both",
    "▲": hasMore === "up" || hasMore === "both" || (!st.overlay && v.kind === "calc" && !v.error && st.history.length > 0 && (v.shown || v.tree.expr.length === 0)),
    Disp: !!(v.kind === "calc" && v.stmts),
  };
  const items = ["S", "A", "M", "STO", "RCL", "STAT", "CMPLX", "MAT", "VCT", "D", "R", "G", "FIX", "SCI", "Math", "▼", "▲", "Disp"];
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", height: u * 11, alignItems: "center" }}>
      {items.map((k) => (
        <Text
          key={k}
          allowFontScaling={false}
          style={{
            fontFamily: LCD_FONT, fontSize: u * (k.length > 3 ? 6.6 : 7.4), fontWeight: "700", color, opacity: on[k] ? 1 : 0,
            ...(k === "S" || k === "A" ? { paddingHorizontal: u * 0.8, borderRadius: 1 } : null),
          }}
        >
          {k}
        </Text>
      ))}
    </View>
  );
}

/* ---------------- screens ---------------- */
function Line({ children, align = "flex-start", style }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: align }, style]}>{children}</View>;
}

function Expression({ tree, cursor, prefix, fs, ink: color, linear }) {
  const scroll = useRef(null);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{ alignItems: "center", minWidth: "100%" }}
    >
      <LcdCtx.Provider value={{ fs, ink: color, linear }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: fs * 0.15 }}>
          {prefix ? <T>{prefix}</T> : null}
          <Row row={tree.expr} cursor={cursor ? tree : null} />
        </View>
      </LcdCtx.Provider>
    </ScrollView>
  );
}

function Result({ d, fs, ink: color, linear }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: "100%", justifyContent: "flex-end", alignItems: "center" }}>
      <LcdCtx.Provider value={{ fs, ink: color, linear }}>
        <Disp d={d} />
      </LcdCtx.Provider>
    </ScrollView>
  );
}

function ErrorScreen({ msg, u, color }) {
  const style = { fontFamily: LCD_FONT, fontSize: u * 15, color, fontWeight: "600", lineHeight: u * 21 };
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingLeft: u * 4 }}>
      <Text allowFontScaling={false} style={[style, { fontWeight: "700" }]}>{msg}</Text>
      <Text allowFontScaling={false} style={style}>[AC] :Cancel</Text>
      <Text allowFontScaling={false} style={style}>{"[◀][▶]:Goto"}</Text>
    </View>
  );
}

function MenuScreen({ st, u, color, onPick }) {
  const ov = st.overlay;
  const def = menuDef(st, ov);
  const pages = menuPages(def);
  const items = pages[ov.page] || [];
  const cols = def.cols || 2;
  const fs = items.length > 6 || cols > 2 ? u * 13.5 : u * 15;
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      {def.title ? <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "600", marginBottom: u * 2 }}>{def.title}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {items.map((it, i) => (
          <Pressable key={i} onPress={() => onPick(i)} style={{ width: `${100 / cols}%`, paddingVertical: u * 1.6 }}>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "600" }}>
              {`${i + 1}:${it.label}`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CodeScreen({ st, u, color, onPickCode }) {
  const ov = st.overlay;
  const list = ov.id === "const" ? SCI_CONSTS : UNIT_CONVS;
  const page = list.slice(ov.page * 8, ov.page * 8 + 8);
  const fs = u * 11.5;
  return (
    <View style={{ flex: 1 }}>
      <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 14, color, fontWeight: "700" }}>
        {ov.id === "const" ? "CONST" : "CONV"}  <Text style={{ fontWeight: "600" }}>{ov.buf}</Text>
        <Text style={{ opacity: 0.6 }}>_</Text>
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: u * 2 }}>
        {page.map((c) => (
          <Pressable key={c.id} onPress={() => onPickCode(ov.id, c.id)} style={{ width: "50%", paddingVertical: u * 1.2 }}>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "600" }}>
              {`${String(c.id).padStart(2, "0")}:${ov.id === "const" ? c.symbol : `${c.from}▶${c.to}`}`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TextScreen({ lines, u, color }) {
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingLeft: u * 4 }}>
      {lines.map((l, i) => (
        <Text key={i} allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 15, color, fontWeight: i === 0 ? "700" : "600", lineHeight: u * 22 }}>{l}</Text>
      ))}
    </View>
  );
}

function Contrast({ st, u, color }) {
  const c = st.setup.contrast;
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 14, color, fontWeight: "700" }}>CONTRAST</Text>
      <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 13, color, marginTop: u * 4 }}>{"LIGHT        DARK"}</Text>
      <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 13, color }}>{`[◀] ${"■".repeat(c)}${"□".repeat(9 - c)} [▶]`}</Text>
    </View>
  );
}

function GridScreen({ st, u, color, linear }) {
  const v = st.view;
  const g = gridData(st, v);
  const title = gridTitle(st, v);
  const fs = u * 12.5;
  const visible = Array.from({ length: Math.min(3, g.rows) }, (_, i) => v.top + i).filter((r) => r < g.rows);
  const cell = (r, c) => {
    const val = g.cells[r]?.[c];
    if (val === undefined || val === null) return "";
    return dispShort(val, st);
  };
  const cur = g.cells[v.cur.r]?.[v.cur.c];
  const colW = g.rowLabels ? 0.88 / g.cols.length : 1 / g.cols.length;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {g.rowLabels ? <Text allowFontScaling={false} style={{ width: "12%", fontFamily: LCD_FONT, fontSize: fs * 0.85, color, fontWeight: "700" }}>{title || ""}</Text> : null}
        {g.cols.map((c) => (
          <Text key={c} allowFontScaling={false} style={{ width: `${colW * 100}%`, textAlign: "center", fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "700" }}>{c}</Text>
        ))}
      </View>
      {visible.map((r) => (
        <View key={r} style={{ flexDirection: "row", alignItems: "center", height: fs * 1.45 }}>
          {g.rowLabels ? <Text allowFontScaling={false} style={{ width: "12%", fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "700" }}>{r + 1}</Text> : null}
          {g.cols.map((_, c) => {
            const sel = r === v.cur.r && c === v.cur.c;
            return (
              <View key={c} style={{ width: `${colW * 100}%`, paddingHorizontal: u * 1.5 }}>
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    textAlign: "right", fontFamily: LCD_FONT, fontSize: fs, fontWeight: "600",
                    color: sel ? C.lcd : color, backgroundColor: sel ? color : "transparent",
                    paddingHorizontal: u * 1.5, borderRadius: 1,
                  }}
                >
                  {cell(r, c) || " "}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ flex: 1 }} />
      <View style={{ height: u * 24, justifyContent: "center" }}>
        {v.edit ? (
          <Expression tree={v.edit} cursor fs={u * 16} ink={color} linear={linear} />
        ) : cur !== undefined && cur !== null ? (
          <Result d={formatReal(cur, {}, st.setup)} fs={u * 16} ink={color} linear />
        ) : null}
      </View>
    </View>
  );
}
function dispShort(val, st) {
  if (typeof val !== "number") return "";
  const n = Number(val.toPrecision(6));
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0)) return n.toExponential(2).replace("e+", "E").replace("e", "E");
  return String(n).replace("-", "−");
}

function TableScreen({ st, u, color }) {
  const v = st.view;
  const fs = u * 12.5;
  const top = Math.max(0, Math.min(v.cur - 1, v.rows.length - 3));
  const visible = v.rows.slice(top, top + 3);
  const cur = v.rows[v.cur][v.col];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row" }}>
        <Text allowFontScaling={false} style={{ width: "12%", fontFamily: LCD_FONT, fontSize: fs, color }} />
        <Text allowFontScaling={false} style={{ width: "44%", textAlign: "center", fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "700" }}>X</Text>
        <Text allowFontScaling={false} style={{ width: "44%", textAlign: "center", fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "700" }}>F(X)</Text>
      </View>
      {visible.map(([x, y], i) => {
        const r = top + i;
        const cellStyle = (c) => ({
          textAlign: "right", fontFamily: LCD_FONT, fontSize: fs, fontWeight: "600", paddingHorizontal: u * 2,
          color: r === v.cur && c === v.col ? C.lcd : color, backgroundColor: r === v.cur && c === v.col ? color : "transparent",
        });
        return (
          <View key={r} style={{ flexDirection: "row", height: fs * 1.45, alignItems: "center" }}>
            <Text allowFontScaling={false} style={{ width: "12%", fontFamily: LCD_FONT, fontSize: fs, color, fontWeight: "700" }}>{r + 1}</Text>
            <View style={{ width: "44%", paddingHorizontal: u * 1.5 }}><Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={cellStyle(0)}>{dispShort(x, st)}</Text></View>
            <View style={{ width: "44%", paddingHorizontal: u * 1.5 }}><Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={cellStyle(1)}>{y === null ? "ERROR" : dispShort(y, st)}</Text></View>
          </View>
        );
      })}
      <View style={{ flex: 1 }} />
      <View style={{ height: u * 24, justifyContent: "center" }}>
        <Result d={cur === null ? { k: "text", s: "ERROR" } : formatReal(cur, {}, st.setup)} fs={u * 16} ink={color} linear />
      </View>
    </View>
  );
}

/* ---------------- main ---------------- */
export default function Lcd({ st, C, u, height, onPickMenu, onPickCode }) {
  const color = ink(st.setup.contrast, C.lcdInk);
  const linear = st.setup.io === "line";
  const v = st.view;
  const exprFs = u * 25;
  const resFs = u * 28;

  let hasMore = null;
  let body;
  if (!st.power) body = null;
  else if (st.overlay) {
    const ov = st.overlay;
    if (ov.kind === "menu") {
      const pages = menuPages(menuDef(st, ov));
      if (pages.length > 1) hasMore = ov.page === 0 ? "down" : ov.page === pages.length - 1 ? "up" : "both";
      body = <MenuScreen st={st} u={u} color={color} onPick={onPickMenu} />;
    } else if (ov.kind === "code") {
      hasMore = "both";
      body = <CodeScreen st={st} u={u} color={color} onPickCode={onPickCode} />;
    } else if (ov.kind === "confirm") body = <TextScreen lines={[ov.text, "[=] :Yes", "[AC] :Cancel"]} u={u} color={color} />;
    else if (ov.kind === "num") {
      const t = { fix: "Fix 0~9?", sci: "Sci 0~9?", norm: "Norm 1~2?" }[ov.id];
      body = <TextScreen lines={[t]} u={u} color={color} />;
    } else if (ov.kind === "contrast") body = <Contrast st={st} u={u} color={color} />;
  } else if (v.error) {
    body = <ErrorScreen msg={v.error} u={u} color={color} />;
  } else if (v.kind === "calc") {
    const d = v.shown ? resultDisplay(st) : null;
    const isList = d && d.k === "list";
    const isBase = st.mode === "BASE-N";
    body = (
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View style={{ minHeight: exprFs * 2.2, justifyContent: "flex-start" }}>
          <Expression
            tree={v.tree}
            cursor={!v.shown}
            prefix={st.mode === "TABLE" ? "f(X)=" : null}
            fs={exprFs}
            ink={color}
            linear={linear}
          />
          {v.label ? <Text allowFontScaling={false} style={{ position: "absolute", right: 0, top: 0, fontFamily: LCD_FONT, fontSize: u * 12, color, fontWeight: "700" }}>{v.label}</Text> : null}
        </View>
        {v.shown ? (
          <View>
            {v.shown.solve ? (
              <>
                <Line align="space-between">
                  <T style={{ fontFamily: LCD_FONT, fontSize: resFs, color }}>{`${v.shown.solve.name}=`}</T>
                  <View style={{ flexShrink: 1 }}><Result d={d} fs={resFs} ink={color} linear={linear} /></View>
                </Line>
                <Line align="space-between">
                  <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 12, color, fontWeight: "600" }}>L−R=</Text>
                  <Result d={formatReal(v.shown.solve.lr, { inexact: true }, st.setup)} fs={u * 12} ink={color} linear />
                </Line>
              </>
            ) : (
              <Line align="space-between">
                {isBase ? <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 11, color, fontWeight: "700" }}>{{ DEC: "Dec", HEX: "Hex", BIN: "Bin", OCT: "Oct" }[st.base]}</Text> : v.lrLabel ? <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 11, color, fontWeight: "700" }}>L−R=</Text> : <View />}
                <View style={{ flexShrink: 1 }}>
                  <Result d={d} fs={isList ? resFs * 0.62 : resFs} ink={color} linear={linear} />
                </View>
              </Line>
            )}
          </View>
        ) : isBase ? (
          <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 11, color, fontWeight: "700" }}>{{ DEC: "Dec", HEX: "Hex", BIN: "Bin", OCT: "Oct" }[st.base]}</Text>
        ) : null}
      </View>
    );
  } else if (v.kind === "prompt") {
    const cur = promptCurrent(st, v);
    body = (
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: exprFs, color, fontWeight: "600" }}>{promptLabel(v, st)}</Text>
        {v.error ? <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: u * 13, color, fontWeight: "700" }}>{v.error}</Text> : null}
        {v.tree.expr.length ? (
          <Expression tree={v.tree} cursor fs={resFs * 0.9} ink={color} linear={linear} />
        ) : (
          <View>
            <Expression tree={v.tree} cursor fs={u * 12} ink={color} linear={linear} />
            <Result d={formatReal(typeof cur === "number" ? cur : 0, {}, st.setup)} fs={resFs} ink={color} linear={linear} />
          </View>
        )}
      </View>
    );
  } else if (v.kind === "grid") {
    const g = gridData(st, v);
    if (g.rows > 3) hasMore = v.top === 0 ? "down" : v.top + 3 >= g.rows ? "up" : "both";
    body = v.error ? <ErrorScreen msg={v.error} u={u} color={color} /> : <GridScreen st={st} u={u} color={color} linear={linear} />;
  } else if (v.kind === "eqnResult") {
    const it = v.items[v.idx];
    if (v.items.length > 1) hasMore = v.idx === 0 ? "down" : v.idx === v.items.length - 1 ? "up" : "both";
    body = (
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <Text allowFontScaling={false} style={{ fontFamily: LCD_FONT, fontSize: exprFs, color, fontWeight: "600" }}>{it.label}</Text>
        <Result d={it.disp} fs={resFs} ink={color} linear={linear} />
      </View>
    );
  } else if (v.kind === "table") {
    hasMore = v.cur === 0 ? "down" : v.cur === v.rows.length - 1 ? "up" : "both";
    body = <TableScreen st={st} u={u} color={color} />;
  }

  return (
    <LinearGradient
      colors={[C.lcdTop, C.lcd, C.lcdBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ height, borderRadius: u * 3, paddingHorizontal: u * 6, paddingTop: u * 2, paddingBottom: u * 5, overflow: "hidden" }}
    >
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: u * 3.5, backgroundColor: "rgba(0,0,0,0.06)" }} pointerEvents="none" />
      {st.power ? <StatusBar st={st} u={u} ink={color} hasMore={hasMore} /> : null}
      <View style={{ flex: 1 }}>{body}</View>
      {hasMore ? (
        <View
          pointerEvents="none"
          style={{ minHeight: Math.max(u * 10, 8), alignItems: "flex-end", justifyContent: "center", paddingRight: u * 1.5 }}
        >
          <Text
            allowFontScaling={false}
            style={{ fontFamily: LCD_FONT, fontSize: Math.max(u * 7.5, 6), color, fontWeight: "800" }}
          >
            {hasMore === "both" ? "▲▼ REPLAY MORE" : hasMore === "down" ? "▼ REPLAY MORE" : "▲ REPLAY MORE"}
          </Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}
