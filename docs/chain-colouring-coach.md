# Chain and colouring: verified candidate links

SudokuPadX incorporates the candidate-level visualization learned from the separate SudokuCoach project,
which extends MIT sudoku-core v4.1.1 with proof graphs. The existing upstream MIT notice is in THIRD_PARTY_NOTICES.md.

## Logic and constraints

- Rust exposes `step.proof` as `kind: 'chain' | 'colour'`, `nodes: [{cell,digit,colour?}]`,
  `edges: [{from,to,strong}]`. There is no fabricated proof for hints without certificates.
- Simple Colouring, X-Chain, XY-Chain, AIC, and 3D Medusa use generic candidate indices on 4x4, 6x6 and 9x9.
- Classic 9x9 sudoku-core hints are checked against the SudokuCoach-instrumented engine.
  Proof metadata is attached only when the technique and all candidate updates match exactly.
- Nonstandard variant and fog puzzles do not enter the classic SudokuCoach path.
- Written pencil notes are never used as logical premises, only as display/input.

## UI and training

- Blue/purple candidate numbers; solid strong links; dashed weak links; link-step details.
- Gameplay Canvas draws proof links behind the numbers and candidate nodes, preserving
  existing goal cell highlights and fog safety.
- Lesson screen links to a separate, responsive training board with five topics and
  four solver-verified examples per topic (20 total) from FanFront/sudokuCoach.
- Observe -> practice -> verify; input targets individual candidates, not a multiple-choice quiz.
- Training state is device-local and does not mutate the actual game/checkpoint.

## Validation

- `cargo test -p sudokupadx-core --all-targets`
- `npm test`
- `npm run build`
- `npm run build:web` and `scripts/web-smoke.mjs` (including mobile coaching)

Scope: not every sudoku-core technique has been generalized, and imported
legacy puzzles without certified rule data are deliberately excluded.
