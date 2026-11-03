# Logic-first mixed-variant Sudoku generation

The workshop generates reproducible 4×4, 6×6 and 9×9 puzzles. The
generator **starts from deductive structures**, not a complete solution
with random decorative marks. It authors intentional relationships among
cages, lines and houses, removes givens while a no-guess solver can still
finish, and independently verifies a unique answer.

```sh
python3 scripts/generate_variants.py --seed 20261103
python3 -m unittest discover -s tests -p 'test_generate_*.py'
```

The output is in `public/puzzles/variants/`: three SudokuPad-compatible
puzzles, a catalog fragment, and a validation report containing the full
replayable deduction proof. Normal npm dev/build/test steps regenerate them.

## Logic motifs, not merely constraint labels

| Motif | Mathematical insight | Generator construction | Proof method |
| --- | --- | --- | --- |
| **Killer innie** | A Sudoku house totals `n(n+1)/2`. Subtract the sums of disjoint internal cages to obtain the total of remaining cells | Build cages covering all but 1–2 cells in a box | `killer_innie` |
| **Killer outie** | Disjoint cages together cover an entire box plus exactly one outside cell. Their total minus the house total equals the outside digit | Intentionally tile a box with connected cages, one crossing its boundary | `killer_outie` |
| **Renban + Killer** | A length-`k` consecutive run has sum `k*a + k(k-1)/2`, which determines its first digit `a` | A Renban line and a sum cage intentionally share exactly the same cells | `renban_sum_lock` |
| **Mixed consecutive partition** | A white Kropki chain of 3 in one house and a length-3 Renban are each a consecutive triple. When together they cover a 6-cell house, their sets must be `{123}` and `{456}` in either order | Place two white dots on the first triple of a 6×6 row and a Renban on the second | `mixed_consecutive_partition` |
| **Three Kropki chains** | Three disjoint white-dot triples covering a 9-cell house must use `{123}, {456}, {789}` | Place six connected white dots into three disjoint chains inside a row | `kropki_partition` |
| **Locked candidates** | If all candidates for a digit in a row/column/box are confined to its intersection with another house, remove that digit elsewhere in the other house | The above variant eliminations set up line-box intersections | `locked_candidate` |

For small sizes, the house totals are **10** (4×4), **21** (6×6),
and **45** (9×9). A house sum is not a special extra clue: it follows
from Sudoku's row/column/box digits.

The solver recognizes the Killer sum structures from the **printed cage
cells and sums**, not hidden `motif` tags. Likewise, it identifies a mixed
partition from **visible white dots, Renban geometry, and house coverage**.
The completed answer is never consulted by any deduction function.

The generator also uses the following ordinary constraints, which can
chain deductions through one another:

| Rule | Visual representation | Logic |
| --- | --- | --- |
| Killer | Dashed cage and sum | Exact feasible sum-and-distinct combinations |
| Thermometer | Purple bulb and line | Strict increase from bulb to tip |
| White or black Kropki | White/black dot | Difference of one or double ratio |
| Renban | Blue line | All digits distinct and consecutive in any order |
| German whispers (9×9 only) | Green line | Neighboring digits differ by at least 5 |
| Arrow | Orange circle and line | The shaft's sum equals the circle |
| XV | V/X at a shared edge | Pair sums to 5/10 |

There is **no negative Kropki or XV rule**: unmarked adjacent cells
are unrestricted. The generator uses 2×2, 2×3 and 3×3 boxes for sizes
4, 6 and 9 respectively.

## Worked examples

**A 9×9 Killer outie:** Four nonoverlapping cages cover all nine cells
of a 3×3 box and exactly one tenth cell outside it. If the four cage
labels total 52, the outside cell is **52−45=7**. This deduction does
not require filling the box or making a speculative assumption.

**A Renban sum lock:** Three cells are simultaneously a Renban line and
a Killer cage labeled 15. Their digits are consecutive, so
`a+(a+1)+(a+2)=15`, hence `a=4`; they contain exactly **4, 5, 6**,
in some order.

**Mixed 6×6 partition:** Three cells connected by two white dots are
a consecutive chain (middle digit lies between the endpoints, because
all three share a Sudoku house). The other three cells of that row are
a Renban. The two disjoint triples must be **{1,2,3}** and **{4,5,6}**,
in either order; the Kropki midpoint is consequently **2 or 5**.

The generation trace records the actual candidate removals made by
these motifs, including the involved house, cages, or line groups.
Pattern-recognition labels without eliminations do **not** count.

## Additional research: region-sum and class-based lines

The generator now authors three **cross-rule motifs**, not merely new
colored lines:

| Motif | Construction | No-guess deduction |
| --- | --- | --- |
| **Region sum + Killer** | A region-sum line crosses a box edge, and a two- or three-cell Killer cage coincides with one entire segment | The cage gives the common sum of *all* segments; propagate sums into the other box (`region_sum_killer_bridge`) |
| **Entropic × modular crossing** | A 4-cell gold entropic line and a 4-cell teal modular line cross once. Two distinct-class non-crossing anchors are givens on each line | Two anchors on each line fix the order of all three class groups; the crossing cell belongs to their intersection (`entropic_modular_cross`) |
| **Between + Renban** | The interior cells of a violet Between line also form a Renban; one endpoint is given | The interior must form a consecutive interval *strictly* inside the endpoint range; both endpoints and interior narrow (`between_renban`) |

