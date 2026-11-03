# Mixed-variant Sudoku generator

This is the first standalone generator for **4×4, 6×6 and 9×9** puzzles
sharing a common variant vocabulary. It is separate from the four-gate
adventure generator; existing boss-cell and fog semantics stay unchanged.

## Run

```bash
python3 scripts/generate_variants.py --seed 20261103
python3 -m unittest discover -s tests -p 'test_generate_*.py'
```

The script exports three SudokuPad-compatible JSON puzzles and a catalog
fragment under `public/puzzles/variants/`. The normal npm dev/build/test
presteps regenerate them. In the app open **Library → 规则工坊**; each puzzle
has links to the other two in its rule text. Selecting a cell exposes a
linked-puzzle button, and the library also lists all three independently.

## Constraint vocabulary

| Rule | Printed on board | Mathematical interpretation |
|---|---|---|
| Killer cage | dashed outline and sum | included digits sum to the label without repeats |
| Thermometer | purple stem and circular bulb | digits strictly increase from bulb to tip |
| Kropki dot | white or black dot between cells | white: difference of 1; black: ratio of 1:2 |

An unmarked pair is **not** subject to a negative Kropki rule. Each size
has all three constraint types, with different placements and combinations.
Shared rule semantics deliberately let players transfer deductions across
the three chapters. The 6×6 grid uses 2×3 boxes; 4×4 uses 2×2; 9×9 uses 3×3.

## Playability and uniqueness

A generator candidate passes only when:

1. A deduction-only propagator solves every cell using row/column/box
   elimination, hidden singles, killer combinations, thermometer
   inequalities and local Kropki relations.
2. Independently, a bounded search confirms exactly **one** solution,
   considering *all* the printed variant clues.
3. The same deductions **stall without the variant rules**, preventing a
   solved-as-classic-Sudoku puzzle dressed up with decoration.
4. At least two variant families actually remove candidate digits in the
   proof; removing at least one entire family makes deduction stall.
5. Its clue count stays within the configured per-size bounds.

A reproducible proof (each candidate removal with its source constraint),
variant participation and rule-ablation results are saved in
`validation.json`. Backtracking is *only* used for independent uniqueness
checking, never for the human-style proof or clue-removal decision.

These are conservative, mechanically checkable requirements. They do not
guarantee that every deduction is aesthetically striking or that everyone
will interpret a complicated killer combination instantly. Each generated
chapter should still be playtested before release.

## Architecture and limitations

- `scripts/variant_logic.py`: generalized logical solver and uniqueness
  verifier for 4×4/6×6/9×9 with mixed constraint types.
- `scripts/generate_variants.py`: reproducible solutions, constraint
  layout, clue digging, quality gates and SudokuPad JSON export.
- `tests/test_generate_variants.py`: check variant rules, determinism,
  links, uniqueness and no-guess proofs.
- The SudokuPadX player renders clues and checks completed values against
  the authored solution. Live candidate-conflict highlighting for sum,
  thermometer and Kropki rules is **not yet implemented**.
- Puzzle-to-puzzle linkage currently means a shared rule theme, library
  presence and navigation links; there is no cross-puzzle arithmetic
  dependency, reward or mixed-size fog-gating yet.
- Changing the seed or generator algorithm can invalidate previous saves
  using the same generated IDs. Start these puzzles fresh when updating.
