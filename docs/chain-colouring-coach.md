# Native Rust chains and colouring — SudokuPadX

SudokuCoach was reviewed only as a design reference. The app no longer bundles
SudokuCoach's solver copy or independent lesson dialog.

## One engine and one board

- `crates/sudokupadx-core/src/creator.rs` is the only source of chain/colour
  conclusions, candidate snapshots and link certificates.
- `next_hint_with_focus(...)` filters the native no-guess Rust trace by
  X-Chain, XY-Chain, AIC, Simple Colouring or 3D Medusa.
- The same Rust interface is exposed to Android Tauri and browser WASM.
- A focused hint is not replaced by the third-party classic 9x9 adapter.
- The existing Canvas draws candidate nodes and strong/weak links directly
  over the current puzzle, retaining player notes and fog/variant safety.

## Real practice, not a second game

- An advanced chain/colour lesson calls the normal Rust puzzle generator
  with an exact technique focus, verified unique solution and Tier 4.
- Rust returns the actual step certificate and candidate state before the
  elimination. A practice is launched by the existing `open_puzzle` and
  `restore_progress` commands, including the normal selection/center keypad.
- The normal `checkLessonMove` evaluates the chosen removal, and returning
  restores the previously opened game and camera.
- If no strictly certified puzzle is generated, the request fails explicitly.
  The app does NOT substitute a SudokuCoach snapshot or a basic review
  falsely labeled as the advanced technique.

## Scope

Rust's ordinary standard houses support 4×4 (2×2 boxes), 6×6 (2×3),
and 9×9 (3×3). Unsupported legacy typed constraints cannot be inferred
from artwork and never receive a fabricated chain proof.

See tests for Rust certificates, Web UI and lesson setup.
