#!/usr/bin/env python3
"""Generate a seeded 4-grid, 4-boss SudokuPadX adventure using Python's stdlib.

All four grids have a genuinely ambiguous boss cell *inside* the 9x9:
even with every overlapping digit known, each cell remains ambiguous until
the linked boss supplies the missing digit. Output is SudokuPad JSON and a
catalog fragment consumed by SudokuPadX at startup.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

FULL = (1 << 9) - 1
WORLD_ID = 'generated-adventure-1'
POSITIONS = ((0, 0), (6, 6), (12, 12), (18, 18))
H = max(r + 9 for r, _ in POSITIONS)
W = max(c + 9 for _, c in POSITIONS)
PEERS = []
UNITS = []
for i in range(81):
    r, c = divmod(i, 9)
    row = {r * 9 + j for j in range(9)}
    col = {j * 9 + c for j in range(9)}
    box = {(r // 3 * 3 + dr) * 9 + c // 3 * 3 + dc
           for dr in range(3) for dc in range(3)}
    PEERS.append(tuple(sorted((row | col | box) - {i})))
for r in range(9):
    UNITS.append(tuple(r * 9 + c for c in range(9)))
for c in range(9):
    UNITS.append(tuple(r * 9 + c for r in range(9)))
for r in range(0, 9, 3):
    for c in range(0, 9, 3):
        UNITS.append(tuple((r + dr) * 9 + c + dc for dr in range(3) for dc in range(3)))


def count_solutions(givens: dict[int, int], limit: int = 2) -> int:
    """Backtracking solver with bitmasked candidate sets and MRV."""
    cells = [0] * 81
    row, col, box = [0] * 9, [0] * 9, [0] * 9
    for i, digit in givens.items():
        if i not in range(81) or digit not in range(1, 10):
            return 0
        r, c = divmod(i, 9)
        b = r // 3 * 3 + c // 3
        bit = 1 << (digit - 1)
        if (row[r] | col[c] | box[b]) & bit:
            return 0
        cells[i] = digit
        row[r] |= bit
        col[c] |= bit
        box[b] |= bit

    def search() -> int:
        best, mask, least = -1, 0, 10
        for i, digit in enumerate(cells):
            if digit:
                continue
            r, c = divmod(i, 9)
            m = FULL & ~(row[r] | col[c] | box[r // 3 * 3 + c // 3])
            n = m.bit_count()
            if n == 0:
                return 0
            if n < least:
                best, mask, least = i, m, n
                if n == 1:
                    break
        if best < 0:
            return 1
        r, c = divmod(best, 9)
        b = r // 3 * 3 + c // 3
        found = 0
        while mask:
            bit = mask & -mask
            mask ^= bit
            cells[best] = bit.bit_length()
            row[r] |= bit
            col[c] |= bit
            box[b] |= bit
            found += search()
            row[r] ^= bit
            col[c] ^= bit
            box[b] ^= bit
            cells[best] = 0
            if found >= limit:
                break
        return min(limit, found)

    return search()


def singles(givens: dict[int, int]) -> dict[int, int]:
    """Naked and hidden singles; no guesses or backtracking."""
    found = dict(givens)
    while True:
        additions = {}
        for i in range(81):
            if i in found:
                continue
            candidates = set(range(1, 10)) - {found[j] for j in PEERS[i] if j in found}
            if len(candidates) == 1:
                additions[i] = next(iter(candidates))
        for unit in UNITS:
            missing = set(range(1, 10)) - {found[i] for i in unit if i in found}
            for d in missing:
                positions = [i for i in unit if i not in found
                             and d not in {found[j] for j in PEERS[i] if j in found}]
                if len(positions) == 1:
                    if positions[0] in additions and additions[positions[0]] != d:
                        raise ValueError('Inconsistent singles')
                    additions[positions[0]] = d
        if not additions:
            return found
        found.update(additions)


def make_solution(rng: random.Random) -> list[int]:
    def axis():
        bands = list(range(3))
        rng.shuffle(bands)
        order = []
        for band in bands:
            inner = list(range(3))
            rng.shuffle(inner)
            order.extend(band * 3 + i for i in inner)
        return order
    rr, cc = axis(), axis()
    digits = list(range(1, 10))
    rng.shuffle(digits)
    return [digits[(rr[r] * 3 + rr[r] // 3 + cc[c]) % 9]
            for r in range(9) for c in range(9)]


def global_index(grid: int, local: int) -> int:
    row, col = divmod(local, 9)
    top, left = POSITIONS[grid]
    return (top + row) * W + left + col


def overlap(a: int, b: int) -> list[tuple[int, int]]:
    """(local index in a, local index in b) for every shared cell."""
    right = {global_index(b, i): i for i in range(81)}
    return [(i, right[global_index(a, i)]) for i in range(81)
            if global_index(a, i) in right]


def generate_solutions(rng: random.Random) -> list[list[int]]:
    solutions = [make_solution(rng)]
    for g in range(1, 4):
        candidate = make_solution(rng)
        digit_map = {candidate[local]: solutions[g - 1][old]
                     for local, old in overlap(g, g - 1)}
        assert len(digit_map) == 9 and len(set(digit_map.values())) == 9
        solutions.append([digit_map[d] for d in candidate])
    return solutions


def dig(rng: random.Random, solution: list[int], banned: set[int],
        min_clues: int = 22) -> dict[int, int]:
    """Remove givens while maintaining a unique individual 9x9."""
    clues = {i: solution[i] for i in range(81) if i not in banned}
    indices = list(clues)
    rng.shuffle(indices)
    for i in indices:
        if len(clues) <= min_clues:
            break
        value = clues.pop(i)
        if count_solutions(clues) != 1:
            clues[i] = value
    return clues


def shared_solved_cells(solutions: list[list[int]], grid: int) -> dict[int, int]:
    """Reveal ALL overlap digits to rule out indirect Sudoku shortcuts."""
    return {local: solutions[grid][local]
            for other in range(4) if other != grid
            for local, _ in overlap(grid, other)}


def select_boss_cell(rng: random.Random, grid: int,
                     clues: dict[int, int],
                     solutions: list[list[int]]) -> tuple[dict[int, int], int]:
    """Remove a *critical* given from inside a Sudoku grid.

    Even if all other grids have been completed and every overlap value is
    known, this grid must still admit >=2 solutions with different digits
    at the boss cell. The boss answer restores uniqueness.
    """
    known = shared_solved_cells(solutions, grid)
    candidates = list(clues)
    rng.shuffle(candidates)
    for local in candidates:
        if local in known:
            continue
        without_boss = dict(clues)
        without_boss.pop(local)
        # Start from a unique Sudoku; removing one pivotal clue breaks
        # uniqueness. Supplying *all* shared digits must not fix it.
        if count_solutions(without_boss | known) != 2:
            continue
        if count_solutions(without_boss | {local: solutions[grid][local]}) != 1:
            continue
        return without_boss, local
    raise ValueError(f'Grid {grid+1}: no genuinely ambiguous boss cell')


def build(seed: int, attempts: int = 40) -> tuple[dict, list[dict], dict]:
    rng = random.Random(seed)
    for attempt in range(attempts):
        solutions = generate_solutions(rng)
        banned = [set() for _ in range(4)]
        for g in range(4):
            for other in range(4):
                if g != other:
                    banned[g].update(a for a, _ in overlap(g, other))
        clues = [dig(rng, solutions[g], banned[g]) for g in range(4)]
        boss_cells = []
        try:
            for g in range(4):
                clues[g], boss_cell = select_boss_cell(rng, g, clues[g], solutions)
                boss_cells.append(boss_cell)
        except ValueError:
            continue
        break
    else:
        raise RuntimeError(f'Could not build four ambiguous boss cells '
                           f'after {attempts} attempts')

    world_solution = ['.'] * (H * W)
    world_cells = [[{} for _ in range(W)] for _ in range(H)]
    regions = []
    grids = []
    names = ['The Gate', 'The Archives', 'The Observatory', 'The Citadel']
    for g, ((top, left), answer, local_clues) in enumerate(zip(POSITIONS, solutions, clues)):
        for i in range(81):
            global_i = global_index(g, i)
            r, c = divmod(global_i, W)
            digit = str(answer[i])
            assert world_solution[global_i] in ('.', digit), 'Inconsistent overlap'
            world_solution[global_i] = digit
            if i in local_clues:
                world_cells[r][c] = {'value': digit}
        for br in range(0, 9, 3):
            for bc in range(0, 9, 3):
                regions.append([[top + br + dr, left + bc + dc]
                                for dr in range(3) for dc in range(3)])
        grids.append({'top': top, 'left': left, 'width': 9, 'height': 9,
                      'title': f'Chapter {g+1}: {names[g]}',
                      'author': 'SudokuPadX Generator',
                      'rules': ('Normal Sudoku. Each row, column and outlined 3x3 box '
                                'contains 1-9. Neighboring grids share their overlapping '
                                'cells. Each chapter has a logically '
                                'indispensable embedded BOSS cell.\n'
                                f'Boss entrance: sudokupadx:puzzle/{WORLD_ID}-boss-{g+1}')})
    initial = [[r, c] for r in range(9) for c in range(9)]
    effects = []
    highlights = []
    world = {
        'id': WORLD_ID,
        'cells': world_cells,
        'regions': regions,
        'underlays': highlights,
        'foglight': initial,
        'triggereffect': effects,
        'metadata': {
            'title': 'The Four Gates — Generated Adventure',
            'author': 'SudokuPadX Procedural Generator',
            'rules': ('Four overlapping Sudoku grids form one adventure. '
                      'Every highlighted BOSS cell belongs to its 9x9 Sudoku '
                      'and remains logically ambiguous until its linked '
                      'boss provides the indispensable missing digit.'),
            'grids': grids,
            'solution': ''.join(world_solution),
            'msgcorrect': 'You solved every cell in the Four Gates!'
        }
    }
    from boss_dependencies import attach_boss_dependencies, completed_boss_reward
    from human_solver import solve as solve_human, has_aha_moment, SINGLES
    bosses = []
    boss_proofs = []
    for i in range(4):
        boss_id = f'{WORLD_ID}-boss-{i+1}'
        target = str(solutions[i][boss_cells[i]])
        # Find a boss whose ENTIRE solved grid yields exactly the missing
        # main Sudoku digit. No extra off-grid cell or arbitrary code.
        for solution_attempt in range(240):
            solved = make_solution(rng)
            if completed_boss_reward(''.join(map(str, solved)), boss_id, seed) != target:
                continue
            # A valid unique puzzle can still require speculative branching.
            # Re-dig a matching answer until a human solver can finish it
            # using only singles, locked candidates and small subsets.
            for puzzle_attempt in range(24):
                given = dig(rng, solved, set(), min_clues=24)
                if len(given) > 30:
                    continue
                proof = solve_human(given, solved)
                if has_aha_moment(proof):
                    break
            else:
                continue
            break
        else:
            raise RuntimeError(f'Could not create a no-guess boss {boss_id}')
        assert count_solutions(given) == 1
        boss_proofs.append(proof)
        bosses.append({
            'id': f'{WORLD_ID}-boss-{i+1}',
            'cells': [[{'value': str(given[r * 9 + c])} if r * 9 + c in given else {}
                       for c in range(9)] for r in range(9)],
            'regions': [[[br + dr, bc + dc] for dr in range(3) for dc in range(3)]
                        for br in range(0, 9, 3) for bc in range(0, 9, 3)],
            'metadata': {
                'title': f'Gatekeeper {i+1}: The {names[i]}',
                'author': 'SudokuPadX Procedural Generator',
                'rules': 'Classic 9x9 Sudoku. Return to the world map when finished.',
                'solution': ''.join(map(str, solved)),
                'msgcorrect': f'Gatekeeper {i+1} defeated. Return to the map.',
                'logicProfile': {
                    'techniques': proof['techniques'],
                    'nonSingleSteps': sum(step['method'] not in SINGLES
                                          for step in proof['trace']),
                    'logicalSteps': len(proof['trace']),
                    'requiresGuessing': False
                }
            }
        })
    boss_gates = attach_boss_dependencies(
        world, bosses, seed, POSITIONS, boss_cells)
    from fog_progression import add_progressive_fog
    fog_plans = add_progressive_fog(
        world, clues, solutions, boss_cells, POSITIONS, rng,
        shared_solved_cells, count_solutions, singles, PEERS, UNITS)
    report = {
        'seed': seed, 'attempt': attempt + 1, 'world': [H, W],
        'grid_positions': [list(position) for position in POSITIONS],
        'overlaps': [len(overlap(g, g+1)) for g in range(3)],
        'grid_givens': [len(c) for c in clues],
        'initial_fog_count': len(world['foglight']),
        'fog_seed_sizes': [len(plan['seed']) for plan in fog_plans],
        'fog_starter_counts': [len(plan['milestones']) for plan in fog_plans],
        'fog_rule_count': len(world['metadata']['generatedFogRules']),
        # Supply even the full shared region from every neighbor: the
        # embedded boss digit must remain indispensable.
        'grid_solutions_without_boss': [
            count_solutions(clues[g] | shared_solved_cells(solutions, g))
            for g in range(4)],
        'grid_solutions_with_boss': [
            count_solutions(clues[g] | shared_solved_cells(solutions, g)
                            | {boss_cells[g]: solutions[g][boss_cells[g]]})
            for g in range(4)],
        'boss_givens': [sum(bool(cell) for row in b['cells'] for cell in row)
                        for b in bosses],
        'boss_singles_resolved': [
            len(singles({r*9+c: int(cell['value'])
                         for r, row in enumerate(b['cells'])
                         for c, cell in enumerate(row) if cell}))
            for b in bosses],
        'boss_logic_solved': [proof['solved'] for proof in boss_proofs],
        'boss_logic_methods': [proof['techniques'] for proof in boss_proofs],
        'boss_logic_steps': [len(proof['trace']) for proof in boss_proofs],
        # Full replayable deduction traces are exported into validation.json.
        'boss_logic_trace': [proof['trace'] for proof in boss_proofs],
        'boss_gates': [
            {'bossId': gate['bossId'], 'cell': gate['cell'],
             'revealCount': len(gate['reveals'])}
            for gate in boss_gates
        ],
        'boss_solution_counts': [
            count_solutions({r*9+c: int(cell['value'])
                             for r, row in enumerate(b['cells'])
                             for c, cell in enumerate(row) if cell})
            for b in bosses],
        'label': 'Human-solvable bosses: no guessing, 1-5 meaningful '
                 'candidate eliminations, and a verified complete path; '
                 'not a calibrated player difficulty grade'
    }
    return world, bosses, report


def validate(world: dict, bosses: list[dict], report: dict) -> None:
    assert len(world['cells']) == H and all(len(row) == W for row in world['cells'])
    assert len(world['metadata']['solution']) == H * W
    assert report['overlaps'] == [9, 9, 9]
    assert report['grid_solutions_without_boss'] == [2] * 4
    assert report['grid_solutions_with_boss'] == [1] * 4
    assert report['boss_solution_counts'] == [1] * 4
    assert report['boss_logic_solved'] == [True] * 4
    from human_solver import solve as solve_human, has_aha_moment
    for i, boss in enumerate(bosses):
        clues = {r*9+c: int(cell['value'])
                 for r, row in enumerate(boss['cells'])
                 for c, cell in enumerate(row) if cell}
        proof = solve_human(clues, [int(d) for d in boss['metadata']['solution']])
        assert has_aha_moment(proof), f'Boss {i+1} requires guessing or lacks an aha step'
        assert proof['trace'] == report['boss_logic_trace'][i]
        assert proof['techniques'] == report['boss_logic_methods'][i]
        assert boss['metadata']['logicProfile']['requiresGuessing'] is False
    assert 2 <= len(world['foglight']) < 40
    assert len(world['triggereffect']) == 0
    assert len(world['metadata']['generatedFogRules']) >= 100
    assert all(2 <= size < 40 for size in report['fog_seed_sizes'])
    assert all(count == 3 for count in report['fog_starter_counts'])
    from fog_progression import validate_fog_walk
    assert validate_fog_walk(world, POSITIONS, [
        [int(world['metadata']['solution'][global_index(g,i)])
         for i in range(81)] for g in range(4)], [
        (gate['cell'][0] - POSITIONS[g][0])*9 +
        gate['cell'][1] - POSITIONS[g][1]
        for g, gate in enumerate(world['metadata']['bossGates'])
    ], PEERS, UNITS)
    gates = world['metadata']['bossGates']
    assert len(gates) == len(bosses) == 4
    for gate, boss in zip(gates, bosses):
        r, c = gate['cell']
        assert sum(top <= r < top+9 and left <= c < left+9
                   for top, left in POSITIONS) == 1
        assert world['metadata']['solution'][r*W+c] == gate['reward']
        assert world['cells'][r][c] == {}
        assert boss['metadata']['bossLink']['bossId'] == boss['id']
        assert gate['rewardVersion'] == boss['metadata']['bossLink']['rewardVersion'] == 3
        from boss_dependencies import completed_boss_reward
        assert gate['reward'] == completed_boss_reward(
            boss['metadata']['solution'], boss['id'], gate['seed'])
        assert gate['reward'] != boss['metadata']['solution'][40]
    assert [len(gate['reveals']) for gate in gates] == report['fog_seed_sizes'][1:] + [0]
    for i, boss in enumerate(bosses):
        assert boss['id'].endswith(f'-boss-{i+1}')
    for row in world['cells']:
        for cell in row:
            assert not cell or cell['value'] in '123456789'


def export(out: Path, world: dict, bosses: list[dict], report: dict) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for puzzle in [world, *bosses]:
        (out / f'{puzzle["id"]}.json').write_text(
            json.dumps(puzzle, ensure_ascii=False, separators=(',', ':')) + '\n',
            encoding='utf-8')
    entries = [{
        'id': WORLD_ID, 'title': world['metadata']['title'], 'kind': 'main',
        'group': WORLD_ID, 'file': f'puzzles/generated/{WORLD_ID}.json'
    }]
    for boss in bosses:
        entries.append({
            'id': boss['id'], 'title': boss['metadata']['title'], 'kind': 'boss',
            'group': WORLD_ID, 'parent': WORLD_ID,
            'file': f'puzzles/generated/{boss["id"]}.json'
        })
    (out / 'catalog-entries.json').write_text(
        json.dumps({'items': entries}, indent=2) + '\n', encoding='utf-8')
    (out / 'validation.json').write_text(
        json.dumps(report, indent=2) + '\n', encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=int, default=20261102)
    parser.add_argument('--attempts', type=int, default=40)
    parser.add_argument('--output', type=Path, default=Path('public/puzzles/generated'))
    args = parser.parse_args()
    world, bosses, report = build(args.seed, args.attempts)
    validate(world, bosses, report)
    export(args.output, world, bosses, report)
    # The verbose proof remains in validation.json, not terminal build logs.
    print(json.dumps({k:v for k,v in report.items()
                      if k != 'boss_logic_trace'}, indent=2))


if __name__ == '__main__':
    main()
