# Logic-first mixed-variant Sudoku generation

The workshop builds connected 4×4, 6×6 and 9×9 puzzles. **Variants are
actual solver constraints, not solution-checking decorations.** The
generator chooses a valid completed grid, creates meaningful geometric
motifs, removes givens only while its independent, deduction-only solver can
finish the puzzle, and then checks uniqueness with a separate bounded search.

```sh
python3 scripts/generate_variants.py --seed 20261103
python3 -m unittest discover -s tests -p 'test_generate_*.py'
```

Outputs: `public/puzzles/variants/variant-workshop-{4,6,9}.json`,
`catalog-entries.json`, and `validation.json`. The usual npm build/test
presteps regenerate the workshop.

## Solving vocabulary

| Rule | Printed on board | Deduction methods |
| --- | --- | --- |
| Killer | Dashed sum cage | All distinct assignments whose sum matches; removes unsupported candidates |
| Thermometer | Purple bulb and line | Every neighbor strictly rises; propagates lower and upper bounds |
| Kropki | White or black dot | Consecutive or doubled neighboring digits; candidate-pair propagation |
| Renban | Thick blue line | All digits form a consecutive set in any order; feasible intervals and assignments |
| German whispers (9×9) | Green line | Consecutive line cells differ by **at least 5**; alternating low/high candidates |
| Arrow | Orange circle and shaft | Sum of shaft cells equals circle; joint sum assignments |
| XV | V or X | The two marked cells sum to 5 or 10 |

The four additional rule types have distinct mathematical propagation in
`scripts/variant_techniques.py`. They are also checked by the independent
uniqueness solver (which uses the same rule semantics, then branches solely
for counting). 4×4 uses 2×2 boxes, 6×6 uses 2×3 boxes, and 9×9 uses 3×3
boxes. An **unmarked pair carries no negative Kropki or XV rule**.

## Kropki three-chain breakthrough

In the 9×9 chapter, the generator explicitly creates six white dots in
a single row. They form **three disjoint chains of three cells**:

```
A · B · C    D · E · F    G · H · I
```

Every row must have the digits 1–9 without repetition. Each three-cell
chain has to be three consecutive digits, because its middle cell differs
by one from both endpoints, and the endpoints cannot be equal in the row.
Three disjoint consecutive triples covering 1–9 can therefore use only
**{1,2,3}, {4,5,6}, {7,8,9}**, in some order. The solver recognizes this
global relationship, enumerates the six band-to-chain assignments and
both orientations per chain, and prunes candidates using only current
pencilmark domains. It records these moves as `kropki_partition` in the
proof trace. This is stronger than checking each dot independently.

## Acceptance gates

1. Every cell must be deducible without branching, including row/column/
   box singles, naked subsets, and the actual variant techniques.
2. Remove all variants and the deduction process must stall.
3. At least two variant families (three on 9×9) must actually remove
   candidates; the 9×9 must demonstrate `kropki_partition`.
4. Removing an entire variant family must break the deduction path for
   at least one family. The generated proof lists which families are
   *used* and which are *necessary*.
5. A separate, bounded mathematical solver must find exactly one solution.
6. The given count must remain below the size-specific maximum.

The reproducible trace contains each candidate elimination, its technique,
its source constraint or house, and the overall solve profile. The
independent solution counter is **not** a permissible human step.

These conditions establish a no-guess path and a recognizable variant
breakthrough. They do not prove that *each individual drawn clue* is
indispensable, or perfectly measure human difficulty. Release candidates
should still receive manual playtesting for pacing and legibility.

## Rendering and compatibility

The exports use existing SudokuPad-compatible `cages`, `lines`,
`underlays`, `overlays` and `arrows` structures, which SudokuPadX
renders. Rule text is bilingual and each chapter links to its neighbors.
The added rules belong to the offline workshop generator: this iteration
does not add real-time candidate-conflict highlighting for every new
variant to imported puzzles.

Changing generator seed or algorithm may invalidate existing saves under
the same workshop IDs; start regenerated chapters fresh after upgrading.
