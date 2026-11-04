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

## Chinese learning curriculum and Sudopedia techniques

The player-facing references are in **Chinese**:
[基础与变体 25 课（含局部候选数例题）](techniques.zh-CN.md) and
[完整 Sudopedia 技巧分类、覆盖状态与新增进阶例题](sudopedia-catalog.zh-CN.md).
The extended catalogue explicitly distinguishes implemented methods,
shared aliases, future methods and uniqueness/guessing-based methods
that are excluded from required player solves.
It covers 25 worked mini-lessons: singles, naked/hidden subsets of size
2–4, locked candidates, X-Wing/Swordfish/Jellyfish, XY-Wing/XYZ-Wing,
Skyscraper, and all authored variant deductions. The examples are
locally valid candidate implications, not complete synthetic puzzles.

The solver recognizes additional Sudopedia catalogue entries without
using guess-and-reject or unique-solution assumptions:

| Implemented classic technique | Deduction source method | Learner tier |
| --- | --- | --- |
| Peer elimination / hidden single | `peer_elimination`, `hidden_single` | 1 |
| Naked/hidden pair and triple | `naked_subset`, `hidden_subset` | 2 |
| Locked candidates | `locked_candidate` | 2 |
| Naked/hidden quad | `naked_subset`, `hidden_subset`, with `source.size=4` | 3 |
| X-Wing / Swordfish | `x_wing`, `swordfish` | 3 |
| XY-Wing / Skyscraper | `xy_wing`, `skyscraper` | 3 |
| Jellyfish / XYZ-Wing | `jellyfish`, `xyz_wing` | 4 |

Tier 1 also includes **direct** variant-constraint propagation; tier 2
includes constructed Killer and line interactions. Tier 3 adds
2-String Kite, W-Wing and Remote Pairs; tier 4 adds
Color Trap/Wrap, Finned X-Wing, XY/X-Chains, ALS-XZ and Squirmbag.
All advanced searches are bounded and invoked only when simpler
techniques stall. These are pedagogical tiers, **not** calibrated
difficulty ratings.

Every published chapter supplies `logicProfile.education`:

- `minimumTier`: the first of four progressively enabled technique sets
  capable of fully solving that *specific puzzle* with no guessing.
- `techniquePath`: the first **actual candidate removal** by each used
  technique, in logical order, with Chinese name, target RnCn coordinate,
  removed/remaining digits and method tier.
- `maxUsedTier`: highest tier used in the generator's default proof;
  this may differ from the weakest sufficient tier because the default
  solver uses all sound methods.
- `focusTechnique`: a method ID for a purpose-built technique lesson,
  or null for the regular workshop.
- `requestedMinimumTier`: curriculum target selected with `--min-tier`.
- `guideUrl`: stable link to the Chinese tutorial.

To **try generating a focused example** (rather than just relabel a
random puzzle):

```sh
python3 scripts/generate_variants.py --seed 20261103 \
  --focus-size 9 --focus-technique x_wing --attempts 200

# Or try to require a tier-3 human solve in the 9×9 chapter:
python3 scripts/generate_variants.py --seed 20261103 \
  --focus-size 9 --min-tier 3 --attempts 200
```

The focused 9×9 puzzle is accepted only if the default proof actually
uses `x_wing`, a tier-3 human solver can finish the board,
and a separate human solve **without X-Wing at tier 3 or below**
can no longer finish. A more advanced technique may mathematically
reproduce a simpler pattern; this should not invalidate its lower-tier
lesson. Other variants continue to be enforced.
If the requested teaching pattern is too rare for the specified
seed/attempt budget, generation **fails explicitly**, rather than
claiming a fake example. The generator doesn't yet guarantee an example
for *every* Sudopedia technique in one seed.

A separate exact search remains in use **only** to check uniqueness;
it never writes steps into `techniquePath`. Uniqueness-dependent
techniques (unique rectangles), forcing-net enumeration, Nishio,
brute force and trial-and-error remain excluded from the human solver.

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

- `scripts/variant_logic.py`: tier-limited human deduction loop,
  classic locked candidates and independent solution counter.
- `scripts/technique_catalog.py`: stable Chinese technique names,
  curriculum tiers, actual learning-path exports and tiered solve checks.
- `scripts/classic_techniques.py`: classical subsets, X-Wing/Swordfish/
  Jellyfish/Squirmbag fish, Finned X-Wing, XY/XYZ-Wing and Skyscraper.
- `scripts/chain_techniques.py`: two-string kite, W-Wing, remote pairs,
  simple two-color trap/wrap, bounded XY-Chain and X-Chain.
- `scripts/als_techniques.py`: short ALS-XZ with restricted common digit,
  a local exact deduction that does not test an assumed solution.
- `tests/test_generate_chains.py`: crafted candidate patterns for every
  new method and randomized complete-solution preservation checks.
- `scripts/variant_techniques.py`: local Renban, whisper, arrow and
  XV propagation, plus 9×9 white-dot triple partition.
- `scripts/variant_lines.py`: region-sum, entropic, modular and Between
  domain propagation plus genuine cross-rule deductions.
- `scripts/line_generation.py`: builds meaningful line intersections with
  explicit opening anchors and protected deduction targets.

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


## 100 independently generated 9×9 puzzles in the offline library

`scripts/generate_batch9.py` uses the **same** solved-grid constructor,
constraint authoring, logical clue digging, structural-motif quality checks,
no-guess deduction engine and independent solution counter as the workshop.
It rejects repeated **completed grids** (not merely identical strings of
clues), requires a real variant dependency and a complete replayable proof,
and records SHA-256 fingerprints in a validation summary.

```sh
python3 scripts/generate_batch9.py --seed 20261104 --count 100 --workers 4
# Quick local smoke sample:
python3 scripts/generate_batch9.py --seed 20261104 --count 1 --output /tmp/sudokupadx-batch9
```

For reproducibility the default seed and puzzle count are fixed. The four worker
partitions have fixed derived seeds and deterministic ordering; 1-puzzle
smoke tests run sequentially. `npm run dev`
and `npm run build` export 100 offline files to `public/puzzles/batch9/`
which Vite copies to the final web/Android assets. Since those files are
reproducible build outputs, they are ignored by Git and regenerated rather
than storing 100 copies in the repository. The app loads their catalog as a
separate fragment, leaving the historical bundled catalog untouched.

In **谜题库 → 内置谜题 → 生成的 9×9（100 题）**, players can filter/search
by title or identifier. Each entry exposes the curriculum tier validated by
the solver, and progress uses the stable `generated-9x9-001` through
`generated-9x9-100` puzzle IDs. Puzzle metadata includes the generator
seed, authored constraint types and a technique profile; the compact
`validation.json` lists uniqueness/proof fingerprints and difficulty tiers.

The PWA service worker also precaches every file listed in the generated catalog,
so these puzzles remain playable offline after a successful shell install.
