"""Additional Sudopedia patterns, with direct counting proofs and bounded search.

No completed grid is read. A deduction is emitted only when the source
contains all houses/candidates needed to independently check its inference.
"""
from itertools import combinations, product
from classic_techniques import BOXES, peer_sets


def _box(n, cell):
    height, width = BOXES[n]
    r, c = divmod(cell, n)
    return r // height * (n // width) + c // width


def generalized_fish(n, masks, units, reduce, maximum=3, budget=3600):
    """Franken/Mutant fish from disjoint *arbitrary* Sudoku houses.

    k pairwise-disjoint base houses each require one occurrence of d.
    Every candidate within the bases is covered by k pairwise-disjoint
    cover houses. Consequently each cover has exactly one occurrence of
    d in the bases; candidates outside the bases can be removed.
    Disjointness on BOTH sides is essential for the counting argument.
    """
    if n != 9:
        return False
    changed = False
    house_sets = [set(unit) for unit in units]
    kinds = ['row'] * n + ['column'] * n + ['box'] * n
    for digit in range(1, n + 1):
        positions = [set(unit) & {i for i, mask in enumerate(masks)
                                  if digit in mask} for unit in units]
        eligible = [i for i, cells in enumerate(positions)
                    if 2 <= len(cells) <= 4]
        explored = 0
        visited = set()
        for size in range(2, maximum + 1):
            for bases in combinations(eligible, size):
                if explored > budget:
                    break
                if any(house_sets[a] & house_sets[b]
                       for a, b in combinations(bases, 2)):
                    continue
                base_cells = set().union(*(positions[i] for i in bases))
                if len(base_cells) > size * 4:
                    continue
                # Exact set cover with <= k houses, not an exhaustive scan
                # over every possible grid completion.
                cover_options = [i for i in range(3 * n)
                                 if i not in bases and
                                 (house_sets[i] & base_cells)]
                def visit(chosen, covered):
                    nonlocal changed, explored
                    if explored > budget:
                        return
                    explored += 1
                    if covered == base_cells:
                        if len(chosen) != size:
                            return
                        covers = tuple(sorted(chosen))
                        key = (bases, covers)
                        if key in visited:
                            return
                        visited.add(key)
                        base_kinds = {kinds[i] for i in bases}
                        cover_kinds = {kinds[i] for i in covers}
                        if 'box' not in base_kinds | cover_kinds:
                            return  # ordinary basic fish
                        mutant = ('box' in base_kinds and 'box' in cover_kinds)
                        name = 'mutant_fish' if mutant else 'franken_fish'
                        source = {'digit': digit, 'baseHouses': list(bases),
                                  'coverHouses': list(covers), 'size': size,
                                  'bases': sorted(base_cells)}
                        for target in sorted(set().union(
                                *(house_sets[i] for i in covers)) - base_cells):
                            if digit in masks[target]:
                                changed |= reduce(target, masks[target] - {digit},
                                                  name, source)
                        return
                    if len(chosen) >= size:
                        return
                    uncovered = base_cells - covered
                    # Pick the least-constrained uncovered candidate.
                    target = min(uncovered,
                                 key=lambda c: sum(c in house_sets[j] for j in cover_options))
                    for next_house in cover_options:
                        if target not in house_sets[next_house] or next_house in chosen:
                            continue
                        if any(house_sets[next_house] & house_sets[j]
                               for j in chosen):
                            continue
                        visit(chosen + (next_house,),
                              covered | house_sets[next_house] & base_cells)
                        if explored > budget:
                            return
                visit(tuple(), set())
            if explored > budget:
                break
    return changed


