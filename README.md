# SudokuPad X

A fresh **Rust + Tauri 2** SudokuPad puzzle reader for Android and desktop. The SudokuPad website and its WebView control pad are **not** embedded. The Rust library owns SCL/JSON decoding and game input state; a small Canvas frontend provides touch-focused rendering and UI.

## Try the prototype

Requires Rust stable, Node 22+ and the Tauri 2 prerequisites for your platform.

```sh
npm install
cargo test -p sudokupadx-core
npm run tauri -- dev
```

To preview only the UI in your desktop browser, run `npm run dev`. This preview loads the included demo and can import JSON; SCL decompression and authoritative game state require the native Tauri app.

### Android

Install Android Studio, Android SDK and NDK (see [Tauri prerequisites](https://tauri.app/start/prerequisites/)). Then run:

```sh
rustup target add aarch64-linux-android
npm install
npm run tauri -- android init --ci
npm run tauri -- android dev
npm run tauri -- android build --apk --debug --target aarch64 --ci
```

Alternatively choose **GitHub Actions → Build Android debug APK → Run workflow**. Its debug APK is for testing; signing from a fresh CI runner is not a permanent upgrade signature. `com.fanfront.sudokupadx` is a separate application ID from the previous Android wrapper and does not reuse its save files.

## Importing existing offline puzzles

Open **Import SCL / JSON** and select a local .scl or .json puzzle file, or paste the full contents. Original offline packages from `FanFront/sodokupadAndroid/app/src/main/assets/offline/translated/` can be used **locally** without copying third-party puzzle assets into this repository. Direct SudokuPad URLs, network fetching and automatic game discovery are not yet provided.

Supports `scl` + LZ-String Base64 using the exact `+/` alphabet, normal SudokuPad JSON, and a JSON5-compatible subset of compact SudokuMaker literals. All parsing uses data parsers, **never JavaScript eval**.

## Working prototype capabilities

- Import raw JSON and compressed SCL through the Rust engine.
- Custom Canvas board with visible-area drawing, pinch/wheel zoom, drag pan and fit-to-board.
- Given digits, editable values, corner and center notes, cell colors and imported region outlines.
- Basic imported lines, overlay/underlay rectangles and text.
- Android-oriented bottom control pad, including an explicit A–Z keyboard toggle with three pages.
- Undo/redo via Rust, browser localStorage snapshots keyed by puzzle ID and restored through Rust validation.
- Built-in 9×9 demo; Chrome/Vite preview with JS fallback for UI iteration.

## Not yet fully supported

This is an **experimental reader**, not a complete SudokuPad implementation. It does not validate solved puzzles, fully render cages and all variant constraints, simulate adventure gameplay, apply fog of war, reproduce multi-grid logic, process trigger effects, or automatically follow boss links. Opening an adventure map may expose normally hidden content; **do not use it for spoiler-free play yet**. Compact literal support is restricted to valid JSON5 data; unsupported SudokuMaker tokens produce a readable error. Rendering of imported decorative elements is approximate, not pixel-identical to SudokuPad.

No captured SudokuPad web assets or copyrighted puzzle bundles are redistributed in this repository. Import files that you have permission to use.

## Source layout

```
crates/sudokupadx-core/  Pure Rust parser and editing/undo engine
src-tauri/               Tauri app commands and Android shell
src/                     Canvas renderer and responsive controls
.github/workflows/       Rust/frontend checks, manual Android debug build
```

Run `npm run build` for the frontend and `cargo test -p sudokupadx-core` for core tests. The GitHub Actions checks exercise these on every commit. The mobile build workflow can be started manually.
