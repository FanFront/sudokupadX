"""Sudokuvania-style progressive fog for generated four-chapter Sudoku.

The original puzzles use many correctness-based *local* reveals, not a
single 9x9 reveal after completing each boss. Each chapter therefore starts
with a deliberately small, logically playable set of visible cells.
Correctly filling a visible unsolved cell spreads the light to neighbors,
and solving a small set of starter clues discovers the embedded boss cell.
"""
from __future__ import annotations

def local_neighbors(local: int) -> list[int]:
    r, c = divmod(local, 9)
    return [(r+dr)*9+c+dc for dr in (-1, 0, 1)
            for dc in (-1, 0, 1) if (dr or dc)
            and 0 <= r+dr < 9 and 0 <= c+dc < 9]


def create_plan(rng, answer, clues, boss_cell, overlaps, count_solutions, singles):
    """Return (possibly enriched givens, visible seed, starter milestones).

    Starter entries must be singles under visible *given digits alone*.
    Extra safe givens are permitted only when both solutions created by the
    absent boss digit remain possible, even with all overlaps supplied.
    """
    clues = dict(clues)
    available = lambda: [i for i in singles(clues) if i not in clues
                         and i != boss_cell]
    steps = available()
    additions = 0
    while len(steps) < 3 and additions < 12:
        candidates = [i for i in range(81) if i not in clues
                      and i != boss_cell and i not in overlaps
                      and count_solutions(clues | overlaps |
                                          {i: answer[i]}) > 1]
        if not candidates:
            break
        rng.shuffle(candidates)
        best, maximum = None, -1
        for i in candidates:
            trial = clues | {i: answer[i]}
            increase = len([j for j in singles(trial) if j not in trial
                            and j != boss_cell])
            if increase > maximum:
                best, maximum = i, increase
        clues[best] = answer[best]
        additions += 1
        steps = available()
    if not steps:
        raise ValueError('No logical starter digit could be made while '
                         'preserving boss ambiguity')

    # Prefer three distinct logical entries; they are independently
    # deducible using the visible clue set. A few seeds may only permit 1-2.
    rng.shuffle(steps)
    milestones = steps[:min(3, len(steps))]
    support = dict(clues)
    order = list(support)
    rng.shuffle(order)
    for i in order:
        trial = dict(support)
        trial.pop(i)
        deductions = singles(trial)
        if all(deductions.get(j) == answer[j] for j in milestones):
            support = trial

    # Add only a tiny adjoining patch, never the entire 9x9.
    seen = set(support) | set(milestones)
    for i in milestones:
        for j in local_neighbors(i):
            if j != boss_cell and len(seen) < 30:
                seen.add(j)
                break
    assert boss_cell not in seen
    assert len(seen) < 81
    # Every opening milestone remains logically deducible from what the
    # player can see at this point (no hidden givens).
    assert all(singles({i: answer[i] for i in seen if i in clues})
               .get(j) == answer[j] for j in milestones)
    return clues, sorted(seen), sorted(milestones)


def add_progressive_fog(world, clues, solutions, boss_cells, positions,
                        rng, shared_solved_cells, count_solutions, singles):
    """Generate chapter-scoped local fog triggers and an opening for each grid.

    The JS renderer only evaluates rules of an unlocked chapter, and a
    trigger only fires if *its triggering cell is visibly correct*. This
    prevents input into unrevealed cells from skipping a chapter.
    """
    all_rules = []
    plans = []
    cols = len(world['cells'][0])

    def global_pair(g, local):
        top, left = positions[g]
        r, c = divmod(local, 9)
        return [top+r, left+c]

    for g in range(4):
        initial_clues = dict(clues[g])
        updated, seed, milestones = create_plan(
            rng, solutions[g], initial_clues, boss_cells[g],
            shared_solved_cells(solutions, g), count_solutions, singles)
        clues[g] = updated
        for local, digit in updated.items():
            r, c = global_pair(g, local)
            if not world['cells'][r][c]:
                world['cells'][r][c] = {'value': str(digit)}
        plans.append({'seed': [global_pair(g, j) for j in seed],
                      'milestones': [global_pair(g, j) for j in milestones]})
        for local in range(81):
            if local in updated or local == boss_cells[g]:
                continue
            # Small localized reveals like Sudokuvania's regular cellvalue
            # triggers. The boss cell is excluded until its milestone fires.
            reveal = [j for j in local_neighbors(local) if j != boss_cells[g]]
            if not reveal:
                continue
            all_rules.append({
                'chapter': g,
                'cells': [global_pair(g, local)],
                'values': [str(solutions[g][local])],
                'reveals': [global_pair(g, j) for j in reveal]
            })
        # A multi-cell milestone unveils the hidden boss *inside* its grid.
        # The player may work other visible cells first, but the boss link
        # does not appear until all these genuinely forced entries are placed.
        all_rules.append({
            'chapter': g,
            'cells': [global_pair(g, j) for j in milestones],
            'values': [str(solutions[g][j]) for j in milestones],
            'reveals': [global_pair(g, boss_cells[g])]
        })

    assert all(len(p['seed']) < 40 for p in plans)
    world['foglight'] = plans[0]['seed']
    for g in range(3):
        world['metadata']['bossGates'][g]['reveals'] = plans[g+1]['seed']
    world['metadata']['generatedFogRules'] = all_rules
    world['metadata']['rules'] += (
        ' Fog is part of the Sudoku: only small patches are initially '
        'visible. Solving a visible cell correctly illuminates nearby '
        'cells. Complete the opening deductions to discover the linked '
        'boss cell, then solve its boss for the missing Sudoku digit.'
    )
    return plans
