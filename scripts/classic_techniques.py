"""Sudopedia-style classic deductions used after variant eliminations.

Hidden pairs/triples and basic X-Wings are direct all-different arguments,
not speculative assumption chains.
"""
from itertools import combinations


def hidden_subsets(n, units, masks, reduce):
    changed = False
    for house_id, unit in enumerate(units):
        digits = [digit for digit in range(1, n+1)
                  if not any(masks[cell] == {digit} for cell in unit)]
        positions = {digit: {cell for cell in unit if digit in masks[cell]}
                     for digit in digits}
        for size in (2, 3):
            for selected in combinations(digits, size):
                cells = set.union(*(positions[digit] for digit in selected))
                if len(cells) != size:
                    continue
                allowed = set(selected)
                for cell in cells:
                    changed |= reduce(cell, allowed, "hidden_subset",
                                      {"house": house_id,
                                       "digits": list(selected)})
    return changed


def x_wings(n, masks, reduce):
    """Two rows with candidates in the same two columns, or vice versa."""
    changed = False
    for digit in range(1, n+1):
        for vertical in (False, True):
            groups = {}
            for house in range(n):
                candidates = tuple(position for position in range(n)
                                   if digit in masks[
                                       position*n+house if vertical
                                       else house*n+position])
                if len(candidates) == 2:
                    groups.setdefault(candidates, []).append(house)
            for locations, defining_houses in groups.items():
                for first, second in combinations(defining_houses, 2):
                    for other in range(n):
                        if other in (first, second):
                            continue
                        for position in locations:
                            cell = (position*n+other if vertical
                                    else other*n+position)
                            changed |= reduce(
                                cell, masks[cell] - {digit}, "x_wing",
                                {"digit": digit, "base": [first, second],
                                 "cover": list(locations),
                                 "vertical": vertical})
    return changed
