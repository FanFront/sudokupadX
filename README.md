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

## Move saved checkpoints between the two Android apps and the web version

Open the puzzle you want to transfer. Use **存档互通** in SudokuPad X to export the current puzzle to a portable JSON file (or copy the JSON to your clipboard). In the updated **sodokupadAndroid** APK, open the same game and use **导出存档**, **读取文件**, or **粘贴存档**. These controls allow transfers in either direction, without a network or account.

- **Old Android → SudokuPad X:** Upgrade the old app **in place** so WebView local storage survives, open the saved puzzle in the old app, choose **导出存档**, save the JSON through the Android document picker, then in SudokuPad X select **存档互通 → 选择文件 → 确认并导入存档**. SudokuPad X can select the appropriate bundled puzzle automatically from the saved source URL.
- **SudokuPad X → old Android:** Choose **存档互通 → 导出当前存档**, then open the same puzzle in the old app and choose **读取文件**. Alternatively use **复制 JSON** in SudokuPad X and **粘贴存档** in the old app. The clipboard method works even when a WebView does not provide file downloads.
- **SudokuPad X Android ↔ GitHub Pages:** Use the same export/import controls on each side; local storage is not automatically shared between browsers and apps.

Import asks before overwriting a destination save. Checkpoint format v1 carries the puzzle URL/identity, grid dimensions, given digits, entered values, corner/center marks, and one supported cell color. The Rust core validates cell contents before restoring a save. **This is a snapshot of the open puzzle, not a bulk export of every puzzle's progress.** SudokuPad's draw/pen paths, timer, and undo/redo timeline are not portable; SudokuPad X's limited five-color palette may omit other SudokuPad colors. Keep the original installed app and exported JSON as backups until you verify the transfer.

**Important:** The older APK needs the companion checkpoint-transfer update; existing `progress_*` saves in its WebView remain in place when upgrading with the same signing certificate. Do **not** uninstall the old app to enable transfer, since uninstalling removes its local saves.

## Test it

```sh
npm install
cargo test -p sudokupadx-core --all-targets
npm run tauri -- dev
```

The app opens the first bundled Sudokuvania map by default. Select **游戏库** to load any of the four main maps. Choose a visible sector to see its rules and a boss link if that sector already provides one. The library's checkbox to list all linked puzzles is for deliberate testing, since it may reveal spoilers.

### WebAssembly browser preview and GitHub Pages

The browser runs **the same Rust `sudokupadx-core` puzzle engine** as Android, compiled to WebAssembly through `crates/sudokupadx-web/`. Compressed SCL decoding, bundled puzzles, Chinese metadata, fog triggers, input, undo/redo, and local save restoration work without a server or Tauri. All puzzles are bundled as static assets; saves remain in the browser's local storage.

Hosted site (after enabling GitHub Pages → Build and deployment → **GitHub Actions**):
**https://fanfront.github.io/sudokupadX/**

Review a specific main map directly:

- `https://fanfront.github.io/sudokupadX/?puzzle=digits-of-despair`
- `https://fanfront.github.io/sudokupadX/?puzzle=lineage-of-logic`
- `https://fanfront.github.io/sudokupadX/?puzzle=super-sudokoid-1`
- `https://fanfront.github.io/sudokupadX/?puzzle=super-sudokoid-2`

You can also use any bundled boss or linked puzzle's catalog ID in the `puzzle` query parameter. This is meant for visual review and can reveal content before it is discovered in the main map.

