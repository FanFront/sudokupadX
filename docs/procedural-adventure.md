# Procedural Sudoku adventures

The initial generator is a deterministic, dependency-free Python proof of
concept: four interconnected 9×9 Sudoku grids on one 27×27 map, plus four
independent boss puzzles and correctness-triggered fog progression.

## Run

From the repository root:

```bash
python3 scripts/generate_adventure.py --seed 20261102
python3 -m unittest discover -s tests -p 'test_generate_adventure.py'
```

Generated outputs under `public/puzzles/generated/`:

- `generated-adventure-1.json`: the map, four linked sectors, initial
  fog, three highlighted beacon cells, and fog-reveal effects.
- `generated-adventure-1-boss-1.json` through
  `generated-adventure-1-boss-4.json`: standalone boss puzzles.
- `catalog-entries.json`: local entries for the map and four bosses.
- `validation.json`: solver/generation diagnostics.

These are build outputs; the original bundled catalog stays unchanged. The
default seed is generated automatically by npm dev, build, web build, and test
scripts (and thus Tauri Android's beforeBuildCommand). You can also change
the seed through the direct Python command.

Open **Library**, then **The Four Gates — Generated Adventure**, or navigate
to `?puzzle=generated-adventure-1`. Selecting a visible grid shows
its local boss entrance. The back action returns to the map. Each highlighted
beacon accepts a logically forced value (naked/hidden singles) and reveals
the following chapter.

## Mathematical construction

All grid positions are multiples of three. Each subsequent grid overlaps its
predecessor in exactly one complete 3×3 block. Generated solved Sudokus are
digit-remapped to match this shared block. There are no shared-cell givens.

Clue removal initially preserves individual uniqueness. For the first three
grids, one further given is removed such that the puzzle is ambiguous, even
with its predecessor's shared block, but becomes uniquely solvable when given
the *following* shared block. The last grid is independently unique. This
proves global solution uniqueness inductively from the fourth grid backwards.

Every boss has exactly one solution and a low given count. Boss candidates
that can be solved completely by naked and hidden singles are rejected.

## Limitations

- **Hard is a design target, not a verified human difficulty rating.**
  Singles resistance and cross-grid dependencies do not certify advanced
  human techniques, elegance, or satisfying solving paths.
- The generator creates classic Sudoku, not custom killer cages, arrows,
  thermometers, or narrative branching.
- Bosses are optional linked encounters; defeating them does not currently
  award an inventory item or change fog. Map progression is beacon-based.
- Changing seeds changes puzzle content while retaining puzzle IDs. Back up
  or clear previous progress before switching seeds.
- Generated assets are created by Python during the build, not stored as
  tracked puzzle files. A direct Vite invocation bypassing the npm lifecycle
  must run the generator first.
