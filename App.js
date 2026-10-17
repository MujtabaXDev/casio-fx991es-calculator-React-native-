import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import Calculator from "./src/Calculator";
import { THEMES } from "./src/theme";

export default function App() {
  const [activeTheme, setActiveTheme] = useState(THEMES[0]);
  const C = activeTheme.colors;

  return (
    <LinearGradient
      colors={[C.pageGradTop, C.page, C.pageGradBottom]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ flex: 1, width: "100%" }}
    >
      <StatusBar hidden />
      <Calculator
        theme={C}
        themeName={activeTheme.name}
        themes={THEMES}
        onSelectTheme={setActiveTheme}
      />
    </LinearGradient>
  );
}
