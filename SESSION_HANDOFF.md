# Calculator project handoff

This note captures the current project state and design decisions so a future session can continue without repeating the conversation.

## Project

- React Native / Expo calculator app, Expo SDK 57 (`expo ~57.0.27`, React Native `0.86.3`).
- Main calculator UI: `src/Calculator.js`
- Theme palettes: `src/theme.js`
- LCD/display: `src/ui/Lcd.js`
- Calculator behavior/state machine: `src/logic/machine.js`
- App-level active theme and page background: `App.js`

## Most important user constraint

Keep calculator behavior and key logic unchanged. The user is asking for visual/UI design work. Do not edit `src/logic/machine.js` or change calculations, key mappings, or interaction behavior unless the user explicitly asks. Avoid changing layout spacing/padding unless it is necessary to fix a specifically reported visual issue.

## Current UI and theme behavior

- The THEME button is integrated into the solar-panel-shaped control at the top right. It opens an accessible theme picker.
- The solar-panel button has been enlarged slightly; its label is **THEME**.
- Available themes are Silver Classic, Midnight, Dark, Ocean, Graphite, Arctic Steel, and Ceramic.
- Themes recolor the calculator case/body, keys, and Replay pad. The page background and LCD are intentionally kept neutral. The faceplate/body has a restrained theme tint, per the user's clarification that the calculator body itself should change.
- Midnight is a deep navy/slate finish with contrasting readable keys. Dark is a distinct charcoal theme.
- Theme selection is held in `App.js` state for the lifetime of the mounted app; persistence across restarts was not requested.
- Theme options show a miniature calculator preview in the picker.

## Replay pad

- The Replay pad is centered between the four top control keys.
- It was restyled with directional buttons, a center REPLAY hub, subtler borders, and shadows.
- A narrow-width issue from the user's screenshot (966 CSS px wide by 1400 px high) was addressed by removing an intentional overlap between the control block and the first function-key row. `FIXED` sizing and function-row placement were adjusted in `src/Calculator.js`.
- Keep the pad responsive and centered; check narrow and wide viewports if changing its dimensions.
- The four directional key IDs remain `UP`, `DOWN`, `LEFT`, and `RIGHT`.

## Other earlier UI fixes

- Guarded against zero-size layout measurements to avoid Android's `FontSize should be a positive value. Current value: 0` error.
- Improved responsive calculator width sizing and prevented overlap at wide viewports.
- Reduced excessive key spacing and adjusted display/scroll affordances.
- Press feedback uses transforms rather than changing layout dimensions to avoid calculator shaking.
- The calculator has been visually tuned toward a professional, muted finish; avoid overly bright whites or thick borders.

## Current modified surfaces

- `src/Calculator.js`: calculator layout, key appearance, Replay pad, theme picker, solar-panel THEME control.
- `src/theme.js`: base palette and seven theme palettes.
- `src/ui/Lcd.js`: LCD appearance and theme-aware ink.
- `App.js`: active theme state and neutral page background.

## Validation

Most recent verification after the Replay pad redesign:

- `npm test`: 211 passed, 0 failed.
- `npx expo export --platform web`: succeeded.
- `npx expo export --platform android`: succeeded.
- TypeScript syntax/type validation with:
  `npx tsc --noEmit --allowJs --checkJs false --jsx react-jsx --moduleResolution bundler --module esnext --target esnext --skipLibCheck App.js src\Calculator.js src\theme.js src\ui\Lcd.js`

The project has no configured lint script or ESLint configuration. Export-generated `dist` output was cleaned after validation.

## Expo-specific guidance

Before making changes that use Expo, EAS, or React Native APIs, check `package.json` for the SDK version and consult matching versioned Expo docs. The project is currently SDK 57; do not update Expo packages unless requested.

## Working style requested

- Make polished, professional, mobile-first visual improvements.
- Preserve calculator logic, key behavior, and established spacing unless the specific issue requires a visual layout adjustment.
- Verify changes with the project test command and web/Android exports when practical.
