# SudokuPad X

**English** | [简体中文](README.zh-CN.md)

A SudokuPad-compatible puzzle player for **Android and the web**, built with Rust, Tauri 2, and a custom Canvas board. It focuses on adventure Sudoku, offline play, and Chinese localization.

**[Play in browser](https://fanfront.github.io/sudokupadX/)** · **[Download Android APK](https://github.com/FanFront/sudokupadX/releases/download/android-test-latest/SudokuPadX-arm64.apk)**

## Features

- **Adventure puzzles:** bundled Sudokuvania 1 & 2 and Super Sudokoid 1 & 2, including linked side puzzles and bosses.
- **Puzzle library:** search the bundled [Sudoku Index](https://stefanlobbenmeier.github.io/sudoku-index/index.json) or Logic Masters Deutschland, open supported SudokuPad-format puzzles, and download them for offline play.
- **WPF PDF library:** search [ropeko's WPF puzzle-type and competition references](https://logic-puzzles.ropeko.ch/php/db/search.php), open verified official WPF GP booklets in an in-app PDF.js reader, and draw over each page with colored pens, eraser and undo/redo. PDFs and page annotations are saved for offline use. Android uses a native downloader; browser access depends on the third-party hosts allowing CORS. Historical rounds with nonstandard PDF names may not open automatically.
- **Gameplay:** large-board pan and zoom, fog of war, region rules, linked-puzzle navigation, notes, colors, undo/redo, and automatic progress saving.
- **Chinese support:** translated rules and descriptions alongside original text where available.
- **Sudoku lessons:** a built-in, offline Chinese learning page with 25 searchable techniques and **real SudokuPadX engine practice boards**. Each tutorial stages matching candidate notes and variant geometry so players perform an actual pencilmark elimination or digit placement using the regular game controls. Progress is saved locally; returning to the lesson restores the original game (Rust undo/redo history resets).
- **Checkpoint transfer:** export/import a puzzle's progress as JSON between Android, web, and the updated `sodokupadAndroid` app.

An offline index lets you **browse** puzzle entries without a connection; external puzzles must be downloaded first to **play** offline.

## Getting started

On Android, install the **APK file** from the link above (ARM64, Android 7.0+). GitHub Actions artifacts are ZIP archives: extract the APK rather than renaming the ZIP.

In the app, open **Library** to select a bundled game, search for puzzles, or manage offline downloads. Linked puzzles can be opened from their discovered regions, and you can return to the main map without losing your position.

## Procedural adventures

Run `python3 scripts/generate_adventure.py` to create a seeded offline adventure: four overlapping 9×9 grids and four bosses whose completed solutions provide indispensable digits **inside** the main Sudoku. Mathematical uniqueness checks prove these highlighted boss cells remain ambiguous even if all other grid overlaps are known. A separate human-logic solver rejects boss puzzles that need guessing or backtracking, and records a replayable deduction trace with a recognizable non-single step. Development and release builds generate the default adventure automatically. See the [generation guide](docs/procedural-adventure.md) for its rules and limitations.

## Mixed-variant puzzle workshop

The procedural generator now also creates a connected set of **4×4, 6×6 and 9×9** offline puzzles. Across the chapters, the generator supports killer sums, thermometers, white/black Kropki, Renban, arrows, XV pairs, region-sum lines, and 9×9 German whispers; the 6×6/9×9 puzzles also include entropic, modular and Between lines. These are active deduction rules: puzzles require a verified no-guess logical solution and a unique answer. The 9×9 chapter deliberately builds a three-chain white-Kropki deduction that partitions 1–9 into three consecutive triples. New cross-rule motifs transfer Killer sums across region lines, intersect entropic/modular classes, and combine Between interiors with Renban intervals; the human proof can also use hidden subsets and X-Wings. The rule vocabulary is shared across the chapters, and their rule panels link to one another. Players can learn these deductions through the [Chinese solving-technique guide with worked examples](docs/techniques.zh-CN.md). The generator also handles naked/hidden quads, X-Wing through Squirmbag, Finned X-Wing, 2-String Kite, W-Wing, Remote Pairs, Simple Coloring, bounded X/XY-Chains and ALS-XZ, with no-guess proofs and curriculum tiers. See the [Chinese Sudopedia advanced reference](docs/sudopedia-catalog.zh-CN.md) for worked examples and the exact supported/excluded method list. See [variant generation](docs/variant-generation.md) for constraints, generation criteria and limitations.

### Web access to Logic Masters and WPF

GitHub Pages cannot itself bypass cross-origin restrictions. Web searches and WPF PDF downloads use a restricted Cloudflare Worker hosted separately, configured via the non-secret `PUZZLE_PROXY_URL` GitHub Actions variable at build time. **The Worker must be deployed first.** See [Web CORS proxy deployment (Chinese)](docs/web-cors-proxy.zh-CN.md). For China-based players without a custom domain, an [experimental EdgeOne standalone Edge Function setup](docs/edgeone-no-domain-proxy.zh-CN.md) uses the same proxy API; check provider pricing and mainland-China fetch behavior before rolling it out. Android retains its native Rust fetch commands.

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
