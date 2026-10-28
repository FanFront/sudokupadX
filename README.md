# SudokuPad X

A new, independent SudokuPad puzzle reader and interactive renderer, designed for Android and desktop.

## Design

- **Rust core:** decodes SudokuPad `scl` (LZ-String Base64), JSON, and safe JSON5-like compact puzzle payloads; owns editing, marks, undo and redo.
- **Tauri 2 shell:** connects the Rust engine to an offline-capable, responsive UI.
- **Canvas board:** renders a visible-cell window rather than thousands of DOM nodes, with zoom, pan and touch input.
- **No embedded original SudokuPad runtime.** Import your own `.scl` / `.json` files rather than redistributing third-party game data.

This is an incremental implementation, not yet a complete SudokuPad compatibility layer. Complex fog, interactive scripts, special constraints, adventure map state and accurate original game rules are not supported in the prototype.

See further setup and development instructions in this README after the starter commit.
