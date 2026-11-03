"""Human-readable deduction motifs for mixed variant Sudoku.

Every operation computes supports from visible clues and candidate domains.
No hidden solution or speculative assumption is used by these techniques.
"""
from itertools import permutations, product

EXTRA_VARIANTS = ("renban", "whisper", "arrow", "xv")


def propagate_extra(n, masks, clue, index, reduce):
    """Arc-consistent supports for each extra variant rule."""
    kind, cells = clue["type"], clue["cells"]
    supports = [set() for _ in cells]
    if kind == "renban":
        # An L-cell renban is exactly one of the consecutive L-digit sets,
        # and any order compatible with current candidates is allowed.
        length = len(cells)
        for start in range(1, n-length+2):
            for digits in permutations(range(start, start+length)):
                if all(d in masks[i] for i, d in zip(cells, digits)):
                    for support, d in zip(supports, digits):
                        support.add(d)
    elif kind == "arrow":
        # The first cell is the circle; remaining cells form its shaft.
        for digits in product(*(sorted(masks[i]) for i in cells[1:])):
            circle = sum(digits)
            if circle in masks[cells[0]]:
                supports[0].add(circle)
                for support, d in zip(supports[1:], digits):
                    support.add(d)
    else:
        a, b = cells
        for x in masks[a]:
            for y in masks[b]:
                valid = (abs(x-y) >= 5 if kind == "whisper"
                         else x+y == clue["sum"])
                if valid:
                    supports[0].add(x)
                    supports[1].add(y)
    changed = False
    for i, allowed in zip(cells, supports):
        changed |= reduce(i, allowed, kind, index)
    return changed


def kropki_triple_partitions(n, units, masks, constraints, reduce):
    """Three independent white-dot chains partition a nine-cell house.

    Each 3-cell chain is consecutive, with all digits distinct because it
    resides in a house. Three such chains covering a house must use the
    sets {1,2,3}, {4,5,6}, {7,8,9}, in some order. We check the six
    possible band assignments without making any assumption about the
    solution. An assignment contributes candidates only if every group
    has a feasible ascending or descending orientation.
    """
    if n != 9:
        return False
    edges = [tuple(c["cells"]) for c in constraints
             if c["type"] == "kropki" and c["kind"] == "white"]
    changed = False
    for house_id, unit in enumerate(units):
        house = set(unit)
        graph = {i: set() for i in unit}
        for a, b in edges:
            if a in house and b in house:
                graph[a].add(b)
                graph[b].add(a)
        if sum(map(len, graph.values())) != 12:
            continue  # Exactly six white dots across three chains.
        groups, seen = [], set()
        for start in unit:
            if start in seen:
                continue
            stack, component = [start], set()
            while stack:
                i = stack.pop()
                if i in component:
                    continue
                component.add(i)
                stack.extend(graph[i] - component)
            seen |= component
            if len(component) != 3:
                groups = []
                break
            centers = [i for i in component if len(graph[i]) == 2]
            if len(centers) != 1:
                groups = []
                break
            middle = centers[0]
            ends = sorted(component - {middle})
            groups.append((ends[0], middle, ends[1]))
        if len(groups) != 3 or len(seen) != 9:
            continue
        supports = {i: set() for i in unit}
        for bands in permutations((1, 4, 7)):
            choices = []
            for group, low in zip(groups, bands):
                options = [(low, low+1, low+2), (low+2, low+1, low)]
                feasible = [digits for digits in options
                            if all(d in masks[i] for i, d in zip(group, digits))]
                if not feasible:
                    break
                choices.append(feasible)
            if len(choices) != 3:
                continue
            for group, options in zip(groups, choices):
                for digits in options:
                    for i, digit in zip(group, digits):
                        supports[i].add(digit)
        source = {"house": house_id, "groups": [list(g) for g in groups]}
        for i in unit:
            changed |= reduce(i, supports[i], "kropki_partition", source)
    return changed