Local web preview requires Rust's `wasm32-unknown-unknown` target and `wasm-pack`:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm install
npm run dev:web
```

For a production-compatible static build run `npm run build:web`. The generated `public/wasm/` directory is intentionally untracked; do not commit generated binaries. Native Android builds continue to use `npm run build` and do not require wasm-pack.

The [Deploy SudokuPad X to GitHub Pages](https://github.com/FanFront/sudokupadX/actions/workflows/pages.yml) workflow compiles WASM, runs Node rendering tests, builds Vite with the correct `/sudokupadX/` path, runs Chromium puzzle-opening/input smoke tests, uploads board screenshots as a workflow artifact, and deploys the static site. If Pages is not yet enabled, the repository administrator must choose **GitHub Actions** in Settings → Pages. The site link is only live after a successful deployment.

### Android: compact, stable-signed test APKs

The [**Build compact signed Android APK**](https://github.com/FanFront/sudokupadX/actions/workflows/android.yml) workflow produces an **ARM64-only release APK** optimized for size, rather than the older large debug APK:

- Native Rust library is built in release mode with `opt-level = "z"`, thin LTO, one codegen unit, panic abort, and symbol stripping.
- Android release enables R8 minification and resource shrinking.
- The 46 bundled offline games stay installed in the APK (no extra download).
- The package ID stays `com.fanfront.sudokupadx`.
- **Every CI build is signed with the exact same public testing certificate** in `android-signing/test-signing.p12`.
- CI assigns monotonically increasing Android `versionCode = 2,000,000 + GITHUB_RUN_NUMBER`; installed saves and app data persist across later updates from this signing key.

Download **`SudokuPadX-Android-arm64-release-test-signed`** from the artifacts on a *successful* workflow run. The workflow validates the APK signature and reports the actual APK size. Older workflow artifacts are debug builds and cannot be used as updates for this release-signing series.

**First upgrade from the old APK:** Previous CI debug APKs were signed with a different, ephemeral Android debug certificate. The new stable certificate **cannot** upgrade an old debug install with the same package ID. You must **uninstall the previously signed debug APK once** before installing your first stable-signed release. Android removes the app's on-device data on uninstall, so back up any progress you need to keep. After this one transition, new stable-signed APKs can be installed over older ones without uninstalling.

**This signing key and its passphrase are deliberately public, for personal testing only**: alias `sudokupadx-test`, store type PKCS12, password `SudokuPadX-Test-2026`. Anyone can sign an APK using this key, so never use it for app-store distribution or sensitive production data. Preserve the same file for all future test releases; replacing the key would require another uninstall.

To make the same signed release APK locally after setting up the [Tauri Android prerequisites](https://v2.tauri.app/start/prerequisites/):

```sh
npm install
rustup target add aarch64-linux-android
npx tauri android init --ci
npm run android:build
```

`npm run android:build` sets the versionCode and reapplies the signing configuration to the generated Gradle project before building a signed release. For local in-place upgrades, pass a `SUDOKUPADX_VERSION_CODE` greater than the version code already installed (e.g. `SUDOKUPADX_VERSION_CODE=2001000 npm run android:build`). CI handles this automatically. Tauri's generated `src-tauri/gen/` is ignored by Git, so the shared setup script is intentionally reapplied after each `tauri android init`.


## Validation

The Rust CI suite includes:

- 46/46 bundled SCL imports, structure checks, initial fog state for each adventure map, and 22 localized linked-puzzle records.
- Unit tests for one-based `rNcN` coordinate triggers, zero-based foglight coordinates, sector placement, all-cells-correct trigger conjunctions, fog visibility through undo/redo, compact syntax, marks, and progress restoration.
- 24 existing translated SCL files reloaded from the original Android project's offline snapshot as a separate compatibility check.
- Vite frontend build and Node UI utility tests.

## Important compatibility limits

This is **not yet fully pixel-equivalent** to the original SudokuPad renderer. Special lines/arrowheads, complex SVG objects, nonrectangular textures, emoji positioning, precise cage outlines, and unusual constraint artwork may differ. Native Sudoku variant validation, overlapping sector rule enforcement, challenge-specific scripted actions beyond `cellvalue -> foglight`, imported cell coloring, autosolving, and automatic native SudokuPad replay-file migration are not yet implemented; checkpoint migration is supported through the updated old-Android companion export feature. The current linked-boss navigation is based on links in the visible area's rule text; it is not a complete quest or inventory simulation.

For spoiler-free play, use only the normal map links (not “show all”). Verify complex adventure mechanics against the original puzzle before trusting the new application as a complete replacement.

## Source layout

```text
crates/sudokupadx-core/    Rust decoder, fog and editable state
src-tauri/                 Tauri Android/desktop shell and Rust commands
src/                       Custom Canvas/UI, sector and boss navigation
public/puzzles/            Bundled SCL packs and Chinese translation data
.github/workflows/         Rust/frontend checks and Android APK build
```
