"""Composable, human-readable structural Sudoku deductions.

Unlike single-line arc consistency, these routines inspect several authored
constraints against a complete Sudoku house. Geometry is reconstructed from
public clues; no generator metadata or completed solution is consulted.
"""
from itertools import combinations, permutations, product


def sum_structures(n, units, constraints):
    """Discover implicit Killer innie/outie sums and Renban-cage intervals."""
    cages = [(index, frozenset(c["cells"]), c["sum"])
             for index, c in enumerate(constraints) if c["type"] == "killer"]
    rules = []
    total = n * (n + 1) // 2
    for house_id, unit in enumerate(units):
        house = frozenset(unit)
        inside = [(i, cells, amount) for i, cells, amount in cages
                  if cells <= house]
        # Innie: disjoint cages cover all but one, two or three cells of
        # the house. The rest must sum to the house total less cage sums.
        covered = set()
        selected = []
        for index, cells, amount in inside:
            if not covered.intersection(cells):
                selected.append((index, amount))
                covered.update(cells)
        remainder = sorted(house - covered)
        if selected and 1 <= len(remainder) <= 3:
            rules.append(("killer_innie", tuple(remainder),
                          total - sum(amount for _, amount in selected),
                          {"house": house_id,
                           "cages": [index for index, _ in selected]}))

        # Outie: select disjoint cages whose intersections *exactly* tile
        # the house and whose union protrudes by exactly one cell. The
        # sum of all selected cages is house total + the extra digit.
        touching = [(i, cells, amount) for i, cells, amount in cages
                    if cells & house and len(cells - house) <= 1]
        choices = {cell: [c for c in touching if cell in c[1]]
                   for cell in house}
        if any(not options for options in choices.values()):
            continue

        def search(remaining, occupied, chosen, sum_value):
            if not remaining:
                out = occupied - house
                if len(out) == 1:
                    outie = next(iter(out))
                    yield ("killer_outie", (outie,), sum_value - total,
                           {"house": house_id,
                            "cages": [i for i, _, _ in chosen]})
                return
            # Most constrained uncovered house cell reduces branching.
            candidate = min(remaining, key=lambda c: len([
                item for item in choices[c] if not (item[1] & occupied)]))
            for item in choices[candidate]:
                index, cells, amount = item
                if cells & occupied:
                    continue
                if len((occupied | cells) - house) > 1:
                    continue
                yield from search(remaining - cells, occupied | cells,
                                  chosen + [item], sum_value + amount)

        # A single outie has an exact digit; no arbitrary subset search
        # through Sudoku candidates is involved.
        seen = set()
        for rule in search(house, frozenset(), [], 0):
            key = (rule[1], rule[2])
            if key not in seen:
                rules.append(rule)
                seen.add(key)

    for rindex, line in enumerate(constraints):
        if line["type"] != "renban":
            continue
        cells = frozenset(line["cells"])
        count = len(cells)
        for cindex, cage_cells, amount in cages:
            if cells != cage_cells:
                continue
            # k consecutive digits starting at a sum to
            # k*a + k*(k-1)/2.
            delta = amount - count * (count-1)//2
            if delta % count:
                raise ValueError("Renban-cage sum cannot be consecutive")
            low = delta // count
            if low < 1 or low + count - 1 > n:
                raise ValueError("Renban-cage interval out of bounds")
            rules.append(("renban_sum_lock", tuple(line["cells"]), None,
                          {"renban": rindex, "cage": cindex,
                           "digits": list(range(low, low+count))}))
    return rules


def propagate_sum_structures(n, masks, rules, reduce):
    changed = False
    for method, cells, total, source in rules:
        if method == "renban_sum_lock":
            allowed = set(source["digits"])
            for cell in cells:
                changed |= reduce(cell, allowed, method, source)
            continue
        supports = [set() for _ in cells]
        # One or more inside-house remainder cells are all-different.
        # An outie is always exactly one cell, so this is equally valid.
        for digits in product(*(sorted(masks[cell]) for cell in cells)):
            if sum(digits) != total or len(set(digits)) != len(digits):
                continue
            for support, digit in zip(supports, digits):
                support.add(digit)
        for cell, support in zip(cells, supports):
            changed |= reduce(cell, support, method,
                              {**source, "sum": total, "cells": list(cells)})
    return changed


def mixed_consecutive_partitions(n, units, masks, constraints, reduce):
    """Partition a house with BOTH Renban sets and white Kropki chains.

    n=6: one white-dot 3-chain and a three-cell Renban partition a row
    into the 123 and 456 sets, in either order. In n=9 any mixture of
    three consecutive triples yields 123/456/789. This uses the complete
    house and cannot be deduced by treating the marks as unrelated checks.
    """
    if n not in (6, 9):
        return False
    group_size = 3
    white = [tuple(c["cells"]) for c in constraints
             if c["type"] == "kropki" and c["kind"] == "white"]
    renbans = [tuple(c["cells"]) for c in constraints
               if c["type"] == "renban" and len(c["cells"]) == group_size]
    changed = False
    bands = tuple(range(1, n+1, group_size))
    for house_id, unit in enumerate(units):
        house = set(unit)
        groups = {}
        for chain in renbans:
            if set(chain) <= house:
                groups[(frozenset(chain), "renban")] = chain
        # White-dot chains imply three consecutive numbers only if all
        # three cells see one another in the *same house*.
        for first, second in combinations(white, 2):
            common = set(first) & set(second)
            if len(common) != 1:
                continue
            middle = next(iter(common))
            ends = (next(x for x in first if x != middle),
                    next(x for x in second if x != middle))
            chain = (min(ends), middle, max(ends))
            if len(set(chain)) == group_size and set(chain) <= house:
                groups[(frozenset(chain), "white")] = chain

        candidates = [(set(key[0]), key[1], value)
                      for key, value in groups.items()]
        for cover in combinations(candidates, n//group_size):
            kinds = {kind for _, kind, _ in cover}
            if kinds != {"white", "renban"}:
                continue
            members = [cells for cells, _, _ in cover]
            if len(set.union(*members)) != n or sum(map(len, members)) != n:
                continue
            supports = {cell: set() for cell in unit}
            for order in permutations(bands):
                choices = []
                for (_, kind, chain), low in zip(cover, order):
                    options = ((low, low+1, low+2),
                               (low+2, low+1, low)) if kind == "white" else tuple(
                                   permutations(range(low, low+group_size)))
                    valid = [digits for digits in options
                             if all(d in masks[cell]
                                    for cell, d in zip(chain, digits))]
                    if not valid:
                        break
                    choices.append(valid)
                if len(choices) != len(cover):
                    continue
                for (_, _, chain), valid in zip(cover, choices):
                    for digits in valid:
                        for cell, digit in zip(chain, digits):
                            supports[cell].add(digit)
            source = {"house": house_id,
                      "groups": [{"kind": kind, "cells": list(chain)}
                                 for _, kind, chain in cover]}
            for cell in unit:
                changed |= reduce(cell, supports[cell],
                                  "mixed_consecutive_partition", source)
            # One valid cover is sufficient; additional covers, if any,
            # impose valid further restrictions on the same house.
    return changed
