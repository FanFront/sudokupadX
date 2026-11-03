"""Human-style 9x9 Sudoku logic. No guessing, recursion, or solution peeking.

The generator separately proves uniqueness by backtracking. This solver only
accepts puzzles with a complete deduction trail using the listed techniques.
"""
from __future__ import annotations

from collections import Counter
from itertools import combinations

FULL = 511
ROWS = tuple(tuple(9*r+c for c in range(9)) for r in range(9))
COLS = tuple(tuple(9*r+c for r in range(9)) for c in range(9))
BOXES = tuple(tuple((3*br+dr)*9+3*bc+dc for dr in range(3) for dc in range(3))
              for br in range(3) for bc in range(3))
UNITS = ROWS + COLS + BOXES
PEERS = tuple(tuple(sorted(set().union(*(u for u in UNITS if i in u)) - {i}))
              for i in range(81))
METHODS = ('naked_single', 'hidden_single', 'locked_candidate',
           'naked_pair', 'hidden_pair', 'naked_triple')
SINGLES = {'naked_single', 'hidden_single'}


def digits(mask):
    while mask:
        bit = mask & -mask
        yield bit.bit_length()
        mask ^= bit


def solve(givens: dict[int, int], expected: list[int] | None = None) -> dict:
    """A complete human-style proof, or an explicit stall; never search.

    A stalled puzzle might still be unique; only the independently checked
    logic path determines whether it is suitable for a generated boss.
    """
    if any(i not in range(81) or d not in range(1, 10)
           for i, d in givens.items()):
        raise ValueError('Invalid Sudoku given')
    for unit in UNITS:
        values = [givens[i] for i in unit if i in givens]
        if len(values) != len(set(values)):
            raise ValueError('Contradictory givens')

    placed = dict(givens)
    masks = {
        i: FULL & ~sum(1 << (d-1) for d in {
            placed[j] for j in PEERS[i] if j in placed
        }) for i in range(81) if i not in placed
    }
    if any(mask == 0 for mask in masks.values()):
        raise ValueError('An unsolved cell has no candidates')
    trace, counts = [], Counter()

    def eliminate(method, removals, sources=(), digit=None, house=None):
        changes = []
        for i, mask in sorted(removals.items()):
            if i not in masks:
                continue
            bits = masks[i] & mask
            if bits:
                masks[i] &= ~bits
                if not masks[i]:
                    raise ValueError('Logical contradiction')
                changes.append((i, tuple(digits(bits))))
        if not changes:
            return False
        counts[method] += 1
        trace.append({'method': method, 'eliminated': changes,
                      'reason_cells': list(sources),
                      'digit': digit, 'house': house})
        return True

    def put(i, digit, method, house=None):
        if expected is not None and expected[i] != digit:
            raise ValueError('Deduction disagrees with expected solution')
        placed[i] = digit
        del masks[i]
        bit = 1 << (digit-1)
        for j in PEERS[i]:
            if j in masks:
                masks[j] &= ~bit
                if not masks[j]:
                    raise ValueError('Logical contradiction')
        counts[method] += 1
        trace.append({'method': method, 'cell': i, 'digit': digit, 'house': house})

    while masks:
        naked = next(((i, mask.bit_length()) for i, mask in sorted(masks.items())
                      if mask.bit_count() == 1), None)
        if naked:
            put(*naked, 'naked_single')
            continue

        hidden = None
        for house, unit in enumerate(UNITS):
            used = {placed[i] for i in unit if i in placed}
            for digit in range(1, 10):
                if digit in used:
                    continue
                places = [i for i in unit if i in masks and masks[i] & (1 << (digit-1))]
                if not places:
                    raise ValueError('A house has no location for a digit')
                if len(places) == 1:
                    hidden = (places[0], digit, house)
                    break
            if hidden:
                break
        if hidden:
            put(hidden[0], hidden[1], 'hidden_single', hidden[2])
            continue

        progress = False
        # Locked candidates: box -> row/column (pointing) or the converse
        # (claiming). All eliminations are constrained to affected houses.
        for house, unit in enumerate(UNITS):
            if progress:
                break
            used = {placed[i] for i in unit if i in placed}
            for digit in range(1, 10):
                if digit in used:
                    continue
                bit = 1 << (digit-1)
                source = [i for i in unit if i in masks and masks[i] & bit]
                if len(source) < 2:
                    continue
                if house >= 18:
                    targets = []
                    if len({i//9 for i in source}) == 1:
                        targets += [i for i in ROWS[source[0]//9] if i not in unit]
                    if len({i%9 for i in source}) == 1:
                        targets += [i for i in COLS[source[0]%9] if i not in unit]
                else:
                    boxes = {i//27*3+(i%9)//3 for i in source}
                    targets = ([i for i in BOXES[next(iter(boxes))] if i not in unit]
                               if len(boxes) == 1 else [])
                if eliminate('locked_candidate', {i: bit for i in targets},
                             source, digit, house):
                    progress = True
                    break
        if progress:
            continue

        for house, unit in enumerate(UNITS):
            if progress:
                break
            pairs = {}
            for i in unit:
                if i in masks and masks[i].bit_count() == 2:
                    pairs.setdefault(masks[i], []).append(i)
            for mask, cells in sorted(pairs.items()):
                if len(cells) == 2 and eliminate(
                        'naked_pair', {i: mask for i in unit if i not in cells},
                        cells, house=house):
                    progress = True
                    break
        if progress:
            continue

        for house, unit in enumerate(UNITS):
            if progress:
                break
            positions = {d: tuple(i for i in unit if i in masks and
                                  masks[i] & (1 << (d-1))) for d in range(1, 10)}
            for a, b in combinations(range(1, 10), 2):
                if len(positions[a]) != 2 or positions[a] != positions[b]:
                    continue
                without_pair = FULL & ~((1 << (a-1)) | (1 << (b-1)))
                if eliminate('hidden_pair',
                             {i: without_pair for i in positions[a]},
                             positions[a], house=house):
                    progress = True
                    break
        if progress:
            continue

        for house, unit in enumerate(UNITS):
            candidates = [i for i in unit if i in masks and
                          2 <= masks[i].bit_count() <= 3]
            for cells in combinations(candidates, 3):
                combined = masks[cells[0]] | masks[cells[1]] | masks[cells[2]]
                if combined.bit_count() != 3:
                    continue
                if eliminate('naked_triple',
                             {i: combined for i in unit if i not in cells},
                             cells, house=house):
                    progress = True
                    break
            if progress:
                break
        if not progress:
            break

    return {
        'solved': len(placed) == 81, 'remaining': len(masks),
        'techniques': {name: counts[name] for name in METHODS},
        'trace': trace, 'values': placed
    }


def has_aha_moment(result: dict) -> bool:
    """Prefer a focused, discoverable deduction rather than long chains.

    One to five non-single eliminations, beginning within the first 25
    logical steps, give bosses a recognizable moment of insight while
    bounding the most advanced required technique at naked triples.
    """
    if not result['solved']:
        return False
    advanced = [i for i, step in enumerate(result['trace'])
                if step['method'] not in SINGLES]
    return 1 <= len(advanced) <= 5 and advanced[0] <= 25
