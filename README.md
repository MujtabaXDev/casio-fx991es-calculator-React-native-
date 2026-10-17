# SciCalc 991

SciCalc 991 is a scientific calculator inspired by classic scientific calculators. It is built with React Native and Expo and runs on Android, iOS, and the web.

## Features

- Natural textbook-style entry and display for fractions, roots, powers, integrals, summations, and other mathematical expressions.
- Eight calculator modes: COMP, CMPLX, STAT, BASE-N, EQN, MATRIX, TABLE, and VECTOR.
- Scientific and complex-number calculations, including trigonometric and hyperbolic functions.
- Equation solving, function tables, statistical calculations, and regression.
- Matrix and vector calculations.
- Decimal, binary, octal, and hexadecimal calculations in BASE-N mode.
- Exact-style results such as fractions, surds, and polar or rectangular complex values where supported.
- Scientific constants, unit conversions, and variable/memory support.
- Calculation history with directional Replay controls.
- Angle, display, and contrast settings, plus multiple calculator color themes.

## Screenshots

<!-- Replace these placeholders with screenshots of the app. -->

| Calculator | Themes |
| --- | --- |
| _Screenshot coming soon_ | _Screenshot coming soon_ |

## Tech stack

- [React Native](https://reactnative.dev/)
- [Expo](https://expo.dev/)
- JavaScript

## Run on Windows

### Requirements

- Windows 10 or 11
- Node.js LTS, which includes npm
- For a physical phone: Expo Go from the device's app store
- For an Android emulator: Android Studio with an Android Virtual Device (AVD)

### Install and start

1. Install Node.js LTS from [nodejs.org](https://nodejs.org/).
2. Open PowerShell or Windows Terminal and go to the project directory:

   ```powershell
   cd path\to\casio-calc
   ```

3. Install the project dependencies:

   ```powershell
   npm install
   ```

4. Start the Expo development server:

   ```powershell
   npx expo start
   ```

### Run on a phone with Expo Go

1. Connect the phone and development computer to the same Wi-Fi network.
2. Open Expo Go on the phone and scan the QR code shown by Expo. On iOS, you can scan it with the Camera app.
3. If the network prevents the QR connection, try starting Expo with `npx expo start --tunnel`.

### Run on an Android emulator

1. Install Android Studio, create an Android Virtual Device in Device Manager, and start the emulator.
2. Install Expo Go in the emulator if it is not already present.
3. Run `npx expo start` from the project directory.
4. Press `a` in the Expo terminal to open the app in the running Android emulator.

To run the automated calculator tests, use:

```powershell
npm test
```

## Project structure

```text
.
├── assets/                 App icons and splash artwork
├── src/
│   ├── data/               Scientific constants and unit conversions
│   ├── engine/             Expression tree, evaluation, formatting, and numeric algorithms
│   ├── logic/              Calculator modes, key handling, and state machine
│   ├── ui/                 LCD and mathematical expression rendering
│   ├── Calculator.js       Calculator layout and controls
│   └── theme.js            Color palettes and display font selection
├── tests/                  Calculator behavior tests and test setup
├── App.js                  Expo app entry component
├── app.json                Expo application configuration
├── eas.json                EAS build configuration
└── package.json            Dependencies and npm scripts
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), open an issue for larger changes, and submit focused pull requests. By contributing, you agree to dedicate your contributions to the public domain under the Unlicense.

## License

Public domain, see LICENSE

## Disclaimer

This project is not affiliated with or endorsed by Casio Computer Co., Ltd. Casio and fx-991ES are trademarks of their respective owners.
