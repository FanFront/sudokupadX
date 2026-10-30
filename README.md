# SudokuPad X

A SudokuPad-compatible puzzle player for **Android and the web**, built with Rust, Tauri 2, and a custom Canvas board. It focuses on adventure Sudoku, offline play, and Chinese localization.

**[Play in browser](https://fanfront.github.io/sudokupadX/)** · **[Download Android APK](https://github.com/FanFront/sudokupadX/releases/download/android-test-latest/SudokuPadX-arm64.apk)**

## Features

- **Adventure puzzles:** bundled Sudokuvania 1 & 2 and Super Sudokoid 1 & 2, including linked side puzzles and bosses.
- **Puzzle library:** search the bundled [Sudoku Index](https://stefanlobbenmeier.github.io/sudoku-index/index.json) or Logic Masters Deutschland, open supported SudokuPad-format puzzles, and download them for offline play.
- **Gameplay:** large-board pan and zoom, fog of war, region rules, linked-puzzle navigation, notes, colors, undo/redo, and automatic progress saving.
- **Chinese support:** translated rules and descriptions alongside original text where available.
- **Checkpoint transfer:** export/import a puzzle's progress as JSON between Android, web, and the updated `sodokupadAndroid` app.

An offline index lets you **browse** puzzle entries without a connection; external puzzles must be downloaded first to **play** offline.

## Getting started

On Android, install the **APK file** from the link above (ARM64, Android 7.0+). GitHub Actions artifacts are ZIP archives: extract the APK rather than renaming the ZIP.

In the app, open **游戏库 (Library)** to select a bundled game, search for puzzles, or manage offline downloads. Linked puzzles can be opened from their discovered regions, and you can return to the main map without losing your position.

## Development

Requires Node.js, Rust, and the relevant [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm test
cargo test -p sudokupadx-core --all-targets
npm run tauri -- dev
```

For the web version, install the Rust WebAssembly target and `wasm-pack`:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm run dev:web         # Local web preview
npm run build:web       # Production web build
```

Android builds use `npm run android:build` after setting up the Android SDK/NDK and initializing Tauri Android. CI builds and publishes a test-signed APK via [GitHub Actions](https://github.com/FanFront/sudokupadX/actions/workflows/android.yml).

## Notes

- This is **not a pixel-perfect or feature-complete replacement** for the original SudokuPad. Some special artwork, constraints, and puzzle formats may render or behave differently.
- Logic Masters entries require a compatible SudokuPad puzzle link; image/PDF-only puzzles cannot be imported automatically.
- Saves are local to each installation or browser. Export a checkpoint before uninstalling, switching apps, or changing Android signing certificates.
- Bundled and imported third-party puzzles remain the work of their original creators. The repository's Android signing key is public and **for testing only**, not production distribution.
