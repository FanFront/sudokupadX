#!/usr/bin/env python3
"""Generate a seeded 4-grid, 4-boss SudokuPadX adventure using Python's stdlib.

The first three grids are intentionally ambiguous until the overlapping
values from the following grid are available. Output is SudokuPad JSON and a
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


def select_gate(rng: random.Random, grid: int, clues: dict[int, int],
                solutions: list[list[int]]) -> tuple[dict[int, int], int]:
    """Make the grid ambiguous until its downstream overlap is known.

    Requiring the downstream block *alone* to restore uniqueness proves that
    the entire chain has one solution, starting from grid 4.
    """
    next_shared = {a: solutions[grid][a] for a, _ in overlap(grid, grid + 1)}
    prev_shared = ({a: solutions[grid][a] for a, _ in overlap(grid, grid - 1)}
                   if grid else {})
    indices = list(clues)
    rng.shuffle(indices)
    for i in indices:
        candidate = dict(clues)
        candidate.pop(i)
        if count_solutions(candidate | prev_shared) <= 1:
            continue
        if count_solutions(candidate | next_shared) != 1:
            continue
        # A beacon must be playable as a singles deduction *before* revealing
        # the next chapter (no guessing or unavailable upstream clues).
        forced = singles(candidate)
        trigger_cells = [j for j in range(81) if j not in candidate
                         and j in forced and j not in next_shared]
        if trigger_cells:
            rng.shuffle(trigger_cells)
            return candidate, trigger_cells[0]
    raise ValueError('No enterable cross-grid gate found')


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
        gates = []
        try:
            for g in range(3):
                clues[g], gate = select_gate(rng, g, clues[g], solutions)
                gates.append(gate)
        except ValueError:
            continue
        break
    else:
        raise RuntimeError(f'Could not build gates after {attempts} attempts')

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
        beacon = (f'The highlighted beacon is global R{global_index(g, gates[g])//W+1}'
                  f'C{global_index(g, gates[g])%W+1}; enter its correct digit to reveal '
                  'the next chapter.' if g < 3 else 'Final chapter. Complete the map.')
        grids.append({'top': top, 'left': left, 'width': 9, 'height': 9,
                      'title': f'Chapter {g+1}: {names[g]}',
                      'author': 'SudokuPadX Generator',
                      'rules': ('Normal Sudoku. Each row, column and outlined 3x3 box '
                                'contains 1-9. Neighboring grids share their overlapping '
                                'cells. Some chapters require deductions from the next.\n'
                                + beacon + '\n'
                                + f'Boss entrance: sudokupadx:puzzle/{WORLD_ID}-boss-{g+1}')})
    initial = [[r, c] for r in range(9) for c in range(9)]
    effects = []
    for g, local in enumerate(gates):
        trigger_global = global_index(g, local)
        tr, tc = divmod(trigger_global, W)
        target = sorted(global_index(g + 1, i) for i in range(81))
        effects.append({
            'trigger': {'type': 'cellvalue', 'cell': f'r{tr+1}c{tc+1}'},
            'effect': {'type': 'foglight', 'cells': ''.join(
                f'r{p//W+1}c{p%W+1}' for p in target)}
        })
    beacons = [divmod(global_index(g, loc), W) for g, loc in enumerate(gates)]
    # Draw behind the user's digit; the fog hides later chapter beacons.
    highlights = [{'center': [r + .5, c + .5], 'width': .92, 'height': .92,
                   'rounded': True, 'backgroundColor': '#f8e2a0'}
                  for r, c in beacons]
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
            'rules': ('Four overlapping Sudokus form one world. Enter each chapter '
                      'beacon correctly to reveal the next region. Select a visible '
                      'grid to open its boss. Earlier grids can require later clues.'),
            'grids': grids,
            'solution': ''.join(world_solution),
            'msgcorrect': 'You solved every cell in the Four Gates!'
        }
    }
    bosses = []
    for i in range(4):
        for boss_attempt in range(100):
            solved = make_solution(rng)
            given = dig(rng, solved, set(), min_clues=22)
            if len(singles(given)) <= 55:
                break
        else:
            raise RuntimeError('Could not generate a boss that resists singles')
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
                'msgcorrect': f'Gatekeeper {i+1} defeated. Return to the map.'
            }
        })
    report = {
        'seed': seed, 'attempt': attempt + 1, 'world': [H, W],
        'grid_positions': [list(position) for position in POSITIONS],
        'overlaps': [len(overlap(g, g+1)) for g in range(3)],
        'grid_givens': [len(c) for c in clues],
        'grid_solutions_before_next': [
            count_solutions(clues[g] | ({a: solutions[g][a] for a, _ in overlap(g, g-1)}
                                         if g else {}))
            for g in range(4)],
        'grid_solutions_with_next': [
            count_solutions(clues[g] | {a: solutions[g][a] for a, _ in overlap(g, g+1)})
            for g in range(3)],
        'boss_givens': [sum(bool(cell) for row in b['cells'] for cell in row)
                        for b in bosses],
        'boss_singles_resolved': [
            len(singles({r*9+c: int(cell['value'])
                         for r, row in enumerate(b['cells'])
                         for c, cell in enumerate(row) if cell}))
            for b in bosses],
        'boss_solution_counts': [
            count_solutions({r*9+c: int(cell['value'])
                             for r, row in enumerate(b['cells'])
                             for c, cell in enumerate(row) if cell})
            for b in bosses],
        'beacons': [f'r{global_index(g, loc)//W+1}c{global_index(g, loc)%W+1}'
                    for g, loc in enumerate(gates)],
        'label': 'Hard target: low givens, singles-resistant bosses, and '
                 'cross-grid gates; not a calibrated human difficulty grade'
    }
    return world, bosses, report


def validate(world: dict, bosses: list[dict], report: dict) -> None:
    assert len(world['cells']) == H and all(len(row) == W for row in world['cells'])
    assert len(world['metadata']['solution']) == H * W
    assert report['overlaps'] == [9, 9, 9]
    assert report['grid_solutions_before_next'] == [2, 2, 2, 1]
    assert report['grid_solutions_with_next'] == [1, 1, 1]
    assert report['boss_solution_counts'] == [1] * 4
    assert max(report['boss_singles_resolved']) <= 55
    assert len(world['foglight']) == 81
    assert len(world['triggereffect']) == 3
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
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
