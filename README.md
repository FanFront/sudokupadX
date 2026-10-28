# SudokuPad X / 数独冒险 X

**Android-first Rust + Tauri 2 reader for offline SudokuPad puzzle packages.** The board is rendered by our own Canvas engine, not by loading the original SudokuPad website.

## Bundled offline games

The repository contains **46 puzzle SCL packages** copied from the user's existing `FanFront/sodokupadAndroid/app/src/main/assets/offline/` snapshot:

| Game | Main map | Linked puzzles |
|---|---:|---:|
| Sudokuvania 1 · Digits of Despair | 1 | Original Sudokuvania boss subset |
| Sudokuvania 2 · Lineage of Logic | 1 | Original Sudokuvania boss subset |
| Super Sudokoid 1 · Final Transmission | 1 | 12 |
| Super Sudokoid 2 · Dark Inversion | 1 | 10 |
| **Total** | **4** | **42** |

The 20 Sudokuvania boss SCL files exist in the old `offline/translated/` directory and are bundled **with those translations**. The 22 Super Sudokoid linked SCL files are available under the original hashed `offline/files/` paths, but the old repository snapshot does not contain their generated `offline/translated/super-linked-*.scl` outputs. We bundle the 22 original packages with the corresponding Chinese title/rules/completion metadata from `offline/super-linked-chinese-candidates.json`. There is no silent fallback to an uncaptured online puzzle.

The catalog is `public/puzzles/catalog.json`. Puzzle files are in `public/puzzles/*.scl`; Chinese title/rule dictionaries are in `public/puzzles/locale-zh.json` and `public/puzzles/i18n/`. Vite packages these for offline use by the Android/desktop app. The four main game packs are translated copies supplied by the previous project; additional display-only translations are applied where their source text still matches the original.

**Permissions:** Third-party puzzle artwork, text, and data remain the creators' work. This repository is public; confirm permission to redistribute bundled assets and consider moving it to a private repository if it is only for personal testing.

## Gameplay implemented so far

- **Native Rust puzzle decoding:** SudokuPad `scl` / LZ-String Base64, standard JSON, compact SudokuMaker literals (including sparse arrays and abbreviated geometry), parsed as data without `eval`.
- **Large-map UI:** Canvas pan, pinch/wheel zoom, viewport culling, fit-to-board, initial camera focused on the visible starting area, correct x/y placement of lines and overlays, rectangular text/underlay drawing, imported region boundaries, approximate arrows and killer cages, and selected-cell styling.
- **Fog of war:** reads `foglight` (initially visible cells) and `triggereffect` / `cellvalue` -> `foglight` rules in Rust. All cells in a trigger must contain their exact solution value before its linked cells become visible. Fog state is recomputed after entry, undo, redo, or save restoration. Fog-covered content is masked, and the normal UI does not select covered cells.
- **Regional rules:** `metadata.grids` is parsed into independently selectable sectors; tapping a revealed cell shows the corresponding rules, including localized Chinese text. Overlapping sectors can be cycled using **切换区域**.
- **Linked puzzles and bosses:** valid SudokuPad links actually present in a **revealed sector's rules** resolve to bundled offline puzzles and open in the same app. Progress is separately saved per puzzle; **返回地图** returns to the previous map and restores camera/selection. The optional library “show all” checkbox intentionally bypasses discovery gating for testing and warns about spoilers.
- **Input:** 0–9, A–Z alphabet pages, corner/center notes, five cell colors, undo/redo, erase, mobile pan mode; Rust owns the authoritative state.
- **Completion:** when every solution value matches, puzzle-completion text (localized for linked Super Sudokoid puzzles) is shown.

## Test it

```sh
npm install
cargo test -p sudokupadx-core --all-targets
npm run tauri -- dev
```

The app opens the first bundled Sudokuvania map by default. Select **游戏库** to load any of the four main maps. Choose a visible sector to see its rules and a boss link if that sector already provides one. The library's checkbox to list all linked puzzles is for deliberate testing, since it may reveal spoilers.

Pure browser preview (`npm run dev`) still loads the demo and can import regular JSON only. Compressed SCL and the authoritative fog/trigger engine require Tauri/Rust.

### Android APK

The GitHub Actions **Build Android debug APK** workflow builds the ARM64 Tauri app. Download the `SudokuPadX-Android-arm64-debug` artifact from a **successful** run. Alternatively install Android SDK/NDK and follow the Tauri 2 prerequisites, then:

```sh
npm install
rustup target add aarch64-linux-android
npx tauri android init --ci
npx tauri android build --apk --debug --target aarch64 --ci
```

The package ID is `com.fanfront.sudokupadx`, separate from the old Android wrapper. CI debug APKs may be signed with different keys across runners; do not assume in-place upgrades between runs until stable signing is configured.

## Validation

The Rust CI suite includes:

- 46/46 bundled SCL imports, structure checks, initial fog state for each adventure map, and 22 localized linked-puzzle records.
- Unit tests for one-based `rNcN` coordinate triggers, zero-based foglight coordinates, sector placement, all-cells-correct trigger conjunctions, fog visibility through undo/redo, compact syntax, marks, and progress restoration.
- 24 existing translated SCL files reloaded from the original Android project's offline snapshot as a separate compatibility check.
- Vite frontend build and Node UI utility tests.

## Important compatibility limits

This is **not yet fully pixel-equivalent** to the original SudokuPad renderer. Special lines/arrowheads, complex SVG objects, nonrectangular textures, emoji positioning, precise cage outlines, and unusual constraint artwork may differ. Native Sudoku variant validation, overlapping sector rule enforcement, challenge-specific scripted actions beyond `cellvalue -> foglight`, imported cell coloring, autosolving, and original SudokuPad save-file migration are not yet implemented. The current linked-boss navigation is based on links in the visible area's rule text; it is not a complete quest or inventory simulation.

For spoiler-free play, use only the normal map links (not “show all”). Verify complex adventure mechanics against the original puzzle before trusting the new application as a complete replacement.

## Source layout

```text
crates/sudokupadx-core/    Rust decoder, fog and editable state
src-tauri/                 Tauri Android/desktop shell and Rust commands
src/                       Custom Canvas/UI, sector and boss navigation
public/puzzles/            Bundled SCL packs and Chinese translation data
.github/workflows/         Rust/frontend checks and Android APK build
```
