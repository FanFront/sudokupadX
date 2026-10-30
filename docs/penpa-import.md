# Penpa+ import (stage one)

SudokuPad X now accepts complete Penpa+ share URLs at the main Import dialog. Both the #m=solve&p=... fragment and ?m=solve&p=... query forms from https://swaroopg92.github.io/penpa-edit/ are supported.

A Penpa+ URL embeds puzzle data. The app converts it locally into SudokuPad JSON using @sudokupad/penpa-to-scl version 0.0.1-preview.2, then opens the result through the existing Rust puzzle engine. No network request to Penpa+ is necessary. Player progress and the camera view can be recovered when reopening the app.

Logic Masters search and page import now discover both SudokuPad and Penpa+ author links. In the Logic Masters detail view the existing Open Online, Download Offline, and Open Offline controls also work with convertible Penpa+ entries. The downloaded converted JSON is stored in IndexedDB, not fetched each time.

Scope: square-grid Sudoku and supported variant drawings. Unsupported Penpa+ grid types, drawing details, pencil-puzzle interaction modes (edge/line tracing and shading), Penpa native answer check and replay are not fully emulated. Some converted boards may therefore not be fully playable. Short URLs should be expanded by the user before importing.

Security: only the official HTTPS Penpa+ editor origin is accepted, the input and output are size-bounded, and Rust validates puzzle dimensions. The preview converter evaluates its bundled legacy decompressor internally, requiring the Android WebView CSP to enable unsafe-eval. External script loading and requests to arbitrary URLs remain restricted. A future update should remove that legacy eval dependency.

Install and verify with npm install and npm test, then build the app normally.