def extended_finned_fish(n, masks, reduce, maximum=4):
    """Sashimi X-Wing and finned Swordfish/Jellyfish.

    If the fins are false, the remaining k base lines form an ordinary
    k-by-k fish (possibly with one missing corner). If any fin is true,
    a target seeing every fin cannot hold the digit either.
    """
    if n != 9:
        return False
    changed = False
    peers = peer_sets(n)
    for digit in range(1, n + 1):
        for vertical in (False, True):
            def at(base, cover):
                return cover * n + base if vertical else base * n + cover
            positions = [{axis for axis in range(n)
                          if digit in masks[at(base, axis)]}
                         for base in range(n)]
            for size in range(2, maximum + 1):
                for base_set in combinations(range(n), size):
                    if any(not positions[b] or len(positions[b]) > size + 3
                           for b in base_set):
                        continue
                    for covers in combinations(range(n), size):
                        core = [positions[b] & set(covers) for b in base_set]
                        if any(not part for part in core):
                            continue
                        fins = [at(b, axis) for b in base_set
                                for axis in positions[b] - set(covers)]
                        if not 1 <= len(fins) <= 3:
                            continue
                        if len({_box(n, cell) for cell in fins}) != 1:
                            continue
                        # Each cover must be used by at least one base.
                        if any(not any(axis in part for part in core)
                               for axis in covers):
                            continue
                        sashimi = any(len(part) == 1 for part in core)
                        name = ('sashimi_fish' if sashimi else
                                {2: 'finned_x_wing', 3: 'finned_swordfish',
                                 4: 'finned_jellyfish'}[size])
                        if name == 'finned_x_wing':
                            continue  # handled by the existing local rule
                        source = {'digit': digit, 'base': list(base_set),
                                  'cover': list(covers), 'vertical': vertical,
                                  'fins': fins, 'size': size, 'sashimi': sashimi}
                        for axis in covers:
                            for base in range(n):
                                if base in base_set:
                                    continue
                                target = at(base, axis)
                                if (digit in masks[target] and
                                        all(target in peers[fin] for fin in fins)):
                                    changed |= reduce(target, masks[target] - {digit},
                                                      name, source)
    return changed


def wxyz_wings(n, masks, reduce):
    """Four-candidate pivot and three distinct two-candidate pincers.

    Pivot is WXYZ. Three pincers are WZ, XZ, YZ and see the pivot.
    Whatever the pivot is, at least one of these four cells must be Z.
    """
    changed = False
    peers = peer_sets(n)
    pivots = [i for i, domain in enumerate(masks) if len(domain) == 4]
    for pivot in pivots:
        digits = masks[pivot]
        arms = [i for i in sorted(peers[pivot]) if len(masks[i]) == 2
                and masks[i] <= digits]
        for z in sorted(digits):
            alternatives = sorted(digits - {z})
            groups = [[cell for cell in arms
                       if masks[cell] == {z, other}] for other in alternatives]
            if any(not group for group in groups):
                continue
            for wings in product(*groups):
                if len(set(wings)) != 3:
                    continue
                common = peers[pivot].intersection(*(peers[w] for w in wings))
                source = {'pivot': pivot, 'pincers': list(wings),
                          'digit': z, 'otherDigits': alternatives}
                for target in sorted(common - {pivot, *wings}):
                    changed |= reduce(target, masks[target] - {z},
                                      'wxyz_wing', source)
    return changed


def sue_de_coq(n, masks, units, reduce):
    """Canonical two-sector disjoint subsets (Sudopedia Sue de Coq).

    Two intersection cells contain exactly four digits. A bivalue wing in
    the line and another in the box have disjoint digit pairs partitioning
    those four digits. The intersection then has to use the *other* member
    of each pair, so both digits of the line wing are locked in the line,
    and both digits of the box wing are locked in the box.
    """
    if n != 9:
        return False
    changed = False
    rows = [set(unit) for unit in units[:n]]
    columns = [set(unit) for unit in units[n:2*n]]
    boxes = [set(unit) for unit in units[2*n:]]
    for line_type, lines in (('row', rows), ('column', columns)):
        for line_id, line in enumerate(lines):
            for box_id, box in enumerate(boxes):
                overlap = sorted(line & box)
                if len(overlap) < 2:
                    continue
                row_wings = [cell for cell in sorted(line - box)
                             if len(masks[cell]) == 2]
                box_wings = [cell for cell in sorted(box - line)
                             if len(masks[cell]) == 2]
                for pair in combinations(overlap, 2):
                    if any(len(masks[i]) < 2 for i in pair):
                        continue
                    digits = masks[pair[0]] | masks[pair[1]]
                    if len(digits) != 4:
                        continue
                    for a in row_wings:
                        da = masks[a]
                        if not da < digits:
                            continue
                        for b in box_wings:
                            db = masks[b]
                            if da.isdisjoint(db) and da | db == digits:
                                source = {'lineType': line_type,
                                          'line': line_id, 'box': box_id,
                                          'intersection': list(pair),
                                          'lineWing': a, 'boxWing': b,
                                          'lineDigits': sorted(da),
                                          'boxDigits': sorted(db)}
                                for target in sorted(line - set(pair) - {a}):
                                    changed |= reduce(target, masks[target] - da,
                                                      'sue_de_coq', source)
                                for target in sorted(box - set(pair) - {b}):
                                    changed |= reduce(target, masks[target] - db,
                                                      'sue_de_coq', source)
    return changed