The ordinary line deductions are also implemented: consecutive box
segments on a region-sum line have **equal totals**; every three
consecutive entropic digits represent the three low/middle/high classes;
every three modular digits contain different residues mod 3; Between
interiors lie strictly between two circle values.

For **6×6**, the entropic groups are `{1,2}/{3,4}/{5,6}`;
for **9×9** they are `{1,2,3}/{4,5,6}/{7,8,9}`. Modular
groups always use the digit's remainder modulo three.
These two rules are *not* interchangeable. A line of length 4
cycles its three digit classes back to the starting class.

Sudopedia's traditional techniques are also available **after** variant
reductions: hidden pairs/triples (`hidden_subset`) and the
two-row/two-column X-Wing (`x_wing`). These are direct candidate
eliminations rather than hypothetical chains.

### Sources and next research candidates

- Sudopedia [45 rule](https://sudopedia.sudocue.net/index.php/45_rule):
  innies, outies, and hidden cages.
- Sudopedia [Locked Candidates](https://sudopedia.sudocue.net/index.php?title=Pointing_Pair):
  intersections and Killer cage combinations.
- Sudopedia [Hidden Subset](https://sudopedia.sudocue.net/index.php/Hidden_Subset)
  and [Fish](https://sudopedia.sudocue.net/index.php?title=Fish):
  standard deductions after variant pruning.
- [Sudoku Skunkworks rule compendium](https://georgethetoad.co.uk/ctcHunts/Duality.pdf)
  and [Logic Masters example](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000IL0):
  modern line definitions, including modular and entropic classes.

The next suitable Sudopedia-derived motifs are **Killer locked
combinations** (a digit must occur in a cage restricted to one house)
and **innie/outie differences**; these should be added only after a
human-readable proof step and a source-labelled motif can be generated.

## Acceptance and verification

A candidate puzzle is retained only when:

1. Its visible constraints agree with its completed grid.
2. The deterministic human-style propagator solves all cells using
   singles, naked subsets, pointing/claiming, and actual variant
   deductions; it never guesses, branches, or consults the answer.
3. Classic-only deduction stalls, while at least two variant families
   (three on 9×9) actively remove candidates.
4. **6×6 and 9×9 each have at least two different structural methods**
   that actually remove candidates. Both also demonstrate a house-wide
   Killer outie, a Renban-Killer interval lock, a region-sum/Killer
   bridge, an entropic-modular crossing and a Between-Renban
   interaction. The 9×9 must additionally demonstrate the three-chain
   Kropki technique; 6×6 must demonstrate the mixed consecutive partition.
5. Removing all constraints from at least one whole variant family
   must make the human solve stall.
6. An *independent* bounded search finds exactly one solution to the
   complete visible puzzle, including all variant constraints.

The proof is stored in `validation.json`, with counts, sources,
removed candidates, the remaining candidate domains and rule-family
ablation information. `metadata.logicProfile.structuralMotifs`
summarizes genuinely used structural methods. The exported
`logicProfile.ahaMoments` contains trace-backed single-digit resolutions
with source constraint references, suitable for a future hint engine.

In particular, an entropic/modular crossing is only accepted when its
two class-anchored lines **actually resolve a cell to one digit**.
One given per line leaves two possible class orders; the constructor
therefore uses two distinct-class anchors per line.

These gates establish reproducible, no-guess solutions and **actual
participation** by the structures. They do not establish a calibrated
player difficulty or prove every individual clue indispensable. Puzzle
authors should still inspect readability and the pacing of deductions,
especially when cage, line and dot marks converge.

## Architecture

- `scripts/variant_logic.py`: full deduction loop, classic locked
  candidates and independent solution counter.
- `scripts/variant_techniques.py`: local Renban, whisper, arrow and
  XV propagation, plus 9×9 white-dot triple partition.
- `scripts/variant_lines.py`: region-sum, entropic, modular and Between
  domain propagation plus genuine cross-rule deductions.
- `scripts/line_generation.py`: builds meaningful line intersections with
  explicit opening anchors and protected deduction targets.
- `scripts/classic_techniques.py`: hidden subsets and X-Wings from
  traditional Sudoku solving.
- `scripts/variant_structures.py`: reconstructed Killer house arithmetic,
  Renban–Killer sum locks and mixed Kropki–Renban house partitions.
- `scripts/generate_variants.py`: chooses the solution, constructs
  purposeful constraint geometry, removes givens with a no-guess proof,
  evaluates participation and exports SudokuPad JSON.
- `tests/test_generate_variants.py`: soundness examples, solvability,
  uniqueness, determinism and export checks.

The added rule-solving logic runs in the offline Python generator,
not yet in the live Rust/Web candidate-conflict highlighter. No
cross-puzzle arithmetic dependency or automatic fog-gating is introduced
by this workshop.

Changing the generator algorithm or seed may invalidate previous local
saves under the same IDs. Start a regenerated workshop chapter fresh.
