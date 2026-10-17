# Casio fx-991ES PLUS — project handoff

Expo SDK 57 / React Native 0.86 single-screen app (classic `App.js` entry, no Expo Router)
that reproduces the look and behaviour of the Casio fx-991ES PLUS.

## Architecture

```
App.js                    SafeArea + <Calculator/>
src/Calculator.js         body, header, key layout (FN_ROWS / NUM_ROWS …), responsive sizing
src/ui/Lcd.js             LCD: status indicators, calc screen, menus, prompts, editors, tables, errors
src/ui/MathView.js        natural-display renderer for expression trees and results
src/logic/machine.js      ALL calculator behaviour: pure pressKey(state, keyId) -> state
src/engine/tree.js        expression-tree editor (templates, cursor, DEL)
src/engine/evaluate.js    parser + evaluator working on the tree (Casio priority rules)
src/engine/format.js      Norm/Fix/Sci/ENG, fraction / √ / π exact forms, complex, BASE-N, DMS
src/engine/numeric.js     ∫ (Gauss–Kronrod), d/dx, SOLVE, poly roots, linear systems, matrices, stats
src/engine/symbols.js     token & function tables
src/data/constants.js     40 scientific constants, 40 unit conversions
tests/run.mjs             key-sequence tests (npm test)
```

Key rule: the UI never contains calculator logic. It renders `state` and forwards key ids
(`"SHIFT"`, `"SIN"`, `"7"`, `"EQ"` …). Add behaviour in `machine.js` and cover it with a test in
`tests/run.mjs` using the same key ids as the buttons (`testID="key-<id>"`).

## Expression model

A row is an array of items. Digits are one item per character (the parser joins them).
Templates own sub-rows: `frac, mixed, sqrt, root, pow (superscript applied to what precedes it),
tenpow, epow, exp10 (×10ˣ), log (log_□), abs, group, func, integral, deriv, sum`.
`FIELD_ORDER` in `tree.js` is the cursor order of each template's boxes.

## Results

`evaluateRow` returns `{ value, flags }`. `flags.inexact/surd/pi` decide whether the formatter
may show a fraction, `a√b/c` or `aπ/c` (like the real calculator) or must show a decimal.
`resultDisplay(state)` turns the current result into a display description rendered by `Disp`.

## Commands

```
npm test                     # key-sequence tests (Node, no device needed)
npx expo start               # dev server (Expo Go works: only expo-linear-gradient is native)
npx expo export --platform android   # verifies the Hermes bundle compiles
```
